// A REPEATED REFERENCE IS NOT A CYCLE.
//
//     node tools/test/workbook-json.js
//
// The workbook was serialized with a WeakSet of every object already visited, and anything
// seen twice became '[a_c]'. That catches real loops and it also catches one object reachable
// by two paths: a graph holding the plate list at the top AND under plateTrack wrote the
// second one as a string, so plateTrack.root stopped being an array. A workbook whose root,
// m_plots and glyphs are all strings counts as EMPTY, and the server's save guard refused it
// every twenty seconds -- "this would replace test.bjb (2 tables, charts and notes) with an
// empty workbook" -- for a canvas with two tables on it. Only that guard kept the file.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The server's own arithmetic, copied from refuseEmptyOverwrite in baja-server, so this test
// judges a payload exactly as the thing that refused it does.
const serverCount = (text) => {
    try {
        const d = JSON.parse(text);
        if (!d || typeof d !== 'object') return null;
        const pt = d.plateTrack;
        if (!pt || typeof pt !== 'object') return null;
        const n = (a) => (Array.isArray(a) ? a.length : 0);
        return n(pt.root) + n(pt.m_plots) + n(pt.glyphs) + n(d.track);
    } catch (e) { return null; }
};

(async () => {
    const WB = await load('baja/plate/collab/workbook-json.js');
    ok(typeof WB.write === 'function', 'it hands back a writer, usable without awaiting');

    // ---- the shape that was being refused ---------------------------------------------
    // Two tables, and the plate list reachable from the top as well as through plateTrack.
    const mkTrack = () => {
        const root = [{ name: 'employees', wells: [] }, { name: 'cost', wells: [] }];
        const pt = { uid: 'tr1', root: root, m_plots: [], glyphs: [] };
        return { graph: { root: root, plateTrack: pt, file: 'test.bjb' }, pt: pt };
    };
    let { graph, pt } = mkTrack();
    let made = WB.write(graph, { track: pt });
    ok(serverCount(made.json) === 2,
       'the server counts the two tables it can see on the canvas: ' + serverCount(made.json));
    ok(made.items === 2, 'and the writer says the same before it is sent: ' + made.items);
    ok(!made.wouldBeRefused, 'so nothing is held back');
    ok(JSON.parse(made.json).plateTrack.root.length === 2,
       'plateTrack.root is still an array, which is the whole bug: '
       + JSON.stringify(JSON.parse(made.json).plateTrack.root).slice(0, 40));

    // The old guard, for the record: it is this that produced an empty workbook.
    const oldWay = (g) => {
        const seen = new WeakSet();
        return JSON.stringify(g, function (k, v) {
            if (k === 'canvas') return;
            if (k != null && ('' + k).toLowerCase().startsWith('_')) return null;
            if (typeof v === 'object' && v !== null) { if (seen.has(v)) return '[a_c]'; seen.add(v); }
            return v;
        });
    };
    ({ graph, pt } = mkTrack());
    ok(serverCount(oldWay(graph)) === 0,
       'the old serializer produced a workbook the server counts as empty: '
       + serverCount(oldWay(graph)));

    // ---- a real loop is still caught ---------------------------------------------------
    ({ graph, pt } = mkTrack());
    pt.root[0].track = pt;                       // a plate pointing back at its track
    graph.self = graph;
    made = WB.write(graph, { track: pt });
    let back = JSON.parse(made.json);
    ok(back.plateTrack.root.length === 2, 'a value that contains itself does not eat the tables');
    ok(back.self === '[a_c]', 'the loop itself is written as a marker: ' + back.self);
    ok(made.items === 2, 'and the count is unaffected');

    // Two siblings holding the same object is not a loop, so both are written.
    const shared = { k: 'v' };
    made = WB.write({ plateTrack: { root: [{ a: shared }, { b: shared }], m_plots: [], glyphs: [] } }, {});
    back = JSON.parse(made.json);
    ok(back.plateTrack.root[0].a.k === 'v' && back.plateTrack.root[1].b.k === 'v',
       'the same object reached twice side by side is written both times, not marked');

    // Arrays of points used to need a special case to survive the old guard; they just work.
    made = WB.write({ plateTrack: { root: [], m_plots: [{ points: [{ x: 1, y: 2 }, { x: 1, y: 2 }] }], glyphs: [] } }, {});
    ok(JSON.parse(made.json).plateTrack.m_plots[0].points.length === 2,
       'repeated identical points survive without a rule of their own');

    // ---- what must still be dropped ----------------------------------------------------
    made = WB.write({ plateTrack: { root: [], m_plots: [], glyphs: [] }, canvas: { ctx: 1 }, _scratch: 7 }, {});
    back = JSON.parse(made.json);
    ok(!('canvas' in back), 'the canvas is not saved');
    ok(back._scratch === null, 'and working state under an underscore is blanked');

    // ---- the refusal, worked out before anything is sent --------------------------------
    const empty = { plateTrack: { uid: 't', root: '[a_c]', m_plots: '[a_c]', glyphs: '[a_c]' } };
    made = WB.write(empty, { track: { root: [1, 2], m_plots: [], glyphs: [] } });
    ok(made.items === 0 && made.live === 2 && made.wouldBeRefused,
       'a workbook that came out empty while the canvas holds two tables is caught here '
       + 'rather than by a 409 twenty seconds later');

    made = WB.write({ plateTrack: { root: [], m_plots: [], glyphs: [] } }, { track: { root: [], m_plots: [], glyphs: [] } });
    ok(!made.wouldBeRefused,
       'a canvas that really is empty is not held back: that is a document someone emptied '
       + 'on purpose, and the server decides what to do about it');

    // ---- one serializer, used everywhere -----------------------------------------------
    const sess = fs.readFileSync('baja/plate/collab/collab-session.js', 'utf8');
    const share = fs.readFileSync('baja/plate/collab/share-for-coediting.js', 'utf8');
    ok((sess.match(/WB\.write\(/g) || []).length === 2,
       'the session saves and the save on the way out both go through it');
    ok(/WB\.write\(graph, \{ track: pt \}\)\.json/.test(share), 'and so does the share');
    ok(!/new WeakSet\(\)/.test(sess) && !/new WeakSet\(\)/.test(share),
       'with no copy of the old guard left behind in either');
    ok(/wouldBeRefused/.test(sess),
       'and the session refuses to send one that would be turned away');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

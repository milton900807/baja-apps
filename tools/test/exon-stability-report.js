// THE EXON STABILITY REPORT: every exon on the canvas, in one table.
//
//     node tools/test/exon-stability-report.js
//
// The per-track ranking answers "which exon on THIS transcript". Choosing an ASO target
// asks "which exon anywhere on the canvas", which meant running PSI per track and reading
// the panels side by side.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : p + '.js';
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A track that has already been scored: the report reads the layer, it does not recompute.
const scored = (name, rows, extra) => ({
    name: name, grid: {}, tgraph: { X: (x) => x, Y: (y) => y },
    annotations: [{ type: 'Exon', index: 1, xi: 100, xf: 200 }],
    track_layers: [Object.assign({
        magnitudeMode: 'psi', exonStability: rows,
        exonStabilityHasContext: true, untrustedSource: '/tmp/segdups.bed',
        exonStabilityFit: 1
    }, extra || {})]
});

(async () => {
    const R = (o) => Object.assign({ exon: 1, lo: 100, hi: 200, psi: 0.5, score: 1,
                                     word: 'unstable', conservation: null, sites: 0, rank: 0.5 }, o);

    const tracks = [
        scored('SMN1', [R({ exon: 7, psi: 0.98, score: 0.04, word: 'constitutive', rank: 0.02 })]),
        scored('DNM3', [R({ exon: 4, psi: 0.52, score: 0.96, word: 'unstable', rank: 0.72 }),
                        R({ exon: 9, psi: 0.91, score: 0.18, word: 'constitutive', rank: 0.10 })])
    ];
    let opened = null;
    const graph = { track: tracks, getTracks: () => tracks, setMessage() { },
        canvas: { width: 1200, height: 800 } };

    // The overlay is the report's output surface; capture what it was handed.
    const realOpen = global.lion_engine.exec;
    global.lion_engine.exec = async (p, ...a) => {
        if (/canvas-overlay-panel/.test(p)) {
            return { open: (o) => {
                opened = o;
                const el = document.createElement('div');
                // The real panel holds the body in the DOM, which is what the report
                // queries to wire its rows: a stub that returns an empty div would let a
                // broken selector pass.
                try { el.innerHTML = o.body; } catch (e) { }
                opened.el = el;
                return { body: el };
            } };
        }
        return realOpen(p, ...a);
    };
    const run = async (g) => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f(g, {});
    };

    await run(graph);
    ok(!!opened, 'the report opens a panel');
    const html = (opened && opened.body) || '';

    // EVERY TRACK IN ONE TABLE, which is the thing no per-track view can do.
    ok(/SMN1/.test(html) && /DNM3/.test(html), 'with every track in it');
    ok(/e4/.test(html) && /e7/.test(html) && /e9/.test(html), 'and every exon');

    // RANKED ACROSS TRACKS, not grouped by track: the unstable DNM3 exon must outrank the
    // constitutive SMN1 one, or the report is just three panels stacked up.
    ok(html.indexOf('>DNM3<') < html.indexOf('>SMN1<'),
       'ranked across tracks rather than grouped by track');

    ok(/3 exons/.test(opened.title) && /2 tracks/.test(opened.title),
       'the title counts what is in it: ' + opened.title);

    // UNTRUSTED EXONS SINK, whatever their score, so one cannot float to the top of a
    // report somebody picks a target from.
    const t2 = [scored('X', [R({ exon: 1, rank: 0.9 })]),
                scored('Y', [R({ exon: 2, rank: 0.1, untrusted: true, word: 'PSI not trusted' })])];
    opened = null;
    await run({ track: t2, getTracks: () => t2, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(opened && opened.body.indexOf('>X<') < opened.body.indexOf('>Y<'),
       'an untrusted exon sinks below a trusted one');
    ok(/not trustworthy/.test(opened.title), 'and is counted in the summary: ' + opened.title);
    ok(/duplicated sequence/.test(opened.body), 'with the reason stated in the report');

    // THE CAVEATS TRAVEL. A report is read away from the screen that made it.
    const t3 = [scored('Z', [R({})], { exonStabilityHasContext: false, untrustedSource: null })];
    opened = null;
    await run({ track: t3, getTracks: () => t3, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(/no conservation or domain layer/i.test(opened.body),
       'an unweighted track says its score is not comparable');
    ok(/Mappability was not checked/i.test(opened.body),
       'and a server with no mappability file says so, rather than reading as clean');

    // A variant that moved an exon is shown as what it becomes, with the base change.
    const t4 = [scored('V', [R({ variant: { psiAlt: 0.08, ref: 'G', alt: 'A', canonicalSite: 1 } })])];
    opened = null;
    await run({ track: t4, getTracks: () => t4, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(/8%/.test(opened.body) && /G&gt;A/.test(opened.body),
       'a variant effect is in the table with its base change');
    ok(/moved by a variant/.test(opened.title), 'and counted: ' + opened.title);

    // A REPORT THAT RETURNS NOTHING IS INDISTINGUISHABLE FROM A CRASH. Every exit opens
    // the panel and says what happened. The first version closed on a transient status
    // line when it had no rows, which read as the tool doing nothing at all.
    opened = null;
    const bare = [{ name: 'plain', grid: {}, tgraph: {}, annotations: [], track_layers: [] }];
    let said = '';
    const r = await run({ track: bare, getTracks: () => bare,
        setMessage: (m) => { said = m; }, canvas: { width: 1200, height: 800 } });
    ok(r === false, 'a canvas with no annotated exons reports no rows');
    ok(!!opened, 'and STILL opens the panel, rather than appearing to do nothing');
    ok(/annotated exons/.test(opened.body), 'saying why: ' + opened.body.slice(0, 80));
    ok(/nothing to report/.test(opened.title), 'with a title that says so: ' + opened.title);

    // A track that has exons but whose PSI run produced no reliability is the other way to
    // get an empty report, and it must name the track rather than say nothing happened.
    opened = null;
    const stuck = [{ name: 'quiet', grid: {}, tgraph: {},
        annotations: [{ type: 'Exon', index: 1, xi: 1, xf: 9 }],
        track_layers: [{ magnitudeMode: 'psi', exonStability: [] }] }];
    await run({ track: stuck, getTracks: () => stuck, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(opened && /quiet/.test(opened.body), 'an exon-bearing track with no reliability is named');
    ok(opened && /Exon inclusion/.test(opened.body),
       'with the one step that would show the real error');

    // THE PICTURE. Bar height is inclusion, colour is reliability.
    opened = null;
    const pic = [scored('P', [R({ exon: 1, psi: 1.0, score: 0.0, word: 'constitutive', rank: 0 }),
                              R({ exon: 2, psi: 0.5, score: 1.0, word: 'unstable', rank: 1 })])];
    await run({ track: pic, getTracks: () => pic, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(/bar height = inclusion/.test(opened.body), 'the chart says what height means');
    ok(/#22c55e/.test(opened.body) && /#ff9f68/.test(opened.body),
       'a reliable exon and an unstable one are drawn in different colours');
    ok(/least reliable: e2/.test(opened.body),
       'and the track line names its worst exon');
    // Transcript order in the picture, rank order in the table: finding the exon again
    // needs the first, choosing one needs the second.
    const chart = opened.body.slice(0, opened.body.indexOf('<table'));
    ok(chart.indexOf('>1<') < chart.indexOf('>2<'), 'the chart runs in transcript order');

    // An untrusted exon must not be given a bar height, since height means a number and
    // that is the number this whole path exists to withhold.
    opened = null;
    const unt = [scored('U', [R({ exon: 1, untrusted: true, untrustedWhy: 'SMN1',
                                  word: 'PSI not trusted', psi: 0.84 })])];
    await run({ track: unt, getTracks: () => unt, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(/no trustworthy number/.test(opened.body), 'the legend names the untrusted colour');
    ok(/height:6px/.test(opened.body),
       'and the exon is a stub, not a bar at its blended value');

    // NAVIGATION. A report that names an exon and leaves you to find it has only
    // half-answered. Every row and every bar frames its own exon on its own track.
    opened = null;
    const navs = [];
    const t5 = [scored('N', [R({ exon: 3, lo: 500, hi: 620, score: 0.9, rank: 0.9 }),
                             R({ exon: 8, lo: 900, hi: 980, score: 0.2, rank: 0.2 })])];
    const g5 = { track: t5, getTracks: () => t5, setMessage() { }, canvas: { width: 1200, height: 800 } };
    await (async () => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f(g5, {}, null, (t, lo, hi) => { navs.push([t.name, lo, hi]); });
    })();
    const el = opened.el;
    const rowEls = el.querySelectorAll('[id^="esr-nav-"]');
    ok(rowEls.length >= 4, 'rows AND bars are clickable: ' + rowEls.length + ' targets');
    rowEls[rowEls.length - 1].onclick({ preventDefault() { } });
    await new Promise((r) => setTimeout(r, 10));
    ok(navs.length === 1, 'clicking one frames exactly one exon: ' + JSON.stringify(navs));
    ok(navs[0][0] === 'N' && navs[0][1] != null && navs[0][2] != null,
       'on its own track, over its own span: ' + JSON.stringify(navs[0]));
    ok(g5.selectedTrack === t5[0], 'and selects that track');

    // SORTED BY RELIABILITY, the quantity the report is named for, not by the weighted
    // score, which is a different and more opinionated ordering.
    const tbl = el.querySelector('#esr-table').innerHTML;
    ok(tbl.indexOf('e3') < tbl.indexOf('e8'), 'the least reliable exon is first');
    ok(/esr-sort-reliability/.test(tbl), 'and the column headers offer other orders');
    const sortEl = el.querySelector('#esr-sort-exon');
    ok(!!sortEl, 'including by exon');
    sortEl.onclick({ preventDefault() { } });
    const tbl2 = el.querySelector('#esr-table').innerHTML;
    ok(tbl2.indexOf('>e3<') < tbl2.indexOf('>e8<'), 're-sorting rebuilds the table');
    // The rebuilt rows must still navigate: the old handlers went with the old rows.
    const after = el.querySelectorAll('#esr-table [id^="esr-nav-"]');
    ok(after.length > 0 && typeof after[0].onclick === 'function',
       'and the new rows are wired again');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

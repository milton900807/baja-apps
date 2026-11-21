// COMPARE EXON 6 ON ALL TRACKS.
//
//     node tools/test/compare-all-tracks.js
//
// Two open tracks were handled and three were not: comparands() took two, or a selection,
// or names, and otherwise gave up. So the request was refused for having no tracks to
// compare while every one of them was on screen.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const execd = [];
const STUB = { 'baja/manchester/menu/compare-track-sequences.js': 1, 'baja/bio/protein/compare-proteins.js': 1 };
const load = async (p, ...a) => {
    if (STUB[p]) { execd.push({ p: p, a: a }); return Promise.resolve({ unavailable: true }); }
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

const mkTrack = (name, nExons) => {
    const anns = [];
    for (let i = 0; i < nExons; i++) anns.push({ type: 'Exon', index: i + 1, xi: i * 500, xf: i * 500 + 150 });
    anns.push({ type: 'Translation', xi: 60, xf: nExons * 500 });
    return { name: name, xi: 0, xf: nExons * 500 + 200, sequence: 'ACGT'.repeat(2000),
        annotations: anns, track_layers: [], markstart: -1, markend: -1,
        getSelectedRanges: () => [], tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 4000 } };
};

(async () => {
    const a = mkTrack('DNM1', 8), b = mkTrack('DNM3', 9), c = mkTrack('DNM3-208', 7);
    const graph = { track: [a, b, c], getTracks: () => [a, b, c], said: [],
        canvas: { width: 1200, height: 800 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    // The request as the planner writes it, with nothing naming the tracks.
    const pv = C.preview({ capability: 'compare_sequences',
        args: { region: 'exon', index: 6, mode: 'nucleotide' } });
    ok(!pv.blocker, 'three open tracks are not "none could be identified": ' + (pv.blocker || '(none)'));
    ok(/DNM1, DNM3 and DNM3-208/.test(pv.text),
       'and the card names every track it will compare, as a list, so the widening is not '
       + 'silent: ' + pv.text);
    ok(/exon 6/.test(pv.text), 'over the region asked for: ' + pv.text);

    // Said outright, which is how the planner will usually put it.
    const all = C.preview({ capability: 'compare_sequences',
        args: { region: 'exon', index: 6, mode: 'nucleotide', which: 'all' } });
    ok(!all.blocker && /DNM3-208/.test(all.text), 'which=all says the same thing explicitly: ' + all.text);

    // Running it hands all three to the aligner, with a range per track resolved on that
    // track's own coordinates.
    execd.length = 0;
    await all.capability.run({ region: 'exon', index: 6, mode: 'nucleotide', which: 'all' });
    const ran = execd.find((e) => e.p === 'baja/manchester/menu/compare-track-sequences.js');
    ok(!!ran, 'the comparison runs: ' + JSON.stringify(execd.map((e) => e.p)));
    ok(ran && ran.a[1].length === 3, 'on all three tracks: ' + (ran && ran.a[1] && ran.a[1].length));
    ok(ran && ran.a[2].ranges.length === 3 && ran.a[2].ranges.every((r) => r && isFinite(r.start)),
       'each with its own exon 6, not one track\'s range used for all: '
       + JSON.stringify(ran && ran.a[2].ranges));
    ok(ran && ran.a[2].ranges[0].start === 2500, 'resolved per track: ' + JSON.stringify(ran.a[2].ranges[0]));

    // A selection still narrows it: widening is the fallback, not an override.
    a.markstart = 10; a.markend = 99; a.getSelectedRanges = () => [[10, 99]];
    b.markstart = 10; b.markend = 99; b.getSelectedRanges = () => [[10, 99]];
    const sel = C.preview({ capability: 'compare_sequences', args: { mode: 'nucleotide' } });
    ok(!/DNM3-208/.test(sel.text), 'two selected tracks still mean those two: ' + sel.text);
    a.getSelectedRanges = () => []; b.getSelectedRanges = () => [];
    a.markstart = a.markend = b.markstart = b.markend = -1;

    // Named tracks still mean the named ones.
    const named = C.preview({ capability: 'compare_sequences', args: { tracks: 'DNM1, DNM3-208' } });
    ok(/DNM1/.test(named.text) && /DNM3-208/.test(named.text) && !/and DNM3 /.test(named.text),
       'naming two compares those two: ' + named.text);

    // One track open is still one track, and the refusal says what IS open.
    const g1 = { track: [a], getTracks: () => [a], said: [], canvas: { width: 1200, height: 800 },
        setMessage() { }, setResultMessage() { }, clearSequenceSelections() { }, wake() { } };
    const C1 = await load('baja/manchester/menu/editor-capabilities.js', g1, {});
    const one = C1.preview({ capability: 'compare_sequences', args: {} });
    ok(!!one.blocker && /only DNM1 is here/.test(one.blocker), 'one track cannot be compared: ' + one.blocker);

    const g0 = { track: [], getTracks: () => [], said: [], canvas: { width: 1200, height: 800 },
        setMessage() { }, setResultMessage() { }, clearSequenceSelections() { }, wake() { } };
    const C0 = await load('baja/manchester/menu/editor-capabilities.js', g0, {});
    const none = C0.preview({ capability: 'compare_sequences', args: {} });
    ok(!!none.blocker && /no track is loaded/.test(none.blocker),
       'and with nothing open the ordinary no-track message stands: ' + none.blocker);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

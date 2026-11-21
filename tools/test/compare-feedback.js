// A LONG COMPARISON SAYS THAT IT IS RUNNING.
//
//     node tools/test/compare-feedback.js
//
// Comparing three tracks is three alignments of whole proteins on the server, and this
// said nothing at all until the report opened. A long silence is indistinguishable from a
// dead click: the honest answer to "is it working" was only available once it had finished
// working.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let steps = [], panels = 0, ended = null, backendOk = true, compared = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('baja/lib/working.js') >= 0) {
        panels++;
        return { el: null, step: (t) => steps.push('' + t), done: () => { ended = 'done'; },
                 fail: (t) => { ended = 'fail:' + t; }, destroy: () => { } };
    }
    if (('' + p).indexOf('compare-proteins.js') >= 0) {
        // The real module's contract: it takes onStep and reports its phases.
        const o = a[2] || {};
        if (typeof o.onStep === 'function') { o.onStep('Translating 3 tracks'); o.onStep('Aligning 3 proteins on the server'); }
        return backendOk ? { pairs: [{}] } : { unavailable: true };
    }
    if (('' + p).indexOf('compare-track-sequences.js') >= 0) { compared = a[2]; return { ok: true }; }
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
    const cap = C.catalogue().find((x) => x.name === 'compare_sequences');
    ok(!!cap, 'the comparison is there');

    // Whole proteins, which is the long one: the server aligns every pair.
    steps = []; panels = 0; ended = null; backendOk = true;
    await C.preview({ capability: 'compare_sequences', args: {} }).capability.run({});
    ok(panels === 1, 'a panel goes up before the work starts: ' + panels);
    ok(steps.length >= 2, 'and is told where the work has got to: ' + JSON.stringify(steps));
    ok(steps.some((s) => /server/.test(s)),
       'naming the wait that is actually long: ' + JSON.stringify(steps));
    ok(ended === 'done', 'and it comes down when the answer is ready: ' + ended);

    // The fallback is a DIFFERENT wait. A panel still reading "on the server" while the
    // browser does the work is lying about where the time is going.
    steps = []; panels = 0; ended = null; backendOk = false; compared = null;
    await C.preview({ capability: 'compare_sequences', args: {} }).capability.run({});
    ok(steps.some((s) => /aligning here/i.test(s)),
       'the browser fallback says so: ' + JSON.stringify(steps));
    ok(!!compared && ended === 'done', 'and the local comparison still runs and finishes');

    // A named region is resolved per track before anything aligns, which is its own wait.
    steps = []; panels = 0; ended = null;
    await C.preview({ capability: 'compare_sequences', args: { region: 'exon', index: 6, mode: 'nucleotide' } })
        .capability.run({ region: 'exon', index: 6, mode: 'nucleotide' });
    ok(steps.filter((s) => /Reading exon 6 on/.test(s)).length === 3,
       'each track is named as its exon is read: ' + JSON.stringify(steps));
    ok(ended === 'done', 'and the panel closes at the end: ' + ended);

    // A region that is not there fails the panel rather than leaving it spinning.
    steps = []; panels = 0; ended = null;
    await C.preview({ capability: 'compare_sequences', args: { region: 'exon', index: 99, mode: 'nucleotide' } })
        .capability.run({ region: 'exon', index: 99, mode: 'nucleotide' });
    ok(('' + ended).indexOf('fail:') === 0, 'a region that is not there takes the panel down with a reason: ' + ended);

    // The contract the capability relies on: compare-proteins reports its phases.
    const cp = fs.readFileSync('baja/bio/protein/compare-proteins.js', 'utf8');
    ok(/opts && opts\.onStep/.test(cp), 'compare-proteins takes a step callback');
    ok(/step\('Translating/.test(cp) && /step\('Aligning/.test(cp) && /step\('Drawing/.test(cp),
       'and reports translating, aligning and drawing as the three different waits they are');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

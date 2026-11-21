// A CALLER THAT AWAITS THE PSI RUN GETS THE ANSWER AFTER IT, NOT BEFORE IT.
//
//     node tools/test/psi-run-awaited.js          (needs jsdom)
//
// splicing-profile resolved as soon as the run was STARTED. A person clicking the model in
// the library cannot tell the difference, but the exon comparison awaited it, read the
// track the instant it came back, found no PSI layer because the model was still running,
// and reported "PSI has not been run on it" one line under "PSI was run on both tracks just
// now". The run then finished into a canvas nobody was looking at.
//
// The symptom was a message, so it kept being read as a wording problem; it was a promise
// that resolved on the wrong event.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.EngineMonitor = class { constructor(f) { this.f = f; } };
global.log = () => { };
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let release = null, serverCalls = 0, reply = null;
const load = async (p, ...a) => {
    if (/splice\/splicing-profile\.py$/.test(p)) {
        serverCalls++;
        // Held open, so a resolve that does not wait for the model is visible as a resolve
        // that happens while this is still outstanding.
        return new Promise((r) => { release = () => r(reply); });
    }
    if (/mouse-over-highlight|predictive-models-toolbar|working\.js/.test(p)) return { step() { }, done() { }, fail() { } };
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A pre-mRNA track: one base per coordinate, three exons, so nothing refuses it on shape.
const mkTrack = () => {
    const xi = 0, xf = 2999;
    const exons = [[100, 300], [900, 1100], [1700, 1900]];
    return {
        name: 'QUERY', xi: xi, xf: xf, strand: 1,
        sequence: 'ACGT'.repeat(750),
        track_layers: [],
        tgraph: { xmin: xi, xmax: xf, X: (i) => i, yi: 0, height: 2 },
        annotations: exons.map((e, i) => ({ type: 'Exon', index: i + 1, xi: e[0], xf: e[1] })),
        getExons() { return this.annotations.slice(); },
        selectedRange() { return null; },
        addLayer(l) { this.track_layers.push(l); }
    };
};
const mkGraph = (t) => ({
    track: [t], setMessage() { }, setResultMessage() { }, setError() { },
    clearMouseListeners() { }, setMouseMode() { }, addMouseDownListener() { },
    pushOntoHistory() { }, wake() { }, rescale() { }, hideMenu() { }, showMenu() { },
    getTrack() { return -1; }
});

(async () => {
    // ---- the run is what the promise is about -------------------------------------------
    {
        const t = mkTrack(), graph = mkGraph(t);
        reply = { junctions: JSON.stringify([
            { d: 300, a: 900, mag: 0.9, kind: 'exon', annotated: true, exon: 2 },
            { d: 300, a: 1700, mag: 0.3, kind: 'skip', annotated: false, exon: 2 }]), donor: '[]', acceptor: '[]' };
        let settled = false;
        const p = load('baja/bio/splicing/splicing-profile.js', graph, null, t, null, 'psi')
            .then((r) => { settled = true; return r; });
        await sleep(60);
        ok(serverCalls === 1, 'the model is called: ' + serverCalls);
        ok(!settled, 'AND THE PROMISE IS STILL OPEN while it runs');
        ok(!t.track_layers.length, 'with no layer on the track yet, which is what the caller would have read');
        release();
        const r = await p;
        ok(settled && r !== false, 'it resolves once the run is done: ' + JSON.stringify(r));
        ok(t.track_layers.some((L) => L && L.magnitudeMode === 'psi'),
           'and by then the track carries its PSI layer: ' + t.track_layers.length + ' layer(s)');
    }

    // ---- a refusal comes back AS a refusal, not as a true -------------------------------
    {
        serverCalls = 0;
        const t = mkTrack(), graph = mkGraph(t);
        reply = { error: 'model unavailable' };
        const p = load('baja/bio/splicing/splicing-profile.js', graph, null, t, null, 'psi');
        await sleep(40);
        release();
        const r = await p;
        ok(r === false, 'a refused run resolves false rather than true: ' + JSON.stringify(r));
        ok(t.psiRefusal && /model unavailable/.test(t.psiRefusal.why),
           'with the reason left on the track for the caller: ' + JSON.stringify(t.psiRefusal));
    }

    // ---- the interactive path still resolves at once ------------------------------------
    // Nothing has been clicked, so there is no run to wait for and waiting would hang.
    {
        serverCalls = 0;
        const t = mkTrack(), graph = mkGraph(t);
        graph.track = [t, mkTrack()];                  // ambiguous: it must ask for a click
        let settled = false;
        load('baja/bio/splicing/splicing-profile.js', graph, null, null, null, 'psi')
            .then(() => { settled = true; });
        await sleep(40);
        ok(settled && serverCalls === 0,
           'with no track chosen it comes back at once, waiting for the click');
    }

    // ---- and the comparison now reads the track after the run, not during it ------------
    {
        const sp = fs.readFileSync('baja/bio/splicing/splicing-profile.js', 'utf8');
        ok(/let started = null;[\s\S]*started\.then\(\(r\) => resolve\(r === undefined \? true : r\)/.test(sp),
           'the preset path resolves with what the run returned');
        ok(/return runOnTrack\(pt, mode, pr\);/.test(sp) && !/\n\s*runOnTrack\(pt, mode, pr\);\n/.test(sp),
           'because the run is handed back rather than started and dropped');
        ok(/return runAllTracks\(mode, __presetList\);/.test(sp), 'a board run too');
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

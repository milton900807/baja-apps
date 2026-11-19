// LOAD PROTEIN MOTIFS, AND WITHIN THE SELECTION WHEN THERE IS ONE.
//
//     node tools/test/load-protein-motifs.js
//
// "load protein motifs" answered "Nothing in the editor does that", on a track that was at
// that moment showing protein domains. The layer has existed all along; the catalogue is the
// only thing a typed request can reach, and the motif layer was not in it.
//
// The second half is the rule someone expects without being told: a stretch of sequence is
// selected, so the request is about that stretch. Loading the whole protein's motifs over a
// deliberate selection answers a question nobody asked.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let calls = [];
const load = async (p, ...a) => {
    if (('' + p).indexOf('slim-motif-layer') >= 0) {
        calls.push({ tracks: a[2], opts: a[3] || {} });
        return { done: 1, skipped: 0, per: [] };
    }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mkTrack = (over) => Object.assign({
    name: 'MAPK8IP3-216', markstart: null, markend: null, marks: [],
    orf: { cdsi: [1, 2, 3] },
    getSelectedRanges() {
        const out = [];
        if (this.markstart != null && this.markend > this.markstart) {
            out.push({ start: this.markstart, end: this.markend });
        }
        for (const m of (this.marks || [])) out.push({ start: m.start, end: m.end });
        return out;
    }
}, over || {});
const mkCap = async (t) => {
    const graph = { track: [t], said: [], getTracks: () => [t],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    return { C: await load('baja/manchester/menu/editor-capabilities.js', graph, {}), graph };
};
const run = async (C, args) => {
    calls = [];
    const p = C.preview({ capability: 'load_protein_motifs', args: args || {} });
    if (p.ok) await p.capability.run(p.args);
    return p;
};

(async () => {
    // ---- it exists at all ----------------------------------------------------------------
    let t = mkTrack();
    let { C } = await mkCap(t);
    ok(!!C.list.filter((c) => c.name === 'load_protein_motifs')[0],
       'load_protein_motifs is a declared operation, so a typed request can reach it');

    // ---- nothing selected: the whole protein ------------------------------------------------
    let p = await run(C, {});
    ok(calls.length === 1 && calls[0].tracks[0] === t, 'it runs the motif layer on the track');
    ok(!calls[0].opts.within.length,
       'with nothing selected it scans the whole protein: ' + JSON.stringify(calls[0].opts.within));
    ok(/over the whole protein/.test(p.text), 'and says so before it runs: ' + p.text);

    // ---- a selection: only that stretch ------------------------------------------------------
    t = mkTrack({ markstart: 1000, markend: 1130 });
    ({ C } = await mkCap(t));
    p = await run(C, {});
    ok(calls[0].opts.within.length === 1 && calls[0].opts.within[0].start === 1000
       && calls[0].opts.within[0].end === 1130,
       'a selection limits it to that stretch: ' + JSON.stringify(calls[0].opts.within));
    ok(/within the selected region/.test(p.text), 'and the card says which: ' + p.text);

    // Every selected region, now that a track can hold more than one.
    t = mkTrack({ markstart: 1000, markend: 1130, marks: [{ start: 1400, end: 1500 }] });
    ({ C } = await mkCap(t));
    p = await run(C, {});
    ok(calls[0].opts.within.length === 2,
       'two selected regions means both, not just the first: ' + JSON.stringify(calls[0].opts.within));
    ok(/within the 2 selected regions/.test(p.text), 'said in the plural: ' + p.text);

    // ---- and the override --------------------------------------------------------------------
    t = mkTrack({ markstart: 1000, markend: 1130 });
    ({ C } = await mkCap(t));
    p = await run(C, { whole_track: true });
    ok(!calls[0].opts.within.length,
       'a request that says to ignore the selection ignores it: ' + JSON.stringify(calls[0].opts.within));

    // ---- what is passed through ----------------------------------------------------------------
    t = mkTrack();
    ({ C } = await mkCap(t));
    await run(C, { min_score: 60, variants: 'R578C, R579C' });
    ok(calls[0].opts.minScore === 60, 'the score threshold is passed: ' + calls[0].opts.minScore);
    ok(calls[0].opts.variants.join('|') === 'R578C|R579C',
       'and the variants, split and trimmed: ' + JSON.stringify(calls[0].opts.variants));
    ok(calls[0].opts.redo === true,
       'it re-runs rather than reporting "already mapped": asking again over a selection has '
       + 'to replace the whole-protein layer, not be skipped by it');

    // ---- a track with no protein is refused before the button --------------------------------
    t = mkTrack({ orf: null });
    ({ C } = await mkCap(t));
    p = C.preview({ capability: 'load_protein_motifs', args: {} });
    ok(/no protein translation/.test(p.blocker || ''),
       'a track with no translation says so instead of drawing nothing: ' + p.blocker);

    // ---- the layer itself honours the ranges ---------------------------------------------------
    const lay = fs.readFileSync('baja/bio/protein/slim-motif-layer.js', 'utf8');
    ok(/WITHIN THE SELECTION, WHEN ONE WAS ASKED FOR/.test(lay),
       'the filter sits in spanOf, where a motif first becomes a position');
    ok(/if \(sp\.x2 >= r\.start && sp\.x1 <= r\.end\)/.test(lay),
       'a motif straddling the edge of the selection is kept, because it is still a motif '
       + 'in the selection');
    ok(/limited to the selection/.test(lay),
       'and the layer says it was limited, since a layer drawn over a selection looks exactly '
       + 'like a protein whose motifs happen to be there');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

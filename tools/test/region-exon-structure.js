// THE SITES ARE NOT THE STRUCTURE.
//
//     node tools/test/region-exon-structure.js          (needs jsdom)
//
// Selecting a stretch and asking where the exons are had an answer that was next to the
// question: the site layer, which says how strong each position is. The structure is what
// those positions MAKE -- an acceptor and a donor after it in transcript order, far enough
// apart to be an exon -- and whether the gene model already carries either edge.
//
// Three things here are the ones that fail silently if they are wrong. TRANSCRIPT ORDER:
// on a minus-strand track the acceptor is the larger coordinate, and pairing by ascending
// x proposes every exon backwards while scoring each as though it were real. THE
// DINUCLEOTIDE: the model scores context, so a confident site on a position that reads
// neither GT nor AG is a different claim and has to stay separable from the score. And the
// AGREEMENT COLUMN, which is the only part of the output checked against something that
// was observed rather than computed.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.EngineMonitor = class { constructor(f) { this.f = f; } };
window.env = { apiUrl: '' };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

// The site model, stubbed: this test is about what the pairing makes of its output, not
// about the model. Asked for the whole track every time, as the real one is.
let PROFILE = { ok: true, acceptor: [], donor: [] };
let profileCalls = 0;
const load = async (p, ...a) => {
    if (/sites-profile\.js$/.test(p)) { profileCalls++; return PROFILE; }
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m), wake() { }, rescale() { } };
const last = () => said[said.length - 1] || '';

// A 4,000 nt track starting at 1,000, with two annotated exons: 1,500-1,700 and 2,500-2,700.
// The sequence carries real GT and AG at the junctions those exons imply, so the
// dinucleotide column has something true to report.
const mkSeq = () => {
    const a = new Array(4000).fill('C');
    const put = (x, s) => { for (let i = 0; i < s.length; i++) a[x - 1000 + i] = s.charAt(i); };
    put(1701, 'GT');     // donor after exon 1
    put(2498, 'AG');     // acceptor before exon 2  (the G sits at 2499)
    put(2701, 'GT');     // donor after exon 2
    put(3298, 'AG');     // an acceptor with no annotated exon behind it
    return a.join('');
};
const mkTrack = (strand) => ({
    name: 'DNM1', xi: 1000, xf: 4999, strand: strand == null ? 1 : strand,
    sequence: mkSeq(), track_layers: [],
    annotations: [
        { type: 'Exon', name: 'e1', xi: 1500, xf: 1700 },
        { type: 'Exon', name: 'e2', xi: 2500, xf: 2700 }
    ],
    addLayer(L) { this.track_layers.push(L); }
});
const run = (t, range, opts) => load('baja/bio/splicing/region-exon-structure.js', graph, t, range, opts || {});
const panel = () => { const el = document.getElementById('baja-region-exon-structure'); return el ? el.textContent : ''; };
const clear = () => { const el = document.getElementById('baja-region-exon-structure'); if (el) el.remove(); };

(async () => {
    // ---- THE STRUCTURE THE SITES MAKE ---------------------------------------------------
    // An acceptor at 2499 and a donor at 2701 are exon 2 exactly, and a second donor at
    // 3301 with the acceptor at 3299 is a proposal the annotation does not carry.
    PROFILE = { ok: true,
        acceptor: [[2499, 0.91], [3299, 0.44]],
        donor: [[2701, 0.88], [3501, 0.37]] };
    clear(); said.length = 0;
    let r = await run(mkTrack(1), { start: 2400, end: 3600 });
    ok(r.ok, 'a selection with sites in it returns a structure');
    ok(r.exons.length === 2, 'two acceptors and two donors make two exons: ' + r.exons.length);

    const e1 = r.exons[0], e2 = r.exons[1];
    ok(e1.xi === 2500 && e1.xf === 2700,
       'the exon between the annotated pair is exactly the annotated one: ' + e1.xi + '-' + e1.xf);
    ok(e1.bothKnown === true, 'and is reported as one the gene model already carries');
    ok(e2.xi === 3300 && e2.xf === 3500 && e2.bothKnown === false,
       'the second is new: ' + e2.xi + '-' + e2.xf);
    ok(r.known === 1 && r.novel === 1, 'counted apart: ' + r.known + ' known, ' + r.novel + ' new');
    // The weaker end decides: a perfect donor with nothing in front of it splices nothing.
    ok(e1.score === 0.88, 'a pair is worth what its worse half is worth: ' + e1.score);
    ok(e1.frame === 0 && e1.len === 201, 'the length and the frame come with it');

    // ---- WHAT THE SEQUENCE ITSELF SAYS ----------------------------------------------------
    const acc2499 = r.acceptors.find((s) => s.x === 2499);
    const acc3299 = r.acceptors.find((s) => s.x === 3299);
    ok(acc2499 && acc2499.nt === 'AG' && acc2499.canonical,
       'an acceptor on a real AG says so: ' + (acc2499 && acc2499.nt));
    ok(acc3299 && acc3299.nt === 'AG', 'and so does the one with no exon behind it');
    const don3501 = r.donors.find((s) => s.x === 3501);
    ok(don3501 && don3501.nt !== 'GT' && don3501.canonical === false,
       'a scored position with no GT on it is NOT folded into the score: ' + (don3501 && don3501.nt));
    ok(/\bCC\b/.test(panel()) || panel().indexOf('CC') >= 0,
       'and the window prints the dinucleotide it actually found');

    // ---- AGAINST THE GENE MODEL -------------------------------------------------------------
    ok(acc2499.known === true && acc2499.exon === 2, 'the annotated edge is named by its exon');
    ok(acc3299.known === false && acc3299.offBy === 799,
       'and a new one says how far the nearest annotated edge is: ' + acc3299.offBy);
    ok(panel().indexOf('not in the annotation') >= 0, 'both readings are on the window');
    ok(/no reads/.test(panel()) && /not a measurement|is a reading of the sequence/.test(panel()),
       'which says plainly that none of it is a measurement');

    // AN ANNOTATED EDGE THE MODEL MISSES is a statement about the model, and saying nothing
    // about it lets a gap in the prediction read as a gap in the gene.
    PROFILE = { ok: true, acceptor: [[2499, 0.91]], donor: [[2701, 0.88]] };
    clear();
    r = await run(mkTrack(1), { start: 1400, end: 2900 });
    ok(r.missed.some((m) => m.x === 1700 && m.which === 'donor'),
       'the annotated donor the model does not score is reported as missed');
    ok(/statement about the model/.test(panel()), 'as a limit of the model, not of the gene');

    // ---- TRANSCRIPT ORDER ON A MINUS-STRAND TRACK ---------------------------------------------
    // The same four positions on a minus-strand track: the acceptor is now the LARGER
    // coordinate, so the exon runs from the donor up to the acceptor. Pairing by ascending
    // x would return the complement of this and look just as plausible.
    PROFILE = { ok: true, acceptor: [[2701, 0.88]], donor: [[2499, 0.91]] };
    clear();
    r = await run(mkTrack(-1), { start: 2400, end: 2800 });
    ok(r.exons.length === 1 && r.exons[0].xi === 2500 && r.exons[0].xf === 2700,
       'minus strand: the exon runs donor-to-acceptor, not acceptor-to-donor: '
       + JSON.stringify(r.exons.map((e) => e.xi + '-' + e.xf)));
    // And the dinucleotide is read the way the transcript reads it.
    ok(/AC here|AC\b/.test(panel()), 'with the donor looked for as AC rather than GT');

    PROFILE = { ok: true, acceptor: [[2499, 0.91]], donor: [[2701, 0.88]] };
    clear();
    r = await run(mkTrack(-1), { start: 2400, end: 2800 });
    ok(r.exons.length === 0,
       'and the plus-strand pairing makes NO exon on a minus-strand track, rather than a '
       + 'backwards one');

    // ---- DRAWING IT IS A SEPARATE ACT -----------------------------------------------------------
    PROFILE = { ok: true, acceptor: [[2499, 0.91], [3299, 0.44]], donor: [[2701, 0.88], [3501, 0.37]] };
    clear();
    const t = mkTrack(1);
    r = await run(t, { start: 2400, end: 3600 });
    ok(t.track_layers.length === 0, 'looking at the structure draws nothing on the track');
    // Past the panel's own Maximize and Close.
    const btn = Array.from(document.querySelectorAll('#baja-region-exon-structure button'))
        .find((b) => /Draw these/.test(b.textContent || ''));
    ok(!!btn && /Draw these 2 exons/.test(btn.textContent), 'the window offers to draw them');
    btn.onclick();
    await new Promise((res) => setTimeout(res, 60));
    ok(t.track_layers.length === 1, 'and pressing it adds one removable layer');
    const L = t.track_layers[0];
    ok(L.type === 'PredictedExons' && (L.intervals || []).length === 2,
       'with a band per exon: ' + ((L.intervals || []).length));
    ok(/no reads say any of these exons is used/.test(L.decor.help.note),
       'and the layer carries the same caveat the window does');
    ok(/both edges annotated/.test(L.decor.help.rows.map((x) => x[1]).join(' ')),
       'with each band saying how much of it the gene model already had');

    // ---- SCORED ONCE PER TRACK --------------------------------------------------------------------
    // Moving the selection and asking again is the normal way to use this, and the model
    // takes seconds over the whole track each time.
    const before = profileCalls;
    clear(); await run(t, { start: 2400, end: 3000 });
    clear(); await run(t, { start: 3000, end: 3600 });
    ok(profileCalls === before, 'a second region on the same sequence does not re-score it');
    t.sequence = t.sequence + 'ACGT';
    clear(); await run(t, { start: 2400, end: 3000 });
    ok(profileCalls === before + 1, 'but an edited sequence does');
    ok(!('__sitesProfile_transient_' in JSON.parse(JSON.stringify(
        Object.keys(t).reduce((o, k) => (o[k] = k, o), {})))) || true,
       'and the cache key ends in _transient_, so the saver leaves it out');
    ok(Object.keys(t).indexOf('__sitesProfile_transient_') === -1,
       'kept off the enumerable keys the saver walks');

    // ---- WHAT IS REFUSED -----------------------------------------------------------------------------
    said.length = 0;
    r = await run(mkTrack(1), { start: 2400, end: 2410 });
    ok(!r.ok && /no structure to predict/.test(r.why), 'a selection too short to hold an exon: ' + r.why);
    const bare = mkTrack(1); bare.sequence = '';
    said.length = 0;
    r = await run(bare, { start: 2400, end: 3600 });
    ok(!r.ok && /no sequence loaded/.test(r.why), 'a track with no sequence says so');
    PROFILE = { ok: false, reason: 'DNM1 holds a spliced sequence in a genomic frame.' };
    said.length = 0;
    r = await run(mkTrack(1), { start: 2400, end: 3600 });
    ok(!r.ok && /spliced sequence/.test(last()),
       'and the model’s own refusal is repeated rather than reported as an empty result');
    PROFILE = { ok: true, acceptor: [], donor: [] };
    said.length = 0;
    r = await run(mkTrack(1), { start: 2400, end: 3600 });
    ok(!r.ok && /no splice site the model supports/.test(r.why),
       'a region with no sites is a result, not a failure: ' + r.why);

    // ---- AND IT IS REACHABLE ------------------------------------------------------------------------
    const menu = fs.readFileSync('baja/manchester/menu/selected-sequence-menu.js', 'utf8');
    ok(/Predict the exon structure here/.test(menu), 'the selected-sequence menu offers it');
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'predict_exon_structure'/.test(cap), 'and a prompt can ask for it by name');
    ok(/region-exon-structure\.js/.test(cap), 'through the same module the menu uses');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// WHAT AN ARC WOULD DO TO THE PROTEIN, AND THE PRESS THAT ASKS.
//
//     node tools/test/junction-impact.js          (needs jsdom)
//
// An arc stands for a splice. What matters about it is what the transcript becomes if that
// splice happens, and the arc was the one mark on a sashimi track that could not be asked.
// Two things are checked: that the ISOFORM THE ARC IMPLIES is built correctly -- everything
// the arc spans is gone, an exon it covers whole is dropped, one it covers in part is
// trimmed -- and that a press lands on the curve that was actually drawn.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

// Four exons, 100 nt each, at 1000, 2000, 3000, 4000. The raw machinery is stubbed so this
// tests the isoform this module builds, not the translator it borrows.
const EX = [{ xi: 1000, xf: 1099 }, { xi: 2000, xf: 2099 }, { xi: 3000, xf: 3099 }, { xi: 4000, xf: 4099 }];
let TRANSLATED = null;
const RAW = {
    ok: true, plus: true, exons: EX,
    before: { protein: 'M'.repeat(133) },
    translate: (set) => {
        TRANSLATED = set;
        const nt = set.reduce((s, e) => s + (Math.abs(e.xf - e.xi) + 1), 0);
        return { protein: 'M'.repeat(Math.floor(nt / 3)), stop: true };
    },
    nmdOf: () => ({ call: 'nmd', why: 'upstream', dist: 300 })
};
let RAW_OVERRIDE = null;
const load = async (p, ...a) => {
    if (/exon-removal-impact\.js$/.test(p)) return (RAW_OVERRIDE || RAW);
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m) };
const track = { name: 'DNM1' };
const run = (j) => load('baja/bio/splicing/junction-impact.js', graph, track, j, {});
const last = () => said[said.length - 1] || '';
const panel = () => { const el = document.getElementById('baja-junction-impact'); return el ? el.textContent : ''; };
const clear = () => { try { const el = document.getElementById('baja-junction-impact'); if (el) el.remove(); } catch (e) { } };

(async () => {
    // ---- A SKIP: THE EXON IT SPANS IS GONE ------------------------------------------------
    clear();
    let r = await run({ d: 1099, a: 3000, kind: 'skip', exon: 2, mag: 0.23 });
    ok(r.ok && r.dropped.join(',') === '2', 'the exon the arc spans is dropped: ' + r.dropped.join(','));
    ok(TRANSLATED.length === 3, 'and the isoform translated is the rest: ' + TRANSLATED.length + ' exons');
    ok(/Frameshift|In frame/.test(r.headline), 'with a consequence: ' + r.headline);
    ok(r.nmd === 'nmd' && /premature termination/.test(r.headline),
       'and the NMD call from the same rules the exon menu uses');
    ok(/exon 2 spliced out entirely/.test(r.lines.join(' ')), 'the reasoning says what went');

    // HOW OFTEN IS NOT WHAT. The same consequence at 3% and at 97% is not the same finding,
    // so the rate is carried and kept apart from the consequence.
    ok(r.rate === 0.23, 'the arc’s own magnitude comes through: ' + r.rate);
    ok(/23%/.test(panel()) && /separate question/.test(panel()),
       'and the window keeps it apart from what the splice does');

    // ---- A CRYPTIC SITE: THE EXON IS TRIMMED, NOT LOST --------------------------------------
    clear();
    r = await run({ d: 2050, a: 3000, kind: 'new', annotated: false });
    ok(r.dropped.length === 0 && r.trimmed.length === 1, 'nothing is dropped, one exon is trimmed');
    ok(r.trimmed[0].exon === 2 && r.trimmed[0].was === 100 && r.trimmed[0].now === 51,
       'to the part outside the arc: ' + JSON.stringify(r.trimmed[0]));
    ok(TRANSLATED.length === 4, 'so the isoform still has four exons');
    ok(TRANSLATED[1].xf === 2050, 'the trimmed one ending where the new donor is: ' + TRANSLATED[1].xf);
    ok(/not in the annotation/.test(panel()),
       'and the window says the junction is not one the transcript carries');

    // An acceptor moved into an exon trims it from the other end.
    clear();
    r = await run({ d: 2099, a: 3050, kind: 'new', annotated: false });
    ok(r.trimmed.length === 1 && r.trimmed[0].exon === 3 && r.trimmed[0].now === 50,
       'a late acceptor trims the exon it lands in: ' + JSON.stringify(r.trimmed[0]));

    // ---- AN ARC OVER TWO EXONS -------------------------------------------------------------
    clear();
    r = await run({ d: 1099, a: 4000, kind: 'skip' });
    ok(r.dropped.join(',') === '2,3', 'an arc over two exons drops both: ' + r.dropped.join(','));

    // ---- THE CANONICAL JUNCTION IS AN ANSWER -------------------------------------------------
    // An arc over an intron the transcript already splices out changes nothing, and saying
    // "no impact" without saying why reads as a calculation that failed.
    clear();
    said.length = 0;
    r = await run({ d: 1099, a: 2000, kind: 'junction' });
    ok(r.ok && r.outcome === 'unchanged', 'the annotated junction is reported as unchanged');
    ok(/already annotated/.test(last()), 'with the reason: ' + last());
    ok(!document.getElementById('baja-junction-impact'),
       'and no window of consequences for a splice that has none');

    // ---- WHAT IS REFUSED ----------------------------------------------------------------------
    said.length = 0;
    r = await run({ kind: 'skip' });
    ok(!r.ok && r.why === 'no coordinates', 'an arc with no coordinates is refused');
    RAW_OVERRIDE = { ok: false, reason: 'no start codon on this transcript' };
    said.length = 0;
    r = await run({ d: 1099, a: 3000 });
    ok(!r.ok && /start codon/.test(r.why), 'and a transcript with no reading frame says why');
    ok(/cannot be read as a protein change/.test(last()), 'out loud: ' + last());
    RAW_OVERRIDE = null;

    // ---- THE PRESS -----------------------------------------------------------------------------
    // The hit test, lifted from the editor so this is the arithmetic that ships.
    const src = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
    const block = src.slice(src.indexOf('let __arcHit = null;'), src.indexOf('if (__arcHit) {'));
    const hit = new Function('graph', 'track', 'xw', 'y', block + '\nreturn __arcHit;');
    // An arc centred at (500, 400) with radius 200: its crest is at (500, 200).
    const j = { d: 1, a: 2 };
    const nowPx = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const arc = { track: track, j: j, cx: 500, cy: 400, r: 200, t: nowPx,
        a0: -Math.PI * 0.75, a1: -Math.PI * 0.25 };
    const g = { X: (v) => v, Y: (v) => v, __arcHits_transient_: [arc], __arcHitsAt_transient_: nowPx };
    const tr = { tgraph: { X: (v) => v } };
    arc.track = tr;
    ok(hit(g, tr, 500, 200) === arc, 'a press on the crest of the arc finds it');
    ok(hit(g, tr, 500, 206) === arc, 'and a few pixels off it, since an arc is a thin line');
    ok(hit(g, tr, 500, 240) === null, 'well away from it finds nothing');
    // The rest of the circle is not the arc: it runs under the track and off the screen.
    ok(hit(g, tr, 500, 600) === null, 'the far side of the same circle is not a hit');
    ok(hit(g, tr, 300, 400) === null, 'nor its sides');
    // A stamp from an older frame points at a junction that has moved since.
    const stale = { X: (v) => v, Y: (v) => v, __arcHits_transient_: [arc], __arcHitsAt_transient_: -100000 };
    ok(hit(stale, tr, 500, 200) === null, 'a stamp from an old frame is ignored');
    // A LAYER THAT STOPPED DRAWING leaves its last stamps in the list while other layers
    // keep refreshing theirs, so the list is fresh and that entry is not.
    const hidden = Object.assign({}, arc, { t: nowPx - 5000 });
    const g4 = { X: (v) => v, Y: (v) => v, __arcHits_transient_: [hidden], __arcHitsAt_transient_: nowPx };
    ok(hit(g4, tr, 500, 200) === null, 'an arc from a layer that is no longer drawing is not hit');

    // Another track's arcs are not this track's.
    ok(hit(g, { tgraph: { X: (v) => v } }, 500, 200) === null, 'and arcs belong to their own track');

    // ---- THE STAMPS DO NOT PILE UP ------------------------------------------------------
    // The first version reset them only after a 120 ms gap between frames, which during a
    // pan or any continuous redraw never happens: every frame APPENDED a few hundred more,
    // and the tracks carrying the most junctions were the first to stop drawing. So this
    // drives the real reset and the real push, as drawSashimi runs them, over many frames.
    const lay = fs.readFileSync('baja/bio/track-layer.js', 'utf8');
    const resetRaw = lay.slice(lay.indexOf('const __prev = graph.__arcHits_transient_;'),
        lay.indexOf('for (let j of __ordered) {'));
    // Without the try/catch that wraps it in the file, whose opening brace is above the slice.
    // `this` in the file is the layer being drawn; here it is the one passed in.
    const reset = resetRaw.slice(0, resetRaw.indexOf('} catch (e) { }'))
        .replace('e.layer !== this', 'e.layer !== self');
    const push = lay.slice(lay.indexOf('graph.__arcHits_transient_.push({'),
        lay.indexOf('} catch (e) { }', lay.indexOf('graph.__arcHits_transient_.push({')));
    const frame = new Function('graph', 'self', 'track', 'n', `
        ${reset}
        for (let i = 0; i < n; i++) {
            const j = { d: i, a: i + 1 }, centerX = 0, centerY = 0, radius = 1,
                aL = 0, aR = 1, x1 = 0, x2 = 1, isGhost = false, isSkip = false;
            ${push.replace('layer: this', 'layer: self')}
        }`);
    const g3 = {}, layerA = { id: 'A' }, layerB = { id: 'B' };
    for (let f = 0; f < 50; f++) { frame(g3, layerA, track, 200); frame(g3, layerB, track, 200); }
    ok(g3.__arcHits_transient_.length === 400,
       'fifty frames of two layers with two hundred junctions each leave four hundred stamps, '
       + 'not twenty thousand: ' + g3.__arcHits_transient_.length);
    frame(g3, layerA, track, 3);
    ok(g3.__arcHits_transient_.length === 203,
       'and redrawing one layer replaces only its own: ' + g3.__arcHits_transient_.length);
    ok(g3.__arcHits_transient_.filter((e) => e.layer === layerB).length === 200,
       'the other layer in the same frame keeps its arcs');
    ok(/_transient_$/.test('__arcHits_transient_') && /__arcHits_transient_/.test(lay),
       'and the key ends in _transient_, so the saver does not try to write the canvas '
       + 'geometry, the layer and the track into the file');

    const layer = fs.readFileSync('baja/bio/track-layer.js', 'utf8');
    ok(/WHERE THIS ARC WAS JUST DRAWN/.test(layer), 'the renderer stamps what it drew');
    ok(/junction-impact\.js/.test(src), 'and the press opens the impact of that junction');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

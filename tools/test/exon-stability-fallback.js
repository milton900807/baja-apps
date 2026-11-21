// THE ARCS ARE ON THE TRACK; THE NUMBER SHOULD BE TOO.
//
//     node tools/test/exon-stability-fallback.js
//
// The PSI run scores its exons by numbering the arcs against them -- each arc end has to
// land within a few bases of an exon edge, on one of two numberings -- and on a pair of
// genomic tracks that fit can fail outright. The report then said "PSI ran but matched no
// arcs to the annotated exons", which is true and useless: the arcs are sitting over the
// exons where anyone can see them.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Five exons, 300 apart, 150 long.
const mkTrack = () => ({
    name: 'DNM3', xi: 0, xf: 3000, track_layers: [],
    annotations: [1, 2, 3, 4, 5].map((i) => ({ type: 'Exon', index: i, xi: i * 500, xf: i * 500 + 150 }))
});

(async () => {
    const stab = (t) => load('baja/bio/splicing/exon-stability.js', t);

    // ---- the scored rows are the answer whenever they are there -------------------------
    const a = mkTrack();
    a.track_layers.push({ magnitudeMode: 'psi', magMax: 1,
        exonStability: [{ exon: 2, lo: 1000, hi: 1150, psi: 0.42, word: 'unstable', rank: 0.3 }],
        junctions: [] });
    let rows = await stab(a);
    ok(rows.length === 1 && rows[0].psi === 0.42 && rows[0].from === 'scored',
       'the scored rows are handed straight back: ' + JSON.stringify(rows));
    ok(rows[0].rank === 0.3, 'with everything the run put on them, not a recomputation');

    // ---- and when they are missing, the arcs still say it -------------------------------
    const b = mkTrack();
    b.track_layers.push({ magnitudeMode: 'psi', magMax: 1, junctions: [
        // exon 2 (1000-1150) jumped clean over in 30% of transcripts
        { d: 650, a: 1500, mag: 0.3, kind: 'skip' },
        // and spliced in, on its edges
        { d: 650, a: 1000, mag: 0.7, kind: 'junction' },
        { d: 1150, a: 1500, mag: 0.7, kind: 'junction' },
        // exon 3 (1500-1650) only ever spliced in
        { d: 1650, a: 2000, mag: 1, kind: 'junction' }
    ] });
    rows = await stab(b);
    const at = (n) => rows.find((r) => r.exon === n);
    ok(rows.length >= 2, 'the arcs alone produce rows: ' + JSON.stringify(rows.map((r) => r.exon)));
    ok(at(2) && Math.abs(at(2).psi - 0.7) < 1e-9 && at(2).from === 'arcs',
       'an exon jumped over in 30% is 70% stable: ' + JSON.stringify(at(2)));
    ok(at(3) && at(3).psi === 1 && at(3).word === 'constitutive',
       'and one nothing jumps over is constitutive: ' + JSON.stringify(at(3)));
    ok(at(2).word === 'variable' || at(2).word === 'unstable',
       'worded the same way the scored rows are worded: ' + at(2).word);

    // AN EXON NO ARC GOES NEAR is not a constitutive exon, it is one nothing was said
    // about. Exon 5 (2500-2650) has no arc within reach of it; exons 1 and 4 are each
    // touched by an arc END, which is this exon being spliced in and is a real answer.
    ok(!at(5), 'an exon no arc touches gets no row at all: ' + JSON.stringify(rows.map((r) => r.exon)));
    ok(at(1) && at(1).psi === 1 && at(4) && at(4).psi === 1,
       'while an arc landing on an edge means that exon is in: '
       + JSON.stringify([at(1) && at(1).psi, at(4) && at(4).psi]));

    // A measurement outranks the arcs, as it does on the canvas.
    const c = mkTrack();
    c.track_layers.push({ magnitudeMode: 'psi', magMax: 1,
        measuredPsi: [{ xi: 1000, xf: 1150, psi: 0.1, gene: 'SMN2' }],
        junctions: [{ d: 650, a: 1500, mag: 0.3, kind: 'skip' }] });
    rows = await stab(c);
    const m2 = rows.find((r) => r.exon === 2);
    ok(m2 && m2.psi === 0.1 && m2.from === 'measured' && !!m2.measured,
       'a measured inclusion wins over the arcs: ' + JSON.stringify(m2));

    // A track with no PSI layer has nothing to say, and says nothing.
    ok((await stab(mkTrack())).length === 0, 'no PSI layer, no rows');
    const d = mkTrack();
    d.track_layers.push({ magnitudeMode: 'psi', magMax: 1, junctions: [] });
    ok((await stab(d)).length === 0, 'a PSI layer with no arcs invents nothing');

    // ---- the picture says which reading it is -------------------------------------------
    await load('baja/bio/compare-view.js', {
        title: 'T', summary: 's', a: { name: 'A', x1: 0, x2: 100 }, b: { name: 'B', x1: 0, x2: 100 },
        blocks: [{ n: 1, label: 'e1', identity: 0.9, a: { x1: 10, x2: 20, stab: { pct: 70, word: 'stable', from: 'arcs' } },
                   b: { x1: 30, x2: 40 } }],
        unmatched: [], rows: [['a', 'b']], stability: { a: true, b: false, tried: true, from: 'arcs' }
    });
    const txt = document.getElementById('baja-compare-view').textContent;
    ok(/Read off the splice arcs by position/.test(txt),
       'the weaker reading is named as what it is: ' + txt.slice(txt.indexOf('second row'), txt.indexOf('second row') + 260));
    ok(/no weighting or variant effect/.test(txt), 'and what it is missing is said');
    try { document.getElementById('baja-compare-view').querySelector('button[data-id="close"]')
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

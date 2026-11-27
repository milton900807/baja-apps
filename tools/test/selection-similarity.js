// WHERE ELSE ON THIS TRACK DOES THE SELECTED STRETCH OCCUR?
//
//     node tools/test/selection-similarity.js
//
// The selection is laid base against base over every other offset on the track, both
// strands, and what passes the threshold is drawn and labelled. The arithmetic is the
// whole feature, so this checks it against sequence built to a known answer: a perfect
// copy, a copy with a counted number of mismatches, an inverted copy, and a stretch that
// is only background.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');
global.window = { env: { apiUrl: '' } };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// Deterministic background with no structure of its own, so every hit below is one the
// test put there.
const bg = (n, seed) => {
    let x = (seed * 2654435761) >>> 0, s = '';
    while (s.length < n) { x = (1103515245 * x + 12345) >>> 0; s += 'ACGT'[(x >>> 16) & 3]; }
    return s.slice(0, n);
};
const rc = (s) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
const mutate = (s, k) => {           // k mismatches, evenly spread
    const a = s.split('');
    for (let i = 0; i < k; i++) {
        const at = Math.floor(i * (s.length / k));
        a[at] = ({ A: 'C', C: 'A', G: 'T', T: 'G' })[a[at]] || 'A';
    }
    return a.join('');
};

const BASE = 1000;
const Q = bg(100, 7);                                  // the selection, 100 nt
const PERFECT = Q;                                     // 100%
const NEAR = mutate(Q, 10);                            // 90%
const HALFISH = mutate(Q, 48);                         // 52%
const WEAK = mutate(Q, 70);                            // 30%, must not appear
const INV = rc(Q);                                     // an inverted copy

//  [0        ) selection      [400 perfect) [700 near) [1000 halfish) [1300 weak) [1600 inv)
const SEQ = Q + bg(300, 1) + PERFECT + bg(200, 2) + NEAR + bg(200, 3)
    + HALFISH + bg(200, 4) + WEAK + bg(200, 5) + INV + bg(200, 6);

const mkTrack = () => ({
    name: 'KRAS', xi: BASE, xf: BASE + SEQ.length - 1, strand: 1, sequence: SEQ,
    annotations: [{ type: 'Exon', name: 'exon 4', xi: BASE + 400, xf: BASE + 520 }],
    track_layers: [], addLayer(l) { this.track_layers.push(l); }
});
const run = async (track, range, opts) => {
    const said = [];
    const g = { track: [track], setResultMessage: (m) => said.push(m), wake: () => { } };
    const r = await load('baja/bio/compare/selection-similarity.js', g, track, range, opts || {});
    return { r: r, said: said.join(' | '), layer: track.track_layers[track.track_layers.length - 1] };
};
const at = (hits, pos) => hits.filter((h) => Math.abs(h.start - (BASE + pos)) <= 2)[0];

(async () => {
    const t = mkTrack();
    const out = await run(t, { start: BASE, end: BASE + 100 }, { min: 0.5 });
    ok(out.r.ok, 'it runs: ' + (out.r.reason || ''));
    const hits = out.r.hits;

    // ---- the arithmetic ------------------------------------------------------------------
    const perfect = at(hits, 400), near = at(hits, 700), half = at(hits, 1000);
    ok(perfect && perfect.identity === 1, 'a perfect copy reads 100%: ' + (perfect && perfect.identity));
    ok(near && Math.round(near.identity * 100) === 90, 'ten mismatches in a hundred read 90%: '
       + (near && Math.round(near.identity * 100)));
    ok(half && Math.round(half.identity * 100) === 52, 'and forty-eight read 52%: '
       + (half && Math.round(half.identity * 100)));
    ok(!at(hits, 1300), 'a stretch below the threshold is not drawn');

    // AN INVERTED COPY IS A COPY, and is marked rather than listed beside the forward ones.
    const inv = at(hits, 1600);
    ok(inv && inv.rc === true, 'the reverse-complement copy is found and marked: ' + JSON.stringify(inv || {}));
    ok(perfect.rc === false, 'while a forward hit is not');

    // THE SELECTION ITSELF IS NOT A HIT. It matches itself at 100% and would head the list.
    ok(!at(hits, 0), 'the selection is not reported as a match to itself');
    ok(out.r.anchor.start === BASE, 'it is the anchor instead');

    // ---- the layer ------------------------------------------------------------------------
    const L = out.layer;
    ok(!!L && L.intervals.length === hits.length, 'one band per place: ' + L.intervals.length);
    const band = L.intervals.filter((iv) => iv.x1 === BASE + 400)[0];
    ok(/^100%/.test('' + band.t), 'labelled with the similarity: ' + band.t);
    ok(/exon 4/.test('' + band.t), 'and with what it lands in, so the number has somewhere to be: ' + band.t);
    ok(/ rc/.test('' + L.intervals.filter((iv) => iv.x1 === BASE + 1600)[0].t), 'an inverted band says rc');
    ok(L.intervals.filter((iv) => iv.x1 === BASE + 400)[0].color
       !== L.intervals.filter((iv) => iv.x1 === BASE + 1000)[0].color,
       'colour runs with identity, so the layer sorts itself before the labels are read');
    ok(L.pop === true, 'and the layer is raised off the track');

    // ---- NON-MAXIMUM SUPPRESSION ------------------------------------------------------------
    // A good match is good at the offsets either side of it too. Without this a single copy
    // arrives as fifty bands one base apart and the layer cannot be read.
    ok(hits.filter((h) => Math.abs(h.start - (BASE + 400)) < 50).length === 1,
       'one copy is one band, not a run of them');

    // ---- what it says it is NOT --------------------------------------------------------------
    ok(/UNGAPPED/.test(L.decor.help.note), 'the help says the comparison is ungapped');
    ok(/insertion or a deletion reads as two shorter matches/.test(L.decor.help.note.replace(/\s+/g, ' ')),
       'and what that costs: a copy with an indel is two shorter matches, not one');
    ok(/ungapped/.test(out.said), 'the closing line says it too');

    // ---- the refusals ---------------------------------------------------------------------
    const tiny = await run(mkTrack(), { start: BASE, end: BASE + 5 });
    ok(/at least 8/.test(tiny.r.reason || ''), 'too short to be worth comparing: ' + (tiny.r.reason || ''));
    const huge = await run(mkTrack(), { start: BASE, end: BASE + SEQ.length - 10 });
    ok(/not enough left to compare/.test(huge.r.reason || ''), 'and too long: ' + (huge.r.reason || ''));
    const empty = mkTrack(); empty.sequence = '';
    const none = await run(empty, { start: BASE, end: BASE + 100 });
    ok(/no sequence loaded/.test(none.r.reason || ''), 'a track with no sequence is refused');

    // Nothing above the threshold is an answer, not an empty layer.
    const lonely = mkTrack(); lonely.sequence = Q + bg(2000, 11);
    lonely.xf = lonely.xi + lonely.sequence.length - 1;
    const quiet = await run(lonely, { start: BASE, end: BASE + 100 }, { min: 0.8 });
    ok(quiet.r.ok && quiet.r.hits.length === 0, 'no match is a result');
    ok(/Nothing on KRAS matches/.test(quiet.said), 'said plainly: ' + quiet.said.slice(0, 60));
    ok(lonely.track_layers.length === 0, 'and no empty layer is left on the track');

    // ---- AGAINST ANOTHER TRACK ---------------------------------------------------------
    // The question people actually have with two genes on the canvas: does my site exist
    // over there. The hits are coordinates on the track that was SCANNED, so that is where
    // the layer goes and whose annotations label it.
    const home = mkTrack();
    const other = {
        name: 'KRAS_paralogue', xi: 9000, xf: 9000 + (bg(500, 21) + PERFECT + bg(500, 22)).length - 1,
        strand: 1, sequence: bg(500, 21) + PERFECT + bg(500, 22),
        annotations: [{ type: 'Exon', name: 'exon 2', xi: 9500, xf: 9600 }],
        track_layers: [], addLayer(l) { this.track_layers.push(l); }
    };
    const said2 = [];
    const g2 = { track: [home, other], setResultMessage: (m) => said2.push(m), wake: () => { } };
    const across = await load('baja/bio/compare/selection-similarity.js', g2, home,
        { start: BASE, end: BASE + 100 }, { min: 0.5, against: other });
    ok(across.ok && across.sameTrack === false, 'it runs against another track');
    ok(other.track_layers.length === 1 && home.track_layers.length === 0,
       'and the layer lands on the track that was scanned, not the one selected on');
    ok(across.hits.some((h) => h.start === 9500 && h.identity === 1),
       'the copy over there is found at its own coordinates: ' + JSON.stringify(across.hits[0] || {}));
    ok(/exon 2/.test('' + other.track_layers[0].intervals[0].t),
       'labelled with the scanned track\u2019s annotation: ' + other.track_layers[0].intervals[0].t);
    ok(/KRAS/.test(other.track_layers[0].decor.help.title)
       && /KRAS/.test(other.track_layers[0].decor.help.note),
       'and the layer says where the selection came from: ' + other.track_layers[0].decor.help.title);
    ok(/KRAS_paralogue: /.test(said2.join(' ')) && /of KRAS /.test(said2.join(' ')),
       'the message names both: ' + said2.join(' ').slice(0, 80));

    // ON ANOTHER TRACK THERE IS NOTHING TO EXCLUDE. The selection's own offsets belong to a
    // different gene over there, and blanking them would hide a real match.
    const twin = { name: 'twin', xi: BASE, xf: BASE + SEQ.length - 1, strand: 1, sequence: SEQ,
        annotations: [], track_layers: [], addLayer(l) { this.track_layers.push(l); } };
    const g3 = { track: [mkTrack(), twin], setResultMessage: () => { }, wake: () => { } };
    const onTwin = await load('baja/bio/compare/selection-similarity.js', g3, g3.track[0],
        { start: BASE, end: BASE + 100 }, { min: 0.5, against: twin });
    ok(onTwin.hits.some((h) => h.start === BASE && h.identity === 1),
       'the stretch at the same coordinates on the other track IS a hit, at 100%');

    // A selection longer than the whole of the other track is refused for what it is.
    const shortTrack = { name: 'stub', xi: 0, xf: 49, strand: 1, sequence: bg(50, 31),
        annotations: [], track_layers: [], addLayer(l) { this.track_layers.push(l); } };
    const g4 = { track: [mkTrack(), shortTrack], setResultMessage: () => { }, wake: () => { } };
    const tooBig = await load('baja/bio/compare/selection-similarity.js', g4, g4.track[0],
        { start: BASE, end: BASE + 100 }, { min: 0.5, against: shortTrack });
    ok(/nowhere on it long enough/.test(tooBig.reason || ''), 'with the reason: ' + (tooBig.reason || ''));

    // ---- the menu offers it ------------------------------------------------------------------
    const menu = fs.readFileSync('baja/manchester/menu/selected-sequence-menu.js', 'utf8');
    ok(/Compare across a track \(\\u226550%\)/.test(menu), 'the selected-sequence menu offers it');
    ok(/compareAcross\(0\.7\)/.test(menu),
       'at a second threshold, because 50% on a 20-mer and 50% on a 500-mer are different questions');
    // It asks which track only when there IS another one, so the common case stays one press.
    ok(/if \(!others\.length\) \{\n\s+return exec\('baja\/bio\/compare\/selection-similarity\.js'/.test(menu),
       'with one track open it runs without asking');
    ok(/\(itself\)/.test(menu), 'and the track selected on is one of the choices');
    ok(/against: pick/.test(menu), 'the chosen track is what gets scanned');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

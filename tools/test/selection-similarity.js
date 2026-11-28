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
    // NO TEXT ON THE BANDS. One label per match overprinted every other into a black
    // smear across the track and hid the track under it. The numbers are in the help rows
    // and on the line that joins each match to where it came from, so nothing is lost.
    ok(L.intervals.every((iv) => !('' + (iv.t || '')).trim()), 'the bands carry no text');
    const helpRows = (L.decor.help.rows || []).map((r) => r.join(' '));
    ok(helpRows.some((r) => /^100%/.test(r)), 'the identity is in the rows instead: '
       + (helpRows[0] || ''));
    ok(helpRows.some((r) => /exon 4/.test(r)),
       'with what it lands in, so the number still has somewhere to be');
    ok(helpRows.some((r) => /reverse complement/.test(r)), 'and an inverted match says so');
    ok(/bands carry no text/.test('' + L.decor.help.note),
       'and the layer says where the numbers went');
    // Asked for, they come back: nothing is removed from the layer, only from the picture.
    const withText = await run(mkTrack(), { start: BASE, end: BASE + 100 },
        { min: 0.5, bandLabels: true });
    ok(withText.layer.intervals.some((iv) => /^100%/.test('' + iv.t)),
       'bandLabels: true puts them back on the bands');
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
    const g2 = { track: [home, other], setResultMessage: (m) => said2.push(m), wake: () => { },
        X: (v) => v, Y: (v) => v };
    const across = await load('baja/bio/compare/selection-similarity.js', g2, home,
        { start: BASE, end: BASE + 100 }, { min: 0.5, against: other });
    ok(across.ok && across.sameTrack === false, 'it runs against another track');
    ok(other.track_layers.length === 1, 'the matches land on the track that was scanned');
    // THE OTHER END IS MARKED TOO. The selection mark is cleared the moment the user clicks
    // anywhere, and then a layer of percentages on the far track has nothing to be
    // percentages OF.
    ok(home.track_layers.length === 1 && /_SIMFROM_/.test(home.track_layers[0].name),
       'and the stretch that was compared is marked where it came from: '
       + (home.track_layers[0] || {}).name);
    ok(/compared \u00b7 529|compared/.test('' + home.track_layers[0].intervals[0].t)
       && /match/.test('' + home.track_layers[0].intervals[0].t),
       'saying what it is and how many places took it: ' + home.track_layers[0].intervals[0].t);

    // AND THE TWO ENDS ARE JOINED. A match on another track is a statement about a pair of
    // places, and a layer can only draw one of them.
    ok((g2.__linkPainters || []).length === 1, 'a line is drawn between the two tracks');
    const painter = g2.__linkPainters[0];
    ok(painter.links.length === across.hits.length, 'one per match: ' + painter.links.length);
    ok(painter.links[0].from.track === home && painter.links[0].to.track === other,
       'from the selection to the match');
    ok(/100%/.test(painter.links[0].label), 'labelled with the identity: ' + painter.links[0].label);
    ok(across.hits.some((h) => h.start === 9500 && h.identity === 1),
       'the copy over there is found at its own coordinates: ' + JSON.stringify(across.hits[0] || {}));
    ok((other.track_layers[0].decor.help.rows || []).some((r) => /exon 2/.test(r.join(' '))),
       'the scanned track\u2019s annotation is in the rows under the layer');
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


    // ---- A WINDOW SLID ALONG THE SELECTION ---------------------------------------------
    // THE CASE THE BLOCK COMPARISON CANNOT ANSWER. A long selection carrying one short
    // conserved patch agrees with the copy of that patch at the patch's length over the
    // selection's -- 60 nt in 400 is 15% -- so as one block it falls under every threshold
    // and comes back as nothing. Run in a window the same patch is a 100% hit. Both halves
    // are checked here, because the feature is the difference between them.
    const SB = 5000;
    const SEL = bg(400, 77);                              // the selection, 400 nt
    const PATCH = SEL.slice(120, 180);                    // 60 nt of it, and only that
    const FAR = bg(300, 78) + PATCH + bg(300, 79);        // the other track: patch at 300
    const mkSel = () => ({
        name: 'UTRLONG', xi: SB, xf: SB + SEL.length - 1, strand: 1, sequence: SEL,
        annotations: [], track_layers: [], addLayer(l) { this.track_layers.push(l); }
    });
    const mkFar = () => ({
        name: 'OTHER', xi: 0, xf: FAR.length - 1, strand: 1, sequence: FAR,
        annotations: [], track_layers: [], addLayer(l) { this.track_layers.push(l); }
    });

    const sel1 = mkSel(), far1 = mkFar();
    const gW1 = { track: [sel1, far1], setResultMessage: () => { }, wake: () => { } };
    const blockRun = await load('baja/bio/compare/selection-similarity.js', gW1, sel1,
        { start: SB, end: SB + 400 }, { min: 0.5, against: far1 });
    ok(blockRun.ok && blockRun.hits.length === 0 && blockRun.window === null,
       'the whole selection over the other track finds the conserved patch nowhere: '
       + blockRun.hits.length + ' hits');

    const sel2 = mkSel(), far2 = mkFar();
    const gW2 = { track: [sel2, far2], setResultMessage: () => { }, wake: () => { } };
    const winRun = await load('baja/bio/compare/selection-similarity.js', gW2, sel2,
        { start: SB, end: SB + 400 }, { min: 0.5, against: far2, window: 60 });
    const hit = (winRun.hits || []).filter((h) => h.identity === 1)[0];
    ok(!!hit, 'in 60 nt windows the same comparison finds it: '
       + (winRun.hits || []).length + ' hits, best '
       + Math.round(Math.max(0, ...(winRun.hits || []).map((h) => h.identity)) * 100) + '%');
    ok(!!hit && hit.start === 300 && hit.end === 359 && hit.length === 60,
       'at the patch, in the scanned track’s own coordinates: '
       + (hit ? (hit.start + '–' + hit.end) : 'no hit'));
    // WHICH PART OF THE SELECTION MATCHED is the thing a window run knows and a block run
    // does not, so every hit carries it and the label says it.
    ok(!!hit && hit.srcStart === SB + 120 && hit.srcEnd === SB + 179,
       'and says which 60 nt of the selection matched: '
       + (hit ? (hit.srcStart + '–' + hit.srcEnd) : 'no hit'));
    ok(winRun.window === 60 && winRun.windowStep === 30 && winRun.windows === 13,
       'slid in steps of half the window: ' + winRun.windows + ' windows of '
       + winRun.window + ' at ' + winRun.windowStep);
    const nAtPatch = (winRun.hits || []).filter((h) => Math.abs(h.start - 300) < 60).length;
    ok(nAtPatch === 1, 'the windows either side of it land in the same place and collapse to '
       + 'the best one: ' + nAtPatch + ' band there');
    const simLayer = far2.track_layers[far2.track_layers.length - 1];
    ok(/W60/.test(simLayer.name || ''), 'the layer name says the window it was run in: ' + simLayer.name);
    ok((simLayer.decor.help.rows || []).some((r) => new RegExp('' + (SB + 120)).test(r.join(' '))),
       'the part of the selection a band came from is in the rows under the layer');
    // The band on the track the selection came from is the WINDOW that matched, not the
    // whole selection: the parts with no band are the parts that matched nothing.
    const fromLayer = sel2.track_layers[sel2.track_layers.length - 1];
    const fiv = fromLayer.intervals.filter((iv) => iv.x1 === SB + 120)[0];
    ok(!!fiv && fiv.x2 === SB + 179
       && fromLayer.intervals.every((iv) => (iv.x2 - iv.x1 + 1) === 60),
       'the bands on the selection\u2019s own track are the windows that matched, not the whole selection: ' + fromLayer.intervals.map((iv) => iv.x1 + '\u2013' + iv.x2).join(', '));

    // A window at least as long as the selection is the block case under another name, not
    // an error and not a one-window scan reported as something else.
    const sel3 = mkSel(), far3 = mkFar();
    const gW3 = { track: [sel3, far3], setResultMessage: () => { }, wake: () => { } };
    const tooWide = await load('baja/bio/compare/selection-similarity.js', gW3, sel3,
        { start: SB, end: SB + 400 }, { min: 0.5, against: far3, window: 4000 });
    ok(tooWide.ok && tooWide.window === null && tooWide.hits.length === 0,
       'a window longer than the selection runs as the whole selection');

    // ON ITS OWN TRACK a window must still not match the selection it came from, whichever
    // part of it: every window lies inside the selection, and without the exclusion the
    // layer would be a row of 100% bands on top of the selection itself.
    const selfSeq = SEL + bg(400, 81) + PATCH + bg(200, 82);
    const selfTrack = { name: 'SELF', xi: SB, xf: SB + selfSeq.length - 1, strand: 1,
        sequence: selfSeq, annotations: [], track_layers: [],
        addLayer(l) { this.track_layers.push(l); } };
    const gW4 = { track: [selfTrack], setResultMessage: () => { }, wake: () => { } };
    const onSelf = await load('baja/bio/compare/selection-similarity.js', gW4, selfTrack,
        { start: SB, end: SB + 400 }, { min: 0.5, window: 60 });
    ok((onSelf.hits || []).every((h) =>
        (Math.min(h.end + 1, SB + 400) - Math.max(h.start, SB)) <= h.length / 2),
       'no window is reported as a match on the selection it came from');
    ok((onSelf.hits || []).some((h) => h.identity === 1 && h.start === SB + 800),
       'and the copy of the patch further down the same track is found at 100%');

    // ---- the menu offers it ------------------------------------------------------------------
    const menu = fs.readFileSync('baja/manchester/menu/selected-sequence-menu.js', 'utf8');
    ok(/go\('Compare across a track\.\.\.'/.test(menu), 'the selected-sequence menu offers it');
    ok(/compareAcross\(null\)/.test(menu),
       'with the threshold asked for rather than baked into two menu entries');
    // It asks which track only when there IS another one, so the common case stays one press.
    ok(/if \(!others\.length\) \{\n\s+const m0 = \(min == null\) \? await pickThreshold\(\)/.test(menu),
       'with one track open it does not ask which track');
    // THE THRESHOLD IS THE RESULT. It was two menu entries, 50% and 70%: two of the
    // thresholds somebody might want and no way to say any other.
    ok(/How close counts as a match/.test(menu) && /Another threshold/.test(menu),
       'the threshold is asked for, with a way to type one of your own');
    ok(/is not a threshold to compare at/.test(menu),
       'and a number outside 30 to 100 is refused rather than rounded');
    // THIS STRAND, UNLESS ASKED. Taking the reverse complement every time doubled the
    // bands and the lines with an answer to a question almost nobody asked.
    ok(/bothStrands: !!O2\.bothStrands/.test(menu), 'the strand choice is passed through');
    ok(/Compare across a track, both strands/.test(menu),
       'and both strands is an entry of its own, for an inverted repeat');
    ok(/The whole selection/.test(menu) && /nt windows/.test(menu),
       'and the window question has the whole selection as its first answer');
    // THE SIZES PEOPLE MEAN, and a box for the one they mean that is not listed.
    const sizes = (menu.match(/const sizes = \[([^\]]*)\]/) || [])[1] || '';
    const nums = sizes.split(',').map((x) => +x.trim()).filter((x) => x);
    ok(nums.length >= 12 && Math.min(...nums) === 8 && Math.max(...nums) >= 1000,
       'the sizes run from a seed match to a conserved element: ' + nums.join(', '));
    ok(nums.every((x, i) => i === 0 || x < nums[i - 1]), 'largest first, as the list reads');
    ok(/Another size\.\.\./.test(menu) && /prompt-text\.js/.test(menu),
       'and a size of your own can be typed');
    ok(/is not a size to /.test(menu) && /same as /.test(menu),
       'a typed window that is too short or longer than the selection is answered rather '
       + 'than quietly rounded');
    ok(/window: win \|\| null/.test(menu), 'the chosen window is what gets run');
    ok(/\(itself\)/.test(menu), 'and the track selected on is one of the choices');
    ok(/against: pick/.test(menu), 'the chosen track is what gets scanned');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

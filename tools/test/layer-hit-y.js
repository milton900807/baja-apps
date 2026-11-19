// A BAR IS HIT WHERE IT WAS PAINTED, NOT WHERE IT SHOULD HAVE BEEN.
//
//     node tools/test/layer-hit-y.js
//
// Clicking anywhere above the track, in the x range of a motif, opened that motif's panel,
// while clicking the bar itself did nothing. The hit test mapped the interval's world y
// through the TRACK's tgraph; a layer draws through its OWN, and the two have different y
// ranges -- the track runs -1.5..1.5 and a layer 0..1. So the test looked for the bar in a
// band that is nowhere near it, and with dozens of motif lanes those wrong bands covered a
// tall stripe above the track.
//
// It also treated the drawn y as the bar's centre when the renderer treats it as an edge.
// Both go away by testing against the rectangle the renderer recorded as it drew.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The hit test, lifted from mouse-over-highlight.js so this exercises the real arithmetic
// rather than a retelling of it.
const src = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
const block = src.slice(src.indexOf('let __slimHit = null;'), src.indexOf('if (__slimHit) {'));
const hit = new Function('graph', 'track', 'xw', 'y', block + '\nreturn __slimHit;');

// Screen mappings: the identity, so a world number IS a pixel and the geometry is readable.
const mkGraph = (reg) => ({ __slimIntervals: reg, X: (v) => v, Y: (v) => v });
// The track's own grid: y runs -1.5..1.5 over 120 px, the shape that caused this.
const trackG = { X: (v) => v, Y: (v) => 300 - (v * 40) };
// The layer's: y runs 0..1 over the same 40 px band just above the baseline.
const layerG = { X: (v) => v, Y: (v) => 300 - (v * 40) - 10 };
const track = { tgraph: trackG };

(() => {
    // One motif bar: world x 1000..1060, lane y 0.14, painted 9 px deep by the layer.
    const topPx = layerG.Y(0.14);              // 284.4
    const iv = { x1: 1000, x2: 1060, y: 0.14, __px: { x: 1000, y: topPx, w: 60, h: 9 } };
    const rec = { elm: 'LIG_SH3_3' };
    const reg = [{ track: track, kind: 'motif', x1: 1000, x2: 1060, y: 0.14, barPx: 9,
        layer: { tgraph: layerG }, iv: iv, rec: rec }];
    const g = mkGraph(reg);

    // ---- on the bar --------------------------------------------------------------------
    ok(hit(g, track, 1030, topPx + 4) === rec, 'the middle of the bar hits it');
    ok(hit(g, track, 1001, topPx) === rec, 'its top edge does');
    ok(hit(g, track, 1059, topPx + 9) === rec, 'and its bottom edge');
    ok(hit(g, track, 1030, topPx - 2) === rec, 'a couple of pixels off is still a hit, since '
       + 'a 9 px bar is a small target');

    // ---- and nowhere else ---------------------------------------------------------------
    ok(hit(g, track, 1030, topPx - 40) === null,
       'forty pixels above the bar is not: that is the bug, where every click in the x range '
       + 'opened a motif');
    ok(hit(g, track, 1030, topPx - 200) === null, 'and neither is two hundred');
    ok(hit(g, track, 1030, topPx + 60) === null, 'nor below it');
    ok(hit(g, track, 900, topPx + 4) === null, 'outside the x range, nothing');

    // The old arithmetic, for the record: through the track's grid this bar's y lands at
    // 294.4 while the renderer drew it at 284.4 -- ten pixels out on a 9 px bar, which is
    // the whole bar, and the error grows with the lane number.
    ok(Math.abs(trackG.Y(0.14) - layerG.Y(0.14)) >= 9,
       'the two grids disagree by more than the height of the bar: '
       + (trackG.Y(0.14) - layerG.Y(0.14)).toFixed(1) + ' px');

    // ---- stacked lanes: the nearest one wins ------------------------------------------------
    const recA = { elm: 'lane0' }, recB = { elm: 'lane1' };
    const yA = layerG.Y(0.14), yB = layerG.Y(0.32);
    const reg2 = [
        { track: track, kind: 'motif', x1: 1000, x2: 1060, y: 0.14, barPx: 9,
          iv: { __px: { x: 1000, y: yA, w: 60, h: 9 } }, rec: recA },
        { track: track, kind: 'motif', x1: 1000, x2: 1060, y: 0.32, barPx: 9,
          iv: { __px: { x: 1000, y: yB, w: 60, h: 9 } }, rec: recB }
    ];
    const g2 = mkGraph(reg2);
    ok(hit(g2, track, 1030, yA + 4) === recA, 'two bars on the same span: the one under the '
       + 'pointer answers, not whichever was registered first');
    ok(hit(g2, track, 1030, yB + 4) === recB, 'and the other one when the pointer is on it');

    // ---- a bar not yet painted falls back, through the LAYER's grid ----------------------------
    const recC = { elm: 'unpainted' };
    const reg3 = [{ track: track, kind: 'motif', x1: 1000, x2: 1060, y: 0.14, barPx: 9,
        layer: { tgraph: layerG }, iv: {}, rec: recC }];
    const g3 = mkGraph(reg3);
    ok(hit(g3, track, 1030, layerG.Y(0.14)) === recC,
       'an interval with no painted rectangle yet is still hit, through the grid it will be '
       + 'drawn with');
    ok(hit(g3, track, 1030, trackG.Y(0.14)) === null,
       'and NOT through the track grid, which is where the old test looked');

    // ---- the renderer is what records it -----------------------------------------------------
    const lay = fs.readFileSync('baja/bio/track-layer.js', 'utf8');
    ok((lay.match(/int\.__px = \{/g) || []).length === 2,
       'both interval-draw loops record it, since that loop exists twice in the file');
    ok(/WHERE THIS BAR ACTUALLY LANDED/.test(lay), 'and say why');
    ok(/return this\.intervals\[this\.intervals\.length - 1\];/.test(lay),
       'addInterval hands the interval back, so a caller holds the bar itself rather than '
       + 'looking it up by x and y, which two bars can share');

    const cdd = fs.readFileSync('baja/bio/protein/cdd-domain-layer.js', 'utf8');
    ok(/layer: p\.layer \|\| null, iv: p\.iv \|\| null/.test(cdd),
       'the domain layer carries the same two things: it had the same bug waiting');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

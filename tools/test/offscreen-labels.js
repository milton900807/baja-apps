// A LABEL BELONGS TO ITS BAR, AND GOES WHERE THE BAR GOES.
//
//     node tools/test/offscreen-labels.js
//
// An interval panned off to the right still had its name drawn, pinned at the edge of the
// view with nothing underneath it: a reader sees "Repressive Element" sitting over a
// stretch of sequence that has no such thing, which is worse than no label at all. The
// grid clamps a coordinate outside the view to the edge, so the screen position cannot
// tell you an interval is gone; the test has to be in the track's own coordinates.
//
// The guard that was supposed to do this read
//     if (screenx > 0 || screenx < W - 100 || screeny > 0 || screeny < H - 100)
// which is true for every x and y there are: below zero satisfies the second clause, above
// it the first. It never rejected anything in its life, which is why this test checks the
// real source rather than a retelling.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/bio/track-layer.js', 'utf8');

// ---- THE GUARD THAT NEVER FIRED IS GONE ------------------------------------------------
ok(!/screenx > 0 \|\| screenx < graph\.grid\.width - 100/.test(src),
   'the guard that was true for every coordinate is gone');

// ---- THE REAL TEST, RUN ------------------------------------------------------------------
// Lifted from the file so this exercises the arithmetic that ships.
const marker = 'const __wlo = this.tgraph.getxmin(), __whi = this.tgraph.getxmax();';
const i = src.indexOf(marker);
ok(i > 0, 'the window test is in the file');
const block = src.slice(i, src.indexOf('} catch (e) { }', i));
const visible = (int, lo, hi) => {
    const self = { tgraph: { getxmin: () => lo, getxmax: () => hi } };
    const f = new Function('int', 'return (function () { ' + block + ' return true; }).call(this);');
    return f.call(self, int);
};

// The view holds 1000..2000 of the track.
const inView = { x1: 1200, x2: 1300 };
const offRight = { x1: 5000, x2: 5100 };
const offLeft = { x1: 10, x2: 90 };
const straddling = { x1: 900, x2: 1100 };
const covering = { x1: 0, x2: 9000 };

ok(visible(inView, 1000, 2000) === true, 'an interval in view keeps its label');
ok(visible(offRight, 1000, 2000) === undefined, 'one panned off to the right loses it');
ok(visible(offLeft, 1000, 2000) === undefined, 'and so does one off to the left');
ok(visible(straddling, 1000, 2000) === true,
   'an interval half in view keeps it: part of the bar is there to carry it');
ok(visible(covering, 1000, 2000) === true, 'and one wider than the view certainly does');
// The edges are inclusive, since an interval that ends exactly at the left edge is still
// a pixel of bar on screen.
ok(visible({ x1: 500, x2: 1000 }, 1000, 2000) === true, 'an interval ending on the edge is in view');
ok(visible({ x1: 2000, x2: 2500 }, 1000, 2000) === true, 'and one starting on it');
ok(visible({ x1: 2001, x2: 2500 }, 1000, 2000) === undefined, 'one base past it is not');

// A grid that cannot say where it is looking must not silently hide every label: the
// label is drawn, as before, and the picture is no worse than it was.
const noWindow = (int) => {
    const self = { tgraph: { getxmin: () => NaN, getxmax: () => NaN } };
    const f = new Function('int', 'return (function () { ' + block + ' return true; }).call(this);');
    return f.call(self, int);
};
ok(noWindow(offRight) === true, 'a grid with no window of its own still draws its labels');

// ---- BOTH RENDERERS ---------------------------------------------------------------------
// track-layer.js carries two copies of this drawing code, one per renderer, and a fix in
// one of them is a fix in half the product.
const count = (src.match(/const __wlo = this\.tgraph\.getxmin\(\)/g) || []).length;
ok(count === 2, 'both copies of the renderer have it: ' + count);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
process.exit(fails ? 1 : 0);

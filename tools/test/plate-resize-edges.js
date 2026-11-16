// WHERE DOES A DRAG RESIZE THE TABLE?
//
//     node tools/test/plate-resize-edges.js
//
// Only the right edge and the bottom edge. It used to be a 60-pixel square centred on the
// bottom-right corner, reaching thirty pixels INSIDE the table along both edges: on a table
// with narrow columns that is most of a column, so working in the last column started a
// resize. The function is taken out of plate.js rather than copied, because the arithmetic
// IS the behaviour.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/plate.js', 'utf8');
const k = src.indexOf('inResize(mouseX, mouseY, pt) {');
let i = src.indexOf('{', k), d = 0, j = i;
for (;; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
const inResize = new Function('mouseX', 'mouseY', 'pt', src.slice(i + 1, j));

// A table 400 wide and 200 tall whose bottom-left corner is at screen (100, 500):
// it occupies x 100..500 and y 300..500.
const plate = {
    grid: { xi: 0, yi: 0, width: 400, height: 200 },
    getHeight: () => 200
};
const pt = { grid: { screenWidth: (w) => w, screenHeight: (h) => h, X: () => 100, Y: () => 500 } };
const hit = (x, y) => inResize.call(plate, x, y, pt);

console.log('the edges resize:');
ok(hit(500, 400), '  the right edge, half way down');
ok(hit(498, 310), '  the right edge near the top');
ok(hit(300, 500), '  the bottom edge, half way across');
ok(hit(500, 500), '  the corner where they meet');
ok(hit(505, 400), '  a few pixels outside the right edge still counts');
ok(hit(300, 505), '  and just below the bottom edge');

console.log('the middle of the table does not:');
ok(!hit(300, 400), '  the centre');
ok(!hit(470, 400), '  THIRTY PIXELS INSIDE THE RIGHT EDGE: the old square caught this');
ok(!hit(300, 475), '  thirty pixels above the bottom edge: so did this');
ok(!hit(475, 475), '  and the inside of the bottom-right corner');
ok(!hit(105, 400), '  the left edge is not a resize');
ok(!hit(300, 305), '  nor is the top edge');
ok(!hit(500, 250), '  nor well above the table, where the invisible handle could land');
// The top END of the right edge is still the right edge: a drag there is a width drag, and
// excluding it would make the edge unusable for its top few pixels. This is deliberate.
ok(hit(500, 300), '  the top of the right edge IS a right-edge grab');
ok(!hit(50, 400), '  outside the table altogether');
ok(!hit(300, 600), '  well below it');

// ---- DRAGGING A COLUMN BOUNDARY CHANGES THE COLUMNS, NOT THE TABLE -------------------
//
// The width used to come from nowhere: the dragged column grew and the table grew with it,
// so a gesture about one column changed the size of the thing it sits in and pushed it into
// its neighbours on a laid-out canvas. It now comes out of the next column, so the widths
// always add up to what they did before.
//
// The arithmetic is lifted out of plate.js rather than restated here, because the arithmetic
// is the behaviour.
(() => {
    const k = src.indexOf('const apply = (x) => {', src.indexOf('__colResizeStart(pt, col, sx) {'));
    let i = src.indexOf('{', k + 20), d = 0, j = i;
    for (;; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    const applyBody = src.slice(i + 1, j);

    // Everything apply() touches, stubbed only where it reaches outside the arithmetic.
    const makeApply = (px0, col, sx) => {
        const n = px0.length;
        const plate = {
            column_widths: [], wells: [], __colFontCache: null,
            setWidth(w) { this.__width = w; },
            grid: { rescale() { } }
        };
        const TOTAL = px0.reduce((a, c) => a + c, 0);
        const fn = new Function('x', 'px0', 'col', 'sx', 'n', 'MIN_PX', 'TOTAL', 'worldPerPx',
            'pushed', 'pushHistory', 'HM', applyBody);
        return {
            plate,
            at: (x) => { fn.call(plate, x, px0, col, sx, n, 24, TOTAL, 1, true, () => {}, () => {}); return plate; },
            TOTAL
        };
    };

    console.log('dragging an inner column boundary:');
    let a = makeApply([100, 100, 100], 0, 500);
    let p = a.at(540);                       // 40px to the right
    let widths = p.column_widths.map((v) => v / 3 * a.TOTAL);
    ok(Math.abs(widths[0] - 140) < 0.01, '  the dragged column grows by the drag: ' + widths[0].toFixed(1));
    ok(Math.abs(widths[1] - 60) < 0.01, '  THE NEXT COLUMN GIVES UP EXACTLY THAT: ' + widths[1].toFixed(1));
    ok(Math.abs(widths[2] - 100) < 0.01, '  and the rest are untouched');
    ok(p.__width === undefined, '  THE TABLE IS NOT RESIZED');

    a = makeApply([100, 100, 100], 0, 500);
    p = a.at(460);                           // 40px to the left
    widths = p.column_widths.map((v) => v / 3 * a.TOTAL);
    ok(Math.abs(widths[0] - 60) < 0.01 && Math.abs(widths[1] - 140) < 0.01,
       '  dragging the other way gives the width back');
    ok(p.__width === undefined, '  still no table resize');

    // the neighbour cannot be squeezed past the minimum, and the sum still holds
    a = makeApply([100, 40, 100], 0, 500);
    p = a.at(5000);
    widths = p.column_widths.map((v) => v / 3 * a.TOTAL);
    ok(Math.abs(widths[1] - 24) < 0.01, '  the next column stops at the minimum: ' + widths[1].toFixed(1));
    ok(Math.abs(widths[0] - 116) < 0.01, '  and the dragged one only gets what was actually given');
    ok(Math.abs(widths.reduce((s, v) => s + v, 0) - a.TOTAL) < 0.01,
       '  THE WIDTHS STILL ADD UP: ' + widths.reduce((s, v) => s + v, 0).toFixed(1));
    ok(p.__width === undefined, '  and the table is still its original width');
})();

// The last column's right edge is not an inner boundary: it is the table's right edge.
ok(/for \(let i = 0; i < n - 1; i\+\+\)/.test(src),
   'the last column\'s right edge is left to the table resize, not claimed as a column edge');

console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
process.exit(fails ? 1 : 0);

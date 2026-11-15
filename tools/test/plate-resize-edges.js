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

console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
process.exit(fails ? 1 : 0);

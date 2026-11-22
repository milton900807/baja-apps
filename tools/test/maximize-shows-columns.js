// MAXIMIZING A TABLE SHOWS ALL OF ITS COLUMNS WHEN THEY FIT.
//
//     node tools/test/maximize-shows-columns.js
//
// A two-column table of ten rows, maximized, came out with its first column across the whole
// window and its second off the right-hand edge. The arithmetic that decides the maximized
// view is lifted out of plate-track.js and run with the numbers of such a table.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
const a = src.indexOf('const MAX_CELL_PX = 40;', src.indexOf('maximizeObject(obj) {'));
const endMark = 'hscroll = xRange < width * (1 + 2 * sideFrac) - 1e-9;';
const b = src.indexOf(endMark, a);
ok(a > 0 && b > a, 'the fit arithmetic is where it is expected');
const body = src.slice(a, b + endMark.length) + '\n}\nreturn { xRange, yRange, hscroll, tlFill };';
const fit = (o) => {
    const width = o.width, height = o.rows * o.rowH;
    const obj = { grid: { xmin: 0, xmax: o.cols, ymin: 0, ymax: o.rows, width: width, height: height }, wells: Array.from({ length: o.cols }, () => new Array(o.rows)) };
    const bnd = { x0: 0, x1: width, yTop: height, yBot: 0 };
    const sideFrac = 0.04;
    let xRange = width * (1 + 2 * sideFrac), yRange = xRange * (o.ch / o.cw);
    const f = new Function('obj', 'b', 'cw', 'ch', 'HEADER', 'width', 'sideFrac', 'isDoc', 'xRange', 'yRange', body);
    const r = f.call({ __maxBottomPx: () => 70 }, obj, bnd, o.cw, o.ch, 110, width, sideFrac, false, xRange, yRange);
    const pxPerWorldX = o.cw / r.xRange, pxPerWorldY = o.ch / r.yRange;
    return Object.assign(r, { tablePx: width * pxPerWorldX, rowPx: o.rowH * pxPerWorldY, colPx: (width / o.cols) * pxPerWorldX });
};

// ---- the table in the report: two wide columns, ten short rows, a window 1550 x 950 ----------
// Wide for its row height is what did it: at the 40px row cap such a table is wider than the
// window, and the old rule left it there to be scrolled.
let r = fit({ cols: 2, rows: 11, width: 2400, rowH: 20, cw: 1550, ch: 950 });
ok(r.hscroll === false, 'a two-column table does not need scrolling sideways: hscroll ' + r.hscroll);
ok(r.tablePx <= 1550 && r.tablePx > 1550 * 0.9, 'the whole table is inside the window, and fills its width: ' + Math.round(r.tablePx) + 'px of 1550');
ok(Math.round(r.colPx) > 600, 'so both columns are on screen, each ' + Math.round(r.colPx) + 'px wide');
r = fit({ cols: 2, rows: 11, width: 700, rowH: 30, cw: 1550, ch: 950 });
ok(!r.hscroll && r.tablePx <= 1550 && r.tablePx > 1550 * 0.9, 'a narrower two-column table fills the width too, as it did before');
r = fit({ cols: 2, rows: 11, width: 2400, rowH: 20, cw: 1550, ch: 950 });
ok(r.rowPx <= 40.01 && r.rowPx > 25, 'and the rows keep a readable height, at or under the 40px cap: ' + r.rowPx.toFixed(1) + 'px');
ok(r.tlFill === true, 'with the two axes set independently, and flagged so the next frame does not undo it');

// ---- other shapes ------------------------------------------------------------------------------
r = fit({ cols: 2, rows: 3, width: 700, rowH: 30, cw: 1550, ch: 950 });
ok(!r.hscroll && r.tablePx <= 1550 && r.rowPx <= 40.01, 'three rows: still both columns, rows not blown up past the cap: ' + r.rowPx.toFixed(1) + 'px');
r = fit({ cols: 2, rows: 200, width: 700, rowH: 30, cw: 1550, ch: 950 });
ok(!r.hscroll && r.tablePx <= 1550, 'two hundred rows: both columns, and it scrolls down as a long table always has');
r = fit({ cols: 6, rows: 8, width: 1800, rowH: 30, cw: 1550, ch: 950 });
ok(!r.hscroll && r.tablePx <= 1550 && r.colPx > 200, 'six columns that fit are all shown: ' + Math.round(r.colPx) + 'px each');
r = fit({ cols: 1, rows: 5, width: 300, rowH: 30, cw: 1550, ch: 950 });
ok(!r.hscroll && r.tablePx > 1550 * 0.9, 'one column fills the width, as before');

// a table with too many columns to fit at a readable width still scrolls sideways
r = fit({ cols: 80, rows: 10, width: 8000, rowH: 30, cw: 1550, ch: 950 });
ok(r.hscroll === true && r.colPx >= 39.99, 'eighty columns do not fit at 40px each, so that one scrolls sideways, with cells no narrower than the floor: ' + r.colPx.toFixed(1) + 'px');
r = fit({ cols: 30, rows: 10, width: 3000, rowH: 30, cw: 1550, ch: 950 });
ok(r.hscroll === false && r.colPx >= 40, 'thirty columns do fit, at ' + r.colPx.toFixed(1) + 'px each, so they are all shown');

console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
process.exit(fails ? 1 : 0);

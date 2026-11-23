// ARROWS TO THE NEIGHBOURING WINDOWS, WHILE ONE IS MAXIMIZED.
//
//     node tools/test/maximize-arrows.js
//
// A maximized table fills the window. Each edge now has an arrow when there is a table or
// chart in that direction on the canvas; pressing it leaves this one and maximizes that one.
// The track's own methods are lifted out of plate-track.js and run on a small canvas of
// tables laid out like the one in the report.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
const method = (head) => {
    const a = src.indexOf('\n            ' + head);
    if (a < 0) throw new Error('no method ' + head);
    let depth = 0, b = src.indexOf('{', src.indexOf(')', a));
    for (let k = b; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) { b = k; break; } } }
    return src.slice(a + 1, b + 1);
};
const Track = new Function('return class T {\n' + ['__maxNeighbours() {', '__maxArrowSpots(W, H) {', '__drawMaximizeArrows(ctx) {', '__maxArrowAt(x, y) {',
    '__maxGo(dir) {', '__maxHit(x, y) {', '__maxWorldBounds(obj) {'].map(method).join('\n') + '\n}')();

// World y runs upward: a table "above" another has the larger y.
const table = (name, x, y, w, h) => ({ name, grid: { xi: x, yi: y, width: w, height: h }, deselectAll() { this.deselected = true; } });
const mk = () => {
    const t = new Track();
    t.cap = table('production_capacity', 300, 400, 700, 280);
    t.assumptions = table('assumptions', 0, 340, 200, 500);
    t.capital = table('capital required', 260, 760, 240, 80);
    t.monthly = table('monthly operational costs', 0, 250, 460, 40);
    t.pnl = table('pnl', 0, 160, 460, 80);
    t.production = table('production', 0, 60, 700, 80);
    t.root = [t.assumptions, t.capital, t.cap, t.monthly, t.pnl, t.production];
    t.m_plots = [];
    t.__bottomChromePx = () => 0; t.__maxScreenBox = () => null; t.__maxOnCellButtons = () => false;
    t.maximizeObject = function (o) { this.__maximized = o; this.maximizedCalls = (this.maximizedCalls || 0) + 1; };
    t.setSelected = function (o) { this.selectedPlate = o; if (this.__maximized && o !== this.__maximized) this.maximizeObject(o); };
    t.__maximized = t.cap;
    return t;
};
const names = (n) => ['left', 'right', 'up', 'down'].map((d) => d + '=' + (n[d] ? n[d].name : '-')).join(' ');
const ctxOf = (W, H) => {
    const c = { canvas: { width: W, height: H }, arcs: [], texts: [] };
    for (const f of ['save', 'restore', 'setTransform', 'beginPath', 'fill', 'stroke', 'moveTo', 'lineTo', 'fillRect']) c[f] = () => { };
    c.arc = (x, y, r) => c.arcs.push({ x, y, r });
    c.measureText = (s) => ({ width: ('' + s).length * 7 });
    c.fillText = (s) => c.texts.push(s);
    return c;
};

// ---- which neighbour, each way ----------------------------------------------------------------
let t = mk();
let n = t.__maxNeighbours();
ok(n.left === t.assumptions && n.up === t.capital && n.down === t.monthly && n.right === null,
   'from production_capacity: ' + names(n));
t.__maximized = t.monthly; n = t.__maxNeighbours();
ok(n.down === t.pnl && n.up === t.assumptions, 'from monthly operational costs: ' + names(n));
t.__maximized = t.assumptions; n = t.__maxNeighbours();
ok(n.right === t.capital && n.left === null && n.up === null, 'from assumptions, right is the nearest table beside it: ' + names(n));
t.capital.hidden = true; n = t.__maxNeighbours(); t.capital.hidden = false;
ok(n.right === t.cap, 'and the next nearest when that one is not there: ' + names(n));
t.__maximized = t.capital; n = t.__maxNeighbours();
ok(n.left === t.assumptions && n.down === t.cap, 'from capital required: ' + names(n));
t.__maximized = t.production; n = t.__maxNeighbours();
ok(n.up === t.pnl && n.down === null && n.left === null, 'from the bottom table there is only up: ' + names(n));
t = mk(); t.assumptions.hidden = true;
ok(t.__maxNeighbours().left !== t.assumptions, 'a hidden table is not somewhere to go');
t = mk(); const chart = { name: 'sales', drawPlot() { }, x: 1200, y: 600, w: 300, h: 200 }; t.m_plots = [chart];
ok(t.__maxNeighbours().right === chart, 'a chart counts as well as a table');
t = mk(); t.__objectOnly = { owner: 'x' };
ok(names(t.__maxNeighbours()) === 'left=- right=- up=- down=-', 'a single shared object has no neighbours to go to');

// ---- painted on the edges that have one --------------------------------------------------------
t = mk();
let ctx = ctxOf(1300, 870);
t.__drawMaximizeArrows(ctx);
ok(Object.keys(t.__maxArrowRects).sort().join(',') === 'down,left,up' && ctx.arcs.length === 3, 'three arrows are drawn, and none on the right where nothing is');
const L = t.__maxArrowRects.left, U = t.__maxArrowRects.up, D = t.__maxArrowRects.down;
ok(L.x < 40 && Math.abs((L.y + L.h / 2) - (46 + (870 - 46 - 18) / 2)) < 1, 'the left one is at the middle of the left edge');
ok(U.y > 46 && U.y < 80 && Math.abs((U.x + U.w / 2) - 650) < 1 && D.y + D.h < 870 && D.y > 780, 'up is under the title bar and down is above the bottom edge');
ok(ctx.texts.length === 0, 'with the pointer elsewhere no name is shown');
t.__maxArrowHover = 'left'; ctx = ctxOf(1300, 870); t.__drawMaximizeArrows(ctx);
ok(ctx.texts.join('|') === 'assumptions', 'under the pointer the arrow says where it goes');
t.menu = {}; t.__drawMaximizeArrows(ctxOf(1300, 870));
ok(t.__maxArrowRects === null, 'while a menu is open there are no arrows to press through it');
t.menu = null;

// ---- pressed ----------------------------------------------------------------------------------
t = mk(); t.__drawMaximizeArrows(ctxOf(1300, 870));
const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
ok(t.__maxHit(...mid(t.__maxArrowRects.left)) === 'go-left' && t.__maxHit(...mid(t.__maxArrowRects.down)) === 'go-down', 'a press on an arrow is that arrow’s');
ok(t.__maxHit(1300 - 45, 458) === null, 'and a press where no arrow was drawn is not');
ok(t.__maxGo('left') === true && t.__maximized === t.assumptions && t.selectedPlate === t.assumptions && t.maximizedCalls === 1,
   'pressed, production_capacity is left and assumptions is maximized, once');
ok(t.cap.deselected === true, 'the cells selected in the one left behind are let go');
t.__drawMaximizeArrows(ctxOf(1300, 870));
ok(!!t.__maxArrowRects.right && !t.__maxArrowRects.left, 'and from there the arrows are that table’s own: one to the right, none to the left');
ok(t.__maxGo('up') === false || t.__maximized !== t.assumptions || !!t.__maxArrowRects, 'an arrow that is not there does nothing');

// ---- wired in ---------------------------------------------------------------------------------
ok(/if \(this\.__maximized\) \{ try \{ this\.__drawMaximizeArrows\(ctx\); \} catch \(e\) \{ \} \}/.test(src), 'they are painted with the maximized view, each frame');
ok(/if \(hit && hit\.indexOf\('go-'\) === 0\) \{ this\.__maxGo\(hit\.slice\(3\)\); return; \}/.test(src), 'the release on one makes the switch');
ok(/hit === 'exit' \|\| hit === 'menu' \|\| \(hit && hit\.indexOf\('go-'\) === 0\)\) return;/.test(src), 'the press on one starts nothing in the table underneath');
ok(/this\.__maxArrowHover = this\.__maxArrowAt\(x, y\);/.test(src), 'and the pointer over one lights it');

console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
process.exit(fails ? 1 : 0);

// THE LAYER LIST BELONGS TO THE TRACK BEING WORKED ON.
//
//     node tools/test/layer-list-selected.js
//
// The list under the name tab answers "what is on this track". Drawn on every track at
// once it is a column of names down a canvas of them, over the sequence and the curves of
// tracks nobody is looking at, and the one list that matters is lost among the rest.
//
// The gate is lifted out of track.js rather than retold here, so this fails if the
// condition in the renderer changes.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/bio/track.js', 'utf8');
const line = src.slice(src.indexOf('const _showList = (this.showLayers !== false)'));
const expr = line.slice(0, line.indexOf(';') + 1);
ok(/isSelected/.test(expr) && /showLayers/.test(expr), 'the gate is the one in the renderer: ' + expr.replace(/\s+/g, ' '));
const gate = new Function(expr + '\nreturn _showList;');
const on = (t) => gate.call(t);

// A track as the renderer sees it: selection is showResizeBar, which is what select() and
// deselect() set, and isSelected() reads.
const mk = (o) => Object.assign({
    showResizeBar: true, showLayers: true,
    isSelected() { return this.showResizeBar; }
}, o || {});

ok(on(mk({})) === true, 'the selected track shows its layers');
ok(on(mk({ showResizeBar: false })) === false, 'an unselected one does not');

// The menu toggle still wins: "Hide Data Layers" means hidden, selected or not.
ok(on(mk({ showLayers: false })) === false, 'Hide Data Layers hides them on the selected track too');
ok(on(mk({ showLayers: false, showResizeBar: false })) === false, 'and on an unselected one');

// showLayers has no explicit value on older saved tracks; absent is not "off".
ok(on(mk({ showLayers: undefined })) === true, 'a track with no showLayers set still shows them when selected');

// An object without isSelected (an older track class, a stub in another view) falls back
// to the flag that method reads, rather than throwing mid-frame.
ok(on({ showLayers: true, showResizeBar: true }) === true, 'a track with no isSelected falls back to the flag');
ok(on({ showLayers: true, showResizeBar: false }) === false, 'both ways');
ok(on({ showLayers: true }) === true, 'and treats an unset flag as selected, which is the class default');

// NO INVISIBLE ROWS. The hit rectangles are rebuilt every frame from an empty list, and
// the only push sits inside the branch that needs rows to draw: an unselected track must
// not answer a click where a row would have been.
const reset = src.indexOf('this.__layerTabs = [];');
const push = src.indexOf('this.__layerTabs.push(');
const guard = src.indexOf('if (_layers.length) {');
ok(reset > 0 && push > reset, 'the rows are cleared each frame before any are added');
ok(guard > 0 && push > guard, 'and only added inside the branch that draws them');

console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
process.exit(fails ? 1 : 0);

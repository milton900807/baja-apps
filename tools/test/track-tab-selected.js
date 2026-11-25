// AN UNSELECTED TRACK SAYS WHAT IT IS AND GETS OUT OF THE WAY.
//
//     node tools/test/track-tab-selected.js
//
// Two things hang off the name tab: the qualified detail beside the name (species, locus,
// size, description) and the layer list under it. Both answer questions about the track
// being worked ON. Drawn on every track at once, the detail is a row of small print per
// track -- on a canvas of paralogues, nearly the same row each time, so the part that
// tells two tracks apart is the shortest part of the longest label -- and the list is a
// column of names over the sequence and curves of tracks nobody is looking at.
//
// The gate is lifted out of track.js rather than retold here, so this fails if the
// condition in the renderer changes.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/bio/track.js', 'utf8');
const cut = (from) => {
    const t = src.slice(src.indexOf(from));
    return t.slice(0, t.indexOf(';') + 1);
};
// ONE NOTION OF SELECTED, shared by the tab's colours, the tab's text and the list: two
// would drift, and the drift would show as a tab that inverts without naming its species.
const selExpr = cut('const _sel = (typeof this.isSelected');
const listExpr = cut('const _showList = (this.showLayers !== false)');
ok(/isSelected/.test(selExpr), 'selection is read one way: ' + selExpr.replace(/\s+/g, ' '));
ok(/_sel\b/.test(listExpr) && /showLayers/.test(listExpr),
   'and the list is that, plus the menu toggle: ' + listExpr.replace(/\s+/g, ' '));
const gate = new Function(selExpr + '\n' + listExpr + '\nreturn _showList;');
const on = (t) => gate.call(t);
const selected = new Function(selExpr + '\nreturn _sel;');
const sel = (t) => selected.call(t);

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

// ---- the qualified name beside it ----------------------------------------------------
// The detail is built inside the same gate, so there is nothing to evaluate separately:
// what matters is that the bits are not assembled at all when the track is not selected.
{
    const tab = src.slice(src.indexOf('const _name = ('), src.indexOf('const _detail = _bits.join'));
    ok(/if \(_sel\) \{/.test(tab), 'the species, locus, size and description sit behind the gate');
    for (const w of ['this.species', 'this.chr', 'getKB', 'this.description']) {
        const at = tab.indexOf(w);
        ok(at > tab.indexOf('if (_sel) {'), w + ' is inside it');
    }
    ok(/const _name = /.test(tab) && tab.indexOf('const _name =') < tab.indexOf('if (_sel) {'),
       'and the NAME is outside it: an unselected track still says what it is');
}

ok(sel({ showResizeBar: true, isSelected() { return this.showResizeBar; } }) === true,
   'the same reading of selection drives the tab');
ok(sel({ showResizeBar: false, isSelected() { return this.showResizeBar; } }) === false, 'both ways');

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

// SHOWING THE SELECTED CELLS AS MONEY.
//
//     node tools/test/format-cells.js
//
// The point of this one is what it must NOT do: the number has to stay the number. A cell
// read by a formula must still give 1200 while being drawn as $1,200.00, so this sets the
// tag the painter looks at and never touches the value. The painter is lifted out of
// well.js rather than described here, so the test fails if the two ever disagree about
// which tag means money.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// THE REAL PAINTER, out of well.js: which tag means money is its decision, not this file's.
const wellSrc = fs.readFileSync('baja/plate/well.js', 'utf8');
const displayText = (() => {
    const k = wellSrc.indexOf('__displayText() {');
    let i = wellSrc.indexOf('{', k), d = 0, j = i;
    for (;; j++) { const ch = wellSrc[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    return new Function(wellSrc.slice(i + 1, j));
})();

const mkCell = (v) => ({
    value: v, group: {},
    appendGroups(list) { for (const g of list) this.group[g] = this.group[g] || []; }
});
const mkTable = (name, cells) => ({
    name: name, wells: [cells], __selected: cells,
    getSelectedWellsInOrder() { return this.__selected; }
});
const mkTrack = (t) => ({
    root: [t], selectedPlate: t,
    getTableByName(n) { return this.root.filter((x) => x.name === n)[0] || null; },
    updateCalculations() { }, setMessage() { }, setSelected() { }
});

(async () => {
    const a = mkCell(1200), b = mkCell(300);
    const t = mkTable('hellowrold', [a, b]);
    let r = await load('baja/plate/ops/format-cells.js', mkTrack(t), { style: 'dollar' });
    ok(!r.error && r.cells === 2, 'it runs over the selected cells: ' + JSON.stringify(r));
    ok(a.value === 1200 && b.value === 300, 'THE VALUES ARE UNTOUCHED: a formula still reads 1200');
    ok(displayText.call(a) === '$1,200.00',
       'and the painter now draws it as money: ' + displayText.call(a));

    // plain takes it off again
    r = await load('baja/plate/ops/format-cells.js', mkTrack(t), { style: 'plain' });
    ok(displayText.call(a) === '1200', 'plain puts it back: ' + displayText.call(a));
    ok(a.value === 1200, 'still without touching the value');

    // other tags are what formulas find a cell BY: they must survive a formatting change
    const c = mkCell(5);
    c.appendGroups(['Budget', 'dollar']);
    const t2 = mkTable('x', [c]);
    r = await load('baja/plate/ops/format-cells.js', mkTrack(t2), { style: 'plain' });
    ok(c.group.Budget !== undefined, 'a tag a formula uses survives: Budget is still there');
    ok(c.group.dollar === undefined, 'while the formatting tag is gone');

    // nothing selected
    const t3 = mkTable('x', []);
    r = await load('baja/plate/ops/format-cells.js', mkTrack(t3), { style: 'dollar' });
    ok(!!r.error && /select the cells first/.test(r.error),
       'with nothing selected it asks rather than formatting a whole column nobody pointed at');

    r = await load('baja/plate/ops/format-cells.js', mkTrack(mkTable('x', [mkCell(1)])), { style: 'rainbow' });
    ok(!!r.error, 'a style that is not one of them is refused');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

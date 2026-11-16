// RENAMING A TABLE MUST TAKE THE FORMULAS WITH IT.
//
//     node tools/test/rename-table.js
//
// A table's name is how formulas address its cells. Changing the name and leaving the
// references behind breaks every one of them, silently, and the breakage shows up later as
// a cell that will not calculate. The existing rename path in draw-table.js fixes only the
// renamed table's own formulas, which is correct where it is used -- the table was made a
// moment earlier, so nothing else can refer to it yet -- and wrong for a table that has
// been on the canvas long enough for other tables to name it.
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

// THE REAL renameTableInFormula, LIFTED OUT OF plate.js.
//
// Writing a second copy of it here would have tested the copy. It is the method whose
// behaviour the whole operation depends on -- which references it matches and which it
// leaves alone -- so it is taken from the file that ships. Only the surrounding Plate is a
// stand-in, and only for the parts this touches: a name and a grid of wells with formulas.
const plateSrc = fs.readFileSync('baja/plate/plate.js', 'utf8');
const realRename = (() => {
    const k = plateSrc.indexOf('renameTableInFormula(oldName, newName) {');
    let i = plateSrc.indexOf('{', k), d = 0, j = i;
    for (;; j++) { const ch = plateSrc[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    const body = plateSrc.slice(i + 1, j);
    return new Function('oldName', 'newName', body);
})();

const mkTable = (name, formulas) => ({
    name: name,
    wells: [[{ formula: formulas[0] || '' }], [{ formula: formulas[1] || '' }]],
    formula: {},
    setName(n) { this.name = n; },
    renameTableInFormula(oldName, newName) { return realRename.call(this, oldName, newName); }
});

const mkTrack = (tables, selected) => ({
    root: tables,
    selectedPlate: selected || null,
    selected: null,
    getTableByName(n) { return this.root.filter((t) => t.name.toLowerCase() === ('' + n).toLowerCase())[0] || null; },
    updateCalculations() { this.calculated = true; },
    setSelected(t) { this.selected = t; },
    setMessage() { },
    grid: { rescale() { } }
});

(async () => {
    // THE CASE THAT MATTERS: another table names this one
    const a = mkTable('seaarchbuoy', ['=1+1']);
    const b = mkTable('summary', ['=seaarchbuoy[1] * 2', '=sum(seaarchbuoy[2])']);
    let pt = mkTrack([a, b]);
    let r = await load('baja/plate/ops/rename-table.js', pt,
        { from: 'seaarchbuoy', to: 'helloworld' });
    ok(!r.error, 'the rename runs: ' + JSON.stringify(r));
    ok(a.name === 'helloworld', 'the table takes the new name');
    ok(b.wells[0][0].formula === '=helloworld[1] * 2',
       'A FORMULA IN ANOTHER TABLE FOLLOWS IT: ' + b.wells[0][0].formula);
    ok(b.wells[1][0].formula === '=sum(helloworld[2])', 'including inside a call');
    ok(pt.selected === a, 'and the renamed table is selected');

    // no `from`: the selected table
    const c = mkTable('alpha', []);
    const d = mkTable('beta', []);
    pt = mkTrack([c, d], d);
    r = await load('baja/plate/ops/rename-table.js', pt, { to: 'gamma' });
    ok(!r.error && d.name === 'gamma' && c.name === 'alpha',
       'with no name given, the SELECTED table is the one renamed');

    // no `from`, nothing selected, several tables: refuse rather than guess
    pt = mkTrack([mkTable('one', []), mkTable('two', [])]);
    r = await load('baja/plate/ops/rename-table.js', pt, { to: 'three' });
    ok(!!r.error && /which table/.test(r.error),
       'with nothing selected and several tables it asks rather than guessing');

    // one table and nothing selected: that one is unambiguous
    const only = mkTable('solo', []);
    pt = mkTrack([only]);
    r = await load('baja/plate/ops/rename-table.js', pt, { to: 'duo' });
    ok(!r.error && only.name === 'duo', 'with exactly one table there is nothing to guess');

    // a name already taken is refused: two of one name make references ambiguous
    const e = mkTable('left', []); const f = mkTable('right', []);
    pt = mkTrack([e, f]);
    r = await load('baja/plate/ops/rename-table.js', pt, { from: 'left', to: 'RIGHT' });
    ok(!!r.error && /already a table/.test(r.error), 'a name already in use is refused');
    ok(e.name === 'left', 'and nothing is changed by the refusal');

    // a name that cannot appear in a formula is refused, not silently cleaned up
    const g = mkTable('keep', ['=keep[1]']);
    pt = mkTrack([g]);
    r = await load('baja/plate/ops/rename-table.js', pt, { to: 'hello world' });
    ok(!!r.error && /cannot be used in a formula/.test(r.error),
       'a name with a space is refused rather than quietly stripped');
    ok(g.name === 'keep' && g.wells[0][0].formula === '=keep[1]', 'and nothing moved');
    r = await load('baja/plate/ops/rename-table.js', pt, { to: '2nd' });
    ok(!!r.error, 'nor can it start with a digit');

    // a table that is not there
    pt = mkTrack([mkTable('here', [])]);
    r = await load('baja/plate/ops/rename-table.js', pt, { from: 'elsewhere', to: 'x' });
    ok(!!r.error && /no table called elsewhere/.test(r.error), 'an unknown table says so');

    // renaming to the same name is a no-op, not an error
    const h = mkTable('same', []);
    pt = mkTrack([h]);
    r = await load('baja/plate/ops/rename-table.js', pt, { from: 'same', to: 'same' });
    ok(!r.error && r.unchanged === true, 'renaming to the name it already has changes nothing');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

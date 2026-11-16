// A DELETED ROW TAKES THE FORMULAS WITH IT.
//
//     node tools/test/delete-row-formulas.js
//
// Deleting a row from a table spliced the cells out of every column, so the values below
// moved up on their own and the table looked right. The formula map did not move: the total
// that sat under the list kept the row number it had and kept summing the range it had, so
// after the delete it sat beside the list and counted a row that was no longer under it. The
// shift existed and was wired into the table_size operation only, not into the buttons and
// menus that every delete in the editor actually goes through.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const cell = (v) => ({
    value: v, select: false,
    setValue(x) { this.value = x; },
    setError(m) { this.__hasError = true; this.__errorMessage = m; },
    hasError() { return !!this.__hasError; }
});
const mkTable = (name, rows) => ({
    name: name, formula: {},
    wells: (rows[0] || []).map((_, c) => rows.map((r) => cell(r[c])))
});

// What the plate does when rows are deleted: splice bottom-up, then shift each removed row
// on its own in that same descending order. This is removeFullySelectedRows' body with the
// selection already decided, so the composition it relies on is what is under test.
const deleteRows = async (pt, t, indices) => {
    const removed = [];
    for (const r of indices.slice().sort((a, b) => b - a)) {
        for (let c = 0; c < t.wells.length; c++) t.wells[c].splice(r, 1);
        removed.push(r);
    }
    for (const at of removed) await load('baja/plate/ops/shift-formulas.js', pt, t.name, at, -1);
    return removed;
};

(async () => {
    // Jeff's table: a header, four people, and a total under them.
    const mk = () => {
        const t = mkTable('employees', [
            ['Name', 'Salary'], ['Director', '200000'], ['lab tech 1', '80000'],
            ['lab tech 2', '90000'], ['lab tech 3', '322'],
            ['Total', '=sum(employees[1:1][1:4])']]);
        t.formula['[1:1][5:5]'] = '=sum(employees[1:1][1:4])';
        const pt = { root: [t], formulas: { 'employees[1:1][5:5]': '=sum(employees[1:1][1:4])' },
            setMessage: () => { }, updateCalculations() { this.__recalcs = (this.__recalcs || 0) + 1; } };
        return { t, pt };
    };

    // ---- one row out of the middle ---------------------------------------------------
    let { t, pt } = mk();
    await deleteRows(pt, t, [4]);
    ok(t.formula['[1:1][4:4]'] === '=sum(employees[1:1][1:3])' && !t.formula['[1:1][5:5]'],
       'the total moved up a row with its cell: ' + JSON.stringify(t.formula));
    ok(t.wells[1][4].value === '=sum(employees[1:1][1:3])',
       'and the cell it now sits in holds the shortened sum: ' + t.wells[1][4].value);
    ok(pt.formulas['employees[1:1][4:4]'] === '=sum(employees[1:1][1:3])'
       && !pt.formulas['employees[1:1][5:5]'], 'the project map moved with it');

    // The range shrank by exactly the row taken: a total that counted four people counts
    // three. Before this, it still read [1:4] and silently included the Total row itself.
    ok(!/\[1:4\]/.test(t.wells[1][4].value), 'it does not still count the row that is gone');

    // ---- two rows, not next to each other --------------------------------------------
    ({ t, pt } = mk());
    await deleteRows(pt, t, [2, 4]);
    ok(t.formula['[1:1][3:3]'] === '=sum(employees[1:1][1:2])',
       'two rows out of the middle move the total up twice and shorten it twice: '
       + JSON.stringify(t.formula));

    // ---- what points INTO the row that is going ---------------------------------------
    ({ t, pt } = mk());
    t.formula['[0:0][0:0]'] = '=employees[1][4]';
    pt.formulas['employees[0:0][0:0]'] = '=employees[1][4]';
    t.wells[0][0].setValue('=employees[1][4]');
    const r = await load('baja/plate/ops/shift-formulas.js', pt, 'employees', 4, -1, { plan: true });
    // Counted once per place it is held -- the table's map, the cell's own text, and the
    // project's map -- which is three sightings of one broken formula, not three formulas.
    ok(r.orphans >= 1 && /\[0\]\[0\]/.test((r.orphan_where || []).join(' ')),
       'a formula reading the deleted row is counted as an orphan and named: '
       + JSON.stringify(r.orphan_where));
    await deleteRows(pt, t, [4]);
    ok(t.wells[0][0].value === '=employees[1][4]' && t.wells[0][0].hasError(),
       'it is left exactly as it was and marked in error rather than quietly made to read '
       + 'its neighbour: ' + t.wells[0][0].value);

    // ---- the wiring, which is what was actually missing --------------------------------
    const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
    const calls = plate.match(/^.*\bremoveFullySelectedRows\s*\(.*$/gm) || [];
    const sites = calls.filter((l) => !/async\s+removeFullySelectedRows/.test(l));
    ok(sites.length >= 4, sites.length + ' places delete fully selected rows');
    ok(sites.every((l) => /await\s+this\.removeFullySelectedRows\(\s*pt\s*\)/.test(l)),
       'every one of them waits for the shift and hands over the project:\n       '
       + sites.map((l) => l.trim()).join('\n       '));
    ok(/async removeFullySelectedRows\(pt\)[\s\S]{0,900}shiftFormulasForRemovedRows\(pt, removed\)/.test(plate),
       'and the delete itself is what runs the shift, so no new button can forget to');
    ok(/shiftFormulasForRemovedRows[\s\S]{0,1200}baja\/plate\/ops\/shift-formulas\.js/.test(plate),
       'through the one module that already does it, not a second copy of the arithmetic');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

// A SUM DOES NOT COUNT THE CELL IT IS WRITTEN IN.
//
//     node tools/test/sum-open-range.js
//
// =sum(employees[1:1][1:]) in the last row of employees is the ordinary way to total a
// column: from the first row to the end. The open end reaches the last row, which is the row
// the formula sits in, so the sum met its own text where a number should be and the cell
// went red. The user had written the obvious thing.
//
// This runs the real engine. The case that must NOT change is another cell holding a
// different formula: that is a real ordering problem and leaving it out would make the
// total wrong rather than red.
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

const cell = (v, h) => {
    const w = { value: v, group: {} };
    if (h) { w.skin_type = 'ColumnHeader'; w.group['ColumnHeader'] = 1; }
    return w;
};
const mk = (name, rows) => {
    const cols = rows[0].length;
    const wells = [];
    for (let c = 0; c < cols; c++) wells.push(rows.map((r, i) => cell(r[c], i === 0)));
    const t = { name: name, wells: wells, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows.length } };
    t.getFirstColumn = () => 0; t.getLastColumn = () => cols - 1;
    t.getFirstRow = () => 0; t.getLastRow = () => rows.length - 1;
    t.getWellsByTag = () => [];
    t.getWellsByString = (range) => {
        const m = ('' + range).match(/\[(\d*):?(\d*)\]\[(\d*):?(\d*)\]/);
        const n = (v, d) => (v === '' || v == null ? d : parseInt(v, 10));
        const c0 = n(m[1], 0), c1 = n(m[2], cols - 1), r0 = n(m[3], 0), r1 = n(m[4], rows.length - 1);
        const out = [];
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (wells[c] && wells[c][r]) out.push(wells[c][r]);
        return out;
    };
    return t;
};
const track = (t, said) => ({
    getTableByName: (n) => (n === t.name ? t : null),
    getTableNames: () => [t.name], getTablesByName: () => ({ [t.name]: t }),
    setMessage: (m) => said.push('' + m)
});
const val = (r) => (r && Array.isArray(r.results)) ? r.results[0] : r;

(async () => {
    const F = '=sum(employees[1:1][1:])';
    // the table from the screenshot: filled rows, empty rows, and the total at the foot
    const emp = mk('employees', [['Name', 'Salary'], ['Director', '200000'],
        ['lab tech 1', '80000'], ['lab tech 4', '90000'], ['', '100000'],
        ['', ''], ['', ''], ['Total', F]]);
    const said = [];
    const run = (f) => load('baja/plate/ops/frun-object.js', f, track(emp, said));

    said.length = 0;
    let r = await run('sum(employees[1:1][1:])');
    ok(Number(val(r)) === 470000, 'the open-ended total adds the column above it: ' + JSON.stringify(r));
    ok(!said.join(' ').length, 'with nothing reported as an error: ' + said.join(' | '));

    // the same answer as writing the range out by hand, which is the point
    r = await run('sum(employees[1:1][1:6])');
    ok(Number(val(r)) === 470000, 'the same as the closed range that stops above it');

    // empty rows inside the range are not an error either
    ok(Number(val(await run('sum(employees[1:1][5:6])'))) === 0,
       'a range of nothing but empty cells is zero, not a failure');

    // WHAT MUST STILL BREAK: another cell holding a formula that has not been worked out
    const other = mk('employees', [['Name', 'Salary'], ['a', '=elsewhere[0][0]'],
        ['Total', '=sum(employees[1:1][1:])']]);
    const said2 = [];
    r = await load('baja/plate/ops/frun-object.js', 'sum(employees[1:1][1:])', track(other, said2));
    ok(/Invalid input for sum/.test(said2.join(' ')),
       'a DIFFERENT formula in the range still fails: leaving it out would make the total '
       + 'quietly wrong rather than red');

    // and a whole column total written from the top still works
    const plain = mk('t', [['a', '1'], ['b', '2'], ['c', '3']]);
    ok(Number(val(await load('baja/plate/ops/frun-object.js', 'sum(t[1:1][0:])', track(plain, [])))) === 6,
       'an open-ended range with no formula in it is unchanged');

    // ---- what the builder writes ---------------------------------------------------------
    const op = fs.readFileSync('baja/plate/ops/derive-from-new-table.js', 'utf8');
    ok(/\[1:\]\)'/.test(op), 'a built total is open at the bottom, so rows added later count');
    ok(/leaves out the cell it is written in/.test(op), 'and says why that is safe');

    const eng = fs.readFileSync('baja/plate/ops/frun-object.js', 'utf8');
    ok(/A SUM DOES NOT COUNT THE CELL IT IS WRITTEN IN/.test(eng), 'the engine says what it does');
    ok(/ONLY ITS OWN TEXT IS SKIPPED/.test(eng), 'and what it does not');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

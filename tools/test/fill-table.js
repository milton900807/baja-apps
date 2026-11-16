// FILLING A TABLE THAT ALREADY HAS ITS COLUMNS.
//
//     node tools/test/fill-table.js
//
// "Add a bunch of employees and appropriate salaries to this for a small biotech company
// with an in vivo lab" -- a table with Job and Salary across the top, one row in it, and
// nothing in the app that could put content into it.
//
// The model is stubbed here: what is being tested is everything AROUND it, which is where
// generated content gets lost, overwritten or written into the wrong column.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let answer = null, asked = null;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/table-fill.py') { asked = a; return answer; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const cell = (v, header) => {
    const w = { value: v, group: {} };
    if (header) { w.skin_type = 'ColumnHeader'; w.group['ColumnHeader'] = 1; }
    w.setValue = (x) => { w.value = x; };
    return w;
};
const mkTable = (name, rows) => {
    const cols = rows[0].length;
    const t = { name: name, wells: [], formula: {} };
    for (let c = 0; c < cols; c++) t.wells.push(rows.map((r, i) => cell(r[c], i === 0)));
    t.addRow = () => { for (const col of t.wells) col.push(cell('')); };
    return t;
};
const mkTrack = (tables) => ({
    root: tables, selectedPlate: tables[0], setMessage() { }, wake() { }, updateCalculations() { },
    getTableByName: (n) => tables.filter((x) => x.name === n)[0] || null
});
const col = (t, c) => t.wells[c].map((w) => '' + w.value);

(async () => {
    // Job/Salary, one row filled, three empty
    let t = mkTable('Employees', [['Job', 'Salary'], ['Director', '200000'], ['', ''], ['', '']]);
    let pt = mkTrack([t]);

    answer = { status: 'OK', rows: [['Scientist', '120000'], ['Technician', '70000'],
        ['Vivarium Manager', '95000']], note: '' };
    let r = await load('baja/plate/ops/fill-table.js', pt,
        { what: 'a bunch of employees for a small biotech with an in vivo lab' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));

    // what the generator was told
    const sent = JSON.parse(asked[1]);
    ok(sent.columns.join(',') === 'Job,Salary', 'the table’s own headings are the shape: ' + sent.columns);
    ok(sent.existing.length === 1 && sent.existing[0][0] === 'Director',
       'with a sample of what is already there, so the new rows match it');
    ok(sent.table === 'Employees', 'and which table it is for');

    // where the rows landed
    ok(col(t, 0)[1] === 'Director', 'the row that was already there is untouched');
    ok(col(t, 0)[2] === 'Scientist' && col(t, 1)[2] === '120000',
       'the first generated row goes in the first empty one, cell for cell');
    ok(col(t, 0)[3] === 'Technician', 'then the next');
    ok(t.wells[0].length === 5 && col(t, 0)[4] === 'Vivarium Manager',
       'and the table grows a row when there is not enough room: ' + t.wells[0].length);
    ok(r.written === 3 && r.added_rows === 1, 'the reply counts what landed: ' + JSON.stringify(r));

    // a second fill does not overwrite the first
    answer = { status: 'OK', rows: [['Intern', '40000']], note: '' };
    r = await load('baja/plate/ops/fill-table.js', pt, { what: 'one more' });
    ok(col(t, 0)[4] === 'Vivarium Manager' && col(t, 0)[5] === 'Intern',
       'a second fill goes under the first, not over it');

    // a row that does not fit the columns is not spread across them
    t = mkTable('Two', [['A', 'B'], ['', '']]);
    pt = mkTrack([t]);
    answer = { status: 'OK', rows: [['one', 'two', 'three']], dropped: 0, note: '' };
    r = await load('baja/plate/ops/fill-table.js', pt, { what: 'x' });
    ok(!!r.error && /wrong number of cells/.test(r.error),
       'a row of the wrong width writes nothing and says so: ' + r.error);
    ok(col(t, 0)[1] === '' && col(t, 1)[1] === '', 'and the table is untouched');

    // nothing generated is said, not written as an empty row
    answer = { status: 'OK', rows: [], note: 'these columns are dates, not names' };
    r = await load('baja/plate/ops/fill-table.js', pt, { what: 'x' });
    ok(!!r.error && /dates, not names/.test(r.error), 'and the reason comes back: ' + r.error);

    // the generator failing is said plainly
    answer = { status: 'ERROR', error: 'the model did not return an object' };
    r = await load('baja/plate/ops/fill-table.js', pt, { what: 'x' });
    ok(!!r.error && /did not return an object/.test(r.error), 'a failure upstream is reported');

    r = await load('baja/plate/ops/fill-table.js', pt, {});
    ok(!!r.error && /what should go in it/.test(r.error), 'with nothing asked for it asks');

    // ---- the generator's own cleaning, which is where a formula would get in -----------
    const py = fs.readFileSync('py/bio/project/table-fill.py', 'utf8');
    ok(/while s\.startswith\("="\)/.test(py), 'a generated cell cannot be a formula');
    ok(/if len\(row\) != ncols:/.test(py), 'a row of the wrong length is dropped, not padded');
    ok(/NO FORMULAS AND NO COMMANDS/.test(py), 'and the model is told so as well');
    ok(/plain digits with no currency symbol/.test(py),
       'numbers go in as numbers, so a total can add them up');
    ok(/REAL PEOPLE ARE NOT INVENTED/.test(py), 'and it keeps to roles rather than inventing people');

    // ---- the catalogue -----------------------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('fill_table') >= 0, 'fill_table is offered');
    ok(!cap.validate('fill_table', {}).ok, 'it needs to be told what goes in');
    ok(cap.validate('fill_table', { what: 'employees' }).ok, 'and that is all it needs');
    ok(/fill "Employees" in: employees and salaries/.test(
        cap.preview('fill_table', { what: 'employees and salaries', table: 'Employees' })),
       'the card says which table and what: '
       + cap.preview('fill_table', { what: 'employees and salaries', table: 'Employees' }));
    ok(/pass the request through/.test(JSON.stringify(cap.catalogue())),
       'and the request is passed through rather than summarised, since the detail is the point');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

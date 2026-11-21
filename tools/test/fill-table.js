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

    // ---- a table worked out from another table reads it, with formulas ------------------
    // "use assumptions to create a monthly cost table" made a table of typed-in numbers,
    // and the generator had never been shown assumptions at all.
    {
        const withRange = (tb) => {
            tb.getWellRange = (cells) => {
                for (let c = 0; c < tb.wells.length; c++) {
                    const r2 = tb.wells[c].indexOf(cells[0]);
                    if (r2 >= 0) return '[' + c + ':' + c + '][' + r2 + ':' + r2 + ']';
                }
                return '';
            };
            return tb;
        };
        const src = mkTable('assumptions', [['Assumption', 'Cost'],
            ['Aircraft Purchase Price', '1200000'], ['Annual Insurance', '36000'],
            ['Hangar/Mooring Monthly', '2500'], ['Fuel Cost per Hour', '180']]);
        const other = mkTable('employees', [['Job', 'Salary'], ['Pilot', '200000']]);
        const dst = withRange(mkTable('monthly_cost', [['Item', 'Cost'], ['', ''], ['', ''], ['', ''],
            ['', ''], ['', ''], ['', ''], ['', '']]));
        const pt2 = mkTrack([dst, src, other]);
        pt2.formulas = {}; pt2.addFormula = (k, f) => { pt2.formulas[k] = f; };
        const said = []; pt2.setMessage = (m) => said.push('' + m);

        answer = { status: 'OK', note: '', rows: [
            ['Insurance', '=assumptions[1:1][2:2]/12'],
            ['Hangar', '= assumptions[1:1][3:3]'],
            ['Both', '=(assumptions[1:1][2:2] / 12) + assumptions[1:1][3:3]'],
            ['Months', '12'],
            ['Salaries', '=employees[1:1][1:1]/12'],
            ['Sneaky', '=sum(assumptions[1:1][1:4])'],
            ['Made up', '=assumptions[1:1][9:9]*2']] };
        r = await load('baja/plate/ops/fill-table.js', pt2,
            { what: 'monthly cost table based on assumptions', table: 'monthly_cost' });
        ok(!r.error, 'it runs: ' + JSON.stringify(r));

        const sent2 = JSON.parse(asked[1]);
        ok(sent2.sources && sent2.sources.length === 1 && sent2.sources[0].table === 'assumptions',
           'the table the request names is sent, and only that one: ' + JSON.stringify((sent2.sources || []).map((x) => x.table)));
        const ins = sent2.sources[0].cells.filter((c) => c.label === 'Annual Insurance')[0];
        ok(ins && ins.ref === 'assumptions[1:1][2:2]' && ins.value === '36000' && ins.column === 'Cost',
           'each number with its reference, what its row is called and its heading: ' + JSON.stringify(ins));
        ok(sent2.sources[0].cells.length === 4, 'numbers only, not the labels or the headings');

        ok(col(dst, 1)[1] === '=assumptions[1:1][2:2]/12', 'a share of an assumption is a formula: ' + col(dst, 1)[1]);
        ok(pt2.formulas['monthly_cost[1:1][1:1]'] === '=assumptions[1:1][2:2]/12'
           && dst.formula['[1:1][1:1]'] === '=assumptions[1:1][2:2]/12',
           'registered the way every other formula here is: ' + JSON.stringify(Object.keys(pt2.formulas)));
        ok(col(dst, 1)[2] === '=assumptions[1:1][3:3]', 'a figure carried across is a reference, not a copy: ' + col(dst, 1)[2]);
        ok(col(dst, 1)[3] === '=(assumptions[1:1][2:2]/12)+assumptions[1:1][3:3]', 'brackets and several references: ' + col(dst, 1)[3]);
        ok(col(dst, 1)[4] === '12' && !pt2.formulas['monthly_cost[1:1][4:4]'], 'a number that is in no source stays a number');
        ok(col(dst, 1)[5] === '' && col(dst, 1)[6] === '' && col(dst, 1)[7] === '',
           'a table that was not offered, a function, and a made-up cell are not written: '
           + JSON.stringify(col(dst, 1).slice(5)));
        ok(col(dst, 0)[5] === 'Salaries', 'though the rest of the row is');
        ok(r.formulas === 3 && r.left_empty === 3 && r.reads === 'assumptions', 'and the reply counts both: ' + JSON.stringify(r));
        ok(/3 cells are formulas reading assumptions/.test(said.join(' ')) && /3 cells came back as a formula that could not be checked/.test(said.join(' ')),
           'as does the message: ' + said.join(' | '));

        // Named by the plan rather than the sentence.
        const dst2 = withRange(mkTable('budget', [['Item', 'Cost'], ['', '']]));
        const pt3 = mkTrack([dst2, src]); pt3.addFormula = () => { };
        answer = { status: 'OK', note: '', rows: [['Fuel', '=assumptions[1:1][4:4]*40']] };
        r = await load('baja/plate/ops/fill-table.js', pt3, { what: 'a monthly budget', table: 'budget', from: 'assumptions' });
        ok(col(dst2, 1)[1] === '=assumptions[1:1][4:4]*40', 'a table passed as `from` is read too: ' + col(dst2, 1)[1]);

        // No source: a formula is still never written, and never left as its own text.
        const dst3 = withRange(mkTable('plain', [['Item', 'Cost'], ['', '']]));
        const pt4 = mkTrack([dst3, src]); pt4.addFormula = () => { };
        answer = { status: 'OK', note: '', rows: [['Fuel', '=assumptions[1:1][4:4]*40']] };
        r = await load('baja/plate/ops/fill-table.js', pt4, { what: 'some costs', table: 'plain' });
        ok(JSON.parse(asked[1]).sources === undefined && col(dst3, 1)[1] === '',
           'with no table drawn on, nothing is sent and no formula gets in: ' + JSON.stringify(col(dst3, 1)));

        ok(/THIS TABLE IS WORKED OUT FROM THE TABLES UNDER "sources"/.test(py)
           && /def _formula\(/.test(py), 'the generator is told to answer in formulas, and checks them itself');
        const capsrc = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8').replace(/\s+/g, ' ');
        ok(/use assumptions to create a monthly cost table/.test(capsrc) && /from: \{ type: 'string'/.test(capsrc),
           'and the catalogue carries the sentence and the parameter');
    }

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

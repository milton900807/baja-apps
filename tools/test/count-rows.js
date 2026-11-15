// COUNTING THE ROWS OF A TABLE.
//
//     node tools/test/count-rows.js
//
// "I want this value to be the sum of the Employees table" wrote sum() over the whole table,
// and sum throws the moment it meets a name: every cell in its range has to be a number, and
// a table of people has a column of names and a row of headings by design. The cell went red
// and said nothing about why. What that request actually wants is how many rows there are.
//
// This runs count_rows through the real engine (frun-object.js), not a copy of it.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
// exec() here takes a path the way the app does, with or without the .js: the engine asks
// for 'baja/expression/functions-factory' and the file on disk is .js.
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A table the way the app builds one: wells[col][row], a tagged heading row on top.
const cell = (v, header) => {
    const w = { value: v, group: {} };
    if (header) { w.skin_type = 'ColumnHeader'; w.group['ColumnHeader'] = Date.now(); }
    return w;
};
const mkTable = (name, rowsOfValues, withHeader) => {
    const cols = rowsOfValues[0].length;
    const wells = [];
    for (let c = 0; c < cols; c++) {
        wells.push(rowsOfValues.map((row, r) => cell(row[c], withHeader && r === 0)));
    }
    const rows = rowsOfValues.length;
    const t = { name: name, wells: wells, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows } };
    t.getFirstColumn = () => 0; t.getLastColumn = () => cols - 1;
    t.getFirstRow = () => 0; t.getLastRow = () => rows - 1;
    t.getWellsByTag = () => [];
    t.getWellsByString = (range) => {
        const m = ('' + range).match(/\[(\d*):?(\d*)\]\[(\d*):?(\d*)\]/);
        const n = (v, d) => (v === '' || v == null ? d : parseInt(v, 10));
        const c0 = m ? n(m[1], 0) : 0, c1 = m ? n(m[2], cols - 1) : cols - 1;
        const r0 = m ? n(m[3], 0) : 0, r1 = m ? n(m[4], rows - 1) : rows - 1;
        const out = [];
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { if (wells[c] && wells[c][r]) out.push(wells[c][r]); }
        return out;
    };
    return t;
};

(async () => {
    const employees = mkTable('Employees', [
        ['Type', 'Salary'],
        ['Director', '100000'],
        ['Engineer', '90000'],
        ['', '']                       // the room a table was given, not a row of content
    ], true);
    // The engine reports a bad formula through setMessage rather than by throwing, which is
    // how a cell goes red: the messages are collected so they can be read back here.
    const said = [];
    const pt = { getTableByName: (n) => (n === 'Employees' ? employees : null), getTableNames: () => ['Employees'],
        getTablesByName: () => ({ Employees: employees }), setMessage: (m) => said.push('' + m) };

    const run = (f) => load('baja/plate/ops/frun-object.js', f, pt);

    let r = await run('count_rows(Employees)');
    // the engine answers { group, results: [value] }
    const got = (x) => (x && Array.isArray(x.results)) ? x.results[0] : (Array.isArray(x) ? x[0] : x);
    const val = got(r);
    ok(Number(val) === 2, 'two people, so two rows: got ' + JSON.stringify(r));

    // the heading row is not a row, and neither is an empty one
    const noHeader = mkTable('Plain', [['a', '1'], ['b', '2'], ['c', '3']], false);
    const pt2 = { getTableByName: (n) => (n === 'Plain' ? noHeader : null), getTableNames: () => ['Plain'],
        getTablesByName: () => ({ Plain: noHeader }), setMessage: () => { } };
    r = await load('baja/plate/ops/frun-object.js', 'count_rows(Plain)', pt2);
    ok(Number(got(r)) === 3, 'with no heading row all three count: ' + JSON.stringify(r));

    // a table that is not there says so rather than answering zero
    said.length = 0;
    const missing = await run('count_rows(Nothing)');
    const saidIt = said.join(' | ');
    // A name that is not a table fails in the engine's own reference resolution, before this
    // function is reached, the same way sum(Nothing[0:0]) does. What matters here is that it
    // is a failure: a count that answers 0 for a table that does not exist is the answer
    // somebody would act on.
    const missingVal = got(missing);
    ok(Number(missingVal) !== 0 && !(typeof missingVal === 'number'),
       'a table that is not there does not answer 0: ' + (saidIt || JSON.stringify(missing)));

    // sum over the same table is what used to go red
    said.length = 0;
    const bad = await run('sum(Employees[0:1][0:3])');
    const badSaid = said.join(' | ');
    ok(/Invalid input for sum/.test(badSaid) || bad == null || Number.isNaN(Number(bad)),
       'sum over the whole table fails, which is why counting has a function of its own: '
       + (badSaid || JSON.stringify(bad)));

    // and the range the operation writes for a sum avoids exactly that
    r = await run('sum(Employees[1:1][1:3])');
    ok(Number(got(r)) === 190000,
       'the numbers-only range sums cleanly: ' + JSON.stringify(r));

    // ---- what the operation writes ----------------------------------------------------
    const op = fs.readFileSync('baja/plate/ops/cell-from-table.js', 'utf8');
    ok(/'=count_rows\(' \+ want \+ '\)'/.test(op), 'count writes count_rows naming the table');
    ok(/firstRow = r \+ 1/.test(op), 'and a sum starts under the heading rows');
    ok(/numCols\.push\(c\)/.test(op), 'over the columns that hold numbers');
    ok(/nothing in ' \+ want \+ ' is a number/.test(op),
       'with a table that has no numbers in it said plainly, not written as a formula that throws');
    ok(/count_rows: count_rows|count_rows: 'count'|count_rows: 'count',/.test(op.replace(/\s+/g, ' ')),
       'and "count_rows" said in the request means the same as count');

    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(/COUNT IS HOW MANY ROWS IT HAS/.test(JSON.stringify(cap.catalogue())),
       'the catalogue says what count means, so "how many employees" picks it');
    ok(cap.validate('cell_from_table', { table: 'Employees', how: 'count' }).ok, 'count validates');

    const known = fs.readFileSync('baja/plate/ops/resolve-missing-references.js', 'utf8');
    ok(/'count_rows'\]/.test(known), 'count_rows is a known function name, so it is not read as a reference');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

// ROWS ON A TABLE THAT IS ALREADY THERE.
//
//     node tools/test/table-size.js
//
// "Add 4 rows", asked from the Employees table's own bar, came back as nothing matching with
// Draw > Table and File > New offered: three ways to make a NEW table in answer to a request
// about the one in front of the user. There was no operation for it, and the + button adds
// one row per press.
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

// A table that behaves like the real one where it matters: addRow and removeLastRow work on
// wells[col][row], addColumn appends a column and may name its top cell.
const mkTable = (name, rows) => {
    const cols = rows[0].length;
    const t = { name: name, wells: [], formula: {} };
    for (let c = 0; c < cols; c++) t.wells.push(rows.map((r) => ({ value: r[c] })));
    t.addRow = () => { for (const col of t.wells) col.push({ value: '' }); };
    t.removeLastRow = () => { for (const col of t.wells) col.pop(); };
    t.addColumn = (nm) => {
        const n = t.wells[0].length;
        const col = []; for (let r = 0; r < n; r++) col.push({ value: '' });
        if (nm) col[0].value = nm;
        t.wells.push(col);
    };
    return t;
};
const mkTrack = (tables) => ({
    root: tables, selectedPlate: tables[0], setMessage() { }, wake() { }, updateCalculations() { },
    getTableByName: (n) => tables.filter((x) => x.name === n)[0] || null
});
const run = (pt, args) => load('baja/plate/ops/table-size.js', pt, args);
const shape = (t) => t.wells[0].length + 'x' + t.wells.length;

(async () => {
    let t = mkTable('Employees', [['Job', 'Salary'], ['Director', '200000']]);
    let pt = mkTrack([t]);

    let r = await run(pt, { rows: 4 });
    ok(!r.error, 'four rows are added: ' + JSON.stringify(r));
    ok(shape(t) === '6x2', 'the table is two rows taller plus four: ' + shape(t));
    ok(r.added_rows === 4 && r.rows === 6, 'and the reply says what it did and what it is now');

    r = await run(pt, { columns: 2, names: 'Start, Notes' });
    ok(!r.error && shape(t) === '6x4', 'two columns are added: ' + shape(t));
    ok(t.wells[2][0].value === 'Start' && t.wells[3][0].value === 'Notes',
       'with the names the request gave');

    // taking away is not the same as adding
    r = await run(pt, { rows: -3 });
    ok(!r.error && shape(t) === '3x4', 'empty rows at the end come off without ceremony: ' + shape(t));

    r = await run(pt, { rows: -2 });
    ok(!!r.error && /something in/.test(r.error) && shape(t) === '3x4',
       'a row holding something stops it, and nothing is removed: ' + r.error);
    r = await run(pt, { rows: -2, force: 'yes' });
    ok(!r.error && shape(t) === '1x4', 'told plainly, it goes ahead: ' + shape(t));

    // a formula is content, even with no value
    const f = mkTable('Calc', [['a'], ['']]);
    f.wells[0][1].formula = '=sum(Other[0:0][0:0])';
    r = await run(mkTrack([f]), { rows: -1 });
    ok(!!r.error && /something in/.test(r.error), 'a cell holding only a formula counts as content');

    // nonsense
    r = await run(pt, {});
    ok(!!r.error && /add or remove how many/.test(r.error), 'with no numbers it asks');
    r = await run(pt, { rows: 2.5 });
    ok(!!r.error && /whole number/.test(r.error), 'half a row is refused rather than rounded');
    r = await run(pt, { rows: 9000 });
    ok(!!r.error && /more than a table can change by/.test(r.error), 'and a silly number is refused');
    r = await run(pt, { columns: -1 });
    ok(!!r.error && /removing columns is not something this can do/.test(r.error),
       'removing a column says so rather than doing most of it: ' + r.error);

    // which table: named, or the one the Ask button was pressed on
    const a = mkTable('A', [['x']]), b = mkTable('B', [['y']]);
    const pt2 = mkTrack([a, b]);
    r = await run(pt2, { table: 'B', rows: 1 });
    ok(!r.error && b.wells[0].length === 2 && a.wells[0].length === 1, 'a named table is the one that changes');
    pt2.__askedTable = b;
    r = await run(pt2, { rows: 1 });
    ok(!r.error && b.wells[0].length === 3, 'and with no name, the table whose Ask button was pressed');

    // ---- the catalogue, and the name being filled in for the model --------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('table_size') >= 0, 'table_size is offered');
    ok(cap.validate('table_size', { rows: 4 }).ok, 'rows alone validates');
    ok(/add 4 rows on "Employees"/.test(cap.preview('table_size', { rows: 4, table: 'Employees' })),
       'the card says how many and on which: ' + cap.preview('table_size', { rows: 4, table: 'Employees' }));
    ok(/remove 2 rows/.test(cap.preview('table_size', { rows: -2 })), 'and says remove when it removes');

    const pc = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
    ok(/THE OBJECT THE REQUEST CAME FROM IS FILLED IN, NOT HOPED FOR/.test(pc),
       'the card fills in the object the request came from');
    ok(/op\.args\[pname\] = askedName;/.test(pc), 'putting its name into the operation');
    ok(/askedKind === 'timeline'\) \? 'timeline' : \(askedKind === 'table'/.test(pc),
       'for a table or a timeline, by the name the parameter carries');
    ok(/op\.args\[pname\] == null \|\| \('' \+ op\.args\[pname\]\)\.trim\(\) === ''/.test(pc),
       'and only when the model left it out, so a name in the request still wins');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

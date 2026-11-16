// THE SELECTED CELLS COME FROM A NEW TABLE.
//
//     node tools/test/derive-from-new-table.js
//
// Three things have to be right and all three are silent when they are wrong: the new table
// must be the SHAPE of the selection rather than a single column (flattening rearranges the
// user's data), the references must be the form the formula engine actually parses, and the
// values already in those cells must move into the new table rather than being replaced by
// pointers at empty ones.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const isFile = (x) => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } };
// lib/core.js DECLARES its own prompt(), which opens a dialog and waits for an answer that
// never comes in a test. A global of the same name is shadowed by it, so the override has to
// happen after core has been defined, in the same scope: a function declaration can be
// reassigned, which is why this works and `global.prompt = ...` does not.
let promptAnswer = { Name: 'Inputs' };
let asked = 0;
const load = async (p, ...a) => {
    const file = isFile(p) ? p : (isFile(p + '.js') ? p + '.js' : p);
    const body = fs.readFileSync(file, 'utf8');
    const f = await new AF('exec', 'args',
        core + '\nprompt = args.prompt;\nreturn (' + body + ')')(load, {
            prompt: async () => { asked++; return promptAnswer; }
        });
    return f(...a);
};
// A Well's setValue calls lion_engine.pushHistory. Leaving it out made every write throw,
// which the operation caught and counted as "nothing to carry" -- the harness inventing a
// failure that does not exist in the product.
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    pushHistory: () => { }, getIonFunction: () => null,
    createIonFunction: (f) => f
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

global.pushHistory = () => { };
global.HM = () => ({});

const mkCell = (v) => ({ value: v, formula: '', setValue(x) { this.value = x; } });
const mkHost = (cols, rows) => {
    const t = {
        name: 'hellowrold', formula: {},
        wells: Array.from({ length: cols }, () => Array.from({ length: rows }, () => mkCell(''))),
        __sel: [],
        getSelectedWellsInOrder() { return this.__sel; },
        getWellIndicies(c) {
            for (let x = 0; x < this.wells.length; x++) {
                const y = this.wells[x].indexOf(c);
                if (y >= 0) return { colIdx: x, rowIdx: y };
            }
            return null;
        },
        getWellRange(list) { const i = this.getWellIndicies(list[0]); return '[' + i.colIdx + '][' + i.rowIdx + ']'; }
    };
    return t;
};
// The real Plate marks a text top row as headings when applycolumnheaders runs; the stub
// records that it was called, since drawing is not what is being tested.
const mkTrack = (host) => ({
    root: [host], selectedPlate: host, added: [], formulas: {},
    getTableByName(n) { return this.root.filter((t) => t.name === n)[0] || null; },
    addPlateWithConsistentWellSize(p) { this.added.push(p); this.root.push(p); },
    async panToNextSpot() { }, updateCalculations() { }, setMessage() { }, setSelected() { },
    addFormula(k, f) { this.formulas[k] = f; },
    zoomToFitTable: async () => { }
});

(async () => {
    // a 2x2 block out of a bigger table, with values in it
    let host = mkHost(4, 4);
    host.wells[1][1].value = 10; host.wells[2][1].value = 20;
    host.wells[1][2].value = 30; host.wells[2][2].value = 40;
    host.__sel = [host.wells[1][1], host.wells[2][1], host.wells[1][2], host.wells[2][2]];
    let pt = mkTrack(host);

    let r = await load('baja/plate/ops/derive-from-new-table.js', pt, { name: 'Inputs' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    const made = pt.added[0];

    ok(!!made && made.name === 'Inputs', 'a table is made with the name given');
    ok(made.wells.length === 2 && made.wells[0].length === 2,
       'THE NEW TABLE IS THE SHAPE OF THE SELECTION (2x2), not a column of four');

    ok(host.wells[1][1].value === '=Inputs[0][0]', 'the top-left cell reads the new table\'s top-left: '
       + host.wells[1][1].value);
    ok(host.wells[2][2].value === '=Inputs[1][1]', 'and the bottom-right reads its bottom-right: '
       + host.wells[2][2].value);
    ok(host.formula['[1][1]'] === '=Inputs[0][0]', 'the formula is stored on the table too');
    ok(pt.formulas['hellowrold[1][1]'] === '=Inputs[0][0]', 'and registered with the track');

    ok(made.wells[0][0].value === 10 && made.wells[1][1].value === 40,
       'THE VALUES MOVED INTO THE NEW TABLE, so the references still show the same numbers');
    ok(r.carried === 4 && !r.lost,
       'and it reports them as carried, counted from what the cells hold: '
       + JSON.stringify({ carried: r.carried, lost: r.lost }));

    // A TABLE WITH NAMED COLUMNS AND A TOTAL AT THE FOOT.
    //
    // "Derive this value from the sum of the salaries column in a new table called
    // lab_employees", with ONE cell selected, used to give a 1 x 1 table and a reference to
    // its only cell: a rename of the number rather than somewhere to keep salaries.
    host = mkHost(4, 12);
    host.__sel = [host.wells[1][5]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt,
        { name: 'lab_employees', columns: 'Name, Salary', rows: 6 });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    const emp = pt.added[0];
    ok(emp.wells.length === 2, 'two columns, as named');
    ok(emp.wells[0].length === 8, 'a heading row, six to fill in, and the total: '
       + emp.wells[0].length + ' rows');
    ok(emp.wells[0][0].value === 'Name' && emp.wells[1][0].value === 'Salary',
       'the headings are written across the top');
    ok(emp.wells[0][0].skin_type === 'ColumnHeader' && !!(emp.wells[0][0].group || {})['ColumnHeader'],
       'and really marked as headings by the plate itself, so they draw as headings and are '
       + 'left out of a row count');
    ok(emp.wells[0][7].value === 'Total', 'the last row is labelled');
    ok(emp.wells[1][7].value === '=sum(lab_employees[1:1][1:6])',
       'and totals the column above it, not the whole table: ' + emp.wells[1][7].value);
    // The plate's own getWellRange writes a RANGE for a single cell -- [1:1][7:7] -- which
    // is the key the track stores it under. Asserting [1][7] would be asserting a spelling
    // this test made up.
    ok(pt.formulas['lab_employees[1:1][7:7]'] === '=sum(lab_employees[1:1][1:6])',
       'the total is registered as a formula, so it recalculates as the table is filled in: '
       + JSON.stringify(Object.keys(pt.formulas)));
    ok(host.wells[1][5].value === '=lab_employees[1][7]',
       'the cell that asked reads THE TOTAL, not the first cell: ' + host.wells[1][5].value);

    // which column is totalled, by name
    host = mkHost(4, 12); host.__sel = [host.wells[1][5]]; pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt,
        { name: 'T2', columns: 'Role, Headcount, Salary', sum_column: 'Salary' });
    ok(!r.error && r.totals === 'Salary', 'a named column is the one totalled: ' + JSON.stringify(r.totals));
    ok(pt.added[0].wells[2][9].value === '=sum(T2[2:2][1:8])',
       'the third column, with the default eight rows: ' + pt.added[0].wells[2][9].value);

    // a column that is not there is said, rather than column two being totalled quietly
    host = mkHost(4, 12); host.__sel = [host.wells[1][5]]; pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt,
        { name: 'T3', columns: 'Role, Salary', sum_column: 'Bonus' });
    ok(!!r.error && /no column called "Bonus"/.test(r.error) && pt.added.length === 0,
       'and nothing is built: ' + r.error);

    // sum_column alone is enough to ask for the totalled shape
    host = mkHost(4, 12); host.__sel = [host.wells[1][5]]; pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt,
        { name: 'T4', sum_column: 'salaries' });
    ok(!r.error && pt.added[0].wells.length === 2,
       'a labels column and a numbers column: ' + JSON.stringify(r.columns));
    ok(pt.added[0].wells[1][0].value === 'salaries', 'named as the request named it');

    // with neither, the old behaviour is untouched
    host = mkHost(4, 4);
    host.wells[1][1].value = 5;
    host.__sel = [host.wells[1][1]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, { name: 'Plain' });
    ok(pt.added[0].wells.length === 1 && pt.added[0].wells[0].length === 1,
       'no columns asked for means the shape of the selection, as before');
    ok(host.wells[1][1].value === '=Plain[0][0]', 'reading its own cell');

    // NO NAME GIVEN: it asks, rather than inventing one
    asked = 0;
    host = mkHost(2, 2); host.__sel = [host.wells[0][0]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, {});
    ok(asked === 1, 'with no name given the user is ASKED for one');
    ok(!r.error && r.name === 'Inputs', 'and the answer is used');

    // cancelled naming writes nothing
    asked = 0;
    promptAnswer = { Name: '' };
    host = mkHost(2, 2); host.__sel = [host.wells[0][0]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, {});
    ok(r.cancelled === true && pt.added.length === 0 && host.wells[0][0].value === '',
       'cancelling the name makes no table and changes no cell');
    promptAnswer = { Name: 'Inputs' };

    // a name that cannot appear in a formula
    host = mkHost(2, 2); host.__sel = [host.wells[0][0]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, { name: 'my table' });
    ok(!!r.error && /cannot be used in a formula/.test(r.error),
       'a name with a space is refused: a formula could not name it');
    ok(pt.added.length === 0, 'and nothing is made');

    // a name already taken
    host = mkHost(2, 2); host.__sel = [host.wells[0][0]];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, { name: 'hellowrold' });
    ok(!!r.error && /already a table/.test(r.error), 'a name already in use is refused');

    // nothing selected
    host = mkHost(2, 2); host.__sel = [];
    pt = mkTrack(host);
    r = await load('baja/plate/ops/derive-from-new-table.js', pt, { name: 'X' });
    ok(!!r.error && /select the cells/.test(r.error), 'with nothing selected it says so');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

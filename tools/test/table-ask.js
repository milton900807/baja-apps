// AN ASK BUTTON ON A TABLE'S OWN BAR, AND A CELL THAT READS ANOTHER TABLE.
//
//     node tools/test/table-ask.js
//
// Two things, because they are the same request: a prompt made from a table has to be about
// THAT table, and the first thing asked through it ("I want this value to be the sum of the
// Employees table") had no operation behind it at all.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// ---- the button is on the bar, next to maximize --------------------------------------
const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
const sets = plate.split('name: "maximize"');
ok(sets.length === 3, 'the table has two button sets with maximize in them');
for (let i = 1; i < sets.length; i++) {
    ok(/name: "ask"/.test(sets[i].slice(0, 900)),
       'set ' + i + ': an ask button follows maximize');
}
ok(/letter: 'Ask'/.test(plate), 'it is drawn as a word, not another glyph to decode');
ok(/table-ask\.js/.test(plate), 'and it asks');
ok(/const isAsk = name === 'ask';/.test(plate) && /isAsk \? \(hover \? '#fde68a'/.test(plate),
   'in amber, the same as the timeline’s, so it is not read as a window control');

// ---- what it sends -------------------------------------------------------------------
const ask = fs.readFileSync('baja/plate/ops/table-ask.js', 'utf8');
ok(/asked_from: \{ type: 'table'/.test(ask), 'the request says it came from a table');
ok(/name: name \|\| null/.test(ask), 'with the table’s name');
ok(/columns by /.test(ask) && /cells? ' \+ \(picked === 1/.test(ask.replace(/\n\s*/g, ' ')) || /selected/.test(ask),
   'and its shape and what is selected in it');
ok(/track\.__askedTable = table/.test(ask),
   'and leaves the table itself where the operations can find it');
ok(/project-command\.js/.test(ask), 'then routes the sentence to the one place that reads sentences');
ok(!/executeCommand/.test(ask), 'with no second interpreter of its own');

// ---- "this table" means the one the button was on ------------------------------------
(async () => {
    const IO = await load('baja/plate/ops/column-io.js');
    const mk = (name) => ({ name: name, wells: [[{ value: '' }]] });
    const a = mk('Assumptions'), b = mk('Employees');
    const pt = { root: [a, b], selectedPlate: a, getTableByName: (n) => [a, b].filter((t) => t.name === n)[0] || null };

    let r = IO.pickTable(pt, '');
    ok(r.table === a, 'with nothing asked from, the selected table is used, as before');

    pt.__askedTable = b;
    r = IO.pickTable(pt, '');
    ok(r.table === b, 'the table whose Ask button was pressed beats whatever is selected');

    r = IO.pickTable(pt, 'Assumptions');
    ok(r.table === a, 'and a name in the request still beats both');

    pt.__askedTable = { name: 'gone', wells: [[{}]] };
    r = IO.pickTable(pt, '');
    ok(r.table === a, 'a table that has been closed since is ignored, not used');

    // ---- the operation behind "the sum of the Employees table" ------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    const names = cap.catalogue().map((c) => c.name);
    ok(names.indexOf('cell_from_table') >= 0, 'cell_from_table is in the catalogue');
    const v = cap.validate('cell_from_table', { table: 'Employees' });
    ok(v.ok, 'a request naming only the table validates');
    ok(v.args.how === undefined || v.args.how === 'sum', 'and sums by default');
    ok(!cap.validate('cell_from_table', { table: 'Employees', how: 'median' }).ok,
       'an aggregate that is not offered is refused, not approximated');
    ok(!cap.validate('cell_from_table', {}).ok, 'and the table has to be named');
    ok(/the sum of "Employees"/.test(cap.preview('cell_from_table', { table: 'Employees', how: 'sum' })),
       'the card says which table and what of it: ' + cap.preview('cell_from_table', { table: 'Employees', how: 'sum' }));

    const op = fs.readFileSync('baja/plate/ops/cell-from-table.js', 'utf8');
    ok(/getTableByName/.test(op), 'the operation looks for the table by name');
    ok(/There is no table called/.test(op) && /prompt\(/.test(op),
       'and when it is not there it ASKS for it rather than refusing');
    ok(/'Columns', 'Values'/.test(op), 'for its columns and its values');
    ok(/new-table\.js/.test(op), 'making it with the operation that already makes tables');
    ok(/\[0:' \+ \(nCols - 1\) \+ '\]\[0:' \+ \(nRows - 1\) \+ '\]/.test(op),
       'the formula covers the table’s real extent');
    ok(/A-Za-z_\]\[A-Za-z0-9_\]\*\$/.test(op),
       'and a name that cannot be written in a formula is refused before anything is built');
    ok(/only ' \+ put \+ ' of ' \+ values\.length/.test(op),
       'values that would not fit are reported rather than dropped');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

// WHY A CELL IS RED, AND WHAT WOULD FIX IT.
//
//     node tools/test/diagnose-formula.js
//
// =Salaries[1][9] on a table whose last row is 8 drew red with a badge and no reason, and
// the only thing to do about it was delete it. Each cause has one obvious correction.
//
// The rule this tests hardest: a suggestion is a REAL reference or it is not made. "Did you
// mean row 9?" about a table with eight rows is the same bug wearing an apology.
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

const mkTable = (name, rows) => ({
    name: name,
    wells: (rows[0] || []).map((_, c) => rows.map((r) => ({ value: r[c] })))
});

(async () => {
    // exec() CALLS the module: it is a function body, not a module that exports one, so
    // loading it with no arguments runs it against nothing rather than handing it back.
    const diag = (pt, table, formula, cell) =>
        load('baja/plate/ops/diagnose-formula.js', pt, table, formula, cell);
    // Salaries: 2 columns, 9 rows (0..8), the shape from the screenshot
    const salaries = mkTable('Salaries', [['Equipment', '50000'], ['Supplies', '25000'],
        ['Chemicals', '15000'], ['Glassware', '5000'], ['Safety', '8000'], ['Maintenance', '12000'],
        ['Calibration', '6000'], ['Waste', '4000'], ['Salaries', '3861416']]);
    const expenses = mkTable('lab_expenses', [['a', '1'], ['b', '2']]);
    const pt = { root: [salaries, expenses] };
    const d = (f) => diag(pt, expenses, f, null);   // returns a promise

    // a row past the end: the one from the screenshot
    let r = await d('=Salaries[1][9]');
    ok(!r.ok, 'a row past the end is an error');
    ok(/9 rows \(0 to 8\)/.test(r.why) && /asks for row 9/.test(r.why),
       'said in the table’s own numbers: ' + r.why);
    ok(r.suggest === '=Salaries[1][8]', 'and the fix is the last row: ' + r.suggest);

    // a column past the end
    r = await d('=Salaries[5][2]');
    ok(!r.ok && /2 columns \(0 to 1\)/.test(r.why), 'a column past the end too: ' + r.why);
    ok(r.suggest === '=Salaries[1][2]', 'fixed to the last column: ' + r.suggest);

    // a range, trimmed rather than moved
    r = await d('=sum(Salaries[1:1][0:40])');
    ok(!r.ok && r.suggest === '=sum(Salaries[1:1][0:8])',
       'a range stops at the last row rather than sliding: ' + r.suggest);

    // a name that is not there, with one that nearly is
    r = await d('=Salarys[1][2]');
    ok(!r.ok && /no table called "Salarys"/.test(r.why) && /"Salaries"/.test(r.why),
       'a near-miss name is named: ' + r.why);
    ok(r.suggest === '=Salaries[1][2]', 'and the fix uses it: ' + r.suggest);

    // a name that is nothing like anything: no invented fix, but the tables are listed
    r = await d('=Zebra[0][0]');
    ok(!r.ok && !r.suggest, 'a name nothing like any table gets no invented fix');
    ok(/"Salaries"/.test(r.about) && /"lab_expenses"/.test(r.about),
       'and the tables that ARE here are listed: ' + r.about);

    // in range but empty: the off-by-one that is not an engine error at all
    const sparse = mkTable('S', [['x', '1'], ['y', '2'], ['', '']]);
    const pt2 = { root: [sparse] };
    r = await diag(pt2, sparse, '=S[1][2]', null);
    ok(!r.ok && /row 2 is empty/.test(r.why), 'a reference to an empty cell is caught: ' + r.why);
    ok(r.suggest === '=S[1][1]', 'and pointed at the last row with anything in it: ' + r.suggest);

    // what must NOT be reported
    ok((await diag(pt, expenses, '=Salaries[1][8]', null)).ok, 'a reference that is fine is left alone');
    ok((await diag(pt, expenses, '=sum(Salaries[1:1][0:8])', null)).ok, 'and so is a range that fits');
    ok((await diag(pt, expenses, '12000', null)).ok, 'a plain number is not a formula');
    ok((await diag(pt, expenses, '', null)).ok, 'nor is an empty cell');
    ok((await diag(pt, expenses, '=1+1', null)).ok, 'a formula with no references is not judged');

    // EVERY SUGGESTION IS A REAL REFERENCE. Whatever it offers must itself come back clean.
    for (const f of ['=Salaries[1][9]', '=Salaries[5][2]', '=sum(Salaries[1:1][0:40])',
                     '=Salarys[1][2]', '=S[1][2]']) {
        const first = /^=S\[/.test(f) ? await diag(pt2, sparse, f, null) : await d(f);
        if (!first.suggest) continue;
        const second = /^=S\[/.test(first.suggest) ? await diag(pt2, sparse, first.suggest, null)
            : await d(first.suggest);
        ok(second.ok, 'the fix offered for ' + f + ' is itself a working reference: ' + first.suggest);
    }

    // ---- the editor ---------------------------------------------------------------------
    const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
    ok(/diagnose-formula\.js/.test(plate), 'the cell editor asks for a diagnosis');
    ok(/first\.hasError\(\) *\)/.test(plate.replace(/\s+/g, ' ')) || /hasError\(\)/.test(plate),
       'only for a cell that is actually in error');
    ok(/key: 'fix', label: 'Fix it'/.test(plate), 'and offers Fix it');
    ok(plate.indexOf("key: 'fix'") < plate.indexOf("{ key: 'each', label: 'Add to each' }, { key: 'delete'"),
       'first, because a cell that is already wrong has nothing in the box worth keeping');
    const fixBlock = plate.slice(plate.indexOf("if (r.action === 'fix')"),
        plate.indexOf("if (r.action === 'tag')"));
    ok(/pt\.addFormula\(/.test(fixBlock), 'the correction is registered with the track, not just the cell');
    ok(/clearError/.test(fixBlock), 'and the error is cleared off the cell');
    ok(/code\.trim\(\) !== /.test(fixBlock),
       'an edited box wins over the suggestion: what the user typed is theirs');
    ok(/This cell is in error: /.test(plate), 'the panel says why');
    ok(/Nothing is changed until you press a button/.test(plate), 'and that nothing has happened yet');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

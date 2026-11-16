// ROWS MOVED, SO THE FORMULAS MOVE WITH THEM.
//
//     node tools/test/shift-formulas.js
//
// Inserting a row shifted the cells and left everything that referred to them pointing at
// what used to be there: a total stopped counting the row it was built to count, a figure on
// another sheet read its neighbour's number, and a reference past the new end went red.
// None of it was announced, which is what made it dangerous.
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
const shift = (pt, name, at, by) => load('baja/plate/ops/shift-formulas.js', pt, name, at, by);

// A cell the way GenericWell behaves where this module touches it: setValue writes, and
// setError is what puts the red badge on and what the cell editor's diagnosis then reads.
const cell = (v) => ({
    value: v,
    setValue(x) { this.value = x; },
    setError(m) { this.__hasError = true; this.__errorMessage = m; },
    hasError() { return !!this.__hasError; }
});
const mkTable = (name, rows) => ({
    name: name, formula: {},
    wells: (rows[0] || []).map((_, c) => rows.map((r) => cell(r[c])))
});

(async () => {
    // Salaries: labels and numbers, with a total at the foot that sums rows 0..3
    const sal = mkTable('Salaries', [['Director', '200000'], ['Scientist', '120000'],
        ['Technician', '70000'], ['Intern', '40000'], ['Total', '=sum(Salaries[1:1][0:3])']]);
    sal.formula['[1:1][4:4]'] = '=sum(Salaries[1:1][0:3])';
    // another sheet reading one of those rows and the total
    const exp = mkTable('expenses', [['Salaries', '=Salaries[1][4]'], ['Interns', '=Salaries[1][3]'],
        ['Rent', '50000']]);
    exp.formula['[1:1][0:0]'] = '=Salaries[1][4]';
    exp.formula['[1:1][1:1]'] = '=Salaries[1][3]';
    const pt = { root: [sal, exp], formulas: {
        'Salaries[1:1][4:4]': '=sum(Salaries[1:1][0:3])',
        'expenses[1:1][0:0]': '=Salaries[1][4]',
        'expenses[1:1][1:1]': '=Salaries[1][3]'
    } };

    // one row inserted at row 2, so Technician and everything under it moves down
    const r = await shift(pt, 'Salaries', 2, 1);

    // A RANGE THAT SPANS THE INSERTION GROWS: that is what inserting into a list is for
    ok(sal.wells[1][4].value === '=sum(Salaries[1:1][0:4])',
       'the total now covers the inserted row: ' + sal.wells[1][4].value);
    ok(sal.formula['[1:1][5:5]'] === '=sum(Salaries[1:1][0:4])',
       'and it is held against the row it has MOVED to: ' + JSON.stringify(Object.keys(sal.formula)));
    ok(!sal.formula['[1:1][4:4]'], 'not the row it used to be on');
    ok(pt.formulas['Salaries[1:1][5:5]'] === '=sum(Salaries[1:1][0:4])',
       'the project map moved with it: ' + JSON.stringify(Object.keys(pt.formulas)));

    // ALL ALONG THE PATH: the other sheet follows too
    ok(exp.wells[1][0].value === '=Salaries[1][5]',
       'a cell on another table that read the total still reads the total: ' + exp.wells[1][0].value);
    ok(exp.wells[1][1].value === '=Salaries[1][4]',
       'and one that read Intern still reads Intern: ' + exp.wells[1][1].value);
    ok(exp.formula['[1:1][0:0]'] === '=Salaries[1][5]', 'its stored formula too');
    ok(pt.formulas['expenses[1:1][0:0]'] === '=Salaries[1][5]', 'and the project map');
    ok(exp.wells[1][2].value === '50000', 'a plain number is not touched');

    ok(r.refs >= 4 && r.keys >= 1, 'and it reports what moved: ' + JSON.stringify(r));

    // ABOVE THE INSERTION IS LEFT ALONE
    const above = mkTable('T', [['a', '=T[0][0]'], ['b', '']]);
    const pt2 = { root: [above], formulas: {} };
    await shift(pt2, 'T', 1, 2);
    ok(above.wells[1][0].value === '=T[0][0]', 'a reference above the insertion does not move');

    // A SIMILAR NAME IS NOT THE SAME NAME
    const sim = mkTable('Salary', [['x', '=Salary[0][3]']]);
    const sim2 = mkTable('Salaries', [['y', '=Salaries[0][3]']]);
    const pt3 = { root: [sim, sim2], formulas: {} };
    await shift(pt3, 'Salaries', 0, 1);
    ok(sim.wells[1][0].value === '=Salary[0][3]', 'Salary is untouched by a shift in Salaries');
    ok(sim2.wells[1][0].value === '=Salaries[0][4]', 'while Salaries itself moves');

    // keys moving down do not land on each other
    const stack = mkTable('S', [['a'], ['b'], ['c']]);
    stack.formula['[0:0][0:0]'] = '=1';
    stack.formula['[0:0][1:1]'] = '=2';
    stack.formula['[0:0][2:2]'] = '=3';
    const pt4 = { root: [stack], formulas: {} };
    await shift(pt4, 'S', 0, 1);
    ok(Object.keys(stack.formula).sort().join(',') === '[0:0][1:1],[0:0][2:2],[0:0][3:3]',
       'three keys shift down without overwriting each other: ' + Object.keys(stack.formula).sort().join(','));
    ok(stack.formula['[0:0][1:1]'] === '=1' && stack.formula['[0:0][3:3]'] === '=3',
       'and each keeps its own formula, in order');

    // nothing asked, nothing done
    const quiet = mkTable('Q', [['a', '=Q[0][0]']]);
    const pt5 = { root: [quiet], formulas: {} };
    const none = await shift(pt5, 'Q', 0, 0);
    ok(none.refs === 0 && quiet.wells[1][0].value === '=Q[0][0]', 'a shift of zero changes nothing');

    // ================= REMOVING ROWS: the same move backwards ==========================
    //
    // With one thing insertion never has: a formula pointing INTO the rows that are going.
    // Shifting it up would make it read its neighbour's number, which is a wrong figure that
    // looks right, so it is left alone, marked, and counted.
    const del = mkTable('D', [['a', '10'], ['b', '20'], ['c', '30'], ['d', '40'],
        ['Total', '=sum(D[1:1][0:3])']]);
    del.formula['[1:1][4:4]'] = '=sum(D[1:1][0:3])';
    const other = mkTable('other', [['below', '=D[1][4]'], ['inside', '=D[1][2]'],
        ['above', '=D[1][0]'], ['span', '=sum(D[1:1][1:4])']]);
    const ptd = { root: [del, other], formulas: { 'D[1:1][4:4]': '=sum(D[1:1][0:3])' } };

    // ASK FIRST: what would break, with nothing touched
    const plan = await load('baja/plate/ops/shift-formulas.js', ptd, 'D', 2, -1, { plan: true });
    ok(plan.orphans === 1, 'the plan finds the one formula that reads the row being removed: '
       + JSON.stringify(plan.orphan_where));
    ok(other.wells[1][0].value === '=D[1][4]', 'and nothing was changed by asking');
    ok(ptd.formulas['D[1:1][4:4]'] === '=sum(D[1:1][0:3])', 'the maps are untouched too');

    // now do it: row 2 ("c") goes
    const r2 = await shift(ptd, 'D', 2, -1);
    ok(other.wells[1][0].value === '=D[1][3]',
       'a reference BELOW the removed row moves up: ' + other.wells[1][0].value);
    ok(other.wells[1][2].value === '=D[1][0]', 'one above it is untouched');
    ok(other.wells[1][3].value === '=sum(D[1:1][1:3])',
       'a range across the removed row SHRINKS by what went: ' + other.wells[1][3].value);
    ok(del.wells[1][4].value === '=sum(D[1:1][0:2])',
       'the total now sums what is left: ' + del.wells[1][4].value);
    ok(del.formula['[1:1][3:3]'] === '=sum(D[1:1][0:2])',
       'and is held against the row it moved up to: ' + JSON.stringify(Object.keys(del.formula)));
    ok(ptd.formulas['D[1:1][3:3]'] === '=sum(D[1:1][0:2])', 'the project map moved too');

    // THE ORPHAN. Left as it was, marked, counted: never silently pointed somewhere else.
    ok(other.wells[1][1].value === '=D[1][2]',
       'a formula that read the removed row is NOT quietly moved: ' + other.wells[1][1].value);
    ok(other.wells[1][1].hasError() === true, 'it is marked in error instead');
    ok(/row that was removed/.test(other.wells[1][1].__errorMessage || ''),
       'with a reason the cell editor can show: ' + other.wells[1][1].__errorMessage);
    ok(r2.orphans === 1, 'and counted: ' + JSON.stringify({ orphans: r2.orphans, refs: r2.refs }));

    // a key ON a removed row goes with it
    const kill = mkTable('K', [['a'], ['b'], ['c']]);
    kill.formula['[0:0][1:1]'] = '=1';
    kill.formula['[0:0][2:2]'] = '=2';
    const ptk = { root: [kill], formulas: {} };
    await shift(ptk, 'K', 1, -1);
    ok(!kill.formula['[0:0][1:1]'] || kill.formula['[0:0][1:1]'] === '=2',
       'the key on the removed row is gone and the one below took its place: '
       + JSON.stringify(kill.formula));
    ok(!kill.formula['[0:0][2:2]'], 'nothing is left behind at the old position');

    // several rows at once
    const many = mkTable('M', [['a'], ['b'], ['c'], ['d'], ['e']]);
    const ptm = { root: [many, mkTable('z', [['x', '=M[0][4]']])], formulas: {} };
    await shift(ptm, 'M', 1, -3);
    ok(ptm.root[1].wells[1][0].value === '=M[0][1]',
       'three rows removed moves a reference up by three: ' + ptm.root[1].wells[1][0].value);

    // ---- the operation says what it did -------------------------------------------------
    const op = fs.readFileSync('baja/plate/ops/table-size.js', 'utf8');
    ok(/shift-formulas\.js/.test(op), 'inserting rows calls the shifter');
    ok(/formula reference/.test(op) && /moved with the rows/.test(op),
       'and says how many moved rather than telling the user to go and check');
    ok(!/still point at the old rows/.test(op), 'the old warning is gone, because it is no longer true');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

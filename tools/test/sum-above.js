// TOTAL THE CELLS ABOVE THIS ONE.
//
//     node tools/test/sum-above.js
//
// "make this cell sum the total above", typed into the cell at the foot of a column of
// costs, came back as "Nothing here does that: writing a formula that sums the cells above
// a selected cell". It is the commonest thing anybody does to a column of numbers.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Jeff's table: a heading, seven costs, and the empty cell under them.
const mkWell = (v) => ({ value: v == null ? null : v, setValue(x) { this.value = x; } });
const mkTable = (name, cols) => {
    const t = { name: name, wells: [], formula: {} };
    const rows = cols[0].length;
    for (let c = 0; c < cols.length; c++) {
        t.wells.push(cols[c].map((v) => mkWell(v)));
    }
    t.wells[0][0].skin_type = 'ColumnHeader';
    t.wells[1][0].skin_type = 'ColumnHeader';
    t.getWellRange = (cells) => {
        const w = cells[0];
        for (let c = 0; c < t.wells.length; c++) {
            const r = t.wells[c].indexOf(w);
            if (r >= 0) return '[' + c + ':' + c + '][' + r + ':' + r + ']';
        }
        return '';
    };
    t.rows = rows;
    return t;
};
const mkProject = (t) => {
    const pt = { root: [t], formulas: {}, messages: [], selected_well: null,
        addFormula(k, f) { this.formulas[k] = f; },
        updateCalculations() { }, wake() { },
        setMessage(m) { this.messages.push('' + m); },
        getTableByName(n) { return this.root.find((x) => x.name === n) || null; } };
    return { plateTrack: pt };
};

(async () => {
    const labels = ['Assumption', 'Fuel costs', 'Maintenance and repairs', 'Insurance',
        'Pilot salaries', 'Ground crew salaries', 'Licensing and permits', '', ''];
    const values = ['Cost', '180000', '150000', '80000', '200000', '90000', '25000', '', ''];
    let t = mkTable('assumptions', [labels, values]);
    let pm = mkProject(t);
    // The cell Jeff was standing in: column B, row 7, under the seven costs.
    pm.plateTrack.selected_well = t.wells[1][7];

    let r = await load('baja/plate/ops/sum-above.js', pm, { how: 'sum' });
    ok(!r.error, 'it is no longer refused: ' + (r.error || '(no error)'));
    ok(r.formula === '=sum(assumptions[1:1][1:6])',
       'the range is the run of numbers above it, under the heading: ' + r.formula);
    ok(r.rows === 6, 'six cells, which is what is actually above it: ' + r.rows);
    ok(t.wells[1][7].value === '=sum(assumptions[1:1][1:6])', 'and the cell holds it');
    ok(pm.plateTrack.formulas['assumptions[1:1][7:7]'] === r.formula,
       'stored per cell, the way an iterator reads it: '
       + JSON.stringify(Object.keys(pm.plateTrack.formulas)));
    ok(/sums the 6 cells above it/.test(pm.plateTrack.messages.join(' ')),
       'and it says what it did: ' + pm.plateTrack.messages.join(' | '));

    // ---- the run stops where a person would stop reading ----------------------------------
    // A second block of costs under a subtotal must not be reached into.
    const l2 = ['Assumption', 'Fuel', 'Oil', 'Subtotal', 'Hangar', 'Dock', ''];
    const v2 = ['Cost', '100', '200', '=sum(x)', '300', '400', ''];
    t = mkTable('two blocks', [l2, v2]);
    pm = mkProject(t);
    // A blank row would break the run; here the break is the word in the label column, so
    // use a non-numeric value to end it.
    t.wells[1][3].value = 'n/a';
    pm.plateTrack.selected_well = t.wells[1][6];
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(r.formula === '=sum(two blocks[1:1][4:5])',
       'a non-number ends the run, so the total covers its own block only: ' + r.formula);

    // A cell holding a formula IS a number: a column of subtotals totals.
    t = mkTable('subtotals', [['H', 'a', 'b', ''], ['H', '=sum(q)', '=sum(w)', '']]);
    t.wells[1][1].formula = '=sum(q)'; t.wells[1][2].formula = '=sum(w)';
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][3];
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(r.formula === '=sum(subtotals[1:1][1:2])',
       'a cell that holds its own formula counts as a number: ' + r.formula);

    // ---- what it will not do, and says ------------------------------------------------------
    t = mkTable('empty above', [['H', 'a', ''], ['H', '', '']]);
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][2];
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(/cell above is empty/.test(r.error || ''), 'nothing above is said: ' + r.error);

    t = mkTable('words', [['H', 'a', ''], ['H', 'Jet A, 2026', '']]);
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][2];
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(/not a number/.test(r.error || '') && /Jet A/.test(r.error || ''),
       'and a word above is named, rather than written into a formula that goes red: ' + r.error);

    t = mkTable('headings', [['H', ''], ['H', '']]);
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][1];
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(/heading/.test(r.error || ''), 'a heading above is said: ' + r.error);

    t = mkTable('nosel', [['H', '1', ''], ['H', '2', '']]);
    pm = mkProject(t);
    r = await load('baja/plate/ops/sum-above.js', pm, {});
    ok(/click the cell/.test(r.error || ''), 'and no selection asks for one: ' + r.error);

    // ---- the other things it can take -------------------------------------------------------
    t = mkTable('avg', [['H', 'a', 'b', ''], ['H', '10', '20', '']]);
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][3];
    r = await load('baja/plate/ops/sum-above.js', pm, { how: 'average' });
    ok(r.formula === '=average(avg[1:1][1:2])', 'average: ' + r.formula);
    t = mkTable('mx', [['H', 'a', 'b', ''], ['H', '10', '20', '']]);
    pm = mkProject(t);
    pm.plateTrack.selected_well = t.wells[1][3];
    r = await load('baja/plate/ops/sum-above.js', pm, { how: 'maximum' });
    ok(r.formula === '=max(mx[1:1][1:2])', 'and the user’s word for it: ' + r.formula);

    // ---- the planner has to be able to find it ------------------------------------------------
    const caps = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8').replace(/\s+/g, ' ');
    ok(/make this cell sum the total above/.test(caps),
       'the catalogue carries the sentence that was refused');
    ok(/name: 'sum_above'/.test(caps), 'under its own operation');
    ok(/For a cell that reads a DIFFERENT table use cell_from_table/.test(caps),
       'and says how it differs from the two that were already there');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

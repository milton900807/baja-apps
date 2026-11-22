// A FORMULA WORKED OUT FROM WORDS, OR FROM A FORMULA THAT DID NOT WORK.
//
//     node tools/test/formula-from-words.js
//
// A cell holding "=sum the cells above" was red, and pressing Enter on it wrote the same
// text back and left it red. Enter on a red cell now asks for the formula to be worked out.
//
// The model is stubbed: what is tested is what is done with its answer, which is where a
// generated formula would get into a workbook unchecked.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let answers = [], asked = [], engine = () => ({ results: [1] }), menuAsked = 0;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/formula-write.py') { asked.push(a); return answers.shift() || { status: 'OK', formula: '', note: '' }; }
    if (p === 'py/bio/project/menu-pick.py') { menuAsked++; return { status: 'OK' }; }
    if (p === 'baja/plate/ops/frun-object.js') { return engine(a[0]); }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), pushHistory: () => { },
    getIonFunction: () => null, createIonFunction: (f) => f };
global.pushHistory = () => { };
global.HM = () => ({});

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mkCell = (v) => ({ value: v, setValue(x) { this.value = x; },
    setError(m) { this.__hasError = true; this.__errorMessage = m; },
    clearError() { this.__hasError = false; this.__errorMessage = null; },
    hasError() { return !!this.__hasError; } });
const mkTable = (name, rows) => {
    const t = { name: name, formula: {}, wells: [] };
    for (let c = 0; c < rows[0].length; c++) t.wells.push(rows.map((r) => mkCell(r[c])));
    for (let c = 0; c < rows[0].length; c++) t.wells[c][0].skin_type = 'ColumnHeader';
    t.__sel = [];
    t.getSelectedWellsInOrder = () => t.__sel;
    t.getWellRange = (l) => { for (let c = 0; c < t.wells.length; c++) { const r = t.wells[c].indexOf(l[0]);
        if (r >= 0) return '[' + c + ':' + c + '][' + r + ':' + r + ']'; } return ''; };
    return t;
};

(async () => {
    const mk = () => {
        const fc = mkTable('flight_cost', [['Cost Item', 'Amount', 'Notes'], ['Fuel', '8500', 'Average per flight'],
            ['Crew Salaries', '3200', 'Pilot and co-pilot'], ['Cabin Crew', '1800', ''], ['Depreciation', '', '']]);
        const as = mkTable('assumptions', [['Assumption', 'Value'], ['Annual Insurance', '45000']]);
        const pt = { root: [fc, as], selectedPlate: fc, formulas: {}, said: [],
            setMessage(m) { this.said.push('' + m); }, wake() { }, updateCalculations() { },
            addFormula(k, f) { this.formulas[k] = f; },
            getTableByName: (n) => [fc, as].filter((x) => x.name === n)[0] || null };
        const foot = fc.wells[1][4];
        foot.value = '=fuel plus crew salaries'; foot.setError('could not be worked out');
        fc.formula['[1:1][4:4]'] = 'fuelpluscrewsalaries';
        fc.__sel = [foot];
        return { fc, as, pt, foot };
    };
    const run = (x, o) => load('baja/plate/ops/formula-from-words.js', x.pt, o || {});

    // ---- the words in a red cell become a formula ------------------------------------------
    let x = mk(); asked = [];
    answers = [{ status: 'OK', formula: '=flight_cost[1:1][1:1]+flight_cost[1:1][2:2]', note: '' }];
    let r = await run(x);
    ok(!r.error && r.formula === '=flight_cost[1:1][1:1]+flight_cost[1:1][2:2]', 'it is worked out: ' + JSON.stringify(r));
    ok(x.foot.value === r.formula && x.fc.formula['[1:1][4:4]'] === r.formula && x.pt.formulas['flight_cost[1:1][4:4]'] === r.formula,
       'and written the way every other formula is');
    ok(x.foot.hasError() === false, 'the cell is no longer red');
    ok(/That cell is now =flight_cost/.test(x.pt.said.join(' ')) && /fuel plus crew salaries/.test(x.pt.said.join(' ')) && /Undo/.test(x.pt.said.join(' ')),
       'and it says what it wrote and what it replaced: ' + x.pt.said.join(' | '));
    const ctx = JSON.parse(asked[0][1]);
    ok(asked[0][0] === '=fuel plus crew salaries', 'with nothing passed in, the cell’s own text is the request');
    ok(ctx.cell.ref === 'flight_cost[1:1][4:4]' && ctx.why_it_is_red === 'could not be worked out',
       'the generator is told which cell and why it is red: ' + JSON.stringify(ctx.cell));
    ok(ctx.this_table.headings.join(',') === 'Cost Item,Amount,Notes' && ctx.this_table.cells[1].values[0] === 'Fuel'
       && ctx.this_table.cells[4].values[1] === '(THIS CELL)' && ctx.other_tables[0].table === 'assumptions',
       'and what is around it: the headings, the row labels, where the cell is, the other tables');

    // ---- what is refused, and what happens then --------------------------------------------
    const refuse = async (formula, why, re) => {
        x = mk(); asked = [];
        answers = [{ status: 'OK', formula: formula, note: '' }, { status: 'OK', formula: formula, note: '' }];
        r = await run(x);
        ok(!!r.error && re.test(r.error) && x.foot.value === '=fuel plus crew salaries' && x.foot.hasError(),
           why + ': ' + r.error);
    };
    await refuse('=costs[1:1][1:1]*2', 'a table that is not on the canvas is not written', /"costs" is not a table/);
    await refuse('=flight_cost[1:1][1:9]', 'a row past the end of the table', /rows 0 to 4/);
    await refuse('=flight_cost[1:1][1:4]', 'a formula that reads its own cell', /reads the cell it is written in/);
    await refuse('=VLOOKUP(flight_cost[1:1][1:1], 2)', 'a function the engine does not have', /"VLOOKUP" is not/);
    await refuse('=flight_cost[Amount]*2', 'a reference not written the engine’s way', /not written as/);
    await refuse('=(flight_cost[1:1][1:1]+2', 'brackets that do not match', /brackets do not match/);
    ok(asked.length === 2 && JSON.parse(asked[1][1]).rejected && /brackets/.test(JSON.parse(asked[1][1]).rejected.why),
       'a refused formula goes back once, with the reason, and no more than once: ' + asked.length);

    // a second answer that is right is taken
    x = mk();
    answers = [{ status: 'OK', formula: '=sum(costs[1:1][1:3])', note: '' },
        { status: 'OK', formula: '=sum(flight_cost[1:1][1:3])', note: '' }];
    r = await run(x, { what: '=sum the amounts' });
    ok(r.formula === '=sum(flight_cost[1:1][1:3])', 'the second try is used when it passes: ' + JSON.stringify(r));

    // tried in the engine before it is written
    x = mk(); engine = () => ' failed to calculate';
    answers = [{ status: 'OK', formula: '=flight_cost[1:1][1:1]/flight_cost[2:2][1:1]', note: '' },
        { status: 'OK', formula: '=flight_cost[1:1][1:1]/flight_cost[2:2][1:1]', note: '' }];
    r = await run(x);
    ok(!!r.error && /engine could not work it out/.test(r.error) && x.foot.value === '=fuel plus crew salaries',
       'a formula the engine cannot work out is not written either: ' + r.error);
    engine = () => ({ results: [1] });

    // nothing to go on is said, not guessed
    x = mk(); answers = [{ status: 'OK', formula: '', note: 'it does not say which rows' }];
    r = await run(x);
    ok(/does not say which rows/.test(r.error) && /as it was/.test(r.error), 'an empty answer is passed on with its reason: ' + r.error);
    x = mk(); x.fc.__sel = [x.fc.wells[1][1], x.fc.wells[1][2]];
    r = await run(x);
    ok(/select one cell/.test(r.error), 'and it is for one cell: ' + r.error);

    // ---- Enter on a red cell, through the card ---------------------------------------------
    const card = async (x2, text, repair) => {
        document.body.innerHTML = '';
        await load('baja/plate/menu/project-command.js', { menus: [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }],
            pm: x2.pt, text: text, repair: repair, context: {}, setError: () => { } });
        await sleep(40);
    };
    // a broken formula that is not words: only repaired when it is the red cell's own
    x = mk(); x.foot.value = '=sum(flight_cost[1:1][1:3'; asked = []; menuAsked = 0;
    answers = [{ status: 'OK', formula: '=sum(flight_cost[1:1][1:3])', note: '' }];
    await card(x, '=sum(flight_cost[1:1][1:3', true);
    ok(x.foot.value === '=sum(flight_cost[1:1][1:3])' && !x.foot.hasError() && menuAsked === 0,
       'Enter on a red formula repairs it: ' + x.foot.value);
    x = mk(); x.foot.value = ''; asked = [];
    await card(x, '=sum(flight_cost[1:1][1:3', false);
    ok(asked.length === 0 && x.foot.value === '=sum(flight_cost[1:1][1:3',
       'the same text typed fresh is still just a formula, written as typed');
    // the totalling sentence needs no model even here
    x = mk(); x.foot.value = '=sum the cells above'; asked = [];
    await card(x, '=sum the cells above', true);
    ok(x.foot.value === '=sum(flight_cost[1:1][1:3])' && asked.length === 0 && !x.foot.hasError(),
       '"=sum the cells above" on a red cell becomes the total, with no model: ' + x.foot.value);

    // ---- Enter pressed on the cell itself, not in the field at the top -----------------------
    // This is where it was actually being pressed. The table's own handler moves the
    // selection on, so the cell is named to the repair rather than read off the selection.
    {
        const press = (target) => {
            const e = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            (target || document.body).dispatchEvent(e);
        };
        x = mk(); x.foot.value = '=sum the cells above'; asked = [];
        x.pt.selected_well = x.foot;
        const h = await load('baja/plate/ops/repair-on-enter.js', x.pt);
        press();
        // what the table's own Enter does: the selection moves on
        x.pt.selected_well = null; x.fc.__sel = [];
        await sleep(700);
        ok(x.foot.value === '=sum(flight_cost[1:1][1:3])' && !x.foot.hasError() && asked.length === 0,
           'Enter on a red "=sum the cells above" makes it the total, though the selection has moved on: ' + x.foot.value);

        x.foot.value = '=fuel plus crew salaries'; x.foot.setError('Cannot destructure property'); asked = [];
        x.pt.selected_well = x.foot;
        answers = [{ status: 'OK', formula: '=flight_cost[1:1][1:1]+flight_cost[1:1][2:2]', note: '' }];
        press();
        x.pt.selected_well = null;
        await sleep(700);
        ok(x.foot.value === '=flight_cost[1:1][1:1]+flight_cost[1:1][2:2]' && asked.length === 1,
           'other words in a red cell are worked out for that cell: ' + x.foot.value);

        // a cell that goes red only after the key, once the project has recalculated
        x.foot.value = '=sum the cells above'; x.foot.clearError(); x.pt.selected_well = x.foot;
        press();
        setTimeout(() => { x.foot.setError('late'); }, 650);
        await sleep(1200);
        ok(x.foot.value === '=sum(flight_cost[1:1][1:3])', 'a cell that turns red after the recalculation is still caught: ' + x.foot.value);

        // what it leaves alone
        asked = []; x.fc.wells[1][1].value = '8500'; x.pt.selected_well = x.fc.wells[1][1];
        press(); await sleep(700);
        ok(x.fc.wells[1][1].value === '8500' && asked.length === 0, 'a cell that is not red is never touched');
        x.foot.value = '=fuel plus crew salaries'; x.foot.setError('e'); x.pt.selected_well = x.foot;
        const box = document.createElement('input'); document.body.appendChild(box); box.focus();
        press(box); await sleep(700);
        ok(x.foot.value === '=fuel plus crew salaries' && asked.length === 0, 'and Enter in a text field belongs to the field');
        box.remove();
        h.remove();
        const trackSrc = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
        ok(/exec\('baja\/plate\/ops\/repair-on-enter\.js', this\)/.test(trackSrc), 'the track installs it when it starts');
    }

    // ---- the field that decides to ask -----------------------------------------------------
    const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
    const k = nav.indexOf('const red = (() => {');
    ok(k > 0 && k < nav.indexOf('if (!looksLikeASentence(t)) {'),
       'the red cell is looked at before the text is handed to the formula engine');
    ok(/repair: true/.test(nav) && /ws\[0\]\.hasError\(\)/.test(nav) && /ws\.length !== 1/.test(nav),
       'only for one selected cell that is red');
    ok(/squash\(ws\[0\]\.value\) !== typed && squash\(stored\) !== typed/.test(nav),
       'and only when the field still says what the cell says: a changed field is a new formula');

    // ---- the catalogue and the generator ---------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('write_formula') >= 0, 'write_formula is offered to the planner');
    ok(/work out a formula for the selected cell: fuel plus crew/.test(cap.preview('write_formula', { what: 'fuel plus crew' })),
       'and its card says what it will do');
    const py = fs.readFileSync('py/bio/project/formula-write.py', 'utf8');
    ok(/NEVER READ THE CELL THE FORMULA IS GOING INTO/.test(py) && /IF THE WORDS DO NOT SAY ENOUGH/.test(py),
       'the generator is told the two things that matter most');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

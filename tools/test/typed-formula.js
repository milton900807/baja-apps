// A FORMULA TYPED AS A REQUEST IS A FORMULA.
//
//     node tools/test/typed-formula.js
//
// =sum(employees[1:1][1:]) typed into the ask box was sent to a model, which answered that
// nothing here does that and suggested clicking the cell and typing it instead. There is
// nothing to work out: an "=" at the front is the user saying exactly what they want.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let askedModel = 0;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/menu-pick.py') { askedModel++; return { status: 'OK' }; }
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

const mkCell = (v) => ({
    value: v, setValue(x) { this.value = x; },
    setError(m) { this.__e = true; this.__m = m; }, clearError() { this.__e = false; },
    hasError() { return !!this.__e; }
});
const mkTable = (name, cols, rows) => {
    const t = { name: name, formula: {}, wells: [] };
    for (let c = 0; c < cols; c++) t.wells.push(Array.from({ length: rows }, () => mkCell('')));
    t.__sel = [];
    t.getSelectedWellsInOrder = () => t.__sel;
    t.getWellIndicies = (w) => {
        for (let c = 0; c < t.wells.length; c++) {
            const r = t.wells[c].indexOf(w);
            if (r >= 0) return { colIdx: c, rowIdx: r };
        }
        return null;
    };
    t.getWellRange = (l) => { const i = t.getWellIndicies(l[0]); return '[' + i.colIdx + '][' + i.rowIdx + ']'; };
    return t;
};

(async () => {
    const t = mkTable('employees', 2, 8);
    let recalcs = 0;
    const pt = {
        root: [t], selectedPlate: t, formulas: {},
        setMessage: () => { }, wake: () => { },
        updateCalculations() { recalcs++; },
        addFormula(k, f) { this.formulas[k] = f; },
        getTableByName: (n) => (n === t.name ? t : null)
    };
    const F = '=sum(employees[1:1][1:])';

    // ---- the operation --------------------------------------------------------------
    t.__sel = [t.wells[1][7]];
    let r = await load('baja/plate/ops/set-formula.js', pt, { formula: F });
    ok(!r.error && r.cells === 1, 'it goes in the selected cell: ' + JSON.stringify(r));
    ok(t.wells[1][7].value === F, 'the cell holds it');
    ok(t.formula['[1][7]'] === F, 'the table holds it');
    ok(pt.formulas['employees[1][7]'] === F, 'and the project does');
    ok(recalcs === 1, 'and the project recalculated: that is the "execute" half');

    // one per cell, so an iterator reads each cell's own row
    t.__sel = [t.wells[1][5], t.wells[1][6]];
    r = await load('baja/plate/ops/set-formula.js', pt, { formula: '=A[0][0]' });
    ok(r.cells === 2 && t.formula['[1][5]'] === '=A[0][0]' && t.formula['[1][6]'] === '=A[0][0]',
       'a selection of two gets one formula each, not one shared');

    // a cell that was red for its old formula does not stay red for a new one
    t.wells[1][4].setError('old');
    t.__sel = [t.wells[1][4]];
    await load('baja/plate/ops/set-formula.js', pt, { formula: '=1+1' });
    ok(t.wells[1][4].hasError() === false, 'the old error is cleared');

    // what it refuses
    t.__sel = [];
    const noSel = Object.assign({}, pt, { selected_well: null });
    r = await load('baja/plate/ops/set-formula.js', noSel, { formula: F });
    ok(!!r.error && /select the cell/.test(r.error), 'with nothing selected it says so: ' + r.error);
    t.__sel = [t.wells[0][0]];
    r = await load('baja/plate/ops/set-formula.js', pt, { formula: 'just text' });
    ok(!!r.error && /not a formula/.test(r.error), 'and text is not a formula: ' + r.error);

    // ---- the card, which must not ask a model -----------------------------------------
    askedModel = 0;
    t.__sel = [t.wells[1][7]];
    t.wells[1][7].value = '';
    await load('baja/plate/menu/project-command.js', {
        menus: [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }],
        pm: pt, text: F, context: {}, setError: () => { }
    });
    await sleep(40);
    ok(askedModel === 0, 'a typed formula asks no model at all');
    ok(t.wells[1][7].value === F, 'it just goes in the cell: ' + t.wells[1][7].value);
    ok(!document.querySelector('#pc-op'), 'and there is no card to confirm: nothing to decide');

    // even with no menubar, which used to be refused before anything else
    askedModel = 0;
    t.__sel = [t.wells[1][3]];
    await load('baja/plate/menu/project-command.js', {
        menus: [], pm: pt, text: '=2+2', context: {}, setError: () => { }
    });
    await sleep(40);
    ok(t.wells[1][3].value === '=2+2',
       'a formula works with nothing on the menubar: whether one can be typed has nothing '
       + 'to do with what is on the menu');

    // a formula that cannot be placed says so on the card rather than vanishing
    t.__sel = [];
    const blind = Object.assign({}, pt, { selectedPlate: null, root: [], selected_well: null });
    await load('baja/plate/menu/project-command.js', {
        menus: [], pm: blind, text: '=3+3', context: {}, setError: () => { }
    });
    await sleep(40);
    ok(/That did not happen/.test(document.body.textContent || ''),
       'the failure is shown: ' + (document.body.textContent || '').slice(0, 80));

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

// ASK, FROM A CELL: VALUES, OR A FORMULA IF IT STARTS WITH "=".
//
//     node tools/test/cell-ask.js
//
// The models are stubbed. What is tested is which service a request reaches, exactly which
// cells are sent and written, and what is refused.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let panels = [], realPanel = false;
let typed = '', prompts = [], fillAsked = [], fillAnswer = null, formulaAsked = [], formulaAnswer = null, cards = [], working = 0;
const load = async (p, ...a) => {
    if (p === 'baja/lib/prompt-text.js') { prompts.push(a[0]); return typed === null ? null : { action: 'go', text: typed }; }
    if (p === 'baja/lib/working.js' && !realPanel) {
        working++;
        const w = { title: a[0], detail: a[1], steps: [], ended: null, done() { working--; },
            step(m) { this.steps.push(m); }, finish(m) { this.ended = { ok: m }; working--; }, fail(m) { this.ended = { failed: m }; working--; } };
        panels.push(w);
        return w;
    }
    if (p === 'py/bio/project/cells-fill.py') { fillAsked.push(a); return typeof fillAnswer === 'function' ? fillAnswer(JSON.parse(a[1])) : fillAnswer; }
    if (p === 'py/bio/project/formula-write.py') { formulaAsked.push(a); return formulaAnswer(JSON.parse(a[1])); }
    if (p === 'baja/plate/ops/frun-object.js') return { results: [1] };
    if (p === 'baja/plate/ops/diagnose-formula.js') return { ok: true };
    if (p === 'baja/plate/menu/project-command.js') { cards.push(a[0]); return null; }
    const path = fs.existsSync(p) ? p : p + '.js';
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), pushHistory: () => { }, getIonFunction: () => null, createIonFunction: (f) => f };
global.pushHistory = () => { }; global.HM = () => ({});

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mk = () => {
    const rows = [['Item', 'Quantity', 'Price', 'Total'], ['woodland', '100', '8', ''], ['Basel Wheat', '200', '7', ''], ['Hops', '', '', '']];
    const t = { name: 'beer', formula: {}, wells: [], __sel: [] };
    for (let c = 0; c < 4; c++) t.wells.push(rows.map((r, i) => {
        const w = { value: r[c], setValue(x) { this.value = x; }, clearError() { }, hasError() { return false; } };
        if (i === 0) w.skin_type = 'ColumnHeader';
        return w;
    }));
    t.getSelectedWellsInOrder = () => t.__sel;
    t.getWellRange = (l) => { for (let c = 0; c < 4; c++) { const r = t.wells[c].indexOf(l[0]); if (r >= 0) return '[' + c + ':' + c + '][' + r + ':' + r + ']'; } return ''; };
    const pt = { root: [t], selectedPlate: t, said: [], formulas: {}, calcs: 0,
        setMessage(m) { this.said.push('' + m); }, wake() { }, updateCalculations() { this.calcs++; }, addFormula(k, f) { this.formulas[k] = f; },
        getTableByName: (n) => (n === 'beer' ? t : null) };
    return { t, pt };
};
const ask = (x, well) => load('baja/plate/ops/cell-ask.js', x.pt, x.t, well);
const reset = () => { prompts = []; fillAsked = []; formulaAsked = []; cards = []; panels = []; };

(async () => {
    // ---- the prompt says what it is for ------------------------------------------------------
    let x = mk(); reset(); typed = null;
    x.t.__sel = [x.t.wells[2][3]];
    let r = await ask(x);
    ok(prompts.length === 1 && /this cell/.test(prompts[0].title) && /Start with = to have a formula/.test(prompts[0].message),
       'one cell: the prompt is about this cell and explains the "=": ' + prompts[0].title);
    ok(r.cancelled === true && !fillAsked.length && !formulaAsked.length, 'cancelling it does nothing');
    x.t.__sel = [x.t.wells[1][3], x.t.wells[2][3]]; reset();
    await ask(x);
    ok(/these 2 cells/.test(prompts[0].title), 'several: it says how many');

    // ---- no "=": values, for exactly the selected cells --------------------------------------
    x = mk(); reset(); typed = 'a typical quantity and price for each';
    x.t.__sel = [x.t.wells[1][3], x.t.wells[2][3], x.t.wells[1][0]];          // two empties and a heading
    fillAnswer = (sent) => ({ status: 'OK', note: '', values: { '1:3': '150', '2:3': '=9', '0:1': 'HACKED', '3:3': '999' } });
    r = await ask(x);
    const sent = JSON.parse(fillAsked[0][1]);
    ok(fillAsked.length === 1 && !formulaAsked.length && !cards.length, 'a request without "=" goes to the value service, and only there');
    ok(sent.cells.map((c) => c.id).join() === '1:3,2:3', 'the selected cells are sent, without the heading: ' + sent.cells.map((c) => c.id).join());
    ok(sent.cells[0].label === 'Hops' && sent.cells[0].heading === 'Quantity' && sent.cells[1].heading === 'Price',
       'each with its row’s label and its column’s heading: ' + JSON.stringify(sent.cells[0]));
    ok(x.t.wells[1][3].value === '150', 'the value is written');
    ok(x.t.wells[2][3].value === '9', 'a value that came back as a formula is written as the value it is, never as a formula: ' + x.t.wells[2][3].value);
    ok(x.t.wells[0][1].value === 'woodland' && x.t.wells[3][3].value === '', 'a cell that was not selected is not written, whatever came back for it');
    ok(x.t.wells[1][0].value === 'Quantity', 'and nor is the heading');
    ok(/2 cells in beer filled in/.test(x.pt.said.join(' ')) && x.pt.calcs === 1 && working === 0, 'it says what it did, recalculates, and takes its panel down: ' + x.pt.said.join(' | ').slice(0, 80));
    // ---- it can be seen happening, and seen to have happened ---------------------------------
    ok(panels.length === 1 && /Filling in 3 cells/.test(panels[0].title) && /a typical quantity and price/.test(panels[0].detail),
       'a panel goes up saying what is being filled in and from what request: ' + panels[0].title + ' / ' + panels[0].detail.slice(0, 50));
    ok(panels[0].ended && /2 cells filled in/.test(panels[0].ended.ok) && /Undo/.test(panels[0].ended.ok),
       'and it ends on the outcome, where the eye already is: ' + (panels[0].ended && panels[0].ended.ok));

    // a cell holding a formula is not typed over
    x = mk(); reset(); typed = 'set these to 0';
    x.t.wells[3][1].value = '=beer[1:1][1:1]*beer[2:2][1:1]';
    x.t.__sel = [x.t.wells[3][1], x.t.wells[3][2]];
    fillAnswer = (s2) => ({ status: 'OK', note: '', values: Object.fromEntries(s2.cells.map((c) => [c.id, '0'])) });
    await ask(x);
    ok(x.t.wells[3][1].value === '=beer[1:1][1:1]*beer[2:2][1:1]' && x.t.wells[3][2].value === '0' && /1 holding a formula was not touched/.test(x.pt.said.join(' ')),
       'a formula among the selected cells is left alone and that is said: ' + x.pt.said.join(' | ').slice(0, 110));
    x = mk(); reset(); typed = 'set this to 0';
    x.t.wells[3][1].value = '=beer[1:1][1:1]*2'; x.t.__sel = [x.t.wells[3][1]];
    await ask(x);
    ok(!fillAsked.length && /holds a formula/.test(x.pt.said.join(' ')) && /Start the request with =/.test(x.pt.said.join(' ')),
       'only a formula selected: nothing is asked, and it says to start with "=": ' + x.pt.said.join(' | ').slice(0, 120));

    // nothing sensible: nothing written, and the reason passed on
    x = mk(); reset(); typed = 'the mood of each'; x.t.__sel = [x.t.wells[1][3]];
    fillAnswer = { status: 'OK', values: {}, note: 'a quantity has no mood' };
    await ask(x);
    ok(x.t.wells[1][3].value === '' && /a quantity has no mood/.test(x.pt.said.join(' ')), 'an empty answer writes nothing and gives its reason');
    ok(panels[0].ended && /a quantity has no mood/.test(panels[0].ended.failed || ''), 'which stays on the panel as a failure until it is closed, not a flicker: ' + JSON.stringify(panels[0].ended));

    // ---- "=" and one cell: a formula for that cell, with the same panel -----------------------
    x = mk(); reset(); typed = '=quantity times price';
    x.t.__sel = [x.t.wells[3][1]];
    formulaAnswer = (ctx) => ({ status: 'OK', note: '', formula: '=beer[1:1][1:1]*beer[2:2][1:1]' });
    await ask(x);
    ok(formulaAsked.length === 1 && !fillAsked.length && x.t.wells[3][1].value === '=beer[1:1][1:1]*beer[2:2][1:1]',
       'a request starting with "=" on one cell has its formula worked out and written: ' + x.t.wells[3][1].value);
    ok(panels.length === 1 && /Working out a formula/.test(panels[0].title) && panels[0].ended && /The formula is written: =beer/.test(panels[0].ended.ok),
       'with a panel that says so and ends on the formula: ' + (panels[0].ended && panels[0].ended.ok));
    // a total of what is above needs no model, and is confirmed the same way
    x = mk(); reset(); typed = '=sum the cells above';
    x.t.wells[1][3].value = ''; x.t.__sel = [x.t.wells[1][3]];
    await ask(x);
    ok(!formulaAsked.length && x.t.wells[1][3].value === '=sum(beer[1:1][1:2])' && panels[0].ended && /=sum\(beer\[1:1\]\[1:2\]\)/.test(panels[0].ended.ok),
       '"=sum the cells above" is answered at once, and still shown to have happened: ' + x.t.wells[1][3].value);

    // ---- "=" and several cells: one formula each, from each cell's own row -------------------
    x = mk(); reset(); typed = '=quantity times price';
    x.t.__sel = [x.t.wells[3][1], x.t.wells[3][2]];
    formulaAnswer = (ctx) => ({ status: 'OK', note: '', formula: '=beer[1:1][' + ctx.cell.row + ':' + ctx.cell.row + ']*beer[2:2][' + ctx.cell.row + ':' + ctx.cell.row + ']' });
    r = await ask(x);
    ok(formulaAsked.length === 2 && !cards.length && !fillAsked.length, 'several cells: the formula service is asked once for each');
    ok(x.t.wells[3][1].value === '=beer[1:1][1:1]*beer[2:2][1:1]' && x.t.wells[3][2].value === '=beer[1:1][2:2]*beer[2:2][2:2]',
       'and each cell gets the formula for its own row: ' + x.t.wells[3][2].value);
    ok(r.formulas === 2 && /2 formulas written/.test(x.pt.said[x.pt.said.length - 1]) && working === 0, 'with one summary at the end: ' + x.pt.said[x.pt.said.length - 1].slice(0, 70));
    ok(panels.length === 1 && panels[0].steps.length === 2 && /cell 1 of 2/.test(panels[0].steps[0]) && /cell 2 of 2, 1 written/.test(panels[0].steps[1]),
       'and the panel counts through them as it goes: ' + panels[0].steps[1]);

    // one of them cannot be worked out: the others still are, and it is said
    x = mk(); reset();
    x.t.__sel = [x.t.wells[3][1], x.t.wells[3][3]];
    formulaAnswer = (ctx) => (ctx.cell.row === 3 ? { status: 'OK', formula: '', note: 'this row has no quantity' }
        : { status: 'OK', note: '', formula: '=beer[1:1][1:1]*beer[2:2][1:1]' });
    r = await ask(x);
    ok(r.formulas === 1 && r.failed === 1 && x.t.wells[3][3].value === '' && /1 cell left as it was: .*no quantity/.test(x.pt.said[x.pt.said.length - 1]),
       'a row it cannot do is left as it was, with the reason: ' + x.pt.said[x.pt.said.length - 1].slice(0, 130));

    // none of them can be done: that is a failure, shown as one
    x = mk(); reset();
    x.t.__sel = [x.t.wells[3][3]];
    formulaAnswer = () => ({ status: 'OK', formula: '', note: 'this row has no quantity' });
    r = await ask(x);
    ok(panels[0].ended && /no quantity/.test(panels[0].ended.failed || '') && !panels[0].ended.ok, 'when nothing could be written the panel ends on the reason, as a failure');

    // a formula written out is not a description: it goes in as typed, to the selection
    x = mk(); reset(); typed = '=sum(beer[1:1][1:3])';
    x.t.__sel = [x.t.wells[3][1], x.t.wells[3][2]];
    await ask(x);
    ok(cards.length === 1 && cards[0].text === '=sum(beer[1:1][1:3])' && !formulaAsked.length, 'a formula that is already written out is entered, not reworked by a model');

    // ---- the real panel: a tick and the outcome, then gone on its own ------------------------
    {
        realPanel = true;
        const w = await load('baja/lib/working.js', 'Filling in 2 cells', 'asking');
        const el = document.getElementById('baja-working');
        ok(!!el && /Filling in 2 cells/.test(el.textContent) && !!el.querySelector('animateTransform'), 'while it works: the title, a spinner and a clock');
        w.finish('2 cells filled in. Undo puts them back.', 60);
        ok(/2 cells filled in/.test(el.textContent) && !el.querySelector('animateTransform') && /#1f9d55/.test(el.innerHTML) && /took \d+ second/.test(el.textContent),
           'when it ends: the outcome in place of the progress, a tick in place of the spinner: ' + el.textContent.trim().slice(0, 70));
        ok(!!document.getElementById('baja-working'), 'still on screen for a moment, long enough to be read');
        await new Promise((res) => setTimeout(res, 120));
        ok(!document.getElementById('baja-working') && !window.__bajaWorking, 'and then gone without having to be dismissed');
        const w2 = await load('baja/lib/working.js', 'x', 'y');
        w2.finish('done', 5000);
        document.getElementById('baja-working').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        ok(!document.getElementById('baja-working'), 'or at once, on a click');
        realPanel = false;
    }

    // ---- the catalogue and the python ----------------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('fill_selection') >= 0 && /fill in the selected cells: x/.test(cap.preview('fill_selection', { what: 'x' })),
       'fill_selection is offered to the planner too');
    const py = fs.readFileSync('py/bio/project/cells-fill.py', 'utf8');
    ok(/if k not in ids:\s*\n\s*continue/.test(py) && /while s\.startswith\("="\)/.test(py), 'the python drops ids it was not asked about and takes the "=" off a value');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

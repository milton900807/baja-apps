// ARITHMETIC ON THE CELLS THAT ARE SELECTED.
//
//     node tools/test/change-values.js
//
// "Increase these values by 10%", with eight salaries selected, had nothing behind it: the
// only way was to retype eight numbers. The cases that matter are the ones where a number
// is not quite a number -- $95,000.00 is a drawing of 95000 -- and the cells that must NOT
// be touched: a formula, because the next recalculation would undo it, and text, because
// that is what makes this safe to type with a whole column selected.
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

const cell = (v, formula) => {
    const w = { value: v, group: {} };
    if (formula) w.formula = formula;
    w.setValue = (x) => { w.value = x; };
    return w;
};
const mkTable = (name, cells) => {
    const t = { name: name, wells: [cells], formula: {} };
    t.getSelectedWellsInOrder = () => cells;
    return t;
};
const mkTrack = (t) => ({ root: [t], selectedPlate: t, setMessage() { }, wake() { },
    updateCalculations() { }, getTableByName: (n) => (n === t.name ? t : null) });
const run = (pt, args) => load('baja/plate/ops/change-values.js', pt, args);
const vals = (cells) => cells.map((c) => c.value);

(async () => {
    // the salaries from the screenshot
    let cells = [cell(95000), cell(110000), cell(85000), cell(65000), cell(52000),
        cell(68000), cell(49999), cell(178000)];
    let t = mkTable('Employees', cells);
    let r = await run(mkTrack(t), { by_percent: 10 });
    ok(!r.error && r.changed === 8, 'eight cells go up a tenth: ' + JSON.stringify(r));
    ok(cells[0].value === 104500, '95000 becomes 104500');
    ok(cells[6].value === 54998.9, 'and 49999 becomes 54998.9, not 54998.900000000001: ' + cells[6].value);

    // rounding, said in the request
    cells = [cell(49999)];
    r = await run(mkTrack(mkTable('T', cells)), { by_percent: 10, round: 'whole' });
    ok(cells[0].value === 54999, 'rounded to a whole number when asked: ' + cells[0].value);
    cells = [cell(49999)];
    r = await run(mkTrack(mkTable('T', cells)), { by_percent: 10, round: 'thousand' });
    ok(cells[0].value === 55000, 'or to the nearest thousand: ' + cells[0].value);

    // a number drawn as money is still a number
    cells = [cell('$95,000.00'), cell('1,200')];
    r = await run(mkTrack(mkTable('T', cells)), { by_percent: 100 });
    ok(cells[0].value === 190000 && cells[1].value === 2400,
       'the currency symbol and separators are read through, and not written back: ' + vals(cells));

    // the cells that must not be touched
    cells = [cell('Director'), cell(100), cell('', '=sum(X[0:0][0:0])'), cell(200)];
    cells[2].value = 999;
    const t2 = mkTable('Mixed', cells);
    r = await run(mkTrack(t2), { by_percent: 50 });
    ok(r.changed === 2, 'only the plain numbers change: ' + JSON.stringify(r));
    ok(cells[0].value === 'Director', 'text is left alone, so a whole column is safe to select');
    ok(cells[2].value === 999, 'and a formula cell is not written over');
    ok(r.skipped_formula === 1 && r.skipped_text === 1, 'both are counted and reported');

    // every selected cell being a formula is a refusal with the reason
    cells = [cell(1, '=A'), cell(2, '=B')];
    r = await run(mkTrack(mkTable('F', cells)), { by_percent: 10 });
    ok(!!r.error && /recalculation/.test(r.error), 'all formulas: it says why nothing happened');

    // the other arithmetic
    cells = [cell(100), cell(50)];
    r = await run(mkTrack(mkTable('T', cells)), { add: -25 });
    ok(vals(cells).join(',') === '75,25', 'a negative add subtracts: ' + vals(cells));
    cells = [cell(100)];
    r = await run(mkTrack(mkTable('T', cells)), { multiply_by: 2 });
    ok(cells[0].value === 200, 'multiply doubles');
    cells = [cell(100), cell(7)];
    r = await run(mkTrack(mkTable('T', cells)), { set_to: 1 });
    ok(vals(cells).join(',') === '1,1', 'set_to replaces them all: ' + vals(cells));

    // nonsense
    r = await run(mkTrack(mkTable('T', [cell(1)])), {});
    ok(!!r.error && /increase, decrease, multiply or set/.test(r.error), 'with no numbers it asks');
    r = await run(mkTrack(mkTable('T', [cell(1)])), { by_percent: 'a lot' });
    ok(!!r.error && /as a number/.test(r.error), 'and a percentage that is not a number is refused');
    r = await run(mkTrack(mkTable('T', [cell(1)])), { by_percent: 10, round: 'ish' });
    ok(!!r.error && /round to what/.test(r.error), 'as is a rounding nobody offers');
    const none = mkTable('T', []);
    none.getSelectedWellsInOrder = () => [];
    r = await run(mkTrack(none), { by_percent: 10 });
    ok(!!r.error && /select the cells first/.test(r.error), 'with nothing selected it says so');

    // ---- the catalogue -----------------------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('change_values') >= 0, 'change_values is offered');
    ok(cap.validate('change_values', { by_percent: 10 }).ok, 'a percentage alone validates');
    ok(!cap.validate('change_values', { round: 'ish' }).ok, 'a rounding that is not offered is refused');
    ok(/up 10%/.test(cap.preview('change_values', { by_percent: 10 })),
       'the card says what it will do: ' + cap.preview('change_values', { by_percent: 10 }));
    ok(/down 10%/.test(cap.preview('change_values', { by_percent: -10 })), 'and which way');
    ok(/10% off/.test(JSON.stringify(cap.catalogue())),
       'with the catalogue saying how "off" is written, since that is the easy one to get backwards');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

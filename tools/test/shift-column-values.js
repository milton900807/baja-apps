// MOVING THE VALUES ALREADY IN A COLUMN.
//
//     node tools/test/shift-column-values.js
//
// Two things are easy to get wrong and invisible afterwards. Writing cell by cell in the
// direction of travel overwrites the next value before it has been read, so a column of
// three becomes the same value three times. And moving a value while leaving its formula
// behind lets the formula recompute and put the old value straight back, so the move looks
// as though it did not happen.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mkTable = (name, cols, rows) => ({
    name: name,
    wells: Array.from({ length: cols }, () => Array.from({ length: rows }, () => ({
        value: '', formula: '', setValue(v) { this.value = v; }
    })))
});
const mkTrack = (tables, selected) => ({
    root: tables, selectedPlate: selected || null,
    getTableByName(n) { return this.root.filter((t) => t.name.toLowerCase() === ('' + n).toLowerCase())[0] || null; },
    updateCalculations() { }, setSelected() { }, setMessage() { }
});
const colOf = (t, c) => t.wells[c].map((w) => w.value);
const fill = (t, c, vals) => vals.forEach((v, i) => { t.wells[c][i].value = v; });

(async () => {
    // the reported request
    let t = mkTable('hellowrold', 2, 6);
    fill(t, 0, ['price', 'cog', 'pn']);
    fill(t, 1, ['x', 'y', 'z']);
    let r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]),
        { table: 'hellowrold', direction: 'down', by: 1 });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    ok(colOf(t, 0).slice(0, 4).join('|') === '|price|cog|pn',
       'EVERY VALUE MOVES DOWN ONE and the top cell is cleared: ' + JSON.stringify(colOf(t, 0)));
    ok(colOf(t, 1).slice(0, 3).join('|') === 'x|y|z', 'the other columns are untouched');

    // no column named: the first
    t = mkTable('x', 2, 4); fill(t, 0, ['a', 'b']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(!r.error && colOf(t, 0).slice(0, 3).join('|') === '|a|b', 'with no column named it is the first');

    // up
    t = mkTable('x', 1, 4); fill(t, 0, ['', 'a', 'b', 'c']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'up', by: 1 });
    ok(!r.error && colOf(t, 0).join('|') === 'a|b|c|', 'up moves them the other way');

    // by more than one
    t = mkTable('x', 1, 5); fill(t, 0, ['a', 'b']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 3 });
    ok(!r.error && colOf(t, 0).join('|') === '|||a|b', 'by moves them that many rows');

    // a gap in the middle is preserved, not closed up
    t = mkTable('x', 1, 5); fill(t, 0, ['a', '', 'b']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(!r.error && colOf(t, 0).join('|') === '|a||b|', 'a gap travels with them rather than being closed');

    // THE OVERWRITE TRAP: writing downward cell by cell would make these all the same
    t = mkTable('x', 1, 6); fill(t, 0, ['1', '2', '3']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(colOf(t, 0).join('|') === '|1|2|3||', 'values are not smeared down the column');

    // formulas travel with their value
    t = mkTable('x', 1, 4);
    t.wells[0][0].value = '7'; t.wells[0][0].formula = '=Inputs[Budget]';
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(t.wells[0][1].value === '7' && t.wells[0][1].formula === '=Inputs[Budget]',
       'A FORMULA MOVES WITH ITS VALUE');
    ok(t.wells[0][0].value === '' && t.wells[0][0].formula === '',
       'and the cell it left is cleared of both');

    // a cell holding only a formula still counts as filled
    t = mkTable('x', 1, 2);
    t.wells[0][1].formula = '=1+1';
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(!!r.error && /pushed out of/.test(r.error),
       'a cell with only a formula is not treated as empty');

    // anything pushed off the end stops the whole move
    t = mkTable('full', 1, 3); fill(t, 0, ['a', 'b', 'c']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(!!r.error && /1 value would be pushed out/.test(r.error), 'it says what would be lost');
    ok(colOf(t, 0).join('|') === 'a|b|c', 'AND NOTHING MOVES: a refusal leaves the column alone');

    // empty cells falling off the end are not a loss
    t = mkTable('x', 1, 3); fill(t, 0, ['a']);
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([t]), { direction: 'down', by: 1 });
    ok(!r.error && colOf(t, 0).join('|') === '|a|', 'empty cells going off the end are not a loss');

    // a direction that is neither
    r = await load('baja/plate/ops/shift-column-values.js', mkTrack([mkTable('x', 1, 3)]),
        { direction: 'sideways', by: 1 });
    ok(!!r.error && /up or down/.test(r.error), 'a direction that is neither is refused');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

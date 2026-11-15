// REARRANGING WHAT IS ALREADY IN A COLUMN, AND MOVING WHOLE COLUMNS.
//
//     node tools/test/rearrange-column.js
//
// The traps, all of which look almost right afterwards: sorting 2, 10, 9 as text; floating
// blanks to the top of a sort so the data hides under them; treating a move as a swap, which
// is identical with two columns and wrong with three; and reading a column after it has been
// written.
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
const mkTrack = (tables) => ({
    root: tables, selectedPlate: tables[0],
    getTableByName(n) { return this.root.filter((t) => t.name.toLowerCase() === ('' + n).toLowerCase())[0] || null; },
    updateCalculations() { }, setSelected() { }, setMessage() { }
});
const fill = (t, c, vals) => vals.forEach((v, i) => { t.wells[c][i].value = v; });
const col = (t, c) => t.wells[c].map((w) => w.value);
const run = (t, args) => load('baja/plate/ops/rearrange-column.js', mkTrack([t]), args);
const mv = (t, args) => load('baja/plate/ops/move-column.js', mkTrack([t]), args);

(async () => {
    // THE REPORTED REQUEST
    let t = mkTable('hellowrold', 2, 5); fill(t, 0, ['rent', 'employees', 'numbre of products']);
    let r = await run(t, { action: 'reverse' });
    ok(!r.error, 'reverse runs: ' + JSON.stringify(r));
    ok(col(t, 0).join('|') === '||numbre of products|employees|rent',
       'REVERSE turns the whole column upside down, gaps included: ' + JSON.stringify(col(t, 0)));

    // sorting
    t = mkTable('x', 1, 5); fill(t, 0, ['pear', 'apple', 'fig']);
    r = await run(t, { action: 'sort_asc' });
    ok(col(t, 0).join('|') === 'apple|fig|pear||', 'sort_asc sorts words');
    r = await run(t, { action: 'sort_desc' });
    ok(col(t, 0).join('|') === 'pear|fig|apple||', 'sort_desc reverses that');

    t = mkTable('x', 1, 4); fill(t, 0, ['2', '10', '9']);
    r = await run(t, { action: 'sort_asc' });
    ok(col(t, 0).join('|') === '2|9|10|', 'A COLUMN OF NUMBERS SORTS AS NUMBERS, not 10 before 2');
    t = mkTable('x', 1, 4); fill(t, 0, ['$1,200', '$300']);
    r = await run(t, { action: 'sort_asc' });
    ok(col(t, 0).join('|') === '$300|$1,200||', 'money sorts as numbers too');
    t = mkTable('x', 1, 4); fill(t, 0, ['10', 'apple', '2']);
    r = await run(t, { action: 'sort_asc' });
    ok(col(t, 0).join('|') === '10|2|apple|', 'a mixed column sorts as text throughout, not half each way');

    t = mkTable('x', 1, 5); fill(t, 0, ['b', '', 'a']);
    r = await run(t, { action: 'sort_asc' });
    ok(col(t, 0).join('|') === 'a|b|||', 'blanks sink to the bottom of a sort');

    // compact, dedupe, fill_down, trim, clear
    t = mkTable('x', 1, 5); fill(t, 0, ['a', '', 'b', '', 'c']);
    r = await run(t, { action: 'compact' });
    ok(col(t, 0).join('|') === 'a|b|c||', 'compact closes the gaps and keeps the order');

    t = mkTable('x', 1, 5); fill(t, 0, ['a', 'B', 'a', 'c']);
    r = await run(t, { action: 'dedupe' });
    ok(col(t, 0).join('|') === 'a|B|c||', 'dedupe keeps the FIRST of each repeat, ignoring case');

    t = mkTable('x', 1, 5); fill(t, 0, ['a', '', '', 'b']);
    r = await run(t, { action: 'fill_down' });
    ok(col(t, 0).join('|') === 'a|a|a|b|b', 'fill_down carries each value into the cells under it');

    t = mkTable('x', 1, 2); t.wells[0][0].value = '7'; t.wells[0][0].formula = '=A[1]';
    r = await run(t, { action: 'fill_down' });
    ok(t.wells[0][1].value === '7' && t.wells[0][1].formula === '',
       'but a FORMULA is not copied down: the same formula twice is the same answer twice');

    t = mkTable('x', 1, 3); fill(t, 0, ['  a   b  ']);
    r = await run(t, { action: 'trim' });
    ok(col(t, 0)[0] === 'a b', 'trim tidies the spacing');

    t = mkTable('x', 1, 3); fill(t, 0, ['a', 'b']);
    r = await run(t, { action: 'clear' });
    ok(col(t, 0).join('|') === '||', 'clear empties it');

    // a formula travels with its value through a reverse
    t = mkTable('x', 1, 3);
    t.wells[0][0].value = '5'; t.wells[0][0].formula = '=Inputs[B]';
    r = await run(t, { action: 'reverse' });
    ok(t.wells[0][2].value === '5' && t.wells[0][2].formula === '=Inputs[B]',
       'a formula travels with its value');

    // an action that is not one
    r = await run(mkTable('x', 1, 3), { action: 'shuffle' });
    ok(!!r.error, 'an action that is not one of them is refused');

    console.log('\nwhole columns:');
    // copy onto an empty column
    t = mkTable('x', 3, 3); fill(t, 0, ['a', 'b']);
    r = await mv(t, { action: 'copy', column: '0', to: '2' });
    ok(!r.error && col(t, 2).join('|') === 'a|b|' && col(t, 0).join('|') === 'a|b|',
       'copy writes it onto the other column and leaves the first alone');

    // copy onto an occupied column is refused
    t = mkTable('x', 2, 3); fill(t, 0, ['a']); fill(t, 1, ['keep']);
    r = await mv(t, { action: 'copy', column: '0', to: '1' });
    ok(!!r.error && /already has 1 value/.test(r.error), 'copying over work is refused, saying so');
    ok(col(t, 1)[0] === 'keep', 'and the work is still there');

    // swap
    t = mkTable('x', 2, 3); fill(t, 0, ['a', 'b']); fill(t, 1, ['x']);
    r = await mv(t, { action: 'swap', column: '0', to: '1' });
    ok(col(t, 0).join('|') === 'x||' && col(t, 1).join('|') === 'a|b|', 'swap exchanges them both ways');

    // MOVE IS A ROTATION, NOT A SWAP: with three columns the two differ
    t = mkTable('x', 3, 1); fill(t, 0, ['A']); fill(t, 1, ['B']); fill(t, 2, ['C']);
    r = await mv(t, { action: 'move', column: '2', to: '0' });
    ok(!r.error, 'move runs: ' + JSON.stringify(r));
    ok(col(t, 0)[0] === 'C' && col(t, 1)[0] === 'A' && col(t, 2)[0] === 'B',
       'MOVE SLIDES THE REST OVER (C,A,B); a swap would have given C,B,A');

    t = mkTable('x', 3, 1); fill(t, 0, ['A']); fill(t, 1, ['B']); fill(t, 2, ['C']);
    r = await mv(t, { action: 'move', column: '0', to: '2' });
    ok(col(t, 0)[0] === 'B' && col(t, 1)[0] === 'C' && col(t, 2)[0] === 'A',
       'and the other way (B,C,A)');

    t = mkTable('x', 2, 1); fill(t, 0, ['A']); fill(t, 1, ['B']);
    r = await mv(t, { action: 'move', column: '0', to: '0' });
    ok(!r.error && r.unchanged === true && col(t, 0)[0] === 'A', 'moving a column to where it is does nothing');

    r = await mv(mkTable('x', 2, 1), { action: 'copy', column: '0' });
    ok(!!r.error && /which column/.test(r.error), 'copy with no destination asks for one');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

// WRITING A LIST OF VALUES DOWN A COLUMN.
//
//     node tools/test/set-column-values.js
//
// The thing most likely to be wrong here is the indexing: a plate's wells are [column][row],
// not [row][column], and getting it backwards writes a row where a column was asked for and
// looks almost right. So the assertions name the cell by both axes.
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

// wells[col][row], the way plate.js builds them
const mkTable = (name, cols, rows) => ({
    name: name,
    wells: Array.from({ length: cols }, () => Array.from({ length: rows }, () => ({
        value: '', setValue(v) { this.value = v; }
    })))
});
const mkTrack = (tables, selected) => ({
    root: tables, selectedPlate: selected || null,
    getTableByName(n) { return this.root.filter((t) => t.name.toLowerCase() === ('' + n).toLowerCase())[0] || null; },
    updateCalculations() { }, setSelected(t) { this.selected = t; }, setMessage() { }
});
const at = (t, c, r) => t.wells[c][r].value;

(async () => {
    // the reported case
    let t = mkTable('seaarchbuoy', 5, 3);
    let r = await load('baja/plate/ops/set-column-values.js', mkTrack([t]),
        { table: 'seaarchbuoy', column: '0', values: ['price', 'cog', 'pn'] });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    ok(at(t, 0, 0) === 'price' && at(t, 0, 1) === 'cog' && at(t, 0, 2) === 'pn',
       'THE VALUES GO DOWN THE FIRST COLUMN, one per row');
    ok(at(t, 1, 0) === '' && at(t, 2, 0) === '',
       'and not across the first row, which is what [row][col] would have done');

    // a letter names a column too, as the ruler shows it
    t = mkTable('x', 5, 3);
    r = await load('baja/plate/ops/set-column-values.js', mkTrack([t]),
        { column: 'C', values: ['a', 'b'] });
    ok(!r.error && at(t, 2, 0) === 'a' && at(t, 2, 1) === 'b', 'a letter picks the column: C is the third');

    // start_row
    t = mkTable('x', 2, 4);
    r = await load('baja/plate/ops/set-column-values.js', mkTrack([t]),
        { column: '0', values: ['x'], start_row: 2 });
    ok(!r.error && at(t, 0, 2) === 'x' && at(t, 0, 0) === '', 'it can start part way down');

    // more values than rows: refused, and nothing written
    t = mkTable('small', 2, 2);
    r = await load('baja/plate/ops/set-column-values.js', mkTrack([t]),
        { column: '0', values: ['a', 'b', 'c'] });
    ok(!!r.error && /2 rows/.test(r.error), 'more values than rows is refused, saying how many there are');
    ok(at(t, 0, 0) === '', 'and NOTHING is written, rather than as many as fit');

    // a column that is not there
    t = mkTable('narrow', 2, 2);
    r = await load('baja/plate/ops/set-column-values.js', mkTrack([t]),
        { column: '7', values: ['a'] });
    ok(!!r.error && /no column 7/.test(r.error), 'a column past the end says so');

    // a column that is not a number or a letter is refused, not guessed
    r = await load('baja/plate/ops/set-column-values.js', mkTrack([mkTable('t', 2, 2)]),
        { column: 'the price one', values: ['a'] });
    ok(!!r.error && /which column/.test(r.error), 'an unresolvable column is refused rather than guessed');

    // no table named, nothing selected, several tables
    r = await load('baja/plate/ops/set-column-values.js',
        mkTrack([mkTable('one', 2, 2), mkTable('two', 2, 2)]), { column: '0', values: ['a'] });
    ok(!!r.error && /which table/.test(r.error), 'with several tables and none selected it asks');

    // the selected one is used when no name is given
    const sel = mkTable('selected', 2, 2);
    r = await load('baja/plate/ops/set-column-values.js',
        mkTrack([mkTable('other', 2, 2), sel], sel), { column: '0', values: ['v'] });
    ok(!r.error && at(sel, 0, 0) === 'v', 'otherwise the selected table is the one written to');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

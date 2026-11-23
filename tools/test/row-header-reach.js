// A ROW HEADER NAMES THE CELL BESIDE IT, NOT THE WHOLE ROW.
//
//     node tools/test/row-header-reach.js
//
// A row header tagged every cell in its row. With a Notes column that made
// production_capacity[Kegs_from_Yeast] two cells, a number and a sentence, and the formulas
// reading it came out NaN. The tag now reaches one cell unless it is extended: on the header,
// for the table, or because a formula already reads it along the row.
//
// The table's own methods are lifted out of plate.js and run on plain cells whose setGroup is
// the one in well.js.
const fs = require('fs');
const { JSDOM } = require('jsdom');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const plateSrc = fs.readFileSync('baja/plate/plate.js', 'utf8');
const wellSrc = fs.readFileSync('baja/plate/well.js', 'utf8');
const method = (src, head) => {
    const a = src.indexOf('\n            ' + head);
    if (a < 0) throw new Error('no method ' + head);
    let depth = 0, b = src.indexOf('{', src.indexOf(')', a));
    for (let k = b; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) { b = k; break; } } }
    return src.slice(a + 1, b + 1);
};
const Table = new Function('return class T {\n' + ['applyHeaderWellForRow(rowIndex, colIndex) {', '__headerTagName(v) {', '__columnGivesTag(colIndex, tag, except) {',
    'rowHeaderReach(well) {', '__noteRowTagsReadAcross(track) {', 'setRowHeaderReach(reach, wells) {', 'reapplyHeaderWells(track) {',
    'applyHeaderWellForColumn(rowIndex, colIndex) {', 'getWellsByTag(tag) {', 'getWellIndicies(well) {'].map((h) => method(plateSrc, h)).join('\n') + '\n}')();
const Well = new Function('__asGroupSet', 'generateTimestamp', 'return class W {\n' + method(wellSrc, 'setGroup(__group) {') + '\n' + method(wellSrc, 'removeGroup(key) {') + '\n}')((g) => ({}), () => 1);

let uid = 0;
const build = (name, rows) => {
    const t = new Table();
    t.name = name; t.formula = {}; t.row_headers = [];
    const nc = rows[0].length;
    t.wells = [];
    for (let c = 0; c < nc; c++) {
        t.wells.push(rows.map((r, ri) => {
            const w = new Well(); w.uid = 'w' + (++uid); w.value = r[c]; w.group = {};
            if (ri === 0) { w.skin_type = 'ColumnHeader'; w.setGroup('ColumnHeader'); }
            else if (c === 0) { w.skin_type = 'RowHeader'; w.setGroup('RowHeader'); }
            return w;
        }));
    }
    t.grid = { xmin: 0, xmax: nc, ymin: 0, ymax: rows.length };
    return t;
};
const tags = (t, c, r) => Object.keys(t.wells[c][r].group).sort().join(',');
const having = (t, tag) => { const out = []; t.wells.forEach((col, c) => col.forEach((w, r) => { if (w.group[tag] != null && w.skin_type !== 'RowHeader') out.push(c + ':' + r); })); return out.join(' '); };
const log = console.log; const quiet = (f) => { console.log = () => { }; try { return f(); } finally { console.log = log; } };

// ---- the table in the report -------------------------------------------------------------------
const cap = () => build('production_capacity', [
    ['Item', 'Value', 'Notes'],
    ['Yeast per keg (lbs)', 0.5, 'Pounds of yeast required per keg'],
    ['Kegs from Yeast', 200, 'Calculates maximum kegs produced from yeast'],
    ['Production Capacity (kegs)', 141.2, 'Determines overall production']]);
let t = cap(); const track = { root: [t] };
quiet(() => t.reapplyHeaderWells(track));
ok(having(t, 'Kegs_from_Yeast') === '1:2', 'the row header tags the value beside it and not the note: ' + having(t, 'Kegs_from_Yeast'));
ok(tags(t, 1, 2) === 'Kegs_from_Yeast,Value' && tags(t, 2, 2) === 'Notes', 'so the value is Kegs_from_Yeast and Value, and the note is only Notes');

// A table saved before this, with the tag already on every cell of the row.
t = cap(); t.wells[2][2].setGroup('Kegs from Yeast'); t.wells[2][1].setGroup('Yeast per keg (lbs)');
ok(having(t, 'Kegs_from_Yeast') === '2:2', '(a saved table arrives with the tag on the note)');
quiet(() => t.reapplyHeaderWells({ root: [t] }));
ok(having(t, 'Kegs_from_Yeast') === '1:2' && having(t, 'Yeast_per_keg_lbs_') === '1:1', 'and loses it there at the next calculation, punctuation in the name and all');

// ---- extended by the user: one header --------------------------------------------------------
const wide = () => build('plan', [
    ['Item', 'Jan', 'Feb', 'Mar', 'Notes'],
    ['Revenue', 10, 20, 30, 'sales'],
    ['Costs', 4, 5, 6, 'spend']]);
t = wide(); quiet(() => t.reapplyHeaderWells({ root: [t] }));
ok(having(t, 'Revenue') === '1:1' && having(t, 'Costs') === '1:2', 'in a wider table each header starts with one cell too');
quiet(() => t.setRowHeaderReach(3, [t.wells[0][1]]));
ok(having(t, 'Revenue') === '1:1 2:1 3:1' && having(t, 'Costs') === '1:2', 'a header extended to three cells tags three, and the other header is as it was');
quiet(() => t.setRowHeaderReach('row', [t.wells[0][1]]));
ok(having(t, 'Revenue') === '1:1 2:1 3:1 4:1', 'extended to the whole row it tags every cell');
quiet(() => t.setRowHeaderReach(1, [t.wells[0][1]]));
ok(having(t, 'Revenue') === '1:1', 'and put back to one, the others lose it again');
quiet(() => t.reapplyHeaderWells({ root: [t] }));
ok(having(t, 'Revenue') === '1:1' && tags(t, 2, 1) === 'Feb', 'which holds at the next calculation, the column tags untouched');

// ---- extended by the user: the whole table ---------------------------------------------------
quiet(() => t.setRowHeaderReach(2, [t.wells[0][1]]));
quiet(() => t.setRowHeaderReach('row'));
ok(having(t, 'Revenue') === '1:1 2:1 3:1 4:1' && having(t, 'Costs') === '1:2 2:2 3:2 4:2' && t.wells[0][1].headerSpan == null,
   'set for the table, every header tags its whole row, whatever was set on one of them');
quiet(() => t.setRowHeaderReach(1));
ok(having(t, 'Revenue') === '1:1' && having(t, 'Costs') === '1:2', 'and set back, each tags one cell');

// ---- formulas that already read along a row are not broken ----------------------------------
t = wide();
const other = build('summary', [['Item', 'Value'], ['Q1', 0]]);
other.formula['[1:1][1:1]'] = 'plan[Revenue,Mar]+myplan[Costs,Mar]+plan[1:1][2:2]';
quiet(() => t.reapplyHeaderWells({ root: [t, other] }));
ok(having(t, 'Revenue') === '1:1 2:1 3:1 4:1', 'a tag some formula reads with a second tag, plan[Revenue,Mar], keeps its whole row');
ok(having(t, 'Costs') === '1:2', 'one that is only read that way from another table, or by address, does not');
quiet(() => t.reapplyHeaderWells());
ok(having(t, 'Revenue') === '1:1 2:1 3:1 4:1', 'and a caller with no track to look in changes nothing');
quiet(() => t.setRowHeaderReach(1, [t.wells[0][1]]));
ok(having(t, 'Revenue') === '1:1', 'what is set on the header still decides');

// ---- two header columns, and a tag the column owns ------------------------------------------
t = build('two', [['Group', 'Item', 'Value', 'Notes'], ['Brewing', 'Malt', 50, 'x']]);
t.wells[1][1].skin_type = 'RowHeader'; t.wells[1][1].setGroup('RowHeader');
quiet(() => t.reapplyHeaderWells({ root: [t] }));
ok(having(t, 'Brewing') === '2:1' && having(t, 'Malt') === '2:1', 'with two header columns, both name the first cell that is not a header');
t = build('same', [['Item', 'Value', 'Rate'], ['Rate', 5, 6]]);
t.wells[2][1].setGroup('Rate');
quiet(() => t.reapplyHeaderWells({ root: [t] }));
ok(having(t, 'Rate') === '1:1 2:1', 'a cell keeps a tag that is its own column’s name, though the row header of that name stops short of it');

// ---- kept with the workbook -----------------------------------------------------------------
ok(/headerSpan: this\.headerSpan,/.test(wellSrc) && /this\.headerSpan = jsonObj\.headerSpan;/.test(wellSrc) && /copiedWell\.headerSpan = this\.headerSpan;/.test(wellSrc),
   'a header’s reach is saved, loaded and copied with its cell');
ok(/attr__rowHeaderSpan: this\.attr__rowHeaderSpan,/.test(plateSrc) && /plate\.attr__rowHeaderSpan = jsonData\.attr__rowHeaderSpan;/.test(plateSrc), 'and the table’s with the table');
ok(/p\.reapplyHeaderWells\(this\);/.test(fs.readFileSync('baja/plate/plate-track.js', 'utf8')), 'each calculation hands the table its track');
ok(/label: whole \? 'Row headers: tag only the next cell' : 'Row headers: tag the whole row'/.test(plateSrc), 'the table menu sets it for the table');

// ---- the cell menu on a row header ----------------------------------------------------------
(async () => {
    const dom = new JSDOM('<!doctype html><html><body><canvas tabindex="0"></canvas></body></html>', { url: 'https://gene.clinic/' });
    global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
    global.CurrentLayout = { getStashed: () => null };
    const core = fs.readFileSync('lib/core.js', 'utf8');
    const AF = Object.getPrototypeOf(async function () { }).constructor;
    const load = async (p, ...a) => (await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {}))(...a);
    global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };
    const said = []; let calcs = 0;
    const pt = { setMessage: (m) => said.push(m), updateCalculations: () => { calcs++; } };
    const labels = () => Array.prototype.map.call(document.querySelectorAll('#baja-cell-menu [data-i], [role="menu"] [data-i]'), (r) => r.firstChild.textContent);
    const press = (label) => { const r = Array.prototype.filter.call(document.querySelectorAll('[role="menu"] [data-i]'), (x) => x.firstChild.textContent === label)[0]; r.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
    const open = async (tb, well, sel) => {
        const old = document.querySelector('[role="menu"]'); if (old) old.remove();
        tb.getSelectedWellsInOrder = () => sel || [well];
        tb.cellActions = [{ letter: 'X', name: 'close', action: () => { } }];
        await load('baja/plate/menu/cell-menu.js', pt, tb, well, tb.cellActions);
        return labels();
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    t = wide(); quiet(() => t.reapplyHeaderWells({ root: [t] }));
    let ls = await open(t, t.wells[1][1]);
    ok(!ls.some((l) => /^Header:/.test(l)), 'on an ordinary cell the menu says nothing about headers');
    ls = await open(t, t.wells[0][1]);
    ok(ls.indexOf('Header: tag the whole row') >= 0 && ls.indexOf('Header: tag only the next cell') < 0 && ls[ls.length - 1] === 'Delete',
       'on a row header it offers the whole row, above Delete: ' + ls.join(' | '));
    console.log = () => { }; press('Header: tag the whole row'); await sleep(30); console.log = log;
    ok(having(t, 'Revenue') === '1:1 2:1 3:1 4:1' && calcs === 1 && /every cell in its row/.test(said.join(' ')), 'pressed, the header tags its row, the workbook recalculates, and it says so');
    ls = await open(t, t.wells[0][1]);
    ok(ls.indexOf('Header: tag only the next cell') >= 0 && ls.indexOf('Header: tag the whole row') < 0, 'and the menu then offers to put it back');
    console.log = () => { }; press('Header: tag only the next cell'); await sleep(30); console.log = log;
    ls = await open(t, t.wells[0][1], [t.wells[0][1], t.wells[1][1], t.wells[2][1], t.wells[3][1]]);
    ok(ls.indexOf('Header: tag the 3 cells selected') >= 0, 'with the header and three cells along its row selected, it offers exactly those');
    console.log = () => { }; press('Header: tag the 3 cells selected'); await sleep(30); console.log = log;
    ok(having(t, 'Revenue') === '1:1 2:1 3:1' && having(t, 'Costs') === '1:2', 'and tags them, and no other row');

    // ---- "Remove tags", next to Delete -----------------------------------------------------
    t = cap(); quiet(() => t.reapplyHeaderWells({ root: [t] }));
    t.wells[1][1].setGroup('dollar');
    const notes = [t.wells[2][1], t.wells[2][2], t.wells[2][3]];
    ls = await open(t, notes[0], notes);
    ok(ls[ls.length - 2] === 'Remove tags' && ls[ls.length - 1] === 'Delete', 'with cells selected, "Remove tags" sits just above Delete: ' + ls.join(' | '));
    said.length = 0; calcs = 0;
    console.log = () => { }; press('Remove tags'); await sleep(30); console.log = log;
    ok(notes.every((w) => Object.keys(w.group).length === 0) && calcs === 1 && /Removed 3 tags from the 3 selected cells/.test(said.join(' ')),
       'pressed, the selected cells have no tags, and it says how many went');
    quiet(() => t.reapplyHeaderWells({ root: [t] }));
    ok(notes.every((w) => Object.keys(w.group).length === 0) && tags(t, 1, 2) === 'Kegs_from_Yeast,Value', 'they stay off at the next calculation, and the cells not selected keep theirs');
    quiet(() => t.setRowHeaderReach('row'));
    ok(notes.every((w) => Object.keys(w.group).length === 0), 'even with the row headers set to tag the whole row');
    ls = await open(t, notes[0], notes);
    ok(ls.indexOf('Remove tags') < 0 && ls[ls.length - 2] === 'Restore tags', 'the menu then offers to restore them');
    console.log = () => { }; press('Restore tags'); await sleep(30); console.log = log;
    ok(tags(t, 2, 2) === 'Kegs_from_Yeast,Notes', 'and restored, the headers tag the cells again');
    ls = await open(t, t.wells[1][1]);
    console.log = () => { }; press('Remove tags'); await sleep(30); console.log = log;
    ok(tags(t, 1, 1) === 'dollar', 'one cell works the same way, and keeps what makes it a dollar amount');
    ls = await open(t, t.wells[0][1]);
    console.log = () => { }; press('Remove tags'); await sleep(30); console.log = log;
    ok(t.wells[0][1].group['RowHeader'] != null, 'a header stays a header');
    ok(/noHeaderTags: this\.noHeaderTags,/.test(wellSrc) && /this\.noHeaderTags = jsonObj\.noHeaderTags;/.test(wellSrc), 'and the mark is saved with the cell');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

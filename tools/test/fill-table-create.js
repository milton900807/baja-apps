// A TABLE THAT IS NOT THERE YET IS MADE, CENTRED, AND THEN FILLED.
//
//     node tools/test/fill-table-create.js
//
// "create a table of assumptions of costs associated with single sea plane operations" came
// back as "there is no table called assumptions". The plan was a fill, the fill was right,
// and the only thing missing was the table it was to go in.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A cell, a table and a project, no more than these operations touch.
const mkWell = () => ({ value: null, setValue(v) { this.value = v; } });
const mkPlate = (name, cols, rows) => {
    const p = { name: name, wells: [], fitted: 0 };
    for (let c = 0; c < cols; c++) {
        p.wells.push([]);
        for (let r = 0; r < rows; r++) p.wells[c].push(mkWell());
    }
    p.addRow = function () { for (const col of this.wells) col.push(mkWell()); };
    p.fitRowsAndColumns = function () { this.fitted++; };
    p.setColumnHeader = function () { };
    p.completeNullValues = function () { };
    return p;
};

let order = [], pyAsked = null, pyReply = null;
const mkProject = () => {
    const pt = {
        root: [], shown: [], messages: [],
        getTableByName(n) { return this.root.find((t) => t && t.name === n) || null; },
        addPlateWithConsistentWellSize(p) { this.root.push(p); order.push('created ' + p.name); },
        panToNextSpot() { }, updateCalculations() { }, wake() { },
        setMessage(m) { this.messages.push('' + m); },
        setSelected() { }
    };
    return { plateTrack: pt };
};

const load = async (p, ...a) => {
    const path = '' + p;
    if (path.indexOf('table-fill.py') >= 0) {
        pyAsked = { what: a[0], table: JSON.parse(a[1]) };
        order.push('generated');
        return (typeof pyReply === 'function') ? pyReply(pyAsked) : pyReply;
    }
    if (path.indexOf('show-new-object.js') >= 0) {
        order.push('centred ' + (a[1] && a[1].name));
        a[0].shown.push(a[1]);
        return { moved: true };
    }
    if (path.indexOf('/plate/well.js') >= 0 || path.indexOf('plate/plate.js') >= 0) {
        // new-table.js builds its table through the Plate constructor.
        if (path.indexOf('plate.js') >= 0) {
            return function Plate(name, cols, rows) { return mkPlate(name || 'Table 1', cols, rows); };
        }
        return true;
    }
    const f0 = fs.existsSync(path) ? path : (fs.existsSync(path + '.js') ? path + '.js' : path);
    const src = fs.readFileSync(f0, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

(async () => {
    // ---- the request that failed --------------------------------------------------------
    let pm = mkProject();
    order = []; pyAsked = null;
    pyReply = () => ({ status: 'OK', rows: [
        ['Fuel per hour', '320', 'Jet A, 2026'],
        ['Hangar', '1200', 'monthly'],
        ['Insurance', '900', 'monthly']
    ] });
    let r = await load('baja/plate/ops/fill-table.js', pm, {
        table: 'assumptions', rows: 10,
        columns: 'Assumption, Cost, Notes',
        what: 'assumptions of costs associated with single sea plane operations'
    });
    ok(!r.error, 'it no longer refuses for want of the table: ' + (r.error || '(no error)'));
    ok(r.created === 'assumptions', 'it made the table that was asked for: ' + r.created);

    // The order is the point of the request: made and shown BEFORE anything is generated.
    const iCreated = order.indexOf('created assumptions');
    const iCentred = order.indexOf('centred assumptions');
    const iGen = order.indexOf('generated');
    ok(iCreated >= 0 && iCentred > iCreated && iGen > iCentred,
       'made, centred, and only then filled: ' + order.join(' → '));

    const t = pm.plateTrack.getTableByName('assumptions');
    ok(!!t && t.wells.length === 3, 'with a column per heading: ' + (t ? t.wells.length : 0));
    ok(t.wells.map((c) => c[0].value).join(',') === 'Assumption,Cost,Notes',
       'the headings are in the top row: ' + t.wells.map((c) => c[0].value).join(','));
    ok(t.wells.every((c) => c[0].skin_type === 'ColumnHeader'),
       'marked as headings, which is how the fill knows to start underneath');
    ok(t.wells[0][1].value === 'Fuel per hour' && t.wells[2][1].value === 'Jet A, 2026',
       'and the rows go in under them: ' + t.wells.map((c) => c[1].value).join(' | '));
    ok(t.wells[0].length >= 11, 'it is made with the rows that were asked for: ' + t.wells[0].length);

    // The columns are the table's, so the generator is told them and nothing else.
    ok(pyAsked.table.columns.join(',') === 'Assumption,Cost,Notes',
       'the generator is asked for rows of exactly those columns: ' + pyAsked.table.columns.join(','));
    ok(pyAsked.what.indexOf('sea plane') >= 0, 'with the request in the user’s own words');

    // ---- columns nobody asked for are SAID ------------------------------------------------
    pm = mkProject(); order = [];
    pyReply = () => ({ status: 'OK', rows: [['Fuel', '320'], ['Hangar', '1200']] });
    r = await load('baja/plate/ops/fill-table.js', pm,
        { table: 'costs', what: 'costs of running a boat' });
    ok(r.created === 'costs' && !r.error, 'a request that says nothing about columns still works');
    ok(/did not say what the columns should be/.test(r.note_columns || ''),
       'and the guess is said rather than slipped in: ' + (r.note_columns || ''));
    ok(pm.plateTrack.getTableByName('costs').wells.length === 2,
       'a label column and a value column, which is the shape such a sentence asks for');

    // ---- a table that IS there is filled, not remade ---------------------------------------
    pm = mkProject();
    const existing = mkPlate('employees', 2, 4);
    existing.wells[0][0].value = 'Name'; existing.wells[0][0].skin_type = 'ColumnHeader';
    existing.wells[1][0].value = 'Salary'; existing.wells[1][0].skin_type = 'ColumnHeader';
    pm.plateTrack.root.push(existing);
    order = [];
    pyReply = () => ({ status: 'OK', rows: [['Ada', '120000']] });
    r = await load('baja/plate/ops/fill-table.js', pm, { table: 'employees', what: 'some staff' });
    ok(!r.created, 'a table that is already there is not made again: ' + (r.created || '(not made)'));
    ok(order.indexOf('created employees') < 0, 'nothing was created: ' + order.join(' → '));
    ok(existing.wells[0][1].value === 'Ada', 'and it is filled under its own headings');

    // ---- a failure that is not a missing table is still a failure --------------------------
    pm = mkProject();
    r = await load('baja/plate/ops/fill-table.js', pm, { what: 'anything' });
    ok(/say which table/.test(r.error || ''),
       'no name and nothing on the canvas still asks which table, rather than inventing one: '
       + (r.error || ''));

    // ---- the catalogue says so, or the planner will never choose it ------------------------
    const caps = fs.readFileSync('baja/plate/menu/project-capabilities.js', 'utf8');
    ok(/when it asks to \s*'?\s*\+?\s*'?CREATE a table of something/.test(caps.replace(/\s+/g, ' ')),
       'the operation says it creates as well as fills');
    ok(/create a table of assumptions of costs/.test(caps),
       'with the sentence that failed as its example');
    ok(/used ONLY when the table \s*'?\s*\+?\s*'?named does not exist/.test(caps.replace(/\s+/g, ' ')),
       'and the columns parameter says when it applies');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

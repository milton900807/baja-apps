// FORMULAS THAT NAME WHAT THEY READ, NOT WHERE IT IS.
//
//     node tools/test/formulas-to-tags.js
//
//   =assumptions[1:1][65:65]+assumptions[1:1][66:66]+ ... +assumptions[1:1][74:74]
//
// rewritten to read the same cells by their tags. The REAL formula engine is used here, not
// a stub: the conversion is only worth having if the engine gives the same answer for the
// tagged form, and the operation itself refuses to write one that does not.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let engineOverride = null;
const load = async (p, ...a) => {
    if (engineOverride && p === 'baja/plate/ops/frun-object.js') return engineOverride(...a);
    const path = fs.existsSync(p) ? p : p + '.js';
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), pushHistory: () => { }, getIonFunction: () => null, createIonFunction: (f) => f };
global.pushHistory = () => { }; global.HM = () => ({});
const quiet = console.log; const mute = () => { console.log = () => { }; console.error = () => { }; console.warn = () => { }; };
const errs = [console.error, console.warn];
const unmute = () => { console.log = quiet; console.error = errs[0]; console.warn = errs[1]; };

let fails = 0;
const ok = (c, m) => { quiet((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

let uid = 0;
const cell = (v, tags) => {
    const w = { value: v, uid: 'u' + (uid++), group: null, getValue() { return this.value; }, setValue(x) { this.value = x; } };
    if (tags) { w.group = {}; tags.forEach((g) => { w.group[g] = 1; }); }
    return w;
};
const mkTable = (name, rows, tagger) => {
    const cols = rows[0].length, wells = [];
    for (let c = 0; c < cols; c++) wells.push(rows.map((r, i) => cell(r[c], tagger ? tagger(c, i, r) : null)));
    const t = { name, wells, formula: {}, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows.length }, __sel: [] };
    t.getFirstColumn = () => 0; t.getLastColumn = () => cols - 1; t.getFirstRow = () => 0; t.getLastRow = () => rows.length - 1;
    t.getSelectedWellsInOrder = () => t.__sel;
    t.getWellRange = (l) => { for (let c = 0; c < wells.length; c++) { const r = wells[c].indexOf(l[0]); if (r >= 0) return '[' + c + ':' + c + '][' + r + ':' + r + ']'; } return ''; };
    t.getWellsByTag = () => [];
    t.getWellsByString = (range) => {
        const m = ('' + range).match(/\[(\d*)(:?)(\d*)\]\[(\d*)(:?)(\d*)\]/); if (!m) return [];
        const n = (v, d) => (v === '' ? d : parseInt(v, 10));
        const c0 = n(m[1], 0), c1 = m[2] ? n(m[3], cols - 1) : c0, r0 = n(m[4], 0), r1 = m[5] ? n(m[6], rows.length - 1) : r0;
        const out = []; for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (wells[c] && wells[c][r]) out.push(wells[c][r]);
        return out;
    };
    return t;
};
const mkTrack = (list) => {
    const pt = { root: list, said: [], formulas: {}, selectedPlate: list[0],
        setMessage(m) { this.said.push('' + m); }, wake() { }, updateCalculations() { }, addFormula(k, f) { this.formulas[k] = f; },
        getTableByName: (n) => list.filter((x) => x.name === n)[0] || null, getTableNames: () => list.map((x) => x.name),
        getTablesByName: () => { const o = {}; list.forEach((x) => { o[x.name] = x; }); return o; } };
    return pt;
};
// name, value rows; every body cell tagged with its row label and its column heading, the
// way the app tags a table, plus an optional section tag.
const slug = (s) => ('' + s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const assumptions = (section) => mkTable('assumptions',
    [['title', 'value'], ['Brewery Equipment', '250000'], ['Fermentation Tanks', '80000'], ['Kegging System', '15000'],
     ['Bottling Line', '120000'], ['Rent', '8000']],
    (c, r, row) => (r === 0 ? ['ColumnHeader'] : [slug(row[0]), c === 0 ? 'title' : 'value'].concat(section && r >= 1 && r <= 3 ? [section] : [])));

(async () => {
    const run = async (pt, o) => { mute(); try { return await load('baja/plate/ops/formulas-to-tags.js', pt, o); } finally { unmute(); } };
    const evalF = async (pt, f) => { mute(); try { const r = await load('baja/plate/ops/frun-object.js', f, pt); let v = r && r.results ? r.results[0] : r; if (v && typeof v === 'object' && 'value' in v) v = v.value; return Number(v); } finally { unmute(); } };

    // ---- each address becomes the cell's own tags ------------------------------------------
    let a = assumptions();
    let costs = mkTable('costs', [['Item', 'Cost'], ['Equipment', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['Equipment', c === 0 ? 'Item' : 'Cost']));
    let pt = mkTrack([costs, a]);
    const f1 = '=assumptions[1:1][1:1]+assumptions[1:1][2:2]+assumptions[1:1][3:3]';
    costs.wells[1][1].value = f1; costs.formula['[1:1][1:1]'] = f1;
    const before = await evalF(pt, f1);
    let r = await run(pt, { table: 'costs' });
    const now = costs.wells[1][1].value;
    ok(!r.error && r.converted === 1, 'the formula is converted: ' + JSON.stringify(r.error || r.converted));
    ok(now === '=assumptions[Brewery_Equipment,value]+assumptions[Fermentation_Tanks,value]+assumptions[Kegging_System,value]',
       'each address is now the row’s label and the column’s heading: ' + now);
    ok(!/\[\d/.test(now), 'with no address left in it');
    ok(before === 345000 && (await evalF(pt, now)) === 345000, 'and the engine gives the same answer for it: ' + before + ' -> ' + (await evalF(pt, now)));
    ok(costs.formula['[1:1][1:1]'] === now && pt.formulas['costs[1:1][1:1]'] === now, 'written the way every other formula is');
    ok(/1 formula in costs now reads by tag/.test(pt.said.join(' ')) && /Undo/.test(pt.said.join(' ')), 'and said: ' + pt.said.join(' | ').slice(0, 110));

    // ---- a run that a tag covers exactly becomes one sum ------------------------------------
    a = assumptions('Equipment_costs');
    costs = mkTable('costs', [['Item', 'Cost'], ['Equipment', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['Equip', c === 0 ? 'Item' : 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = f1; costs.formula['[1:1][1:1]'] = f1;
    r = await run(pt, { table: 'costs' });
    ok(costs.wells[1][1].value === '=sum(assumptions[value,Equipment_costs])',
       'ten cells added one by one become a sum over the tag that covers exactly them: ' + costs.wells[1][1].value);
    ok((await evalF(pt, costs.wells[1][1].value)) === 345000, 'which works out the same');

    // a range reference, likewise
    a = assumptions('Equipment_costs');
    costs = mkTable('costs', [['Item', 'Cost'], ['Equipment', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['Equip', c === 0 ? 'Item' : 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=sum(assumptions[1:1][1:3])';
    r = await run(pt, { table: 'costs' });
    ok(costs.wells[1][1].value === '=sum(assumptions[value,Equipment_costs])', 'a block address becomes the tag that covers the block: ' + costs.wells[1][1].value);

    // ---- what is left alone -----------------------------------------------------------------
    // two rows with the same label: no tag picks out either, so the address stays
    a = mkTable('assumptions', [['title', 'value'], ['Rent', '100'], ['Rent', '200'], ['Power', '50']],
        (c, r, row) => (r === 0 ? ['ColumnHeader'] : [slug(row[0]), c === 0 ? 'title' : 'value']));
    costs = mkTable('costs', [['Item', 'Cost'], ['x', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['x', 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=assumptions[1:1][1:1]+assumptions[1:1][3:3]';
    r = await run(pt, { table: 'costs' });
    ok(costs.wells[1][1].value === '=assumptions[1:1][1:1]+assumptions[Power,value]',
       'a cell whose tags another cell shares keeps its address; the rest are converted: ' + costs.wells[1][1].value);
    ok(r.partly === 1 && /still has an address no tag picks out/.test(pt.said.join(' ')), 'and that is said');

    // untagged cells: nothing to write, and a reason
    a = mkTable('assumptions', [['title', 'value'], ['Rent', '100']], null);
    costs = mkTable('costs', [['Item', 'Cost'], ['x', '']], null);
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=assumptions[1:1][1:1]*2';
    r = await run(pt, { table: 'costs' });
    ok(/no formula in costs was changed/.test(r.error) && /no tag picks out/.test(r.error) && costs.wells[1][1].value === '=assumptions[1:1][1:1]*2',
       'cells with no tags are left as addresses, with the reason: ' + r.error);

    // an open-ended range grows with the table; a tag set does not
    a = assumptions('Equipment_costs');
    costs = mkTable('costs', [['Item', 'Cost'], ['x', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['x', 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=sum(assumptions[1:1][1:])';
    r = await run(pt, { table: 'costs' });
    ok(costs.wells[1][1].value === '=sum(assumptions[1:1][1:])', 'an open-ended range is left as it is: ' + (r.error || '').slice(0, 60));

    // a tag the reference grammar would misread is not used in a pair
    a = mkTable('assumptions', [['title', 'value'], ['Rent', '100'], ['Power', '50']],
        (c, r, row) => (r === 0 ? ['ColumnHeader'] : [slug(row[0]), c === 0 ? 'column_a' : 'column_b']));
    costs = mkTable('costs', [['Item', 'Cost'], ['x', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['x', 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=assumptions[1:1][1:1]*2';
    r = await run(pt, { table: 'costs' });
    ok(costs.wells[1][1].value === '=assumptions[1:1][1:1]*2',
       'a tag beginning "col" would be read as a position, so it is not written: ' + costs.wells[1][1].value);

    // the engine disagrees: nothing is written
    a = assumptions();
    costs = mkTable('costs', [['Item', 'Cost'], ['x', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['x', 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=assumptions[1:1][1:1]*2';
    engineOverride = (f) => ({ results: [/\[\d/.test(f) ? 500000 : 7] });
    r = await run(pt, { table: 'costs' });
    engineOverride = null;
    ok(/did not work out to the same value/.test(r.error) && costs.wells[1][1].value === '=assumptions[1:1][1:1]*2',
       'a tagged form the engine answers differently is not written: ' + r.error);

    // ---- which formulas ---------------------------------------------------------------------
    a = assumptions();
    costs = mkTable('costs', [['Item', 'Cost'], ['a', ''], ['b', '']], (c, r) => (r === 0 ? ['ColumnHeader'] : ['r' + r, c === 0 ? 'Item' : 'Cost']));
    pt = mkTrack([costs, a]);
    costs.wells[1][1].value = '=assumptions[1:1][1:1]*2'; costs.wells[1][2].value = '=assumptions[1:1][2:2]*2';
    costs.__sel = [costs.wells[1][2]];
    r = await run(pt, { plate: costs });
    ok(costs.wells[1][1].value === '=assumptions[1:1][1:1]*2' && costs.wells[1][2].value === '=assumptions[Fermentation_Tanks,value]*2' && r.scope === 'the selected cells',
       'with a formula selected, only that one is converted');
    costs.__sel = [costs.wells[0][1]];
    r = await run(pt, { plate: costs });
    ok(costs.wells[1][1].value === '=assumptions[Brewery_Equipment,value]*2' && r.scope === 'every formula in the table', 'with none selected, the whole table is');

    // ---- at each calculation, without being asked ------------------------------------------
    {
        const sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));
        a = assumptions();
        costs = mkTable('costs', [['Item', 'Cost'], ['a', ''], ['b', '']], (c, r2) => (r2 === 0 ? ['ColumnHeader'] : ['r' + r2, c === 0 ? 'Item' : 'Cost']));
        const dup = mkTable('dup', [['t', 'v'], ['Rent', '1'], ['Rent', '2']], (c, r2, row) => (r2 === 0 ? ['ColumnHeader'] : [slug(row[0]), c === 0 ? 't' : 'v']));
        pt = mkTrack([costs, a, dup]);
        let calcs = 0; pt.updateCalculations = () => { calcs++; };
        costs.wells[1][1].value = '=assumptions[1:1][1:1]*2';
        costs.wells[1][2].value = '=dup[1:1][1:1]*2';              // no tag picks this one out
        let engineRuns = 0;
        const realLoad = load;
        mute();
        const h = await load('baja/plate/ops/auto-tag-formulas.js', pt);
        let out = await h.run();
        unmute();
        ok(out.converted === 1 && costs.wells[1][1].value === '=assumptions[Brewery_Equipment,value]*2',
           'a formula that can read by tag is rewritten with nobody asking: ' + costs.wells[1][1].value);
        ok(costs.wells[1][2].value === '=dup[1:1][1:1]*2', 'one that cannot is left as it is');
        ok(calcs === 0, 'it does not start another calculation: the values have not changed');
        ok(/1 formula in costs now reads by tag instead of by address/.test(pt.said.join(' ')) && /stays back/.test(pt.said.join(' ')),
           'it says what it did: ' + pt.said.join(' | ').slice(0, 120));

        // looked at once
        engineOverride = (...x) => { engineRuns++; return { results: [1] }; };
        mute(); out = await h.run(); unmute();
        ok(out.converted === 0 && engineRuns === 0, 'the next calculation does no work on formulas already looked at: ' + engineRuns + ' engine runs');

        // undo stays undone
        costs.wells[1][1].value = '=assumptions[1:1][1:1]*2';
        mute(); out = await h.run(); unmute();
        ok(costs.wells[1][1].value === '=assumptions[1:1][1:1]*2' && engineRuns === 0, 'a conversion that was undone is not made again');
        engineOverride = null;

        // a new formula, or new tags, are looked at
        costs.wells[1][1].value = '=assumptions[1:1][2:2]*3';
        mute(); out = await h.run(); unmute();
        ok(costs.wells[1][1].value === '=assumptions[Fermentation_Tanks,value]*3', 'a formula that has changed is looked at again');
        dup.wells[1][1].group.First = 1;
        mute(); out = await h.run(); unmute();
        ok(costs.wells[1][2].value === '=dup[First]*2', 'and so is an old one once a tag makes it possible: ' + costs.wells[1][2].value);

        // off
        costs.wells[1][1].value = '=assumptions[1:1][4:4]*3'; pt.attr__autoTagFormulas = false;
        mute(); out = await h.run(); unmute();
        ok(out === null && costs.wells[1][1].value === '=assumptions[1:1][4:4]*3', 'attr__autoTagFormulas = false turns it off');

        // schedule debounces, and the track asks for it at each calculation
        pt.attr__autoTagFormulas = true;
        mute(); h.schedule(); h.schedule(); h.schedule(); await sleep(900); unmute();
        ok(costs.wells[1][1].value === '=assumptions[Bottling_Line,value]*3', 'scheduled, it runs a moment later');
        const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
        const k = track.indexOf('async updateCalculations() {');
        ok(/exec\('baja\/plate\/ops\/auto-tag-formulas\.js', this\)/.test(track.slice(k, k + 1200)) && /h\.schedule\(\)/.test(track.slice(k, k + 1200)),
           'and updateCalculations asks for it every time');
        ok(/attr__autoTagFormulas = true;/.test(track), 'on unless turned off');
    }

    // ---- where it is reached from -----------------------------------------------------------
    const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
    ok(/label: 'Formulas: use tags instead of addresses'/.test(plate) && /exec\('baja\/plate\/ops\/formulas-to-tags\.js', pt, \{ plate: this \}\)/.test(plate),
       'the table’s menu has it');
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('formulas_to_tags') >= 0, 'and so does the planner');

    quiet(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { unmute(); console.error(e); process.exit(1); });

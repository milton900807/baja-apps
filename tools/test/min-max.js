// THE SMALLEST AND THE LARGEST OF A BLOCK OF CELLS.
//
//     node tools/test/min-max.js
//
// =min(production_capacity[1:1][4:6]) came out as NaN over 141.17650, 2058.82350 and
// 2823.52940, and =max(...) called min. The REAL engine is run here against a table shaped
// like the one it failed on.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : p + '.js';
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };
const say = console.log, mute = () => { console.log = () => { }; console.warn = () => { }; console.error = () => { }; };
const keep = [console.warn, console.error];
const unmute = () => { console.log = say; console.warn = keep[0]; console.error = keep[1]; };

let fails = 0;
const ok = (c, m) => { say((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

let uid = 0;
const mkTable = (name, rows) => {
    const cols = rows[0].length, wells = [];
    for (let c = 0; c < cols; c++) wells.push(rows.map((r, i) => {
        const w = { value: r[c], uid: 'u' + (uid++), group: {}, getValue() { return this.value; } };
        if (i === 0) { w.skin_type = 'ColumnHeader'; w.group.ColumnHeader = 1; } else w.group['r' + i] = 1;
        return w;
    }));
    const t = { name, wells, formula: {}, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows.length } };
    t.getFirstColumn = () => 0; t.getLastColumn = () => cols - 1; t.getFirstRow = () => 0; t.getLastRow = () => rows.length - 1;
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

(async () => {
    // The table from the report: cell values are TEXT, as cells hold them.
    const t = mkTable('production_capacity', [['Item', 'Value'], ['Malt per keg (lbs)', '50'], ['Hops per keg (lbs)', '2'], ['Yeast per keg (lbs)', '0.50000'],
        ['Kegs from Malt', '141.17650'], ['Kegs from Hops', '2058.82350'], ['Kegs from Yeast', '2823.52940'], ['Production Capacity (kegs)', ''],
        ['', ''], ['Label', 'n/a'], ['Money', '$2,500'], ['Share', '40%'], ['Negative', '-12.5']]);
    const pt = { root: [t], setMessage() { }, getTableByName: (n) => (n === t.name ? t : null), getTableNames: () => [t.name], getTablesByName: () => ({ production_capacity: t }) };
    const run = async (f) => {
        mute();
        try { const r = await load('baja/plate/ops/frun-object.js', f, pt); let v = r && r.results ? r.results[0] : r; if (v && typeof v === 'object' && 'value' in v) v = v.value; return v; }
        catch (e) { return 'THREW ' + e.message; } finally { unmute(); }
    };

    ok(await run('=min(production_capacity[1:1][4:6])') === 141.1765, 'the formula as it was typed gives the smallest of the three: ' + await run('=min(production_capacity[1:1][4:6])'));
    ok(await run('=max(production_capacity[1:1][4:6])') === 2823.5294, 'and max gives the largest, not the smallest: ' + await run('=max(production_capacity[1:1][4:6])'));
    ok(await run('=min(production_capacity[1:1][1:6])') === 0.5 && await run('=max(production_capacity[1:1][1:6])') === 2823.5294, 'over the whole run of figures');

    // what is passed over, and what is read
    ok(await run('=min(production_capacity[1:1][4:9])') === 141.1765, 'an empty cell and a label in the block are passed over, not counted as zero: ' + await run('=min(production_capacity[1:1][4:9])'));
    ok(await run('=max(production_capacity[1:1][9:11])') === 2500 && await run('=min(production_capacity[1:1][10:11])') === 0.4,
       'money and a percentage written as text are read as the numbers they are');
    ok(await run('=min(production_capacity[1:1][4:12])') === -12.5, 'a negative is the smallest when there is one');
    ok(await run('=min(production_capacity[1:1][0:6])') === 0.5, 'the heading at the top of the column is not a number either');
    const none = await run('=min(production_capacity[1:1][7:9])');
    ok(typeof none === 'number' && isNaN(none), 'a block with no number in it at all still has no smallest');

    // in arithmetic, and by tag
    ok(await run('=min(production_capacity[1:1][4:6])*2') === 282.353, 'the result is a number that arithmetic can use: ' + await run('=min(production_capacity[1:1][4:6])*2'));
    ok(await run('=max(production_capacity[r4])') === 141.1765, 'a tag reference works the same way');

    // sum and average were already right, and still are
    ok(Math.abs((await run('=sum(production_capacity[1:1][4:6])')) - 5023.5294) < 1e-6, 'sum over the same cells is unchanged');

    const src = fs.readFileSync('baja/plate/ops/frun-object.js', 'utf8');
    ok((src.match(/function max\(values\)/g) || []).length === 1 && (src.match(/function min\(values\)/g) || []).length === 1, 'one min and one max, so a later copy cannot quietly replace either');
    ok(/functionName === 'max'\) \{\s*computedResult = \[max\(blockArgs\(args, results, res\)\)\];/.test(src), 'and max() is what =max calls, on the cells its argument stands for');

    say(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { unmute(); console.error(e); process.exit(1); });

// A FORMULA THAT IS ONLY WAITING ITS TURN IS NOT A BROKEN ONE.
//
//     node tools/test/formula-order.js
//
// Formulas were worked out in whatever order they happened to be stored in. A total over a
// column is stored before the cell above it that the total reads, so the total met that
// cell's own formula text where a number should be. It failed, and failing used to `return`,
// which abandoned every formula after it as well. What the user saw was a red total and a
// cell that looked untouched, and the only thing wrong was the order.
//
// The engine half of this is real here: the dependency and the failure it causes are run
// through frun-object.js. The policy -- set aside, try again, give up only when a whole pass
// resolves nothing -- is run here as the plate track runs it, and the plate track is then
// checked to be the thing that implements it.
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

const cell = (v, h) => {
    const w = { value: v, group: {} };
    w.getValue = function () { return this.value; };
    w.setValue = function (x) { this.value = x; };
    if (h) { w.skin_type = 'ColumnHeader'; w.group['ColumnHeader'] = 1; }
    return w;
};
const mk = (name, rows) => {
    const cols = rows[0].length, wells = [];
    for (let c = 0; c < cols; c++) wells.push(rows.map((r, i) => cell(r[c], i === 0)));
    const t = { name, wells, formula: {}, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows.length } };
    t.getFirstColumn = () => 0; t.getLastColumn = () => cols - 1;
    t.getFirstRow = () => 0; t.getLastRow = () => rows.length - 1;
    t.getWellsByTag = () => [];
    t.getWellsByString = (range) => {
        const m = ('' + range).match(/\[(\d*):?(\d*)\]\[(\d*):?(\d*)\]/);
        const n = (v, d) => (v === '' || v == null ? d : parseInt(v, 10));
        const c0 = n(m[1], 0), c1 = n(m[2], cols - 1), r0 = n(m[3], 0), r1 = n(m[4], rows.length - 1);
        const out = [];
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (wells[c] && wells[c][r]) out.push(wells[c][r]);
        return out;
    };
    return t;
};

// Jeff's canvas: lease holds a number; cost reads it in row 1 and totals the column in row 3.
const build = () => {
    const lease = mk('lease', [['Name', 'Value'], ['Lease', '100000']]);
    const cost = mk('cost', [['Name', 'Value'], ['Lease', '=lease[1:1][1:1]'],
        ['Rent', '25000'], ['Total', '=sum(cost[1:1][1:2])']]);
    const pt = {
        root: [lease, cost], said: [],
        getTableByName: (n) => [lease, cost].filter((t) => t.name === n)[0] || null,
        getTableNames: () => ['lease', 'cost'],
        getTablesByName: () => ({ lease, cost }),
        formulas: {},
        setMessage(m) { this.said.push('' + m); }
    };
    // Stored in the order that breaks: the total first, the cell it reads second.
    const keys = { 'cost[1:1][3:3]': '=sum(cost[1:1][1:2])', 'cost[1:1][1:1]': '=lease[1:1][1:1]' };
    return { pt, cost, lease, keys };
};

// One formula, worked out and written back, exactly as updateWells does it.
const runOne = async (pt, cost, key, expr) => {
    const v = await load('baja/plate/ops/frun-object.js', expr, pt);
    if (!v || !v.results) throw new Error('Unable to calculate: ' + key);
    const m = key.match(/\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
    const io = v.results[0];
    const n = (io && typeof io === 'object' && 'value' in io) ? io.value : io;
    if (n === undefined || isNaN(n)) throw new Error('not a number: ' + JSON.stringify(n));
    cost.wells[+m[1]][+m[3]].setValue(parseFloat(n).toFixed(4));
};

(async () => {
    // ---- in storage order, which is what was happening --------------------------------
    let { pt, cost, keys } = build();
    let firstFailed = null;
    for (const k of Object.keys(keys)) {
        try { await runOne(pt, cost, k, keys[k]); } catch (e) { if (!firstFailed) firstFailed = k; }
    }
    ok(firstFailed === 'cost[1:1][3:3]',
       'the total fails when it is worked out before the cell it reads: ' + firstFailed);
    ok(cost.wells[1][3].value === '=sum(cost[1:1][1:2])',
       'so the total keeps its own text and the red badge goes on it');

    // ---- the same formulas, set aside and tried again ---------------------------------
    ({ pt, cost, keys } = build());
    let pending = Object.keys(keys);
    const why = {};
    let finalPass = false, passes = 0;
    for (let pass = 0; pending.length > 0; pass++) {
        const deferred = [];
        passes++;
        for (const k of pending) {
            try { await runOne(pt, cost, k, keys[k]); }
            catch (e) { why[k] = e.message; if (!finalPass) { deferred.push(k); continue; } }
        }
        if (finalPass) break;
        if (deferred.length >= pending.length) finalPass = true;
        pending = deferred;
        if (!pending.length) break;
    }
    ok(Number(cost.wells[1][1].value) === 100000,
       'the cell that reads the other table comes out: ' + cost.wells[1][1].value);
    ok(Number(cost.wells[1][3].value) === 125000,
       'and the total, on the next pass, adds it to the row below: ' + cost.wells[1][3].value);
    ok(passes === 2, 'two passes were enough, and no more were taken: ' + passes);

    // ---- something genuinely wrong is still reported, once ------------------------------
    ({ pt, cost, keys } = build());
    keys['cost[1:1][2:2]'] = '=sum(nowhere[1:1][1:1])';
    pending = Object.keys(keys); finalPass = false; passes = 0;
    const reported = [];
    for (let pass = 0; pending.length > 0; pass++) {
        const deferred = []; passes++;
        for (const k of pending) {
            try { await runOne(pt, cost, k, keys[k]); }
            catch (e) {
                if (!finalPass) { deferred.push(k); continue; }
                reported.push(k);
            }
        }
        if (finalPass) break;
        if (deferred.length >= pending.length) finalPass = true;
        pending = deferred;
        if (!pending.length) break;
    }
    ok(reported.length === 1 && reported[0] === 'cost[1:1][2:2]',
       'a reference to a table that is not there is reported, and only it: ' + JSON.stringify(reported));
    ok(Number(cost.wells[1][1].value) === 100000,
       'the formulas that were only waiting still came out: ' + cost.wells[1][1].value);
    ok(passes <= 4, 'and it stops rather than retrying forever: ' + passes + ' passes');

    // ---- the plate track is what does this ---------------------------------------------
    const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
    ok(/A FORMULA THAT IS ONLY WAITING ITS TURN IS NOT A BROKEN ONE/.test(track),
       'the pass loop is in updateCalculations');
    ok(/deferred\.push\(calculation_key\);/.test(track), 'a failure is set aside');
    ok(/if \(deferred\.length >= pending\.length\) finalPass = true;/.test(track),
       'a pass that resolves nothing is the end of waiting');
    ok(/if \(!finalPass\) \{[\s\S]{0,300}deferred\.push\(calculation_key\)/.test(track)
       && /NOTHING MOVED LAST PASS/.test(track),
       'and nothing is marked red until then');
    // The part that made one bad formula hide all the others.
    const loop = track.slice(track.indexOf('A FORMULA THAT IS ONLY WAITING'),
                             track.indexOf('WAS ANY PROGRESS MADE?'));
    ok(!/\n\s+return;\n/.test(loop),
       'and a formula that fails no longer returns out of the whole calculation, taking '
       + 'every formula after it with it');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

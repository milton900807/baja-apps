// A TOTAL IS NOT ONE OF THE FIGURES IT TOTALS, ON EVERY PASS AND NOT JUST THE FIRST.
//
//     node tools/test/sum-excludes-own-cell.js
//
// =sum(employees[1:1][1:]) in the last row totals the column above it. The open end reaches
// the last row, which is the row the formula sits in, and the engine knew to leave that cell
// out only by comparing its text with its own expression. That is true for exactly one pass:
// once the answer is written back, the cell holds a NUMBER, the text no longer matches, and
// the next recalculation adds the previous total into the new one, so the figure walks up
// by a whole column every pass and still looks like money on screen. Identity does not go stale, so updateCalculations now says which cells the formula
// is written in and those are left out by reference.
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
    const cols = rows[0].length;
    const wells = [];
    for (let c = 0; c < cols; c++) wells.push(rows.map((r, i) => cell(r[c], i === 0)));
    const t = { name: name, wells: wells, grid: { xmin: 0, ymin: 0, xmax: cols, ymax: rows.length } };
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
const track = (t, said) => ({
    getTableByName: (n) => (n === t.name ? t : null),
    getTableNames: () => [t.name], getTablesByName: () => ({ [t.name]: t }),
    setMessage: (m) => said.push('' + m)
});
const val = (r) => (r && Array.isArray(r.results)) ? r.results[0] : r;
const num = (r) => { const v = val(r); return Number(v && typeof v === 'object' && 'value' in v ? v.value : v); };

(async () => {
    const F = 'sum(employees[1:1][1:])';
    const RIGHT = 200000 + 80000 + 90000;     // 370000

    const build = () => mk('employees', [['Name', 'Salary'], ['Director', '200000'],
        ['lab tech 1', '80000'], ['lab tech 2', '90000'], ['Total', '=' + F]]);

    // ---- the pass that always worked ---------------------------------------------------
    let emp = build(); let said = [];
    let own = { wells: [emp.wells[1][4]], table: 'employees', key: '[1:1][4:4]' };
    ok(num(await load('baja/plate/ops/frun-object.js', F, track(emp, said), own)) === RIGHT,
       'the first pass totals the column above and leaves its own cell out: ' + RIGHT);

    // ---- and every pass after it, which is where it went wrong -------------------------
    // The answer is written back between passes exactly as updateCalculations writes it, so
    // from the second pass on the cell holds a number and the old text match cannot find it.
    emp = build(); said = [];
    const self = emp.wells[1][4];
    own = { wells: [self], table: 'employees', key: '[1:1][4:4]' };
    const seen = [];
    for (let pass = 0; pass < 5; pass++) {
        const v = num(await load('baja/plate/ops/frun-object.js', F, track(emp, said), own));
        seen.push(v);
        self.setValue(parseFloat(v).toFixed(4));
    }
    ok(seen.every((v) => v === RIGHT),
       'five recalculations running give the same answer every time: ' + seen.join(', '));
    ok(seen[4] === RIGHT,
       'it does not climb: unfixed this ran 370000, 740000, 1110000, 1480000, 1850000, '
       + 'a whole salary further out every single pass');

    // ---- what must NOT change ----------------------------------------------------------
    // Only the formula's own cells are left out. Dropping any cell that happens to hold a
    // number this total produced would quietly lose real figures.
    emp = build(); said = [];
    emp.wells[1][4].setValue('370000');                       // as if already computed
    ok(num(await load('baja/plate/ops/frun-object.js', 'sum(employees[1:1][1:3])',
        track(emp, said), { wells: [emp.wells[1][4]] })) === RIGHT,
       'a closed range that does not reach the total is summed exactly as written');

    emp = build(); said = [];
    ok(num(await load('baja/plate/ops/frun-object.js', F, track(emp, said),
        { wells: [emp.wells[0][4]] })) === RIGHT,
       'naming a different cell as the owner leaves the real figures alone');

    // A caller that says nothing about ownership (qpcr, the track views) keeps the text
    // match it always had, so this change takes nothing away from them.
    emp = build(); said = [];
    ok(num(await load('baja/plate/ops/frun-object.js', F, track(emp, said))) === RIGHT,
       'a caller that names no owner still gets the right answer from the text match');

    // ---- the wiring, which is the half that was missing --------------------------------
    const plate = fs.readFileSync('baja/plate/plate.js', 'utf8');
    ok(/frun-object\.js', _form, pt,[\s\S]{0,120}wells: selected_wells/.test(plate),
       'updateCalculations tells the engine which cells the formula is written in');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

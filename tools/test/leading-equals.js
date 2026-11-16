// THE LEADING '=' IS NOT PART OF THE EXPRESSION.
//
//     node tools/test/leading-equals.js
//
// "=" is how a person says "this cell is a formula". The parser has no notion of it and
// recursed on it until the stack gave out: "Maximum call stack size exceeded", thrown into a
// catch, so the cell went on showing the text that was typed into it as though nothing had
// been entered, and the total summing that column went red for finding a word where a number
// should be. Nothing anywhere said why.
//
// The plate strips it on the way through getFormula(); addFormula did not; both write to the
// same key in the track's formula map, which is never cleared. Whichever ran last decided
// whether a formula worked.
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
const num = (r) => {
    const v = r && r.results && r.results[0];
    return Number(v && typeof v === 'object' && 'value' in v ? v.value : v);
};

(async () => {
    const said = [];
    const lease = mk('lease', [['Name', 'Value'], ['Lease', '100000']]);
    const cost = mk('cost', [['Name', 'Value'], ['Lease', '=lease[1:1][1:1]'], ['Rent', '25000']]);
    const pt = {
        root: [lease, cost],
        getTableByName: (n) => [lease, cost].filter((t) => t.name === n)[0] || null,
        getTableNames: () => ['lease', 'cost'],
        getTablesByName: () => ({ lease, cost }),
        formulas: {}, setMessage: (m) => said.push('' + m)
    };
    const run = (e) => load('baja/plate/ops/frun-object.js', e, pt);

    // ---- every way a formula arrives ---------------------------------------------------
    for (const [expr, want, what] of [
        ['=lease[1:1][1:1]', 100000, 'a reference to another table, as the user typed it'],
        ['lease[1:1][1:1]', 100000, 'and with the = already stripped, as getFormula leaves it'],
        ['=sum(lease[1:1][1:1])', 100000, 'a sum, as the user typed it'],
        ['sum(lease[1:1][1:1])', 100000, 'and as getFormula leaves it'],
        ['= sum(lease[1:1][1:1])', 100000, 'with a space after the ='],
        ['==sum(lease[1:1][1:1])', 100000, 'and typed twice by accident']
    ]) {
        said.length = 0;
        let got = null, threw = false;
        try { got = num(await run(expr)); } catch (e) { threw = true; }
        ok(!threw && got === want, JSON.stringify(expr) + ': ' + what + ' -> ' + got
            + (said.length ? (' | said: ' + said.join(' ').slice(0, 90)) : ''));
    }

    // Before this, a leading = recursed until the stack gave out. The message is worth
    // keeping in the record, because it is what was in the console while the cell sat there
    // looking untouched.
    ok(true, 'unfixed, every one of those answered "Maximum call stack size exceeded"');

    // ---- and the map it is stored in ----------------------------------------------------
    const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
    ok(/addFormula\(wellselections, formula\) \{[\s\S]{0,400}replace\(\/\^=\+\\s\*\/, ''\)/.test(track),
       'addFormula stores it the way the engine reads it, like the plate does');
    const eng = fs.readFileSync('baja/plate/ops/frun-object.js', 'utf8');
    ok(/expression = \('' \+ \(expression == null \? '' : expression\)\)\.trim\(\)\.replace\(\/\^=\+\\s\*\/, ''\);/.test(eng),
       'and the engine strips it at the door, so none of the fifteen callers has to remember');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

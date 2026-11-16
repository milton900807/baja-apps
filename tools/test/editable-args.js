// THE VALUES CAN BE CHANGED BEFORE IT RUNS.
//
//     node tools/test/editable-args.js
//
// "A new table called lab_employees" has to come out some size, and 10 x 5 is a guess at
// what was not said. Printing the guess and offering only GO or Cancel makes a wrong number
// into a thing to undo: run it, look at it, delete it, say it again with the number in.
//
// This drives the real card in a real DOM: types into the boxes and checks what is run.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let ran = null;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/menu-pick.py') {
        // the shape the picker really answers with: status first, or the card says it could
        // not read the request and nothing else happens
        return { status: 'OK', pick: null, alternatives: [],
            operation: 'new_table', args: { rows: 10, cols: 5, name: 'lab_employees' },
            explain: 'A new table will be created' };
    }
    if (p === 'baja/plate/ops/new-table.js') { ran = a[1]; return { ok: true }; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getUser: () => 'jeff@x.com' };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sel) => document.querySelector(sel);
const type = (sel, v) => {
    const el = q(sel); el.value = v;
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};

// The card matches against the menubar as well as the operations, and refuses outright
// when there is nothing on screen to match: one item is enough to get past that.
const MENUS = [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }];

(async () => {
    const pt = { root: [], m_plots: [], setMessage: () => { }, wake: () => { } };
    const card = load('baja/plate/menu/project-command.js', {
        menus: MENUS, pm: pt, text: 'create a new table called lab_employees', context: {},
        setError: () => { }
    });
    await sleep(60);

    ok(!!q('#pc-op'), 'the card is up with a GO button');
    ok(!!q('[data-arg="rows"]') && !!q('[data-arg="cols"]') && !!q('[data-arg="name"]'),
       'every declared parameter has a box');
    ok(q('[data-arg="rows"]').value === '10' && q('[data-arg="cols"]').value === '5',
       'filled in with what was worked out: ' + q('[data-arg="rows"]').value + ' x ' + q('[data-arg="cols"]').value);
    ok(q('[data-arg="name"]').value === 'lab_employees', 'and the name that was asked for');
    ok(/10 x 5/.test(q('#pc-headline').textContent), 'the headline says the same: ' + q('#pc-headline').textContent);

    // change them
    type('[data-arg="rows"]', '40');
    type('[data-arg="cols"]', '3');
    ok(/40 x 3/.test(q('#pc-headline').textContent),
       'editing a box changes the headline as you type: ' + q('#pc-headline').textContent);
    ok(!q('#pc-op').disabled, 'and GO stays live while the values are good');

    // a value the operation refuses turns GO off rather than failing on press
    type('[data-arg="rows"]', '9000');
    ok(q('#pc-op').disabled === true, 'a value out of range turns GO off');
    ok(/rows/.test(q('#pc-argerr').textContent), 'and says which one: ' + q('#pc-argerr').textContent);
    type('[data-arg="rows"]', '40');
    ok(q('#pc-op').disabled === false, 'putting it right turns GO back on');

    // what runs is what is in the boxes
    q('#pc-op').click();
    await sleep(40);
    ok(!!ran, 'it ran');
    ok(ran.rows === 40 && ran.cols === 3,
       'with the EDITED values, not the ones it came up with: ' + JSON.stringify(ran));
    ok(ran.name === 'lab_employees', 'and the untouched ones as they were');
    await card;

    // an enum is a list, not a free text box
    ran = null;
    const load2 = async (p, ...a) => {
        if (p === 'py/bio/project/menu-pick.py') {
            return { status: 'OK', pick: null, alternatives: [],
                operation: 'format_cells', args: { style: 'dollar' } };
        }
        return load(p, ...a);
    };
    global.lion_engine = { exec: (p, ...a) => load2(p, ...a), getUser: () => 'jeff@x.com' };
    const card2 = load2('baja/plate/menu/project-command.js', {
        menus: MENUS, pm: pt, text: 'make these dollars', context: {}, setError: () => { }
    });
    await sleep(60);
    const sel = q('[data-arg="style"]');
    ok(!!sel && sel.tagName === 'SELECT', 'an enum parameter is a list of what it accepts');
    ok(Array.from(sel.options).map((o) => o.value).indexOf('plain') >= 0,
       'with the other values in it, so the choice can be changed without typing');
    ok(sel.value === 'dollar', 'and the chosen one selected');
    q('#pc-cancel').click();
    await sleep(20);

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

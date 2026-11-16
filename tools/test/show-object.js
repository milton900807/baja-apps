// SHOW ME THE THING THAT IS ALREADY HERE.
//
//     node tools/test/show-object.js
//
// "Show me assumptions", with a table called Assumptions on the canvas, offered a menu item
// that opens a Product Assumptions dialog. The words matched and the request did not: the
// canvas was scrolled somewhere else, which is the whole reason for asking.
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

(async () => {
    const mk = (name) => ({ name: name, grid: { xmin: 0, ymin: 0, xmax: 2, ymax: 2 } });
    const assumptions = mk('Assumptions'), employees = mk('Employees'), tl = mk('strehg');
    const fitted = [], selected = [], said = [];
    const pt = {
        root: [assumptions, employees], m_plots: [tl],
        zoomToFitTable: async (o) => { fitted.push(o.name); },
        setSelected: (o) => selected.push(o.name),
        setMessage: (m) => said.push('' + m), wake: () => { }
    };
    const run = (args) => load('baja/plate/ops/focus-object.js', pt, args);

    let r = await run({ name: 'Assumptions' });
    ok(!r.error && r.name === 'Assumptions', 'it finds the table by name: ' + JSON.stringify(r));
    ok(fitted[0] === 'Assumptions', 'and puts it on screen');
    ok(selected[0] === 'Assumptions', 'and selects it, so the menus act on it');
    ok(r.moved === true, 'and says the view moved');

    r = await run({ name: 'assumptions' });
    ok(!r.error && r.name === 'Assumptions', 'the name is matched without case mattering');

    r = await run({ name: 'strehg' });
    ok(!r.error && r.name === 'strehg',
       'a timeline is found too: it is on the canvas, in another list');

    r = await run({ name: 'product assumptions' });
    ok(!r.error && r.name === 'Assumptions',
       'a near miss still finds it, which is how people say names: ' + JSON.stringify(r));

    r = await run({ name: 'nothing of that name' });
    ok(!!r.error && /Assumptions/.test(r.error) && /strehg/.test(r.error),
       'and a name that is not here lists what is: ' + r.error);

    r = await run({});
    ok(!!r.error && /which one/.test(r.error), 'with no name it asks which');

    // an exact name is not a coin toss against a longer one that contains it
    const pt2 = { root: [mk('Assumptions_2026'), mk('Assumptions')], zoomToFitTable: async () => { },
        setMessage: () => { }, setSelected: () => { } };
    r = await load('baja/plate/ops/focus-object.js', pt2, { name: 'Assumptions' });
    ok(r.name === 'Assumptions', 'an exact name wins over one that merely contains it');

    // ---- the catalogue and the context ------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('show_object') >= 0, 'show_object is offered');
    ok(cap.validate('show_object', { name: 'Assumptions' }).ok, 'it takes a name');
    ok(!cap.validate('show_object', {}).ok, 'and needs one');
    ok(/centre on "Assumptions"/.test(cap.preview('show_object', { name: 'Assumptions' })),
       'the card says what it will do: ' + cap.preview('show_object', { name: 'Assumptions' }));
    ok(/THIS IS THE ANSWER whenever the /.test(JSON.stringify(cap.catalogue())),
       'and the catalogue says it beats a menu item carrying the same word');

    const pc = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
    ok(/const onCanvas = \(\(\) => \{/.test(pc), 'the names on the canvas are collected');
    ok(/track\.root, track\.m_plots/.test(pc), 'from every list the track keeps');
    ok(/on_canvas: onCanvas/.test(pc), 'and sent with every request');
    ok(/out\.slice\(0, 60\)/.test(pc), 'capped, so a big project does not send a page of names');

    const py = fs.readFileSync('py/bio/project/menu-pick.py', 'utf8');
    ok(/THE NAMES IN on_canvas ARE THINGS THE USER CAN SEE/.test(py), 'the model is told what that list is');
    ok(/The menu item belongs in alternatives, not as the pick/.test(py),
       'and that the menu item of the same name is an alternative, not the answer');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

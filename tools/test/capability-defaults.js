// EVERY OPTIONAL PARAMETER MUST SAY WHAT HAPPENS WITHOUT IT.
//
//     node tools/test/capability-defaults.js
//
// "move the values to the top" was refused with "the request doesn't specify a column",
// even though column is optional and defaults to the first. A model reading a catalogue
// treats a missing value as a reason to refuse unless it can see what happens without one.
// So an optional parameter that does not state its default is a bug waiting to happen, and
// this fails the build rather than waiting for someone to hit it.
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

(async () => {
    const CAP = await load('baja/plate/menu/project-capabilities.js');
    ok(CAP.list.length >= 5, CAP.list.length + ' operations are declared');

    const missing = [];
    for (const op of CAP.list) {
        for (const k of Object.keys(op.params || {})) {
            const p = op.params[k];
            if (!p.required && p.default == null) missing.push(op.name + '.' + k);
        }
    }
    ok(missing.length === 0, missing.length
        ? ('these optional parameters do not say what happens without them: ' + missing.join(', '))
        : 'every optional parameter states its default');

    // the default has to survive into what the model is actually sent
    const cat = CAP.catalogue();
    const rc = cat.filter((c) => c.name === 'rearrange_column')[0];
    ok(!!rc, 'rearrange_column reaches the catalogue');
    ok(rc.params.column.required !== true, 'its column is not required');
    ok(typeof rc.params.column.default === 'string',
       'AND THE CATALOGUE CARRIES THE DEFAULT: ' + JSON.stringify(rc.params.column.default));
    ok(Array.isArray(rc.params.action.values) && rc.params.action.values.indexOf('compact') >= 0,
       'and an enum carries its values, so the model can name one: '
       + (rc.params.action.values || []).join(', '));

    // module paths must never reach the model
    ok(JSON.stringify(cat).indexOf('baja/plate/ops') < 0,
       'no module path appears anywhere in what is sent');

    // "move the values to the top" with no column named must validate
    const v = CAP.validate('rearrange_column', { action: 'compact' });
    ok(v.ok === true, 'compact with no column named validates: ' + JSON.stringify(v.problem || ''));
    const v2 = CAP.validate('rearrange_column', { action: 'nonsense' });
    ok(v2.ok === false, 'and an action that is not in the list still does not');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

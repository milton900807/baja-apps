// "SHARE THIS" OPENS THE SHARE DIALOG.
//
//     node tools/test/share-object.js
//
// Asking to share a table is asking for the thing the Share button opens: the dialog with
// the address field, the access choice and the list of who already has it. The request's
// address and access go into the fields; NOTHING is sent. A share is a document leaving the
// owner's hands for a named person, read off a sentence that may have the address or the
// name slightly wrong, and there is no taking it back, so the press that makes it deliberate
// is the one thing that must not be automated away.
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

const mk = (name) => ({ name: name, wells: [[{ value: '' }]], uid: 'u_' + name });
const mkPt = () => {
    const emp = mk('employees'), cost = mk('cost');
    const shared = [];
    return {
        pt: {
            root: [emp, cost], m_plots: [],
            setMessage: () => { }, wake: () => { }, setSelected(x) { this.__sel = x; },
            shareObject(obj, prefill) { shared.push({ obj: obj, prefill: prefill || null }); }
        }, emp, cost, shared
    };
};
const run = (pt, o) => load('baja/plate/ops/share-object.js', pt, o);

(async () => {
    // ---- the object ------------------------------------------------------------------
    let { pt, emp, cost, shared } = mkPt();
    let r = await run(pt, { name: 'employees' });
    ok(!r.error && r.opened && shared.length === 1 && shared[0].obj === emp,
       'a named table opens its own share dialog: ' + JSON.stringify(r.name));

    // Pressing Ask on a table and typing "share this" names it as plainly as typing it.
    ({ pt, emp, cost, shared } = mkPt());
    pt.__askedTable = 'cost';
    r = await run(pt, {});
    ok(shared.length === 1 && shared[0].obj === cost,
       'with no name, the object the Ask came from is the one shared: ' + r.name);

    ({ pt, emp, cost, shared } = mkPt());
    pt.selectedPlate = emp;
    r = await run(pt, {});
    ok(shared[0].obj === emp, 'failing that, the selected one');

    ({ pt, emp, cost, shared } = mkPt());
    r = await run(pt, {});
    ok(!!r.error && /which one/.test(r.error) && !shared.length,
       'and with nothing to go on it asks rather than picking one: ' + r.error);

    ({ pt, emp, cost, shared } = mkPt());
    r = await run(pt, { name: 'payroll' });
    ok(!!r.error && /nothing called "payroll"/.test(r.error) && !shared.length,
       'a name that is not there is said plainly, with what is: ' + r.error);

    // ---- what goes into the dialog -----------------------------------------------------
    ({ pt, emp, cost, shared } = mkPt());
    r = await run(pt, { name: 'employees', emails: 'ana@lab.org', access: 'view only' });
    ok(shared[0].prefill && shared[0].prefill.emails === 'ana@lab.org',
       'the address the request named is filled in');
    ok(shared[0].prefill.access === 'view',
       '"view only" is the view access, not a guess at something else: ' + shared[0].prefill.access);
    ok(/Nothing is sent until you press Share/.test(r.message),
       'and it says so: ' + r.message);

    ({ pt, emp, cost, shared } = mkPt());
    r = await run(pt, { name: 'employees', access: 'anyone with the link' });
    ok(shared[0].prefill.access === 'public', 'a link for anyone is the public one');

    ({ pt, emp, cost, shared } = mkPt());
    r = await run(pt, { name: 'employees', access: 'whatever' });
    ok(!shared[0].prefill || !shared[0].prefill.access,
       'an access it cannot read is left to the dialog default rather than guessed');

    ({ pt, emp, cost, shared } = mkPt());
    await run(pt, { name: 'employees' });
    ok(shared[0].prefill === null,
       'and a bare "share this" fills in nothing at all');

    // ---- nothing is sent, ever, from here ----------------------------------------------
    const src = fs.readFileSync('baja/plate/ops/share-object.js', 'utf8');
    ok(!/POSTJSON|fetch\(|\/share-with|ce-send/.test(src),
       'the operation itself sends nothing and does not press the dialog button for you');

    // ---- the dialog takes the prefill ---------------------------------------------------
    const dlg = fs.readFileSync('baja/plate/collab/share-for-coediting.js', 'utf8');
    ok(/objectRef && objectRef\.prefill/.test(dlg) && /\$\('ce-to'\)[\s\S]{0,40}pre\.emails/.test(dlg),
       'the dialog fills its address field from it');
    ok(/input\[name="ce-access"\]\[value="' \+ pre\.access/.test(dlg),
       'and ticks the access it was given');
    const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
    ok(/shareObject\(obj, prefill\)/.test(track) && /prefill: prefill \|\| null/.test(track),
       'and shareObject passes it through, so the Share button and the Ask box open the '
       + 'same dialog');

    // ---- it is in the catalogue, which is how the ask reaches it ------------------------
    const cat = await load('baja/plate/menu/project-capabilities.js');
    const list = (cat && (cat.catalogue ? cat.catalogue() : cat)) || [];
    const share = (Array.isArray(list) ? list : []).filter((c) => c && c.name === 'share_object')[0];
    ok(!!share, 'share_object is a declared capability');
    // catalogue() strips module paths deliberately -- they are not the model's business --
    // so the wiring is checked where it is actually used, in what validate hands back.
    const v = cat.validate('share_object', { name: 'employees', emails: 'ana@lab.org', access: 'view only' });
    ok(v && v.ok && v.capability && v.capability.module === 'baja/plate/ops/share-object.js',
       'and validating a share routes to this module: ' + JSON.stringify(v && v.problem));
    ok(v && v.args && v.args.access === 'view only',
       'an access worded the way people word it is passed through rather than refused: '
       + JSON.stringify(v && v.args));
    ok(share && /nothing is sent/i.test(share.summary),
       'and its description tells the model it only opens a dialog, so choosing it is safe');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

// A SENTENCE OR A FORMULA? And does a sentence reach the right menu item?
//
//     node tools/test/project-command-routing.js        (needs jsdom)
//
// The command field in the project app has always been a formula bar. Sending a formula to
// a language model instead would be a regression no matter how good the guess, so the test
// that matters most is the NEGATIVE one: every shape of formula still goes down the old
// path untouched. The functions are pulled out of the real files rather than copied here,
// because a copy of a predicate tests the copy.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// ---- the predicate, taken out of the module that ships ------------------------------
const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
const k = nav.indexOf('const looksLikeASentence = (str) => {');
const END = '\n        };';
const end = nav.indexOf(END, k) + END.length;
const isSentence = new Function(nav.slice(k, end) + '\n return looksLikeASentence;')();

console.log('formulas must NOT be treated as sentences:');
[
    ['A1:H12', 'a range'],
    ['=mean(A1:A12)', 'a leading ='],
    ['mean(ctrl[1])', 'a call with a table lookup'],
    ['ctrl', 'one bare word is a name, not a request'],
    ['plate1|plate2', 'a pipe'],
    ['x = 3', 'an assignment'],
    ['dose[1];dose[2]', 'brackets and a semicolon'],
    ['Treated [nM] (mean)', 'words, but carrying formula punctuation'],
    ['qpcr', 'a short token'],
    ['', 'nothing typed'],
    ['  ', 'only spaces'],
].forEach(([t, why]) => ok(isSentence(t) === false, '  "' + t + '" stays a formula: ' + why));

console.log('sentences must be recognised:');
[
    'import a plate from a spreadsheet',
    'share this project with my postdoc',
    'make a new plate from the selection',
    'show me the qpcr analysis',
    'open the well editor please',
].forEach((t) => ok(isSentence(t) === true, '  "' + t + '"'));

// ---- the panel: flattening, and that nothing runs on its own -------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let sentMenu = null, reply = null;
const ions = {};
let fired = [];
// Ions resolve through lion_engine, the way lib/core.js does it, not through a global of
// the same name: a stub that is easier to reach than the real one tests the stub.
const mkIon = (name) => { const ref = 'ion:' + name; ions[ref] = () => fired.push(name); return ref; };

const load = async (p, ...a) => {
    if (/menu-pick\.py$/.test(p)) { sentMenu = JSON.parse(a[1]); return reply; }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    getIonFunction: (ref) => ions[ref],
    createIonFunction: (f) => { const r = 'ion:anon' + Math.random(); ions[r] = f; return r; }
};

const menus = [
    { label: 'File', items: [
        { label: 'Open', ionFunction: mkIon('open') },
        { label: 'Import', tooltip: 'Bring in a spreadsheet', ionFunction: mkIon('import') },
        { label: 'Recent', header: true },                       // a caption
        { label: 'Broken', ionFunction: null }                   // nothing behind it
    ] },
    { label: 'Share', items: [{ label: 'Share for co-editing', ionFunction: mkIon('share') }] },
    { label: 'Select all', ionFunction: mkIon('selectall') }      // a leaf button
];

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 8); i++) await tick(); };
const body = () => document.body.textContent || '';

(async () => {
    reply = { status: 'OK', pick: 1, explain: 'Brings a spreadsheet in as a plate',
              alternatives: [0], unsupported: '' };
    await load('baja/plate/menu/project-command.js',
        { menus: menus, text: 'import a plate from a spreadsheet' });
    await settle();

    const paths = sentMenu.map((r) => r.path);
    ok(paths.indexOf('File > Import') >= 0, 'a nested item is sent as its full path');
    ok(paths.indexOf('Select all') >= 0, 'a leaf button on the bar is an action too');
    ok(paths.indexOf('File > Recent') < 0, 'a caption is not offered as something to run');
    ok(paths.indexOf('File > Broken') < 0, 'nor is a label with nothing wired to it');
    ok(sentMenu.every((r) => !('__m' in r)), 'the live menu objects are not sent out');
    ok(JSON.stringify(sentMenu).indexOf('ion:') < 0, 'and neither are the ion references');

    ok(body().indexOf('File > Import') >= 0, 'the chosen item is named on screen');
    ok(fired.length === 0, 'NOTHING RUNS until it is pressed');

    document.getElementById('pc-go').onclick();
    await settle();
    ok(fired.join(',') === 'import', 'pressing it runs that item and only that item');
    ok(!document.getElementById('baja-project-command'), 'and the panel goes away');

    // nothing matched: the near misses are offered, not run
    fired = [];
    reply = { status: 'OK', pick: null, explain: '', alternatives: [0, 2],
              unsupported: 'there is no place here to email a report' };
    await load('baja/plate/menu/project-command.js',
        { menus: menus, text: 'email a weekly report to the team' });
    await settle();
    ok(body().indexOf('Nothing in this menu does that') >= 0, 'a miss says so plainly');
    ok(body().indexOf('no place here to email a report') >= 0, 'and says what was missing');
    ok(fired.length === 0, 'and runs none of the near misses on its own');
    const alt = document.querySelectorAll('.pc-alt');
    ok(alt.length === 2, 'the near misses are offered as choices');
    alt[0].onclick({ preventDefault() { } });
    await settle();
    ok(fired.join(',') === 'open', 'and one runs only when it is chosen');

    // an index outside the list is dropped, not nudged into range
    fired = [];
    reply = { status: 'OK', pick: 99, explain: 'x', alternatives: [], unsupported: '' };
    await load('baja/plate/menu/project-command.js', { menus: menus, text: 'do the thing' });
    await settle();
    ok(fired.length === 0 && body().indexOf('Nothing in this menu does that') >= 0,
       'an index that is not in the list runs nothing');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

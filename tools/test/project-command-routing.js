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


// ---- IS THE ROUTER ACTUALLY IN SCOPE WHERE THE COMMAND FIELDS ARE BUILT? -------------
//
// It was not, and nothing caught it. The helper sat inside a block that closed hundreds of
// lines before the menubar that matters, so pressing Enter threw a ReferenceError that went
// nowhere and looked exactly like a key that had not been pressed. Compiling proves nothing
// here: the reference is only resolved when the handler runs, and the handler only runs in
// the product.
//
// Parsed, not counted. A first attempt walked brace depth, which counts the braces inside
// strings, regexes and comments and therefore lied in both directions -- it cleared a
// reference that was out of scope and condemned one that was fine. This asks a real parser
// which scope each declaration belongs to and whether every use sits inside it.
//
// What this does NOT prove: that the field is wired to this handler at all, or that the
// panel opens. That needs the running app.
(() => {
    const acorn = require('acorn');
    const ast = acorn.parse('(' + nav + ')', { ecmaVersion: 2022, locations: true });
    const SCOPEY = new Set(['Program', 'FunctionDeclaration', 'FunctionExpression',
        'ArrowFunctionExpression', 'BlockStatement', 'ForStatement', 'ForOfStatement',
        'ForInStatement', 'CatchClause']);

    // A PLAIN TRAVERSAL, NOT acorn-walk. Its base visitor treats the left side of an
    // assignment as a pattern and never reports the identifier, so `__lastMenus = ...` was
    // invisible: the check counted one reference where there are two. A walker that silently
    // skips the write would also silently skip an out-of-scope write, which is the whole
    // thing being looked for.
    const visit = (node, parents, fn) => {
        if (!node || typeof node.type !== 'string') return;
        fn(node, parents);
        const next = parents.concat([node]);
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
            const v = node[key];
            if (Array.isArray(v)) { for (const k of v) visit(k, next, fn); }
            else visit(v, next, fn);
        }
    };

    const scopeOf = (parents) => {
        for (let i = parents.length - 1; i >= 0; i--) if (SCOPEY.has(parents[i].type)) return parents[i];
        return ast;
    };

    const check = (name, least) => {
        let decl = null;
        visit(ast, [], (n, parents) => {
            if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier'
                && n.id.name === name && !decl) {
                decl = { scope: scopeOf(parents), line: n.id.loc.start.line };
            }
        });
        ok(!!decl, name + ' is declared in the panel module');
        if (!decl) return;
        let total = 0;
        const out = [];
        visit(ast, [], (n, parents) => {
            if (n.type !== 'Identifier' || n.name !== name) return;
            // a property name (o.runCommandText) is not a reference to the variable
            const p = parents[parents.length - 1];
            if (p && p.type === 'MemberExpression' && !p.computed && p.property === n) return;
            if (p && p.type === 'Property' && p.key === n && !p.computed) return;
            if (n.loc.start.line === decl.line) return;
            total++;
            if (!(decl.scope === ast || parents.indexOf(decl.scope) >= 0)) out.push(n.loc.start.line);
        });
        ok(total >= least, name + ' is used where it should be (' + total + ' references)');
        ok(out.length === 0, out.length
            ? (name + ' is OUT OF SCOPE at line(s) ' + out.join(', ') + ': the block it is '
                + 'declared in has closed by then, so this throws when the handler runs')
            : ('every use of ' + name + ' can actually see it'));
    };

    check('runCommandText', 7);
    check('looksLikeASentence', 1);
    check('__lastMenus', 2);

    ok(nav.indexOf('pm: plate_graph') >= 0,
       'the project handed to an operation is this module\'s own handle, not a name it lacks');
    ok(!/\bpm\s*&&\s*pm\.selectedPanel/.test(nav),
       'and no reference is left to a pm that does not exist in this module');
})();

// ---- the panel: flattening, and that nothing runs on its own -------------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let sentMenu = null, sentOps = null, reply = null;
const ions = {};
let fired = [];
// Ions resolve through lion_engine, the way lib/core.js does it, not through a global of
// the same name: a stub that is easier to reach than the real one tests the stub.
const mkIon = (name) => { const ref = 'ion:' + name; ions[ref] = () => fired.push(name); return ref; };

const load = async (p, ...a) => {
    if (/menu-pick\.py$/.test(p)) {
        sentMenu = JSON.parse(a[1]);
        sentOps = JSON.parse(a[4] || '[]');
        return reply;
    }
    // The engine resolves a path with or without the extension; so does this, or modules
    // that exec their dependencies by bare name fail here and not in the product.
    const isFile = (x) => { try { return fs.statSync(x).isFile(); } catch (e) { return false; } };
    const file = isFile(p) ? p : (isFile(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(file, 'utf8') + ')')(load, []);
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
    ok(body().indexOf('Nothing here does that') >= 0, 'a miss says so plainly');
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
    ok(fired.length === 0 && body().indexOf('Nothing here does that') >= 0,
       'an index that is not in the list runs nothing');

    // ---- it does it when it can, and opens the UI when it cannot --------------------
    //
    // "draw a table with two rows and 4 cols" is the case that started this. Draw > Table
    // cannot take a size: it asks for a name and then measures the drag.
    let made = [];
    const pm = { plateTrack: {
        addPlateWithConsistentWellSize: (p) => made.push(p),
        panToNextSpot: async () => { }, updateCalculations: () => { }, setMessage: () => { }
    } };

    fired = [];
    reply = { status: 'OK', operation: 'new_table', args: { rows: 2, cols: 4 },
              pick: 3, explain: 'Adds an empty 2 x 4 table', alternatives: [], unsupported: '' };
    await load('baja/plate/menu/project-command.js',
        { menus: menus, pm: pm, text: 'draw a table with two rows and 4 cols' });
    await settle(10);
    ok(Array.isArray(sentOps) && sentOps.some((o) => o.name === 'new_table'),
       'the declared operations are offered to the model alongside the menu');
    ok(sentOps.every((o) => !('module' in o)), 'but never the module path that would run them');
    ok(body().indexOf('add a 2 x 4 table') >= 0, 'the operation is described in plain words');
    ok(made.length === 0, 'and still nothing runs until it is pressed');
    document.getElementById('pc-op').onclick();
    await settle(10);
    ok(made.length === 1, 'PRESSING IT MAKES THE TABLE');
    ok(made[0].grid.xmax === 4 && made[0].grid.ymax === 2,
       'with the size that was asked for: ' + made[0].grid.xmax + ' x ' + made[0].grid.ymax);

    // a size beyond what a table can be is REFUSED, and the UI is offered instead
    made = []; fired = [];
    reply = { status: 'OK', operation: 'new_table', args: { rows: 2, cols: 4000 },
              pick: 1, explain: 'x', alternatives: [], unsupported: '' };
    await load('baja/plate/menu/project-command.js',
        { menus: menus, pm: pm, text: 'make a table with 4000 columns' });
    await settle(10);
    ok(made.length === 0 && !document.getElementById('pc-op'),
       'a size outside what a table can be does not run');
    ok(body().indexOf('at most 200') >= 0, 'it says what the limit is');
    ok(body().indexOf('File > Import') >= 0, 'AND IT OFFERS THE UI INSTEAD OF REFUSING');

    // an operation name that is not declared is ignored, and the menu still answers
    made = []; fired = [];
    reply = { status: 'OK', operation: 'rm -rf', args: {}, pick: 1, explain: 'x',
              alternatives: [], unsupported: '' };
    await load('baja/plate/menu/project-command.js',
        { menus: menus, pm: pm, text: 'something else entirely' });
    await settle(10);
    ok(made.length === 0, 'an operation name that was never declared runs nothing');
    ok(body().indexOf('File > Import') >= 0, 'and the menu answer still stands');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();

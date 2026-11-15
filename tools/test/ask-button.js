// A BUTTON THAT ASKS, ON THE TOOLBAR.
//
//     node tools/test/ask-button.js
//
// Two attempts at putting a field on the object itself failed: the canvas cannot hold a
// text field, and an HTML input positioned over it never appeared. This is a toolbar button
// like every other one up there, which is the machinery that certainly renders.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const src = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');

const k = src.indexOf('const askButton = () => {');
ok(k > 0, 'the panel builds an ask button');
let i = src.indexOf('{', k + 20), d = 0, j = i;
for (;; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
const body = src.slice(i + 1, j);

// the title, run for real
const titleFor = (sel) => new Function('selectedPlate', `
    const createIonFunction = () => null, exec = () => null, plate_graph = {}, execCMD = null, __lastMenus = [];
    ${body}`).call(null, sel);
ok(Array.isArray(titleFor(null)) && titleFor(null).length === 0,
   'with nothing selected there is no button: "about this" needs a this');
const tl = titleFor({ type: 'timeline', name: 'adf' })[0];
ok(!!tl && /timeline/i.test(tl.label), 'with a timeline selected it says so: ' + tl.label);
ok(/adf/.test(tl.label), 'and names it');
ok(!!tl.icon && !!tl.tooltip, 'it has an icon and a tooltip, so it renders like the others');
// The menu component reads ionfunction ?? ionFunction, and this app writes the lowercase
// one. Checking only that the key EXISTS, since the stub above makes it null: what matters
// is the spelling, which is what dropped a whole menu out of the catalogue once already.
ok('ionfunction' in tl, 'and something wired to it, spelled the way the component reads it');
const tbl = titleFor({ name: 'hellowrold' })[0];
ok(/hellowrold/.test(tbl.label), 'with a table selected it names the table: ' + tbl.label);

// it is on EVERY toolbar this panel builds, once each
const bars = (src.match(/\.\.\.shareMenu\(\),/g) || []).length;
const asks = (src.match(/\.\.\.askButton\(\),/g) || []).length;
ok(bars > 0 && asks === bars, 'it is on each of the ' + bars + ' toolbars, once (' + asks + ')');

// the interpreter still gets first refusal
ok(/handled = !!\(await execCMD\(t\)\)/.test(body),
   'a timeline request goes to the interpreter first, as it does from the command field');
ok(/project-command\.js/.test(body), 'and to the operations panel when it did not take it');

// the dialog it opens is the app's own
ok(/prompt-text\.js/.test(body), 'it asks through the standard text prompt, not a hand-built one');
ok(/label: 'GO'/.test(body), 'whose button says GO');

// the failed overlay is gone rather than left as dead UI
ok(!fs.existsSync('baja/plate/menu/object-prompt.js'),
   'the overlay that never appeared is removed, not left behind');
ok(!/object-prompt/.test(src), 'and nothing still calls it');

console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
process.exit(fails ? 1 : 0);

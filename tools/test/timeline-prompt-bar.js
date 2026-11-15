// A PROMPT BOX OF ITS OWN, UNDER THE BAR.
//
//     node tools/test/timeline-prompt-bar.js
//
// What this can check is the structure: that the bar exists, that it sits directly under the
// menubar in the card stack, that everything typed into it is read as a request rather than
// tested for whether it might have been a command, and that it does not reach the command
// interpreter. One field, one job.
//
// What it CANNOT check is that Angular draws the input, which depends on the menu component
// rendering one for any data.cmd. That is read from the component rather than assumed, and
// is asserted here as a fact about that file so the day it changes this fails rather than
// the feature going quiet.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('cpd/main-timeline.js', 'utf8');

const k = src.indexOf('const timeline_prompt_bar = {');
ok(k > 0, 'the timeline app declares a prompt bar');
let i = src.indexOf('{', k), d = 0, j = i;
for (;; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
const bar = src.slice(k, j + 1);

ok(/wid:\s*'menu'/.test(bar), 'it is a menu component, which is what carries a command input');
ok(/cmd:\s*createIon/.test(bar), 'with a command field');
ok(/menus:\s*\[\s*\]/.test(bar), 'and no menu buttons of its own: it is just the box');
ok(/placeholder:/.test(bar), 'it says what it is for');

ok(/__askTimeline\(/.test(bar), 'EVERYTHING TYPED IN IT IS READ AS A REQUEST');
ok(!/looksLikeASentence/.test(bar),
   'with no test for whether it might have been a command: that is the point of a second box');
ok(!/interpreter\.executeCommand/.test(bar), 'and it never reaches the command interpreter');

// placed directly under the menubar
const stack = src.indexOf('return top_menubar; })(),');
ok(stack > 0, 'the card stack puts the menubar first');
const after = src.slice(stack, stack + 400);
ok(/^return top_menubar; \}\)\(\),\s*timeline_prompt_bar,/.test(after.trim()),
   'and the prompt bar DIRECTLY under it, above everything else');

// the menubar's own field keeps its job
const mk = src.indexOf('const top_menubar = {');
const menubar = src.slice(mk, mk + 1800);
ok(/interpreter\.executeCommand/.test(menubar), 'the menubar field still runs commands');

// the component really does draw an input for any cmd
const comp = '/home/claude/baja/src/app/published-lionscript/simple-menu.component.html';
if (fs.existsSync(comp)) {
    const html = fs.readFileSync(comp, 'utf8');
    ok(/\*ngIf="cmd && isPrimaryCommandInput"/.test(html),
       'the menu component draws its input whenever data.cmd is set');
    const ts = fs.readFileSync(comp.replace('.html', '.ts'), 'utf8');
    ok(/isPrimaryCommandInput = true;/.test(ts) && ts.split('isPrimaryCommandInput').length === 2,
       'and isPrimaryCommandInput is true and never turned off, so a SECOND bar draws one too');
    ok(/if \(this\.data\["placeholder"\]\)/.test(ts), 'and it honours the placeholder');
} else {
    console.log('  --   the Angular shell is not checked out here; component checks skipped');
}

console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
process.exit(fails ? 1 : 0);

// A BUTTON ON THE TIMELINE'S OWN BAR, NOT THE ONE ABOVE IT.
//
//     node tools/test/ask-button.js
//
// Three attempts put this somewhere it could not be seen: twice on the canvas, once on the
// shell's toolbar. So what this checks is WHERE it is. The button belongs to the timeline
// window's own menubar, declared in cpd/main-timeline.js, and nowhere else.
//
// What it cannot check is that Angular draws it, which depends on the menu component making
// a button out of a leaf entry. That is read from the component rather than assumed, so the
// day it changes this fails instead of the button going quiet.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('cpd/main-timeline.js', 'utf8');

const k = src.indexOf("// A BUTTON ON THE TIMELINE'S OWN BAR.");
ok(k > 0, 'the timeline window declares an ask button');

// it is inside top_menubar's own menus, which is the bar on the timeline window
const mb = src.indexOf('const top_menubar = {');
// the first cards: [ in this file belongs to another panel entirely, so the end of the
// menubar is the point where the card stack takes it, not the first stack in the file.
const stack = src.indexOf('return top_menubar; })(),');
ok(mb > 0 && k > mb && stack > k, 'inside the timeline window menubar, before the stack takes it');
ok(/menus: \[\s*\/\/ A BUTTON ON THE TIMELINE'S OWN BAR\./.test(src),
   'and first in its menus, so it sits at the left of that bar');

const blk = src.slice(k, k + 2600);
ok(/label: 'Ask'/.test(blk), 'labelled so it can be found');
ok(!/items:/.test(blk.slice(0, blk.indexOf('ionfunction'))),
   'a leaf entry with no items, which is what the component turns into a button');
ok(/ionfunction: createIonFunction\(/.test(blk),
   'wired with the lowercase spelling the component reads');
ok(/prompt-text\.js/.test(blk), 'clicking it asks for text');
ok(/startDate/.test(blk) && /endDate/.test(blk),
   'and the box says which dates the timeline covers, so a bare date means something');
ok(/__askTimeline\(/.test(blk), 'what is typed is read as a request');
ok(!/looksLikeASentence/.test(blk),
   'with no test for whether it was a command: the menubar field is already that');
ok(!/interpreter\.executeCommand/.test(blk), 'and it never reaches the command interpreter');

// the failed placements are gone, not left behind
ok(!fs.existsSync('baja/plate/menu/object-prompt.js'), 'the canvas overlay is removed');
const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
ok(!/askButton/.test(nav), 'and the button is off the shell toolbar, where it did not belong');

// the component really does make a button out of a leaf entry
const comp = '/home/claude/baja/src/app/published-lionscript/simple-menu.component.html';
if (fs.existsSync(comp)) {
    const html = fs.readFileSync(comp, 'utf8');
    ok(/\*ngIf="!item\.items \|\| item\.items\.length === 0"/.test(html),
       'the menu component has a leaf branch for an entry with no items');
    ok(/\*ngIf="item\.label" mat-button \(click\)="click\(item\)"/.test(html),
       'and draws a clickable button for one with a label');
    const ts = fs.readFileSync(comp.replace('.html', '.ts'), 'utf8');
    ok(/ionfunction/.test(ts), 'and its click reads the lowercase ionfunction');
} else {
    console.log('  --   the Angular shell is not checked out here; component checks skipped');
}

console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
process.exit(fails ? 1 : 0);

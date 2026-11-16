// A ZOOMED-OUT TABLE CAN BE ZOOMED INTO, AND A MAXIMIZED ONE KEEPS THE CLICKS.
//
//     node tools/test/zoom-and-maximize.js
//
// Far enough out, a table is drawn as a bar with its name on it: nothing can be read, which
// is why it was clicked. Its menu offered Move and Maximize -- one of which moves it and the
// other of which takes over the window -- and no way to simply go and look at it.
//
// The second half is the canvas behind a maximized object. It is still there, at its own
// world coordinates, so a press inside the maximized table was also landing on whatever lay
// under that point: picking it up, selecting it, taking the selection off the thing filling
// the screen.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/plate-track.js', 'utf8');

// ---- the menu a zoomed-out table opens -------------------------------------------------
const k = src.indexOf('__solidOpenMenu(o, x, y) {');
ok(k > 0, 'a table drawn as a bar opens a menu');
const menu = src.slice(k, src.indexOf('__solidDragStart(o, x, y)', k));

const zoom = menu.indexOf("label: 'Zoom in'");
const move = menu.indexOf("label: 'Move'");
const max = menu.indexOf("label: 'Maximize'");
ok(zoom > 0, 'with Zoom in on it');
ok(zoom < move && zoom < max, 'first, before Move and Maximize: it is the commoner thing to want');
ok(/show-new-object\.js/.test(menu),
   'and it uses the same move every operation that makes something uses');
ok(/this\.setSelected\(o\)/.test(menu.slice(zoom, move)), 'selecting it on the way, so the menus act on it');

// ---- the canvas behind a maximized object ----------------------------------------------
ok(/WHILE MAXIMIZED, THE PRESS BELONGS TO THE MAXIMIZED OBJECT AND NOTHING\n\s*\/\/ ELSE/.test(src),
   'a press while maximized belongs to the maximized object');
ok(/if \(this\.__maximized && new_selected !== this\.__maximized\) return;/.test(src),
   'so a press that lands on another object picks nothing up');
ok(/if \(gfs && this\.__maximized\) gfs = null;/.test(src),
   'and a drawing behind the backdrop is not pressed either');

// the guard sits BEFORE anything is selected or deselected, not after
const guard = src.indexOf('if (this.__maximized && new_selected !== this.__maximized) return;');
const deselect = src.indexOf('this.deselectAll()', guard);
const setSel = src.indexOf('this.setSelected(new_selected)', guard);
ok(guard > 0 && deselect > guard && setSel > guard,
   'it stands before the selection is changed, not after it has been');

// what was already guarded stays guarded: these hit tests refuse while maximized
for (const fn of ['__plateBarAt', '__packageAt', '__solidAt', '__solidCornerAt']) {
    const i = src.indexOf('            ' + fn + '(x, y) {');
    const body = src.slice(i, i + 400);
    ok(/this\.__maximized/.test(body), fn + ' still refuses while something is maximized');
}

// and the press on the backdrop still clears the cell selection rather than falling through
ok(/A click on the backdrop, outside the maximized object, clears its/.test(src),
   'a press on the backdrop still clears the maximized object’s cell selection');

console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
process.exit(fails ? 1 : 0);

// THE CELL'S ACTIONS, AS ONE DROP-DOWN INSTEAD OF A ROW OF DISCS.
//
//     node tools/test/cell-menu.js
//
// A selected cell had five unlabelled round buttons to its right, drawn over the next cell.
// There is now one button, and it opens the same five actions as a named menu.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><canvas tabindex="0"></canvas></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };
global.CurrentLayout = { getStashed: () => null };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // ---- both table classes the app loads ---------------------------------------------------
    for (const p of ['baja/plate/plate.js', 'baja/plate/plate-transparent.js']) {
        const src = fs.readFileSync(p, 'utf8');
        const i = src.indexOf('this.cellActions = this.txbuttons;');
        const before = src.slice(src.lastIndexOf('this.txbuttons = [', i), i);
        const after = src.slice(i, i + 700);
        ok(i > 0, p + ' keeps the old buttons as cellActions');
        ok((before.match(/letter: '/g) || []).length === 5 && /removeSelected/.test(before) && /goEditor/.test(before),
           '  all five, with the functions they always called');
        ok(/this\.txbuttons = \[\s*\{\s*name: 'cell menu'/.test(after) && (after.match(/letter: '/g) || []).length === 1,
           '  and draws one button in their place');
        ok(/exec\('baja\/plate\/menu\/cell-menu\.js', pt, this, well, this\.cellActions\)/.test(after), '  which opens the menu');
    }

    // ---- the menu ---------------------------------------------------------------------------
    const ran = [];
    const mk = (letter, name) => ({ name: name || 'x', letter: letter, action: async (well, pt) => { ran.push(letter + ':' + (well && well.id)); } });
    const actions = [mk('→'), mk('↓'), mk('i', 'i'), mk('M', 'options'), mk('X', 'close')];
    const pt = { selected_well: null, said: [], setMessage(m) { this.said.push(m); }, wake() { } };
    const well = { id: 'B6', __screen_x: 300, __screen_y: 200, __screen_width: 120, __screen_height: 30 };

    let m = await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    const box = () => document.getElementById('baja-cell-menu');
    ok(!!box() && box().querySelectorAll('[role="menuitem"]').length === 5, 'five rows, one for each action');
    ok(m.items.join('|') === 'Select this row|Select this column|Script for the selection|More options|Delete',
       'each under a name instead of a glyph: ' + m.items.join(' | '));
    ok(parseInt(box().style.left, 10) === 428 && parseInt(box().style.top, 10) > 200,
       'opened beside the cell: ' + box().style.left + ', ' + box().style.top);
    ok(/#fda29b/.test(box().querySelectorAll('[role="menuitem"]')[4].innerHTML), 'the one that deletes is marked and set apart');

    box().querySelectorAll('[role="menuitem"]')[1].onclick({ stopPropagation() { } });
    await sleep(5);
    ok(ran.join() === '↓:B6' && !box(), 'a pick runs the table’s own function on that cell and closes: ' + ran.join());

    // the two tables' "i" differ, and are named for what each does
    m = await load('baja/plate/menu/cell-menu.js', pt, {}, well, [mk('i', 'I')]);
    ok(m.items[0] === 'Edit as text', 'the main table’s i opens the text window and says so: ' + m.items[0]);
    m.close();

    // closing
    m = await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    await sleep(5);
    document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    ok(!box(), 'a press anywhere else closes it');
    m = await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    ok(!box(), 'so does Escape');
    await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    const again = await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    ok(again === null && !box(), 'and pressing the button again while it is open');

    // keyboard
    ran.length = 0;
    await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    for (const k of ['ArrowDown', 'ArrowDown', 'Enter']) window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k }));
    await sleep(5);
    ok(ran.join() === '↓:B6', 'arrow keys and Enter pick too: ' + ran.join());

    // an action that throws is said, not swallowed
    await load('baja/plate/menu/cell-menu.js', pt, {}, well, [{ letter: 'M', name: 'options', action: async () => { throw new Error('no table'); } }])
        .then((x) => x.pick(0));
    await sleep(5);
    ok(/did not work: no table/.test(pt.said.join(' ')), 'an action that fails says so: ' + pt.said.join(' | '));

    ok((await load('baja/plate/menu/cell-menu.js', pt, {}, well, [])) === null && !box(), 'nothing to offer, nothing drawn');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

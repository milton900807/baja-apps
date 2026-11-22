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

    // ---- the button glows orange ------------------------------------------------------------
    // Painted for real, on a recording context: the halo goes down before the disc, in
    // orange, and only for this button.
    for (const p of ['baja/plate/plate.js', 'baja/plate/plate-transparent.js']) {
        const src = fs.readFileSync(p, 'utf8');
        const a = src.indexOf('_paintTableButton(ctx, button, cx, cy, r, hover, variant) {');
        let depth = 0, b = src.indexOf('{', a);
        for (let k = b; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) { b = k; break; } } }
        const paint = new Function('ctx', 'button', 'cx', 'cy', 'r', 'hover', 'variant', src.slice(src.indexOf('{', a) + 1, b));
        const rec = () => {
            const calls = [];
            const ctx = { calls, measureText: () => ({ width: 5 }) };
            for (const f of ['save', 'restore', 'beginPath', 'fill', 'stroke', 'moveTo', 'lineTo', 'fillText'])
                ctx[f] = (...x) => calls.push({ f, shadow: ctx.shadowColor, blur: ctx.shadowBlur, fill: ctx.fillStyle });
            ctx.arc = (x, y, rad) => calls.push({ f: 'arc', rad, shadow: ctx.shadowColor, blur: ctx.shadowBlur, fill: ctx.fillStyle });
            return ctx;
        };
        let c = rec();
        paint(c, { name: 'cell menu', letter: '\u25BE' }, 100, 100, 10, false, 'cell');
        const arcs = c.calls.filter((x) => x.f === 'arc');
        ok(/255,140,0/.test(arcs[0].shadow) && arcs[0].blur >= 12 && arcs[0].rad > 10 && /255,150,40/.test(arcs[0].fill),
           p + ': the menu button is painted over an orange glow wider than itself');
        ok(arcs.some((x) => x.rad === 10 && !/255,1[45]0/.test(String(x.fill))), '  with the button itself drawn on top, in its own colour');
        c = rec();
        paint(c, { name: 'close', letter: 'X' }, 100, 100, 10, false, 'cell');
        ok(!c.calls.some((x) => /255,140,0/.test(String(x.shadow))), '  and no other button glows');
    }

    // ---- the menu ---------------------------------------------------------------------------
    const ran = [];
    const mk = (letter, name) => ({ name: name || 'x', letter: letter, action: async (well, pt) => { ran.push(letter + ':' + (well && well.id)); } });
    const actions = [mk('→'), mk('↓'), mk('i', 'i'), mk('M', 'options'), mk('X', 'close')];
    const pt = { selected_well: null, said: [], setMessage(m) { this.said.push(m); }, wake() { } };
    const well = { id: 'B6', __screen_x: 300, __screen_y: 200, __screen_width: 120, __screen_height: 30 };

    let m = await load('baja/plate/menu/cell-menu.js', pt, {}, well, actions);
    const box = () => document.getElementById('baja-cell-menu');
    ok(!!box() && box().querySelectorAll('[role="menuitem"]').length === 6, 'six rows: the five actions and Set data type');
    ok(m.items.join('|') === 'Select this row|Select this column|Script for the selection|More options|Set data type|Delete',
       'each under a name instead of a glyph: ' + m.items.join(' | '));
    ok(parseInt(box().style.left, 10) === 428 && parseInt(box().style.top, 10) > 200,
       'opened beside the cell: ' + box().style.left + ', ' + box().style.top);
    ok(/#fda29b/.test(box().querySelectorAll('[role="menuitem"]')[5].innerHTML), 'the one that deletes is marked and set apart, last');
    ok(/for this cell/.test(box().querySelectorAll('[role="menuitem"]')[4].innerHTML), 'Set data type is there for a single cell, and says it is for this cell');

    box().querySelectorAll('[role="menuitem"]')[1].onclick({ stopPropagation() { } });
    await sleep(5);
    ok(ran.join() === '↓:B6' && !box(), 'a pick runs the table’s own function on that cell and closes: ' + ran.join());

    // several cells selected: the two that start from one cell are not offered
    const block = (n) => ({ getSelectedWellsInOrder: () => new Array(n).fill(well) });
    m = await load('baja/plate/menu/cell-menu.js', pt, block(8), well, actions);
    ok(m.items.join('|') === 'Script for the selection|More options|Set data type|Delete',
       'with eight cells selected, "this row" and "this column" are gone: ' + m.items.join(' | '));
    ok(box().querySelectorAll('[role="menuitem"]').length === 4 && /for the 8 selected cells/.test(box().innerHTML),
       'and Set data type says how many cells it is for');
    m.close();
    m = await load('baja/plate/menu/cell-menu.js', pt, block(1), well, actions);
    ok(m.items.length === 6 && m.items[0] === 'Select this row', 'with one cell selected they are back: ' + m.items.length);
    m.close();

    // a whole column selected: its data type can be set from here
    {
        const cell = (h) => (h ? { skin_type: 'ColumnHeader' } : {});
        const colA = [cell(true), cell(), cell(), cell()], colB = [cell(true), cell(), cell(), cell()];
        const tbl = (sel) => ({ wells: [colA, colB], getSelectedWellsInOrder: () => sel });
        const opened = [];
        const prev = global.lion_engine.exec;
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl(colB.slice(1)), colB[1], actions);
        ok(m.items.join('|') === 'Script for the selection|More options|Set data type|Delete' && /for this column/.test(box().innerHTML),
           'every cell of a column under its heading: "Set data type" is for the column: ' + m.items.join(' | '));
        m.close();
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl(colB.slice()), colB[1], actions);
        ok(m.items.indexOf('Set data type') >= 0 && /for this column/.test(box().innerHTML), 'the heading selected along with it is still the column');
        m.close();
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl(colB.slice(1, 3)), colB[1], actions);
        ok(m.items.indexOf('Set data type') >= 0 && /for the 2 selected cells/.test(box().innerHTML), 'part of a column is offered it for those cells, not for the column');
        m.close();
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl(colA.slice(1).concat(colB.slice(1))), colB[1], actions);
        ok(m.items.indexOf('Set data type') >= 0 && /for the 6 selected cells/.test(box().innerHTML), 'and so are two columns');
        m.close();
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl([colB[1]]), colB[1], actions);
        ok(m.items.indexOf('Set data type') === 4 && m.items.length === 6 && /for this cell/.test(box().innerHTML), 'and one cell, which is the total that comes out as a bare number');
        m.close();
        // a cell that is current but not marked selected is selected first, so the library has something to act on
        const lone = { id: 'lone' }; let picked = false; lone.selectIt = () => { picked = true; };
        const prevExec = global.lion_engine.exec;
        m = await load('baja/plate/menu/cell-menu.js', pt, tbl([]), lone, actions);
        const lib = [];
        const realLoad = load;
        try { m.pick(m.items.indexOf('Set data type')); } catch (e) { }
        await sleep(20);
        ok(picked === true, 'a cell the menu was opened on, but that is not marked selected, is selected before the library opens');
        const src = fs.readFileSync('baja/plate/menu/cell-menu.js', 'utf8');
        ok(/exec\('baja\/plate\/views\/well-type-library\.js', pt, table\)/.test(src) && fs.existsSync('baja/plate/views/well-type-library.js'),
           'and it opens the data type library on the selection');
    }

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

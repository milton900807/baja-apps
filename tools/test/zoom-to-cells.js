// ZOOM TO CELLS, NOT TO THE TABLE THEY ARE IN.
//
//     node tools/test/zoom-to-cells.js
//
// "show this cell on the canvas" framed the whole table, and for a reference like
// assumptions[Labor_Wages] it could not even find the row, because it looked for a row
// LABELLED Labor_Wages where the label reads "Labor Wages".
//
// The track's method is lifted out of plate-track.js and run against the real grid class,
// with a stand-in for the drawing: each frame, every cell records where the current view
// puts it, which is exactly what the real draw does.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };
global.requestAnimationFrame = (f) => setTimeout(f, 1);

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const method = (src, head) => {
    const a = src.indexOf(head);
    let depth = 0, b = src.indexOf('{', a + head.length - 1);
    const open = b;
    for (let k = b; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) { b = k; break; } } }
    return src.slice(open + 1, b);
};

(async () => {
    const MGrid = await load('flexigraph/grid.js');
    const track = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
    const zoomToCells = new AF('AnimateGrid', 'plate', 'cells', 'opts = {}', method(track, 'async zoomToCells(plate, cells, opts = {}) {'));

    // A view 1000 x 600 px, a table at world (100..500, 0..800): two columns of unequal
    // width and forty rows of 20 world units.
    const mk = () => {
        const grid = new MGrid(0, 0, 1000, 600);
        grid.setxmin(-5000); grid.setxmax(5000); grid.setymin(-3000); grid.setymax(3000); grid.rescale();
        const plate = { grid: { xi: 100, yi: 0, width: 400, height: 800 }, wells: [[], []] };
        const colX = [100, 400], colW = [300, 100];
        for (let c = 0; c < 2; c++) for (let r = 0; r < 40; r++) plate.wells[c].push({ c, r, wx: colX[c], ww: colW[c], wyTop: 800 - r * 20, wh: 20 });
        const draw = () => {
            for (const col of plate.wells) for (const w of col) {
                if (w.hidden) continue;
                w.__screen_x = grid.X(w.wx); w.__screen_y = grid.Y(w.wyTop);
                w.__screen_width = Math.abs(grid.X(w.wx + w.ww) - grid.X(w.wx));
                w.__screen_height = Math.abs(grid.Y(w.wyTop - w.wh) - grid.Y(w.wyTop));
            }
        };
        const calls = [];
        const me = { grid, calls, fitCalls: 0, journeys: [], released: 0, wake() { draw(); }, pushGrid() { }, clearActionGlyphs() { },
            __navJump(label, hold) { this.journeys.push({ label, hold, span: grid.xmax - grid.xmin }); return { release: () => { this.released++; } }; },
            __maxWorldBounds: (o) => ({ x0: o.grid.xi, x1: o.grid.xi + o.grid.width, yTop: o.grid.yi + o.grid.height, yBot: o.grid.yi }),
            async zoomto(cx, cy, w, h) { calls.push({ cx, cy, w, h }); },
            async zoomToFitTable() { this.fitCalls++; } };
        return { me, plate, grid };
    };
    const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

    // ---- one cell ---------------------------------------------------------------------------
    let x = mk();
    const cell = x.plate.wells[1][25];                 // world x 400..500, y 280..300
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [cell]);
    let z = x.me.calls[0];
    ok(x.me.calls.length === 1 && near(z.cx, 450) && near(z.cy, 290), 'the view goes to the cell itself: centre ' + (z && [Math.round(z.cx), Math.round(z.cy)]));
    ok(near(z.w / 100, 4, 0.05), 'the cell is a quarter of the window wide, with its neighbours around it: view ' + Math.round(z.w) + ' world units for a cell of 100');
    ok(near(z.w / z.h, 1000 / 600, 0.01), 'and the view keeps the window’s shape');
    ok(z.w < 400 * 1.12, 'which is closer than the whole table (' + Math.round(z.w) + ' against ' + Math.round(400 * 1.12 * (1000 / 600) / (1000 / 600)) + ')');

    // a wide cell in the other column: its own width, not an average column's
    x = mk();
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [x.plate.wells[0][3]]);
    z = x.me.calls[0];
    ok(near(z.cx, 250) && near(z.cy, 730), 'a cell in the wide column is found where it is drawn: ' + [Math.round(z.cx), Math.round(z.cy)]);

    // ---- several cells: framed together -----------------------------------------------------
    x = mk();
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [x.plate.wells[0][10], x.plate.wells[1][10]]);
    z = x.me.calls[0];
    ok(near(z.cx, 300) && near(z.cy, 590) && near(z.w, 400 * 1.6, 1), 'a row of cells is framed as a row: ' + JSON.stringify([Math.round(z.cx), Math.round(z.cy), Math.round(z.w)]));

    // ---- the view the cells are measured in is the table's, set before they are read --------
    x = mk();
    const before = x.grid.xmax - x.grid.xmin;
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [x.plate.wells[1][25]]);
    ok(before === 10000 && near(x.grid.xmax - x.grid.xmin, 1000 * Math.max(400 * 1.12 / 1000, 800 * 1.12 / 600), 1),
       'a table that was a speck in the view is brought into it first, so the cell is drawn somewhere real');

    // ---- a cell that is never drawn does not hold the view, and nothing is invented ---------
    x = mk();
    const ghost = x.plate.wells[1][5]; ghost.hidden = true;
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [ghost]);
    ok(x.me.calls.length === 0 && x.me.fitCalls === 0, 'a cell that is not drawn leaves the table in view and zooms to nothing made up');
    x = mk();
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, []);
    ok(x.me.fitCalls === 1, 'and with no cells at all it is the table, as before');

    // ---- the journey is told to the navigation history --------------------------------------
    x = mk();
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [x.plate.wells[1][25]], { label: 'assumptions \u203a Labor_Wages' });
    ok(x.me.journeys.length === 1 && x.me.journeys[0].hold === true && x.me.journeys[0].label === 'assumptions \u203a Labor_Wages',
       'the move is announced once, by name, and held: it has two stages');
    ok(x.me.journeys[0].span === 10000, 'before the view is touched, so the place being left is the real one');
    ok(x.me.released === 1 && x.me.calls.length === 1, 'and released once the last stage has begun: released ' + x.me.released + ', zooms ' + x.me.calls.length);
    x = mk(); x.plate.wells[1][5].hidden = true;
    await zoomToCells.call(x.me, { INTERUPT: false }, x.plate, [x.plate.wells[1][5]]);
    ok(x.me.released === 1, 'a journey that stops at the table is released too, not left open');
    ok(/async zoomto\(cx, cy, width, height\) \{[\s\S]{0,260}this\.__navJump\(''\);/.test(track), 'and every programmed zoom announces itself');

    // ---- the go-to finds the cell by its tags ----------------------------------------------
    const nav = fs.readFileSync('manchester/controls/navigation-panel-plates2.js', 'utf8');
    const g = nav.slice(nav.indexOf('const gotoReference = async'), nav.indexOf('const gotoReference = async') + 9000);
    ok(/const tagged = \(\(\) => \{/.test(g) && g.indexOf('const tagged') < g.indexOf('const unresolved = []'),
       'cells carrying the reference’s tags are looked for before any label is');
    ok(/pt\.zoomToCells\(tb, targets, \{ label:/.test(g) && g.indexOf('pt.zoomToCells(tb, targets') < g.indexOf('pt.zoomToFitTable(tb)'),
       'and the zoom is to those cells, with the table only as the fallback');
    // the matching rule, lifted out and run: Labor_Wages is a tag, "Labor Wages" is a label
    const body = /const tagged = \(\(\) => \{([\s\S]*?)\n                \}\)\(\);/.exec(g)[1];
    const find = (tb, want) => new Function('tb', 'want', 'iterish', 'idxOf', body)(tb, want,
        (t) => /^(?:row|col)\s*\$?\{/i.test(t), (t, word) => { const m = new RegExp('^' + word + '(\\d+)$', 'i').exec(t); return m ? parseInt(m[1], 10) : -1; });
    const tb = { wells: [
        [{ value: 'title', skin_type: 'ColumnHeader', group: { ColumnHeader: 1 } }, { value: 'Labor Wages', group: { Labor_Wages: 1, title: 1 } }, { value: 'Rent', group: { Rent: 1, title: 1 } }],
        [{ value: 'value', skin_type: 'ColumnHeader', group: { ColumnHeader: 1 } }, { value: '65000', group: { Labor_Wages: 1, value: 1 } }, { value: '8000', group: { Rent: 1, value: 1 } }]] };
    let hit = find(tb, ['Labor_Wages']);
    ok(hit.length === 2 && hit.every((h) => h.r === 1), 'assumptions[Labor_Wages] is the row tagged Labor_Wages, though it is labelled "Labor Wages"');
    hit = find(tb, ['Labor_Wages', 'value']);
    ok(hit.length === 1 && hit[0].c === 1 && hit[0].r === 1, 'and assumptions[Labor_Wages,value] is the one cell');
    ok(find(tb, ['labor_wages', 'Value']).length === 1, 'whatever the capitals');
    ok(find(tb, ['Nothing']).length === 0 && find(tb, ['row5', 'value']).length === 0, 'a tag no cell carries, or a position, is left to the older search');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

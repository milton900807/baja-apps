// A JUMP IS A PLACE LEFT AND A PLACE REACHED, STRAIGHT AWAY.
//
//     node tools/test/nav-jump-history.js
//
// Back and Forward only knew places the camera had stayed at for twenty seconds. Going to a
// table from the list, or to a cell from a formula, left nothing to come back to.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document; window.env = { apiUrl: '' };
global.location = dom.window.location; global.navigator = dom.window.navigator;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    if (p === 'flexigraph/animate-it.js') {
        // The camera, moved in a few steps over ~120ms, as the real animation does.
        return class { constructor(g) { this.g = g; } static INTERUPT = false;
            async animateTo(xmin, xmax, ymin, ymax) {
                const g = this.g, a = { xmin: g.xmin, xmax: g.xmax, ymin: g.ymin, ymax: g.ymax };
                for (let i = 1; i <= 4; i++) {
                    await new Promise((r) => setTimeout(r, 30));
                    const t = i / 4;
                    g.xmin = a.xmin + (xmin - a.xmin) * t; g.xmax = a.xmax + (xmax - a.xmax) * t;
                    g.ymin = a.ymin + (ymin - a.ymin) * t; g.ymax = a.ymax + (ymax - a.ymax) * t;
                }
            } };
    }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => null, createIonFunction: (f) => f };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const Anim = await load('flexigraph/animate-it.js');
    const table = (name, x) => ({ name, uid: name, wells: [[{}]], grid: { xi: x, yi: 0, width: 100, height: 100 } });
    const pt = { grid: { xmin: 0, xmax: 1000, ymin: 0, ymax: 600, rescale() { } }, root: [table('assumptions', 100), table('pnl', 700)], m_plots: [], glyphs: [],
        __maxWorldBounds: (o) => ({ x0: o.grid.xi, x1: o.grid.xi + o.grid.width, yTop: 100, yBot: 0 }),
        setSelected() { }, setMessage() { },
        async zoomToFitTable(o) { nav.jump(''); new Anim(pt.grid).animateTo(o.grid.xi - 20, o.grid.xi + 120, -10, 110); } };
    let nav = await load('baja/plate/views/navigation-history.js', pt, {});
    const at = () => nav.history.map((h) => Math.round(h.view.xmin) + '..' + Math.round(h.view.xmax));
    const here = () => Math.round(pt.grid.xmin) + '..' + Math.round(pt.grid.xmax);

    ok(nav.history.length === 1 && typeof nav.jump === 'function', 'the bar starts with where the camera is, and has jump()');

    // ---- the camera is somewhere it never stayed, and then goes to a table ------------------
    pt.grid.xmin = 300; pt.grid.xmax = 900;                       // panned by hand, a moment ago
    nav.jump('assumptions');
    await new Anim(pt.grid).animateTo(80, 220, -10, 110);
    ok(at().join(' | ') === '0..1000 | 300..900', 'the place being left is recorded at once, though it was never stayed in: ' + at().join(' | '));
    await sleep(700);
    ok(at().join(' | ') === '0..1000 | 300..900 | 80..220' && nav.index === 2, 'and the place reached, once the camera has stopped: ' + at().join(' | '));
    ok(nav.history[2].label === 'assumptions', 'under the name of what was gone to: ' + nav.history[2].label);

    await nav.back();
    ok(here() === '300..900' && nav.index === 1, 'Back returns to where the jump was made from: ' + here());
    await nav.forward();
    ok(here() === '80..220' && nav.index === 2, 'and Forward goes to the table again: ' + here());
    await sleep(500);
    ok(nav.history.length === 3, 'walking the history adds nothing to it');

    // ---- a journey in stages is one journey --------------------------------------------------
    const j = nav.jump('pnl \u203a Net_Income', true);
    pt.grid.xmin = 680; pt.grid.xmax = 820;                       // the table, brought into view at once
    await sleep(600);                                              // waiting for the cells to be drawn
    ok(nav.history.length === 3, 'the pause between its stages is not taken for arriving: ' + at().join(' | '));
    nav.jump('');                                                  // the second stage announces itself, as zoomto does
    new Anim(pt.grid).animateTo(740, 780, 20, 44);
    j.release();
    await sleep(800);
    ok(at().join(' | ') === '0..1000 | 300..900 | 80..220 | 740..780' && nav.history[3].label === 'pnl \u203a Net_Income',
       'one place for the whole journey, where it ended, named for the cell: ' + at().join(' | '));
    await nav.back();
    ok(here() === '80..220', 'and Back from the cell is the table it was reached from');

    // ---- going somewhere from the middle of the history drops what was ahead ----------------
    nav.jump('assumptions again');
    await new Anim(pt.grid).animateTo(0, 500, 0, 300);
    await sleep(700);
    ok(at().join(' | ') === '0..1000 | 300..900 | 80..220 | 0..500', 'as a browser does: ' + at().join(' | '));

    // ---- the list's own Go to, and a jump to where the camera already is ---------------------
    const before = nav.history.length;
    nav.jump('nowhere');
    await sleep(700);
    ok(nav.history.length === before, 'a jump that goes nowhere adds no place');

    const src = fs.readFileSync('baja/plate/views/navigation-history.js', 'utf8');
    ok(/jump\(nameOf\(o\)\);/.test(src) && /jump\('Everything'\);/.test(src), 'Go to and Show all in the list both count as jumps');

    nav.destroy();
    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

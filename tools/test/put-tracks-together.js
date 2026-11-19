// PUT THESE TRACKS TOGETHER: ADJACENT IN Y, LINED UP IN X.
//
//     node tools/test/put-tracks-together.js
//
// "put spag9_mRNA and MAPK8IP3_mRNA together" was answered with the across-tracks library
// and a note that combining tracks into one is not something the editor does. Nobody asked
// to combine them: they are to be MOVED next to each other and lined up so the eye can run
// down one column.
//
// WORLD Y RUNS THE OPPOSITE WAY TO SCREEN Y. The canvas maps it with
// Y(v) = yi + height - (v - ymin) * yscale, so a larger yi is HIGHER on screen and putting
// one track under another means SUBTRACTING. Getting that backwards throws nothing and
// looks like working code; it lays the board out upside down.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The real mapping, from flexigraph's MGrid: this is what makes a larger yi higher.
const screenY = (yi) => 800 + 600 - ((yi - 0) * 40);
const mkGrid = (yi, xi, width) => ({
    yi: yi, xi: xi, width: width, height: -1, xmin: 0, xmax: width,
    setxmin(v) { this.xmin = v; }, setxmax(v) { this.xmax = v; }, rescale() { this.rescaled = true; }
});
const mkTrack = (name, yi, xi, width, span) => ({
    name: name, xi: 0, xf: span, grid: mkGrid(yi, xi, width)
});
const mkGraph = (ts) => ({
    track: ts, said: [], animated: null,
    animateTo(x0, x1, y0, y1) { this.animated = { x0, x1, y0, y1 }; return Promise.resolve(); },
    wake() { }, setMessage(m) { this.said.push('' + m); }
});
const run = (g, ts) => load('baja/bio/put-tracks-together.js', g, ts, {});
const byScreen = (ts) => ts.slice().sort((a, b) => screenY(a.grid.yi) - screenY(b.grid.yi))
    .map((t) => t.name).join(' > ');

(async () => {
    // Five tracks stacked 1.6 apart. Larger yi is higher, so A is at the top.
    const mk5 = () => {
        const A = mkTrack('A', 8.0, 0, 100, 1000);
        const B = mkTrack('spag9_mRNA', 6.4, 40, 60, 4000);
        const C = mkTrack('C', 4.8, 0, 100, 1000);
        const D = mkTrack('MAPK8IP3_mRNA', 3.2, 10, 250, 5685);
        const E = mkTrack('E', 1.6, 0, 100, 1000);
        return { A, B, C, D, E, all: [A, B, C, D, E] };
    };

    // ---- y: next to each other, and the right way up -------------------------------------
    let { A, B, C, D, E, all } = mk5();
    let g = mkGraph(all);
    let r = await run(g, [B, D]);
    ok(!r.error, 'it runs: ' + JSON.stringify(r.error || r.together));
    ok(screenY(B.grid.yi) < screenY(D.grid.yi),
       'spag9 ends up ABOVE MAPK8IP3 on screen, the order they were in: '
       + 'spag9 at ' + screenY(B.grid.yi) + 'px, MAPK8IP3 at ' + screenY(D.grid.yi) + 'px');
    // Compared with a tolerance: the step is the median of differences between floats, so
    // it comes back as 1.5999999999999996 and an exact test would fail on arithmetic rather
    // than on layout.
    ok(Math.abs(Math.abs(B.grid.yi - D.grid.yi) - 1.6) < 1e-9,
       'exactly one track step apart: ' + Math.abs(B.grid.yi - D.grid.yi).toFixed(4));
    ok(byScreen(all) === 'A > spag9_mRNA > MAPK8IP3_mRNA > C > E',
       'with nothing left between them, and everything else in the order it was in: '
       + byScreen(all));

    // The anchor keeps its place: the group forms where the user is already looking.
    ok(B.grid.yi === 6.4, 'the higher of the two does not move: ' + B.grid.yi);
    ok(A.grid.yi === 8.0, 'and the track above the group is not touched at all');

    // Named in the other order, the result is the same, because screen order decides.
    ({ A, B, C, D, E, all } = mk5());
    g = mkGraph(all);
    await run(g, [D, B]);
    ok(byScreen(all) === 'A > spag9_mRNA > MAPK8IP3_mRNA > C > E',
       'naming them bottom-first changes nothing: ' + byScreen(all));

    // Nothing is left sitting on top of anything else.
    const ys = all.map((t) => t.grid.yi).sort((a, b) => a - b);
    ok(new Set(ys).size === ys.length, 'no two tracks share a y: ' + ys.join(', '));

    // ---- x: one origin and ONE SCALE -------------------------------------------------------
    ({ A, B, C, D, E, all } = mk5());
    g = mkGraph(all);
    await run(g, [B, D]);
    ok(D.grid.xi === B.grid.xi,
       'the moved track takes the anchor\'s left edge: ' + D.grid.xi + ' vs ' + B.grid.xi);
    const scaleB = B.grid.width / Math.abs(B.xf - B.xi);
    const scaleD = D.grid.width / Math.abs(D.xf - D.xi);
    ok(Math.abs(scaleB - scaleD) < 1e-9,
       'and the same bases-per-unit, so base 2000 of one is above base 2000 of the other: '
       + scaleB.toFixed(4) + ' vs ' + scaleD.toFixed(4));
    ok(D.grid.width > B.grid.width,
       'the longer transcript reaches further right rather than being squeezed to the same '
       + 'width, which would make two different lengths look identical: '
       + D.grid.width.toFixed(1) + ' vs ' + B.grid.width.toFixed(1));

    // Same origin alone is not enough: this is the check that would pass for the wrong fix.
    const atBase = (t, b) => t.grid.xi + b * (t.grid.width / Math.abs(t.xf - t.xi));
    ok(Math.abs(atBase(B, 3000) - atBase(D, 3000)) < 1e-9,
       'base 3000 lands at the same place across in both: '
       + atBase(B, 3000).toFixed(2) + ' and ' + atBase(D, 3000).toFixed(2));

    // ---- what it shows afterwards -------------------------------------------------------------
    ok(g.animated && g.animated.y0 < g.animated.y1,
       'the view is given ymin then ymax, not top then bottom: ' + JSON.stringify(g.animated));
    ok(g.animated.y0 <= Math.min(B.grid.yi, D.grid.yi) && g.animated.y1 >= Math.max(B.grid.yi, D.grid.yi),
       'and frames both of them');
    ok(/now together/.test(g.said.join(' ')), 'and it says what it did: ' + g.said.join(' '));

    // ---- three at once ---------------------------------------------------------------------------
    ({ A, B, C, D, E, all } = mk5());
    g = mkGraph(all);
    await run(g, [B, D, E]);
    ok(byScreen(all) === 'A > spag9_mRNA > MAPK8IP3_mRNA > E > C',
       'three tracks gather in screen order, and the rest follow: ' + byScreen(all));

    // ---- refusals -------------------------------------------------------------------------------
    ({ A, B, all } = mk5());
    r = await run(mkGraph(all), [B]);
    ok(!!r.error && /two or more/.test(r.error), 'one track is not an arrangement: ' + r.error);

    // ---- the direction is written once ------------------------------------------------------------
    const src = fs.readFileSync('baja/bio/put-tracks-together.js', 'utf8');
    ok(/WHICH WAY IS DOWN/.test(src) && /const DOWN = -1;/.test(src),
       'the inverted axis is named and handled in one place');
    ok((src.match(/y \+= DOWN \* step/g) || []).length === 1,
       'and every placement goes through it, so there is one line to be wrong');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

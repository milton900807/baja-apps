// ARROWS THAT LINK A BLOCK TO ITS MATCH ON THE OTHER TRACK.
//
//     node tools/test/match-arrows.js
//
// Matching colours and matching numbers say "these two correspond", and the reader still
// has to hold a number in their head and go looking for its partner. An arrow says it
// without being read.
//
// THE FAR END IS KEPT IN THE OTHER TRACK'S COORDINATES and resolved against that track's
// own grid when it is drawn. Converting it on the way in, into the coordinates of the track
// the arrow starts from, is the version that looks like working code: the two tracks have
// different grids, and the arrow lands where neither block is. The motif hit test made
// exactly that mistake and nothing about it looked wrong.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Two tracks whose grids differ, which is the point: A maps x one way and B another.
const mkTrack = (name, xi, len, gridXi, gridW) => ({
    name: name, xi: xi, xf: xi + len, sequence: 'A'.repeat(len), track_layers: [],
    addLayer(l) { this.track_layers.push(l); },
    grid: {
        xi: gridXi, yi: 5, width: gridW, height: -1, xmin: xi, xmax: xi + len,
        X(v) { return gridXi + ((v - xi) / len) * gridW; },
        Y(v) { return 5 - v; },
        setxmin() { }, setxmax() { }, rescale() { }
    }
});

(async () => {
    const ML = await load('baja/bio/match-layer.js');
    ok(typeof ML.link === 'function', 'match-layer can link two drawn sets');

    const A = mkTrack('MAPK8IP3_mRNA', 1000, 2000, 0, 400);
    const B = mkTrack('SPAG9_mRNA', 50000, 5000, 0, 400);

    const aB = [{ n: 1, x1: 1100, x2: 1300, inverted: false, identity: 0.96 },
                { n: 2, x1: 1600, x2: 1750, inverted: true, identity: 0.8 }];
    const bB = [{ n: 1, x1: 51000, x2: 51200, inverted: false, identity: 0.96 },
                { n: 2, x1: 53000, x2: 53150, inverted: true, identity: 0.8 }];
    const la = ML.draw(A, aB, { suffix: '_similarity', dataType: 'SEQSIM' });
    const lb = ML.draw(B, bB, { suffix: '_similarity', dataType: 'SEQSIM' });

    const n = ML.link(la, A, B, aB.map((b, i) => ({
        n: b.n, x1: b.x1, x2: b.x2, inverted: b.inverted, ox1: bB[i].x1, ox2: bB[i].x2
    })), {});
    ok(n === 2, 'one link per pair: ' + n);

    // ---- one side only --------------------------------------------------------------------
    ok((la.links || []).length === 2 && (lb.links || []).length === 0,
       'the links hang on ONE of the two layers, or every arrow is drawn twice, the second '
       + 'exactly over the first');

    // ---- the far end stays in the far track's coordinates ----------------------------------
    const l0 = la.links[0];
    ok(l0.ox1 === 51000 && l0.ox2 === 51200,
       'the far end is kept as SPAG9 coordinates: ' + l0.ox1 + '-' + l0.ox2);
    ok(l0.track === B, 'with the track it belongs to, so it can be resolved against that '
       + 'track\'s own grid rather than this one\'s');
    // The two grids genuinely disagree, so this is not a distinction without a difference.
    ok(Math.abs(A.grid.X(51000) - B.grid.X(51000)) > 100,
       'and the grids really do disagree: the same number is ' + A.grid.X(51000).toFixed(0)
       + ' on one and ' + B.grid.X(51000).toFixed(0) + ' on the other');

    // ---- the pairing is kept ----------------------------------------------------------------
    ok(l0.color === la.intervals[0].color && l0.color === lb.intervals[0].color,
       'an arrow is the colour of the pair it joins, on both tracks');
    ok(la.links[1].color === la.intervals[1].color, 'and so is the second');
    ok(la.links[0].dashed === false && la.links[1].dashed === true,
       'an inverted pair is dashed as well as marked on its bars: the arrow is what a glance '
       + 'takes in, and a glance does not read a symbol on a label');

    // ---- what draws it -----------------------------------------------------------------------
    const tl = fs.readFileSync('baja/bio/track-layer.js', 'utf8');
    ok(/THIRD PASS: ARROWS TO THE MATCHING BLOCK ON ANOTHER TRACK/.test(tl),
       'the layer draws them after its bars and labels');
    ok(/const og = lk\.track\.grid \|\| lk\.track\.tgraph;/.test(tl),
       'through the PARTNER\'s grid');
    ok(/graph\.X\(og\.X\(\(lk\.ox1 \+ lk\.ox2\) \/ 2\)\)/.test(tl),
       'and not through its own, which is the mistake that puts the arrow where neither '
       + 'block is');
    ok((tl.match(/THIRD PASS: ARROWS/g) || []).length === 1,
       'in draw() only, not in drawPlot() as well: the interval loop exists twice in that '
       + 'file and a second copy would draw every arrow again');
    ok(/links = \[\]/.test(tl), 'and every other layer has none, which costs them nothing');

    // ---- both drawings use it ------------------------------------------------------------------
    ok(/ML\.link\(layerA, a, b,/.test(fs.readFileSync('baja/bio/similarity-map.js', 'utf8')),
       'the map between two tracks links its pairs');
    ok(/ML\.link\(qLayer, qt, target,/.test(fs.readFileSync('baja/bio/search-region.js', 'utf8')),
       'and the search links the region it searched with to each place it found');

    // ---- a head at BOTH ends ----------------------------------------------------------
    // A single head reads as "this came from here and went there", which is a claim about
    // direction that a sequence match does not make: the two blocks correspond, and neither
    // is the source of the other.
    const src = fs.readFileSync('baja/bio/track-layer.js', 'utf8');
    ok(/A HEAD AT BOTH ENDS/.test(src), 'the renderer says why both ends carry one');
    ok(/headAt\(lx1, ly1, ldir\);/.test(src) && /headAt\(lx0, ly0, -ldir\);/.test(src),
       'and draws one at each end, each pointing the way the curve runs there');

    // Not asserted by running draw(): the layer's draw needs a live canvas and a graph,
    // and a stub that silently draws nothing would pass this whichever way the code went.
    // The two source assertions above are what pin it.
    ok(!/if \(!lk\.oneWay\) headAt\(lx1/.test(src),
       'and the far head is unconditional: it is the NEAR one an explicit one-way arrow drops');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

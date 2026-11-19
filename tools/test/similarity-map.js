// A MAP OF WHERE TWO TRACKS ARE THE SAME, DRAWN ON BOTH OF THEM.
//
//     node tools/test/similarity-map.js
//
// "draw a map that compares the regions of high sequence similarity between spag9_mrna and
// mapk8ip3_mrna" asks for something on the canvas, not a panel of coordinates: a layer on
// each track, one bar per block, the same colour and number on both, so that with the tracks
// laid one above the other the pairs read off by eye.
//
// ORIENTATION IS THE PART THAT GOES WRONG QUIETLY. A block inverted between two transcripts
// is found by aligning the reverse complement, so its position in the query comes back as an
// offset into the REVERSED string. Reported as it stands it names the mirror-image position,
// which is a perfectly plausible-looking coordinate inside the right track.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let pyCalls = [], pyReply = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('search-region-in-track.py') >= 0) { pyCalls.push(a); return pyReply; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    // Most modules are an expression -- an anonymous function body -- but a few (track-layer
    // among them) are STATEMENT bodies that return their own value. CLAUDE.md says so; the
    // engine handles both, so a harness that only knows the first cannot load the real
    // TrackLayer and would have to test against a stub of it instead.
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mkTrack = (name, seq, xi) => ({
    name: name, xi: xi, xf: xi + seq.length, sequence: seq, track_layers: [],
    grid: { yi: 1, xi: 0, width: 10, height: -1 }, getSelectedRanges: () => [],
    addLayer(l) { this.track_layers.push(l); },
    getSequenceRange(s, e) { return this.sequence.slice(Math.floor(s) - this.xi, Math.floor(e) - this.xi); }
});

(async () => {
    // ---- orientation, against the real backend ------------------------------------------
    let haveBio = true;
    try { execFileSync('python3', ['-c', 'import Bio'], { stdio: 'ignore' }); } catch (e) { haveBio = false; }
    if (!haveBio) {
        console.log('  --   Biopython is not installed here, so the block-finding half is not run.');
    } else {
        const probe = `
import sys, json, random
sys.path.insert(0, "tools/test/lib")
from bajapyrun import run
random.seed(5)
rnd = lambda n: "".join(random.choice("ACGT") for _ in range(n))
rc = lambda s: "".join({"A":"T","C":"G","G":"C","T":"A"}[c] for c in reversed(s))
blk = rnd(250)
A = rnd(100) + blk + rnd(400)          # the block sits at 100-350 of A
B = rnd(700) + rc(blk) + rnd(300)      # and appears REVERSED at 700-950 of B
r = run("py/bio/search-region-in-track.py",
        [{"name": "A", "seq": A, "offset": 0}, {"name": "B", "seq": B, "offset": 0},
         {"max_hits": 3, "mask_query": True}])
print(json.dumps(r))
`;
        const res = JSON.parse(execFileSync('python3', ['-c', probe], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 24 }));
        const h = (res.hits || [])[0];
        ok(!!h && h.strand === '-', 'an inverted block is found and called inverted');
        ok(h && h.query_start === 100 && h.query_end === 350,
           'and reported where it really is in the query, 100-350, not at the mirror position '
           + '400-650 that the reversed string would give: '
           + (h ? h.query_start + '-' + h.query_end : 'missing'));
        ok(h && h.start === 700 && h.end === 950,
           'with the target side where it was planted: ' + (h ? h.start + '-' + h.end : 'missing'));

        // Blocks must come back separate rather than chained through the junk between them.
        const probe2 = `
import sys, json, random
sys.path.insert(0, "tools/test/lib")
from bajapyrun import run
random.seed(11)
rnd = lambda n: "".join(random.choice("ACGT") for _ in range(n))
def mut(s, k):
    s = list(s)
    for i in random.sample(range(len(s)), k): s[i] = random.choice("ACGT")
    return "".join(s)
b1, b2, b3 = rnd(200), rnd(150), rnd(300)
A = rnd(300) + b1 + rnd(400) + b2 + rnd(250) + b3 + rnd(200)
B = rnd(500) + mut(b1, 14) + rnd(300) + mut(b2, 10) + rnd(600) + mut(b3, 25) + rnd(150)
r = run("py/bio/search-region-in-track.py",
        [{"name": "A", "seq": A, "offset": 0}, {"name": "B", "seq": B, "offset": 0},
         {"max_hits": 6, "mask_query": True}])
print(json.dumps(r))
`;
        const res2 = JSON.parse(execFileSync('python3', ['-c', probe2], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 24 }));
        const hits = res2.hits || [];
        ok(hits.length === 3,
           'three planted blocks come back as three blocks, not one long gappy alignment '
           + 'chaining through the junk between them: ' + hits.length);
        const near = (v, w) => Math.abs(v - w) <= 3;
        ok(hits.some((x) => near(x.query_start, 300) && near(x.start, 500)),
           'block 1 at its planted coordinates on both sides');
        ok(hits.some((x) => near(x.query_start, 900) && near(x.start, 1000)), 'block 2');
        ok(hits.some((x) => near(x.query_start, 1300) && near(x.start, 1750)), 'block 3');
        ok(hits.every((x) => x.identity > 0.85 && x.identity < 1),
           'and each identity is the real one, not 100% from masked regions matching each '
           + 'other: ' + hits.map((x) => (x.identity * 100).toFixed(0) + '%').join(', '));

        // Each side is masked, so no stretch of either track appears in two blocks.
        const overlap = (p, q) => p.start < q.end && q.start < p.end;
        let clash = 0;
        for (let i = 0; i < hits.length; i++) {
            for (let j = i + 1; j < hits.length; j++) {
                if (overlap(hits[i], hits[j])) clash++;
                if (overlap({ start: hits[i].query_start, end: hits[i].query_end },
                            { start: hits[j].query_start, end: hits[j].query_end })) clash++;
            }
        }
        ok(clash === 0, 'and no two blocks overlap on either track: ' + clash + ' clash(es)');
    }

    // ---- what gets drawn --------------------------------------------------------------------
    const A = mkTrack('MAPK8IP3_mRNA', 'ACGT'.repeat(400), 1000);
    const B = mkTrack('SPAG9_mRNA', 'TTAC'.repeat(500), 5000);
    const graph = { track: [A, B], said: [], wake() { },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };

    pyReply = {
        status: 'OK', floor: 54, engine: 'test',
        query: { name: 'MAPK8IP3_mRNA', length: 1600, offset: 1000 },
        target: { name: 'SPAG9_mRNA', length: 2000, offset: 5000 },
        hits: [
            { rank: 1, score: 400, start: 5500, end: 5700, strand: '+', identity: 0.96,
              length: 200, gaps: 0, query_start: 1300, query_end: 1500, query_coverage: 0.12 },
            { rank: 2, score: 300, start: 6200, end: 6350, strand: '-', identity: 0.9,
              length: 150, gaps: 0, query_start: 1900, query_end: 2050, query_coverage: 0.09 }
        ]
    };
    pyCalls = [];
    let r = await load('baja/bio/similarity-map.js', graph, A, B, {});
    ok(!r.error, 'the map runs: ' + (r.error || 'ok'));
    ok(pyCalls.length === 1 && pyCalls[0][2].mask_query === true,
       'both sides are masked, so the blocks are distinct regions rather than one found over '
       + 'and over');
    ok(pyCalls[0][0].offset === 1000 && pyCalls[0][1].offset === 5000,
       'each track\'s own left edge goes with its sequence: ' + pyCalls[0][0].offset
       + ' and ' + pyCalls[0][1].offset);

    // A LAYER ON EACH TRACK, which is the thing that was asked for.
    const la = A.track_layers.filter((l) => l.data_type === 'SEQSIM')[0];
    const lb = B.track_layers.filter((l) => l.data_type === 'SEQSIM')[0];
    ok(!!la && !!lb, 'a comparison layer is added to each track');
    ok(la.drawStyle === 'interval' && lb.drawStyle === 'interval', 'drawn as intervals');
    ok(la.intervals.length === 2 && lb.intervals.length === 2, 'one bar per block on each');

    // The bars are where the blocks are, in each track's own coordinates.
    ok(la.intervals[0].x1 === 1300 && la.intervals[0].x2 === 1500,
       'the query side is placed on the query track: ' + la.intervals[0].x1);
    ok(lb.intervals[0].x1 === 5500 && lb.intervals[0].x2 === 5700,
       'and the target side on the target track: ' + lb.intervals[0].x1);

    // THE PAIRING IS THE COLOUR AND THE NUMBER. Without both the same on both tracks there
    // is no way to tell which bar answers to which.
    ok(la.intervals[0].color === lb.intervals[0].color,
       'the same block is the same colour on both tracks');
    ok(la.intervals[0].color !== la.intervals[1].color,
       'and different blocks are different colours');
    ok(/^1 /.test(la.intervals[0].t) && /^1 /.test(lb.intervals[0].t),
       'numbered to match: ' + la.intervals[0].t + ' / ' + lb.intervals[0].t);
    ok(/⇄/.test(la.intervals[1].t),
       'an inverted block is marked on its face, not left to a panel: ' + la.intervals[1].t);
    ok(/96\.0%/.test(la.intervals[0].t), 'with its identity on it: ' + la.intervals[0].t);

    // ---- run twice ----------------------------------------------------------------------------
    await load('baja/bio/similarity-map.js', graph, A, B, {});
    ok(A.track_layers.filter((l) => l.data_type === 'SEQSIM').length === 1,
       'running it again replaces the map rather than drawing a second one over it, which '
       + 'would make the colours meaningless');

    // ---- nothing found is said, not drawn ------------------------------------------------------
    pyReply = Object.assign({}, pyReply, { hits: [] });
    graph.said.length = 0;
    r = await load('baja/bio/similarity-map.js', graph, A, B, {});
    ok(r.blocks.length === 0 && /no blocks of similarity/.test(graph.said.join(' ')),
       'no blocks says so: an empty map and a map of nothing look the same on a canvas: '
       + graph.said.join(' ').slice(0, 70));

    r = await load('baja/bio/similarity-map.js', graph, A, A, {});
    ok(!!r.error && /same track/.test(r.error), 'a track against itself: ' + r.error);

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

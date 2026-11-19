// ONE REGION, SEARCHED AGAINST A WHOLE TRACK, HITS RANKED.
//
//     node tools/test/search-region-in-track.js
//
// "compare exon 16 of mapk8ip3_mrna with any other part of spag9_mrna and rank the results"
// was refused, and the refusal was right about why: compare_sequences aligns two things and
// says how similar they are. This asks where in one track a region turns up and how good
// each place is. Different question, so a different operation rather than a looser version
// of that one.
//
// The search itself is run here against the real backend when Biopython is installed, with
// hits planted at known coordinates: an exact copy, a mutated copy, and a reverse-complement
// copy. Coordinates and strand are the two things that are easy to get subtly wrong and
// impossible to notice afterwards, because a hit at the wrong place still looks like a hit.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let pyCalls = [], pyReply = null, helpShown = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('search-region-in-track.py') >= 0) { pyCalls.push(a); return pyReply; }
    if (('' + p).indexOf('decor-help') >= 0) { helpShown = a[0] && a[0].decor && a[0].decor.help; return true; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const mkTrack = (name, seq) => ({
    name: name, xi: 1000, xf: 1000 + seq.length, __seq: seq,
    grid: { yi: 1, xi: 0, width: 10, height: -1 }, getSelectedRanges: () => [],
    getSequenceRange(a, b) { return this.__seq.slice(Math.max(0, a - this.xi), Math.max(0, b - this.xi)); }
});

(async () => {
    // ---- the real backend, with hits planted where we can check them --------------------
    let haveBio = true;
    try { execFileSync('python3', ['-c', 'import Bio'], { stdio: 'ignore' }); } catch (e) { haveBio = false; }
    if (!haveBio) {
        console.log('  --   Biopython is not installed here, so the backend half is not exercised.');
        console.log('       The alignment, the masking loop and the coordinates are what that half');
        console.log('       covers; install biopython to run it.');
    } else {
        const probe = `
import sys, json, random
sys.path.insert(0, "tools/test/lib")
from bajapyrun import run
random.seed(7)
rnd = lambda n: "".join(random.choice("ACGT") for _ in range(n))
def mut(s, k):
    s = list(s)
    for i in random.sample(range(len(s)), k): s[i] = random.choice("ACGT")
    return "".join(s)
rc = lambda s: "".join({"A":"T","C":"G","G":"C","T":"A"}[c] for c in reversed(s))
q = rnd(170)
target = rnd(600) + q + rnd(500) + mut(q, 20) + rnd(400) + rc(q) + rnd(300)
r = run("py/bio/search-region-in-track.py",
        [{"name": "exon 16", "seq": q}, {"name": "SPAG9_mRNA", "seq": target, "offset": 1000}, {"max_hits": 5}])
print(json.dumps(r))
`;
        const res = JSON.parse(execFileSync('python3', ['-c', probe], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 24 }));
        ok(res.status === 'OK', 'the search runs: ' + (res.error || 'OK'));
        const hits = res.hits || [];
        ok(hits.length === 3, 'it finds all three planted copies and no more: ' + hits.length);

        // The three were planted at 1600, 2270 and 2840 in the track's own coordinates.
        const at = (s) => hits.filter((h) => Math.abs(h.start - s) <= 2)[0];
        ok(!!at(1600) && at(1600).identity === 1,
           'the exact copy is found where it was put, and is perfect: '
           + (at(1600) ? at(1600).start + ' ' + (at(1600).identity * 100).toFixed(0) + '%' : 'missing'));
        ok(!!at(2270) && at(2270).identity < 1 && at(2270).identity > 0.8,
           'the copy with twenty substitutions is found and is not called perfect: '
           + (at(2270) ? (at(2270).identity * 100).toFixed(1) + '%' : 'missing'));
        ok(!!at(2840) && at(2840).strand === '-',
           'the reverse-complement copy is found AND reported as the minus strand, rather '
           + 'than being missed or silently called a plus-strand hit');

        // RANKED, and ranked by what it says it ranks by.
        ok(hits[0].rank === 1 && hits[0].score >= hits[1].score && hits[1].score >= hits[2].score,
           'ranked best first: ' + hits.map((h) => Math.round(h.score)).join(' > '));
        ok(at(2270).rank === 3, 'and the imperfect copy ranks below both perfect ones');

        // Each hit is a different place: the masking is what makes that true.
        const spans = hits.map((h) => h.start + '-' + h.end);
        ok(new Set(spans).size === 3, 'three different places, not one found three times: ' + spans.join(', '));

        // The coordinates are the TRACK's, not offsets into a string handed to the server.
        ok(hits.every((h) => h.start >= 1000), 'reported in the track\'s own coordinates: '
           + hits.map((h) => h.start).join(', '));
        ok(hits.every((h) => Math.abs((h.end - h.start) - 170) <= 6),
           'and each hit is about the length of the region searched with');

        // Nothing is reported from a sequence that has nothing in it.
        const probe2 = probe.replace('target = rnd(600) + q + rnd(500) + mut(q, 20) + rnd(400) + rc(q) + rnd(300)',
                                     'target = rnd(3000)');
        const res2 = JSON.parse(execFileSync('python3', ['-c', probe2], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 24 }));
        ok((res2.hits || []).length === 0,
           'random sequence yields nothing: whatever two unrelated sequences reach by chance '
           + 'is below the floor, or every search would report findings: '
           + (res2.hits || []).length + ' hit(s)');
    }

    // ---- the client half -------------------------------------------------------------------
    const A = mkTrack('MAPK8IP3_mRNA', 'ACGT'.repeat(500));
    const B = mkTrack('SPAG9_mRNA', 'TTAC'.repeat(600));
    const graph = { track: [A, B], said: [], getTracks: () => [A, B],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };

    pyReply = {
        status: 'OK', query: { name: 'exon 16', length: 170 },
        target: { name: 'SPAG9_mRNA', length: 2400, offset: 1000 }, floor: 54,
        engine: 'biopython PairwiseAligner, local, +2/-3, gap -5/-2, both strands',
        hits: [{ rank: 1, score: 340, start: 1600, end: 1770, strand: '+', identity: 1,
                 identical: 170, length: 170, gaps: 0, query_start: 0, query_end: 170, query_coverage: 1 },
               { rank: 2, score: 250, start: 2270, end: 2440, strand: '-', identity: 0.894,
                 identical: 152, length: 170, gaps: 0, query_start: 0, query_end: 170, query_coverage: 1 }]
    };
    pyCalls = []; helpShown = null;
    let r = await load('baja/bio/search-region.js', graph,
        { track: A, start: 1100, end: 1270, label: 'exon 16 of 32' }, B, {});
    ok(pyCalls.length === 1, 'the client sends one search to the backend');
    ok(pyCalls[0][1].offset === B.xi,
       'with the target track\'s left edge, so hits come back in its coordinates rather than '
       + 'as offsets into a string: ' + pyCalls[0][1].offset);
    ok(pyCalls[0][0].seq.length === 170, 'and only the region as the query: ' + pyCalls[0][0].seq.length);
    ok(pyCalls[0][2].strands === 'both', 'both strands by default');

    const text = (helpShown.rows || []).map((x) => x.join(' ')).join(' | ');
    ok(/#1/.test(text) && /#2/.test(text), 'both hits are listed, ranked');
    ok(/1,600/.test(text), 'with where each one is: ' + text.slice(0, 60));
    ok(/opposite strand/.test(text), 'and a minus-strand hit says so');
    ok(/covers 100\.0% of exon 16/.test(text),
       'and how much of the query each hit accounts for, since a short perfect match and a '
       + 'long imperfect one score alike and mean different things');

    // ---- nothing found is an answer, not an empty panel -----------------------------------
    pyReply = Object.assign({}, pyReply, { hits: [] });
    helpShown = null;
    r = await load('baja/bio/search-region.js', graph,
        { track: A, start: 1100, end: 1270, label: 'exon 16' }, B, {});
    const t2 = (helpShown.rows || []).map((x) => x.join(' ')).join(' ');
    ok(/above the noise floor/.test(t2),
       'no hits says why nothing was reported rather than showing an empty list: ' + t2.slice(0, 80));

    // ---- what it refuses -------------------------------------------------------------------
    r = await load('baja/bio/search-region.js', graph, { track: A, start: 1100, end: 1270 }, A, {});
    ok(!!r.error && /same track/.test(r.error), 'searching a track against itself: ' + r.error);

    // ---- the operation --------------------------------------------------------------------
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});
    const cap = C.list.filter((c) => c.name === 'search_region_in_track')[0];
    ok(!!cap, 'search_region_in_track is declared');
    const joined = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8')
        .replace(/'\s*\+\s*'/g, '');
    ok(joined.indexOf('compare exon 16 of A with any other part of B and rank the results') >= 0,
       'its description carries the sentence that was refused');
    ok(joined.indexOf('NOT compare_sequences') >= 0,
       'and says which of the two to use, since they are easy to confuse');
    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/FINDING IS NOT COMPARING/.test(plan), 'and the planner is told the difference');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();

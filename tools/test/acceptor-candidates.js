// RANK IS THE ANSWER, AND THE SCORE IS NOT.
//
//     node tools/test/acceptor-candidates.js
//
// BajaSplice puts only 26% of confirmed cryptic acceptors above a score of 0.5, against
// 0.69% of decoys, so a cutoff throws away three quarters of the real sites. What the model
// supports is ranking a gene's own intronic positions and reading the top. These tests pin
// the three things that ranking depends on: no score cutoff anywhere, annotated acceptors
// held out, and a percentile taken against this gene's own candidates.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Three exons, two introns of 2,000 nt each. Annotated acceptors therefore sit at 99 and
// 2299 on the plus strand (the last intronic base before an exon) and at 301 and 2501 on
// the minus; both edges of every exon are held out either way.
const mk = (strand) => ({
    name: 'T', xi: 0, xf: 6000, strand: strand,
    annotations: [[100, 300], [2300, 2500], [4500, 4700]].map((e, i) => ({
        type: 'Exon', index: i + 1, xi: e[0], xf: e[1] })),
    getExons() { return this.annotations.slice(); }
});
const rank = (t, prof, o) => load('baja/bio/splicing/acceptor-candidates.js', t,
    Object.assign({ profile: prof }, o || {}));

(async () => {
    // A WEAK SITE STILL RANKS. 0.03 is below every threshold in the codebase and is the
    // normal score for a real cryptic acceptor; it must come back, in order.
    let r = await rank(mk(1), { acceptor: [[1000, 0.03], [1500, 0.9], [3000, 0.2]] });
    ok(r.length === 3, 'no score cutoff: all three intronic positions ranked, got ' + r.length);
    ok(r[0].x === 1500 && r[1].x === 3000 && r[2].x === 1000, 'ranked by score, best first');
    ok(r[0].rank === 1 && r[2].rank === 3, 'rank is 1-based and dense');
    ok(r[0].outOf === 3, 'outOf reports the pool the rank is against');

    // THE PERCENTILE IS AGAINST THIS GENE'S OWN POOL, so the best of three is the top
    // third and not "99th percentile of all acceptors everywhere".
    ok(Math.abs(r[0].percentile - 100) < 0.01, 'best candidate is the 100th percentile of its own pool');
    ok(Math.abs(r[2].percentile - (100 / 3)) < 0.01, 'worst of three sits at 33.33, got ' + r[2].percentile);

    // ANNOTATED ACCEPTORS ARE HELD OUT. They score near 1.0 and would fill the top of
    // every list with sites the transcript already uses.
    r = await rank(mk(1), { acceptor: [[99, 0.99], [2299, 0.98], [1000, 0.1]] });
    ok(r.length === 1 && r[0].x === 1000, 'annotated plus-strand acceptors excluded, got ' + JSON.stringify(r.map((q) => q.x)));
    r = await rank(mk(-1), { acceptor: [[301, 0.99], [2501, 0.98], [1000, 0.1]] });
    ok(r.length === 1 && r[0].x === 1000, 'annotated minus-strand acceptors excluded, got ' + JSON.stringify(r.map((q) => q.x)));

    // The edge band is inclusive and configurable. The probe has to be INTRONIC or the
    // exon test excludes it and the band is never reached: intron 1 starts at 301, which
    // is itself an annotated edge, so 303 is intronic and 2 bases off it.
    r = await rank(mk(1), { acceptor: [[303, 0.9], [1000, 0.1]] }, { edge: 3 });
    ok(r.length === 1 && r[0].x === 1000, 'a position inside the edge band is treated as the annotated site');
    r = await rank(mk(1), { acceptor: [[303, 0.9], [1000, 0.1]] }, { edge: 0 });
    ok(r.length === 2, 'edge: 0 keeps it, so the band is not hard-coded');

    // EXONIC POSITIONS ARE NOT CANDIDATES: this searches the transcript's own introns.
    r = await rank(mk(1), { acceptor: [[200, 0.9], [2400, 0.9], [1000, 0.1]] });
    ok(r.length === 1 && r[0].x === 1000, 'positions inside an exon excluded, got ' + JSON.stringify(r.map((q) => q.x)));
    // Nor is anything outside the transcript's exon span, where there is no intron.
    r = await rank(mk(1), { acceptor: [[50, 0.9], [5000, 0.9], [1000, 0.1]] });
    ok(r.length === 1 && r[0].x === 1000, 'positions outside the introns excluded');

    // intron is the INDEX of the gap the candidate fell in, which is what the caller needs
    // to say "the strongest site in intron 2" rather than re-deriving it.
    r = await rank(mk(1), { acceptor: [[1000, 0.5], [3000, 0.4]] });
    ok(r[0].intron === 0 && r[1].intron === 1, 'intron index carried, got ' + r[0].intron + '/' + r[1].intron);
    ok(r[0].distToExon === 700, 'distToExon is to the NEAREST edge, got ' + r[0].distToExon);

    // top caps the list; 0 returns everything, which the view needs to report outOf.
    r = await rank(mk(1), { acceptor: [[1000, 0.5], [1100, 0.4], [1200, 0.3]] }, { top: 2 });
    ok(r.length === 2 && r[0].outOf === 3, 'top caps the list but outOf still reports the pool');
    r = await rank(mk(1), { acceptor: [[1000, 0.5], [1100, 0.4], [1200, 0.3]] }, { top: 0 });
    ok(r.length === 3, 'top: 0 returns all');

    // A single-exon transcript has no introns, so there is nothing to rank. An empty
    // result is the correct answer and must not throw.
    const one = { name: 'T', xi: 0, xf: 6000, strand: 1,
        annotations: [{ type: 'Exon', index: 1, xi: 100, xf: 300 }],
        getExons() { return this.annotations.slice(); } };
    r = await rank(one, { acceptor: [[1000, 0.5]] });
    ok(Array.isArray(r) && r.length === 0, 'a single-exon transcript returns empty, not an error');

    // Non-finite scores would sort unpredictably and must be dropped, not ranked.
    r = await rank(mk(1), { acceptor: [[1000, 0.5], [1100, NaN], [1200, null], [1300, 0.2]] });
    ok(r.length === 2, 'non-finite scores dropped, got ' + r.length);

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

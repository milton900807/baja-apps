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
const call = (t, prof, o) => load('baja/bio/splicing/acceptor-candidates.js', t,
    Object.assign(prof ? { profile: prof } : {}, o || {}));
// Most assertions below are about the ranking, so they take the rows; the ones about
// FAILING take the whole result, because the reason is the thing under test.
const rank = async (t, prof, o) => ((await call(t, prof, o)).rows);

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
    let res = await call(one, { acceptor: [[1000, 0.5]] });
    ok(res.ok === false, 'a single-exon transcript fails rather than throwing');
    ok(/1 readable annotated exon/.test(res.reason), 'and says how many exons it actually saw: ' + res.reason);
    ok(Array.isArray(res.rows) && res.rows.length === 0, 'and still carries an empty rows array');

    // Non-finite scores would sort unpredictably and must be dropped, not ranked.
    r = await rank(mk(1), { acceptor: [[1000, 0.5], [1100, NaN], [1200, null], [1300, 0.2]] });
    ok(r.length === 2, 'non-finite scores dropped, got ' + r.length);

    // ---- THE PATHS THAT HAD NO COVERAGE AT ALL, and so shipped broken -------------
    // Every test above passes opts.profile, which skips sequence handling and the model
    // call entirely. That is exactly why a five-exon STMN2 track came back claiming it
    // had fewer than two exons: the failure was somewhere in here, and the caller had one
    // sentence for seven different causes.

    // A track with exons but NO SEQUENCE must say so, not blame the exons.
    res = await call(mk(1), null, {});
    ok(res.ok === false, 'no sequence: fails');
    ok(/no sequence loaded/.test(res.reason), 'no sequence: says so, got: ' + res.reason);

    // A SPLICED sequence in a genomic frame is the failure that looks like a clean empty
    // run. mk() claims 0..6000; a 600 nt string is a tenth of that.
    const spliced = Object.assign(mk(1), { sequence: 'A'.repeat(600) });
    res = await call(spliced, null, {});
    ok(res.ok === false, 'spliced sequence: fails');
    ok(/spliced sequence/.test(res.reason) && /6,001 nt genomic frame/.test(res.reason),
        'spliced sequence: names both lengths, got: ' + res.reason);

    // A full-length sequence reaches the model call, which in this harness cannot be
    // reached at all -- so the reason must be about the model, not about the track.
    const genomic = Object.assign(mk(1), { sequence: 'A'.repeat(6001) });
    res = await call(genomic, null, {});
    ok(res.ok === false, 'model unreachable: fails');
    ok(/site model/.test(res.reason), 'model unreachable: blames the model, got: ' + res.reason);

    // Acceptors exist but none are intronic: that is a real finding, with a count.
    res = await call(mk(1), { acceptor: [[200, 0.9], [2400, 0.8]] });
    ok(res.ok === false, 'nothing intronic: fails');
    ok(/2 acceptor positions were scored/.test(res.reason) && /2 introns/.test(res.reason),
        'nothing intronic: counts both, got: ' + res.reason);

    // AN EMPTY getExons() FALLS BACK TO annotations. This is the STMN2 bug: the method
    // exists and returns nothing, the annotations hold the exons, and branching on which
    // method EXISTS rather than on what it RETURNED reported a five-exon gene as having
    // none. The fixture deliberately keeps both, with getExons() empty.
    const emptyMethod = {
        name: 'T', xi: 0, xf: 6000, strand: 1,
        annotations: [[100, 300], [2300, 2500], [4500, 4700]].map((e, i) => ({
            type: 'Exon', index: i + 1, xi: e[0], xf: e[1] })),
        getExons() { return []; }
    };
    res = await call(emptyMethod, { acceptor: [[1000, 0.5], [3000, 0.4]] });
    ok(res.ok === true, 'empty getExons() falls back to annotations: ' + (res.reason || 'ok'));
    ok(res.rows.length === 2, 'and ranks both intronic positions, got ' + res.rows.length);

    // A track with NEITHER says so, and names which source it read.
    const neither = { name: 'T', xi: 0, xf: 6000, strand: 1, annotations: [], getExons() { return []; } };
    res = await call(neither, { acceptor: [[1000, 0.5]] });
    ok(res.ok === false && /read via annotations/.test(res.reason),
        'no exons anywhere: names the source it fell back to, got: ' + res.reason);

    // A throwing getExons() must not take the whole run down.
    const thrower = Object.assign({}, emptyMethod, { getExons() { throw new Error('boom'); } });
    res = await call(thrower, { acceptor: [[1000, 0.5], [3000, 0.4]] });
    ok(res.ok === true && res.rows.length === 2, 'a throwing getExons() falls back rather than failing');

    // THE ARGUMENT ORDER OF THE MODEL CALL, pinned. Passing null where the engine wants
    // an EngineMonitor shifted every argument by one, so the backend received the monitor
    // slot as the sequence and answered "no sequence provided" about a track whose
    // sequence was loaded and on screen.
    //
    // The spy goes on lion_engine, NOT on the injected exec: lib/core.js declares its own
    // exec(), which shadows the parameter, so every module call reaches the engine. A spy
    // on the parameter is simply never consulted, which is worth knowing before writing
    // the next one of these.
    const calls = [];
    const realEngine = global.lion_engine;
    global.lion_engine = { exec: (p, ...a) => {
        if (/splicing-profile\.py/.test('' + p)) { calls.push(a); return { acceptor: '[[1000,0.5]]' }; }
        return realEngine.exec(p, ...a);
    } };
    const genomicTrack = Object.assign(mk(1), { sequence: 'A'.repeat(6001) });
    res = await load('baja/bio/splicing/acceptor-candidates.js', genomicTrack, {});
    global.lion_engine = realEngine;

    ok(calls.length === 1, 'the model was called once, got ' + calls.length);
    const a0 = calls[0] || [];
    ok(a0[0] && typeof a0[0] === 'object', 'arg 0 is the EngineMonitor, not null');
    ok(typeof a0[1] === 'string' && a0[1].length === 6001, 'arg 1 is the SEQUENCE, got length ' + ('' + a0[1]).length);
    ok(a0[2] === '0', 'arg 2 is xi, got ' + a0[2]);
    ok(a0[3] === '1', 'arg 3 is the strand, got ' + a0[3]);
    ok(a0[4] === 'sites', 'arg 4 is the mode, got ' + a0[4]);
    ok(a0[6] === 'plus', 'arg 6 is the orientation, got ' + a0[6]);
    ok(res.ok === true && res.rows.length === 1, 'and the reply is parsed into a ranked row');

    // A successful call reports the pool it ranked against and what it was given.
    res = await call(mk(1), { acceptor: [[1000, 0.5], [1100, 0.4], [200, 0.9]] });
    ok(res.ok === true && res.outOf === 2 && res.scored === 3,
        'success carries outOf and scored, got ' + res.outOf + '/' + res.scored);

    // ---- THE ARCS -----------------------------------------------------------------
    // The ranker hands back the introns so the view can draw each candidate as the
    // junction it would make. The donor end is the first intronic base after the UPSTREAM
    // exon, which is the low end of the intron on a plus-strand track and the HIGH end on
    // a minus-strand one, because transcript order runs the other way. Getting that
    // backwards draws every arc across the whole intron and still looks plausible.
    res = await call(mk(1), { acceptor: [[1000, 0.5], [3000, 0.4]] });
    ok(Array.isArray(res.introns) && res.introns.length === 2, 'introns come back with the rows');
    ok(res.introns[0].lo === 301 && res.introns[0].hi === 2299,
        'intron 0 is the gap between exon 1 and exon 2, got ' + JSON.stringify(res.introns[0]));
    ok(res.plus === true, 'plus strand reported as such');

    const minus = await call(mk(-1), { acceptor: [[1000, 0.5]] });
    ok(minus.plus === false, 'minus strand reported as such, got ' + minus.plus);

    // The view's own rule, restated here so the two cannot drift apart: on a plus-strand
    // track the donor is intron.lo, on a minus-strand one it is intron.hi.
    const donorFor = (r, introns, isPlus) => {
        const iv = introns[r.intron];
        return isPlus ? iv.lo : iv.hi;
    };
    ok(donorFor(res.rows[0], res.introns, true) === 301,
        'plus-strand donor is the low end of the intron, got ' + donorFor(res.rows[0], res.introns, true));
    ok(donorFor(minus.rows[0], minus.introns, false) === 2299,
        'minus-strand donor is the high end, got ' + donorFor(minus.rows[0], minus.introns, false));
    ok(res.rows[0].intron === 0 && res.rows[1].intron === 1,
        'each row names the intron its arc starts from');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

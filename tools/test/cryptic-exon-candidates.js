// AN INTRON IS NOT EMPTY.
//
//     node tools/test/cryptic-exon-candidates.js
//
// Skipping and trimming can only take peptide away. The only way to ADD any is to make the
// transcript use a stretch of its own intron, which is what a pseudo-exon inclusion event
// is. A candidate is an acceptor and a donor, scored by the same model the sashimi arcs
// come from, in the same intron, the right way round, far enough apart to be an exon and
// near enough to be a plausible one.
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

// Three exons, two introns of 2,000 nt each.
const mk = (strand) => ({
    name: 'T', xi: 0, xf: 6000, strand: strand,
    annotations: [[100, 300], [2300, 2500], [4500, 4700]].map((e, i) => ({
        type: 'Exon', index: i + 1, xi: e[0], xf: e[1] })),
    getExons() { return this.annotations.slice(); }
});
const scan = (t, prof, o) => load('baja/bio/splicing/cryptic-exon-candidates.js', t,
    Object.assign({ profile: prof }, o || {}));

(async () => {
    // One good pair in intron 1: acceptor at 1000, donor at 1121, so the exon is 1001-1120.
    const prof = {
        acceptor: [[1000, 0.8], [1500, 0.05], [3000, 0.4]],
        donor: [[1121, 0.7], [3200, 0.35], [1010, 0.9]]
    };
    let c = await scan(mk(1), prof);
    const first = c.filter((x) => x.intron === 1)[0];
    ok(!!first, 'a pair in an intron is a candidate exon: ' + JSON.stringify(c.slice(0, 2)));
    ok(first && first.xi === 1001 && first.xf === 1120,
       'running from one past the acceptor to one before the donor, which is where the '
       + 'model puts those labels: ' + JSON.stringify(first && [first.xi, first.xf]));
    ok(first && first.len === 120 && first.frame === 0,
       'with its length and what it does to the frame: ' + JSON.stringify(first && [first.len, first.frame]));
    ok(first && first.score === 0.7,
       'scored by its WEAKER end, since a perfect donor with no acceptor splices nothing: '
       + (first && first.score));

    // The donor at 1010 is 10 nt past the acceptor: not an exon.
    ok(!c.some((x) => x.xf === 1009), 'a pair too close together is not a cassette exon');
    // The acceptor at 1500 is below the threshold.
    ok(!c.some((x) => x.xi === 1501), 'a site the model barely scores is not paired');
    // Intron 2 has a pair as well: 3001-3199.
    const second = c.filter((x) => x.intron === 2)[0];
    ok(second && second.xi === 3001 && second.xf === 3199, 'each intron is scanned: '
       + JSON.stringify(second && [second.xi, second.xf]));

    // ---- a minus-strand track reads the other way round ---------------------------------
    // The acceptor is the HIGHER coordinate there, so a pair that makes an exon on a plus
    // track makes nothing on a minus one, and vice versa.
    c = await scan(mk(-1), prof);
    ok(!c.some((x) => x.xi === 1001),
       'the plus-strand pairing is not proposed on a minus-strand track');
    const back = await scan(mk(-1), { acceptor: [[1121, 0.7]], donor: [[1000, 0.8]] });
    ok(back.length === 1 && back[0].xi === 1001 && back[0].xf === 1120,
       'and the reversed pair is the one that makes the same exon: ' + JSON.stringify(back[0]));

    // ---- nothing is invented ------------------------------------------------------------
    ok((await scan(mk(1), { acceptor: [], donor: [] })).length === 0, 'no sites, no candidates');
    ok((await scan(mk(1), { acceptor: [[1000, 0.8]], donor: [[5500, 0.8]] })).length === 0,
       'a donor in a different intron is not a partner');
    ok((await scan(mk(1), { acceptor: [[1000, 0.8]], donor: [[1900, 0.8]] }, { max_len: 350 })).length === 0,
       'a span longer than an exon is a retained intron, which is a different edit');

    // ---- overlapping proposals are one proposal ------------------------------------------
    const many = await scan(mk(1), {
        acceptor: [[1000, 0.9], [1002, 0.85], [1004, 0.8]],
        donor: [[1200, 0.9], [1202, 0.85], [1204, 0.8]]
    });
    ok(many.filter((x) => x.intron === 1).length === 1,
       'one end moved by two bases is the same exon, not nine options: '
       + many.filter((x) => x.intron === 1).length);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

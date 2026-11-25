// WHAT WOULD THIS SITE ACTUALLY MAKE?
//
//     node tools/test/alternative-exon.js
//
// A ranked acceptor is half a splice event, and half an event has no consequence. This
// closes the exon with a donor, splices it into the transcript and translates, because
// the question behind a cryptic site is what the message would say if it were used.
//
// The case is built so the answer is known: one donor gives an exon whose length is a
// multiple of three (an insertion), another gives one that is not (a frameshift).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Two exons, a long intron between them, and the whole thing in frame: exon 1 is 300 nt
// from the ATG, exon 2 ends in a stop. The filler is GCT (alanine) so nothing accidental
// terminates translation, which has caught this suite before.
const N = 4000;
const seq = new Array(N).fill('G');
const fill = (lo, hi, codon) => { for (let p = lo; p <= hi; p++) seq[p] = codon[(p - lo) % 3]; };
const put = (at, s) => { for (let i = 0; i < s.length; i++) seq[at + i] = s[i]; };
fill(0, N - 1, 'GCT');
const EX1 = [100, 399], EX2 = [3000, 3299];
put(100, 'ATG');
put(3297, 'TAA');
const ACC = 1500;                 // the candidate acceptor: exon would start at 1501
const D_INFRAME = 1591;           // 1501..1590 is 90 nt: in frame
const D_SHIFT = 1593;             // 1501..1592 is 92 nt: a frameshift

const mkTrack = () => ({
    name: 'TEST', xi: 0, xf: N - 1, strand: 1, sequence: seq.join(''),
    annotations: [{ type: 'Exon', index: 1, xi: EX1[0], xf: EX1[1] },
                  { type: 'Exon', index: 2, xi: EX2[0], xf: EX2[1] },
                  { type: 'translation', xi: 100, xf: 102, strand: '+' }],
    getExons() { return this.annotations.filter((a) => a.type === 'Exon'); },
    getSequenceRange(a, b) { return this.sequence.slice(Math.max(0, a), Math.max(0, b) + 1); }
});
const PROFILE = { acceptor: [[ACC, 0.42]],
                  donor: [[D_INFRAME, 0.80], [D_SHIFT, 0.55], [3500, 0.9]] };
const run = (x, o) => load('baja/bio/splicing/alternative-exon.js', mkTrack(), x,
    Object.assign({ profile: PROFILE }, o || {}));

(async () => {
    const r = await run(ACC);
    ok(r.ok, 'it runs: ' + (r.ok ? '' : r.reason));
    if (!r.ok) { console.log('\n1 failed'); process.exit(1); }

    ok(r.acceptor.intron === 1, 'it knows which intron the site is in');
    ok(r.normal.peptide.length > 100 && /^M/.test(r.normal.peptide),
       'and what the transcript makes as it stands: ' + r.normal.peptide.slice(0, 12) + '... ('
       + r.normal.peptide.length + ' aa)');

    // THE DONOR IS A CHOICE. Both pairings are returned, best-scoring first.
    ok(r.pairings.length === 2, 'both donors inside the intron are offered: ' + r.pairings.length);
    ok(r.pairings[0].donorX === D_INFRAME, 'best-scoring first: ' + r.pairings[0].donorX);
    // The donor at 3500 is in exon 2, not the intron, so it closes nothing.
    ok(!r.pairings.some((p) => p.donorX === 3500), 'a donor outside the intron is not offered');

    const A = r.pairings[0], B = r.pairings[1];
    ok(A.exon.xi === ACC + 1 && A.exon.length === 90 && A.exon.frame === 0,
       'the in-frame pairing makes a 90 nt exon starting one past the acceptor: '
       + JSON.stringify([A.exon.xi, A.exon.length]));
    ok(/in frame: 30 residues inserted/.test(A.consequence),
       'and says what that does to the protein: ' + A.consequence);
    ok(A.peptide.length === r.normal.peptide.length + 30,
       'which is 30 residues longer: ' + A.peptide.length + ' against ' + r.normal.peptide.length);
    ok(A.divergeAt != null && A.divergeAt > 0,
       'with where the two proteins part company: residue ' + A.divergeAt);

    ok(B.exon.length === 92 && B.exon.frame === 2, 'the other pairing is 92 nt, out of frame');
    ok(/frameshift/.test(B.consequence), 'and says so rather than reporting a length: ' + B.consequence);

    // ---- what it refuses, and why ---------------------------------------------------------
    {
        const e1 = await run(50);
        ok(!e1.ok && /not inside an intron/.test(e1.reason),
           'a position in an exon is refused: ' + e1.reason);
        const e2 = await load('baja/bio/splicing/alternative-exon.js', mkTrack(), ACC,
            { profile: { acceptor: [[ACC, 0.4]], donor: [[1505, 0.9]] } });
        ok(!e2.ok && /no donor the model scores/.test(e2.reason),
           'a donor too close to make an exon leaves nothing to close it: ' + e2.reason);
        const bare = { name: 'NOORF', xi: 0, xf: 100, sequence: 'ACGT', annotations: [],
            getExons: () => [], getSequenceRange: () => 'ACGT' };
        const e3 = await load('baja/bio/splicing/alternative-exon.js', bare, 10, { profile: PROFILE });
        ok(!e3.ok && /NOORF/.test(e3.reason),
           'and a track with no reading frame says so by name: ' + e3.reason);
    }

    // ---- the shared fetch, and the bug it exists to end -------------------------------------
    {
        const sp = fs.readFileSync('baja/bio/splicing/sites-profile.js', 'utf8');
        ok(/new EngineMonitor/.test(sp), 'the site profile is fetched with a real EngineMonitor');
        for (const f of ['baja/bio/splicing/acceptor-candidates.js',
                         'baja/bio/splicing/cryptic-exon-candidates.js',
                         'baja/bio/splicing/alternative-exon.js']) {
            const src = fs.readFileSync(f, 'utf8');
            ok(/sites-profile\.js/.test(src), f + ' asks the shared fetch');
            const live = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
            ok(!/splicing-profile\.py'/.test(live) || !/exec\(window\['env'\]/.test(live),
               f + ' no longer writes the model call out itself');
        }
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

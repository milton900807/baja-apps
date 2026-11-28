// THE VARIANTS ON A TRACK, READ AS RESIDUE SUBSTITUTIONS, once.
//
//     node tools/test/variants-to-residues.js
//
// There were two readings of this and they disagreed. Clicking a SNP read the substitution
// off the track's own reading frame and reported A315T creating two motifs; the report over
// all the variants read the protein field of the track's annotations, which a ClinVar load
// does not write, and announced that the same track had no coding variants at all. This is
// the one reading, and what it leaves out it has to be able to name, because a report
// listing eleven of forty variants must be able to say what happened to the other
// twenty-nine or its emptiness reads as a broken screen.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

global.window = { env: { apiUrl: '' } };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// A reading frame in the shape baja/bio/track.js builds: one entry per coding base, each
// carrying its codon, which base of it this is, and the codon's index.
const frame = (startPos, codons) => {
    const out = [];
    let p = startPos;
    codons.forEach((codon, k) => {
        for (let ci = 0; ci < 3; ci++) out.push({ index: p++, ci: ci, codon_index: k, codon: codon, aa: '' });
    });
    return out;
};
// GCG GTG ATG TAA -> A V M stop, codons 1..4 at positions 100..111
const mkTrack = () => ({
    name: 'T', snpindels: [],
    orf: { cdsi: frame(100, ['GCG', 'GTG', 'ATG', 'TAA']) }
});
const snp = (xi, ref, alt, extra) => Object.assign({ xi: xi, reference: ref, alternate: alt }, extra || {});

(async () => {
    const run = (t, s) => load('baja/bio/protein/variants-to-residues.js', t, s);

    // ---- A MISSENSE CHANGE --------------------------------------------------------------
    let t = mkTrack();
    t.snpindels = [snp(100, 'G', 'A')];        // GCG -> ACG, A1T
    let r = await run(t);
    ok(r.ok && r.list.length === 1, 'a coding substitution is read');
    const one = r.list[0];
    ok(one.spec === 'A1T', 'as a residue substitution in this frame: ' + one.spec);
    ok(one.codon === 'GCG' && one.mutCodon === 'ACG',
       'with the codon before and after: ' + one.codon + '>' + one.mutCodon);
    ok(one.pos === 1 && one.wt === 'A' && one.mu === 'T', 'and its parts, for a caller that wants them');
    ok(/g\.100 G>A/.test(one.label), 'labelled as the variant was written: ' + one.label);

    // The position is the codon index of THIS frame, which is what the motif scan
    // translates. A number from anywhere else can be off by one against this track.
    t = mkTrack();
    t.snpindels = [snp(106, 'A', 'G')];        // third codon ATG -> GTG, M3V
    r = await run(t);
    ok(r.list[0].spec === 'M3V', 'the third codon is residue 3, not residue 2 or 4: ' + r.list[0].spec);

    // ---- WHAT IS LEFT OUT, AND WHY --------------------------------------------------------
    t = mkTrack();
    t.snpindels = [
        snp(102, 'G', 'A'),        // GCG -> GCA, synonymous
        snp(50, 'A', 'T'),         // outside the ORF
        snp(103, 'G', 'GT'),       // an insertion
        snp(109, 'T', 'A'),        // TAA is the stop codon
        snp(104, 'T', 'A')         // GTG -> GAG, V2E: the one that survives
    ];
    r = await run(t);
    ok(r.list.length === 1 && r.list[0].spec === 'V2E',
       'the one that changes a residue is kept: ' + r.list.map((x) => x.spec).join(', '));
    const why = (frag) => r.skipped.some((x) => new RegExp(frag).test(x.why));
    ok(r.skipped.length === 4, 'and the rest are named: ' + r.skipped.length);
    ok(why('synonymous'), 'a synonymous change says so');
    ok(why('not inside a codon'), 'one outside the ORF says so');
    ok(why('not a single-base substitution'), 'an indel says so');
    ok(why('stop codon'), 'a change to the stop codon says so');
    ok(r.skipped.every((x) => /g\.\d+/.test(x.label)), 'each by name, so a report can list them');

    // A track with no reading frame is refused as a whole rather than per variant: there
    // is no codon anywhere, and forty identical reasons is not a report.
    t = { name: 'NOFRAME', snpindels: [snp(100, 'G', 'A')], orf: null };
    r = await run(t);
    ok(!r.ok && r.why === 'no reading frame', 'a track with no frame is refused once');
    ok(r.skipped.length === 1, 'with every variant accounted for');

    // ---- THE TWO CALLERS NOW AGREE --------------------------------------------------------
    const view = fs.readFileSync('baja/bio/protein/motif-impact-view.js', 'utf8');
    ok(/variants-to-residues\.js/.test(view), 'the report reads the frame');
    ok(/annotations are kept as a fallback/.test(view),
       'and keeps the annotation reading for tracks annotated by hand');
    const one2 = fs.readFileSync('baja/bio/protein/motif-impact.js', 'utf8');
    ok(/variants-to-residues\.js/.test(one2), 'the single-variant window reads the same frame');
    ok(!/TTT: 'F'|TTT:'F'/.test(one2), 'and no longer carries a second codon table');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

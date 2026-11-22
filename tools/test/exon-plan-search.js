// WHAT WOULD HAVE TO CHANGE FOR THIS TRANSCRIPT TO MAKE THAT PROTEIN.
//
//     node tools/test/exon-plan-search.js
//
// The comparison answers "how alike are these two". The question a paralogue pair actually
// raises is the next one: which exons of the target to lose, which cryptic exons to induce
// in its introns, so that what it translates reproduces the source's protein.
//
// This builds a target whose answer is known -- one exon too many, and one stretch missing
// that is sitting in an intron with splice sites either side of it -- and checks the search
// finds exactly those two edits and nothing else.
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

// ---- a transcript whose answer is known -----------------------------------------------
// Every exon is a multiple of three and the start sits at the first base of exon 1, so
// every junction falls between codons and no junction can invent a stop. The filler codon
// is GCT (alanine); the exon that has to go is lysine (AAA); the stretch to induce is
// tryptophan (TGG), which appears nowhere else.
const N = 9000;
const seq = new Array(N).fill('G');
const put = (at, s) => { for (let i = 0; i < s.length; i++) seq[at + i] = s[i]; };
const fill = (lo, hi, codon) => { for (let p = lo; p <= hi; p++) seq[p] = codon[(p - lo) % 3]; };

//            exon 1        exon 2        exon 3 (the extra one)   exon 4
const EX = [[100, 198], [1200, 1298], [3000, 3098], [7000, 7098]];
const CRYPTIC = { xi: 5001, xf: 5060, len: 60, intron: 3, score: 0.8, frame: 0 };

fill(0, N - 1, 'GCT');                    // alanine everywhere, including the introns
for (const e of EX) fill(e[0], e[1], 'GCT');
put(100, 'ATG');                          // the start codon, at the first base of exon 1
fill(3000, 3098, 'AAA');                  // exon 3: lysine, which the source does not have
fill(5001, 5060, 'TGG');                  // the cryptic exon: tryptophan
put(7096, 'TAA');                         // the stop, at the end of the last exon

const mkTarget = () => ({
    name: 'TARGET', xi: 0, xf: N - 1, strand: 1, sequence: seq.join(''),
    annotations: EX.map((e, i) => ({ type: 'Exon', index: i + 1, xi: e[0], xf: e[1] }))
        .concat([{ type: 'translation', xi: 100, xf: 102, strand: '+' }]),
    getExons() { return this.annotations.filter((a) => a.type === 'Exon'); }
});
// The protein the target makes as it stands: M, alanines, lysines, alanines.
// The source is that WITHOUT the lysines and WITH tryptophans in their place, which is
// exactly "lose exon 3, induce the cryptic exon".
const A = (n) => 'A'.repeat(n);
const SRC = 'M' + A(32) + A(33) + 'W'.repeat(20) + A(32);
const mkSource = () => ({ name: 'SOURCE', orf: { protein: SRC, cdsi: [1] } });

(async () => {
    const T = mkTarget();
    const r = await load('baja/bio/splicing/exon-plan-search.js', mkSource(), T,
        { cryptic: [CRYPTIC], shifts: false, max_edits: 3 });

    ok(r.ok, 'the search runs: ' + (r.ok ? '' : r.reason));
    if (!r.ok) { console.log('\n1 failed'); process.exit(1); }

    // The unedited transcript, for the plans to be an improvement ON.
    ok(/^M A*K+A*$/.test(r.baseline.peptide.replace(/A+/g, (m) => m)) || /K/.test(r.baseline.peptide),
       'the target as it stands translates through the lysine exon: '
       + r.baseline.peptide.slice(0, 40) + '...');
    ok(r.baseline.matched < SRC.length,
       'and does not reproduce the source: ' + r.baseline.matched + ' of ' + SRC.length);

    const best = r.plans[0];
    ok(!!best, 'it proposes a plan');
    ok(best && best.gain > 0, 'that is a better fit than leaving the transcript alone: '
       + (best && (base => (base * 100).toFixed(1))(best.fit)) + '% against '
       + (r.baseline.fit * 100).toFixed(1) + '%');
    ok(best && best.fit > 0.99, 'and here, where the answer is reachable exactly, it is exact: '
       + (best && best.fit.toFixed(3)));

    // THE TWO EDITS THE CASE WAS BUILT AROUND.
    const kinds = (p) => p.edits.map((e) => e.kind).sort().join(',');
    ok(best && /lose/.test(kinds(best)), 'it loses an exon: ' + (best && kinds(best)));
    ok(best && best.edits.some((e) => e.kind === 'lose' && e.n === 3),
       'EXON 3, the one carrying peptide the source does not have: '
       + JSON.stringify(best && best.edits));
    ok(best && best.edits.some((e) => e.kind === 'induce'),
       'and induces the cryptic exon, which is the only way to ADD the missing stretch');
    ok(best && best.induced.length === 1 && best.induced[0].xi === 5001,
       'the one in intron 3: ' + JSON.stringify(best && best.induced));
    ok(best && /W{15,}/.test(best.peptide),
       'so what it makes carries the tryptophan stretch: ' + (best && best.peptide.slice(0, 50)));
    ok(best && !/K/.test(best.peptide), 'and not the lysines: ' + (best && best.peptide.slice(0, 50)));

    // ---- every plan is a transcript that could actually make a protein -----------------
    for (const p of r.plans) {
        ok(p.length > 0 && /^M/.test(p.peptide), 'every plan keeps the start codon: ' + p.peptide.slice(0, 8));
        ok(p.nmd === 'escapes', 'and no plan leaves a stop where NMD would find it: ' + p.nmd);
    }

    // ---- the roles the picture needs -----------------------------------------------------
    const roles = best.roles;
    ok(roles.length === 4, 'every exon of the target has a role: ' + roles.length);
    ok(roles.filter((x) => x.role === 'lose').length === 1
       && roles.filter((x) => x.role === 'lose')[0].n === 3,
       'exon 3 is the one marked to lose: ' + JSON.stringify(roles.map((x) => x.n + ':' + x.role)));
    ok(roles.filter((x) => x.role === 'keep').length === 3, 'and the rest are kept');
    ok(roles.every((x) => isFinite(x.xi) && isFinite(x.xf)), 'each with its coordinates to draw at');

    // ---- an edit that makes nothing better is not reported --------------------------------
    // Keeping the transcript as it is, is not a plan.
    ok(r.plans.every((p) => p.gain > 0), 'no plan is reported that gains nothing');
    ok(r.plans.every((p) => p.edits.length >= 1), 'and none is empty');

    // ---- refusals say which track and why --------------------------------------------------
    const noOrf = await load('baja/bio/splicing/exon-plan-search.js', { name: 'EMPTY' }, T, { cryptic: [] });
    ok(!noOrf.ok && /EMPTY/.test(noOrf.reason) && /no peptide to aim at|no ORF/.test(noOrf.reason),
       'a source with no ORF is refused by name: ' + noOrf.reason);
    const same = await load('baja/bio/splicing/exon-plan-search.js', T, T, { cryptic: [] });
    ok(!same.ok && /same track/.test(same.reason), 'and a track against itself: ' + same.reason);

    console.log('\nsearched ' + r.considered + ' edits, translated ' + r.evaluated
        + ' transcripts, kept ' + r.plans.length + ' plans');
    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

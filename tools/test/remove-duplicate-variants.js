// THE SAME MUTATION, LOADED TWICE.
//
//     node tools/test/remove-duplicate-variants.js
//
// Loading ClinVar over a track that already carries it leaves every change on the canvas
// more than once: two lollipops on one base, two cards saying the same thing, and a count
// inflated by however many times the set was loaded. Nothing in the editor could find them.
//
// What counts as the same is the whole question, and the two answers are not
// interchangeable. NUCLEOTIDE duplicates are the same variant and collapsing them loses
// nothing. PEPTIDE duplicates are different nucleotide changes that happen to give the
// same residue, so collapsing them throws away the nucleotide -- that is a decision, not a
// cleanup, and this file holds it to being one: never the default, and every dropped
// change named rather than counted.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// lib/core.js reads window as it loads; nothing here touches the DOM beyond that.
global.window = { env: { apiUrl: '' } };
global.document = { createElement: () => ({ style: {}, setAttribute() { }, appendChild() { } }) };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let RESIDUES = null;
const load = async (p, ...a) => {
    if (/variants-to-residues\.js$/.test(p)) return RESIDUES;
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m),
    wake() { }, rescale() { }, pushOntoHistory() { this.history = (this.history || 0) + 1; } };
const last = () => said[said.length - 1] || '';

let uid = 0;
const snp = (xi, ref, alt, extra) => Object.assign({
    xi: xi, xf: xi, type: 'snp', reference: ref, alternate: alt, uid: ++uid
}, extra || {});
const mkTrack = (snps) => ({
    name: 'DNM1', snpindels: snps,
    removesnp(s) { const i = this.snpindels.indexOf(s); if (i < 0) throw new Error('not here'); this.snpindels.splice(i, 1); }
});
const run = (t, opts) => load('baja/bio/variants/remove-duplicate-variants.js', graph, [t], opts || {});

(async () => {
    // ---- THE SAME CHANGE AT THE SAME BASE ---------------------------------------------------
    let a = snp(1000, 'G', 'A'), b = snp(1000, 'G', 'A'), c = snp(1000, 'G', 'T');
    let t = mkTrack([a, b, c]);
    said.length = 0;
    let r = await run(t);
    ok(r.ok && r.removed === 1, 'one of two identical variants goes: ' + r.removed);
    ok(t.snpindels.length === 2, 'and the track keeps the other two');
    ok(t.snpindels.indexOf(c) >= 0, 'G>T at the same base is a different change and stays');
    ok(/Removed 1 duplicate variant/.test(last()), 'said plainly: ' + last().slice(0, 60));
    ok(/Undo puts them back/.test(last()), 'with the way back');
    ok(graph.history >= 1, 'and history taken first, so undo has something to undo');

    // An indel is its span as well as its base: two deletions from the same base that end
    // in different places are two deletions.
    t = mkTrack([snp(1000, 'GAT', '', { type: 'del', xf: 1002 }),
                 snp(1000, 'GATC', '', { type: 'del', xf: 1003 })]);
    r = await run(t);
    ok(r.removed === 0 && t.snpindels.length === 2,
       'two deletions of different length at one base are two variants');

    // ---- WHICH COPY STAYS ---------------------------------------------------------------------
    // Duplicates are rarely identical in what they carry: one copy came from a clinical set
    // and the other from a bare position list, and keeping the wrong one costs the
    // annotation silently.
    const bare = snp(2000, 'C', 'T');
    const rich = snp(2000, 'C', 'T', { clinsig: 'Pathogenic', clindn: 'DEE31A', id: 'VCV00001' });
    t = mkTrack([bare, rich]);
    r = await run(t);
    ok(t.snpindels.length === 1 && t.snpindels[0] === rich,
       'the copy that knows the most is the one kept, not the first one seen');
    ok(/carrying the most/.test(last()), 'and the report says that is the rule');

    // ---- A DRY RUN REMOVES NOTHING ---------------------------------------------------------------
    t = mkTrack([snp(3000, 'A', 'G'), snp(3000, 'A', 'G'), snp(3000, 'A', 'G')]);
    said.length = 0;
    r = await run(t, { dryRun: true });
    ok(r.removed === 2 && t.snpindels.length === 3,
       'a dry run counts the two extra copies and removes neither');
    ok(/Would remove 2/.test(last()) && /Nothing was removed/.test(last()),
       'saying so both ways round: ' + last().slice(0, 50));

    // ---- PEPTIDE: THE SAME RESIDUE BY A DIFFERENT ROUTE ---------------------------------------------
    // c.943G>A and c.943G>C both give A315T. They are NOT the same variant.
    const ga = snp(4000, 'G', 'A'), gc = snp(4001, 'G', 'C'), other = snp(5000, 'T', 'C');
    t = mkTrack([ga, gc, other]);
    RESIDUES = { ok: true, list: [
        { snp: ga, spec: 'A315T' }, { snp: gc, spec: 'A315T' }, { snp: other, spec: 'V512A' }] };
    said.length = 0;
    r = await run(t, { by: 'nucleotide' });
    ok(r.removed === 0, 'by nucleotide they are two variants, because they are');
    r = await run(t, { by: 'peptide' });
    ok(r.removed === 1 && t.snpindels.length === 2, 'by peptide one of them goes');
    const g = r.groups.find((x) => x.kind === 'peptide');
    ok(g && g.label === 'A315T', 'the group is named by the residue change: ' + (g && g.label));
    ok(g && g.changes.length === 2 && /G>A@4000/.test(g.changes.join(' ')) && /G>C@4001/.test(g.changes.join(' ')),
       'and NAMES both nucleotide changes rather than counting them: ' + (g && g.changes.join(' ')));
    ok(/matched on PEPTIDE only/.test(last()),
       'the message says this set was a peptide match, not an identity: ' + last().slice(-120));

    // A variant with no residue reading is not a peptide duplicate of anything, including
    // of the other variants with no reading.
    const n1 = snp(6000, 'A', 'T'), n2 = snp(7000, 'C', 'G');
    t = mkTrack([n1, n2, ga]);
    RESIDUES = { ok: true, list: [{ snp: ga, spec: 'A315T' }] };
    r = await run(t, { by: 'peptide' });
    ok(r.removed === 0 && t.snpindels.length === 3,
       'two variants outside the CDS are not duplicates of each other');

    // With no reading frame at all there is no peptide signature, and saying "no
    // duplicates" would be a wrong answer rather than a missing one.
    t = mkTrack([snp(8000, 'A', 'T'), snp(8000, 'A', 'T')]);
    RESIDUES = { ok: false, reason: 'no CDS' };
    said.length = 0;
    r = await run(t, { by: 'peptide' });
    ok(!r.ok && /no peptide signature to match on/.test(r.why),
       'a track with no residue readings refuses rather than reporting none: ' + r.why);
    ok(t.snpindels.length === 2, 'and removes nothing while refusing');
    ok(/Matching by nucleotide still works/.test(last()), 'pointing at the way that does work');

    // ---- BOTH, WITHOUT DOUBLE-COUNTING ---------------------------------------------------------------
    const d1 = snp(9000, 'G', 'A'), d2 = snp(9000, 'G', 'A'), d3 = snp(9100, 'G', 'C');
    t = mkTrack([d1, d2, d3]);
    RESIDUES = { ok: true, list: [
        { snp: d1, spec: 'R100Q' }, { snp: d2, spec: 'R100Q' }, { snp: d3, spec: 'R100Q' }] };
    r = await run(t, { by: 'both' });
    ok(r.removed === 2 && t.snpindels.length === 1, 'both rules together leave one: ' + r.removed);
    ok(r.groups.length === 1, 'reported as one set, not as a nucleotide set and a peptide set '
       + 'over the same variants: ' + r.groups.length);

    // ---- NOTHING TO DO -----------------------------------------------------------------------------------
    t = mkTrack([snp(1, 'A', 'G'), snp(2, 'A', 'G'), snp(3, 'A', 'T')]);
    said.length = 0;
    r = await run(t);
    ok(r.ok && r.removed === 0, 'a clean track removes nothing');
    ok(/no duplicates by nucleotide/.test(last()) && /different change/.test(last()),
       'and says that is the finding, not that it failed: ' + last().slice(0, 70));

    // ---- WHAT IS REFUSED ---------------------------------------------------------------------------------
    r = await load('baja/bio/variants/remove-duplicate-variants.js', graph, [], {});
    ok(!r.ok && /No track to look at/.test(r.why), 'no track, no run');
    r = await run(mkTrack([snp(1, 'A', 'G')]), { by: 'codon' });
    ok(!r.ok && /none of those/.test(r.why), 'and an unknown rule is named rather than ignored');

    // ---- AND IT IS REACHABLE ------------------------------------------------------------------------------
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'remove_duplicate_variants'/.test(cap), 'a prompt can ask for it');
    ok(/remove duplicate mutations/.test(cap), 'in the words that came back as not-something-we-do');
    ok(/destructive: true, confirm: true/.test(cap),
       'and it asks first, since it takes things off the canvas');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

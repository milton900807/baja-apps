// WHAT THE VARIANTS DO TO THE SEQUENCE ELEMENTS AROUND THEM, and the question that is
// asked before either half runs.
//
//     node tools/test/nucleotide-motif-impact.js
//
// "What motifs are created from the variants on the screen" has two right answers, peptide
// motifs and sequence elements, and used to get neither: the planner wrote a paragraph
// explaining the question did not apply. Both halves are driven here, as is the choosing,
// because the half that exists for a UTR variant is the nucleotide one and UTR variants
// are most of what gets loaded.
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

const said = [];
const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m), track: [] };

// A 3' UTR with one AU-rich pentamer and no polyadenylation signal, at a round coordinate
// so the arithmetic in the output can be read by eye.
const LO = 1000;
//                 0         1         2         3         4         5
//                 0123456789012345678901234567890123456789012345678901
const SEQ = 'GGCACGTGCAAGCTGGATTTAGCACGTACGTGCAAGCTTAATAACGTGCAAGCTGGCACGTGCAAGCTGG';
const mkTrack = (strand) => ({
    name: 'TARDBP_3utr', xi: LO, xf: LO + SEQ.length - 1, strand: (strand == null ? 1 : strand),
    sequence: SEQ,
    getSequenceRange: (a, b) => SEQ.slice(a - LO, b - LO + 1),
    snpindels: [], track_layers: [], annotations: []
});
const snp = (offset, ref, alt) => ({ xi: LO + offset, reference: ref, alternate: alt, type: 'SNV' });

(async () => {
    const CAT = await load('baja/bio/rna/nucleotide-motif-catalog.js');
    ok(CAT.size >= 12, 'the catalogue has the named elements in it: ' + CAT.size);
    ok(CAT.scan('GGAATAAAGG').some((h) => h.motif === 'PAS_AAUAAA'),
       'a polyadenylation signal is found');
    ok(CAT.scan('ACGUACGU').length >= 0 && CAT.clean('ACGUU') === 'ACGTT',
       'U is read as T, so a message can be scanned as written');
    // Overlapping instances are all found: elements overlap and taking only the leftmost
    // would hide the one a variant touched.
    ok(CAT.scan('TATTTATTTATT').filter((h) => h.motif === 'ARE_pentamer').length >= 2,
       'overlapping instances are all found');

    // ---- A VARIANT THAT CREATES A POLYADENYLATION SIGNAL --------------------------------
    // AATAACG at offset 38: changing the C to an A makes AATAAA.
    ok(SEQ.slice(38, 45) === 'TAATAAC', 'the fixture reads as expected: ' + SEQ.slice(38, 45));
    let t = mkTrack();
    t.snpindels = [snp(44, 'C', 'A')];
    let r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(r.ok, 'the comparison runs');
    const gainedNames = r.gained.map((h) => h.elm);
    ok(gainedNames.indexOf('PAS_AAUAAA') >= 0,
       'the variant is reported as creating a polyadenylation signal: ' + gainedNames.join(', '));
    const pas = r.gained.filter((h) => h.elm === 'PAS_AAUAAA')[0];
    ok(pas.start === LO + 39 && pas.end === LO + 44,
       'in the track’s own coordinates: ' + pas.start + '–' + pas.end);
    ok(pas.peptide === 'AATAAA', 'with the sequence that matched: ' + pas.peptide);
    ok(/g\.1044 C>A/.test(pas.variant), 'and which variant made it: ' + pas.variant);
    ok(pas.score === null, 'and no score, because there is no model behind these patterns');
    ok(r.motifs.some((h) => h.elm === 'ARE_pentamer'),
       'what the reference already carried is reported too, as the background');
    ok(r.meta.caveats.some((c) => /PATTERN MATCHES/.test(c)),
       'the caveats say what a match is');
    ok(r.meta.caveats.some((c) => /Nothing here is scored/.test(c)),
       'and what the missing score means');
    ok(r.meta.units === 'nt' && r.meta.origin === LO,
       'the payload says which alphabet and where position 1 is');

    // ---- A VARIANT THAT DESTROYS ONE ---------------------------------------------------
    // The ARE pentamer ATTTA sits at offset 16.
    ok(SEQ.slice(16, 21) === 'ATTTA', 'the pentamer is where expected: ' + SEQ.slice(16, 21));
    t = mkTrack();
    t.snpindels = [snp(18, 'T', 'G')];
    r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(r.lost.some((h) => h.elm === 'ARE_pentamer'),
       'a variant that breaks an element is reported as destroying it: '
       + r.lost.map((h) => h.elm).join(', '));
    ok(r.lost[0].variant && /g\.1018/.test(r.lost.filter((h) => h.elm === 'ARE_pentamer')[0].variant),
       'named with the variant that did it');

    // ---- WHAT IS REFUSED ----------------------------------------------------------------
    // A reference base that does not match the track is the one that must never be
    // guessed at: everything downstream would be a comparison against a sequence this
    // track does not have.
    t = mkTrack();
    t.snpindels = [snp(44, 'G', 'A')];
    said.length = 0;
    r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(!r.ok && r.why === 'nothing comparable', 'a mismatched reference base stops the comparison');
    ok(/the track reads C there, not G/.test(said.join(' ')),
       'and says what the track actually reads: ' + said.join(' '));

    t = mkTrack();
    said.length = 0;
    r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(!r.ok && r.why === 'no variants', 'a track with no variants is refused by name');

    // One good variant among bad ones still runs, and the ones left out are named.
    t = mkTrack();
    t.snpindels = [snp(44, 'C', 'A'), snp(5000, 'A', 'T')];
    r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(r.ok && r.meta.compared === 1 && r.meta.skipped.length === 1,
       'the comparable variants are compared and the rest are listed: '
       + JSON.stringify(r.meta.skipped));
    ok(r.meta.caveats.some((c) => /were not compared/.test(c)),
       'with that carried into the caveats, not left on screen only');

    // ---- THE MINUS STRAND ----------------------------------------------------------------
    // reference and alternate are written on the plus strand; the elements are on the
    // message. Scanning the stored strand would find elements that are not in the
    // transcript and miss the ones that are.
    t = mkTrack(-1);
    t.snpindels = [snp(44, 'C', 'A')];
    r = await load('baja/bio/rna/nucleotide-motif-impact.js', graph, t, {});
    ok(r.ok, 'a minus-strand gene is compared too');
    ok(!r.gained.some((h) => h.elm === 'PAS_AAUAAA'),
       'and the plus-strand signal is NOT reported, because it is not in the message');
    ok(r.meta.caveats.some((c) => /minus strand/.test(c)), 'which the caveats say');

    // ---- THE QUESTION ASKED BEFORE EITHER HALF RUNS --------------------------------------
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/const clarify = \(text\)/.test(caps) && /clarify: clarify/.test(caps),
       'the catalogue can ask a question of its own');
    ok(/name: 'nucleotide_motif_impact'/.test(caps), 'and the nucleotide half is a capability');
    // Driven, not asserted from the source: the sentence that started this has to be the
    // one that asks, and a sentence that already says which alphabet must not.
    const CAP = await load('baja/manchester/menu/editor-capabilities.js',
        { track: [], setMessage: () => { }, setResultMessage: () => { } }, {});
    const c = CAP.clarify('what motifs are created from the variants on the screen');
    ok(!!c && c.options.length === 2, 'the sentence that started this asks which alphabet');
    ok(/Peptide motifs/.test(c.options[0].label)
       && /Sequence elements/.test(c.options[1].label),
       'offering both halves: ' + c.options.map((x) => x.label).join(' | '));
    ok(c.options[0].capability.name === 'motif_impact_report'
       && c.options[1].capability.name === 'nucleotide_motif_impact',
       'each wired to the half it names');
    ok(/UTR or an intron/.test(c.options[1].detail),
       'and the nucleotide one says when it is the only half there is');
    ok(!CAP.clarify('what peptide motifs do these variants create'),
       'a sentence that says peptide is not asked again');
    ok(!CAP.clarify('what rna elements does this variant change'),
       'nor one that says RNA');
    ok(!CAP.clarify('show the linear motifs on this track'),
       'nor a request to draw motifs, which is a layer and already understood');
    ok(!CAP.clarify('load clinvar pathogenic snps'), 'and an unrelated request goes straight on');

    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/CAP\.clarify \? CAP\.clarify\(ask\) : null/.test(cmd)
       && /renderChoice\(c, ask\); return;/.test(cmd),
       'the command bar asks it before planning');
    ok(/logged\(\{ ask: ask, status: 'OK',\s*\n?\s*steps: \[\{ capability: o2\.capability\.name/.test(cmd)
       || /capability: o2\.capability\.name/.test(cmd),
       'and the answer is what the log keeps, so running it again runs the half that was chosen');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();

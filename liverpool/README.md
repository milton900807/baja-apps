# Liverpool — neoantigen designer

Design the peptides a tumour's mutations present, then design the mRNA that carries them.

Liverpool is a sibling of `manchester/` inside the same application. Manchester designs
oligonucleotides against a transcript. Liverpool designs a transcript against an immune
system. They share the file drive, the save conventions and the look, and no code.

```
exec('liverpool/editor')                        start a new design
exec('liverpool/editor', '/…/design.liverpool') open a saved one
```

It is also on the applications menu as **Neoantigen Designer**, and a `.liverpool` file
clicked in My Files opens here rather than in the track editor.

---

## Read this first

The built-in binding predictor is a **motif screen**, not a trained predictor.

It scores each peptide against the published anchor motifs of the allele — the
SYFPEITHI-style method — and reports the result as a percentile rank against a background
of random peptides drawn from human amino-acid frequencies. The conventional thresholds
carry over: 0.5% strong, 2% weak.

It contains no training data. It is not NetMHCpan, MHCflurry or anything like them. It will
rank an obvious binder highly and it will miss the non-obvious ones, and **its ranks are not
affinities**.

Use it as a screen: to sort a mutation list, to see the shape of a repertoire, to catch a
junctional epitope while you are still editing the cassette. Before anything is synthesised,
re-rank the shortlist with a trained predictor. One line switches the whole folder over:

```js
const HLA = await exec('liverpool/lib/hla.js');
HLA.setExternalPredictor(async (allele, peptides) => {
    // return one {rank} per peptide, rank as a percentile
});
```

Every row then carries `source: 'external'` instead of `source: 'motif'`, in the table and
in the exported report, so nobody can mistake one for the other after the fact.

---

## The five steps

The tabs are the antigen-processing pathway in order, because that order is what decides
whether any of it works.

**1 · Patient & HLA.** The alleles the response will be restricted by. Normally six class I
alleles; class II is optional and its motifs here are weaker, which the editor says on the
tab. A dashed chip marks an allele whose motif is poorly described.

**2 · Mutations.** Gene, protein change, the wild-type protein sequence, and optionally the
variant allele frequency and expression. Protein sequences can be fetched by gene symbol or
Ensembl ID from Ensembl, or by accession from UniProt.

A change is **checked against the protein before it is applied**. If the sequence does not
have the stated residue at the stated position the row is refused, not mutated anyway.
Nearly every silently wrong neoantigen list starts with a coordinate that did not mean what
the pipeline assumed — a different isoform, a transcript-numbered position, an off-by-one.

Supported: missense, nonsense, in-frame deletion, insertion and delins, frameshift (with the
novel downstream peptide supplied, because it cannot be derived from the protein alone), and
a bare mutant/wild-type peptide pair for people arriving from a pipeline that already did
this step.

**3 · Candidates.** Every peptide of the chosen lengths that overlaps a novel residue, taken
through the pathway:

| Step | What is asked | Where |
|---|---|---|
| Enumerate | does the peptide contain the mutation at all | `lib/epitope.js` |
| Cleave | will the proteasome cut at its C-terminus | `lib/epitope.js` |
| Transport | will TAP carry it into the ER | `lib/epitope.js` |
| Bind | does it bind one of the subject's alleles | `lib/hla.js` |
| Discriminate | does it bind *better* than the wild-type it replaced | `lib/epitope.js` |
| Self-check | does it occur in the background proteome anyway | `lib/epitope.js` |

The C-terminal cut is weighted and the N-terminus barely, because the proteasome makes the
C-terminal cut and ERAP1 trims the N-terminus afterwards in the ER. That asymmetry is real
and it decides which end has to be right.

**Agretopicity** — the wild-type rank over the mutant rank — is reported per candidate and
never used as a silent filter. A mutant that binds no better than the self peptide the
thymus already tolerised against is the classic false positive of this field; but some real
neoantigens work through a changed TCR contact rather than a changed anchor, and an
agretopicity cut-off throws those away. The editor labels which of the two happened.

**4 · Construct.** The epitopes are strung together with a linker, optionally behind a
leader and in front of a trailer. Assembly is trivial; what this step exists for is the
three things assembly does to epitopes that were chosen one at a time.

*Junctions create epitopes.* Every seam is a stretch of sequence that exists in no protein
anywhere, and some of those bind the subject's own HLA. A junctional neoepitope competes with
the real ones for presentation and for the response, and it is invisible unless something
goes looking. Every seam-spanning window is scanned against the design's own alleles.

*Context changes release.* An epitope's C-terminal cut depends on the residue after it,
which in the cassette is the first residue of the next linker — not whatever followed it in
the source protein. Put a proline there and the epitope is never released. Each epitope's
cleavage score is recomputed in place and compared with its score alone.

*Order matters.* Since both effects depend on neighbours, ordering is a design variable.
"Search for a better order" runs a greedy pass. It is a heuristic and is labelled as one;
the junction scan is re-run on the final cassette regardless, so the report describes the
construct that exists rather than the search that produced it.

**5 · Output.** The protein cassette coloured by part, the coding sequence, the full
transcript, and a plain-text design report. Exports: report (`.txt`), transcript and cassette
(`.fasta`), all candidates with every intermediate score (`.csv`).

---

## Codon optimisation

`lib/genetic-code.js` reverse-translates with human codon usage, then **repairs** the
result: forbidden motifs and over-long homopolymers are recoded by swapping synonymous
codons that overlap them. Four strategies:

| Mode | What it does | When |
|---|---|---|
| `balanced` | samples human usage, seeded so it is reproducible | the default |
| `cai` | the most-used codon everywhere | maximum CAI, worst to synthesise |
| `low-u` | fewest U per codon above a usage floor | modified-nucleoside transcripts |
| `gc-rich` | G/C wobble above a usage floor | duplex stability |

Removed automatically where a synonymous codon allows: `AAUAAA` and `AAUUAA` poly(A)
signals inside the coding sequence, EcoRI, BamHI, HindIII, XbaI, NotI, BsaI, BbsI and SapI
sites on both strands, and homopolymer runs longer than six.

**What cannot be recoded is reported, not hidden.** A run of lysines has only `AAA` and
`AAG` to work with and both end in A; when no synonymous swap clears a hit, the hit appears
in the QC list saying so. A QC report that lies is worse than no report.

---

## Provenance and the verify gate

Reference parts — signal peptides, the MHC trafficking domain, the beta-globin UTRs — carry
their source record and a `verify` flag. The editor shows those in a warning, and **holds
the export** until the designer ticks to say they have checked them against the source.

That is not paperwork. A signal peptide transcribed one residue wrong still looks exactly
like a signal peptide on screen, and the first time anyone finds out is after the synthesis
run.

---

## About the reference this was built from

The page supplied with the request, <https://www.ncbi.nlm.nih.gov/books/NBK2264/>, is
**"Blood group antigens are surface markers on the red blood cell membrane"**, chapter 2 of
Dean L., *Blood Groups and Red Cell Antigens* (NCBI Bookshelf, 2005). It is about ABO and Rh
antigens on erythrocytes. It contains nothing about MHC, epitopes, the proteasome, peptide
loading or vaccines.

What it does supply is the framing this tool is built on, and the reason step 5 and step 6
of the candidate pipeline exist at all: an antigen is anything the immune system can respond
to; self antigens are tolerated and foreign ones are attacked; everything turns on which is
which. A neoantigen is exactly the case where a single substitution moves a peptide across
that line, and the two hardest questions in the pipeline — does the mutant really look
different from the wild-type it replaced, and does it occur in the normal proteome anyway —
are that same distinction asked twice.

The pathway modelled here — proteasome, TAP, MHC binding, agretopicity, junctional
epitopes — comes from the antigen-processing and neoantigen literature, not from that
chapter.

---

## Files

```
liverpool/
  editor.js               the editor: five tabs, the whole flow
  README.md               this file
  lib/
    genetic-code.js       codon table, human usage, CAI, reverse translation with repair
    hla.js                allele motifs, percentile ranks, the external-predictor hook
    mutation.js           HGVS protein changes, applied only when the reference matches
    epitope.js            enumeration, cleavage, TAP, agretopicity, ranking
    construct.js          cassette assembly, junction scan, context check, transcript QC
    presets.js            linkers, leaders, UTRs, tails — each with its provenance
  io/
    store.js              .liverpool documents, saved to and read from My Files
```

Every module is a plain lionscript function expression and can be `exec`'d on its own.
`lib/genetic-code.js` is the one file in the folder with no immunology in it, deliberately,
so it can be read and checked by itself.

## What a saved design contains

The inputs and the decisions: protein sequences, mutations, HLA type, which candidates were
picked and in what order, construct settings.

**Not the scores.** Those are a pure function of the inputs and of this code's version, and
a stored score would go stale silently the first time a motif or a weight is corrected.
Reopening a design recomputes, which is the only way the numbers on screen can be trusted to
be the numbers this code produces.

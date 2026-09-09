# Tottenham — mRNA designer

Design a transcript that survives long enough to do its job, and decide whether it should
copy itself.

Third editor in the same application. Manchester designs oligonucleotides against a
transcript. Liverpool designs *what* a transcript should encode. Tottenham designs the
transcript itself. It borrows `liverpool/lib/genetic-code.js`, the shared sequence layer,
and shares nothing else.

```
exec('tottenham/editor')                          a new design
exec('tottenham/editor', '/…/design.tottenham')   an existing one
```

Also on the applications menu and in the My Files **Apps** dropdown as **mRNA Designer**. A
`.tottenham` file clicked in My Files opens here.

---

## The two things it is for

**Half-life.** Almost everything that sets an mRNA's life is a short sequence a protein or a
small RNA binds, plus the chemistry of the cap and the uridines. The editor scans for those
sequences, tells you which direction each one pushes, and recodes the ones it can.

**Replicons.** A self-amplifying RNA carries its own replicase and copies itself, cutting the
dose by one to two orders of magnitude. It also takes away most of the half-life toolkit. The
editor knows which combinations are contradictory and says so before you build.

---

## Codon choice is a shortest path, not a per-codon decision

This is the part worth understanding, because it is where the editor differs from every other
codon tool in the building.

Everything worth avoiding in a coding sequence is a property of a short **window** of bases,
not of a codon: a CpG dinucleotide, a DRACH pentamer, a poly(A) signal, a homopolymer run.
Most of them straddle codon boundaries. Choose each codon independently — which is what
`liverpool/lib/genetic-code.js` does, and what most tools do — and you pick a codon ending in
C, then a codon starting with G, and create a CpG that neither codon contained.

So `lib/optimiser.js` solves it properly:

| | |
|---|---|
| **state** | the last 5 bases written |
| **move** | one of the synonymous codons for the next residue |
| **cost** | codon usage, plus every k-mer (k = 2…6) the move newly completes |

The cheapest sequence is a shortest path through that chain. The result is the **global
optimum** for every objective expressible in six bases — CpG, UpA, DRACH, both poly(A)
signals, the common six-cutter sites, homopolymer runs. Nothing iterates, nothing converges,
there is no random seed.

Measured on a 139-residue antibody variable domain:

| Method | CpG dinucleotides | CAI |
|---|---|---|
| Per-codon, maximum usage | 36 | 1.000 |
| Shortest path, "quiet" objective | 0 | 0.913 |

Motifs longer than six bases (NotI at eight, SapI at seven) cannot be scored by a five-base
state and go through a repair pass afterwards. **Anything the repair pass cannot clear is
reported, not hidden.**

Five objectives ship: maximise expression, longer half-life, least innate sensing, replicon
payload, human-like. Each says what it is *for*, because the right one depends entirely on
what the construct has to do.

---

## Frozen regions

In a self-amplifying construct the subgenomic promoter spans the transcription start, so its
last bases **are** the first bases of the payload. Recode them and the promoter is damaged.

`lib/replicon.js` computes that window and hands it to the optimiser as a frozen range. Frozen
codons are pinned, the optimiser routes around them, and the result is **checked** afterwards
rather than assumed — a frozen range that quietly moved would be the worst failure available
here, because the construct would still look right.

---

## What the editor refuses to let you do

The compatibility rules in `lib/replicon.js` are the most useful thing in the folder. The
headline one:

> **A modified nucleoside cannot be used with a cis self-amplifying RNA.** The replicase has
> to read the molecule as a template and copy it, and N1-methylpseudouridine interferes with
> that. The copies it makes would be unmodified anyway, so the modification protects only the
> first round.

That is not a trade-off to tune, it is a contradiction, and choosing both is reported as one.
Others: nothing may sit between the 3ʹ conserved element and the poly(A); a replicon needs a
tail of at least ~40 nt for minus-strand synthesis; Cap 0 on a replicon compounds an
interferon problem it already has; CpG depletion buys little when the frozen viral replicase
in the same molecule is CpG-rich.

**Sequences are slots, not presets.** The editor ships **no** replicase or conserved-element
sequence. Those are thousands of bases of virus-derived sequence that a group either has
validated in-house or takes from a specific record, and a plausible-looking approximation of
one would be the most dangerous thing in this editor. Each is an empty slot describing what
belongs in it; everything around it is then validated.

---

## The model registry

This is the part designed to be replaced.

Half-life, expression and innate sensing are all things people are building trained
predictors for, and the three shipped here are **not** among them. They are transparent
additive scores over individually well-supported features, decomposed on screen so you can
see what moved them and disagree with the weights. They report a relative index. **None of
them reports hours, because none of them knows hours.**

Every number the editor shows comes from a registered model. Adding a real one is one call
and no other change:

```js
const M = await exec('tottenham/lib/models.js');
M.register({
    id: 'halflife-xgb-2026',
    name: 'Half-life, gradient boosted (internal v3)',
    kind: 'half-life',            // half-life | expression | innate-sensing | structure
    unit: 'hours',
    trained: true,
    provenance: 'SLAM-seq, HEK293, n=8412, held-out r=0.71',
    needs: ['cds', 'utr3'],
    supersedes: 'halflife-composite',
    predict: async (ctx) => ({ value: 14.2, confidence: 'medium',
        contributions: [{ feature: 'ARE load', delta: -2.1, why: '…' }] })
});

// or a service
M.registerRemote({ id: 'hl-api', name: 'Half-life API', kind: 'half-life',
                   trained: true, url: 'https://…/predict' });
```

`supersedes` is what makes the swap clean: the editor demotes the model being replaced, so a
baseline stops being the headline the moment something better is registered, without anyone
editing a template. Models are third-party code by design and are wrapped — a throw becomes a
reported error, a missing input becomes "not applicable", a hang is cut off at 15 seconds.

`predict` receives `{utr5, cds, utr3, protein, polyA, capType, nucleoside, architecture, scan}`
where `scan` is a pre-computed element scan.

---

## Structure

`lib/structure.js` is a **hairpin finder**, not a folding algorithm. It scores stems with
Turner nearest-neighbour parameters and charges the standard loop penalty. It does not compute
a minimum free energy structure and will not reproduce ViennaRNA — a real fold is an O(n³)
dynamic program and belongs in a registered model.

It is still worth having, because the two places structure demonstrably decides output are
both local and both next to a known landmark: the first ~40 bases, where a stable hairpin
blocks 43S loading, and the window around the start codon.

---

## Region awareness

An AUUUA in a 3ʹ UTR is an AU-rich element. The same five bases inside a coding sequence are
three-quarters of a codon pair and mean nothing. Every element in `lib/elements.js` declares
the regions it is real in and is only reported there, because a scanner that reports both
produces a page of findings people learn to ignore.

CpG and DRACH are reported as **density** — observed over expected, and sites per kilobase —
never as a list. A raw CpG count conflates suppression with GC content, and DRACH occurs about
once every 60 bases by chance.

miRNA sites are reported as a different kind of finding, because they are **dual use**: you
remove them from a construct meant to express everywhere, and you add them on purpose to
switch one off in a tissue. A miR-142-3p site silences the construct in haematopoietic cells;
miR-122 does it in hepatocytes. The seeds ship with a verify flag and should be checked
against miRBase.

---

## Files

```
tottenham/
  editor.js             six tabs: payload, half-life, replicon, models, assembly, output
  README.md             this file
  lib/
    elements.js         the cis-element catalogue and a region-aware scanner
    structure.js        nearest-neighbour local hairpin search
    optimiser.js        dinucleotide-aware codon choice as a shortest path
    replicon.js         architectures, frozen windows, compatibility rules
    models.js           the model registry — the extension point
    parts.js            caps, nucleosides, UTRs, tails, with provenance
  io/
    store.js            .tottenham documents, in My Files
```

Depends on `liverpool/lib/genetic-code.js` for the codon table, human usage, CAI and
translation. That module has no immunology and no half-life logic in it, which is why it is
shared rather than copied.

## What a saved design contains

The inputs and the decisions. **Not the scores.** Every number is a pure function of the
inputs and of the model registry as it stood when the button was pressed, and the entire point
of that registry is that better models get added to it. A stored half-life index would be a
number from a model that no longer exists, sitting in a file that does not say so. Reopening
recomputes with whatever is registered now, which is the only behaviour that stays honest as
the models improve.

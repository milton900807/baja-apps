"""Is this a cryptic-site detector rather than a regulatory-element detector?

LMNA c.1824C>T (progeria) scores 16.9 logits; SMN2 c.840C>T scores 2.7 and sits
inside the benign distribution. LMNA CREATES a cryptic 5' splice site. SMN2
modulates an existing exon through an ESE/ESS and creates nothing. If that is
the split, the 0.79 AUC on regulatory variants is a mixture of near-100%
detection on one half and near-0% on the other, which is a very different thing
from uniform mediocrity -- and it says exactly what fine-tuning data is needed.
"""
import numpy as np
from sklearn.metrics import roc_auc_score
from bajasplice.validate.datasets import load_clinvar
from bajasplice.scan import load_splicenet
from bajasplice.variants import delta_score
from bajasplice.genome import GenomeReader

df = load_clinvar(max_per_class=400)
sub = df[df.cls.isin(["pathogenic_synonymous", "benign_synonymous"])].reset_index(drop=True)
g = GenomeReader(); m, ctx, dev = load_splicenet()

P = []
for r in sub.itertuples(index=False):
    best = None
    for st in ("+", "-"):
        d = delta_score(m, ctx, r.chrom, int(r.pos), r.ref, r.alt, dev,
                        strand=st, window=50, genome=g)
        if best is None or d["delta"] > best["delta"]:
            best = d
    P.append(best["delta"])
P = np.array(P)
y = (sub.cls == "pathogenic_synonymous").astype(int).values

print("distribution of max delta (probability scale):")
print("  %-26s %-8s %-8s %-8s" % ("", "n", "<0.1", ">0.5"))
for name, msk in (("pathogenic synonymous", y == 1), ("benign synonymous", y == 0)):
    v = P[msk]
    print("  %-26s %-8d %-8.3f %-8.3f" % (name, len(v), (v < 0.1).mean(), (v > 0.5).mean()))

# SPLIT BY SEQUENCE, NOT BY THE SCORE. A first version split on delta > 0.5 and
# then measured the AUC of delta inside each half, which attenuates it by
# construction and is not comparable to the overall figure. Whether the variant
# creates or destroys a canonical GT or AG is a property of the sequence, so it
# partitions the set without touching the thing being evaluated.
def makes_or_breaks(chrom, pos, ref, alt):
    """Does this substitution create or destroy a GT or an AG dinucleotide?"""
    w = "".join("NACGT"[int(v)] for v in g.codes(chrom, pos - 1, pos + 1, "+"))
    if len(w) < 3:
        return False
    before = w
    after = w[0] + alt + w[2]
    di = lambda s: {s[0:2], s[1:3]}
    canon = {"GT", "AG"}
    return bool((di(after) & canon) ^ (di(before) & canon))


site = np.array([makes_or_breaks(r.chrom, int(r.pos), r.ref, r.alt)
                 for r in sub.itertuples(index=False)])
print("\nsplitting by SEQUENCE: does the substitution make or break a GT/AG?")
for name, msk in (("makes/breaks GT-AG", site), ("leaves dinucleotides", ~site)):
    if msk.sum() < 20 or len(set(y[msk])) < 2:
        print("  %-16s n=%d  (one class only)" % (name, msk.sum())); continue
    print("  %-16s n=%-5d pathogenic %-5d  AUC %.4f"
          % (name, msk.sum(), int(y[msk].sum()), roc_auc_score(y[msk], P[msk])))

print("\nthe second row is the honest one: these variants create no canonical")
print("dinucleotide, so whatever the model scores there is regulatory signal,")
print("not site recognition. SMN2 and MAPK8IP3 R578C both live in that row.")
print("\noverall AUC %.4f  (for reference)" % roc_auc_score(y, P))
print("fraction of PATHOGENIC synonymous that make/break a GT-AG: %.2f" % site[y == 1].mean())
print("fraction of BENIGN that do:                                %.2f" % site[y == 0].mean())

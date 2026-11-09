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

site = P > 0.5          # the variant makes or breaks a site
print("\nsplitting on whether a site is created or destroyed (delta > 0.5):")
for name, msk in (("site-changing", site), ("no site change", ~site)):
    if msk.sum() < 20 or len(set(y[msk])) < 2:
        print("  %-16s n=%d  (one class only)" % (name, msk.sum())); continue
    print("  %-16s n=%-5d pathogenic %-5d  AUC %.4f"
          % (name, msk.sum(), int(y[msk].sum()), roc_auc_score(y[msk], P[msk])))

print("\nif the model were a general regulatory detector, the 'no site change'")
print("subset would still separate. If it is a cryptic-site detector, it will not.")
print("\noverall AUC %.4f  (for reference)" % roc_auc_score(y, P))
print("fraction of PATHOGENIC synonymous that change a site: %.2f" % site[y == 1].mean())
print("  -> that fraction is the ceiling on what this model can ever catch here")

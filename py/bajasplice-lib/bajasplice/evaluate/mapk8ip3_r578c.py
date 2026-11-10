"""MAPK8IP3 c.1732C>T (p.Arg578Cys), GRCh38 chr16:1,762,843 -- splicing?

The cDNA numbering is contested (c.1732 / c.1714 / MANE c.1735), so everything
here is anchored on the genomic coordinate, which is not.
"""
import json, os, numpy as np, torch
from bajasplice.genome import GenomeReader
from bajasplice.scan import load_splicenet, scan_region
from bajasplice.variants import delta_score, variant_tracks

CHROM, POS = "chr16", 1762843
LO, HI = POS - 4000, POS + 4000

g = GenomeReader()
m, ctx, dev = load_splicenet()

ref = "".join("NACGT"[int(v)] for v in g.codes(CHROM, POS, POS, "+"))
ctxseq = "".join("NACGT"[int(v)] for v in g.codes(CHROM, POS - 5, POS + 5, "+"))
print("reference base at %s:%d = %s        context %s[%s]%s"
      % (CHROM, POS, ref, ctxseq[:5], ctxseq[5], ctxseq[6:]))
if ref != "C":
    print("  !! expected C for a C>T variant; check the coordinate before reading on")
alt = "T"

# where are the splice sites, and how far is the variant from them?
r = scan_region(m, ctx, CHROM, LO, HI, "+", dev)
acc, don = (r if isinstance(r, tuple) else (r["acceptor"], r["donor"]))[:2]
A = [LO + i for i in np.where(acc >= 0.5)[0]]
D = [LO + i for i in np.where(don >= 0.5)[0]]
up_a = max([p for p in A if p <= POS], default=None)
dn_d = min([p for p in D if p >= POS], default=None)
print("\nnearest acceptor upstream : %s  (%s nt before the variant)"
      % (up_a, POS - up_a if up_a else "?"))
print("nearest donor downstream  : %s  (%s nt after the variant)"
      % (dn_d, dn_d - POS if dn_d else "?"))
if up_a and dn_d:
    print("so the variant sits in an exon of ~%d nt, %d nt from its 3' end"
          % (dn_d - up_a - 1, dn_d - POS))

# the variant's effect
best = None
for st in ("+", "-"):
    d = delta_score(m, ctx, CHROM, POS, ref, alt, dev, strand=st, window=50, genome=g)
    print("\nstrand %s: acceptor gain %.4f loss %.4f | donor gain %.4f loss %.4f"
          % (st, d["acceptor_gain"], d["acceptor_loss"], d["donor_gain"], d["donor_loss"]))
    print("          max delta %.4f   logit delta %.3f" % (d["delta"], d.get("logit_delta", 0)))
    if best is None or d["delta"] > best["delta"]:
        best = d

cal = os.path.join(os.path.dirname(__import__("bajasplice").__file__),
                   "weights", "delta_calibration.json")
if os.path.isfile(cal):
    c = json.loads(open(cal).read())
    print("\nagainst the calibrated operating points:")
    for key, blk in (c.get("by_class") or {"disruption": c}).items():
        ops = blk.get("operating_points", [])
        opl = blk.get("operating_points_logit", [])
        hp = next((x for x in ops if best["delta"] >= x["delta"]), None)
        hl = next((x for x in opl if best.get("logit_delta", 0) >= x["delta"]), None)
        print("  %-12s AUC %-7s  probability: %s   logit: %s"
              % (key, blk.get("auc_logit", blk.get("auc", "?")),
                 ("FPR <= %.2f" % hp["fpr"]) if hp else "below every point",
                 ("FPR <= %.2f" % hl["fpr"]) if hl else "below every point"))

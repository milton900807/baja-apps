"""Which exon is chr16:1,762,843 in? Counted, not recalled.

Exon numbering depends on the transcript and on whether you count from the
first exon or the first CODING exon, so this reports the model-derived exon
structure and the index of the one containing the variant, both ways.
"""
import numpy as np
from bajasplice.scan import load_splicenet, scan_region

CHROM, POS = "chr16", 1762843
LO, HI = 1700000, 1800000          # generous span around the gene

m, ctx, dev = load_splicenet()
r = scan_region(m, ctx, CHROM, LO, HI, "+", dev)
acc, don = (r if isinstance(r, tuple) else (r["acceptor"], r["donor"]))[:2]

A = sorted(LO + i for i in np.where(acc >= 0.5)[0])
D = sorted(LO + i for i in np.where(don >= 0.5)[0])
print("acceptors found: %d   donors found: %d" % (len(A), len(D)))

# pair them into exons: acceptor then the next donor after it
exons = []
for a in A:
    d = next((x for x in D if x > a), None)
    if d is not None:
        exons.append((a + 1, d - 1))          # exon spans acceptor+1 .. donor-1
exons = [e for e in exons if e[1] > e[0]]
# the first exon has no acceptor; add a leading donor-only exon if one precedes
lead = [d for d in D if not A or d < A[0]]
print("paired internal exons: %d  (plus %d leading donor(s) with no acceptor)"
      % (len(exons), len(lead)))

hit = None
for i, (s, e) in enumerate(exons):
    if s <= POS <= e:
        hit = i
        break

print("\nexon containing %s:%d" % (CHROM, POS))
if hit is None:
    print("  NOT inside any paired exon -- the variant may be in a first/last exon")
else:
    s, e = exons[hit]
    print("  span %d-%d  (%d nt)" % (s, e, e - s + 1))
    print("  position within the exon: +%d from its 5' end" % (POS - s + 1))
    print("  index among PAIRED internal exons: %d" % (hit + 1))
    print("  if a leading exon exists, add %d -> exon %d" % (len(lead), hit + 1 + len(lead)))

print("\nfirst 8 and last 4 exons found, for sanity:")
for i, (s, e) in enumerate(exons[:8]):
    mark = "   <-- the variant" if i == hit else ""
    print("  %2d  %d-%d  (%d nt)%s" % (i + 1, s, e, e - s + 1, mark))
print("  ...")
for i, (s, e) in list(enumerate(exons))[-4:]:
    print("  %2d  %d-%d  (%d nt)" % (i + 1, s, e, e - s + 1))

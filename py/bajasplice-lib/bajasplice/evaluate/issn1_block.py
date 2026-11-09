"""ISS-N1, done properly.

The first attempt substituted scrambled sequence and got donor values from 0.037
to 0.996 across twelve shuffles: a mononucleotide shuffle 10 nt from a real
donor invents cryptic GTs, so the perturbation was creating new elements rather
than removing one.

Two fixes. MASKING (N) is the right in-silico analogue of an ASO: nusinersen
occludes ISS-N1, it does not rewrite it, and N removes information without
adding a motif. And where sequence must be changed, a DINUCLEOTIDE shuffle
preserves GT/AG frequencies and so invents far fewer spurious sites. The
distribution is reported, not just a mean.
"""
import numpy as np, torch, random
from bajasplice.genome import GenomeReader, one_hot
from bajasplice.scan import load_splicenet

CHROM = "chr5"
EX7_END = 70076574
TARGET = "CCAGCATTATGAAAGTGA"
LO = 70076584                      # verified: intron 7 +10

g = GenomeReader()
m, ctx, dev = load_splicenet()
CODE = {"A": 1, "C": 2, "G": 3, "T": 4, "N": 0}


def donor(mut=None, lo=LO):
    half = ctx // 2
    a, b = EX7_END - 200, EX7_END + 400
    codes = g.codes(CHROM, a - half, b + half, "+").astype(np.int64)
    if mut is not None:
        off = lo - (a - half)
        for k, ch in enumerate(mut):
            codes[off + k] = CODE.get(ch, 0)
    x = torch.from_numpy(one_hot(codes)[None]).to(dev)
    with torch.no_grad():
        p = torch.softmax(m(x).float(), 1)[0].cpu().numpy()
    return float(p[2, EX7_END + 1 - a])


def dinuc_shuffle(s, rng):
    edges = {}
    for x, y in zip(s, s[1:]):
        edges.setdefault(x, []).append(y)
    first, last = s[0], s[-1]
    verts = list(edges)
    for _ in range(200):
        lastedge = {v: rng.choice(edges[v]) for v in verts if v != last}
        ok = True
        for v in verts:
            seen, cur = set(), v
            while cur != last:
                if cur in seen or cur not in lastedge:
                    ok = False; break
                seen.add(cur); cur = lastedge[cur]
            if not ok: break
        if ok: break
    rest = {}
    for v in verts:
        pool = list(edges[v])
        if v in lastedge: pool.remove(lastedge[v])
        rng.shuffle(pool)
        if v in lastedge: pool.append(lastedge[v])
        rest[v] = pool
    out, cur, idx = [first], first, {v: 0 for v in verts}
    while idx.get(cur, 0) < len(rest.get(cur, [])):
        nxt = rest[cur][idx[cur]]; idx[cur] += 1
        out.append(nxt); cur = nxt
    return "".join(out)


ref = donor()
print("exon 7 donor, reference                 : %.5f" % ref)

masked = donor("N" * len(TARGET))
print("exon 7 donor, ISS-N1 MASKED (the ASO)   : %.5f   change %+.5f"
      % (masked, masked - ref))

rng = random.Random(0)
vals = np.array([donor(dinuc_shuffle(TARGET, rng)) for _ in range(40)])
print("\nISS-N1 dinucleotide-shuffled x40:")
print("  mean %.5f  median %.5f  min %.5f  max %.5f"
      % (vals.mean(), np.median(vals), vals.min(), vals.max()))
print("  fraction ABOVE the reference: %.2f   (a silencer being removed should raise it)"
      % (vals > ref).mean())

# CONTROL: the same perturbation applied somewhere with no known element,
# so "any change at all" is not mistaken for "this element matters".
ctrl_lo = EX7_END + 61
ctrl = np.array([donor(dinuc_shuffle(TARGET, rng), lo=ctrl_lo) for _ in range(40)])
print("\nsame perturbation at intron 7 +61 (no known element), x40:")
print("  mean %.5f  fraction above reference %.2f" % (ctrl.mean(), (ctrl > ref).mean()))
print("\nISS-N1 matters to the model only if its column differs from this one.")

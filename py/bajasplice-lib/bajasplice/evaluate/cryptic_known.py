#!/usr/bin/env python
"""Can the splice-site model find known TDP-43 cryptic exons?

Cryptic exons are unannotated by definition, so the PSI model (built on GENCODE
cassette events) cannot see them. The splice-site network can: it scores every
position of a pre-mRNA de novo.

The question asked here is not "what AUC" but "where do the true cryptic splice
sites rank among all intronic positions in their own gene". A model that finds
them should put them near the top of tens of thousands of candidates.

Ground truth:
  STMN2   from GENCODE v50, which now annotates the exon-2a cryptic event and
          v29 does not (so it is a genuine novel intronic exon, not my guess)
  UNC13A  Ma et al. Nature 2022, chr19:17,642,414-17,642,541 (128 bp) and the
          178 bp variant sharing the same 3' end
"""
import numpy as np, pandas as pd, torch, os, sys, json
from bajasplice.genome import GenomeReader, one_hot
from bajasplice.models import SpliceNet

from bajasplice.config import paths
CRYPTIC = [
    {"gene": "STMN2",  "chrom": "chr8",  "start": 79616822, "end": 79617207,
     "source": "GENCODE v50 novel intronic exon (absent in v29)"},
    {"gene": "UNC13A", "chrom": "chr19", "start": 17642414, "end": 17642541,
     "source": "Ma et al. Nature 2022, 128 bp"},
    {"gene": "UNC13A", "chrom": "chr19", "start": 17642414, "end": 17642591,
     "source": "Ma et al. Nature 2022, 178 bp variant"},
]


def gene_span(name, exons):
    g = exons[exons.gene_name == name]
    if g.empty:
        return None
    return g.chrom.iloc[0], int(g.start.min()), int(g.end.max()), g.strand.iloc[0]


@torch.no_grad()
def scan(model, context, chrom, start, end, strand, device, chunk=5000):
    g = GenomeReader()
    n = end - start + 1
    acc = np.zeros(n, np.float32); don = np.zeros(n, np.float32)
    c = context // 2
    for off in range(0, n, chunk):
        L = min(chunk, n - off)
        s = start + off
        codes = g.codes(chrom, s - c, s + L - 1 + c, strand)
        x = torch.from_numpy(one_hot(codes)[None]).to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
        if strand == "+":
            acc[off:off + L] = p[1, :L]; don[off:off + L] = p[2, :L]
        else:
            # this chunk was read reverse-complemented, so output index j maps to
            # genomic offset off + L - 1 - j. Reverse per chunk, never globally:
            # a single reverse at the end would scramble the chunk order.
            acc[off:off + L] = p[1, :L][::-1]; don[off:off + L] = p[2, :L][::-1]
    return acc, don      # indexed by genomic offset from `start`


def main():
    exons = pd.read_csv(os.path.join(paths().interim, "exons.tsv"), sep="\t", low_memory=False,
                        usecols=["chrom", "start", "end", "strand", "gene_name"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(os.path.join(paths().models, "ss_ctx2000.pt"), map_location="cpu", weights_only=False)
    model = SpliceNet(context=ck["args"]["context"], ch=ck["args"]["channels"]).to(device).eval()
    model.load_state_dict(ck["model"])
    context = ck["args"]["context"]

    out = []
    for gene in sorted({c["gene"] for c in CRYPTIC}):
        sp = gene_span(gene, exons)
        if sp is None:
            print(f"{gene}: not found"); continue
        chrom, gs, ge, strand = sp
        acc, don = scan(model, context, chrom, gs, ge, strand, device)
        ge_ = exons[exons.gene_name == gene]
        annot = set(ge_.start) | set(ge_.end)
        # intronic mask: positions not inside any annotated exon
        exonic = np.zeros(ge - gs + 1, bool)
        for s, e in zip(ge_.start, ge_.end):
            exonic[max(0, s - gs):max(0, e - gs + 1)] = True
        intronic = ~exonic
        print(f"\n=== {gene}  {chrom}:{gs:,}-{ge:,} ({strand})  "
              f"{ge-gs+1:,} nt, {intronic.sum():,} intronic ===", flush=True)

        # reference: how do annotated splice sites in this gene score?
        ann_d, ann_a = [], []
        tg = ge_.sort_values("start")
        for t in ge_.groupby("gene_name"):
            pass
        starts = sorted(set(ge_.start)); ends = sorted(set(ge_.end))
        for e in ends:
            p = e + 1 if strand == "+" else e + 1
            i = p - gs
            if 0 <= i < len(don):
                (ann_d if strand == "+" else ann_a).append(don[i] if strand == "+" else acc[i])
        for s in starts:
            p = s - 1
            i = p - gs
            if 0 <= i < len(acc):
                (ann_a if strand == "+" else ann_d).append(acc[i] if strand == "+" else don[i])
        print(f"  annotated sites in this gene: median donor {np.median(ann_d):.4f}, "
              f"median acceptor {np.median(ann_a):.4f}", flush=True)

        for c in [x for x in CRYPTIC if x["gene"] == gene]:
            s, e = c["start"], c["end"]
            if strand == "+":
                a_pos, d_pos = s - 1, e + 1        # acceptor before exon, donor after
            else:
                a_pos, d_pos = e + 1, s - 1
            ia, idd = a_pos - gs, d_pos - gs
            if not (0 <= ia < len(acc) and 0 <= idd < len(don)):
                print(f"  {c['source']}: outside gene span"); continue
            sa, sd = float(acc[ia]), float(don[idd])
            # rank among intronic positions
            pa = float((acc[intronic] < sa).mean() * 100)
            pd_ = float((don[intronic] < sd).mean() * 100)
            ra = int((acc[intronic] >= sa).sum())
            rd = int((don[intronic] >= sd).sum())
            print(f"  {c['source']}")
            print(f"    acceptor {chrom}:{a_pos:,}  score {sa:.4f}  "
                  f"percentile {pa:.4f}  rank {ra} of {int(intronic.sum()):,} intronic positions")
            print(f"    donor    {chrom}:{d_pos:,}  score {sd:.4f}  "
                  f"percentile {pd_:.4f}  rank {rd} of {int(intronic.sum()):,} intronic positions",
                  flush=True)
            # fair control: rank only among intronic positions that are even
            # candidate sites, i.e. carry the canonical AG (acceptor) or GT (donor)
            gr = GenomeReader()
            gseq = gr.codes(chrom, gs, ge, "+")           # genomic orientation, 1..4 = ACGT
            if strand == "+":
                ag = (gseq[:-1] == 1) & (gseq[1:] == 3)    # ...A G  -> G is last intronic base
                cand_a = np.zeros(len(gseq), bool); cand_a[1:] = ag
                gt = (gseq[:-1] == 3) & (gseq[1:] == 4)    # G T      -> G is first intronic base
                cand_d = np.zeros(len(gseq), bool); cand_d[:-1] = gt
            else:
                ct = (gseq[:-1] == 2) & (gseq[1:] == 4)    # C T  = revcomp(AG)
                cand_a = np.zeros(len(gseq), bool); cand_a[:-1] = ct
                ac = (gseq[:-1] == 1) & (gseq[1:] == 2)    # A C  = revcomp(GT)
                cand_d = np.zeros(len(gseq), bool); cand_d[1:] = ac
            cand_a &= intronic; cand_d &= intronic
            ra_c = int((acc[cand_a] >= sa).sum()); na_c = int(cand_a.sum())
            rd_c = int((don[cand_d] >= sd).sum()); nd_c = int(cand_d.sum())
            print(f"    among intronic AG dinucleotides: acceptor rank {ra_c} of {na_c:,}")
            print(f"    among intronic GT dinucleotides: donor    rank {rd_c} of {nd_c:,}", flush=True)
            out.append({**c, "strand": strand,
                        "acceptor_rank_AG": ra_c, "n_intronic_AG": na_c,
                        "donor_rank_GT": rd_c, "n_intronic_GT": nd_c, "acceptor_pos": a_pos, "donor_pos": d_pos,
                        "acceptor_score": sa, "donor_score": sd,
                        "acceptor_rank_intronic": ra, "donor_rank_intronic": rd,
                        "n_intronic": int(intronic.sum()),
                        "gene_median_annot_donor": float(np.median(ann_d)),
                        "gene_median_annot_acceptor": float(np.median(ann_a))})

    with open(os.path.join(paths().results, "cryptic_exon_scan.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nwrote {paths().results}/cryptic_exon_scan.json", flush=True)


if __name__ == "__main__":
    main()

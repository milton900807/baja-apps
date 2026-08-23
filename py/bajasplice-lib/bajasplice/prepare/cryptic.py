#!/usr/bin/env python
"""Discover TDP-43-dependent cryptic exons de novo from recount3 junction counts.

recount3 junction files carry an `annotated` flag per junction AND per splice
site, which is exactly what cryptic exon discovery needs: a cryptic exon is
bounded by splice sites that no annotation knows about, used only when TDP-43
is lost.

A junction is called cryptic-induced when it has at least one unannotated
splice site, is essentially absent in controls, and is reproducibly present
after TDP-43 depletion. Cryptic exons are then assembled from pairs of such
junctions that bracket an intronic interval; STMN2-style terminal cryptic exons
have only one junction and are reported separately.
"""
import numpy as np, pandas as pd, os, sys, json, gzip

from bajasplice.config import paths
RAW = str(paths().raw / "recount3" / "tdp43")
STUDIES = {
    "SRP169127": {"kd": ["TARDBP shRNA knockdown"], "ctl": ["control shRNA"]},
    "SRP069787": {"kd": ["TDP-43 Knockdown", "TDP43 Knockdown"], "ctl": ["Scramble Knockdown"]},
    "SRP496259": {"kd": ["TDP-43ΔNLS"], "ctl": ["TDP-43:YFP"]},
}
MIN_KD_READS = 5        # summed across knockdown samples
MAX_CTL_FRAC = 0.20      # control level must be <=10% of knockdown level
MIN_KD_SAMPLES = 2       # seen in at least this many knockdown samples
EXON_MIN, EXON_MAX = 20, 800


def load_mm(path, n_rows, n_cols):
    """recount3 ships MatrixMarket coordinate integer; rows are junctions."""
    M = np.zeros((n_rows, n_cols), dtype=np.float32)
    with gzip.open(path, "rt") as fh:
        hdr = 0
        for line in fh:
            if line.startswith("%"):
                continue
            if hdr == 0:
                hdr = 1
                continue
            a, b, v = line.split()
            M[int(a) - 1, int(b) - 1] = float(v)
    return M


def study_groups(study):
    proj = pd.read_csv(os.path.join(RAW, f"{study}.proj.MD.gz"), sep="\t")
    sra = pd.read_csv(os.path.join(RAW, f"{study}.sra.MD.gz"), sep="\t", low_memory=False)
    m = proj.merge(sra[["external_id", "experiment_title"]], on="external_id", how="left")
    t = m.experiment_title.fillna("").astype(str)
    spec = STUDIES[study]
    kd = np.zeros(len(m), bool); ctl = np.zeros(len(m), bool)
    for pat in spec["kd"]:
        kd |= t.str.contains(pat, case=False, regex=False).to_numpy()
    for pat in spec["ctl"]:
        ctl |= t.str.contains(pat, case=False, regex=False).to_numpy()
    kd &= ~ctl
    return m, kd, ctl


def main():
    all_rows = []
    for study in STUDIES:
        rr = pd.read_csv(os.path.join(RAW, f"{study}.RR.gz"), sep="\t", low_memory=False)
        m, kd, ctl = study_groups(study)
        print(f"\n=== {study}: {len(rr):,} junctions | "
              f"{kd.sum()} TDP-43-depleted, {ctl.sum()} control samples ===", flush=True)
        if kd.sum() == 0 or ctl.sum() == 0:
            print("  could not resolve groups; titles:", flush=True)
            print("   ", m.experiment_title.head(6).tolist(), flush=True)
            continue
        M = load_mm(os.path.join(RAW, f"{study}.MM.gz"), len(rr), len(m))
        lib = M.sum(0); lib[lib == 0] = 1
        N = M / lib * lib.mean()                       # library-size normalised

        kd_sum = N[:, kd].sum(1); ctl_sum = N[:, ctl].sum(1)
        kd_n = (M[:, kd] > 0).sum(1)
        kd_mean = kd_sum / kd.sum(); ctl_mean = ctl_sum / ctl.sum()

        novel_site = (rr.left_annotated.astype(str) == "0") | (rr.right_annotated.astype(str) == "0")
        cryptic = (novel_site.to_numpy() & (kd_sum >= MIN_KD_READS) &
                   (kd_n >= MIN_KD_SAMPLES) &
                   (ctl_mean <= MAX_CTL_FRAC * np.maximum(kd_mean, 1e-9)))
        print(f"  junctions with an unannotated splice site: {int(novel_site.sum()):,}", flush=True)
        print(f"  TDP-43-induced cryptic junctions: {int(cryptic.sum()):,}", flush=True)

        sub = rr[cryptic].copy()
        sub["kd_mean"] = kd_mean[cryptic]; sub["ctl_mean"] = ctl_mean[cryptic]
        sub["study"] = study
        sub["left_novel"] = (sub.left_annotated.astype(str) == "0")
        sub["right_novel"] = (sub.right_annotated.astype(str) == "0")
        all_rows.append(sub)

        # positive control: the STMN2 cryptic acceptor
        s2 = rr[(rr.chromosome == "chr8") & (rr.end == 79616821)]
        for i in s2.index:
            print(f"  STMN2 chr8:{rr.start[i]:,}-{rr.end[i]:,} annotated={rr.annotated[i]} "
                  f"KD {kd_mean[i]:8.2f}  control {ctl_mean[i]:8.2f}  "
                  f"ratio {kd_mean[i]/max(ctl_mean[i],0.01):6.1f}x", flush=True)

    if not all_rows:
        print("no studies resolved"); return
    J = pd.concat(all_rows, ignore_index=True)
    J.to_csv(os.path.join(paths().interim, "cryptic_junctions.tsv"), sep="\t", index=False)
    print(f"\ntotal cryptic junctions across studies: {len(J):,}", flush=True)

    # ---- assemble cryptic exons -----------------------------------------
    # paired: junction A ends just before the exon, junction B starts just after
    exons = []
    for (chrom, strand), g in J.groupby(["chromosome", "strand"]):
        g = g.sort_values("start")
        ends = g[g.right_novel][["start", "end", "kd_mean", "study"]].to_numpy()
        starts = g[g.left_novel][["start", "end", "kd_mean", "study"]].to_numpy()
        for a_s, a_e, a_k, a_st in ends:
            for b_s, b_e, b_k, b_st in starts:
                L = b_s - a_e - 1
                if EXON_MIN <= L <= EXON_MAX:
                    exons.append((chrom, strand, int(a_e) + 1, int(b_s) - 1, int(L),
                                  "paired", float(min(a_k, b_k)), a_st))
    # terminal: a single novel-acceptor junction (STMN2-style, ends in a polyA)
    for r in J[J.right_novel].itertuples(index=False):
        exons.append((r.chromosome, r.strand, int(r.end) + 1, int(r.end) + 200, 200,
                      "terminal_candidate", float(r.kd_mean), r.study))
    E = pd.DataFrame(exons, columns=["chrom", "strand", "start", "end", "length",
                                     "kind", "kd_mean", "study"]).drop_duplicates(
                                         ["chrom", "strand", "start", "end"])
    E.to_csv(os.path.join(paths().interim, "cryptic_exons_discovered.tsv"), sep="\t", index=False)
    print(f"assembled cryptic exons: {len(E)} "
          f"({int((E.kind=='paired').sum())} paired, "
          f"{int((E.kind=='terminal_candidate').sum())} terminal candidates)", flush=True)


if __name__ == "__main__":
    main()

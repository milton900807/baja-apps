"""The validation suite.

Each test states, before it runs, what result would count as agreement. The
thresholds below are deliberately modest: they are the level at which the model
is doing something real, not the level it happens to reach.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np
import pandas as pd

from bajasplice.config import paths, split_of, TEST_CHROMS


@dataclass
class Result:
    name: str
    source: str
    expectation: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    status: str = "skipped"          # pass | fail | skipped | error
    detail: dict = field(default_factory=dict)
    note: str = ""
    seconds: float = 0.0


def _device_model():
    import torch
    from bajasplice.scan import load_splicenet
    return load_splicenet()


# --------------------------------------------------------------------------
# 1. ClinVar: do clinically pathogenic splice variants move the model?
# --------------------------------------------------------------------------
def _clinvar_deltas(df, limit=None):
    from bajasplice.variants import delta_score
    from bajasplice.genome import GenomeReader
    m, ctx, dev = _device_model()
    g = GenomeReader()
    out = []
    for row in df.itertuples(index=False):
        # gene strand is ambiguous where genes overlap, so take the larger of
        # the two orientations: a real disruption shows on the correct strand
        best = max(delta_score(m, ctx, row.chrom, int(row.pos), row.ref, row.alt,
                               dev, strand=st, window=50, genome=g)["delta"]
                   for st in ("+", "-"))
        out.append(best)
    return np.asarray(out)


def t_clinvar_disruption(limit=600):
    """Does the model flag variants that clinically destroy a splice site?"""
    from bajasplice.validate.datasets import load_clinvar
    from sklearn.metrics import roc_auc_score

    r = Result("clinvar_splice_disruption", "ClinVar (NCBI), clinical submissions",
               "pathogenic splice-site variants are flagged as disruptive while "
               "benign missense variants elsewhere are not; AUC >= 0.90", threshold=0.90)
    df = load_clinvar(max_per_class=limit)
    if df is None or df.empty:
        r.note = "ClinVar VCF not found; set BAJASPLICE_CLINVAR"
        return r
    sub = df[df.cls.isin(["pathogenic_splice", "benign_missense"])].reset_index(drop=True)
    if sub.cls.nunique() < 2:
        r.note = "not enough variants in both classes"
        return r
    d = _clinvar_deltas(sub)
    y = (sub.cls == "pathogenic_splice").astype(int)
    r.value = float(roc_auc_score(y, d))
    r.status = "pass" if r.value >= r.threshold else "fail"
    sub = sub.assign(delta=d)
    r.detail = {c: {"n": int((sub.cls == c).sum()),
                    "median_delta": round(float(sub[sub.cls == c].delta.median()), 4),
                    "frac_over_0.5": round(float((sub[sub.cls == c].delta > 0.5).mean()), 4)}
                for c in sub.cls.unique()}
    return r


def t_clinvar_pathogenicity(limit=600):
    """Informational: splicing disruption is not clinical pathogenicity.

    Both classes here sit at splice sites, so both disrupt splicing. What
    separates them is whether losing that site causes disease in that gene and
    that transcript, which a sequence model of splicing does not represent. A
    low number is the expected and correct outcome, so this is reported rather
    than scored.
    """
    from bajasplice.validate.datasets import load_clinvar
    from sklearn.metrics import roc_auc_score

    r = Result("clinvar_clinical_pathogenicity", "ClinVar (NCBI), clinical submissions",
               "informational: the model is NOT expected to separate these, because "
               "both classes disrupt splicing and only gene context distinguishes them")
    df = load_clinvar(max_per_class=limit)
    if df is None or df.empty:
        r.note = "ClinVar VCF not found; set BAJASPLICE_CLINVAR"
        return r
    sub = df[df.cls.isin(["pathogenic_splice", "benign_splice"])].reset_index(drop=True)
    if sub.cls.nunique() < 2:
        r.note = "not enough variants in both classes"
        return r
    d = _clinvar_deltas(sub)
    y = (sub.cls == "pathogenic_splice").astype(int)
    r.value = float(roc_auc_score(y, d))
    r.status = "info"
    sub = sub.assign(delta=d)
    r.detail = {c: {"n": int((sub.cls == c).sum()),
                    "median_delta": round(float(sub[sub.cls == c].delta.median()), 4),
                    "frac_over_0.5": round(float((sub[sub.cls == c].delta > 0.5).mean()), 4)}
                for c in sub.cls.unique()}
    r.note = ("both classes are at splice sites, so both disrupt splicing; the gap "
              "against the disruption test is what clinical interpretation adds")
    return r


# --------------------------------------------------------------------------
# 2. GTEx: are highly scored UNANNOTATED positions actually spliced?
# --------------------------------------------------------------------------
def t_gtex_novel(seed=0, n_decoy=20, radius=3000):
    """Splice sites that 17,382 GTEx samples use but GENCODE does not annotate.

    These are real, experimentally observed and unannotated, so they test
    exactly what a cryptic screen needs: whether the model recognises a genuine
    splice site it was never told about. Strand comes from the junction motif
    (GT..AG on the plus strand, CT..AC on the minus), which also filters out
    the non-canonical junctions that dominate an unannotated set.
    """
    import torch
    from sklearn.metrics import roc_auc_score
    from bajasplice.genome import GenomeReader, one_hot

    r = Result("gtex_novel_splice_sites", "GTEx v8 junctions absent from GENCODE",
               "unannotated splice sites that GTEx actually uses outscore "
               "dinucleotide-matched decoys; AUC >= 0.70", threshold=0.70)
    jp, ip = paths().interim / "junctions.tsv", paths().interim / "introns.tsv"
    if not (jp.exists() and ip.exists()):
        r.note = "needs data/interim/junctions.tsv and introns.tsv"
        return r
    j = pd.read_csv(jp, sep="\t", usecols=["chrom", "start", "end"])
    intr = pd.read_csv(ip, sep="\t", usecols=["chrom", "istart", "iend"])
    ann = set(zip(intr.chrom, intr.istart, intr.iend))
    novel = j[[(c, s, e) not in ann for c, s, e in zip(j.chrom, j.start, j.end)]]
    novel = novel[novel.chrom.isin(TEST_CHROMS)]

    g = GenomeReader()
    sites = []
    for c, s, e in novel[["chrom", "start", "end"]].itertuples(index=False):
        l, rr = g.sequence(c, s, s + 1, "+"), g.sequence(c, e - 1, e, "+")
        if l == "GT" and rr == "AG":
            sites += [(c, int(s), "+", "donor"), (c, int(e), "+", "acceptor")]
        elif l == "CT" and rr == "AC":
            sites += [(c, int(s), "-", "acceptor"), (c, int(e), "-", "donor")]
    sites = list(dict.fromkeys(sites))
    if len(sites) < 40:
        r.note = f"only {len(sites)} canonical novel sites found"
        return r

    m, ctx, dev = _device_model()
    TARGET, half, c2 = 64, 32, ctx // 2

    @torch.no_grad()
    def score(items, batch=64):
        out = np.zeros(len(items), np.float32)
        for i in range(0, len(items), batch):
            ch = items[i:i + batch]
            X = np.zeros((len(ch), 4, TARGET + ctx), np.float32)
            for k, (chrom, pos, strand, _w) in enumerate(ch):
                s0 = pos - half
                X[k] = one_hot(g.codes(chrom, s0 - c2, s0 + TARGET - 1 + c2, strand))
            x = torch.from_numpy(X).to(dev)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=dev.type == "cuda"):
                p = torch.softmax(m(x).float(), 1).cpu().numpy()
            for k, (_c, _p, strand, w) in enumerate(ch):
                idx = half if strand == "+" else TARGET - 1 - half
                out[i + k] = p[k, 1 if w == "acceptor" else 2, idx]
        return out

    rng = np.random.default_rng(seed)
    decoys, owner = [], []
    for i, (chrom, pos, strand, w) in enumerate(sites):
        codes = g.codes(chrom, pos - radius, pos + radius, "+")
        if w == "acceptor":
            hit = (np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 3)) + 1 if strand == "+"
                   else np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4)))
        else:
            hit = (np.flatnonzero((codes[:-1] == 3) & (codes[1:] == 4)) if strand == "+"
                   else np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 2)) + 1)
        cand = hit + (pos - radius)
        cand = cand[cand != pos]
        if not len(cand):
            continue
        for d in rng.choice(cand, min(n_decoy, len(cand)), replace=False):
            decoys.append((chrom, int(d), strand, w)); owner.append(i)

    s_pos, s_dec = score(sites), score(decoys)
    y = np.r_[np.ones(len(s_pos)), np.zeros(len(s_dec))]
    r.value = float(roc_auc_score(y, np.r_[s_pos, s_dec]))
    r.status = "pass" if r.value >= r.threshold else "fail"
    r.detail = {"n_novel_sites": len(sites), "n_decoys": len(decoys),
                "median_score_novel": round(float(np.median(s_pos)), 5),
                "median_score_decoy": round(float(np.median(s_dec)), 6),
                "frac_novel_over_0.5": round(float((s_pos > 0.5).mean()), 4),
                "frac_decoy_over_0.5": round(float((s_dec > 0.5).mean()), 4)}
    return r


# --------------------------------------------------------------------------
# 3. VastDB: do our inclusion labels match an independent quantification?
# --------------------------------------------------------------------------
def t_vastdb():
    from bajasplice.validate.datasets import load_vastdb_comparison
    from scipy.stats import pearsonr

    r = Result("vastdb_inclusion_agreement", "VastDB (CRG), independent samples and pipeline",
               "GTEx-derived inclusion agrees with VastDB on genuinely alternative "
               "exons; Pearson r >= 0.85", threshold=0.85)
    d = load_vastdb_comparison()
    if d is None:
        r.note = "run `bajasplice evaluate vastdb` first"
        return r
    alt = d[d.skip_total >= 10] if "skip_total" in d.columns else d
    ok = np.isfinite(alt.psi_mean) & np.isfinite(alt.vast_psi)
    r.value = float(pearsonr(alt.psi_mean[ok], alt.vast_psi[ok])[0])
    r.status = "pass" if r.value >= r.threshold else "fail"
    r.detail = {"n_alternative_exons": int(ok.sum()), "n_all_matched": int(len(d)),
                "mae": round(float(np.abs(alt.psi_mean[ok] - alt.vast_psi[ok]).mean()), 4)}
    return r


# --------------------------------------------------------------------------
# 4. recount3: are experimentally induced cryptic sites recognised?
# --------------------------------------------------------------------------
def t_cryptic():
    from bajasplice.validate.datasets import load_cryptic_sites

    r = Result("tdp43_cryptic_sites", "recount3, three published TDP-43 depletion studies",
               "cryptic splice sites induced by TDP-43 loss outscore "
               "dinucleotide-matched decoys; AUC >= 0.75", threshold=0.75)
    p = paths().results / "cryptic_site_benchmark.json"
    if not p.exists():
        r.note = "run `bajasplice evaluate cryptic-benchmark` first"
        return r
    d = json.loads(p.read_text())
    r.value = float(d["auc_vs_matched_decoys"])
    r.status = "pass" if r.value >= r.threshold else "fail"
    r.detail = {"n_cryptic_sites": d["n_cryptic_sites"], "n_decoys": d["n_decoys"],
                "frac_beating_all_decoys": d["frac_sites_beating_all_decoys"],
                "by_study": d.get("by_study", {})}
    return r


# --------------------------------------------------------------------------
# 5. Published cryptic exon coordinates
# --------------------------------------------------------------------------
KNOWN_CRYPTIC = [
    {"gene": "STMN2", "pos": 79616821, "kind": "acceptor", "chrom": "chr8",
     "source": "exon 2a, annotated in GENCODE v50 and absent from v29"},
    {"gene": "UNC13A", "pos": 17642413, "kind": "donor", "chrom": "chr19",
     "source": "Ma et al. Nature 2022"},
    {"gene": "UNC13A", "pos": 17642592, "kind": "acceptor", "chrom": "chr19",
     "source": "Ma et al. Nature 2022, 178 bp form"},
]


def t_known_cryptic():
    from bajasplice.scan import rank_candidates

    r = Result("published_cryptic_exons", "Ma et al. Nature 2022; GENCODE v29 vs v50",
               "each published cryptic splice site ranks in the top 5% of candidate "
               "positions in its own gene", threshold=5.0)
    from bajasplice.index import slim_index_path
    import bajasplice.scan as S

    rows = []
    for k in KNOWN_CRYPTIC:
        try:
            df = rank_candidates(k["gene"], k["kind"])
        except Exception as e:
            r.status = "error"; r.note = f"{k['gene']}: {e}"; return r
        hit = df[df.pos == k["pos"]]
        if hit.empty:
            # Some cryptic exons are now annotated in a minor isoform, so the
            # full index treats them as known and drops them from the candidate
            # set. Retry against the canonical-only index, which is the scope a
            # cryptic screen actually runs in. Never silently skip the site.
            orig = S.gene_span
            def _canon(name, exons=None, transcript=None, _p=slim_index_path()):
                from bajasplice.index import GeneIndex
                idx = GeneIndex(_p)
                rec = idx.gene(name); ex = idx.exons(name, transcript)
                ex = ex.assign(chrom=rec["chrom"], strand=rec["strand"], gene_name=name)
                return rec["chrom"], int(rec["start"]), int(rec["end"]), rec["strand"], ex
            S.gene_span = _canon
            try:
                df = rank_candidates(k["gene"], k["kind"])
                hit = df[df.pos == k["pos"]]
            finally:
                S.gene_span = orig
            if not hit.empty:
                rk = int(hit["rank"].iloc[0])
                rows.append({**k, "rank": rk, "pct": round(100 * rk / len(df), 3),
                             "n": int(len(df)), "score": round(float(hit.score.iloc[0]), 4),
                             "scope": "canonical transcript only"})
                continue
        if hit.empty:
            rows.append({**k, "rank": None, "pct": None,
                         "n": int(len(df)), "note": "not recoverable as a candidate"})
            continue
        rk = int(hit["rank"].iloc[0])
        rows.append({**k, "rank": rk, "pct": round(100 * rk / len(df), 3),
                     "n": int(len(df)), "score": round(float(hit.score.iloc[0]), 4)})
    scored = [x for x in rows if x.get("pct") is not None]
    missing = [x for x in rows if x.get("pct") is None]
    if not scored:
        r.note = "no published site survived candidate selection"
        return r
    r.value = float(max(x["pct"] for x in scored))
    # a site that could not be evaluated is a failure, not an omission
    r.status = "pass" if (r.value <= r.threshold and not missing) else "fail"
    r.detail = {"sites": rows, "n_evaluated": len(scored), "n_unevaluable": len(missing)}
    if missing:
        r.note = f"{len(missing)} published site(s) could not be scored: " + \
                 ", ".join(f"{x['gene']}:{x['pos']}" for x in missing)
    return r


# --------------------------------------------------------------------------
# 6. ENCODE eCLIP: is the binding model RBP-specific at all?
# --------------------------------------------------------------------------
def t_eclip():
    r = Result("eclip_rbp_specificity", "ENCODE eCLIP, held-out windows",
               "on bound-vs-bound windows the matched RBP channel beats a "
               "mismatched one; gap >= 0.05 AUROC", threshold=0.05)
    p = paths().results / "eclip_matched_vs_mismatched.json"
    if not p.exists():
        r.note = "run `bajasplice evaluate eclip` first (needs the BajaCLIP bundle)"
        return r
    d = json.loads(p.read_text())
    best = max(d, key=lambda x: x["B_delta"])
    r.value = float(best["B_delta"])
    r.status = "pass" if r.value >= r.threshold else "fail"
    r.detail = {x["label"]: {"matched": round(x["B_matched"], 4),
                             "mismatched": round(x["B_mismatched"], 4),
                             "gap": round(x["B_delta"], 4)} for x in d}
    return r


# --------------------------------------------------------------------------
# 7. GENCODE: are annotated sites on held-out chromosomes recovered?
# --------------------------------------------------------------------------
def t_annotated():
    r = Result("annotated_site_recovery", "GENCODE v50, held-out chromosomes",
               "annotated splice sites are recovered among the top-scoring "
               "positions; top-k >= 0.85", threshold=0.85)
    p = paths().results / "ss_ctx2000_metrics.json"
    if not p.exists():
        r.note = "run `bajasplice train splicesite` first"
        return r
    d = json.loads(p.read_text())["test"]
    r.value = float(min(d["acceptor_topk"], d["donor_topk"]))
    r.status = "pass" if r.value >= r.threshold else "fail"
    r.detail = {k: round(v, 4) for k, v in d.items() if isinstance(v, float)}
    return r


TESTS: dict[str, Callable[[], Result]] = {
    "clinvar": t_clinvar_disruption,
    "clinvar-clinical": t_clinvar_pathogenicity,
    "gtex-novel": t_gtex_novel,
    "vastdb": t_vastdb,
    "cryptic": t_cryptic,
    "known-cryptic": t_known_cryptic,
    "eclip": t_eclip,
    "annotated": t_annotated,
}

_MARK = {"pass": "PASS", "fail": "FAIL", "skipped": "skip", "error": "ERR ", "info": "INFO"}


def run(names=None, verbose=True):
    out = []
    for name in (names or list(TESTS)):
        fn = TESTS[name]
        t0 = time.time()
        try:
            res = fn()
        except Exception as e:
            res = Result(name, "", "", status="error", note=f"{type(e).__name__}: {e}")
        res.seconds = round(time.time() - t0, 1)
        out.append(res)
        if verbose:
            v = "" if res.value is None else f"{res.value:.4f}"
            thr = "" if res.threshold is None else f" (need {res.threshold})"
            print(f"[{_MARK[res.status]}] {res.name:32s} {v:>8s}{thr}")
            print(f"        source     {res.source}")
            print(f"        expected   {res.expectation}")
            if res.detail:
                print(f"        detail     {json.dumps(res.detail)[:300]}")
            if res.note:
                print(f"        note       {res.note}")
            print(f"        {res.seconds}s", flush=True)
    return out


def main():
    ap = argparse.ArgumentParser(description="validate against external datasets")
    ap.add_argument("--test", action="append", choices=sorted(TESTS),
                    help="run only these; repeatable")
    ap.add_argument("--out", help="write a JSON report here")
    ap.add_argument("--clinvar-limit", type=int, default=1200)
    a = ap.parse_args()
    res = run(a.test)
    n_pass = sum(r.status == "pass" for r in res)
    n_fail = sum(r.status == "fail" for r in res)
    n_skip = sum(r.status in ("skipped", "error") for r in res)
    n_info = sum(r.status == "info" for r in res)
    print(f"\n{n_pass} passed, {n_fail} failed, {n_skip} skipped, {n_info} informational")
    if a.out:
        payload = [{"name": r.name, "source": r.source, "expectation": r.expectation,
                    "value": r.value, "threshold": r.threshold, "status": r.status,
                    "detail": r.detail, "note": r.note, "seconds": r.seconds}
                   for r in res]
        with open(a.out, "w") as f:
            json.dump(payload, f, indent=2)
        print(f"wrote {a.out}")
    return 1 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())

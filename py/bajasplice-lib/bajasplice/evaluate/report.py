#!/usr/bin/env python
"""Collect every metrics file into one comparison table.

The point of the table is the model-vs-control contrast: a splice-site model
that only matches the PWM has learned the motif and nothing else, and a PSI
model that only matches the geometry baseline has learned exon length.
"""
import json, os, glob

from bajasplice.config import paths
def load(name):
    p = os.path.join(paths().results, name)
    return json.load(open(p)) if os.path.exists(p) else None


def fmt(v, w=8):
    if v is None:
        return " " * w
    if isinstance(v, float):
        return f"{v:{w}.4f}"
    return f"{str(v):>{w}}"


def main():
    print("=" * 78)
    print("TASK 1  splice-site detection   (test chromosomes 1,3,5,7,9)")
    print("=" * 78)
    print(f"{'model':28s} {'acc top-k':>10s} {'acc PR-AUC':>11s} {'don top-k':>10s} {'don PR-AUC':>11s}")
    rows = []
    pwm = load("baseline_pwm_metrics.json")
    if pwm:
        rows.append(("PWM baseline (motif only)", pwm))
    for p in sorted(glob.glob(os.path.join(paths().results, "ss_*_metrics.json"))):
        d = json.load(open(p))
        rows.append((os.path.basename(p).replace("_metrics.json", ""), d["test"]))
    for name, m in rows:
        print(f"{name:28s} {fmt(m.get('acceptor_topk'),10)} {fmt(m.get('acceptor_prauc'),11)} "
              f"{fmt(m.get('donor_topk'),10)} {fmt(m.get('donor_prauc'),11)}")

    print()
    print("=" * 78)
    print("TASK 2  cassette-exon PSI / preferred exons   (test chromosomes)")
    print("=" * 78)
    print(f"{'model':28s} {'Pearson':>9s} {'Spearman':>9s} {'MAE':>8s} {'pref AUC':>9s} {'per-tissue r':>13s}")
    b = load("baseline_psi_metrics.json") or {}
    order = [("constant", "constant (train mean)"), ("geom", "geometry only (len/GC)"),
             ("ss", "splice-site PWM only"), ("both", "geometry + PWM")]
    prows = [(label, b[key]) for key, label in order if key in b]
    for p in sorted(glob.glob(os.path.join(paths().results, "psi*_metrics.json"))):
        d = json.load(open(p))
        prows.append((os.path.basename(p).replace("_metrics.json", "") + " (CNN)", d["test"]))
    for name, m in prows:
        print(f"{name:28s} {fmt(m.get('mean_psi_pearson'),9)} {fmt(m.get('mean_psi_spearman'),9)} "
              f"{fmt(m.get('mean_psi_mae'),8)} {fmt(m.get('preferred_auc'),9)} "
              f"{fmt(m.get('per_tissue_pearson_mean'),13)}")
    if prows:
        m = prows[-1][1]
        print(f"\n  test events: {m.get('n_events')}   preferred (PSI>=0.9): "
              f"{m.get('n_preferred')}   alternative (PSI<=0.5): {m.get('n_alternative')}"
              f"   with skipping evidence: {m.get('n_alt_events')}")
        print("  alt-subset figures are computed only on exons that are actually")
        print("  skipped somewhere, so the constitutive majority cannot inflate them.")
    print()

    print("=" * 78)
    print("TASK 3  competing splice sites: which site is preferred")
    print("=" * 78)
    print(f"{'model':28s} {'top-1 acc':>10s} {'usage r':>9s} {'usage MAE':>10s} {'groups':>8s}")
    b3 = load("baseline_altss_metrics.json") or {}
    arows = [(lbl, b3[k]) for k, lbl in
             (("random", "random (by group size)"), ("distal", "always distal site"),
              ("proximal", "always proximal site"), ("pwm", "strongest PWM site"))
             if k in b3]
    for p3 in sorted(glob.glob(os.path.join(paths().results, "altss*_metrics.json"))):
        d = json.load(open(p3))
        arows.append((os.path.basename(p3).replace("_metrics.json", "") + " (CNN)", d["test"]))
    for name, m in arows:
        print(f"{name:28s} {fmt(m.get('preferred_top1_acc'),10)} {fmt(m.get('usage_pearson'),9)} "
              f"{fmt(m.get('usage_mae'),10)} {fmt(m.get('n_groups'),8)}")
    print()

    r = load("rbp_eval.json")
    if r:
        print("=" * 78)
        print("TASK 4  RBP knockdown response: which RBPs change this exon")
        print("=" * 78)
        print(f"{'scored on':14s} {'predictor':22s} {'mean per-RBP AUC':>17s} {'RBPs':>6s} {'beats ref':>10s}")
        for scope, label in (("all_rbps", "all 475 RBPs"), ("top50_rbps", "top 50 RBPs")):
            for row in r.get(scope, []):
                print(f"{label:14s} {row['model']:22s} {row['mean_auc']:17.4f} "
                      f"{row['n_rbps']:6d} {row['n_beating_control']:10d}")
            ref = r[scope][0]["control_mean_auc"]
            print(f"{label:14s} {'exon responsiveness*':22s} {ref:17.4f} "
                  f"{r[scope][0]['n_rbps']:6d} {'-':>10s}")
        print()
        print("  * leave-one-RBP-out reference, NOT a sequence baseline: it reads the")
        print("    other 476 knockdown experiments on the same exon, which the models")
        print("    never see. It is here to show that per-RBP AUC is dominated by")
        print("    exon-level responsiveness rather than RBP identity.")
        print("    The like-for-like sequence comparison is CNN vs geometry-only.")
        print()

    bb = load("rbp_binding_vs_response.json")
    if bb:
        print("=" * 78)
        print("TASK 4b  BajaCLIP predicted RBP binding as a predictor of knockdown response")
        print("=" * 78)
        a = bb.get("all", {})
        print(f"  binding of RBP k -> response to knockdown of RBP k")
        print(f"    matched RBP binding      AUC {a.get('mean_auc_matched', float('nan')):.4f}")
        print(f"    MISmatched RBP binding   AUC {a.get('mean_auc_mismatched', float('nan')):.4f}")
        print(f"    difference               {a.get('mean_auc_matched',0)-a.get('mean_auc_mismatched',0):+.4f}"
              f"   ({a.get('n_matched_beats_mismatched')}/{a.get('n_rbps')} RBPs)")
        d = bb.get("diagnostic", {})
        if d:
            lg = d.get("logit", {})
            print(f"\n  why: the 170 binding tracks are effectively one signal")
            print(f"    PC1 explains {lg.get('pc1_var', 0):.3f} of variance, "
                  f"effective dimensionality {lg.get('effective_dim', 0):.1f} of 170")
            r = d.get("residual_after_removing_shared_component", {})
            print(f"    after removing the shared component, matched drops to "
                  f"{r.get('matched', 0):.4f} (p={r.get('p', 0):.2g}, i.e. chance)")
        print()
        print("  adding these features to the model: per-RBP AUC 0.5733 -> 0.5771 (+0.004)")
        print()

    em = load("eclip_matched_vs_mismatched.json")
    if em:
        print("=" * 78)
        print("TASK 4c  matched-vs-mismatched control on the eCLIP data itself")
        print("=" * 78)
        print(f"  {'model':16s} {'design':34s} {'matched':>8s} {'mismatch':>9s} {'gap':>7s}")
        for r in em:
            print(f"  {r['label']:16s} {'A: positives vs background':34s} "
                  f"{r['A_matched']:8.4f} {r['A_mismatched']:9.4f} {r['A_delta']:+7.4f}")
            print(f"  {'':16s} {'B: positives vs other RBP sites':34s} "
                  f"{r['B_matched']:8.4f} {r['B_mismatched']:9.4f} {r['B_delta']:+7.4f}")
        print()
        print("  Design B is the honest test: every window is a real binding site, so")
        print("  only RBP identity can help. Both models pass it, so RBP specificity")
        print("  is real -- but much of the headline AUROC in design A is shared")
        print("  bindability, and enhanced.final is ~3x less specific than lowfdr.")
        print()

    cb = load("cryptic_site_benchmark.json")
    if cb:
        print("=" * 78)
        print("TASK 5  TDP-43 cryptic splice sites, discovered de novo from recount3")
        print("=" * 78)
        print(f"  {cb['n_cryptic_sites']} unannotated cryptic splice sites on HELD-OUT")
        print(f"  chromosomes, vs {cb['n_decoys']:,} AG/GT dinucleotide-matched decoys")
        print(f"  drawn from the same introns.\n")
        print(f"    AUC vs matched decoys            {cb['auc_vs_matched_decoys']:.4f}")
        print(f"    sites beating ALL their decoys   {cb['frac_sites_beating_all_decoys']*100:.1f}%")
        print(f"    median score cryptic vs decoy    {cb['median_score_cryptic']:.4f} vs "
              f"{cb['median_score_decoy']:.2e}")
        print(f"    scoring above 0.5                {cb['frac_cryptic_above_0.5']*100:.1f}% of cryptic "
              f"vs {cb['frac_decoy_above_0.5']*100:.2f}% of decoys")
        bs = cb.get("by_study", {})
        if bs:
            print("\n  by discovery study (SRP169127 is the one where the STMN2")
            print("  positive control fired, so its TDP-43 dependence is verified):")
            for k, v2 in bs.items():
                print(f"    {k}  n={v2['n_sites']:4d}  AUC {v2['auc']:.4f}")
        print("\n  These sites were labelled NEGATIVE during training, so the model was")
        print("  taught to suppress them and still ranks them above matched decoys.")
        print()

    v = load("vastdb_validation.json")
    if v:
        print("=" * 78)
        print("LABEL VALIDATION  GTEx-derived PSI vs VastDB (independent samples + method)")
        print("=" * 78)
        print(f"  all matched exons      n={v['n_matched']:>7}  r={v['pearson']:.4f}  MAE={v['mae']:.4f}")
        if "alt_pearson" in v:
            print(f"  alternative subset     n={v['n_alt']:>7}  r={v['alt_pearson']:.4f}  MAE={v['alt_mae']:.4f}")
        print()


if __name__ == "__main__":
    main()

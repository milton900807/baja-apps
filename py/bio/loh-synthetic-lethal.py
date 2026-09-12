"""Synthetic lethality from loss of heterozygosity: what one remaining copy is worth.

LOH IS NOT A LOST GENE, and treating it as one is the mistake this exists to avoid. A
tract of LOH says the tumor carries ONE copy of everything inside it. The gene still works.
What has changed is the buffer: there is no second allele left to absorb a hit, and no
second allele left to make up a shortfall. Two different vulnerabilities follow from that,
and they want opposite things from a target.

  1. COMPLETE LOSS (two hits). A gene inside the tract that ALSO carries a loss-of-function
     variant has now lost both copies: LOH removed one, the variant broke the other. This
     is the classic two-hit tumor suppressor, and it is a genuine loss -- the kind the
     third-gene model is built to reason from. These make the strongest background.

  2. SINGLE-COPY DEPENDENCE (CYCLOPS). A gene inside the tract that the cell cannot do
     without is now running on one copy where every normal cell in the patient has two.
     Partially inhibit it and the tumor dies first: it has no headroom, the patient's
     tissue does. The target here is the LOH GENE ITSELF, not a partner, which is why it
     cannot be found by asking a screen which OTHER gene becomes essential. The more
     essential the gene is across the panel, the sharper the asymmetry -- the opposite of
     what makes a good third-gene hit, where pan-essentiality is disqualifying.

  3. And the background for the third-gene model, chosen rather than guessed: genes that
     are lost often enough in DepMap for a background built on them to have lines to score.
     A background of twelve genes nothing else carries returns nothing, and the user has no
     way to know that before running it.

Reads the bundle build-depmap-sl.py wrote to reference_data/depmap (per box).

THE DOSAGE TEST. Essentiality alone only says the gene matters; it does not say that HALF
of it matters, which is the whole claim. So each candidate is also asked the question
directly, in the cell lines that are themselves down to one copy of it: is the knockout
worse there than in the lines that carry a normal complement? That needs copy number, and
the bundle now carries it -- absolute copies per gene, read against each line's OWN ploidy,
because cancer lines are aneuploid and two copies in a near-triploid line is a loss, not a
normal reading. Lines with NO copies are excluded rather than counted as the extreme of
low dosage: CRISPR has nothing to cut there, and their flat effect would argue the opposite
of the truth. Lineage is regressed out first, as everywhere else here, so a vulnerability
of one tissue is not read as a consequence of dosage.

A gene that passes both -- essential across the panel AND measurably more essential in the
lines that are hemizygous for it -- is the real thing. A gene that is essential with no
measurable dosage effect is reported and labelled as such, because the patient's tract is
still evidence and the cell lines may simply be too few.

Bundles built before copy number was added still work: the dosage test is skipped, every
candidate is labelled "not tested", and a note says why.

Params (after the EngineMonitor):
    param(1) : JSON { loh_genes: [symbol, ...],      every gene inside an LOH tract
                      second_hit: [symbol, ...],     those that also carry a LoF variant
                      top: N }

Resolves:
    { ok, complete, cyclops, background, notes, n_models, n_genes, error }
  complete   JSON array: { gene, tsg, effect_mean, dep_frac, n_lost_lines }
  cyclops    JSON array, best first: { gene, tsg, effect_mean, effect_median, dep_frac,
             n_dependent, n_lost_lines, class }
  background JSON array of symbols, ready for synthetic-lethal-targets.py
"""
import json
import math
import os

import numpy as np

from ion import works

DEP_CUT = -0.5           # a line "depends on" a gene below this Chronos effect
PAN_FRAC = 0.90          # dependent in this share of lines: essential everywhere
COMMON_FRAC = 0.50
MAX_BACKGROUND = 12      # what synthetic-lethal-targets.py will accept
MIN_BG_LINES = 15        # a background gene nothing else carries cannot be scored
MAX_GENES = 4000
# The dosage test, in ratios to each line's own ploidy rather than raw copies.
CN_LOW = 0.60            # at or below: the line is down to roughly one copy of two
CN_HI_LO, CN_HI_HI = 0.85, 1.15   # a normal complement for that line
MIN_HEMI = 10            # fewer hemizygous lines than this and the test says nothing
MIN_NEUTRAL = 20
CN_FDR = 0.25

out = {"ok": False, "complete": "[]", "cyclops": "[]", "background": "[]",
       "notes": "[]", "n_models": 0, "n_genes": 0, "cn_models": 0, "error": None}


def bh_fdr(p):
    n = len(p)
    if not n:
        return p
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    fdr = np.empty(n)
    fdr[order] = np.clip(ranked, 0, 1)
    return fdr


def norm_sf(z):
    return math.erfc(abs(z) / math.sqrt(2.0))


def bundle_dir():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, "reference_data", "depmap")
        if os.path.exists(os.path.join(p, "gene_effect.npy")):
            return p
    return ""


raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}


def symbols(key):
    return list(dict.fromkeys(
        [str(g).strip().upper() for g in (req.get(key) or []) if str(g).strip()]))[:MAX_GENES]


loh = symbols("loh_genes")
second = set(symbols("second_hit"))
try:
    top_n = max(5, min(300, int(req.get("top") or 60)))
except Exception:
    top_n = 60

bd = bundle_dir()
if not loh:
    out["error"] = "no genes were given"
elif not bd:
    out["error"] = ("the DepMap bundle is not on this server: run py/bio/build-depmap-sl.py once "
                    "(it downloads the public DepMap tables and writes reference_data/depmap)")
else:
    works.msg("Loading the DepMap dependency bundle…")
    genes = [g.strip() for g in open(os.path.join(bd, "genes.txt")).read().rstrip("\n").split("\n")]
    G = np.load(os.path.join(bd, "gene_effect.npy"), mmap_mode="r")
    L = np.load(os.path.join(bd, "lof.npy"), mmap_mode="r")
    cn_path = os.path.join(bd, "cn.npy")
    pl_path = os.path.join(bd, "ploidy.npy")
    C = np.load(cn_path, mmap_mode="r") if os.path.exists(cn_path) else None
    PL = np.load(pl_path) if os.path.exists(pl_path) else None
    n_models, n_genes = G.shape
    lin = []
    lpath = os.path.join(bd, "lineage.txt")
    if os.path.exists(lpath):
        lin = [x.strip() for x in open(lpath).read().rstrip("\n").split("\n")]
    lin = (lin + [""] * n_models)[:n_models]
    gidx = {g.upper(): i for i, g in enumerate(genes)}
    out["n_models"], out["n_genes"] = int(n_models), int(n_genes)

    # The curated tumour-suppressor list the bundle was built with: for these a recurrent
    # missense is a loss, which is the same judgement that makes them worth naming here.
    tsg = set()
    try:
        meta = json.load(open(os.path.join(bd, "meta.json")))
        tsg = set(str(x).upper() for x in (meta.get("hotspot_as_loss") or []))
    except Exception:
        tsg = set()

    known = [g for g in loh if g in gidx]
    missing = len(loh) - len(known)
    if not known:
        out["error"] = "none of these genes is in the DepMap screen"
    else:
        works.msg("Reading the dependency profile of %d gene(s) in the tracts…" % len(known))
        cols = [gidx[g] for g in known]
        # One gather, columns in file order, then put back in the caller's order: a fancy
        # index over a memory-mapped array is a seek per column, and 400 random seeks into
        # a 90 MB file is slower than one ordered pass.
        order = np.argsort(np.array(cols))
        E = np.asarray(G[:, np.array(cols)[order]], dtype=np.float32)
        Lo = np.asarray(L[:, np.array(cols)[order]], dtype=bool)
        back = np.empty(len(cols), dtype=np.int64)
        back[order] = np.arange(len(cols))
        E = E[:, back]
        Lo = Lo[:, back]

        # THE DOSAGE TEST. Lineage is regressed out of these columns first (the same
        # Frisch-Waugh-Lovell step the third-gene model uses, over 350 columns instead of
        # 18,000), then within the lines that HAVE copy number the hemizygous ones are
        # compared with the ones carrying a normal complement for their own ploidy.
        cn_stats = None
        if C is not None and PL is not None:
            works.msg("Testing each candidate against the cell lines that are themselves down to one copy…")
            cats = sorted(set(lin))
            D = np.zeros((n_models, len(cats) + 1), dtype=np.float64)
            D[:, 0] = 1.0
            ci = {c: k + 1 for k, c in enumerate(cats)}
            for i, c in enumerate(lin):
                D[i, ci[c]] = 1.0
            beta, _, _, _ = np.linalg.lstsq(D, E.astype(np.float64), rcond=None)
            R = E.astype(np.float64) - (D @ beta)
            CNsel = np.asarray(C[:, np.array(cols)[order]], dtype=np.float32)[:, back]
            ploidy = np.asarray(PL, dtype=np.float64)
            with np.errstate(invalid="ignore", divide="ignore"):
                ratio = CNsel.astype(np.float64) / ploidy[:, None]
            profiled = np.isfinite(ratio) & np.isfinite(CNsel.astype(np.float64))
            # A line with NO copies is not the extreme of low dosage: there is nothing for
            # CRISPR to cut, and its flat effect argues the opposite of the truth.
            hemi = profiled & (ratio <= CN_LOW) & (CNsel >= 1)
            neut = profiled & (ratio >= CN_HI_LO) & (ratio <= CN_HI_HI)
            n_h = hemi.sum(0)
            n_n = neut.sum(0)
            testable = (n_h >= MIN_HEMI) & (n_n >= MIN_NEUTRAL)
            eff_h = np.full(len(known), np.nan)
            eff_n = np.full(len(known), np.nan)
            tstat = np.full(len(known), np.nan)
            pval = np.ones(len(known))
            for j in range(len(known)):
                if not testable[j]:
                    continue
                a = R[hemi[:, j], j]
                b = R[neut[:, j], j]
                ma, mb = a.mean(), b.mean()
                va, vb = a.var(ddof=1), b.var(ddof=1)
                se = math.sqrt(max(va / len(a) + vb / len(b), 1e-12))
                eff_h[j], eff_n[j] = ma, mb
                tstat[j] = (ma - mb) / se
                pval[j] = norm_sf(tstat[j])
            fdr = bh_fdr(pval)
            cn_stats = {"n_h": n_h, "n_n": n_n, "testable": testable, "eff_h": eff_h,
                        "eff_n": eff_n, "t": tstat, "fdr": fdr}
            out["cn_models"] = int(np.isfinite(ploidy).sum())

        dep = (E < DEP_CUT)
        dep_n = dep.sum(0)
        dep_frac = dep_n / float(n_models)
        eff_mean = E.mean(0)
        eff_med = np.median(E, axis=0)
        lost_n = Lo.sum(0)

        rows = []
        for j, g in enumerate(known):
            if dep_frac[j] >= PAN_FRAC:
                klass = "essential in nearly every line"
            elif dep_frac[j] >= COMMON_FRAC:
                klass = "essential in most lines"
            elif dep_frac[j] >= 0.10:
                klass = "essential in some lines"
            else:
                klass = "rarely essential"
            row = {"gene": g, "tsg": 1 if g in tsg else 0,
                   "effect_mean": round(float(eff_mean[j]), 4),
                   "effect_median": round(float(eff_med[j]), 4),
                   "dep_frac": round(float(dep_frac[j]), 4),
                   "n_dependent": int(dep_n[j]),
                   "n_lost_lines": int(lost_n[j]),
                   "second_hit": 1 if g in second else 0,
                   "class": klass}
            if cn_stats is None:
                row.update({"dosage": "not tested", "n_hemizygous": 0, "n_neutral": 0,
                            "eff_hemizygous": None, "eff_neutral": None, "cn_delta": None,
                            "cn_t": None, "cn_fdr": None, "cn_confirmed": 0})
            elif not bool(cn_stats["testable"][j]):
                row.update({"dosage": "too few hemizygous lines to test",
                            "n_hemizygous": int(cn_stats["n_h"][j]), "n_neutral": int(cn_stats["n_n"][j]),
                            "eff_hemizygous": None, "eff_neutral": None, "cn_delta": None,
                            "cn_t": None, "cn_fdr": None, "cn_confirmed": 0})
            else:
                d = float(cn_stats["eff_h"][j] - cn_stats["eff_n"][j])
                f = float(cn_stats["fdr"][j])
                ok = (d < 0) and (f <= CN_FDR)
                if ok:
                    label = "worse when the line is down to one copy"
                elif d < 0:
                    label = "leans the right way, not significant"
                else:
                    label = "no worse at one copy"
                row.update({"dosage": label,
                            "n_hemizygous": int(cn_stats["n_h"][j]), "n_neutral": int(cn_stats["n_n"][j]),
                            "eff_hemizygous": round(float(cn_stats["eff_h"][j]), 4),
                            "eff_neutral": round(float(cn_stats["eff_n"][j]), 4),
                            "cn_delta": round(d, 4), "cn_t": round(float(cn_stats["t"][j]), 3),
                            "cn_fdr": round(f, 4), "cn_confirmed": 1 if ok else 0})
            rows.append(row)
        by_gene = {r["gene"]: r for r in rows}

        # 1. COMPLETE LOSSES: LOH plus a broken remaining allele. Ordered tumour
        #    suppressors first, then by how much the panel says the gene matters.
        complete = [by_gene[g] for g in known if g in second]
        complete.sort(key=lambda r: (-r["tsg"], r["effect_mean"]))
        # Genes with a second hit that DepMap has never screened still belong in the answer.
        for g in loh:
            if g in second and g not in by_gene:
                complete.append({"gene": g, "tsg": 1 if g in tsg else 0, "effect_mean": None,
                                 "effect_median": None, "dep_frac": None, "n_dependent": 0,
                                 "n_lost_lines": 0, "second_hit": 1, "class": "not in the DepMap screen"})

        # 2. CYCLOPS: the gene itself is the target, and the more the panel cannot live
        #    without it the sharper the one-copy-against-two asymmetry. A gene with a
        #    second hit is NOT a candidate here -- it is already gone, there is no single
        #    copy left to squeeze.
        cyc = [r for r in rows if not r["second_hit"] and r["dep_frac"] >= 0.10]
        # A gene the lines themselves confirm is worse at one copy outranks one that is
        # merely essential: the first has been asked the question, the second has not.
        cyc.sort(key=lambda r: (-r["cn_confirmed"], r["effect_mean"], -r["dep_frac"]))
        cyc = cyc[:top_n]

        # 3. A BACKGROUND THAT CAN BE SCORED. The third-gene model needs cell lines that
        #    carry the same losses; a background of genes DepMap never sees lost returns
        #    nothing, and there is no way to know that before running it. Two hits first
        #    (those are real losses), then tumour suppressors, then whatever the panel
        #    actually carries -- and only genes with lines behind them.
        def bg_rank(r):
            return (-r["second_hit"], -r["tsg"], -r["n_lost_lines"])

        pool = [r for r in rows if r["n_lost_lines"] >= MIN_BG_LINES]
        pool.sort(key=bg_rank)
        background = [r["gene"] for r in pool[:MAX_BACKGROUND]]

        notes = []
        if missing:
            notes.append("%d gene(s) in the tracts are not in the DepMap screen and could not be scored." % missing)
        notes.append("Loss of heterozygosity leaves ONE working copy; it is not a lost gene. "
                     "A gene here is a complete loss only where a variant has also broken the copy that remains.")
        notes.append("Single-copy dependence reads the other way round from a third-gene hit: a gene the panel "
                     "cannot live without is the BEST candidate, because normal tissue keeps two copies and "
                     "tolerates partial inhibition while the tumour, on one, does not.")
        if cn_stats is None:
            notes.append("This bundle has no copy-number lane, so the dosage question was not asked: the "
                         "candidates are ranked on essentiality alone. Rebuild with build-depmap-sl.py to "
                         "add cn.npy and the test runs.")
        else:
            conf = sum(1 for r in cyc if r["cn_confirmed"])
            tested = sum(1 for r in cyc if r["cn_fdr"] is not None)
            notes.append("The dosage question was asked directly of %d of these %d candidates, in the %d cell "
                         "lines DepMap has copy number for: is the knockout worse in the lines that are "
                         "themselves down to one copy? %d came back yes at FDR %.2f. Copies are read against "
                         "each line's own ploidy, lines with no copies at all are excluded, and lineage is "
                         "regressed out first."
                         % (tested, len(cyc), out["cn_models"], conf, CN_FDR))
            notes.append("A candidate the lines do not confirm is still reported: thirty hemizygous lines is a "
                         "small test, and the patient's own tract is evidence the panel does not have.")
            notes.append("The known CRISPR copy-number artefact runs the OTHER way: fewer copies means fewer "
                         "cut sites and less cutting toxicity, which would make a hemizygous line look LESS "
                         "dependent. A gene that comes out more dependent there has done so against that bias.")
            notes.append("Read what the two halves each contribute. Dosage sensitivity is a property of the GENE, "
                         "not of this tumour: run the same test over the essential genes of a chromosome with no "
                         "loss at all and roughly half of them confirm too. What makes a candidate here specific "
                         "to this patient is the tract -- the screen says the gene cannot spare a copy, the "
                         "patient's genome says this tumour has only one. Neither half is the finding alone.")
        if not background:
            notes.append("No gene in the tracts is lost often enough in DepMap to build a background on, so a "
                         "third-gene run over these would have no lines to score.")
        out["ok"] = True
        out["complete"] = json.dumps(complete)
        out["cyclops"] = json.dumps(cyc)
        out["background"] = json.dumps(background)
        out["notes"] = json.dumps(notes)
        works.msg("%d complete loss(es), %d single-copy candidate(s), background of %d"
                  % (len(complete), len(cyc), len(background)))

works.resolve(out)

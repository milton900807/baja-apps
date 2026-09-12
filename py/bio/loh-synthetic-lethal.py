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

WHAT THIS CANNOT SAY: the copy-number-conditioned test -- is the dependency measurably
stronger in the cell lines that are themselves hemizygous for this gene -- needs DepMap's
copy-number matrix, which is not in the bundle. Essentiality across the panel is the
standard way CYCLOPS candidates are prioritized, and it is what is reported here; the
single-copy half of the argument comes from the patient's own tract, not from the screen.

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
import os

import numpy as np

from ion import works

DEP_CUT = -0.5           # a line "depends on" a gene below this Chronos effect
PAN_FRAC = 0.90          # dependent in this share of lines: essential everywhere
COMMON_FRAC = 0.50
MAX_BACKGROUND = 12      # what synthetic-lethal-targets.py will accept
MIN_BG_LINES = 15        # a background gene nothing else carries cannot be scored
MAX_GENES = 4000

out = {"ok": False, "complete": "[]", "cyclops": "[]", "background": "[]",
       "notes": "[]", "n_models": 0, "n_genes": 0, "error": None}


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
    n_models, n_genes = G.shape
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
            rows.append({"gene": g, "tsg": 1 if g in tsg else 0,
                         "effect_mean": round(float(eff_mean[j]), 4),
                         "effect_median": round(float(eff_med[j]), 4),
                         "dep_frac": round(float(dep_frac[j]), 4),
                         "n_dependent": int(dep_n[j]),
                         "n_lost_lines": int(lost_n[j]),
                         "second_hit": 1 if g in second else 0,
                         "class": klass})
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
        cyc.sort(key=lambda r: (r["effect_mean"], -r["dep_frac"]))
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
        notes.append("Essentiality across the panel is how these are prioritized. Whether the dependency is "
                     "measurably stronger in lines that are themselves hemizygous needs DepMap's copy-number "
                     "matrix, which is not in this bundle; the single-copy half of the argument comes from "
                     "the patient's own tract.")
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

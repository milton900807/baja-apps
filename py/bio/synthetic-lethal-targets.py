"""Higher-order synthetic-lethal targets for a set of genes a tumor has lost.

THE QUESTION. A tumor has lost some genes -- the loss matrix says which. Is there a gene
that cancer cells CANNOT survive losing, given those losses, that normal cells can? That
gene is a drug target that hits the tumor and spares the patient. BRCA + PARP is the
famous pair; this looks for the next ones, in higher order: for every pair of the lost
genes, the third gene that becomes selectively essential in cell lines that have lost the
same two.

THE ENGINE is the third-gene model from the ppset toolkit (src/predict/rank_targets.py),
rewritten on numpy alone because the server has no pandas or scipy. For a background --
one lost gene, or a pair -- the cell lines carrying that loss are marked, and every gene's
CRISPR knockout effect is regressed on that mark after both are residualized on the lines'
tissue of origin (lineage), so a vulnerability of one cancer type is not mistaken for a
consequence of the losses. A strongly negative t means the knockout hurts the double-loss
lines more than the rest. Each hit is then decomposed into its single-loss parts: a
genuine higher-order interaction needs BOTH losses; most are driven by one of them with
the other a passenger, and the answer says which.

Across backgrounds the targets are aggregated: a gene that surfaces for several pairs of
this tumor's losses outranks one that surfaces once. That recurrence is what a single
genome offers that a cell-line panel does not.

Reads the bundle build-depmap-sl.py wrote to reference_data/depmap (per box).

Params (after the EngineMonitor):
    param(1) : JSON { genes: [symbol, ...], tissue: OncotreeLineage or "",
                      disease: OncotreePrimaryDisease or "", top: N }
               tissue is the ORGAN (Breast); disease is the CANCER TYPE (Invasive Breast
               Carcinoma). Either may be given; disease wins when both are.

    param(1) also takes { drop_pan_essential: true|false } (default true): move targets that
               are essential everywhere and have no real window into `dropped` instead of
               `targets`. Both lists always come back, so nothing disappears silently.

Resolves:
    { ok, targets, dropped, backgrounds, lineages, notes, n_models, n_genes, error }
  targets     JSON array, best first: { target, n_backgrounds, best_t, min_fdr,
              eff_double, eff_none, window, synergy, interpretation,
              backgrounds: [{genes, t, fdr, eff_double, eff_none, window, n_none,
              eff_in_tissue, interpretation}], eff_in_tissue }
              eff_none is the mean effect in lines carrying NEITHER loss and window is
              eff_double - eff_none: the therapeutic window, negative and large being a
              target the carriers need and everything else can do without.
  backgrounds JSON array: { genes: [...], n_lines, status, n_hits }
  lineages    JSON array of { lineage, n_lines } among the lines carrying any selected loss
  diseases    JSON array of { disease, n_lines }, the same for the cancer type
"""
import json
import math
import os

import numpy as np

from ion import works

MIN_DOUBLE = 15          # cell lines carrying the background, below which it is not scored
MIN_SINGLE = 15
FDR_MAX = 0.25
EFF_MAX = -0.4           # a target must actually be essential in the background lines
PER_BACKGROUND = 60      # hits kept per background before aggregation
MAX_GENES = 12           # 66 pairs; each background is one matrix-vector product
# PAN-ESSENTIAL TARGETS WITH NO WINDOW. A gene the cell needs whatever it has lost scores a
# huge t and a huge effect and is worthless as a drug: it kills the tumour and the patient
# together. The t only says the dependency is DEEPER in the carriers; how much of the
# killing the losses actually account for is window / eff_double, and when that fraction is
# small the rest is unconditional lethality. These are set aside rather than deleted, with
# the reason attached, because a screen that shows no window is not proof there is none --
# an MTA-cooperative PRMT5 inhibitor makes a window CRISPR knockout cannot show.
DEP_CUT = -0.5           # a line depends on a gene below this
PAN_FRAC = 0.85          # dependent in this share of ALL lines: essential everywhere
PAN_EFF = -0.6           # or this essential in the lines carrying NEITHER loss
MIN_WINDOW = -0.3        # a window shallower than this is not a window
MIN_SELECTIVITY = 0.5    # and it must be at least this much of the total killing

out = {"ok": False, "targets": "[]", "dropped": "[]", "backgrounds": "[]", "lineages": "[]",
       "diseases": "[]", "notes": "[]", "n_models": 0, "n_genes": 0, "error": None}


def bundle_dir():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, "reference_data", "depmap")
        if os.path.exists(os.path.join(p, "gene_effect.npy")):
            return p
    return ""


def norm_sf(z):
    """Two-sided p from a normal approximation: with a thousand lines the t is normal."""
    return math.erfc(abs(z) / math.sqrt(2.0))


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


raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
want = [str(g).strip().upper() for g in (req.get("genes") or []) if str(g).strip()]
want = list(dict.fromkeys(want))
tissue = str(req.get("tissue") or "").strip()
disease = str(req.get("disease") or "").strip()
try:
    top_n = max(5, min(200, int(req.get("top") or 40)))
except Exception:
    top_n = 40
drop_pan = req.get("drop_pan_essential")
drop_pan = True if drop_pan is None else bool(drop_pan)

bd = bundle_dir()
if not want:
    out["error"] = "no genes were given"
elif not bd:
    out["error"] = ("the DepMap bundle is not on this server: run py/bio/build-depmap-sl.py once "
                    "(it downloads the public DepMap tables and writes reference_data/depmap)")
elif len(want) > MAX_GENES:
    out["error"] = "at most %d genes at a time (%d given)" % (MAX_GENES, len(want))
else:
    works.msg("Loading the DepMap dependency bundle…")
    # POSITIONAL FILES. genes.txt is the gene_effect column order and lineage.txt the row
    # order, one line each; a blank line is a real entry (a column with no symbol), so
    # nothing is filtered -- dropping one shifted every gene after it by a column.
    genes = [g.strip() for g in open(os.path.join(bd, "genes.txt")).read().rstrip("\n").split("\n")]
    lin = [g.strip() for g in open(os.path.join(bd, "lineage.txt")).read().rstrip("\n").split("\n")]
    dpath = os.path.join(bd, "disease.txt")
    dis = ([g.strip() for g in open(dpath).read().rstrip("\n").split("\n")] if os.path.exists(dpath) else [])
    G = np.load(os.path.join(bd, "gene_effect.npy"), mmap_mode="r")
    L = np.load(os.path.join(bd, "lof.npy"), mmap_mode="r")
    n_models, n_genes = G.shape
    lin = (lin + [""] * n_models)[:n_models]
    dis = (dis + [""] * n_models)[:n_models]
    gidx = {g.upper(): i for i, g in enumerate(genes)}
    notes = []

    known = [g for g in want if g in gidx]
    unknown = [g for g in want if g not in gidx]
    if unknown:
        notes.append("Not in the DepMap screen, so not usable as a background: " + ", ".join(unknown) + ".")
    if not known:
        out["error"] = "none of the given genes is in the DepMap screen"
    else:
        # Residualize every gene's dependency on lineage ONCE (Frisch-Waugh-Lovell): the
        # same design matrix serves every background.
        works.msg("Correcting %d genes x %d cell lines for tissue of origin…" % (n_genes, n_models))
        cats = sorted(set(lin))
        D = np.zeros((n_models, len(cats) + 1), dtype=np.float64)
        D[:, 0] = 1.0
        ci = {c: k + 1 for k, c in enumerate(cats)}
        for i, c in enumerate(lin):
            D[i, ci[c]] = 1.0
        Gd = np.asarray(G, dtype=np.float32)
        # How essential every gene is across the WHOLE panel, which is the honest test of
        # "needed whatever you have lost" -- eff_none is only the lines outside one
        # background, and a target can look tolerable there and be essential everywhere.
        eff_all = Gd.mean(0)
        dep_all = (Gd < DEP_CUT).mean(0)
        beta, _, rank, _ = np.linalg.lstsq(D, Gd.astype(np.float64), rcond=None)
        Xr = (Gd - (D @ beta).astype(np.float32))
        ss_x = (Xr.astype(np.float64) ** 2).sum(0)
        dfree = max(10, n_models - rank - 1)

        lofs = {g: np.asarray(L[:, gidx[g]], dtype=bool) for g in known}
        any_loss = np.zeros(n_models, dtype=bool)
        for g in known:
            any_loss |= lofs[g]
        # Lineages among the lines carrying any of these losses, so a caller can offer a
        # tissue that will actually have lines in it.
        lc = {}
        for i in np.where(any_loss)[0]:
            lc[lin[i]] = lc.get(lin[i], 0) + 1
        lineages = sorted(({"lineage": k or "(unknown)", "n_lines": v} for k, v in lc.items()),
                          key=lambda x: -x["n_lines"])
        dc = {}
        for i in np.where(any_loss)[0]:
            if dis[i]:
                dc[dis[i]] = dc.get(dis[i], 0) + 1
        diseases = sorted(({"disease": k, "n_lines": v} for k, v in dc.items()), key=lambda x: -x["n_lines"])
        # THE SPOTLIGHT is a cancer type when one is given, else a tissue. A cancer type is
        # the narrower question -- pancreatic adenocarcinoma rather than the pancreas -- and
        # is what a target has to hold up in.
        if disease:
            tis_mask = np.array([x == disease for x in dis], dtype=bool)
            if not tis_mask.any():
                notes.append('No DepMap line has cancer type "%s"; its effects are blank.' % disease)
        elif tissue:
            tis_mask = np.array([x == tissue for x in lin], dtype=bool)
            if not tis_mask.any():
                notes.append('No DepMap line has lineage "%s"; tissue effects are blank.' % tissue)
        else:
            tis_mask = None

        # The backgrounds: every pair of the lost genes, and each gene alone. A single gene
        # is the chapter-2 engine; a pair is the chapter-4 one. Both are reported, so a
        # tumor with one usable loss still gets an answer, and a pair's passenger is visible
        # next to its driver.
        backgrounds = []
        for i in range(len(known)):
            backgrounds.append([known[i]])
        for i in range(len(known)):
            for j in range(i + 1, len(known)):
                backgrounds.append([known[i], known[j]])

        agg = {}
        bg_out = []
        sev = {"genuine higher-order": 0, "driven": 1, "weak": 2, "single-loss": 1}
        for bi, bg in enumerate(backgrounds):
            mask = np.ones(n_models, dtype=bool)
            for g in bg:
                mask &= lofs[g]
            n = int(mask.sum())
            need = MIN_DOUBLE if len(bg) == 2 else MIN_SINGLE
            rec = {"genes": bg, "n_lines": n, "status": "", "n_hits": 0}
            if n < need:
                rec["status"] = "too few cell lines (%d, need %d)" % (n, need)
                bg_out.append(rec)
                continue
            works.msg("Scoring %s (%d cell lines, %d of %d)…" % ("+".join(bg), n, bi + 1, len(backgrounds)))
            y = mask.astype(np.float64)
            yb, *_ = np.linalg.lstsq(D, y, rcond=None)
            yr = y - D @ yb
            ss_y = float((yr ** 2).sum())
            r = (Xr.astype(np.float64).T @ yr) / np.sqrt(ss_x * ss_y + 1e-12)
            t = r * np.sqrt(dfree / np.clip(1 - r ** 2, 1e-9, None))
            p = np.array([norm_sf(z) for z in t])
            fdr = bh_fdr(p)
            eff_double = Gd[mask].mean(0)
            # THE THERAPEUTIC WINDOW. A target is only selective if cells WITHOUT these
            # losses can do without it: a pan-essential gene is lethal to the tumour and to
            # the patient alike. eff_none is the mean knockout effect in the lines carrying
            # NEITHER loss, and window = eff_double - eff_none is how much deeper the
            # dependency runs in the carriers. Negative and large is what a drug wants.
            neither = ~mask.copy()
            for g in bg:
                neither &= ~lofs[g]
            eff_none = Gd[neither].mean(0) if neither.sum() >= 5 else np.full(n_genes, np.nan, dtype=np.float32)
            with np.errstate(invalid="ignore"):
                window = eff_double - eff_none
            if len(bg) == 2:
                a_only = lofs[bg[0]] & ~lofs[bg[1]]
                b_only = ~lofs[bg[0]] & lofs[bg[1]]
                eff_a = Gd[a_only].mean(0) if a_only.sum() >= 5 else np.full(n_genes, np.nan, dtype=np.float32)
                eff_b = Gd[b_only].mean(0) if b_only.sum() >= 5 else np.full(n_genes, np.nan, dtype=np.float32)
                with np.errstate(invalid="ignore"):
                    worse = np.nanmin(np.vstack([eff_a, eff_b]), axis=0)
                synergy = eff_double - worse
            else:
                eff_a = eff_b = None
                synergy = np.full(n_genes, np.nan, dtype=np.float32)
            eff_t = None
            if tis_mask is not None:
                m2 = tis_mask & mask
                if m2.sum() >= 3:
                    eff_t = Gd[m2].mean(0)
            own = set(gidx[g] for g in bg)
            keep = np.where((t < 0) & (eff_double < EFF_MAX) & (fdr <= FDR_MAX))[0]
            keep = [k for k in keep if k not in own]
            keep.sort(key=lambda k: t[k])
            keep = keep[:PER_BACKGROUND]
            rec["status"] = "scored"
            rec["n_hits"] = len(keep)
            bg_out.append(rec)
            for k in keep:
                if len(bg) == 2:
                    if not (t[k] < -3 and eff_double[k] < EFF_MAX):
                        interp = "weak"
                    elif (not np.isnan(synergy[k])) and synergy[k] < -0.1 and t[k] < -3.5:
                        interp = "genuine higher-order"
                    else:
                        ea, eb = eff_a[k], eff_b[k]
                        drv = bg[0] if (not np.isnan(ea) and ea <= np.nanmin([eb if not np.isnan(eb) else 0.0, 0.0])) else bg[1]
                        interp = "driven by " + drv
                else:
                    interp = "single-loss" if (t[k] < -3 and eff_double[k] < EFF_MAX) else "weak"
                hit = {"genes": bg, "t": round(float(t[k]), 2), "fdr": float("%.3g" % fdr[k]),
                       "eff_double": round(float(eff_double[k]), 3),
                       "eff_none": (None if np.isnan(eff_none[k]) else round(float(eff_none[k]), 3)),
                       "window": (None if np.isnan(window[k]) else round(float(window[k]), 3)),
                       "n_none": int(neither.sum()),
                       "synergy": (None if np.isnan(synergy[k]) else round(float(synergy[k]), 3)),
                       "eff_in_tissue": (None if eff_t is None or np.isnan(eff_t[k]) else round(float(eff_t[k]), 3)),
                       "interpretation": interp}
                a = agg.get(k)
                if a is None:
                    a = agg[k] = {"target": genes[k], "n_backgrounds": 0, "n_pairs": 0, "best_t": 0.0, "min_fdr": 1.0,
                                  "eff_double": 0.0, "synergy": None, "interpretation": "weak",
                                  "eff_in_tissue": None, "eff_none": None, "window": None,
                                  "eff_all": round(float(eff_all[k]), 3),
                                  "dep_frac_all": round(float(dep_all[k]), 3), "backgrounds": []}
                a["n_backgrounds"] += 1
                if len(bg) == 2:
                    a["n_pairs"] += 1
                a["backgrounds"].append(hit)
                if hit["t"] < a["best_t"]:
                    a["best_t"] = hit["t"]
                    a["eff_double"] = hit["eff_double"]
                    a["eff_in_tissue"] = hit["eff_in_tissue"]
                    a["eff_none"] = hit["eff_none"]
                if hit["window"] is not None and (a["window"] is None or hit["window"] < a["window"]):
                    a["window"] = hit["window"]
                a["min_fdr"] = min(a["min_fdr"], hit["fdr"])
                if hit["synergy"] is not None and (a["synergy"] is None or hit["synergy"] < a["synergy"]):
                    a["synergy"] = hit["synergy"]
                cur = a["interpretation"]
                k1 = "driven" if interp.startswith("driven") else interp
                k0 = "driven" if cur.startswith("driven") else cur
                if sev.get(k1, 9) < sev.get(k0, 9):
                    a["interpretation"] = interp

        targets = list(agg.values())
        # THE FILTER. Pan-essential is judged on the whole panel first and on the lines
        # carrying neither loss second; the window then has to be both deep enough to matter
        # and a large enough share of the total killing to be what is doing the killing.
        def verdict(a):
            # Selectivity is worth knowing for every target, not only the ones this rejects:
            # it is the share of the killing the losses account for, and a reader comparing
            # two kept targets wants it as much as the filter does.
            w, e = a["window"], a["eff_double"]
            sel = (abs(w) / abs(e)) if (w is not None and e) else 0.0
            a["selectivity"] = round(float(sel), 3)
            pan_panel = a["dep_frac_all"] >= PAN_FRAC
            pan_none = a["eff_none"] is not None and a["eff_none"] <= PAN_EFF
            if not (pan_panel or pan_none):
                return None
            why = ("essential in %d%% of all cell lines" % round(100 * a["dep_frac_all"])) if pan_panel else \
                  ("effect %.2f in the lines carrying neither loss" % a["eff_none"])
            if w is None:
                return why + ", and no window could be measured"
            if w > MIN_WINDOW:
                return why + ", and the window is only %.2f" % w
            if sel < MIN_SELECTIVITY:
                return (why + ", and the losses account for only %d%% of the killing (window %.2f of effect %.2f)"
                        % (round(100 * sel), w, e))
            return None

        dropped = []
        if drop_pan:
            kept = []
            for a in targets:
                why = verdict(a)
                if why:
                    a["dropped_because"] = why
                    dropped.append(a)
                else:
                    kept.append(a)
            targets = kept
        else:
            for a in targets:
                why = verdict(a)
                if why:
                    a["pan_essential_note"] = why
        if drop_pan:
            # The kept ones still need their selectivity filled in.
            for a in targets:
                if "selectivity" not in a:
                    verdict(a)
        # A genuine three-way hit first, then how many of this tumor's backgrounds it
        # recurs in, then the strongest t.
        rank_of = lambda a: (0 if a["interpretation"] == "genuine higher-order" else 1,
                             -a["n_pairs"], -a["n_backgrounds"], a["best_t"])
        targets.sort(key=rank_of)
        dropped.sort(key=rank_of)
        for a in targets + dropped:
            a["backgrounds"].sort(key=lambda h: h["t"])
        scored = [b for b in bg_out if b["status"] == "scored"]
        if not scored:
            notes.append("No background had enough DepMap cell lines carrying it; nothing could be scored.")
        notes.append("Dependency is the DepMap CRISPR knockout effect (Chronos): more negative means the "
                     "cell line needs the gene more. t is the lineage-corrected difference between lines "
                     "carrying the background and the rest; a 'genuine higher-order' target needs BOTH "
                     "losses, a 'driven by X' target is explained by X alone with the other loss a passenger.")
        notes.append("The therapeutic window is eff_double minus eff_none: how much deeper the dependency runs "
                     "in cells carrying the losses than in cells carrying neither. A target with a strongly "
                     "negative eff_none is essential everywhere and would kill normal cells too, whatever its t.")
        if drop_pan:
            notes.append("%d target(s) were set aside as essential everywhere with no real window: dependent in "
                         "%d%% or more of all cell lines (or %.1f or worse in the lines carrying neither loss), "
                         "and either a window shallower than %.1f or one accounting for less than %d%% of the "
                         "killing. They are listed separately with the reason, not deleted: a screen that shows "
                         "no window is not proof there is none."
                         % (len(dropped), round(100 * PAN_FRAC), PAN_EFF, MIN_WINDOW, round(100 * MIN_SELECTIVITY)))
        else:
            notes.append("Pan-essential targets were NOT filtered out; the ones that would have been are marked "
                         "with pan_essential_note.")
        out["ok"] = True
        out["targets"] = json.dumps(targets[:top_n])
        out["dropped"] = json.dumps(dropped[:top_n])
        out["backgrounds"] = json.dumps(bg_out)
        out["lineages"] = json.dumps(lineages[:40])
        out["diseases"] = json.dumps(diseases[:60])
        out["notes"] = json.dumps(notes)
        out["n_models"] = int(n_models)
        out["n_genes"] = int(n_genes)
        works.msg("%d candidate target(s) across %d scored background(s)%s"
                  % (len(targets), len(scored),
                     (", %d set aside as essential everywhere" % len(dropped)) if dropped else ""))

works.resolve(out)

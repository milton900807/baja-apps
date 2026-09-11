"""What the ppset higher-order synthetic-lethality model has ALREADY found for these losses.

Two ways to ask the third-gene model. synthetic-lethal-targets.py re-runs its engine live
on the DepMap bundle for whatever pairs a tumour has lost. This one consults the model's
own published output instead -- the systematic scan across every pair of the fourteen
tumour suppressors it screens (FDR < 0.1, one row per target, each hit classified genuine
3-way or driven by one loss), the per-tissue application tables (breast and pancreas
backgrounds, with the dependency inside that tissue), the single-loss screens for PTEN,
ARID1A and SMARCA4, and the full pair screens for TP53+RB1 and MTAP+CDKN2A -- which is
the reference the chapters were written from. The live engine and the catalogue should
agree; where they do not, the catalogue is the result that was checked by hand.

The bundle is reference_data/depmap/higher_order_model.json, written by hand from
~/ml/ppset (thirdgene_model_targets.csv, dev/results/predictions/*_targets.csv,
sl_<gene>_v2.csv, thirdgene_<pair>.csv) and shipped with deploy-software.sh --data depmap.

Params (after the EngineMonitor):
    param(1) : JSON { genes: [symbol, ...], tissue: "" | OncotreeLineage }

Resolves:
    { ok, matched, partial, tissue_tables, single_screens, pair_screens, backgrounds, notes, built, error }
  matched        catalogue rows whose background lies WITHIN the selection
  partial        catalogue rows with ONE background gene in the selection (what a second loss would add)
  tissue_tables  [{ tissue, background, rows }] for backgrounds within the selection (all tissues,
                 the requested one first)
  single_screens { GENE: rows } for selected genes that have a single-loss screen
  pair_screens   { "A+B": rows } for pairs within the selection that have a full screen
  backgrounds    every catalogued background, with how many of its genes are selected
"""
import json
import os

from ion import works

out = {"ok": False, "matched": "[]", "partial": "[]", "tissue_tables": "[]", "single_screens": "{}",
       "pair_screens": "{}", "backgrounds": "[]", "notes": "[]", "built": "", "error": None}


def bundle_path():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, "reference_data", "depmap", "higher_order_model.json")
        if os.path.exists(p):
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
want = [str(g).strip().upper() for g in (req.get("genes") or []) if str(g).strip()]
want = list(dict.fromkeys(want))
sel = set(want)
tissue = str(req.get("tissue") or "").strip()

path = bundle_path()
if not want:
    out["error"] = "no genes were given"
elif not path:
    out["error"] = ("the higher-order model catalogue is not on this server "
                    "(reference_data/depmap/higher_order_model.json; ship it with deploy-software.sh --data depmap)")
else:
    works.msg("Reading the higher-order model catalogue for %s…" % ", ".join(want))
    try:
        B = json.load(open(path))
    except Exception as e:
        B = None
        out["error"] = "the catalogue could not be read: %s" % e
    if B:
        def bg_genes(s):
            return [g.strip().upper() for g in str(s or "").split("+") if g.strip()]

        matched, partial, bgs = [], [], {}
        for r in B.get("catalogue", []):
            gs = bg_genes(r.get("background"))
            n_in = sum(1 for g in gs if g in sel)
            key = "+".join(gs)
            b = bgs.setdefault(key, {"background": key, "genes": gs, "n_selected": 0, "n_targets": 0, "n_double": r.get("n_double")})
            b["n_selected"] = n_in
            b["n_targets"] += 1
            row = dict(r)
            row["background_genes"] = gs
            if gs and n_in == len(gs):
                matched.append(row)
            elif n_in:
                row["missing"] = [g for g in gs if g not in sel]
                partial.append(row)
        matched.sort(key=lambda r: (0 if str(r.get("interpretation", "")).startswith("genuine") else 1, float(r.get("t") or 0)))
        partial.sort(key=lambda r: (0 if str(r.get("interpretation", "")).startswith("genuine") else 1, float(r.get("t") or 0)))

        tt = []
        for key, rows in (B.get("tissue_tables") or {}).items():
            tis, bg = key.split("|", 1)
            gs = bg_genes(bg)
            if gs and all(g in sel for g in gs):
                rows2 = [r for r in rows if str(r.get("target", "")).upper() not in sel]
                tt.append({"tissue": tis, "background": "+".join(gs), "genes": gs, "rows": rows2[:40],
                           "this_tissue": bool(tissue) and tis.lower() == tissue.lower()})
        tt.sort(key=lambda x: (0 if x["this_tissue"] else 1, x["tissue"], x["background"]))

        singles = {}
        for g, rows in (B.get("single_screens") or {}).items():
            if g.upper() in sel:
                singles[g.upper()] = [r for r in rows if str(r.get("gene", "")).upper() != g.upper()][:40]
        pairs = {}
        for key, rows in (B.get("pair_screens") or {}).items():
            gs = bg_genes(key)
            if gs and all(g in sel for g in gs):
                pairs["+".join(gs)] = [r for r in rows if str(r.get("gene", "")).upper() not in sel][:40]

        notes = list(B.get("notes") or [])
        screened = sorted(set(g for b in bgs.values() for g in b["genes"]))
        not_screened = [g for g in want if g not in screened and g not in singles]
        if not_screened:
            notes.append("Not among the tumour suppressors the model's systematic scan covers, so no catalogued "
                         "background includes them: " + ", ".join(not_screened) + ". The live screen can still take them.")
        if not matched and not tt and not singles and not pairs:
            notes.append("No catalogued background lies within this selection." + (" Backgrounds one loss away are listed." if partial else ""))
        out["ok"] = True
        out["matched"] = json.dumps(matched)
        out["partial"] = json.dumps(partial)
        out["tissue_tables"] = json.dumps(tt)
        out["single_screens"] = json.dumps(singles)
        out["pair_screens"] = json.dumps(pairs)
        out["backgrounds"] = json.dumps(sorted(bgs.values(), key=lambda b: (-b["n_selected"], b["background"])))
        out["notes"] = json.dumps(notes)
        out["built"] = str(B.get("built") or "")
        works.msg("%d catalogued target(s) within the selection, %d one loss away" % (len(matched), len(partial)))

works.resolve(out)

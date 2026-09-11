"""Paralog partners predicted to become essential when a lost gene's paralog is gone.

THE OTHER HALF OF THE QUESTION. The third-gene screen (synthetic-lethal-targets.py) finds
what the DepMap panel SHOWS: a gene more essential in the cell lines that carry a tumor's
losses. It needs enough lines carrying each loss to see anything. This is the trained
model from the ppset toolkit instead -- the paralog synthetic-lethality classifier, gradient
boosted trees over generalizable pair features (sequence identity, family size, the
partner's own essentiality, co-dependency, co-expression, normal-tissue expression from
GTEx, BioPlex interaction) -- which PREDICTS, for a gene that is lost, which of its paralogs
becomes the surviving copy the cell cannot do without. It answers for genes the panel has
too few lines to screen, and it reads off a table, so it costs nothing at request time.

The table is the model's scoring of every human paralog pair
(paralog_SL_predictions_v2.csv, trimmed to reference_data/depmap/paralog_sl.tsv by hand):
one row per (A lost, B target), `pred` the probability that B becomes essential when A is
lost, `SL` the DepMap-derived training label. Round it, do not re-run it: the model's
features need GTEx and BioPlex, which this server does not hold.

Params (after the EngineMonitor):
    param(1) : JSON { genes: [symbol, ...], min_pred: 0.0-1.0 (default 0.2), top: N per gene }

Resolves:
    { ok, partners, genes, notes, error }
  partners  JSON: { GENE: [{ partner, pred, label, identity, family, partner_ess, loss_freq,
                    codep, coexpr, gtex_med, gtex_breadth, bioplex }, ...], ... }
  genes     JSON: [{ gene, n_paralogs, n_shown, status }]
"""
import csv
import json
import os

from ion import works

out = {"ok": False, "partners": "{}", "genes": "[]", "notes": "[]", "error": None}


def table_path():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, "reference_data", "depmap", "paralog_sl.tsv")
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
try:
    min_pred = max(0.0, min(1.0, float(req.get("min_pred") if req.get("min_pred") is not None else 0.2)))
except Exception:
    min_pred = 0.2
try:
    top = max(1, min(100, int(req.get("top") or 15)))
except Exception:
    top = 15

path = table_path()
if not want:
    out["error"] = "no genes were given"
elif not path:
    out["error"] = ("the paralog prediction table is not on this server "
                    "(reference_data/depmap/paralog_sl.tsv; ship it with deploy-software.sh --data depmap)")
else:
    works.msg("Reading the paralog predictions for %s…" % ", ".join(want))
    wanted = set(want)
    rows = {g: [] for g in want}
    with open(path, newline="") as fh:
        r = csv.reader(fh, delimiter="\t")
        head = next(r)
        col = {k: i for i, k in enumerate(head)}
        for f in r:
            if len(f) < len(head):
                continue
            a = f[col["A"]].upper()
            if a not in wanted:
                continue
            try:
                rows[a].append({
                    "partner": f[col["B"]],
                    "pred": float(f[col["pred"]]),
                    "label": int(float(f[col["SL"]] or 0)),
                    "identity": float(f[col["maxid"]]),
                    "family": int(float(f[col["famA"]] or 0)),
                    "partner_ess": float(f[col["B_ess_mean"]]),
                    "loss_freq": float(f[col["A_loss_freq"]]),
                    "codep": float(f[col["codep"]]),
                    "coexpr": float(f[col["coexpr"]]),
                    "gtex_med": float(f[col["B_gtex_med"]]),
                    "gtex_breadth": int(float(f[col["B_gtex_breadth"]] or 0)),
                    "bioplex": int(float(f[col["bioplex"]] or 0)),
                })
            except Exception:
                continue
    partners = {}
    genes = []
    for g in want:
        lst = sorted(rows[g], key=lambda x: -x["pred"])
        shown = [x for x in lst if x["pred"] >= min_pred][:top]
        if not lst:
            status = "no paralog in the table (a singleton gene, or not protein-coding)"
        elif not shown:
            status = "%d paralog(s), none predicted at or above %.0f%%" % (len(lst), min_pred * 100)
        else:
            status = "scored"
        genes.append({"gene": g, "n_paralogs": len(lst), "n_shown": len(shown), "status": status})
        partners[g] = shown if shown else lst[:5]
    notes = ["pred is the paralog model's probability that the partner becomes essential once this gene "
             "is lost (trained on DepMap-derived labels; features are pair properties, not the genes' fame). "
             "A partner that is broadly expressed in normal tissue (GTEx breadth, median TPM) is the harder "
             "drug target: the point is a dependency the tumour has and normal cells do not."]
    out["ok"] = True
    out["partners"] = json.dumps(partners)
    out["genes"] = json.dumps(genes)
    out["notes"] = json.dumps(notes)
    works.msg("%d gene(s) looked up" % len(want))

works.resolve(out)

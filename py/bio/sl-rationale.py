"""Why would THIS gene be synthetically lethal with THOSE losses?

The screens say that a target is more essential in cell lines carrying a tumor's losses
(synthetic-lethal-targets.py), or that a paralog is predicted to become the surviving copy
(paralog-sl-partners.py). Neither says WHY, and the why is what decides whether a number
is worth an experiment: a target on the same pathway as the loss, with a published
precedent, is a different proposition from a statistical hit with no story.

This asks the model for that story, in a fixed shape, with the statistics handed over so
the reading is of THIS evidence and not of the gene's fame: what the target does, why each
loss would make a cell depend on it, what the numbers say (a genuine three-way hit versus
one driven by a single loss), any precedent in the literature or the clinic, the caveats,
and whether it can be drugged. It is general knowledge dressed around a specific result,
and it says so; the confidence field is the model's own, and "low" is an honest answer.

Params (after the EngineMonitor):
    param(1) : JSON {
        target: "PRMT5",
        losses: ["MTAP", "CDKN2A"],                  the selected losses (the background)
        source: "depmap" | "paralog",
        tissue: "" | OncotreeLineage,
        stats: { t, fdr, eff_double, synergy, interpretation,
                 backgrounds: [{genes, t, fdr, eff_double, synergy, interpretation}] }
              or for a paralog: { pred, identity, family, partner_ess, gtex_med, gtex_breadth, bioplex, label }
    }

Resolves:
    { ok, rationale, error }
  rationale JSON: { summary, target_role, mechanism, evidence, precedent, caveats,
                    druggability, confidence }
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

out = {"ok": False, "rationale": "{}", "error": None}

raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
target = str(req.get("target") or "").strip().upper()
losses = [str(g).strip().upper() for g in (req.get("losses") or []) if str(g).strip()]
source = str(req.get("source") or "depmap").strip().lower()
tissue = str(req.get("tissue") or "").strip()
stats = req.get("stats") if isinstance(req.get("stats"), dict) else {}

SYSTEM = (
    "You are a cancer biologist explaining a candidate synthetic-lethal relationship to a "
    "colleague who has the statistics in front of them and wants the biology. Reply with ONLY "
    "a JSON object with these string fields:\n"
    "- summary: two or three sentences: what the relationship would be and how plausible it is.\n"
    "- target_role: what the target gene's product does in a cell (complex, pathway, process).\n"
    "- mechanism: why losing the named gene(s) would leave a cell unable to survive losing the "
    "target: name the pathway, the buffering, the checkpoint, the redundant paralog, the "
    "metabolic bypass -- whatever the actual logic is. If the losses are two genes, say whether "
    "the logic needs both or is really about one of them.\n"
    "- evidence: read the statistics you were given in plain words: what the effect size, t, "
    "FDR, the therapeutic window (eff_double vs eff_none) and synergy (or the paralog model "
    "probability and features) say, and what they do not. A 'driven by X' or 'single-loss' label "
    "means the second loss is a passenger; say so. A small or absent window means the target is "
    "needed with or without the losses -- say that plainly, it decides whether the hit is "
    "selective at all.\n"
    "- precedent: any published synthetic-lethal relationship, screen, or clinical program "
    "involving this target and these losses (e.g. PRMT5 inhibitors in MTAP-deleted tumours). "
    "If you know of none, write 'No precedent I know of.' Do not invent citations.\n"
    "- caveats: why this could be wrong: cell-line versus tumour, lineage confounding, "
    "essential-everywhere targets, expression rather than deletion, small n, hotspot versus "
    "loss, and anything specific to these genes.\n"
    "- druggability: is the target druggable today (approved or clinical inhibitors, PROTACs, "
    "antisense feasibility), and would a normal cell tolerate losing it (the point of synthetic "
    "lethality is that it would).\n"
    "- confidence: one of 'high', 'medium', 'low' -- your own confidence that the relationship is "
    "real biology rather than a statistical artefact.\n"
    "Be specific and concrete; use gene and pathway names; no more than about 120 words per "
    "field. Do not pad. If the target is essential in every cell (a ribosomal protein, a core "
    "spliceosome subunit), say so in caveats and lower the confidence."
)

if not target:
    out["error"] = "no target given"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    if source == "paralog":
        ask = ("Target (the paralog predicted to become essential): %s\nLost gene: %s\n"
               "Paralog synthetic-lethality model (gradient-boosted trees over pair features) output: %s\n"
               % (target, ", ".join(losses) or "(none)", json.dumps(stats)))
    else:
        ask = ("Target: %s\nLosses in the tumour (the background): %s\n%s"
               "DepMap third-gene screen output (CRISPR Chronos gene effect; t is the lineage-corrected "
               "differential dependency between lines carrying the background and the rest; effect is "
               "the mean knockout effect in background lines, more negative = more essential; eff_none is "
               "the effect in lines carrying NEITHER loss and window = eff_double - eff_none, the "
               "therapeutic window: a target whose eff_none is already strongly negative is essential "
               "everywhere and would kill normal cells too; synergy = "
               "effect in double-loss lines minus the worse single-loss effect, negative = the pair is "
               "worse than either loss alone): %s\n"
               % (target, ", ".join(losses) or "(none)",
                  ("Tissue spotlight: %s\n" % tissue) if tissue else "", json.dumps(stats)))
    works.msg("Asking why %s would be synthetic-lethal with %s…" % (target, ", ".join(losses) or "the selection"))
    try:
        try:
            import claude_usage as _cu
            _cu.bump("sl-rationale")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 1800, "system": SYSTEM,
                  "messages": [{"role": "user", "content": ask}]},
            timeout=150,
        )
        if r.status_code != 200:
            out["error"] = "anthropic %s: %s" % (r.status_code, r.text[:300])
        else:
            data = r.json()
            txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")
            m = re.search(r"\{.*\}", txt, re.S)
            parsed = None
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    parsed = None
            if not isinstance(parsed, dict):
                out["error"] = "could not read the reply: %s" % (txt[:200] or "empty")
            else:
                fields = ["summary", "target_role", "mechanism", "evidence", "precedent", "caveats", "druggability", "confidence"]
                keep = {k: str(parsed.get(k) or "").strip() for k in fields}
                if keep["confidence"].lower() not in ("high", "medium", "low"):
                    keep["confidence"] = "low"
                keep["confidence"] = keep["confidence"].lower()
                keep["target"] = target
                keep["losses"] = losses
                keep["source"] = source
                keep["model"] = ANTHROPIC_MODEL
                out["ok"] = True
                out["rationale"] = json.dumps(keep)
                works.msg("%s: %s confidence" % (target, keep["confidence"]))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)

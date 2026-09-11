"""Therapeutic interpretation and evidence for lost genes, from the literature the model knows.

The loss matrix says which genes a tumour has lost. This asks, gene by gene, what that
loss MEANS for treatment -- is the loss a known synthetic-lethal vulnerability (BRCA loss
and PARP inhibitors), is the remaining allele or the gene's product itself a drug target,
is the loss a biomarker of sensitivity or resistance, is there a drug, is there a trial --
and how strong the evidence is behind each claim. It also asks for the publications that
carry that evidence, by first author, year and title, so the claim can be checked. Nothing
is invented on purpose: the model is told to leave a gene empty rather than guess, and
every field is one of a fixed set of labels the Refine panel filters on.

Params (after the EngineMonitor):
    param(1) : JSON { genes: [symbol, ...], context: "" | free text (tumour type, losses) }

Resolves:
    { ok, genes, notes, model, error }
  genes JSON: { GENE: { therapeutic: [labels], evidence: [labels], inhibitors: [{name, stage}],
                        trials: "…", publications: [{first_author, year, title}], summary: "…" } }
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

BATCH = 20
MAX_GENES = 400
THERAPEUTIC = ["synthetic_lethal_vulnerability", "remaining_allele_target", "sensitivity_biomarker",
               "resistance_biomarker", "existing_drug", "clinical_trial", "none"]
EVIDENCE = ["human_clinical", "in_vivo_model", "cell_knockdown", "computational_only"]

out = {"ok": False, "genes": "{}", "notes": "[]", "model": ANTHROPIC_MODEL, "error": None}

SYSTEM = (
    "You are a cancer pharmacologist annotating genes a tumour has LOST (loss-of-function variants). "
    "For every gene you are given, reply with ONLY a JSON object keyed by the gene symbol:\n"
    '{"BRCA2": {"therapeutic": ["synthetic_lethal_vulnerability","existing_drug","clinical_trial","sensitivity_biomarker"], '
    '"evidence": ["human_clinical"], "inhibitors": [{"name":"olaparib","stage":"approved"}], '
    '"trials": "PARP inhibitors approved in BRCA-mutant breast, ovarian, pancreatic and prostate cancer", '
    '"publications": [{"first_author":"Robson","year":2017,"title":"Olaparib for metastatic breast cancer in patients with a germline BRCA mutation"}], '
    '"summary": "Loss of BRCA2 creates homologous-recombination deficiency and dependence on PARP1; PARP inhibitors are approved."}}\n'
    "Fields and their ONLY allowed values:\n"
    "- therapeutic: any of " + json.dumps(THERAPEUTIC) + ". "
    "'synthetic_lethal_vulnerability' = the LOSS creates a dependency on another gene that can be drugged; "
    "'remaining_allele_target' = the gene's product itself is a drug target (inhibiting what is left, or the "
    "pathway it restrains); 'sensitivity_biomarker' / 'resistance_biomarker' = the loss predicts response or "
    "non-response to an existing therapy; 'existing_drug' = an approved or clinical-stage compound acts on "
    "this gene or its synthetic-lethal partner; 'clinical_trial' = a trial has selected patients on this "
    "gene's loss; 'none' = no known therapeutic association (then the list is exactly [\"none\"]).\n"
    "- evidence: any of " + json.dumps(EVIDENCE) + ", the STRONGEST available first: 'human_clinical' "
    "(patients), 'in_vivo_model' (xenograft / GEMM), 'cell_knockdown' (CRISPR or RNAi in cancer cells), "
    "'computational_only' (screens, predictions, associations). Empty list when therapeutic is [\"none\"].\n"
    "- inhibitors: compounds acting on the gene product or on its synthetic-lethal partner, with stage one of "
    "'approved', 'phase 3', 'phase 2', 'phase 1', 'preclinical', 'tool compound'. Empty list when none.\n"
    "- trials: one sentence, or empty string.\n"
    "- publications: up to three REAL papers you are confident exist, first author surname, year, title. "
    "Never invent a paper; an empty list is correct when you are not sure.\n"
    "- summary: one or two sentences on what the loss means therapeutically.\n"
    "Rules: include every gene you were given and no others; keep the labels exactly as listed; a gene with "
    "no therapeutic story gets therapeutic [\"none\"], evidence [], inhibitors [], publications [], and a "
    "summary saying so. The context line, when given, names the tumour type and the other losses."
)

raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
want = [str(g).strip().upper() for g in (req.get("genes") or []) if str(g).strip()]
want = list(dict.fromkeys(want))[:MAX_GENES]
context = str(req.get("context") or "").strip()[:600]

if not want:
    out["error"] = "no genes were given"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    res = {}
    notes = []
    failed = []
    batches = [want[i:i + BATCH] for i in range(0, len(want), BATCH)]
    for bi, batch in enumerate(batches):
        works.msg("Reading the therapeutic literature for %d gene(s)%s…"
                  % (len(batch), (" — part %d of %d" % (bi + 1, len(batches))) if len(batches) > 1 else ""))
        try:
            try:
                import claude_usage as _cu
                _cu.bump("gene-therapeutics")
            except Exception:
                pass
            ask = ("Genes: " + ", ".join(batch) + ("\nContext: " + context if context else ""))
            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": ANTHROPIC_MODEL, "max_tokens": 6000, "system": SYSTEM,
                      "messages": [{"role": "user", "content": ask}]},
                timeout=240,
            )
            if r.status_code != 200:
                failed.extend(batch)
                notes.append("anthropic %s on part %d: %s" % (r.status_code, bi + 1, r.text[:160]))
                continue
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
                failed.extend(batch)
                notes.append("part %d could not be read" % (bi + 1))
                continue
            for g in batch:
                e = parsed.get(g) or parsed.get(g.title()) or parsed.get(g.lower())
                if not isinstance(e, dict):
                    failed.append(g)
                    continue
                th = [str(x) for x in (e.get("therapeutic") or []) if str(x) in THERAPEUTIC]
                if not th or ("none" in th and len(th) > 1):
                    th = [x for x in th if x != "none"] or ["none"]
                ev = [str(x) for x in (e.get("evidence") or []) if str(x) in EVIDENCE]
                if th == ["none"]:
                    ev = []
                inh = []
                for x in (e.get("inhibitors") or []):
                    if isinstance(x, dict) and x.get("name"):
                        inh.append({"name": str(x.get("name"))[:80], "stage": str(x.get("stage") or "")[:40]})
                pubs = []
                for x in (e.get("publications") or [])[:3]:
                    if isinstance(x, dict) and x.get("title"):
                        pubs.append({"first_author": str(x.get("first_author") or "")[:60],
                                     "year": str(x.get("year") or "")[:8], "title": str(x.get("title") or "")[:200]})
                res[g] = {"therapeutic": th, "evidence": ev, "inhibitors": inh,
                          "trials": str(e.get("trials") or "")[:300], "publications": pubs,
                          "summary": str(e.get("summary") or "")[:500]}
        except Exception as ex:
            failed.extend(batch)
            notes.append("part %d failed: %s" % (bi + 1, ex))
    if failed:
        notes.append("No answer for: " + ", ".join(sorted(set(failed))[:40]) + ("…" if len(set(failed)) > 40 else ""))
    notes.append("Read by %s from the literature it knows; labels are fixed so the Refine panel can filter on them. "
                 "Publications are given for checking, never as proof: confirm a paper before relying on it." % ANTHROPIC_MODEL)
    out["ok"] = bool(res)
    if not res:
        out["error"] = out["error"] or "no gene could be annotated"
    out["genes"] = json.dumps(res)
    out["notes"] = json.dumps(notes)
    works.msg("%d of %d gene(s) annotated" % (len(res), len(want)))

works.resolve(out)

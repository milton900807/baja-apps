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
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

BATCH = 10               # small on purpose: a call's time is its output length, so ten genes
MAX_GENES = 400          # finish in about a third of the time twenty do
WORKERS = 8              # batches in flight at once; the API takes them concurrently
CACHE_DAYS = 120         # a gene's therapeutic story changes slowly; the cache is per gene

# SERVER-SIDE CACHE, keyed by gene. The facts asked for are about the gene, not about this
# tumour (the context line only colours the summary), so a gene answered once is answered
# for every later matrix at no cost. Lives beside the DepMap bundle, which is per box and
# writable by the exec user; a box where it cannot be written simply does not cache.
def cache_path():
    for base in ["/opt/baja-server", os.path.expanduser("~/baja-server"), os.getcwd()]:
        d = os.path.join(base, "reference_data", "depmap")
        if os.path.isdir(d):
            return os.path.join(d, "therapeutics-cache.json")
    return ""


def cache_load():
    p = cache_path()
    if not p or not os.path.exists(p):
        return {}
    try:
        c = json.load(open(p))
        return c if isinstance(c, dict) else {}
    except Exception:
        return {}


def cache_save(cache):
    p = cache_path()
    if not p:
        return
    try:
        tmp = p + ".%d.part" % os.getpid()
        with open(tmp, "w") as fh:
            json.dump(cache, fh)
        os.replace(tmp, p)
    except Exception:
        pass
THERAPEUTIC = ["synthetic_lethal_vulnerability", "remaining_allele_target", "sensitivity_biomarker",
               "resistance_biomarker", "existing_drug", "clinical_trial", "none"]
EVIDENCE = ["human_clinical", "in_vivo_model", "cell_knockdown", "computational_only"]

out = {"ok": False, "genes": "{}", "notes": "[]", "error": None}

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
    # 1. The cache answers first.
    cache = cache_load()
    now = time.time()
    fresh_after = now - CACHE_DAYS * 86400
    cached = 0
    for g in want:
        c = cache.get(g)
        if isinstance(c, dict) and isinstance(c.get("entry"), dict) and float(c.get("at") or 0) >= fresh_after:
            res[g] = c["entry"]
            cached += 1
    todo = [g for g in want if g not in res]
    if cached:
        works.msg("%d gene(s) answered from the cache; asking about %d…" % (cached, len(todo)))

    def clean(e):
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
        return {"therapeutic": th, "evidence": ev, "inhibitors": inh,
                "trials": str(e.get("trials") or "")[:300], "publications": pubs,
                "summary": str(e.get("summary") or "")[:500]}

    def ask_batch(batch):
        """One API call for one batch; returns (answers, failed_genes, note)."""
        ask = ("Genes: " + ", ".join(batch) + ("\nContext: " + context if context else ""))
        try:
            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": ANTHROPIC_MODEL, "max_tokens": 6000, "system": SYSTEM,
                      "messages": [{"role": "user", "content": ask}]},
                timeout=240,
            )
        except Exception as ex:
            return {}, list(batch), "a part failed: %s" % ex
        if r.status_code != 200:
            return {}, list(batch), "anthropic %s: %s" % (r.status_code, r.text[:160])
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
            return {}, list(batch), "a part could not be read"
        got, bad = {}, []
        for g in batch:
            e = parsed.get(g) or parsed.get(g.title()) or parsed.get(g.lower())
            if isinstance(e, dict):
                got[g] = clean(e)
            else:
                bad.append(g)
        return got, bad, ""

    # 2. The rest, in PARALLEL batches: the API takes several requests at once, and a
    #    200-gene matrix is twenty batches -- minutes one after another, well under one
    #    minute eight abreast.
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    if batches:
        try:
            import claude_usage as _cu
            for _ in batches:
                _cu.bump("gene-therapeutics")
        except Exception:
            pass
        works.msg("Reading the therapeutic literature for %d gene(s) in %d part(s), %d at a time…"
                  % (len(todo), len(batches), min(WORKERS, len(batches))))
        done = 0
        lock = threading.Lock()
        with ThreadPoolExecutor(max_workers=min(WORKERS, len(batches))) as pool:
            futs = {pool.submit(ask_batch, b): b for b in batches}
            for fut in as_completed(futs):
                try:
                    got, bad, note = fut.result()
                except Exception as ex:
                    got, bad, note = {}, list(futs[fut]), "a part failed: %s" % ex
                with lock:
                    res.update(got)
                    failed.extend(bad)
                    if note:
                        notes.append(note)
                    for g, e in got.items():
                        cache[g] = {"entry": e, "at": now, "model": ANTHROPIC_MODEL}
                    done += 1
                works.msg("%d of %d part(s) read…" % (done, len(batches)))
        if any(res.get(g) for g in todo):
            cache_save(cache)
    if failed:
        notes.append("No answer for: " + ", ".join(sorted(set(failed))[:40]) + ("…" if len(set(failed)) > 40 else ""))
    notes.append("Labels are fixed so the Refine panel can filter on them. Publications are given for checking, "
                 "never as proof: confirm a paper before relying on it.")
    out["ok"] = bool(res)
    if not res:
        out["error"] = out["error"] or "no gene could be annotated"
    out["genes"] = json.dumps(res)
    out["notes"] = json.dumps(notes)
    works.msg("%d of %d gene(s) annotated" % (len(res), len(want)))

works.resolve(out)

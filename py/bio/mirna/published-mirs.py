#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Say what is published about the miRNAs REPORTED AGAINST THIS TRANSCRIPT.

The caller has already read miRTarBase over the track (or over the selected
sequence) and knows which miRNAs are reported there, with how many sites, what
kind of evidence, and which PMIDs. That is the ground truth. This adds the one
thing a table cannot: what the published relationship actually IS.

THE MODEL NEVER SUPPLIES A miRNA, A SITE OR A SEQUENCE. It is given the list and
writes about the entries in it, by INDEX. A miRNA it has never heard of gets
"not known to me", which is a real answer about a real row; a miRNA it invents
cannot appear, because an index outside the list is dropped rather than clamped.
This matters more here than almost anywhere else in the editor: a seed sequence
or a target site recalled by a model and drawn on a track is indistinguishable
from one that was measured.

It may also name miRNAs it believes are published against this gene and are NOT
in the list. Those are returned separately, never as sites, and the caller shows
them as what they are: a recollection to go and check, with nothing behind it
here. miRTarBase is keyed by transcript, so a genuine interaction can be absent
simply because the site falls outside this transcript or this selection.

param(1): gene symbol (and transcript, free text)
param(2): JSON list [{i, mirna, sites, evidence, pmids}]
param(3): optional context (region length, whether a selection was used)
param(4): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK", "findings":[...], "missing":[...], "summary":...}
or {"status":"ERROR","error":...}.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You describe what is published about specific microRNA-target relationships. "
       "You write only about the entries you are given. Only output valid JSON.")

STRENGTH = ("established", "reported", "weak", "unknown")
MAX_MIRS = 120

INSTRUCTIONS = """
You are given a gene and the microRNAs reported against its transcript in miRTarBase,
each with how many sites, the evidence types and the PMID count behind it.

For each entry, return:

  i          its number from the list. Required. Never a name.
  finding    ONE sentence on what is published about this miRNA and this gene: what it
             does to the target, in what cell type or condition, and what it is known
             for. If you do not know this specific pair, say so plainly in the sentence
             rather than writing something generic that would be true of any miRNA.
  strength   established  a well-replicated relationship you can actually recall
             reported     published, but as far as you know a single report or a
                          large screen rather than a characterised interaction
             weak         you have reason to doubt it: a CLIP-only observation, a
                          retracted or contested paper, a miRNA mostly seen as a
                          background hit
             unknown      you do not know this pair. Use this freely. It is the honest
                          answer for most entries in most gene lists, and it is more
                          useful than a confident sentence that is not grounded.
  context    optional: the tissue, disease or process this pair is studied in, a few
             words. Omit it rather than guessing.

Then:

  missing    microRNAs you believe are published against this gene but are NOT in the
             list, each {"mirna": "...", "why": "one sentence"}. Keep this short and
             only include ones you actually recall. The list is keyed by TRANSCRIPT, so
             a real interaction can be missing because the site is outside this
             transcript or outside the selected region: that is worth saying in `why`.
             Return an empty list if none come to mind. Do not pad it.
  summary    one or two sentences: how much of this list is actually characterised,
             and which entries a person should look at first.

Rules:
- Never invent a miRNA name, a seed, a sequence or a site position.
- Do not restate the site counts, the evidence types or the PMIDs. The caller already
  shows those and it is reading from the data; you are not.
- "unknown" on most of the list is a good answer. A list where everything is
  "established" is not credible and will be read as such.

Return ONLY:
{"summary": "...", "findings": [{"i": 0, "finding": "...", "strength": "...", "context": "..."}],
 "missing": [{"mirna": "...", "why": "..."}]}
"""


def ask(model: str, gene: str, mirs: List[Dict[str, Any]], context: Any) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"gene": gene, "reported_mirnas": mirs}
    if context:
        payload["region"] = context
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": INSTRUCTIONS + "\n\n" + json.dumps(payload, ensure_ascii=False)}],
    )
    return json.loads(r.choices[0].message.content)


def _clean(out: Dict[str, Any], n: int) -> Dict[str, Any]:
    """Every finding points at a row the caller sent, or it is dropped.

    An index outside 0..n-1 is dropped and never clamped: clamping would move a
    sentence about one miRNA onto a different one, which is invisible on screen and
    wrong in the way that matters.
    """
    seen = set()
    findings: List[Dict[str, Any]] = []
    raw = out.get("findings")
    if isinstance(raw, list):
        for f in raw:
            if not isinstance(f, dict):
                continue
            try:
                i = int(f.get("i"))
            except (TypeError, ValueError):
                continue
            if i < 0 or i >= n or i in seen:
                continue
            strength = str(f.get("strength") or "").strip().lower()
            if strength not in STRENGTH:
                strength = "unknown"
            seen.add(i)
            findings.append({
                "i": i,
                "finding": str(f.get("finding") or "").strip()[:400],
                "strength": strength,
                "context": str(f.get("context") or "").strip()[:120],
            })

    missing: List[Dict[str, str]] = []
    rm = out.get("missing")
    if isinstance(rm, list):
        for m in rm[:12]:
            if isinstance(m, dict):
                name = str(m.get("mirna") or "").strip()[:60]
                why = str(m.get("why") or "").strip()[:300]
            else:
                name, why = str(m).strip()[:60], ""
            if name:
                missing.append({"mirna": name, "why": why})

    return {
        "status": "OK",
        "summary": str(out.get("summary") or "").strip()[:800],
        "findings": findings,
        "missing": missing,
    }


def _main() -> int:
    try:
        gene = str(works.param(1) or "").strip()
        raw = works.param(2)
        mirs = json.loads(raw) if isinstance(raw, str) else (raw or [])
        if not isinstance(mirs, list) or not mirs:
            works.resolve({"status": "ERROR", "error": "no reported miRNAs were sent"})
            return 0
        mirs = mirs[:MAX_MIRS]
        ctx_raw = works.param(3)
        context: Any = None
        if ctx_raw:
            try:
                context = json.loads(ctx_raw) if isinstance(ctx_raw, str) else ctx_raw
            except Exception:
                context = None
        model = str(works.param(4) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, gene or "(unnamed gene)", mirs, context), len(mirs)))
    except Exception as exc:                     # noqa: BLE001
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

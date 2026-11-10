#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ask whether any of a set of selected variants is associated with something.

The selection panel can hold thirty variants and the question a reader actually has
about them is rarely positional: "are any of these found in cancer", "do any of these
affect splicing", "is any of this known in cardiomyopathy". There is no column for
that, so this asks a model.

THE FAILURE MODE THIS IS BUILT AGAINST is gene-level contamination. Asked whether an
intronic variant in TP53 is found in cancer, a model will reason that TP53 is a cancer
gene and answer yes, which is true of the gene and says nothing about the variant. The
answer is then confidently wrong in the exact way that matters, because the reader
selected THESE variants rather than the gene. So every verdict must carry an
evidence_level saying what the claim is actually about:

    variant   this specific change is documented in that context
    gene      the GENE is, and nothing is known about this change in particular
    none      neither

and a verdict of "yes" at gene level is reported as a fact about the gene, never about
the variant. The model is told that "no" and "unsure" are correct answers and that a
plausible reconstruction is not.

WHAT THIS IS NOT. It is not a database lookup, not a literature search and not a
clinical interpretation. It is a language model's recollection, it carries no
provenance, and the caller is required to label it as such.

param(1): JSON array of variants, each
          { "i": int, "label": str, "gene": str, "hgvs": str, "rsid": str,
            "clinsig": str, "condition": str, "consequence": str,
            "chr": str, "pos": str, "ref": str, "alt": str }
param(2): the question, in the user's own words
param(3): model id (optional; default "claude-haiku-4-5")

Resolves JSON:
    { "status": "OK", "question": str, "answer": str,
      "hits": [ { "i": int, "verdict": "yes"|"no"|"unsure",
                  "evidence_level": "variant"|"gene"|"none",
                  "why": str, "confidence": "high"|"medium"|"low" } ],
      "counts": { "variant": int, "gene": int, "none": int },
      "caveats": [str] }
    { "status": "ERROR", "error": str }
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

MAX_VARIANTS = 200
# Variants per request. Thirty in one call overran the reply and came back as JSON cut off
# mid-object, which surfaced as a parse error with a character offset -- a truncation
# wearing a syntax error's clothes. Eight leaves room for eight verdicts and their reasons
# well inside the cap, and a chunk that still fails costs only its own eight.
CHUNK = 8
MAX_TOKENS = 8192

SYS = ("You answer questions about human genetic variants. You are careful to say when "
       "something is not known. Only output valid JSON.")

INSTRUCTIONS = """
You are given a QUESTION and a list of VARIANTS that someone has selected in a genome
browser. For each variant decide whether it is associated with what the question asks
about, and say what the evidence is actually about.

evidence_level is the important field:
  "variant"  this specific change is documented in that context
  "gene"     the GENE is, but nothing is documented about this particular change
  "none"     neither

Do NOT let the gene answer for the variant. An intronic or synonymous change in a
famous disease gene is not thereby associated with that disease; that is the single
most common way to be confidently wrong here. If all you know is the gene, say so with
evidence_level "gene" and make the "why" a statement about the gene.

"no" and "unsure" are correct answers. A reconstruction from the gene name, the
position or the look of the identifier is not an answer. If you do not recognise a
variant, verdict "unsure", evidence_level "none", confidence "low".

Return ONLY this JSON. Keep every "why" to ONE short sentence: the reply is capped and a
long one costs another variant its answer.
{
  "note": "<at most one sentence about this set, or an empty string>",
  "hits": [
    { "i": <the variant's i, exactly as given>,
      "verdict": "yes" or "no" or "unsure",
      "evidence_level": "variant" or "gene" or "none",
      "why": "<one sentence; for gene level, a statement about the GENE>",
      "confidence": "high" or "medium" or "low" }
  ],
  "caveats": ["<anything the reader needs to not misread this>"]
}

Include an entry for EVERY variant given, in the order given.
"""


def _salvage(text: str) -> List[Dict[str, Any]]:
    """Every complete {...} object in a truncated reply, in order.

    A reply cut off mid-object is still mostly good answers followed by half of one. The
    half is discarded and the whole ones are kept, because the alternative -- throwing the
    chunk away over its last object -- loses seven answers to save one.
    """
    out: List[Dict[str, Any]] = []
    # A STACK, NOT A DEPTH COUNTER. The verdicts are nested inside the reply's own object,
    # so a scanner that only emits what closes at depth zero emits nothing at all when the
    # outer object is the thing that got cut off -- which is exactly the case this exists
    # for. Every balanced object is read, at whatever depth, and the ones carrying an "i"
    # are the verdicts.
    starts: List[int] = []
    in_str = False
    esc = False
    for n, ch in enumerate(text or ""):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            starts.append(n)
        elif ch == "}":
            if starts:
                start = starts.pop()
                try:
                    obj = json.loads(text[start:n + 1])
                    if isinstance(obj, dict) and "i" in obj:
                        out.append(obj)
                except Exception:
                    pass
    return out


def ask_chunk(model: str, variants: List[Dict[str, Any]], question: str) -> Dict[str, Any]:
    """One request. Never raises on a bad reply: returns what could be read."""
    client = OpenAI()
    payload = {"question": question, "variants": variants}
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        max_tokens=MAX_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYS},
            {"role": "user", "content": INSTRUCTIONS + "\n\n" + json.dumps(payload, ensure_ascii=False)},
        ],
    )
    choice = r.choices[0]
    text = choice.message.content or ""
    truncated = (getattr(choice, "finish_reason", "") == "length")
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return {"hits": obj.get("hits") or [], "note": obj.get("note") or "",
                    "caveats": obj.get("caveats") or [], "truncated": truncated}
    except Exception:
        pass
    # Unparseable as a whole: keep the complete objects it did manage to finish.
    return {"hits": _salvage(text), "note": "", "caveats": [], "truncated": True}


def ask(model: str, variants: List[Dict[str, Any]], question: str) -> Dict[str, Any]:
    hits: List[Dict[str, Any]] = []
    notes: List[str] = []
    caveats: List[str] = []
    cut = 0
    for n in range(0, len(variants), CHUNK):
        part = variants[n:n + CHUNK]
        try:
            works.msg("Asking about variants " + str(n + 1) + "-" + str(n + len(part))
                      + " of " + str(len(variants)) + "…")
        except Exception:
            pass
        try:
            got = ask_chunk(model, part, question)
        except Exception as e:
            # One chunk failing is not the run failing: its variants fall through to the
            # cleaner, which reports them as not known rather than losing them.
            caveats.append("One group of variants could not be asked about: " + str(e))
            continue
        hits.extend(got.get("hits") or [])
        if got.get("note"):
            notes.append(str(got["note"]))
        caveats.extend(str(c) for c in (got.get("caveats") or []))
        if got.get("truncated"):
            cut += 1
    if cut:
        caveats.append(str(cut) + " group(s) of variants returned a cut-off reply; "
                       "what survived it was kept and the rest are reported as not known.")
    return {"hits": hits, "notes": notes, "caveats": caveats}


def _clean(out: Dict[str, Any], variants: List[Dict[str, Any]], question: str) -> Dict[str, Any]:
    known = {int(v.get("i", n)) for n, v in enumerate(variants)}
    seen, hits = set(), []
    counts = {"variant": 0, "gene": 0, "none": 0}
    for h in (out.get("hits") or []):
        try:
            i = int(h.get("i"))
        except (TypeError, ValueError):
            continue
        if i not in known or i in seen:
            continue        # a hallucinated index answers for nothing
        seen.add(i)
        verdict = str(h.get("verdict") or "unsure").strip().lower()
        if verdict not in ("yes", "no", "unsure"):
            verdict = "unsure"
        lvl = str(h.get("evidence_level") or "none").strip().lower()
        if lvl not in ("variant", "gene", "none"):
            lvl = "none"
        conf = str(h.get("confidence") or "low").strip().lower()
        if conf not in ("high", "medium", "low"):
            conf = "low"
        # A yes with no evidence behind it is not a yes. This is the gene-contamination
        # guard made structural rather than left to the prompt: a verdict that cannot say
        # what its evidence is about is downgraded, not printed.
        if verdict == "yes" and lvl == "none":
            verdict = "unsure"
        counts[lvl] += 1
        hits.append({"i": i, "verdict": verdict, "evidence_level": lvl,
                     "why": str(h.get("why") or "").strip(), "confidence": conf})
    # Anything the model silently dropped is reported as unknown rather than omitted: a
    # variant missing from the answer would otherwise read as a variant with no finding.
    for n, v in enumerate(variants):
        i = int(v.get("i", n))
        if i not in seen:
            hits.append({"i": i, "verdict": "unsure", "evidence_level": "none",
                         "why": "the lookup returned nothing for this one",
                         "confidence": "low"})
            counts["none"] += 1
    hits.sort(key=lambda h: h["i"])
    caveats = out.get("caveats") or []
    if not isinstance(caveats, list):
        caveats = [str(caveats)]

    # THE HEADLINE IS COUNTED, NOT WRITTEN. It used to be a paragraph the model produced
    # across the whole set, which is the part of the reply that grew with the number of
    # variants and the part that cannot be checked. Counting it here cannot hallucinate,
    # cannot be cut off, and cannot disagree with the cards below it, which are built from
    # the same verdicts. What the model still gets to say is kept as its own note.
    label_of = {}
    for n, v in enumerate(variants):
        label_of[int(v.get("i", n))] = str(v.get("label") or ("variant " + str(n + 1)))
    at_variant = [h for h in hits if h["verdict"] == "yes" and h["evidence_level"] == "variant"]
    at_gene = [h for h in hits if h["verdict"] == "yes" and h["evidence_level"] == "gene"]
    named = ", ".join(label_of.get(h["i"], "?") for h in at_variant[:8])
    if len(at_variant) > 8:
        named += ", and " + str(len(at_variant) - 8) + " more"
    parts = []
    if at_variant:
        parts.append("%d of the %d selected have evidence for the variant itself: %s."
                     % (len(at_variant), len(variants), named))
    else:
        parts.append("None of the %d selected have evidence for the variant itself."
                     % len(variants))
    if at_gene:
        parts.append("%d more are known at the GENE level only, which is not a finding "
                     "about the change selected here." % len(at_gene))
    notes = [str(n) for n in (out.get("notes") or []) if str(n).strip()]
    answer = " ".join(parts + notes)

    return {"status": "OK", "question": question,
            "answer": answer,
            "hits": hits, "counts": counts,
            "caveats": [str(c) for c in caveats]}


def _main() -> None:
    raw = works.param(1)
    try:
        variants = raw if isinstance(raw, list) else json.loads(raw)
        if not isinstance(variants, list):
            raise ValueError("not a list")
    except Exception as e:
        works.resolve({"status": "ERROR", "error": "param(1) must be a JSON array: " + str(e)})
        return
    question = str(works.param(2) or "").strip()
    if not question:
        works.resolve({"status": "ERROR", "error": "param(2) must be the question"})
        return
    if not variants:
        works.resolve({"status": "ERROR", "error": "no variants were given"})
        return
    truncated = len(variants) > MAX_VARIANTS
    variants = variants[:MAX_VARIANTS]
    model = works.param(3) or "claude-haiku-4-5"
    try:
        works.msg("Asking about " + str(len(variants)) + " variants…")
        res = _clean(ask(model, variants, question), variants, question)
        if truncated:
            res["caveats"].append(
                "Only the first " + str(MAX_VARIANTS) + " selected variants were asked about.")
        works.resolve(res)
    except Exception as e:
        works.resolve({"status": "ERROR", "error": str(e)})


if __name__ == "__main__":
    _main()

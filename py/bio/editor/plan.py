#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Turn a sentence into a PLAN: which of the editor's operations to run, and with what.

"load clinvar pathogenic snp indels into selected sequence"
  -> [ load_variants { db: clinvar, types: [snp, ins, del],
                       clinsig_any: [pathogenic], clinsig_not: [conflicting] } ]

THE CATALOGUE IS SENT IN, NOT WRITTEN HERE. The editor declares what it can do
(baja/manchester/menu/editor-capabilities.js) and passes those declarations to this
script, which puts them in the prompt and then validates the answer back against the
same declarations. So the set of things a model can name is exactly the set the editor
is prepared to run, and adding an operation means adding it in one place rather than
keeping a prompt and a dispatcher in step by hand.

WHAT THIS DELIBERATELY CANNOT DO. It cannot name a file, a path, a module or a
function; it cannot pass an argument that is not declared; and it cannot invent a value
for an argument whose values are enumerated. Every file under baja/ is exec-able by
path, so a model that could return a path and its arguments would be a shell on the
user's unsaved work, and no amount of inspecting the sentence that produced it would
make that safe. It returns names from a list, and _clean() drops everything else.

A BAD ARGUMENT INVALIDATES ITS STEP RATHER THAN BEING DROPPED. Dropping an
unrecognised `db` would leave a valid-looking load that fetches the wrong database and
reports it as what was asked for. Dropping an unrecognised argument NAME is different
and is fine: that is a model adding something the operation has no notion of, and the
operation's behaviour without it is still the behaviour that was asked for. The editor
shows which names were dropped.

param(1): the request
param(2): JSON catalogue: [{name, summary, needs?, destructive?, params?: {...}}]
param(3): optional JSON context about the canvas
param(4): model id (default "claude-sonnet-4-5": choosing among twenty operations and
          filling their arguments is reasoning, not form-filling)

Resolves {"status":"OK", "steps":[{capability, args}], "explain", "unsupported",
          "problems"} or {"status":"ERROR","error":…}.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List, Tuple

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You map a request about a genome editor onto operations from a catalogue supplied to you. "
       "You never name anything that is not in the catalogue. Only output valid JSON.")

MAX_STEPS = 4

INSTRUCTIONS = """
You are given a request and a CATALOGUE of operations the editor can perform. Choose the
operations that carry out the request and fill in their parameters.

Return a plan: a list of steps, in the order they should run, at most %d.

  {"steps": [{"capability": "<name from the catalogue>", "args": {...}}],
   "explain": "one short sentence saying what the plan does",
   "unsupported": ["anything asked for that no operation covers"]}

Rules, in order of importance:

1. ONLY NAMES FROM THE CATALOGUE. Never a file, a path, a module, a function, or an
   operation you think ought to exist. If nothing in the catalogue does what was asked,
   do NOT pick the nearest operation that happens to be listed: it will run, and it is
   not what was asked for. See rule 2 for what to do instead.

2. WHEN NOTHING PERFORMS THE REQUEST, OPEN THE PLACE IT LIVES. Some requests name a
   KIND of thing rather than one operation -- "show me the ML options", "what data can I
   load", "what modalities are there" -- and some ask for something specific that is not
   an operation here but is reachable from inside a shelf. In both cases, if a library in
   the catalogue contains that kind of thing, open it: the user then sees the real
   choices and clicks through. A shelf that lists the options beats a refusal.
   A NAME YOU CANNOT PLACE IS THE STRONGEST REASON TO OPEN THE SHELF, not a reason to
   refuse. "run ml motilf", "run the binding model", "use the splice thing" all name
   something the user believes exists; whether it is a typo, an old name or a model that
   was never here, the useful answer is the shelf of models with their real names on it,
   so open_library. Listing the available models inside `unsupported` and returning no
   steps tells the user what they got wrong and leaves them nowhere: it is the shelf that
   lets them act. The same holds for an unplaceable dataset name, modality or tool.
   Return an EMPTY steps list only when nothing in the catalogue, library or operation,
   has anything to do with what was asked -- exporting to a spreadsheet, changing an
   account setting. Say what is missing in `unsupported`. An empty plan with a clear
   reason is a good answer for those; it is a poor one for "show me the ML options".

3. ONLY DECLARED PARAMETERS, and for a parameter with a `values` list, only values from
   that list. Read each parameter's `about`: it often says exactly how to express a
   common request. Omit a parameter rather than guessing it. Never invent a parameter.

4. SEVERAL REGIONS IS SEVERAL STEPS. "select exon 15 and exon 16", "select the 5' and
   3' UTRs", "select exons 2 through 4" each name more than one region, and a selection
   holds as many as it is given: one select_sequence_region per region, the first with
   `add` omitted and every one after it with `add` true. This is not an exception to the
   rule below -- it is the fewest steps that do the job, because one step cannot carry
   two regions.

5. FEWEST STEPS THAT DO THE JOB. Most requests are one operation. Check whether a single
   operation's parameters already cover the whole request before reaching for a second
   step: "load clinvar pathogenic snps and indels over the selection" is ONE load with
   its class and significance parameters filled, not a load followed by a selection.
   Use several steps only when the request genuinely has stages ("load clinvar, then
   select the ones in TP53").

6. COMPARING IS NOT SELECTING. "compare the sequences between exon 16 on both tracks",
   "how similar are these", "what is different between them" ask for a COMPARISON and
   are answered by compare_sequences, with the region named if the request names one.
   Selecting that region on each track is not a compromise, it is a different request:
   it leaves the user looking at two highlighted stretches and no answer.

7. FINDING IS NOT COMPARING. compare_sequences aligns two things and says how similar
   they are. search_region_in_track takes ONE region and finds where it turns up in
   another track, ranked. "compare exon 16 of A with any other part of B and rank the
   results", "where else does this appear", "find this in that track" are all the second
   one: the giveaway is "any other part", "where", "find", "rank", or anything asking
   for places rather than for a single number.

8. A QUESTION IS NOT AN ACTION. If the request asks to be TOLD something ("are any of
   these pathogenic", "which of these hit a splice site", "what are these"), use the
   operation marked answers_a_question and nothing else. A request to CHANGE what is
   selected or present is an action. A request that asks for both ("find the pathogenic
   ones and select them") is the question: its answer offers the selection afterwards.

9. TAKING SOMETHING AWAY IS NOT BROWSING FOR IT. "remove the rna seq layers from X",
   "take the motifs off this track", "clear the layers" are remove_layers. Opening the
   library of data that can be LOADED is the opposite of what was asked, and so is
   returning no steps: there is an operation for this.

10. DESTRUCTIVE OPERATIONS ARE A LAST RESORT. An operation marked destructive deletes
   work. Only choose one when the request plainly asks for deletion ("remove", "delete",
   "get rid of"). Anything short of that, choose the selecting operation instead.

11. `needs` says what must already be on the canvas. Do not add a step to try to satisfy
   it; the editor checks and reports it. Choose the operation the request asked for.

12. Do not pad the plan. No "and then fit the view", no zooming the user did not ask for,
   nothing tidy-looking that was not requested.

Catalogue:
%s
""" % (MAX_STEPS, "%s")


def ask(model: str, request: str, catalogue: List[Dict[str, Any]],
        context: Any) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"request": request}
    if context:
        payload["canvas_now"] = context
    prompt = (INSTRUCTIONS % json.dumps(catalogue, ensure_ascii=False, indent=1)) \
        + "\n\nRequest:\n" + json.dumps(payload, ensure_ascii=False)
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": prompt}],
    )
    return json.loads(r.choices[0].message.content)


# --------------------------------------------------------------------------- validation ---

def _spec_index(catalogue: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for c in catalogue or []:
        if isinstance(c, dict) and c.get("name"):
            out[str(c["name"])] = c
    return out


def _coerce(spec: Dict[str, Any], v: Any) -> Tuple[str, Any]:
    """('ok', value) | ('skip', None) | ('bad', why).

    Mirrors coerce() in editor-capabilities.js. Both sides check, because this is the
    boundary where a model's output becomes an argument to code that edits a track, and a
    check that exists in only one of the two places is a check one refactor from being
    gone.
    """
    t = str(spec.get("type") or "")
    values = [str(x) for x in (spec.get("values") or [])]
    lower = {x.lower(): x for x in values}

    if t == "number":
        if v is None or v == "":
            return ("skip", None)
        try:
            return ("ok", float(v))
        except (TypeError, ValueError):
            return ("bad", "not a number")
    if t == "boolean":
        return ("ok", v is True or str(v).strip().lower() == "true")
    if t == "string":
        if v is None:
            return ("skip", None)
        s = str(v)[:300]
        return ("ok", s) if s != "" else ("skip", None)
    if t == "string[]":
        arr = v if isinstance(v, list) else ([] if v in (None, "") else [v])
        out = [str(x).strip() for x in arr if str(x or "").strip()][:20]
        return ("ok", out) if out else ("skip", None)
    if t == "enum":
        s = str(v or "").strip().lower()
        if not s:
            return ("skip", None)
        if s in lower:
            return ("ok", lower[s])
        return ("bad", "%r is not one of %s" % (v, ", ".join(values)))
    if t == "enum[]":
        arr = v if isinstance(v, list) else ([] if v in (None, "") else [v])
        out: List[str] = []
        bad: List[str] = []
        for x in arr:
            s = str(x or "").strip().lower()
            if not s:
                continue
            if s in lower:
                if lower[s] not in out:
                    out.append(lower[s])
            else:
                bad.append(str(x))
        if bad:
            return ("bad", "%s not among %s" % (", ".join(bad), ", ".join(values)))
        return ("ok", out) if out else ("skip", None)
    return ("bad", "unknown parameter type")


def _clean(out: Dict[str, Any], catalogue: List[Dict[str, Any]]) -> Dict[str, Any]:
    index = _spec_index(catalogue)
    steps: List[Dict[str, Any]] = []
    problems: List[str] = []

    raw = out.get("steps")
    if isinstance(raw, dict):            # a single step, not wrapped in a list
        raw = [raw]
    if not isinstance(raw, list):
        raw = []

    for item in raw[:MAX_STEPS]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("capability") or item.get("name") or "").strip()
        cap = index.get(name)
        if not cap:
            problems.append("no such operation: %s" % (name or "(unnamed)"))
            continue
        specs = cap.get("params") or {}
        given = item.get("args")
        if not isinstance(given, dict):
            given = {}
        args: Dict[str, Any] = {}
        dropped: List[str] = []
        failed = None
        for k, v in given.items():
            spec = specs.get(k)
            if not isinstance(spec, dict):
                dropped.append(str(k))
                continue
            kind, val = _coerce(spec, v)
            if kind == "bad":
                failed = "%s: %s: %s" % (name, k, val)
                break
            if kind == "ok":
                args[k] = val
        if failed:
            problems.append(failed)
            continue
        missing = [k for k, s in specs.items()
                   if isinstance(s, dict) and s.get("required") and args.get(k) is None]
        if missing:
            problems.append("%s needs %s and none was given" % (name, ", ".join(missing)))
            continue
        step: Dict[str, Any] = {"capability": name, "args": args}
        if dropped:
            step["dropped"] = dropped[:8]
        steps.append(step)

    unsupported: List[str] = []
    ru = out.get("unsupported")
    if isinstance(ru, list):
        unsupported = [str(x).strip() for x in ru if str(x or "").strip()][:8]
    elif isinstance(ru, str) and ru.strip():
        unsupported = [ru.strip()]

    if not steps and not unsupported and not problems:
        unsupported = ["nothing in the request matches an operation the editor has"]

    return {
        "status": "OK",
        "steps": steps,
        "explain": str(out.get("explain") or "").strip()[:400],
        "unsupported": unsupported,
        "problems": problems[:8],
    }


def _main() -> int:
    try:
        request = str(works.param(1) or "").strip()
        if not request:
            works.resolve({"status": "ERROR", "error": "nothing typed"})
            return 0
        raw = works.param(2)
        catalogue = json.loads(raw) if isinstance(raw, str) else (raw or [])
        if not isinstance(catalogue, list) or not catalogue:
            works.resolve({"status": "ERROR", "error": "no catalogue was sent"})
            return 0
        ctx_raw = works.param(3)
        context: Any = None
        if ctx_raw:
            try:
                context = json.loads(ctx_raw) if isinstance(ctx_raw, str) else ctx_raw
            except Exception:
                context = None
        model = str(works.param(4) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, request[:2000], catalogue, context), catalogue))
    except Exception as exc:                     # noqa: BLE001
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carry a sentence out if an operation can, otherwise open the UI where it is done.

"import a plate from a spreadsheet"  ->  File > Import

TWO CATALOGUES, IN THAT ORDER OF PREFERENCE. First a short list of OPERATIONS with
declared parameters, which can carry a request out as stated. Then the app's LIVE MENUS,
flattened and sent in, which open the place a thing is done.

DOING IT BEATS OPENING THE DOOR TO IT, AND OPENING THE DOOR BEATS REFUSING. Nearly every
menu item here opens a dialog that asks its own questions, so for most requests the right
answer is a menu item: "import a plate from a spreadsheet" means open Import. But some
requests arrive with the answer to that dialog's question already in them -- "a table with
two rows and four columns" -- and the dialog cannot take it: Draw > Table asks for a name
and then takes the size from how far the mouse is dragged. When an operation covers the
request AND its required parameters are all present in the sentence, use it. Otherwise fall
back to the menu item that opens the nearest place, which is a real answer and not a
refusal.

THE MENUS ARE THE LIVE MENUBAR. Nothing is written here
and nothing is hard-coded: the project app's menubar is built fresh for whatever is
selected, so the set of things that can be named is exactly the set that is on screen
at the moment the user typed, and a menu item added anywhere becomes reachable by
sentence without touching this file.

WHY A MENU ITEM AND NOT AN OPERATION. The genome editor has a catalogue of operations
with declared parameters, because its requests carry arguments: which database, which
exon, which significance. A project is a different shape. Almost everything here opens
a dialog that then asks its own questions, so the useful answer to "import a plate from
a spreadsheet" is to OPEN Import, not to try to fill it in from the sentence. Picking a
menu item is the whole job, which is why this returns one index and no arguments.

WHAT THIS DELIBERATELY CANNOT DO. It returns an INDEX into the list it was given.
It cannot name a file, a path, a module or a function, and it cannot pass an argument,
because there is nowhere to put one. Every file under baja/ is exec-able by path, so a
model that could return a path would be a shell on the user's unsaved work. An index
out of range is dropped rather than clamped: clamping would run a neighbouring menu
item, which is a different action presented as the one that was asked for.

param(1): the sentence
param(2): JSON list of [{i, path, tooltip?}] -- the flattened menus
param(3): optional JSON context (what is selected, what the app is showing)
param(4): model id (default "claude-sonnet-4-5")
param(5): JSON list of [{name, summary, params}] -- the declared operations

Resolves {"status":"OK", "operation": <name|null>, "args": {...}, "pick": <i|null>,
          "explain": "...", "alternatives": [i, ...], "unsupported": "..."}
or {"status":"ERROR","error":...}. An operation and a pick can both be present: the pick
is then the UI to fall back to if the operation turns out not to be runnable.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You map a request onto one item of a menu supplied to you. You never name anything "
       "that is not in the menu. Only output valid JSON.")

INSTRUCTIONS = """
You are given a request, a short list of OPERATIONS this application can perform directly,
and its MENU, flattened. Each menu entry has an index `i` and the path it sits at, such as
"File > Import".

Answer with an operation if one can carry the request out as stated. Otherwise answer with
the menu item that opens the place where it is done.

  {"operation": "<a name from the operations list, or null>",
   "args": {...only that operation's declared parameters...},
   "pick": <the i of a menu item, or null>,
   "explain": "one short sentence saying what will happen",
   "alternatives": [<up to three other plausible menu i, best first>],
   "unsupported": "<if both are null, what was asked for that this app has no place for>"}

Rules, in order of importance:

1. ONLY NAMES AND INDICES FROM THE LISTS. Never a path, a file, a function, or something
   you think ought to exist. If nothing fits, use null for both.

2. AN OPERATION ONLY IF IT REALLY COVERS THE REQUEST AND YOU HAVE ITS REQUIRED
   PARAMETERS. The sentence must actually say them; do not invent a size, a count or a
   name that was not asked for. If an operation nearly fits but a REQUIRED parameter is
   missing, do NOT guess it: leave `operation` null and pick the menu item that opens the
   place where the user can say it. Being asked the question is better than being given a
   number nobody chose.

   A parameter is required only when its declaration says `"required": true`. EVERY OTHER
   PARAMETER MAY SIMPLY BE LEFT OUT, and leaving one out is not a reason to refuse the
   operation: the application supplies its own default, that default is written in the
   parameter's `about` and often in a `default` field, and the user is shown exactly what
   will happen before anything runs. "Move the values to the top" names no column, and the
   column parameter is optional with the first column as its default, so the operation fits
   and you should return it. Refusing an operation because an OPTIONAL parameter is missing
   is the commonest way to turn a request that works into "nothing here does that".

3. OTHERWISE, OPENING THE RIGHT PLACE IS THE JOB. Nearly every menu item opens a dialog
   that asks its own questions. The request usually describes the END result ("make a
   plate from this spreadsheet", "share this with my postdoc") while the menu names the
   DOOR ("Import", "Share"). Pick the door. You are not expected to complete the task,
   only to put the user in front of the thing that does.

4. YOU MAY GIVE BOTH. If an operation fits, also pick the menu item that would be the
   next best way to do it. The operation is what runs; the pick is only the fallback if
   it cannot, and the user is shown both.

5. DO NOT PICK A NEAR MISS AS IF IT WERE A MATCH. If nothing really does what was asked,
   use null and say so in `unsupported`. A wrong item runs and does something the user
   did not ask for. `alternatives` is the right place for a maybe: those are shown as
   suggestions and nothing runs until the user chooses one.

6. PREFER THE LEAST DESTRUCTIVE READING. If a request could mean "remove" or "show me the
   ones that...", choose the one that shows. Deleting is only right when the request
   plainly asks for it.

7. The context says what is selected and what is on screen. Use it to choose between two
   items that differ only in what they act on. Do not invent a selection that the context
   does not report.

Operations:
%s

Menu:
%s
"""


def ask(model: str, request: str, menu: List[Dict[str, Any]], context: Any,
        operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"request": request}
    if context:
        payload["app_now"] = context
    prompt = (INSTRUCTIONS % (json.dumps(operations, ensure_ascii=False, indent=1),
                              json.dumps(menu, ensure_ascii=False, indent=1))) \
        + "\n\nRequest:\n" + json.dumps(payload, ensure_ascii=False)
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": prompt}],
    )
    return json.loads(r.choices[0].message.content)


def _index(value: Any, allowed: set) -> Any:
    """An index that is really in the list, or None.

    OUT OF RANGE IS DROPPED, NEVER CLAMPED. Clamping to the nearest valid index would run
    a neighbouring menu item and present it as the one that was asked for.
    """
    if isinstance(value, bool) or value is None:
        return None
    try:
        i = int(value)
    except (TypeError, ValueError):
        return None
    return i if i in allowed else None


def _clean(out: Dict[str, Any], menu: List[Dict[str, Any]],
           operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    allowed = set()
    for row in menu:
        if isinstance(row, dict):
            try:
                allowed.add(int(row.get("i")))
            except (TypeError, ValueError):
                pass

    pick = _index(out.get("pick"), allowed)

    # The operation NAME is checked against the list that was sent; the ARGUMENTS are only
    # passed through. The editor validates them against the same declarations it supplied,
    # which is the one place that knows a size's limits, so checking them loosely here as
    # well would be a second opinion that can disagree with the one that counts.
    op_names = {str(o.get("name")) for o in operations if isinstance(o, dict) and o.get("name")}
    operation = str(out.get("operation") or "").strip() or None
    if operation not in op_names:
        operation = None
    args = out.get("args")
    if not isinstance(args, dict):
        args = {}

    alts: List[int] = []
    raw_alts = out.get("alternatives")
    if isinstance(raw_alts, list):
        for v in raw_alts:
            i = _index(v, allowed)
            if i is not None and i != pick and i not in alts:
                alts.append(i)
    return {
        "status": "OK",
        "operation": operation,
        "args": args if operation else {},
        "pick": pick,
        "explain": str(out.get("explain") or "").strip()[:300],
        "alternatives": alts[:3],
        "unsupported": str(out.get("unsupported") or "").strip()[:300],
    }


def _main() -> int:
    try:
        request = str(works.param(1) or "").strip()
        if not request:
            works.resolve({"status": "ERROR", "error": "nothing typed"})
            return 0
        raw = works.param(2)
        menu = json.loads(raw) if isinstance(raw, str) else (raw or [])
        if not isinstance(menu, list) or not menu:
            works.resolve({"status": "ERROR", "error": "no menu was sent"})
            return 0
        ctx_raw = works.param(3)
        context: Any = None
        if ctx_raw:
            try:
                context = json.loads(ctx_raw) if isinstance(ctx_raw, str) else ctx_raw
            except Exception:
                context = None
        model = str(works.param(4) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        ops_raw = works.param(5)
        try:
            operations = json.loads(ops_raw) if isinstance(ops_raw, str) else (ops_raw or [])
        except Exception:
            operations = []
        if not isinstance(operations, list):
            operations = []
        works.resolve(_clean(ask(model, request[:2000], menu, context, operations),
                             menu, operations))
    except Exception as exc:                     # noqa: BLE001
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

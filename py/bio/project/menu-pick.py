#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Map a sentence onto ONE of the project app's own menu items.

"import a plate from a spreadsheet"  ->  File > Import

THE CATALOGUE IS THE APP'S LIVE MENUS, flattened and sent in. Nothing is written here
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

Resolves {"status":"OK", "pick": <i|null>, "explain": "...", "alternatives": [i, ...],
          "unsupported": "..."} or {"status":"ERROR","error":...}.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You map a request onto one item of a menu supplied to you. You never name anything "
       "that is not in the menu. Only output valid JSON.")

INSTRUCTIONS = """
You are given a request and the MENU of a laboratory project application, flattened. Each
entry has an index `i` and the path it sits at, such as "File > Import". Choose the ONE
menu item that carries out the request, or that opens the place where it is done.

  {"pick": <the i of that item, or null>,
   "explain": "one short sentence saying what that item does",
   "alternatives": [<up to three other plausible i, best first>],
   "unsupported": "<if pick is null, what was asked for that this menu has no place for>"}

Rules, in order of importance:

1. ONLY AN INDEX FROM THE LIST. Never a path, a file, a function, or a menu item you
   think ought to exist. If nothing fits, pick null.

2. OPENING THE RIGHT PLACE IS THE JOB. Nearly every item here opens a dialog that asks
   its own questions. The request will usually describe the END result ("make a plate
   from this spreadsheet", "share this with my postdoc") while the menu names the DOOR
   ("Import", "Share"). Pick the door. You are not expected to complete the task, only
   to put the user in front of the thing that does it.

3. DO NOT PICK A NEAR MISS AS IF IT WERE A MATCH. If nothing really does what was asked,
   pick null and say so in `unsupported`. A wrong item runs and does something the user
   did not ask for. Offering it under `alternatives` is the right place for a maybe:
   those are shown as suggestions and nothing runs until the user chooses one.

4. PREFER THE LEAST DESTRUCTIVE READING. If a request could mean "remove" or "show me
   the ones that...", pick the one that shows. Deleting is only right when the request
   plainly asks for it.

5. The context says what is selected and what is on screen. Use it to choose between
   two items that differ only in what they act on. Do not invent a selection that the
   context does not report.

Menu:
%s
"""


def ask(model: str, request: str, menu: List[Dict[str, Any]], context: Any) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"request": request}
    if context:
        payload["app_now"] = context
    prompt = (INSTRUCTIONS % json.dumps(menu, ensure_ascii=False, indent=1)) \
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


def _clean(out: Dict[str, Any], menu: List[Dict[str, Any]]) -> Dict[str, Any]:
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

    alts: List[int] = []
    raw_alts = out.get("alternatives")
    if isinstance(raw_alts, list):
        for v in raw_alts:
            i = _index(v, allowed)
            if i is not None and i != pick and i not in alts:
                alts.append(i)
    return {
        "status": "OK",
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
        works.resolve(_clean(ask(model, request[:2000], menu, context), menu))
    except Exception as exc:                     # noqa: BLE001
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

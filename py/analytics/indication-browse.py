#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Reading the indication-market store, for the Research panel.

Every run of Analytics > Build > Indication market is kept (py/ion-lib/indication_store.py):
the prompt, the structured form of it, and the research itself. That store exists so a
repeated question is answered from the research instead of being researched again. It is
also, by now, a small library of market research on genetic CNS disease, and this is how
baja/research.js reads it.

READ ONLY. Nothing here writes, deletes or re-runs anything. A browse must never cost a
dollar or change what the next run reuses.

Ion Works params
----------------
param(1): JSON, or a plain string meaning {"action": "list", "q": <string>}:

    {"action": "list",   "q": "", "limit": 40, "offset": 0, "sort": "recent"|"reused"}
    {"action": "get",    "id": 12}
    {"action": "shelves"}            what is in the store, grouped: the indications
                                     researched most often, the targets, the modalities
    {"action": "stats"}

Result
------
{"status": "ok", ...the answer}            the keys depend on the action
{"status": "error", "error": "..."}        including when the store is not configured

The store is best-effort by design and never raises; this adds the one thing a panel
needs that the store does not give it, which is to be told plainly when there is no
store at all rather than being handed an empty list that looks like an empty library.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict

try:
    from ion import works  # type: ignore
except Exception:  # pragma: no cover - a local run without the ion package
    works = None  # type: ignore

try:
    import indication_store as store  # type: ignore
except Exception:  # pragma: no cover
    store = None  # type: ignore


def _rejoin(parts: Any) -> str:
    """Put back together a JSON string that ion.works.arg() took apart.

    arg() splits any parameter containing a comma on the commas and converts each piece
    with findType(), so a request like {"action":"list","limit":25} arrives as the list
    ['{"action":"list"', '"limit":25}'] with 25 already an int. That only happens on the
    plain-argv path (the jfile path hands the string over whole), but a search that
    quietly lost its query is worse than one that fails, so the pieces are joined back up.
    JSON.stringify writes no space after a comma, which is what makes this exact.
    """
    out = []
    for part in parts:
        if isinstance(part, float) and part.is_integer():
            out.append(str(int(part)))
        else:
            out.append(str(part))
    return ",".join(out)


def _arg(raw: Any) -> Dict[str, Any]:
    """The request, however the bridge hands it over: a dict, JSON text, the pieces of
    JSON text, or a bare string meaning a search for it."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (list, tuple)):
        if not raw:
            return {}
        joined = _rejoin(raw)
        if joined.strip()[:1] in "{[":
            try:
                v = json.loads(joined)
                return v if isinstance(v, dict) else {}
            except Exception:
                return {}
        # Not JSON at all: somebody searched for two words with a comma between them.
        raw = joined
    if not isinstance(raw, str):
        return {}
    t = raw.strip()
    if not t:
        return {}
    if t[0] in "{[":
        try:
            v = json.loads(t)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}
    return {"action": "list", "q": t}


def answer(raw: Any) -> Dict[str, Any]:
    req = _arg(raw)
    action = ("" + (req.get("action") or "list")).strip().lower()

    if store is None:
        return {"status": "error", "error": "The indication store is not installed on this server.",
                "enabled": False}
    if not store.enabled():
        # Not a fault and not an empty library: nothing is being kept at all.
        return {"status": "error", "enabled": False,
                "error": "No research store is configured on this server (BIGDATA is not set), "
                         "so nothing from Indication market has been kept."}

    if action == "get":
        try:
            rid = int(req.get("id") or 0)
        except Exception:
            rid = 0
        run = store.get_run(rid) if rid else None
        if not run:
            return {"status": "error", "error": "There is no stored research with that number."}
        return {"status": "ok", "run": run}

    if action == "shelves":
        return {"status": "ok", "shelves": store.shelves(int(req.get("limit") or 12))}

    if action == "stats":
        return {"status": "ok", "stats": store.stats()}

    if action != "list":
        return {"status": "error", "error": "Unknown action: " + action}

    out = store.browse(
        q=("" + (req.get("q") or "")),
        limit=int(req.get("limit") or 40),
        offset=int(req.get("offset") or 0),
        sort=("" + (req.get("sort") or "recent")),
    )
    out["status"] = "ok"
    return out


def _main() -> int:
    if works is not None:
        try:
            # The bridge's parameter when there is one, and the command line when there is
            # not: the ion package is importable on the server itself, so a plain
            # `python indication-browse.py '{"action":"stats"}'` is how somebody looks
            # at the store over ssh, and it would otherwise be answered as an empty request.
            raw = works.param(1)
            if not _arg(raw) and len(sys.argv) > 1:
                raw = sys.argv[1]
            works.resolve(answer(raw))
        except Exception as e:  # the panel gets a sentence, never a stack trace
            works.resolve({"status": "error", "error": str(e), "where": "indication-browse"})
        return 0
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(answer(raw), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ion + ChatGPT: Classify arbitrary `items[]` into an option (wtype) using each item's `fields` array **and** its `value`.

Ion params:
  param(1): items JSON (array of objects with {id, value, fields, wtype?}) | inline JSON | jfile:PATH | PATH | list/tuple of those
  param(2): options JSON (list of strings)
  param(3): (optional) model name (default: gpt-4o-mini)

Behavior:
- Uses `fields` tokens **and** the item's `value` for classification.
- Splits camelCase words and replaces underscores with spaces before sending to GPT.
- Chooses exactly one option for each item; on uncertainty, sets "Default" (even if not present in options).
- Forces JSON output via function-call tools.
- Batches items to control prompt size.
- Requires OPENAI_API_KEY in env.

Output (works.resolve): a JSON array of items with `wtype` filled in.
"""

from __future__ import annotations
import json, os, re
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

# ---------- Ion integration ----------
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:  # pragma: no cover
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, ensure_ascii=False, indent=2))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore
    _HAS_ION = False

# ---------- OpenAI client ----------
from openai import OpenAI
_client_singleton = None

def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI()
    return _client_singleton

# ---------- Param loading ----------

def _read_param(idx: int) -> Any:
    try:
        return works.param(idx)
    except Exception:
        return None


def _pick_candidate_from_sequence(seq) -> Any:
    flat: List[Any] = []
    for it in seq:
        if isinstance(it, (list, tuple)):
            flat.extend(it)
        else:
            flat.append(it)
    for cand in reversed(flat):
        if cand not in (None, "", [], {}):
            return cand
    return None


def _load_input_payload(p: Any) -> Any:
    if isinstance(p, (dict, list)):
        return p
    if isinstance(p, (tuple, list)):
        cand = _pick_candidate_from_sequence(p)
        if cand is None:
            raise RuntimeError("Param sequence had no usable element.")
        return _load_input_payload(cand)
    if isinstance(p, (bytes, bytearray)):
        p = p.decode("utf-8", errors="ignore")
    if not isinstance(p, str):
        raise RuntimeError(f"Unsupported param type: {type(p).__name__}")

    s = unquote((p or "").strip())
    if not s:
        raise RuntimeError("Empty parameter; provide JSON text or a path to a JSON file.")

    if s.startswith("jfile:"):
        path = s[len("jfile:"):].strip()
        if not path:
            raise RuntimeError("jfile: URI missing a path.")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    if s[0] in "[{":
        return json.loads(s)

    if os.path.exists(s):
        with open(s, "r", encoding="utf-8") as f:
            return json.load(f)

    return json.loads(s)

# ---------- Helpers ----------

def _normalize_token(s: str) -> str:
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', s)  # split camelCase
    s = s.replace('_', ' ')
    return re.sub(r'\s+', ' ', s.strip())

def _fields_of_item(it: Dict[str, Any]) -> List[str]:
    f = it.get("fields")
    if isinstance(f, (list, tuple)):
        return [_normalize_token(str(x)) for x in f if str(x).strip()]
    if isinstance(f, dict):
        return [_normalize_token(str(k)) for k in f.keys() if str(k).strip()]
    if isinstance(f, str) and f.strip():
        return [_normalize_token(f)]
    return []

def _canon_option_choice(raw_choice: Optional[str], options: List[str]) -> str:
    if not raw_choice:
        return "Default"
    rc = str(raw_choice).strip().casefold()
    for opt in options:
        if opt.strip().casefold() == rc:
            return opt
    return "Default"

# ---------- Chat classification ----------
_SYSTEM = (
    "You are assigning a 'wtype' to each item using its processed fields and value. "
    "Field tokens are normalized (camelCase split, underscores replaced by spaces). "
    "You will be given: a fixed list of allowed types (options), and a list of items each with an ID, 'fields', and 'value'.\n\n"
    "Rules:\n"
    "  - Choose exactly one option from the provided list for each item.\n"
    "  - Consider both the FIELD TOKENS and the VALUE (string/number).\n"
    "  - If truly uncertain, choose 'Default'.\n"
    "  - Keep reasoning short, refer to field tokens/value patterns.\n"
    "  - Do NOT invent new options.\n"
    "Respond ONLY by calling the provided function with JSON arguments."
)

def _build_user_msg(options: List[str], items_payload: List[Dict[str, Any]]) -> str:
    return json.dumps({"options": options, "items": items_payload}, ensure_ascii=False)

_TOOLS = [{
    "type": "function",
    "function": {
        "name": "assign_types",
        "description": "Return chosen option for each item ID, with a short reason, based on normalized fields and value.",
        "parameters": {
            "type": "object",
            "properties": {
                "decisions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": ["string", "number"]},
                            "chosen_option": {"type": ["string", "null"]},
                            "reason": {"type": "string"}
                        },
                        "required": ["id", "chosen_option", "reason"],
                        "additionalProperties": False
                    }
                }
            },
            "required": ["decisions"],
            "additionalProperties": False
        }
    }
}]

def _classify_one_batch(*, model: str, options: List[str], items_payload: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    client = _get_client()
    resp = client.chat.completions.create(
        model=model,
        temperature=0.0,
        messages=[{"role": "system", "content": _SYSTEM}, {"role": "user", "content": _build_user_msg(options, items_payload)}],
        tools=_TOOLS,
        tool_choice={"type": "function", "function": {"name": "assign_types"}},
    )
    tcalls = resp.choices[0].message.tool_calls or []
    if not tcalls:
        return []
    args_raw = tcalls[0].function.arguments or "{}"
    try:
        parsed = json.loads(args_raw)
    except Exception:
        return []
    decisions = parsed.get("decisions") or []
    out: List[Dict[str, Any]] = []
    for d in decisions:
        if not isinstance(d, dict):
            continue
        out.append({"id": d.get("id"), "chosen_option": d.get("chosen_option"), "reason": d.get("reason", "")})
    return out

def _classify_items_with_chat(items: List[Dict[str, Any]], options: List[str], model: str = "gpt-4o-mini", batch_size: int = 80) -> List[Dict[str, Any]]:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY must be set.")

    lite: List[Dict[str, Any]] = []
    for it in items or []:
        lite.append({"id": it.get("id"), "fields": _fields_of_item(it), "value": it.get("value")})

    decisions_map: Dict[str, Dict[str, Any]] = {}
    for start in range(0, len(lite), batch_size):
        chunk = lite[start:start + batch_size]
        decisions = _classify_one_batch(model=model, options=options, items_payload=chunk)
        for d in decisions:
            decisions_map[str(d.get("id"))] = d

    out: List[Dict[str, Any]] = []
    for it in items:
        iid = str(it.get("id"))
        d = decisions_map.get(iid, {})
        chosen_norm = _canon_option_choice(d.get("chosen_option"), options)
        new_it = dict(it)
        new_it["wtype"] = chosen_norm if chosen_norm else "Default"
        out.append(new_it)
    return out

# ---------- Ion entry ----------

def _run_ion() -> int:
    items_p = _read_param(1)
    options_p = _read_param(2)
    model_p = _read_param(3)

    if items_p in (None, "", [], {}):
        raise RuntimeError("Ion: param(1) required: items JSON (array).")
    if options_p in (None, "", [], {}):
        raise RuntimeError("Ion: param(2) required: options JSON (list of strings).")

    items = _load_input_payload(items_p)
    options = _load_input_payload(options_p)
    if not isinstance(items, list):
        raise RuntimeError("items must be a JSON array.")
    if not isinstance(options, list) or not all(isinstance(s, str) for s in options):
        raise RuntimeError("options must be a JSON list of strings.")

    model = model_p or "gpt-4o-mini"
    works.msg(f"Ion: Item classification starting… model={model}, items={len(items)}, options={len(options)}")

    result_list = _classify_items_with_chat(items, options, model=model)

    works.msg(f"Ion: Items classified: {len(result_list)}")
    works.resolve(result_list)
    return 0

if _HAS_ION and __name__ == "__main__":
    works.msg("Ion entry ready (ChatGPT, fields/value-based classifier with camelCase+underscore normalization, 'Default' fallback).")
    _run_ion()
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion: Waterfall field selector → ordered wells for plotting

Params
------
param(1): plates array ONLY (the full plates object from your prompt), e.g.:
          [
            { "name":"Assumptions", "cols":..., "rows":..., "wells":[...] },
            { "name":"PnL", "cols":..., "rows":..., "wells":[...] },
            ...
          ]

Behavior
--------
1) Extract candidate field labels actually present in the 'plates' (from well.field and well.value).
2) Ask ChatGPT to select an ordered set of labels suitable for a standard financial waterfall
   (e.g., Revenue → COGS → Gross_Profit → Operating buckets → Depreciation → Taxes → Net_Income),
   but ONLY from the provided candidates.
3) Map those chosen labels back to concrete well objects (preferring exact field matches; with a sane
   tie-break: prefer PnL > Assumptions for waterfall).
4) Return an ordered array of wells via works.resolve:
   { "wells": [ { ...well..., "plate": "<PlateName>" }, ... ] }

Notes
-----
- Requires OPENAI_API_KEY in env (like your duration resolver example).
- Falls back to a heuristic list if the API is inaccessible.
"""

import json
import sys
import re
import difflib
from typing import Any, Dict, List, Tuple, Optional

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: dict) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int): return None
    works = _Shim()  # type: ignore

# ----- OpenAI chat wrapper (same style as your example) -----
from openai import OpenAI, APITimeoutError
_client_singleton = None
def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(*, model: str, system: str, user: str,
               temperature: float = 0.0, json_mode: bool = True,
               max_tokens: int = 500, tries: int = 3, backoff: float = 2.0) -> str:
    import os, time
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    client = _get_client()
    last_err = None
    for attempt in range(tries):
        try:
            resp = client.chat.completions.create(**kwargs)
            return (resp.choices[0].message.content or "").strip()
        except APITimeoutError as e:
            last_err = e
            wait = backoff ** attempt
            works.msg(f"⚠️ OpenAI timeout — retrying in {wait:.1f}s (attempt {attempt+1}/{tries})")
            time.sleep(wait)
    raise last_err

# ----------------------------
# Normalization & indexing
# ----------------------------
_word_re = re.compile(r"[a-z0-9]+")

def _norm(s: str) -> str:
    s = str(s)
    s = s.strip().lower()
    toks = _word_re.findall(s)
    return " ".join(toks)

class WellRef:
    __slots__ = ("plate","uid","x","y","value","field_raw","field_norms","well_obj")
    def __init__(self, plate: str, w: Dict[str,Any]) -> None:
        self.plate = plate or ""
        self.uid = str(w.get("uid",""))
        self.x = w.get("x")
        self.y = w.get("y")
        self.value = w.get("value")
        self.field_raw = [f for f in (w.get("field") or []) if isinstance(f,str)]
        self.field_norms = frozenset(_norm(f) for f in self.field_raw)
        # keep original well and annotate plate later for output
        self.well_obj = dict(w)

def _build_index(plates: List[Dict[str,Any]]) -> List[WellRef]:
    out: List[WellRef] = []
    for plate in plates or []:
        pname = str(plate.get("name",""))
        for w in plate.get("wells",[]) or []:
            out.append(WellRef(pname, w))
    return out

def _collect_candidate_labels(index: List[WellRef]) -> List[str]:
    """All human labels that the model can choose from (deduped, original forms)."""
    seen = {}
    # Prefer canonical field tags over values; but include string values if they look like labels
    for w in index:
        for f in w.field_raw:
            n = _norm(f)
            if n and n not in seen:
                seen[n] = f  # keep original form
        if isinstance(w.value, str):
            # Exclude obviously non-label strings like "Value" column headers
            v = w.value.strip()
            if v and len(v) <= 40 and _norm(v) not in ("value","pnl","assumptions","tenyear view cols"):
                n = _norm(v)
                if n and n not in seen:
                    seen[n] = v
    # Return originals preserving insertion order
    return list(seen.values())

# ----------------------------
# Matching back to wells
# ----------------------------
def _best_ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()

def _score_label_vs_well(label: str, w: WellRef) -> Tuple[int, float, float, int, int]:
    """
    Composite score (higher is better):
      1) hard: +2 exact field tag match; +1 exact value match
      2) field_best_ratio
      3) value_ratio
      4) specificity: number of field tags
      5) plate_pref: prefer PnL (2) > Assumptions (1) > other (0)
    """
    qn = _norm(label)
    hard = 0
    if qn in w.field_norms:
        hard += 2
    value_ratio = 0.0
    if isinstance(w.value, str):
        if _norm(w.value) == qn:
            hard += 1
        value_ratio = _best_ratio(label, w.value)
    field_best = max((_best_ratio(label, f) for f in w.field_raw), default=0.0)
    spec = len(w.field_raw)
    plate_pref = 2 if _norm(w.plate) == "pnl" else (1 if _norm(w.plate) == "assumptions" else 0)
    return (hard, field_best, value_ratio, spec, plate_pref)

def _pick_well_for_label(label: str, index: List[WellRef]) -> Optional[WellRef]:
    scored = [(_score_label_vs_well(label, w), w) for w in index]
    scored.sort(key=lambda t: t[0], reverse=True)
    if not scored:
        return None
    # Require some confidence: hard match or good fuzzy
    (hard, fz, vz, _, _), best = scored[0]
    if hard > 0 or max(fz, vz) >= 0.72:
        return best
    return None

# ----------------------------
# GPT prompt for waterfall selection
# ----------------------------
_WATERFALL_JSON_INSTRUCTIONS = r"""
Return STRICT JSON ONLY:
{
  "ordered_labels": ["<label1>", "<label2>", "..."]
}

Rules:
- You are selecting labels for a FINANCIAL WATERFALL PLOT that explains profitability.
- Choose ONLY from the provided candidate labels (exact strings).
- Prefer a P&L flow like:
  Revenue (or Monthly_Revenue)
  → COGS (or Monthly_COGS)
  → Gross_Profit (or Monthly_Gross_Profit)
  → Operating expense buckets (Payroll, Operating_Expenses, Overhead/Rent, Marketing, etc.)
  → EBITDA (if present; may be shown as subtotal)
  → Depreciation (or Amortization if present)
  → EBIT (if present; may be shown as subtotal)
  → Taxes
  → Net_Income
- Use a sensible subset if some labels are missing.
- Avoid duplicate or purely header-like labels (e.g., "PnL", "Assumptions", "Value").
- Keep the list compact; do not include both subtotal and its components redundantly unless it adds clarity
  (e.g., if EBITDA is present but its components already included, keep EBITDA OR keep its components, not both).
- Output only the 'ordered_labels' array; no commentary.
"""

def _gpt_pick_labels(candidates: List[str], model: str = "gpt-4o-mini",
                     temperature: float = 0.0) -> List[str]:
    system = "You are a precise financial analyst. Output strict JSON only."
    # Provide compact candidate list
    cand_text = "\n".join(f"- {c}" for c in candidates)
    user = f"""{_WATERFALL_JSON_INSTRUCTIONS}

Candidate labels (choose ONLY from these; exact strings):
{cand_text}
"""
    raw = _chat_call(model=model, system=system, user=user,
                     temperature=temperature, json_mode=True, max_tokens=350)
    try:
        data = json.loads(raw)
        labs = data.get("ordered_labels") or []
        # Keep only labels that are exactly in candidates (safety)
        cand_set_norm = {_norm(c): c for c in candidates}
        out: List[str] = []
        for lab in labs:
            n = _norm(lab)
            if n in cand_set_norm:
                out.append(cand_set_norm[n])
        # dedupe preserving order
        seen = set()
        ordered = [x for x in out if not (x in seen or seen.add(x))]
        return ordered
    except Exception as e:
        works.msg(f"❕ GPT label parse failed; will use heuristic fallback. ({e})")
        return []

def _heuristic_labels(candidates: List[str]) -> List[str]:
    pref_order = [
        "Revenue","Monthly_Revenue",
        "COGS","Monthly_COGS",
        "Gross_Profit","Monthly_Gross_Profit",
        "Payroll","Operating_Expenses",
        "Monthly_Overhead_Rent","Monthly_Marketing_Expense",
        "EBITDA","Depreciation","EBIT","Taxes","Net_Income"
    ]
    can_norm = {_norm(c): c for c in candidates}
    out = []
    for p in pref_order:
        n = _norm(p)
        if n in can_norm:
            out.append(can_norm[n])
    # dedupe
    seen = set()
    return [x for x in out if not (x in seen or seen.add(x))]

# ----------------------------
# Ion entrypoint
# ----------------------------
def _as_json(obj_like) -> Any:
    if obj_like is None:
        return None
    if isinstance(obj_like, (list, dict)):
        return obj_like
    if isinstance(obj_like, (bytes, bytearray)):
        return json.loads(obj_like.decode("utf-8", errors="ignore"))
    if isinstance(obj_like, str):
        s = obj_like.strip()
        if not s:
            return None
        return json.loads(s)
    return json.loads(str(obj_like))

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user = works.param(1)
    
        plates = _as_json(works.param(2))
        if not isinstance(plates, list):
            raise RuntimeError("param(1) must be the plates ARRAY")
        works.msg("🔎 extracting candidate labels from plates…")
        index = _build_index(plates)
        candidates = _collect_candidate_labels(index)
        if not candidates:
            raise RuntimeError("No candidate labels found in plates")

        works.msg(f"🧠 asking ChatGPT to pick ordered waterfall labels from {len(candidates)} candidates…")
        labels = _gpt_pick_labels(candidates, model=default_model, temperature=0.0)
        if not labels:
            works.msg("ℹ️ using heuristic label ordering (GPT unavailable or returned none)")
            labels = _heuristic_labels(candidates)
        if not labels:
            raise RuntimeError("No suitable waterfall labels found")

        # Map labels back to concrete wells, preserving order
        works.msg(f"🧭 mapping {len(labels)} labels to wells…")
        selected_wells: List[Dict[str,Any]] = []
        for lab in labels:
            w = _pick_well_for_label(lab, index)
            if w:
                wo = dict(w.well_obj)
                wo["plate"] = w.plate  # annotate plate
                selected_wells.append(wo)

        if not selected_wells:
            raise RuntimeError("Could not resolve any labels to wells")

        works.resolve({
            "wells": selected_wells
        })
        return 0

    except Exception as e:
        works.msg(f"❌ error: {e}")
        works.resolve({ "error": str(e) })
        return 1

if __name__ == "__main__":
    works.msg("🔧 ion: financial waterfall selector (plates → ordered wells)")
    sys.exit(_main_ion())

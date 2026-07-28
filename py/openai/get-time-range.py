#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion: Duration phrase → add to start ISO → final ISO

Params
------
param(1): phrase (duration only; e.g., "2 hours", "1d 4h 30m", "3 weeks")
param(2): start_iso (e.g., "2025-10-10T14:05:00")
param(3): model (optional; default "gpt-4o-mini")
param(4): temperature (optional; default 0.0)

Output (works.resolve)
----------------------
{
  "start": "YYYY-MM-DDTHH:MM:SS",
  "interval": {
    "iso": "PnDTnHnMnS",
    "human": "<normalized duration, no dates>",
    "days": <int>,
    "hours": <int>,
    "minutes": <int>,
    "seconds": <int>
  },
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}
"""

import json
import time
from datetime import datetime, timedelta

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: dict) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int): return None
    works = _Shim()  # type: ignore

# ----- OpenAI chat wrapper -----
from openai import OpenAI, APITimeoutError
_client_singleton = None
def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(*, model: str, system: str, user: str,
               temperature: float = 0.0, json_mode: bool = True,
               max_tokens: int = 300, tries: int = 3, backoff: float = 2.0) -> str:
    import os
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

# ----- Strict JSON contract (DURATION-ONLY) -----
# We force the model to emit ONLY days/hours/minutes/seconds (weeks/months/years are
# numerically converted: w=7d, mo=30d, y=365d). That keeps addition simple.
_DURATION_JSON_INSTRUCTIONS = r"""
Return STRICT JSON ONLY:
{
  "interval": {
    "iso": "PnDTnHnMnS",
    "human": "<normalized duration only, e.g., '2 hours' or '1 day 4 hours 30 minutes'>",
    "days": <nonnegative integer>,
    "hours": <nonnegative integer>,
    "minutes": <nonnegative integer>,
    "seconds": <nonnegative integer>
  }
}

Rules:
- The input is a TIME LENGTH ONLY (no dates). Interpret and normalize it as a duration.
- Convert years→365 days, months→30 days, weeks→7 days. Do not leave Y/M/W units in ISO.
- Use only days, hours, minutes, seconds in the ISO output (PnDTnHnMnS).
- If phrase is like "in 90 minutes", treat it as "90 minutes".
- If empty or not a duration, return zero duration (P0DT0H0M0S).
- Valid JSON only; no commentary; no extra fields.
"""

def _validate_iso_or_raise(s: str) -> None:
    # Accept naive or 'Z' times; normalize Z for validation only.
    datetime.fromisoformat(s.replace("Z", "+00:00"))

def _to_timedelta(days: int, hours: int, minutes: int, seconds: int) -> timedelta:
    return timedelta(days=int(days), hours=int(hours), minutes=int(minutes), seconds=int(seconds))

def _resolve_duration_with_gpt(phrase: str, *, model: str, temperature: float) -> dict:
    system = "You are a precise duration normalizer that outputs strict JSON."
    user = f"{_DURATION_JSON_INSTRUCTIONS}\n\nDuration phrase:\n{phrase or ''}"
    raw = _chat_call(model=model, system=system, user=user,
                     temperature=temperature, json_mode=True, max_tokens=220)
    try:
        data = json.loads(raw)
        interval = data.get("interval") or {}
        iso = str(interval.get("iso") or "P0DT0H0M0S")
        human = str(interval.get("human") or "0 seconds")
        days = int(interval.get("days") or 0)
        hours = int(interval.get("hours") or 0)
        minutes = int(interval.get("minutes") or 0)
        seconds = int(interval.get("seconds") or 0)
        # Normalize negatives to zero just in case
        days = max(0, days); hours = max(0, hours); minutes = max(0, minutes); seconds = max(0, seconds)
        return {"iso": iso, "human": human, "days": days, "hours": hours, "minutes": minutes, "seconds": seconds}
    except Exception as e:
        works.msg(f"❕ falling back to zero duration: {e}")
        return {"iso": "P0DT0H0M0S", "human": "0 seconds", "days": 0, "hours": 0, "minutes": 0, "seconds": 0}

# ----- Ion entrypoint -----
def _read_param(i: int):
    try:
        return works.param(i)
    except Exception:
        return None

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    phrase = _read_param(1) or ""
    start_iso = _read_param(2)
    model = _read_param(3) or default_model
    try:
        temperature = float(_read_param(4) or 0.0)
    except Exception:
        temperature = 0.0

    if not start_iso:
        raise RuntimeError("param(2) required: start_iso (e.g., 2025-10-10T14:05:00)")

    works.msg("⏳ interpreting duration phrase and adding to start time…")

    try:
        _validate_iso_or_raise(str(start_iso))
        iv = _resolve_duration_with_gpt(str(phrase), model=str(model), temperature=temperature)

        # Compute end time by adding duration to start
        start_dt = datetime.fromisoformat(str(start_iso).replace("Z", "+00:00"))
        delta = _to_timedelta(iv["days"], iv["hours"], iv["minutes"], iv["seconds"])
        end_dt = start_dt + delta

        # If input had 'Z', keep 'Z' in output; else emit naive ISO
        end_iso = end_dt.isoformat()
        if str(start_iso).endswith("Z"):
            # convert back to 'Z' if start used Z
            end_iso = end_iso.replace("+00:00", "Z")

        # Echo start exactly as given
        result = {
            "start": str(start_iso),
            "interval": iv,
            "datetime": end_iso
        }
        works.resolve(result)
        return 0

    except Exception as e:
        works.msg(f"❌ error: {e}")
        works.resolve({
            "error": e,
        })
        return 1

if __name__ == "__main__":
    works.msg("🔧 ion: duration resolver (duration → start + delta → final ISO)")
    _main_ion()

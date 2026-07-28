#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion: Relative-or-Absolute time interpreter → apply to start → final ISO

Params
------
param(1): phrase (relative duration OR absolute time)
          Examples:
            Relative: "add 2 hours", "minus 30m", "in 90 minutes", "3 weeks ago"
            Absolute: "Oct 31 9am", "2025-11-02T13:00:00", "next Monday 10:30"
param(2): start_iso (e.g., "2025-10-10T14:05:00")
param(3): model (optional; default "gpt-4o-mini")
param(4): temperature (optional; default 0.0)

Output (works.resolve)
----------------------
{
  "start": "YYYY-MM-DDTHH:MM:SS",
  "mode": "relative" | "absolute" | "unknown",
  "operation": "+" | "-" | "=",
  "interval": {
    "iso": "PnDTnHnMnS",
    "human": "<normalized>",
    "days": <int>,
    "hours": <int>,
    "minutes": <int>,
    "seconds": <int>,
    "sign": "+" | "-" | "0"
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
               max_tokens: int = 450, tries: int = 3, backoff: float = 2.0) -> str:
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

# ----- Strict JSON contract -----
# - Decide mode: "relative" or "absolute" (or "unknown" if can't tell).
# - For relative: produce an op ("+" or "-") and a normalized duration in days/hours/minutes/seconds only.
#   Convert y→365d, mo→30d, w→7d; DO NOT leave Y/M/W in ISO.
# - For absolute: output the absolute datetime (YYYY-MM-DDTHH:MM:SS). Interval should be zero with sign "0".
_JSON_INSTRUCTIONS = r"""
Return STRICT JSON ONLY:
{
  "mode": "relative" | "absolute" | "unknown",
  "op": "+" | "-" | "=",
  "interval": {
    "iso": "PnDTnHnMnS",
    "human": "<normalized>",
    "days": <nonnegative integer>,
    "hours": <nonnegative integer>,
    "minutes": <nonnegative integer>,
    "seconds": <nonnegative integer>
  },
  "absolute": "YYYY-MM-DDTHH:MM:SS"
}

Rules:
- Determine if the phrase is a RELATIVE duration (e.g., "add 2 hours", "minus 30m", "in 90 minutes", "3 weeks ago")
  or an ABSOLUTE datetime (e.g., "Oct 31 09:00", "2025-11-02T13:00:00", "next Monday 10:30").
- RELATIVE:
  * Set "mode"="relative", "op"="+" for add/in/plus; "op"="-" for subtract/minus/ago.
  * Normalize duration to only days/hours/minutes/seconds.
  * Convert years→365 days, months→30 days, weeks→7 days. Do not emit Y/M/W in ISO.
  * "absolute" should be "".
- ABSOLUTE:
  * Set "mode"="absolute", "op"="=".
  * "absolute" MUST be "YYYY-MM-DDTHH:MM:SS" with the same timezone context as the given start time.
  * "interval" should be a zero duration: "P0DT0H0M0S", with human "absolute".
- UNKNOWN/empty:
  * "mode"="unknown", "op"="=", zero duration, "absolute"="".

- Valid JSON only; no commentary; no extra fields.
"""

# ----- Helpers -----
def _validate_iso_or_raise(s: str) -> None:
    datetime.fromisoformat(s.replace("Z", "+00:00"))

def _timedelta_from_parts(days: int, hours: int, minutes: int, seconds: int) -> timedelta:
    return timedelta(days=int(days), hours=int(hours), minutes=int(minutes), seconds=int(seconds))

def _iso_from_timedelta(td: timedelta) -> str:
    total_seconds = int(abs(td).total_seconds())
    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"P{days}DT{hours}H{minutes}M{seconds}S"

def _breakdown_timedelta(td: timedelta):
    total_seconds = int(abs(td).total_seconds())
    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return days, hours, minutes, seconds

def _normalize_z_output(iso_str: str, like_start: str) -> str:
    # If start had Z, force Z. Otherwise return naive or offset-preserved string as-is.
    if like_start.endswith("Z"):
        return iso_str.replace("+00:00", "Z")
    return iso_str

def _interpret_with_gpt(phrase: str, start_iso: str, *, model: str, temperature: float) -> dict:
    system = "You classify phrases as relative durations or absolute datetimes and output strict JSON."
    user = f"{_JSON_INSTRUCTIONS}\n\nStart datetime:\n{start_iso}\n\nPhrase:\n{phrase or ''}"
    raw = _chat_call(model=model, system=system, user=user,
                     temperature=temperature, json_mode=True, max_tokens=380)
    try:
        data = json.loads(raw)
        mode = str(data.get("mode") or "unknown")
        op = str(data.get("op") or "=")
        interval = data.get("interval") or {}
        days = max(0, int(interval.get("days") or 0))
        hours = max(0, int(interval.get("hours") or 0))
        minutes = max(0, int(interval.get("minutes") or 0))
        seconds = max(0, int(interval.get("seconds") or 0))
        human = str(interval.get("human") or ("absolute" if mode=="absolute" else "unknown"))
        iso = str(interval.get("iso") or "P0DT0H0M0S")
        absolute = str(data.get("absolute") or "")
        return {
            "mode": mode,
            "op": op,
            "interval": {"iso": iso, "human": human, "days": days, "hours": hours, "minutes": minutes, "seconds": seconds},
            "absolute": absolute
        }
    except Exception as e:
        works.msg(f"❕ falling back to unknown mode: {e}")
        return {
            "mode": "unknown",
            "op": "=",
            "interval": {"iso": "P0DT0H0M0S", "human": "unknown", "days": 0, "hours": 0, "minutes": 0, "seconds": 0},
            "absolute": ""
        }

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

    works.msg("🧭 interpreting phrase as relative or absolute and computing final datetime…")

    try:
        _validate_iso_or_raise(str(start_iso))
        interp = _interpret_with_gpt(str(phrase), str(start_iso), model=str(model), temperature=temperature)

        start_dt = datetime.fromisoformat(str(start_iso).replace("Z", "+00:00"))
        mode = interp["mode"]
        op = interp["op"]

        if mode == "relative":
            iv = interp["interval"]
            delta = _timedelta_from_parts(iv["days"], iv["hours"], iv["minutes"], iv["seconds"])
            sign = "+" if op == "+" else "-"
            end_dt = start_dt + (delta if sign == "+" else -delta)

            end_iso = _normalize_z_output(end_dt.isoformat(), str(start_iso))
            result = {
                "start": str(start_iso),
                "mode": "relative",
                "operation": sign,
                "interval": {
                    "iso": iv["iso"],
                    "human": iv["human"],
                    "days": iv["days"],
                    "hours": iv["hours"],
                    "minutes": iv["minutes"],
                    "seconds": iv["seconds"],
                    "sign": sign
                },
                "datetime": end_iso
            }
            works.resolve(result)
            return 0

        elif mode == "absolute" and interp["absolute"]:
            # Validate absolute
            abs_dt = datetime.fromisoformat(interp["absolute"].replace("Z", "+00:00"))
            end_iso = _normalize_z_output(abs_dt.isoformat(), str(start_iso))
            # Compute difference interval for transparency
            diff = abs_dt - start_dt
            diff_sign = "+" if diff.total_seconds() >= 0 else "-"
            days, hours, minutes, seconds = _breakdown_timedelta(diff)
            result = {
                "start": str(start_iso),
                "mode": "absolute",
                "operation": "=",
                "interval": {
                    "iso": _iso_from_timedelta(diff),
                    "human": "absolute (difference from start)",
                    "days": days,
                    "hours": hours,
                    "minutes": minutes,
                    "seconds": seconds,
                    "sign": diff_sign if diff.total_seconds() != 0 else "0"
                },
                "datetime": end_iso
            }
            works.resolve(result)
            return 0

        else:
            # Unknown or unparseable—return start unchanged
            result = {
                "start": str(start_iso),
                "mode": "unknown",
                "operation": "=",
                "interval": {
                    "iso": "P0DT0H0M0S",
                    "human": "unknown",
                    "days": 0, "hours": 0, "minutes": 0, "seconds": 0,
                    "sign": "0"
                },
                "datetime": str(start_iso)
            }
            works.resolve(result)
            return 0

    except Exception as e:
        works.msg(f"❌ error: {e}")
        works.resolve({
            "start": str(start_iso) if start_iso else "",
            "mode": "unknown",
            "operation": "=",
            "interval": {
                "iso": "P0DT0H0M0S",
                "human": "unknown",
                "days": 0, "hours": 0, "minutes": 0, "seconds": 0,
                "sign": "0"
            },
            "datetime": str(start_iso) if start_iso else ""
        })
        return 1

if __name__ == "__main__":
    works.msg("🔧 ion: relative-or-absolute time → start ± delta → final ISO")
    _main_ion()

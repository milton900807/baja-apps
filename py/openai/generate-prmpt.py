#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Scheduler with Plate/Table-Aware Prompt Rewriter + GPT-Assisted Intervals/Milestones
-----------------------------------------------------------------------------------------------
Ion entry:
  param(1): user_prompt          (str, required)
  param(2): plates_or_tables     (EITHER list[dict] plates OR artifact with "tables"/"plates", optional)
  param(3): model                (str, optional; default "gpt-4o-mini")
  param(4): temperature          (float, optional; default 0.2)

Behavior:
  1) Use GPT to convert (user_prompt + plate labels) into a series of
     scheduling-friendly step lines (each describing a task with dates/durations).
     THEN use GPT again to FILTER those lines so that only true tasks
     (not structural/table noise) remain, and lightly clean wording/punctuation.
  2) For each resulting line, run the hybrid Operations Scheduler:
       - Deterministic parse (explicit "starting/on/from", natural dates, durations).
       - If still incomplete, GPT fallback per-line.
  3) Build a merged {label -> value} map from:
       - Ion 2-col tables (Label/Value)
       - Plate wells (field[0] -> value)
  4) From that merged label map, build intervals & milestones:
       - Heuristics:
           • Stage intervals: <Stage>_Duration_(Weeks|Months|Days|Hours)
             + <Stage>_Start_Quarter / _Start_Date / _Start
           • Global duration intervals: labels like durratiion / duration_periods / duration / total_duration / program_duration
           • Milestones: any label whose value parses as a date/quarter
       - GPT helper:
           • Suggest extra stage pairings & milestone names (optional).
  5) Return:
       - intervals (line-derived + label-derived)
       - milestones (label-derived)
       - window for Gantt
       - step lines used.
"""

import re
import json
import time
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

# ----- Ion shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- Optional OpenAI client -----
try:
    from openai import OpenAI, APITimeoutError  # type: ignore
except Exception:
    OpenAI = None  # type: ignore
    APITimeoutError = Exception  # type: ignore

from dateutil import parser as dtparser
from dateutil.relativedelta import relativedelta

DEFAULT_FALLBACK_HOURS = 4.0
MILESTONE_DEFAULT_Y = 0.8  # y-band for milestones

# ---------------- Regexes for the scheduler ----------------
_TRAIL_DUR_RE = re.compile(
    r'(?i)\b(\d+(?:\.\d+)?)\s*(months?|mos?|mo|weeks?|wks?|wk|days?|d|hours?|hrs?|hr|h)\b'
)
_END_QUALIFIERS = re.compile(r'(?i)\b(?:until|through|thru|ending|ends?|to|till|deadline|by)\b')
_START_QUALIFIERS = re.compile(r'(?i)\b(?:starting|start(?:ing)?|begin(?:ning)?|from|as\s+of|on)\b')
_MONTH_TOKEN_RE = re.compile(
    r'(?i)\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b'
)
_NATDATE_RE = re.compile(
    r'(?ix)\b('
    r'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
    r')\s+(\d{1,2})(?:,\s*(\d{4}))?'
)

# Ion-style key regex for tables like "GMP_Assumptions[0:0][1:1]"
_ION_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

# Quarter patterns: "2026Q1", "2026-Q1", "Q1 2026", "Q1-2026", "Q1"
_QUARTER_RE_1 = re.compile(r'^\s*(\d{4})\s*[-\s]?Q([1-4])\s*$', re.IGNORECASE)
_QUARTER_RE_2 = re.compile(r'^\s*Q([1-4])\s*[-\s]?(\d{4})\s*$', re.IGNORECASE)
_QUARTER_RE_NY = re.compile(r'^\s*Q([1-4])\s*$', re.IGNORECASE)  # no year

# Label patterns for start/duration pairs
_DURATION_LABEL_RE = re.compile(r'^(.*)_Duration_(Weeks|Months|Days|Hours)$', re.IGNORECASE)

# Global duration labels, e.g. "durratiion" / "duration_periods"
_GLOBAL_DURATION_LABEL_RE = re.compile(
    r'^(?:durratiion|duration_periods?|duration|total_duration|program_duration)$',
    re.IGNORECASE,
)

# ---------------- OpenAI client singleton ----------------
_client_singleton = None
def _get_client():
    global _client_singleton
    if _client_singleton is None and OpenAI is not None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

# ==========================================================
# 0) TEXT CLEANUP
# ==========================================================

def _clean_step_text(text: str) -> str:
    """
    Lightly normalize task/step text:
      - Trim whitespace
      - Drop leading bullets ("- ", "• ")
      - Drop leading punctuation (e.g., ",", ".", ";", ":", "!", "?", "…", "()", "[]", "-")
      - Collapse multiple spaces
      - Remove unnecessary space before punctuation
      - Strip trailing 'unused' punctuation (. , ; : ! ? …)

    Keeps internal punctuation (e.g., hyphens inside the text) intact.
    """
    if text is None:
        return ""
    s = str(text).strip()

    # Remove leading bullets
    s = re.sub(r'^[\-\u2022•]+\s*', '', s)

    # NEW: Remove leading punctuation characters, e.g. ", step starts..." -> "step starts..."
    s = re.sub(r'^[,.;:!?\u2026()\[\]\-]+\s*', '', s)

    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s)

    # Remove spaces before punctuation like ',', '.', ';', ':'
    s = re.sub(r'\s+([,.;:!?])', r'\1', s)

    # Strip trailing punctuation that usually isn't needed in a label/step
    s = re.sub(r'[.,;:!?\u2026]+$', '', s)

    return s.strip()

# ==========================================================
# 0) LABEL MAP HELPERS (tables + plates) + DATE PARSERS
# ==========================================================

def _extract_label_values_from_ion_tables(tables_obj: Any) -> Dict[str, str]:
    """
    Ion tables: "GMP_Assumptions[0:0][0:0]" = "Label", "GMP_Assumptions[1:1][0:0]" = "Value", etc.
    Interpret row 0 as Label row, row 1 as Value row.
    """
    if not isinstance(tables_obj, dict):
        return {}

    tables_cells: Dict[str, Dict[Tuple[int, int], Any]] = {}

    for key, val in tables_obj.items():
        if not isinstance(key, str):
            continue
        m = _ION_KEY_RE.match(key)
        if not m:
            continue
        tname, r_str, c_str = m.group(1), m.group(2), m.group(3)
        r = int(r_str)
        c = int(c_str)
        tables_cells.setdefault(tname, {})[(r, c)] = val

    label_values: Dict[str, str] = {}
    for tname, cells in tables_cells.items():
        if cells.get((0, 0)) == "Label" and cells.get((1, 0)) == "Value":
            for (r, c), v in list(cells.items()):
                if r == 0 and c > 0:
                    label = v
                    value = cells.get((1, c))
                    if isinstance(label, str) and value is not None:
                        label_values[label] = str(value)
        else:
            continue
    return label_values

def _extract_label_values_from_plates(plates: Any) -> Dict[str, str]:
    """
    Build {label -> value} from plate wells.
    For each well:
      - label = first entry in 'field' (if list) or 'field' (if str)
      - value = well['value']
    First occurrence wins (to avoid flipping back and forth).
    """
    label_values: Dict[str, str] = {}
    if not isinstance(plates, list):
        return label_values

    for plate in plates:
        if not isinstance(plate, dict):
            continue
        wells = plate.get("wells") or []
        for w in wells:
            if not isinstance(w, dict):
                continue
            val = w.get("value")
            if val is None:
                continue
            field = w.get("field")
            label: Optional[str] = None
            if isinstance(field, list) and field:
                label = str(field[0]).strip()
            elif isinstance(field, str):
                label = field.strip()
            if not label:
                continue
            if label not in label_values:
                label_values[label] = str(val)
    return label_values

def _infer_label_year(label_values: Dict[str, str], now: datetime) -> int:
    """
    Infer a default year from any 20xx substring in values; otherwise use now.year.
    """
    year_re = re.compile(r'\b(20\d{2})\b')
    for v in label_values.values():
        s = str(v)
        m = year_re.search(s)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                continue
    return now.year

def _parse_quarter_to_datetime(text: str, now: datetime, default_year: Optional[int]) -> Optional[datetime]:
    """
    Interpret quarter codes as first day of that quarter at 09:00:
      - "2026Q1", "2026-Q1"
      - "Q1 2026", "Q1-2026"
      - "Q1"  (uses default_year or now.year)
    """
    s = text.strip()
    m1 = _QUARTER_RE_1.match(s)
    m2 = _QUARTER_RE_2.match(s)
    mny = _QUARTER_RE_NY.match(s)

    year: Optional[int] = None
    q: Optional[int] = None

    if m1:
        year = int(m1.group(1))
        q = int(m1.group(2))
    elif m2:
        q = int(m2.group(1))
        year = int(m2.group(2))
    elif mny:
        q = int(mny.group(1))
        year = default_year if default_year is not None else now.year

    if year is None or q is None:
        return None

    month_map = {1: 1, 2: 4, 3: 7, 4: 10}
    month = month_map.get(q)
    if month is None:
        return None

    return datetime(year, month, 1, 9, 0, 0)

def _parse_dateish_value(
    value: str,
    now: datetime,
    default_year: Optional[int],
    allow_quarter: bool = True
) -> Optional[datetime]:
    """
    Try to interpret a table/plate 'Value' as date or quarter.
    """
    if not isinstance(value, str):
        value = str(value)
    s = value.strip()
    if not s:
        return None

    if allow_quarter:
        dt = _parse_quarter_to_datetime(s, now, default_year)
        if dt is not None:
            return dt

    # ISO-like
    try:
        dt = datetime.fromisoformat(s)
        return dt
    except Exception:
        pass

    # Natural language date
    try:
        base = now.replace(hour=9, minute=0, second=0, microsecond=0)
        dt = dtparser.parse(s, fuzzy=True, default=base)
        # If no explicit year, future-bias
        if not re.search(r'\b\d{4}\b', s) and dt < now:
            try:
                dt = dt.replace(year=dt.year + 1)
            except ValueError:
                dt = dt.replace(year=dt.year + 1, month=3, day=1)
        return dt
    except Exception:
        return None

def _parse_numeric(value: str) -> Optional[float]:
    """
    Parse numeric from '12', '12.0', '12 weeks', etc.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        pass
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    if m:
        try:
            return float(m.group(1))
        except Exception:
            return None
    return None

# ==========================================================
# 0.5) GPT HELPER FOR LABEL MAP (OPTIONAL)
# ==========================================================

def _gpt_analyze_label_values(
    label_values: Dict[str, str],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.1
) -> Dict[str, Any]:
    """
    Ask GPT to identify:
      - stages: name + start_label + duration_label + duration_unit
      - milestones: label + friendly name
    """
    client = _get_client()
    if client is None or not label_values:
        return {}

    labels_list = list(label_values.keys())
    preview_lines = [f"- {k}: {v}" for k, v in label_values.items()]
    preview_text = "\n".join(preview_lines[:60])

    system_prompt = (
        "You are a GMP operations scheduling assistant.\n"
        "Given Label -> Value pairs from assumptions (tables and plates), "
        "identify which labels define:\n"
        "  - stage intervals (start + duration), and\n"
        "  - milestones (single date/quarter events).\n\n"
        "Return STRICT JSON:\n"
        "{\n"
        "  \"stages\": [\n"
        "    {\n"
        "      \"name\": string,\n"
        "      \"start_label\": string,\n"
        "      \"duration_label\": string,\n"
        "      \"duration_unit\": \"weeks\" | \"months\" | \"days\" | \"hours\"\n"
        "    }, ...\n"
        "  ],\n"
        "  \"milestones\": [\n"
        "    {\"name\": string, \"label\": string}, ...\n"
        "  ]\n"
        "}\n"
        "Rules:\n"
        "- Use only provided labels; do not invent labels.\n"
        "- If unsure, leave arrays empty.\n"
        "- JSON only, no commentary."
    )

    user_msg = (
        "Available labels and values:\n"
        f"{preview_text}\n\n"
        f"Label names: {labels_list}"
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        data = json.loads(text)
        if not isinstance(data, dict):
            return {}
        return data
    except Exception as e:
        works.msg(f"⚠️ GPT label-analysis error, ignoring GPT hints: {e}")
        return {}

# ==========================================================
# 0.6) BUILD INTERVALS & MILESTONES FROM MERGED LABEL MAP
# ==========================================================

def build_intervals_and_milestones_from_labels(
    label_values: Dict[str, str],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Core logic that turns merged {label -> value} into:
      - intervals (stage intervals, global duration interval, short bars for dates)
      - milestones (all date/quarter labels)
    """
    intervals: List[Dict[str, Any]] = []
    milestones: List[Dict[str, Any]] = []
    now = datetime.now().replace(second=0, microsecond=0)

    if not label_values:
        return intervals, milestones

    default_year = _infer_label_year(label_values, now)

    # Parse all labels to datetimes (including quarters)
    label_to_dt: Dict[str, datetime] = {}
    for label, value in label_values.items():
        dt = _parse_dateish_value(value, now, default_year, allow_quarter=True)
        if dt is not None:
            label_to_dt[label] = dt

    # --- Heuristic stage intervals from *_Duration_* ---
    stage_intervals_done = set()

    for label, value in label_values.items():
        m = _DURATION_LABEL_RE.match(label)
        if not m:
            continue
        stage = m.group(1)  # e.g., "PPQ" from "PPQ_Duration_Weeks"
        unit = m.group(2).lower()  # Weeks, Months, Days, Hours
        num = _parse_numeric(value)
        if num is None:
            continue

        # where to get the start?
        candidate_start_labels = [
            f"{stage}_Start_Quarter",
            f"{stage}_Start_Date",
            f"{stage}_Start",
        ]
        start_dt = None
        for sl in candidate_start_labels:
            if sl in label_to_dt:
                start_dt = label_to_dt[sl]
                break
        # fallback: if stage itself is a label with a date value
        if start_dt is None and stage in label_to_dt:
            start_dt = label_to_dt[stage]

        if start_dt is None:
            # We can't safely build an interval with no anchor; skip here.
            continue

        # compute end
        u = unit.lower()
        if u.startswith("week"):
            end_dt = start_dt + timedelta(weeks=num)
        elif u.startswith("month"):
            end_dt = start_dt + relativedelta(months=int(round(num)))
        elif u.startswith("day"):
            end_dt = start_dt + timedelta(days=num)
        else:
            end_dt = start_dt + timedelta(hours=num)

        intervals.append({
            "name": stage,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "type": "interval",
            "y": random.uniform(0.05, 0.25),
            "color": "gray",
            "source": "labels_stage_heuristic",
        })
        stage_intervals_done.add(stage)

    # --- GLOBAL DURATION INTERVAL from durratiion / duration_periods / etc. ---
    global_duration_added = False
    for label, value in label_values.items():
        if not _GLOBAL_DURATION_LABEL_RE.match(label or ""):
            continue
        num = _parse_numeric(value)
        if num is None or num <= 0:
            continue

        # Anchor: earliest known date, else now
        if label_to_dt:
            start_dt = min(label_to_dt.values())
        else:
            start_dt = now

        # INTERPRETATION: treat "periods" as months for now
        months = max(1, int(round(num)))
        end_dt = start_dt + relativedelta(months=months)

        intervals.append({
            "name": _clean_step_text(label),
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "type": "interval",
            "y": random.uniform(0.05, 0.25),
            "color": "gray",
            "source": "labels_global_duration",
            "duration_periods": num,
            "duration_unit_assumed": "months",
        })
        global_duration_added = True
        # Only need at least one global-duration interval
        break

    # --- GPT hints (optional) ---
    gpt_info = _gpt_analyze_label_values(
        label_values,
        model=model,
        temperature=min(temperature, 0.5),
    )
    milestone_label_to_name: Dict[str, str] = {}

    if isinstance(gpt_info, dict):
        # Stages from GPT
        for st in (gpt_info.get("stages") or []):
            try:
                s_name = str(st.get("name") or "").strip()
                s_start_label = str(st.get("start_label") or "").strip()
                s_dur_label = str(st.get("duration_label") or "").strip()
                s_unit = str(st.get("duration_unit") or "").strip().lower()
                if not s_name or not s_start_label or not s_dur_label:
                    continue
                if s_start_label not in label_values or s_dur_label not in label_values:
                    continue

                # Don't override heuristic stage if already done
                if s_name in stage_intervals_done:
                    continue

                v_start = label_values[s_start_label]
                s_dt = _parse_dateish_value(v_start, now, default_year, allow_quarter=True)
                if s_dt is None:
                    continue

                v_dur = label_values[s_dur_label]
                d_num = _parse_numeric(v_dur)
                if d_num is None:
                    continue

                if s_unit not in ("weeks", "months", "days", "hours"):
                    if "week" in s_dur_label.lower():
                        s_unit = "weeks"
                    elif "month" in s_dur_label.lower():
                        s_unit = "months"
                    elif "day" in s_dur_label.lower():
                        s_unit = "days"
                    else:
                        s_unit = "weeks"

                if s_unit == "weeks":
                    e_dt = s_dt + timedelta(weeks=d_num)
                elif s_unit == "months":
                    e_dt = s_dt + relativedelta(months=int(round(d_num)))
                elif s_unit == "days":
                    e_dt = s_dt + timedelta(days=d_num)
                else:
                    e_dt = s_dt + timedelta(hours=d_num)

                intervals.append({
                    "name": s_name,
                    "start": s_dt.isoformat(),
                    "end": e_dt.isoformat(),
                    "type": "interval",
                    "y": random.uniform(0.05, 0.25),
                    "color": "gray",
                    "source": "labels_stage_gpt",
                })
                stage_intervals_done.add(s_name)
            except Exception:
                continue

        # Milestone names from GPT
        for m in (gpt_info.get("milestones") or []):
            try:
                m_name = str(m.get("name") or "").strip()
                m_label = str(m.get("label") or "").strip()
                if not m_label:
                    continue
                if not m_name:
                    m_name = m_label
                milestone_label_to_name[m_label] = m_name
            except Exception:
                continue

    # --- Milestones for all date/quarter labels ---
    for label, dt in label_to_dt.items():
        name = milestone_label_to_name.get(label, label)
        milestones.append({
            "time": dt.isoformat(),
            "type": "milestone",
            "name": name,
            "color": "red",
            "y": MILESTONE_DEFAULT_Y,
            "source": "labels_date",
        })

    return intervals, milestones

# ==========================================================
# 1) PLATE-AWARE PROMPT → STEP LINES (using GPT)
# ==========================================================

def _collect_plate_labels(plates: Any, max_labels: int = 40) -> List[str]:
    labels: List[str] = []
    seen = set()

    if not isinstance(plates, list):
        return []

    def _add(s: str):
        s = (s or "").strip()
        if not s:
            return
        if len(s) > 80:
            return
        key = s.lower()
        if key not in seen:
            seen.add(key)
            labels.append(s)

    for p in plates:
        if not isinstance(p, dict):
            continue
        pname = p.get("name")
        if isinstance(pname, str):
            _add(pname)

        wells = p.get("wells") or []
        for w in wells:
            if not isinstance(w, dict):
                continue
            field = w.get("field")
            if isinstance(field, list):
                for f in field:
                    if isinstance(f, str):
                        _add(f)
            elif isinstance(field, str):
                _add(field)
            val = w.get("value")
            if isinstance(val, str):
                if 1 <= len(val.strip()) <= 60:
                    _add(val)
            if len(labels) >= max_labels:
                return labels

    return labels[:max_labels]

# >>> GPT FILTER for step lines
def _gpt_filter_step_lines(
    user_prompt: str,
    candidate_lines: List[str],
    plates: Any,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.1,
    max_lines: int = 20,
) -> List[str]:
    """
    Use GPT to ensure that the step lines are *actual tasks* tied to the user_prompt
    and not noise like structural information from tables/plates.

    Also: clean wording and remove unnecessary punctuation.
    """
    client = _get_client()
    if client is None or not candidate_lines:
        # Local cleanup even if no GPT
        return [_clean_step_text(l) for l in candidate_lines if l and l.strip()]

    labels = _collect_plate_labels(plates)
    labels_preview = "\n".join(f"- {lab}" for lab in labels) if labels else "(none)"

    system_prompt = (
        "You are an operations planning assistant.\n"
        "You are given:\n"
        "  (1) The original user prompt describing a program.\n"
        "  (2) A list of candidate step lines.\n"
        "  (3) A list of plate/table labels that may contain structural metadata.\n\n"
        "Your job is to FILTER the candidate step lines so that only TRUE TASKS remain, "
        "and lightly CLEAN their wording and punctuation.\n\n"
        "Definition of a valid task line:\n"
        "- It describes a concrete operation, activity, or phase of work.\n"
        "- It is directly relevant to the user prompt.\n"
        "- It usually implies something to be done over time (e.g., execution, development, validation, manufacturing, analysis).\n"
        "- It is understandable as a standalone step in a schedule.\n\n"
        "You MUST DROP lines that:\n"
        "- Only restate table/plate structure or labels (e.g., well IDs, column headers, data fields).\n"
        "- Are just names of columns, categories, or metadata fields.\n"
        "- Are only structural phrases like 'Plate Layout', 'Dose Level', 'Assay Name', etc., with no action.\n"
        "- Are not clearly describing an action, process, or phase.\n\n"
        "When you KEEP a line:\n"
        "- You MAY rewrite it slightly to remove unnecessary filler words.\n"
        "- You SHOULD remove unnecessary trailing punctuation and keep the text concise.\n"
        "- Keep dates and durations intact.\n\n"
        "Return STRICT JSON ONLY in the form:\n"
        "{ \"lines\": [\"kept line 1\", \"kept line 2\", ...] }\n"
        "Preserve the original order of lines you keep.\n"
        "If none are valid, return {\"lines\": []}."
    )

    user_msg = (
        f"USER PROMPT:\n{user_prompt or ''}\n\n"
        "CANDIDATE STEP LINES:\n"
        + "\n".join(f"- {l}" for l in candidate_lines)
        + "\n\nPLATE/TABLE LABELS (possible structural metadata):\n"
        + labels_preview
        + f"\n\nReturn at most {max_lines} filtered, cleaned lines."
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        data = json.loads(text)
        raw_lines = data.get("lines") or []
        filtered: List[str] = []
        for l in raw_lines:
            if isinstance(l, str):
                s = _clean_step_text(l)
                if s:
                    filtered.append(s)
        if not filtered:
            return []
        return filtered[:max_lines]
    except Exception as e:
        works.msg(f"⚠️ GPT filter-step-lines error, using unfiltered lines: {e}")
        return [_clean_step_text(l) for l in candidate_lines if l and l.strip()]

def _gpt_expand_prompt_to_lines(
    user_prompt: str,
    plates: Any,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    max_lines: int = 20
) -> List[str]:
    client = _get_client()
    # Fallback if no GPT client: naive line split + cleanup
    if client is None:
        return [_clean_step_text(l) for l in (user_prompt or "").splitlines() if l.strip()]

    labels = _collect_plate_labels(plates)
    labels_preview = "\n".join(f"- {lab}" for lab in labels) if labels else "(none)"

    system_prompt = (
        "You are an operations planning assistant. "
        "Given a high-level description of a program and some plate/well labels, "
        "you must break the work into a set of SCHEDULING-FRIENDLY steps.\n\n"
        "Output STRICT JSON of the form:\n"
        "{ \"lines\": [\"line 1\", \"line 2\", \"...\"] }\n\n"
        "Each line MUST:\n"
        "- Describe exactly ONE step or phase that is a real operational task.\n"
        "- Be directly relevant to the user's program description.\n"
        "- Include either:\n"
        "    * an explicit start date (e.g., 'starting Jan 1 2026', 'on March 15'), and/or\n"
        "    * a duration (e.g., 'for 3 months', '2 weeks', '10 days'), or both.\n"
        "- Be understandable without external context.\n"
        "- Avoid unnecessary filler words and punctuation (do not end with a period unless needed).\n\n"
        "Rules:\n"
        "- Use natural dates and durations so they can be parsed by a scheduling engine.\n"
        "- If the year is omitted (e.g., 'Jan 1'), assume the next occurrence in the future.\n"
        "- Limit to about 5–20 lines.\n"
        "- Prefer using plate/step labels as part of task names WHEN THEY ARE PART OF REAL WORK, "
        "  but DO NOT create steps that are just structural information from tables or plates "
        "  (e.g., column names, well IDs, 'Plate Layout', etc.).\n"
        "- Return ONLY valid JSON, no commentary."
    )

    user_msg = (
        f"now={datetime.now().isoformat()}\n\n"
        f"USER PROMPT:\n{user_prompt or ''}\n\n"
        f"PLATE / WELL LABEL HINTS (may include structural fields):\n{labels_preview}\n\n"
        f"Please return at most {max_lines} step lines."
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        data = json.loads(text)
        raw_lines = data.get("lines") or []
        lines = []
        for l in raw_lines:
            if isinstance(l, str):
                s = _clean_step_text(l)
                if s:
                    lines.append(s)

        if not lines:
            raise ValueError("GPT returned no usable lines")

        # >>> run filter pass to drop non-task / structural noise and clean
        works.msg("🧹 filtering GPT step lines to remove structural/table noise and clean text…")
        filtered_lines = _gpt_filter_step_lines(
            user_prompt,
            lines,
            plates,
            model=model,
            temperature=min(temperature, 0.4),
            max_lines=max_lines,
        )

        if filtered_lines:
            return filtered_lines[:max_lines]

        # If filter wiped everything out, fall back to original cleaned lines
        works.msg("⚠️ GPT filter removed all lines; using unfiltered lines from expansion.")
        return lines[:max_lines]

    except Exception as e:
        works.msg(f"⚠️ GPT expansion error, using raw prompt lines instead: {e}")
        return [_clean_step_text(l) for l in (user_prompt or "").splitlines() if l.strip()]

# ==========================================================
# 2) HYBRID SCHEDULER FOR LINES
# ==========================================================

def _parse_future_biased_date(text: str, now: datetime) -> Optional[datetime]:
    if not _MONTH_TOKEN_RE.search(text):
        return None
    try:
        base = now.replace(hour=9, minute=0, second=0, microsecond=0)
        dt = dtparser.parse(text, fuzzy=True, default=base)
        if not re.search(r'\b\d{4}\b', text):
            dt = dt.replace(year=now.year)
        if dt < now:
            try:
                dt = dt.replace(year=dt.year + 1)
            except ValueError:
                dt = dt.replace(year=dt.year + 1, month=3, day=1)
        return dt
    except Exception:
        return None

def _parse_explicit_start(line: str, now: datetime) -> Optional[datetime]:
    m = _START_QUALIFIERS.search(line)
    if not m:
        return None
    segment = line[m.end():].strip()
    if not segment:
        return None

    mdate = _NATDATE_RE.search(segment)
    if mdate:
        token = mdate.group(0)
        try:
            base = now.replace(hour=9, minute=0, second=0, microsecond=0)
            dt = dtparser.parse(token, fuzzy=False, default=base)
            if mdate.group(3) is None and dt < now:
                try:
                    dt = dt.replace(year=dt.year + 1)
                except ValueError:
                    dt = dt.replace(year=dt.year + 1, month=3, day=1)
            return dt
        except Exception:
            pass

    try:
        base = now.replace(hour=9, minute=0, second=0, microsecond=0)
        dt = dtparser.parse(segment, fuzzy=True, default=base)
        if not re.search(r'\b\d{4}\b', segment) and dt < now:
            try:
                dt = dt.replace(year=dt.year + 1)
            except ValueError:
                dt = dt.replace(year=dt.year + 1, month=3, day=1)
        return dt
    except Exception:
        return None

def _parse_duration(line: str) -> Tuple[Optional[float], Optional[str], bool]:
    m = _TRAIL_DUR_RE.search(line)
    if not m:
        return None, None, False
    num = float(m.group(1))
    unit = m.group(2).lower()
    expect_flag = bool(re.search(r'(?i)\bexpect\b', line))
    return num, unit, expect_flag

def _local_parse_line(line: str, now: datetime) -> Tuple[Optional[datetime], Optional[datetime]]:
    start_dt = _parse_explicit_start(line, now)
    if start_dt is None:
        start_dt = _parse_future_biased_date(line, now)

    end_dt: Optional[datetime] = None
    num, unit, expect_flag = _parse_duration(line)
    if start_dt and num is not None and unit is not None:
        if unit.startswith('mo'):
            months_int = max(1, int(round(num))) if num >= 1 else 1
            months_to_add = max(1, months_int - 1) if expect_flag else months_int
            end_dt = start_dt + relativedelta(months=months_to_add)
        elif unit.startswith('wk') or unit.startswith('w'):
            end_dt = start_dt + timedelta(weeks=num)
        elif unit.startswith('d'):
            end_dt = start_dt + timedelta(days=num)
        else:
            end_dt = start_dt + timedelta(hours=num)

    return start_dt, end_dt

def _chat_schedule_fallback(
    line: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2
) -> Optional[Dict[str, Any]]:
    client = _get_client()
    if client is None:
        return None
    system_prompt = (
        "You are a scheduling assistant. "
        "Given ONE line of text about an operation or task, return STRICT JSON:\n"
        "{\"name\": string, \"start\": \"YYYY-MM-DDTHH:MM:SS\", \"end\": \"YYYY-MM-DDTHH:MM:SS\"}.\n"
        "Rules:\n"
        "- If a duration like '3 months' or '2 weeks' is mentioned, compute end accordingly.\n"
        "- If only a date is mentioned and it's not qualified by 'until/ending/through', treat it as a START date.\n"
        "- If the date lacks a year, assume the next future occurrence.\n"
        "- If no date is found, use TODAY 09:00 for start and +4 hours for end.\n"
        "Return ONLY JSON."
    )
    user_prompt = f"now={datetime.now().isoformat()}\nTask line: {line.strip()}"
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=temperature,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            text = (resp.choices[0].message.content or '').strip()
            return json.loads(text)
        except (APITimeoutError, Exception) as e:
            works.msg(f"⚠️ GPT schedule-fallback error: {e}; retrying...")
            time.sleep(2 ** attempt)
    return None

def build_interval_for_line(line: str, *, model: str, temperature: float) -> Dict[str, Any]:
    name = _clean_step_text(line or "Untitled")
    now = datetime.now().replace(second=0, microsecond=0)

    start_dt, end_dt = _local_parse_line(line, now)

    need_gpt = False
    if start_dt is None:
        need_gpt = True
    elif end_dt is None:
        num, unit, _expect = _parse_duration(line)
        if not (num is not None and unit is not None):
            need_gpt = True

    if need_gpt:
        data = _chat_schedule_fallback(line, model=model, temperature=temperature) or {}
        if data.get("name"):
            name = _clean_step_text(str(data["name"]).strip() or name)
        if start_dt is None:
            try:
                start_dt = datetime.fromisoformat(str(data.get("start")))
            except Exception:
                start_dt = now
        if end_dt is None:
            try:
                end_dt = datetime.fromisoformat(str(data.get("end")))
            except Exception:
                end_dt = (start_dt or now) + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    if start_dt is None:
        start_dt = now
    if end_dt is None:
        end_dt = start_dt + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt

    return {
        "name": name,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "type": "interval",
        "y": random.uniform(0.3, 0.6),
        "color": "black",
        "source": "line",
    }

def build_intervals_from_lines(
    lines: List[str],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2
) -> Dict[str, Any]:
    if not lines:
        now = datetime.now()
        return {
            "intervals": [],
            "window": {"start": now.isoformat(), "end": now.isoformat()},
            "lines": [],
        }

    intervals: List[Dict[str, Any]] = []
    for line in lines:
        intervals.append(build_interval_for_line(line, model=model, temperature=temperature))

    min_start = min(datetime.fromisoformat(i['start']) for i in intervals)
    max_end   = max(datetime.fromisoformat(i['end'])   for i in intervals)

    def _hours_from(ref: datetime, dt: datetime) -> float:
        return max(0.0, (dt - ref).total_seconds() / 3600.0)

    for i in intervals:
        sdt = datetime.fromisoformat(i['start'])
        edt = datetime.fromisoformat(i['end'])
        i['startX'] = _hours_from(min_start, sdt)
        i['x']      = _hours_from(min_start, edt)

    return {
        "intervals": intervals,
        "window": {"start": min_start.isoformat(), "end": max_end.isoformat()},
        "lines": lines,
    }

# ==========================================================
# 3) LAYOUT NORMALIZATION (intervals + milestones)
# ==========================================================

def _normalize_time_layout(
    intervals: List[Dict[str, Any]],
    milestones: List[Dict[str, Any]]
) -> Dict[str, Any]:
    times: List[datetime] = []

    for i in intervals:
        try:
            times.append(datetime.fromisoformat(i['start']))
            times.append(datetime.fromisoformat(i['end']))
        except Exception:
            continue

    for m in milestones:
        try:
            times.append(datetime.fromisoformat(m['time']))
        except Exception:
            continue

    if not times:
        now = datetime.now()
        return {
            "intervals": [],
            "milestones": [],
            "window": {"start": now.isoformat(), "end": now.isoformat()},
        }

    min_start = min(times)
    max_end   = max(times)

    def _hours_from(ref: datetime, dt: datetime) -> float:
        return max(0.0, (dt - ref).total_seconds() / 3600.0)

    for i in intervals:
        try:
            sdt = datetime.fromisoformat(i['start'])
            edt = datetime.fromisoformat(i['end'])
        except Exception:
            continue
        i['startX'] = _hours_from(min_start, sdt)
        i['x']      = _hours_from(min_start, edt)

    for m in milestones:
        try:
            mdt = datetime.fromisoformat(m['time'])
        except Exception:
            continue
        m['x'] = _hours_from(min_start, mdt)
        if 'y' not in m or m['y'] is None:
            m['y'] = MILESTONE_DEFAULT_Y
        m['type'] = 'milestone'
        m['color'] = m.get('color', 'red')

    return {
        "intervals": intervals,
        "milestones": milestones,
        "window": {"start": min_start.isoformat(), "end": max_end.isoformat()},
    }

# ==========================================================
# 4) Ion entry
# ==========================================================

def _read_param(i: int):
    try:
        return works.param(i)
    except Exception:
        return None

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    user_prompt = _read_param(1)
    if not user_prompt:
        works.resolve({"status": "❌ error", "error": "param(1) required: user_prompt"})
        return 1

    raw2 = _read_param(2)
    plates: Any = []
    tables_obj: Optional[Dict[str, Any]] = None

    if isinstance(raw2, list):
        plates = raw2
    elif isinstance(raw2, dict):
        # allow artifact with "tables" and/or "plates"
        if isinstance(raw2.get("tables"), dict):
            tables_obj = raw2["tables"]
        if isinstance(raw2.get("plates"), list):
            plates = raw2["plates"]
        # or treat the dict itself as a tables-object if no "tables" key
        if tables_obj is None and any(_ION_KEY_RE.match(k or "") for k in raw2.keys()):
            tables_obj = raw2
    else:
        plates = []

    model = _read_param(3) or default_model
    try:
        temperature = float(_read_param(4) or 0.2)
    except Exception:
        temperature = 0.2

    try:
        works.msg("🧩 expanding user prompt + plate labels into step lines…")
        step_lines = _gpt_expand_prompt_to_lines(
            str(user_prompt),
            plates,
            model=str(model),
            temperature=temperature,
        )

        works.msg(f"🧠 hybrid parse of {len(step_lines)} step lines…")
        line_result = build_intervals_from_lines(
            step_lines,
            model=str(model),
            temperature=temperature,
        )

        intervals: List[Dict[str, Any]] = list(line_result["intervals"])
        milestones: List[Dict[str, Any]] = []
        lines: List[str] = list(line_result["lines"])

        # --- Build merged label->value map from tables + plates ---
        merged_label_values: Dict[str, str] = {}

        if tables_obj:
            works.msg("📊 extracting label/value pairs from tables…")
            table_label_values = _extract_label_values_from_ion_tables(tables_obj)
            merged_label_values.update(table_label_values)

        if plates:
            works.msg("📍 extracting label/value pairs from plates…")
            plate_label_values = _extract_label_values_from_plates(plates)
            # let plates override tables for same label
            merged_label_values.update(plate_label_values)

        if merged_label_values:
            works.msg("🧮 building intervals + milestones from merged labels (heuristics + GPT + duration_periods)…")
            label_intervals, label_milestones = build_intervals_and_milestones_from_labels(
                merged_label_values,
                model=str(model),
                temperature=temperature,
            )
            intervals.extend(label_intervals)
            milestones.extend(label_milestones)

        layout = _normalize_time_layout(intervals, milestones)

        # FINAL SAFETY PASS: make sure every step/line is trimmed and free of leading punctuation
        clean_lines = [_clean_step_text(l) for l in lines]
        clean_steps = [_clean_step_text(s) for s in step_lines]

        result: Dict[str, Any] = {
            "intervals": layout["intervals"],
            "milestones": layout["milestones"],
            "window": layout["window"],
            "lines": clean_lines,
            "steps": clean_steps,
        }
        if merged_label_values:
            result["label_values"] = merged_label_values

        works.resolve(result)
        return 0
    except Exception as e:
        works.msg(f"❌ error: {e}")
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1

if __name__ == "__main__":
    works.msg("🔧 operations scheduler — plate/table-aware prompt rewriter + merged-label intervals/milestones")
    _main_ion("gpt-4o-mini")

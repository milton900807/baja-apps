#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Assumptions-only builder (Ion Works entry/exit).

Purpose (PROJECT / CAMPAIGN)
----------------------------
• Builds a default two-column Assumptions table for a specific project or campaign.
• Automatically sets today's date as start_date if the prompt does not include one.
• Removes revenue-related items for non-revenue or internal projects.
• Avoids acronyms in labels (use descriptive words like cost_per_click, not CPC).

Expected Ion params
-------------------
param(1) = user prompt (e.g., "Create a budget for a marketing campaign for our software.")
param(2) = model (optional; default gpt-4o-mini)
param(3) = temperature (optional; default 0.2)
"""

import os
import json
import re
import datetime
from typing import Dict, List, Any

from ion import works  # type: ignore
from openai import OpenAI


# ---------- helpers ----------
def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _chat_call(*, model: str, system: str, user: str, temperature: float = 0.2, json_mode: bool = False, max_tokens: int = 1500) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


def _extract_json_snippet(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return text[start:end + 1].strip()


# ---------- Base instruction ----------
ASSUMPTIONS_JSON_INSTRUCTIONS = """
You generate ONLY a two-column 'Assumptions' table for a PROJECT or CAMPAIGN budget or plan.

Return STRICT JSON with this EXACT schema:
{
  "assumptions": [
    {"label": "Currency", "value": "USD"},
    {"label": "Start_Year", "value": "2025"}
  ]
}

Rules:
- 'assumptions' is a list of objects with 'label' and 'value'.
- Include 20–40 rows based on the prompt.
- Use descriptive names; avoid acronyms (e.g., click_through_rate, not CTR; cost_per_click, not CPC).
- Focus on scope, time, costs, resources, and metrics.

Include:
1. Timeframe: start_date, duration_months, reporting_frequency, region.
2. Campaign or project metrics: audience_size, reach_percentage, impressions_per_user,
   click_through_rate, cost_per_click_usd, cost_per_thousand_impressions_usd, conversion_rate,
   engagement_rate, activity_targets.
3. Channel mix: channel_list, spend_share_by_channel (total ~1.0), creative_refresh_frequency_weeks.
4. Budgets: paid_media_budget_usd, content_budget_usd, events_budget_usd,
   communications_budget_usd, technology_tools_budget_usd, external_services_budget_usd,
   contingency_percentage.
5. Staffing: project_manager_full_time_equivalent, marketing_manager_full_time_equivalent,
   designer_full_time_equivalent, contractor_hours_per_month, average_hourly_rate_usd.
6. Operating costs: software_subscriptions_per_month_usd, analytics_tools_cost_per_month_usd,
   data_storage_cost_per_month_usd.
7. Finance: tax_rate (0–1), discount_rate (0–1), payment_terms_days, working_capital_days.
8. Capex & depreciation if any: capital_expenditure_usd, depreciation_years.
9. Currency, start_year, and annual_growth_rate for any recurring cost.

Additional rules:
- Use 0–1 for percentages (e.g., tax_rate=0.21).
- Include monthly values when appropriate.
- If start_date is not provided, assume current date.
- No other tables, formulas, or commentary.
"""


def generate_assumptions(user_prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2) -> List[Dict[str, str]]:
    system = "You are a careful financial modeling assistant. You STRICTLY follow output schemas."

    # --- Default start_date if none provided ---
    date_pattern = re.compile(r"\b(20\d{2}|19\d{2})([-/.]\d{1,2})?([-/\.]\d{1,2})?\b")
    has_date = bool(date_pattern.search(user_prompt))
    today_str = datetime.date.today().isoformat()
    augmented_prompt = user_prompt.strip()
    if not has_date:
        augmented_prompt += f"\n\n(Note: no date provided; assume start_date = {today_str})"
        works.msg(f"📅 Using start_date = {today_str}")

    # --- Detect non-revenue context ---
    revenue_keywords = ["revenue", "sales", "price", "customer", "deal", "income", "arpu", "mrr"]
    has_revenue = any(k in augmented_prompt.lower() for k in revenue_keywords)

    if not has_revenue:
        works.msg("💡 Detected cost-only (non-revenue) project.")
        llm_instructions = ASSUMPTIONS_JSON_INSTRUCTIONS.replace(
            "Campaign or project metrics: audience_size, reach_percentage, impressions_per_user,",
            "Activity metrics: audience_size, reach_percentage, impressions_per_user,"
        ) + "\n\nAdditional rule: This is a non-revenue project. Do NOT include revenue, income, or customer-related fields."
    else:
        llm_instructions = ASSUMPTIONS_JSON_INSTRUCTIONS

    # --- Compose GPT message ---
    user = f"{llm_instructions}\n\nUser prompt:\n{augmented_prompt}"

    works.msg("🔒 requesting JSON assumptions from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=2200,
    )

    # --- Parse ---
    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    items = (data.get("assumptions") or [])
    out: List[Dict[str, str]] = []
    seen = set()
    for it in items:
        label = str(it.get("label", "")).strip()
        if not label:
            continue
        label = re.sub(r"\s+", "_", label)
        if label in seen:
            continue
        value = str(it.get("value", ""))
        out.append({"label": label, "value": value})
        seen.add(label)
    return out


# ---------- Formatting ----------
def to_two_col_table(name: str, rows: List[Dict[str, str]]) -> Dict[str, str]:
    t: Dict[str, str] = {_key(name, 0, 0): "Label", _key(name, 1, 0): "Value"}
    for i, kv in enumerate(rows, 1):
        t[_key(name, 0, i)] = kv["label"]
        t[_key(name, 1, i)] = kv["value"]
    return t


def infer_units(name: str, rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    u: Dict[str, Dict[str, str]] = {name: {}}
    for kv in rows:
        lab = kv["label"].lower()
        if "usd" in lab:
            u[name][kv["label"]] = "USD"
        elif "date" in lab:
            u[name][kv["label"]] = "date"
        elif "month" in lab:
            u[name][kv["label"]] = "months"
        elif "year" in lab:
            u[name][kv["label"]] = "years"
        elif "rate" in lab or "percentage" in lab:
            u[name][kv["label"]] = "fraction"
        elif "days" in lab:
            u[name][kv["label"]] = "days"
        elif "hours" in lab:
            u[name][kv["label"]] = "hours"
        elif "equivalent" in lab or "fte" in lab:
            u[name][kv["label"]] = "count"
        else:
            u[name][kv["label"]] = "unitless"
    return u


# ---------- Orchestrator ----------
def run_assumptions_only(user_prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2) -> Dict[str, Any]:
    works.msg("🧠 assumptions-only pipeline starting…")
    rows = generate_assumptions(user_prompt, model=model, temperature=temperature)
    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")
    tables = to_two_col_table("Assumptions", rows)
    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {"Assumptions": "Defaults inferred from user prompt (no acronyms)."},
        "units": infer_units("Assumptions", rows) if rows else {"Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
    }
    return artifact


# ---------- Ion entry ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading project/campaign budget assumption builder…")
    try:
        user_prompt = works.param(1)
        if not user_prompt:
            raise RuntimeError("Ion: param(1) required (user prompt).")
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    model = works.param(2) or default_model
    try:
        temperature_raw = works.param(3)
        temperature = float(temperature_raw) if temperature_raw is not None else 0.2
    except Exception:
        temperature = 0.2

    try:
        artifact = run_assumptions_only(user_prompt, model=model, temperature=temperature)
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "assumptions-only",
        })
        return 1


# ---------- Bootstrap ----------
if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

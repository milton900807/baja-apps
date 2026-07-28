#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Formula-connected product assumptions and production-cost builder for Ion Works.

Ion parameters
--------------
param(1): Product description (required)
param(2): OpenAI model (optional; default: gpt-4o-mini)
param(3): Temperature (optional; default: 0.15)
param(4): Product/category hint (optional)

Output tables
-------------
Assumptions:
    Discrete editable values, including component quantities, component prices,
    yield, labor, machine time, overhead, setup, volume, and tooling.

Component_Directory:
    Human-readable component index with the corresponding assumption labels.

Product_Costs:
    Formula-connected BOM extensions, production-cost build-up, total batch
    cost, cost per good unit, and fully loaded cost.

The language model identifies plausible components and input assumptions.
All formulas are built and validated by Python.
"""

import json
import math
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from ion import works  # type: ignore
from openai import OpenAI


ASSUMPTIONS_TABLE = "Assumptions"
DIRECTORY_TABLE = "Component_Directory"
COST_TABLE = "Product_Costs"

PRODUCTION_DEFAULTS: Dict[str, Any] = {
    "Currency": "USD",
    "Production_Volume_Good_Units": 1000,
    "Manufacturing_Yield_Rate": 0.95,
    "Direct_Labor_Hours_Per_Started_Unit": 0.25,
    "Direct_Labor_Rate_USD_Per_Hour": 30.0,
    "Machine_Hours_Per_Started_Unit": 0.10,
    "Machine_Rate_USD_Per_Hour": 25.0,
    "Quality_Testing_Cost_USD_Per_Good_Unit": 2.0,
    "Outbound_Packaging_Cost_USD_Per_Good_Unit": 1.0,
    "Inbound_Freight_Rate": 0.03,
    "Manufacturing_Overhead_Rate": 0.15,
    "Batch_Setup_Cost_USD": 500.0,
    "Other_Batch_Cost_USD": 0.0,
    "Tooling_Equipment_Cost_USD": 10000.0,
    "Tooling_Amortization_Units": 10000,
    "Contingency_Rate": 0.10,
}

RATE_LABELS = {
    "Manufacturing_Yield_Rate",
    "Inbound_Freight_Rate",
    "Manufacturing_Overhead_Rate",
    "Contingency_Rate",
}

FORMULA_REF_RE = re.compile(
    r"(?P<table>[A-Za-z_][A-Za-z0-9_]*)"
    r"\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]"
)
SAFE_FORMULA_RE = re.compile(r"^[A-Za-z0-9_\[\].+\-*/^()]+$")
WIRE_KEY_RE = re.compile(
    r"^(?P<table>[A-Za-z_][A-Za-z0-9_]*)"
    r"\[(?P<column>\d+):(?P=column)\]"
    r"\[(?P<row>\d+):(?P=row)\]$"
)


def _key(table: str, column: int, row: int) -> str:
    return f"{table}[{column}:{column}][{row}:{row}]"


def _to_jsonable(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False))
    except Exception:
        return str(value)


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        result = float(value)
    else:
        text = str(value).strip().replace(",", "").replace("$", "")
        if text.endswith("%"):
            try:
                result = float(text[:-1]) / 100.0
            except ValueError:
                return default
        else:
            try:
                result = float(text)
            except ValueError:
                return default
    return result if math.isfinite(result) else default


def _machine_label(value: Any, fallback: str) -> str:
    label = re.sub(r"\s+", "_", str(value or "").strip())
    label = re.sub(r"[^A-Za-z0-9_]", "_", label)
    label = re.sub(r"_+", "_", label).strip("_")
    if not label:
        label = fallback
    if not re.match(r"^[A-Za-z_]", label):
        label = f"A_{label}"
    # Output identifiers may never contain the reserved substring "_0".
    # Preserve the zero semantically instead of silently deleting it.
    label = label.replace("_0", "_Zero")
    return label[:72]


def _display_text(value: Any, fallback: str = "") -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:180] if text else fallback


def _extract_json(text: str) -> Dict[str, Any]:
    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("The model response did not contain a JSON object.")
        result = json.loads(text[start : end + 1])
    if not isinstance(result, dict):
        raise ValueError("The model response must be a JSON object.")
    return result


def _chat_json(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> Dict[str, Any]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set.")
    response = OpenAI().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return _extract_json(response.choices[0].message.content or "")


def infer_product_inputs(
    product_prompt: str,
    *,
    model: str,
    temperature: float,
    product_hint: Optional[str],
) -> Dict[str, Any]:
    works.msg("Identifying components and discrete production inputs...")
    user_prompt = f"""
Create a preliminary bill of materials and production input set for:

{product_prompt.strip()}

Product/category hint:
{product_hint or "Infer from the description."}

Return strict JSON with exactly this structure:
{{
  "product": {{
    "name": "short product name",
    "category": "product category",
    "production_process": "short process description",
    "scope_note": "included and excluded scope"
  }},
  "components": [
    {{
      "component": "specific component, material, reagent, subassembly, consumable, or packaging item",
      "category": "Raw_Material, Purchased_Part, Subassembly, Consumable, Packaging, or Other",
      "quantity_per_started_unit": 1.0,
      "unit_of_measure": "each, kg, g, L, mL, m, dose, or other",
      "unit_cost_usd": 1.0,
      "basis": "user_provided, benchmark, inferred, or placeholder",
      "confidence": "high, medium, or low",
      "notes": "brief sourcing or specification note"
    }}
  ],
  "production_assumptions": {{
    "Currency": "USD",
    "Production_Volume_Good_Units": 1000,
    "Manufacturing_Yield_Rate": 0.95,
    "Direct_Labor_Hours_Per_Started_Unit": 0.25,
    "Direct_Labor_Rate_USD_Per_Hour": 30.0,
    "Machine_Hours_Per_Started_Unit": 0.10,
    "Machine_Rate_USD_Per_Hour": 25.0,
    "Quality_Testing_Cost_USD_Per_Good_Unit": 2.0,
    "Outbound_Packaging_Cost_USD_Per_Good_Unit": 1.0,
    "Inbound_Freight_Rate": 0.03,
    "Manufacturing_Overhead_Rate": 0.15,
    "Batch_Setup_Cost_USD": 500.0,
    "Other_Batch_Cost_USD": 0.0,
    "Tooling_Equipment_Cost_USD": 10000.0,
    "Tooling_Amortization_Units": 10000,
    "Contingency_Rate": 0.10
  }},
  "excluded_costs": ["excluded item"],
  "critical_unknowns": ["input requiring a supplier quote or process test"]
}}

Rules:
- Return 5 to 40 distinct components needed to manufacture and deliver one
  complete product.
- Include raw materials, purchased parts, subassemblies, process consumables,
  labels, primary packaging, and protective packaging when applicable.
- Do not include labor, machine time, testing, overhead, freight, setup,
  tooling, or contingency as component rows; use production_assumptions.
- Quantities and costs must be nonnegative numbers.
- Rates must be fractions between 0 and 1.
- Preserve user-supplied values. Clearly label estimates as inferred or
  placeholder rather than supplier quotes.
- Do not calculate totals and do not return formulas.
"""
    result = _chat_json(
        model=model,
        system_prompt=(
            "You are a manufacturing cost engineer who creates preliminary BOMs. "
            "Return valid JSON only and distinguish estimates from known inputs."
        ),
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=7000,
    )
    result.setdefault("product", {})
    result.setdefault("components", [])
    result.setdefault("production_assumptions", {})
    result.setdefault("excluded_costs", [])
    result.setdefault("critical_unknowns", [])
    return result


def normalize_components(raw: Any) -> List[Dict[str, Any]]:
    source = raw if isinstance(raw, list) else []
    components: List[Dict[str, Any]] = []
    used_ids: Set[str] = set()

    for index, item in enumerate(source, start=1):
        if not isinstance(item, dict):
            continue
        name = _display_text(item.get("component"), f"Component {index}")
        base_id = _machine_label(name, f"Component_{index}")
        component_id = f"Component_{index}_{base_id}"[:72]
        suffix = 2
        while component_id in used_ids:
            component_id = f"{component_id[:66]}_{suffix}"
            suffix += 1
        used_ids.add(component_id)

        components.append(
            {
                "id": component_id,
                "component": name,
                "category": _display_text(item.get("category"), "Other"),
                "quantity": max(
                    0.0, _safe_float(item.get("quantity_per_started_unit"))
                ),
                "unit": _display_text(item.get("unit_of_measure"), "each"),
                "unit_cost": max(0.0, _safe_float(item.get("unit_cost_usd"))),
                "basis": _display_text(item.get("basis"), "placeholder"),
                "confidence": _display_text(item.get("confidence"), "low"),
                "notes": _display_text(item.get("notes")),
            }
        )

    if not components:
        components.append(
            {
                "id": "Component_1_Unspecified_Component_Set",
                "component": "Unspecified Component Set",
                "category": "Other",
                "quantity": 1.0,
                "unit": "set",
                "unit_cost": 0.0,
                "basis": "placeholder",
                "confidence": "low",
                "notes": "Replace this placeholder with a preliminary BOM.",
            }
        )
    return components


def normalize_production_assumptions(raw: Any) -> Dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    normalized: Dict[str, Any] = {}
    for label, default in PRODUCTION_DEFAULTS.items():
        if label == "Currency":
            normalized[label] = _display_text(source.get(label), str(default))
            continue
        value = max(0.0, _safe_float(source.get(label), float(default)))
        if label in RATE_LABELS:
            value = min(1.0, value)
        normalized[label] = value

    # These values are divisors in formulas and must remain positive.
    normalized["Manufacturing_Yield_Rate"] = max(
        0.01, normalized["Manufacturing_Yield_Rate"]
    )
    normalized["Production_Volume_Good_Units"] = max(
        1.0, normalized["Production_Volume_Good_Units"]
    )
    normalized["Tooling_Amortization_Units"] = max(
        1.0, normalized["Tooling_Amortization_Units"]
    )
    return normalized


def build_assumption_rows(
    product: Dict[str, Any],
    components: List[Dict[str, Any]],
    production: Dict[str, Any],
) -> List[Tuple[str, Any]]:
    rows: List[Tuple[str, Any]] = [
        ("Product_Name", _display_text(product.get("name"), "New_Product")),
        ("Product_Category", _display_text(product.get("category"), "General")),
        (
            "Production_Process",
            _display_text(product.get("production_process"), "Not_Specified"),
        ),
        ("Scope_Note", _display_text(product.get("scope_note"))),
    ]
    rows.extend(production.items())
    for component in components:
        rows.extend(
            [
                (f"{component['id']}_Quantity_Per_Started_Unit", component["quantity"]),
                (f"{component['id']}_Unit_Cost_USD", component["unit_cost"]),
            ]
        )
    return rows


def build_cost_formula_rows(
    components: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    component_cost_labels: List[str] = []

    for component in components:
        cost_label = f"{component['id']}_Extended_Cost_USD"
        component_cost_labels.append(cost_label)
        rows.append(
            {
                "label": cost_label,
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[{component['id']}_Quantity_Per_Started_Unit]"
                    f"*{ASSUMPTIONS_TABLE}[{component['id']}_Unit_Cost_USD]"
                ),
            }
        )

    material_formula = "+".join(
        f"{COST_TABLE}[{label}]" for label in component_cost_labels
    )
    rows.extend(
        [
            {
                "label": "Raw_Component_Cost_Per_Started_Unit_USD",
                "formula": material_formula or "0",
            },
            {
                "label": "Inbound_Freight_Per_Started_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Raw_Component_Cost_Per_Started_Unit_USD]"
                    f"*{ASSUMPTIONS_TABLE}[Inbound_Freight_Rate]"
                ),
            },
            {
                "label": "Direct_Labor_Per_Started_Unit_USD",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Direct_Labor_Hours_Per_Started_Unit]"
                    f"*{ASSUMPTIONS_TABLE}[Direct_Labor_Rate_USD_Per_Hour]"
                ),
            },
            {
                "label": "Machine_Cost_Per_Started_Unit_USD",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Machine_Hours_Per_Started_Unit]"
                    f"*{ASSUMPTIONS_TABLE}[Machine_Rate_USD_Per_Hour]"
                ),
            },
            {
                "label": "Manufacturing_Overhead_Per_Started_Unit_USD",
                "formula": (
                    f"({COST_TABLE}[Direct_Labor_Per_Started_Unit_USD]"
                    f"+{COST_TABLE}[Machine_Cost_Per_Started_Unit_USD])"
                    f"*{ASSUMPTIONS_TABLE}[Manufacturing_Overhead_Rate]"
                ),
            },
            {
                "label": "Total_Cost_Per_Started_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Raw_Component_Cost_Per_Started_Unit_USD]"
                    f"+{COST_TABLE}[Inbound_Freight_Per_Started_Unit_USD]"
                    f"+{COST_TABLE}[Direct_Labor_Per_Started_Unit_USD]"
                    f"+{COST_TABLE}[Machine_Cost_Per_Started_Unit_USD]"
                    f"+{COST_TABLE}[Manufacturing_Overhead_Per_Started_Unit_USD]"
                ),
            },
            {
                "label": "Estimated_Started_Units",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Production_Volume_Good_Units]"
                    f"/{ASSUMPTIONS_TABLE}[Manufacturing_Yield_Rate]"
                ),
            },
            {
                "label": "Yield_Adjusted_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Total_Cost_Per_Started_Unit_USD]"
                    f"/{ASSUMPTIONS_TABLE}[Manufacturing_Yield_Rate]"
                ),
            },
            {
                "label": "Finishing_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Quality_Testing_Cost_USD_Per_Good_Unit]"
                    f"+{ASSUMPTIONS_TABLE}[Outbound_Packaging_Cost_USD_Per_Good_Unit]"
                ),
            },
            {
                "label": "Variable_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Yield_Adjusted_Cost_Per_Good_Unit_USD]"
                    f"+{COST_TABLE}[Finishing_Cost_Per_Good_Unit_USD]"
                ),
            },
            {
                "label": "Batch_Fixed_Cost_USD",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Batch_Setup_Cost_USD]"
                    f"+{ASSUMPTIONS_TABLE}[Other_Batch_Cost_USD]"
                ),
            },
            {
                "label": "Batch_Fixed_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Batch_Fixed_Cost_USD]"
                    f"/{ASSUMPTIONS_TABLE}[Production_Volume_Good_Units]"
                ),
            },
            {
                "label": "Production_Cost_Before_Contingency_Per_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Variable_Cost_Per_Good_Unit_USD]"
                    f"+{COST_TABLE}[Batch_Fixed_Cost_Per_Good_Unit_USD]"
                ),
            },
            {
                "label": "Contingency_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Production_Cost_Before_Contingency_Per_Unit_USD]"
                    f"*{ASSUMPTIONS_TABLE}[Contingency_Rate]"
                ),
            },
            {
                "label": "Production_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Production_Cost_Before_Contingency_Per_Unit_USD]"
                    f"+{COST_TABLE}[Contingency_Per_Good_Unit_USD]"
                ),
            },
            {
                "label": "Tooling_Amortization_Per_Good_Unit_USD",
                "formula": (
                    f"{ASSUMPTIONS_TABLE}[Tooling_Equipment_Cost_USD]"
                    f"/{ASSUMPTIONS_TABLE}[Tooling_Amortization_Units]"
                ),
            },
            {
                "label": "Fully_Loaded_Cost_Per_Good_Unit_USD",
                "formula": (
                    f"{COST_TABLE}[Production_Cost_Per_Good_Unit_USD]"
                    f"+{COST_TABLE}[Tooling_Amortization_Per_Good_Unit_USD]"
                ),
            },
            {
                "label": "Production_Run_Cost_Excluding_Tooling_USD",
                "formula": (
                    f"{COST_TABLE}[Production_Cost_Per_Good_Unit_USD]"
                    f"*{ASSUMPTIONS_TABLE}[Production_Volume_Good_Units]"
                ),
            },
            {
                "label": "Initial_Cash_Required_Including_Tooling_USD",
                "formula": (
                    f"{COST_TABLE}[Production_Run_Cost_Excluding_Tooling_USD]"
                    f"+{ASSUMPTIONS_TABLE}[Tooling_Equipment_Cost_USD]"
                ),
            },
        ]
    )
    return rows


def two_column_values_to_wire(
    table_name: str, rows: List[Tuple[str, Any]]
) -> Dict[str, str]:
    table = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    for row, (label, value) in enumerate(rows, start=1):
        table[_key(table_name, 0, row)] = str(label)
        table[_key(table_name, 1, row)] = str(value)
    return table


def formula_rows_to_wire(
    table_name: str, rows: List[Dict[str, str]]
) -> Tuple[Dict[str, str], Dict[str, str]]:
    tables = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}
    for row, item in enumerate(rows, start=1):
        tables[_key(table_name, 0, row)] = item["label"]
        formulas[_key(table_name, 1, row)] = re.sub(
            r"\s+", "", item["formula"]
        )
    return tables, formulas


def component_directory_to_wire(
    components: List[Dict[str, Any]],
) -> Dict[str, str]:
    columns = [
        ("component", "Component"),
        ("category", "Category"),
        ("unit", "Unit_Of_Measure"),
        ("basis", "Cost_Basis"),
        ("confidence", "Confidence"),
        ("notes", "Notes"),
        ("id", "Formula_Component_ID"),
    ]
    table: Dict[str, str] = {}
    for column, (_, heading) in enumerate(columns):
        table[_key(DIRECTORY_TABLE, column, 0)] = heading
    for row, component in enumerate(components, start=1):
        for column, (field, _) in enumerate(columns):
            table[_key(DIRECTORY_TABLE, column, row)] = str(component[field])
    return table


def validate_formula_graph(
    assumption_rows: List[Tuple[str, Any]],
    formula_rows: List[Dict[str, str]],
) -> None:
    assumption_labels = {label for label, _ in assumption_rows}
    cost_labels = {row["label"] for row in formula_rows}
    defined_cost_labels: Set[str] = set()

    for row in formula_rows:
        label = row["label"]
        formula = re.sub(r"\s+", "", row["formula"])
        if not SAFE_FORMULA_RE.fullmatch(formula):
            raise ValueError(f"Unsafe formula syntax for {label}: {formula}")

        for match in FORMULA_REF_RE.finditer(formula):
            table = match.group("table")
            reference = match.group("label")
            if table == ASSUMPTIONS_TABLE:
                if reference not in assumption_labels:
                    raise ValueError(
                        f"{label} references missing assumption {reference}."
                    )
            elif table == COST_TABLE:
                if reference not in cost_labels:
                    raise ValueError(
                        f"{label} references missing cost row {reference}."
                    )
                if reference not in defined_cost_labels:
                    raise ValueError(
                        f"{label} has a forward or circular reference to {reference}."
                    )
            else:
                raise ValueError(f"{label} references unsupported table {table}.")
        defined_cost_labels.add(label)


def validate_formula_wire(
    tables: Dict[str, str],
    formulas: Dict[str, str],
) -> Dict[str, Set[str]]:
    """
    Validate references against the final emitted tables, not intermediate data.

    A reference such as:

        Assumptions[Component_2_Acrylic_Panels_Unit_Cost_USD]

    is valid only if:
      1. a table named Assumptions exists in the wire payload; and
      2. Component_2_Acrylic_Panels_Unit_Cost_USD appears as a value in
         column 0 (the left/label column) of that table on a data row.
    """
    table_names: Set[str] = set()
    left_column_labels: Dict[str, Set[str]] = {}

    for wire_key, value in tables.items():
        match = WIRE_KEY_RE.fullmatch(wire_key)
        if not match:
            raise ValueError(f"Malformed table wire key: {wire_key}")

        table_name = match.group("table")
        column = int(match.group("column"))
        row = int(match.group("row"))
        if "_0" in table_name:
            raise ValueError(
                f"Table name {table_name} contains the reserved substring _0."
            )
        table_names.add(table_name)

        if column == 0 and row >= 1:
            label = str(value).strip()
            if not label:
                raise ValueError(
                    f"{table_name} contains an empty left-column label at row {row}."
                )
            if "_0" in label:
                raise ValueError(
                    f"{table_name} left-column label {label} contains the "
                    "reserved substring _0."
                )
            labels = left_column_labels.setdefault(table_name, set())
            if label in labels:
                raise ValueError(
                    f"{table_name} contains duplicate left-column label {label}."
                )
            labels.add(label)

    for formula_cell, formula in formulas.items():
        cell_match = WIRE_KEY_RE.fullmatch(formula_cell)
        if not cell_match:
            raise ValueError(f"Malformed formula wire key: {formula_cell}")

        destination_table = cell_match.group("table")
        destination_column = int(cell_match.group("column"))
        destination_row = int(cell_match.group("row"))
        if destination_table not in table_names:
            raise ValueError(
                f"Formula destination table {destination_table} does not exist."
            )
        if destination_column != 1 or destination_row < 1:
            raise ValueError(
                f"Formula must occupy a right-column data cell: {formula_cell}"
            )

        destination_label_key = _key(
            destination_table, 0, destination_row
        )
        if destination_label_key not in tables:
            raise ValueError(
                f"Formula cell {formula_cell} has no corresponding left-column label."
            )

        compact_formula = re.sub(r"\s+", "", formula)
        if not SAFE_FORMULA_RE.fullmatch(compact_formula):
            raise ValueError(
                f"Formula cell {formula_cell} contains unsupported syntax."
            )

        references = list(FORMULA_REF_RE.finditer(compact_formula))
        for reference_match in references:
            referenced_table = reference_match.group("table")
            referenced_label = reference_match.group("label")

            if "_0" in referenced_table or "_0" in referenced_label:
                raise ValueError(
                    f"{formula_cell} contains a formula reference with the "
                    "reserved substring _0."
                )
            if referenced_table not in table_names:
                raise ValueError(
                    f"{formula_cell} references missing table {referenced_table}."
                )
            if referenced_label not in left_column_labels.get(
                referenced_table, set()
            ):
                raise ValueError(
                    f"{formula_cell} references {referenced_table}"
                    f"[{referenced_label}], but {referenced_label} is not present "
                    f"in the left column of {referenced_table}."
                )

    return left_column_labels


def infer_units(
    assumption_rows: List[Tuple[str, Any]],
    formula_rows: List[Dict[str, str]],
) -> Dict[str, Dict[str, str]]:
    assumption_units: Dict[str, str] = {}
    for label, _ in assumption_rows:
        lower = label.lower()
        if label in RATE_LABELS:
            unit = "fraction"
        elif lower.endswith("_usd_per_hour"):
            unit = "USD/hour"
        elif lower.endswith("_hours_per_started_unit"):
            unit = "hours/started_unit"
        elif lower.endswith("_unit_cost_usd") or lower.endswith("_cost_usd"):
            unit = "USD"
        elif "units" in lower:
            unit = "units"
        else:
            unit = "unitless"
        assumption_units[label] = unit

    cost_units: Dict[str, str] = {}
    for row in formula_rows:
        label = row["label"]
        if label == "Estimated_Started_Units":
            cost_units[label] = "units"
        elif label.endswith("_USD"):
            cost_units[label] = "USD"
        else:
            cost_units[label] = "unitless"
    return {
        ASSUMPTIONS_TABLE: assumption_units,
        COST_TABLE: cost_units,
    }


def run_product_assumptions_builder(
    product_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
    product_hint: Optional[str] = None,
) -> Dict[str, Any]:
    if not product_prompt.strip():
        raise ValueError("A product description is required.")

    inferred = infer_product_inputs(
        product_prompt,
        model=model,
        temperature=temperature,
        product_hint=product_hint,
    )
    components = normalize_components(inferred.get("components"))
    production = normalize_production_assumptions(
        inferred.get("production_assumptions")
    )
    assumption_rows = build_assumption_rows(
        inferred.get("product", {}), components, production
    )
    formula_rows = build_cost_formula_rows(components)
    validate_formula_graph(assumption_rows, formula_rows)

    cost_tables, formulas = formula_rows_to_wire(COST_TABLE, formula_rows)
    tables: Dict[str, str] = {}
    tables.update(two_column_values_to_wire(ASSUMPTIONS_TABLE, assumption_rows))
    tables.update(component_directory_to_wire(components))
    tables.update(cost_tables)
    left_column_labels = validate_formula_wire(tables, formulas)

    zero_cost_components = [
        component["component"]
        for component in components
        if component["unit_cost"] == 0
    ]
    diagnostics = (
        "REVIEW_ZERO_COST_COMPONENTS"
        if zero_cost_components
        else "NO_ISSUES_DETECTED"
    )

    return {
        "tables": tables,
        "formulas": formulas,
        "annotations": {
            ASSUMPTIONS_TABLE: (
                "Editable discrete product, BOM, and production assumptions."
            ),
            DIRECTORY_TABLE: (
                "Human-readable component index. Quantity and cost inputs are "
                "stored in Assumptions using Formula_Component_ID."
            ),
            COST_TABLE: (
                "Formula-connected component extensions and production-cost "
                "summary. Production cost excludes tooling; fully loaded cost "
                "includes amortized tooling."
            ),
        },
        "units": infer_units(assumption_rows, formula_rows),
        "diagnostics": diagnostics,
        "metadata": {
            "component_count": len(components),
            "formula_count": len(formula_rows),
            "zero_cost_components": zero_cost_components,
            "excluded_costs": inferred.get("excluded_costs", []),
            "critical_unknowns": inferred.get("critical_unknowns", []),
            "formula_validation": "PASSED_AGAINST_EMITTED_LEFT_COLUMNS",
            "formula_reference_tables": {
                table_name: len(labels)
                for table_name, labels in left_column_labels.items()
            },
        },
    }


def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        product_prompt = works.param(1)
    except Exception:
        product_prompt = None

    if not product_prompt:
        works.resolve(
            {
                "status": "error",
                "error": "Ion param(1) is required: product description.",
            }
        )
        return 1

    model = works.param(2) or default_model
    try:
        temperature = float(works.param(3) or 0.15)
    except (TypeError, ValueError):
        temperature = 0.15
    temperature = min(1.0, max(0.0, temperature))
    product_hint = works.param(4) or None

    try:
        artifact = run_product_assumptions_builder(
            product_prompt=str(product_prompt),
            model=str(model),
            temperature=temperature,
            product_hint=str(product_hint) if product_hint is not None else None,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as error:
        works.resolve(
            {
                "status": "error",
                "error": str(error),
                "where": "formula-connected-product-assumptions-builder",
            }
        )
        return 1


if __name__ == "__main__":
    works.msg("Loading formula-connected product assumptions builder...")
    raise SystemExit(_main_ion())

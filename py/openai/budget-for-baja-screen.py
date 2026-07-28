#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
qPCR / RNA-screening budget calculator (Ion Works entry/exit)

Takes:
- user_prompt (param 1)
- LJL_InVitro_Screen_Assumptions grid/table (param 2), with structure:
    {
        "name": "LJL_InVitro_Screen_Assumptions",  # or any table name; detected dynamically
        "cols": 2,
        "rows": N,
        "wells": [
            { "x": 0, "y": 0, "value": "Label", "field": ["ColumnHeader"] },
            { "x": 1, "y": 0, "value": "Value", "field": ["ColumnHeader"] },
            { "x": 0, "y": 1, "value": "Some_Label", "field": ["RowHeader"] },
            { "x": 1, "y": 1, "value": 123.0 },
            ...
        ]
    }

Builds:
- An InVitro_Screen_Budget table with formulas that compute step-wise and total
  costs for the screening workflow, using Ion-style formulas referencing:
    - <AssumptionsTableName>[Label]
    - InVitro_Screen_Budget[Label]

Includes:
- Step-level cost breakdown for:
    - Compounds (design, price, reconstitution, dilution, primer/probe validation)
    - Cell culture (reviving, expansion, optimization)
    - Primary screen (free uptake, electroporation, data analysis)
    - IC50 screen (free uptake, electroporation, data analysis)
- Aggregated totals for each group.
- Primary_Screening_Total_Cost and Dose_Response_Screening_Total_Cost
- qPCR workflow and sequencing costs.
- Contingency buffer / total program cost.
- Budget comparison (remaining vs available), if a budget assumption is present.

If replicate assumptions are not present, assumes:
- Biological_Replicates_per_Condition = 2
- Technical_Replicates_per_Condition = 3

Outputs:
- tables: includes InVitro_Screen_Budget + header echo for the assumptions table.
- formulas: formulas for InVitro_Screen_Budget rows only.
- annotations: brief description of the budget content.
- units: basic unit hints for budget labels.
"""

import json
import re
from typing import Dict, List, Tuple, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- Constants ----
TABLE_NAME = "InVitro_Screen_Budget"
ASSUMPTIONS_TABLE_NAME = "LJL_InVitro_Screen_Assumptions"  # default; actual name taken from grid["name"] if present

# ---------- utils ----------

_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _coerce_number(v: Any) -> Any:
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return 0
        # If there's any non-numeric symbol (except . - e E), leave as string
        if re.search(r"[^0-9.\-eE]", s):
            return s
        try:
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v


def _assumptions_rows_from_grid(assumptions_grid: Dict[str, Any]) -> List[Tuple[str, Any]]:
    """
    Parse the Assumptions grid (x/y/wells structure) into:
        [(label, value), ...]

    We treat:
    - Label col: x == 0, y > 0
    - Value col: x == 1, y > 0
    """
    wells = assumptions_grid.get("wells", [])
    labels_by_y: Dict[int, str] = {}
    vals_by_y: Dict[int, Any] = {}

    for w in wells:
        x = w.get("x")
        y = w.get("y")
        v = w.get("value")

        if y is None or x is None:
            continue

        # Skip header row at y == 0
        if y == 0:
            continue

        if x == 0:
            # label
            if isinstance(v, str) and v.strip():
                labels_by_y[y] = v.strip()
        elif x == 1:
            # value
            vals_by_y[y] = _coerce_number(v)

    rows: List[Tuple[str, Any]] = []
    seen = set()
    for y in sorted(labels_by_y.keys()):
        lab = labels_by_y[y]
        if not lab:
            continue
        norm_label = re.sub(r"\s+", "_", lab.strip())
        if norm_label in seen:
            continue
        value = vals_by_y.get(y, "")
        rows.append((norm_label, value))
        seen.add(norm_label)
    return rows


def _infer_units_for_budget_label(label: str) -> str:
    L = label.lower()
    if any(x in L for x in ["cost", "budget", "total", "capital", "spend", "expense"]):
        return "USD"
    if L.endswith("_pct") or "rate" in L or "fraction" in L:
        return "fraction"
    return "unitless"


# ---------- Budget rows builder (deterministic, no GPT) ----------

def _build_budget_rows(
    assumption_rows: List[Tuple[str, Any]],
    assumptions_table_name: str,
) -> List[Dict[str, str]]:
    """
    Build a list of budget rows with {label, formula}, referencing:
        <assumptions_table_name>[...]
        InVitro_Screen_Budget[...]

    Only adds rows whose required assumptions labels actually exist.
    """
    assump_names = {lab for (lab, _v) in assumption_rows}
    rows: List[Dict[str, str]] = []

    def has(*names: str) -> bool:
        return all(n in assump_names for n in names)

    def add_row(label: str, formula: str, required: List[str] | None = None) -> None:
        if required and not has(*required):
            return
        rows.append({"label": label, "formula": formula})

    # --- Helper: step-level M&R + labor rows -------------------------------------------
    def add_step_cost_family(step_base: str) -> None:
        """
        step_base examples:
          'Compounds_Design', 'Compounds_Price', 'Reconstitution', 'Dilution',
          'Primer_Probe_Validation', 'Cell_and_Reviving', 'Expansion',
          'Optimization', 'Primary_Free_Uptake', 'Primary_Electroporation',
          'Primary_Data_Analysis_384', 'IC50_Free_Uptake',
          'IC50_Electroporation', 'IC50_Data_Analysis_384'.

        Expected assumptions (if present):
          step_base + '_M_and_R_Cost_USD'
          step_base + '_Labor_Cost_USD'

        Created budget rows:
          step_base + '_M_and_R_Cost'
          step_base + '_Labor_Cost'
          step_base + '_Total_Cost'
        """
        mr_assump = f"{step_base}_M_and_R_Cost_USD"
        labor_assump = f"{step_base}_Labor_Cost_USD"

        # No step if neither assumption exists
        if not (mr_assump in assump_names or labor_assump in assump_names):
            return

        if mr_assump in assump_names:
            add_row(
                f"{step_base}_M_and_R_Cost",
                f"{assumptions_table_name}[{mr_assump}]",
                [mr_assump],
            )

        if labor_assump in assump_names:
            add_row(
                f"{step_base}_Labor_Cost",
                f"{assumptions_table_name}[{labor_assump}]",
                [labor_assump],
            )

        # Only build a total if both exist
        if mr_assump in assump_names and labor_assump in assump_names:
            add_row(
                f"{step_base}_Total_Cost",
                f"{TABLE_NAME}[{step_base}_M_and_R_Cost]+"
                f"{TABLE_NAME}[{step_base}_Labor_Cost]",
            )

    # --- Step families from the spreadsheet -------------------------------------------
    compound_steps = [
        "Compounds_Design",
        "Compounds_Price",
        "Reconstitution",
        "Dilution",
        "Primer_Probe_Validation",
    ]
    cell_culture_steps = [
        "Cell_and_Reviving",
        "Expansion",
        "Optimization",
    ]
    primary_screen_steps = [
        "Primary_Free_Uptake",
        "Primary_Electroporation",
        "Primary_Data_Analysis_384",
    ]
    ic50_screen_steps = [
        "IC50_Free_Uptake",
        "IC50_Electroporation",
        "IC50_Data_Analysis_384",
    ]

    for step in (
        compound_steps
        + cell_culture_steps
        + primary_screen_steps
        + ic50_screen_steps
    ):
        add_step_cost_family(step)

    # Group totals (optional; only built if step totals exist)
    def group_total(label: str, step_bases: List[str]) -> None:
        step_total_labels = [
            f"{TABLE_NAME}[{b}_Total_Cost]"
            for b in step_bases
            if has(f"{b}_M_and_R_Cost_USD", f"{b}_Labor_Cost_USD")
        ]
        if not step_total_labels:
            return
        formula = "+".join(step_total_labels)
        rows.append({"label": label, "formula": formula})

    group_total("Compounds_Total_Cost", compound_steps)
    group_total("Cell_Culture_Total_Cost", cell_culture_steps)
    group_total("Primary_Screen_Total_Cost", primary_screen_steps)
    group_total("IC50_Screen_Total_Cost", ic50_screen_steps)

    # Optional: precomputed global M&R and labor totals if supplied
    if has("Total_M_and_R_Cost_All_Steps_USD"):
        add_row(
            "Total_M_and_R_Cost_All_Steps",
            f"{assumptions_table_name}[Total_M_and_R_Cost_All_Steps_USD]",
            ["Total_M_and_R_Cost_All_Steps_USD"],
        )
    if has("Total_Labor_Cost_All_Steps_USD"):
        add_row(
            "Total_Labor_Cost_All_Steps",
            f"{assumptions_table_name}[Total_Labor_Cost_All_Steps_USD]",
            ["Total_Labor_Cost_All_Steps_USD"],
        )
    if has("Total_M_and_R_Cost_All_Steps_USD", "Total_Labor_Cost_All_Steps_USD"):
        add_row(
            "Total_All_Steps_Cost",
            f"{TABLE_NAME}[Total_M_and_R_Cost_All_Steps]+"
            f"{TABLE_NAME}[Total_Labor_Cost_All_Steps]",
        )

    # --------------------------------------------------------------------------
    # Existing logic: screening, qPCR workflow, sequencing, contingency, budget
    # --------------------------------------------------------------------------

    # --- Screening replicate factor expression -----------------------------------------
    bio_label = "Biological_Replicates_per_Condition"
    tech_label = "Technical_Replicates_per_Condition"

    if bio_label in assump_names and tech_label in assump_names:
        replicate_factor_expr = (
            f"{assumptions_table_name}[Biological_Replicates_per_Condition]"
            f"*{assumptions_table_name}[Technical_Replicates_per_Condition]"
        )
    else:
        # Default: 2 biological replicates * 3 technical replicates
        replicate_factor_expr = "2*3"

    # --- Step-wise costs across the workflow ------------------------------------------

    # Assay design & planning (program-level).
    if "Assay_Design_and_Experimental_Planning_Cost_per_Program_USD" in assump_names:
        add_row(
            "Assay_Design_and_Planning_Cost",
            f"{assumptions_table_name}[Assay_Design_and_Experimental_Planning_Cost_per_Program_USD]",
            ["Assay_Design_and_Experimental_Planning_Cost_per_Program_USD"],
        )
    elif "Design_Cost_per_Program_USD" in assump_names:
        add_row(
            "Assay_Design_and_Planning_Cost",
            f"{assumptions_table_name}[Design_Cost_per_Program_USD]",
            ["Design_Cost_per_Program_USD"],
        )

    # Primary screening total cost = compounds * cost_per_compound * replicate_factor
    if has("Number_of_Screening_Compounds", "Primary_Screen_Cost_per_Compound_USD"):
        primary_formula = (
            f"{assumptions_table_name}[Number_of_Screening_Compounds]*"
            f"{assumptions_table_name}[Primary_Screen_Cost_per_Compound_USD]*"
            f"({replicate_factor_expr})"
        )
        add_row(
            "Primary_Screening_Total_Cost",
            primary_formula,
            ["Number_of_Screening_Compounds", "Primary_Screen_Cost_per_Compound_USD"],
        )

    # Dose-response total cost = compounds * cost_per_compound * replicate_factor
    if has("Number_of_Screening_Compounds", "Dose_Response_Cost_per_Compound_USD"):
        dose_formula = (
            f"{assumptions_table_name}[Number_of_Screening_Compounds]*"
            f"{assumptions_table_name}[Dose_Response_Cost_per_Compound_USD]*"
            f"({replicate_factor_expr})"
        )
        add_row(
            "Dose_Response_Screening_Total_Cost",
            dose_formula,
            ["Number_of_Screening_Compounds", "Dose_Response_Cost_per_Compound_USD"],
        )

    # qPCR / screening assay validation per target
    add_row(
        "qPCR_Assay_Validation_Total_Cost",
        f"{assumptions_table_name}[Number_of_Targets_Sequenced]*"
        f"{assumptions_table_name}[qPCR_Assay_Validation_Cost_per_Target_USD]",
        ["Number_of_Targets_Sequenced", "qPCR_Assay_Validation_Cost_per_Target_USD"],
    )

    # Research-grade synthesis (per 96-well plate, scaled by plates_per_screen)
    add_row(
        "Research_Grade_Synthesis_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD]",
        ["Plates_per_Screen", "Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD"],
    )

    # Cell seeding, treatment, RNA workflow (per plate)
    add_row(
        "Cell_Seeding_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[Cell_Seeding_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "Cell_Seeding_Cost_per_Plate_USD"],
    )

    add_row(
        "Treatment_and_Compound_Addition_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[Treatment_and_Compound_Addition_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "Treatment_and_Compound_Addition_Cost_per_Plate_USD"],
    )

    add_row(
        "RNA_Isolation_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[RNA_Isolation_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "RNA_Isolation_Cost_per_Plate_USD"],
    )

    add_row(
        "RNA_QC_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[RNA_QC_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "RNA_QC_Cost_per_Plate_USD"],
    )

    # cDNA synthesis
    add_row(
        "cDNA_Synthesis_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[cDNA_Synthesis_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "cDNA_Synthesis_Cost_per_Plate_USD"],
    )

    # qPCR reagents + instrument time
    add_row(
        "qPCR_Reagents_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[qPCR_Reagents_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "qPCR_Reagents_Cost_per_Plate_USD"],
    )

    add_row(
        "qPCR_Run_and_Instrument_Time_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[qPCR_Run_and_Instrument_Time_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "qPCR_Run_and_Instrument_Time_Cost_per_Plate_USD"],
    )

    # Data analysis & reporting
    add_row(
        "Primary_Data_Analysis_Total_Cost",
        f"{assumptions_table_name}[Plates_per_Screen]*"
        f"{assumptions_table_name}[Primary_Data_Analysis_Cost_per_Plate_USD]",
        ["Plates_per_Screen", "Primary_Data_Analysis_Cost_per_Plate_USD"],
    )

    add_row(
        "Screening_Decision_and_Reporting_Total_Cost",
        f"{assumptions_table_name}[Screening_Decision_and_Reporting_Cost_per_Program_USD]",
        ["Screening_Decision_and_Reporting_Cost_per_Program_USD"],
    )

    # Sequencing costs (simple multiplicative model)
    add_row(
        "Short_Read_Sequencing_Total_Cost",
        f"{assumptions_table_name}[Number_of_Cell_Lines_Sequenced]*"
        f"{assumptions_table_name}[Number_of_Targets_Sequenced]*"
        f"{assumptions_table_name}[Short_Read_Sequencing_Costs_per_Sample_USD]",
        [
            "Number_of_Cell_Lines_Sequenced",
            "Number_of_Targets_Sequenced",
            "Short_Read_Sequencing_Costs_per_Sample_USD",
        ],
    )

    add_row(
        "Long_Read_Sequencing_Total_Cost",
        f"{assumptions_table_name}[Number_of_Cell_Lines_Sequenced]*"
        f"{assumptions_table_name}[Number_of_Targets_Sequenced]*"
        f"{assumptions_table_name}[Long_Read_Sequencing_Costs_per_Sample_USD]",
        [
            "Number_of_Cell_Lines_Sequenced",
            "Number_of_Targets_Sequenced",
            "Long_Read_Sequencing_Costs_per_Sample_USD",
        ],
    )

    # --- Total direct workflow cost (sum of all step-level rows, including new ones) ---
    step_labels = [r["label"] for r in rows]
    if step_labels:
        total_direct_formula = "+".join(f"{TABLE_NAME}[{lab}]" for lab in step_labels)
    else:
        total_direct_formula = "0"

    rows.append({
        "label": "Total_Direct_Screening_and_qPCR_Workflow_Cost",
        "formula": total_direct_formula,
    })

    # --- Contingency and total program cost ---
    if "Contingency_Buffer_Pct" in assump_names:
        rows.append({
            "label": "Contingency_Buffer_Cost",
            "formula": f"{TABLE_NAME}[Total_Direct_Screening_and_qPCR_Workflow_Cost]"
                       f"*{assumptions_table_name}[Contingency_Buffer_Pct]",
        })
        rows.append({
            "label": "Total_Program_Cost_Including_Contingency",
            "formula": f"{TABLE_NAME}[Total_Direct_Screening_and_qPCR_Workflow_Cost]"
                       f"+{TABLE_NAME}[Contingency_Buffer_Cost]",
        })
    else:
        rows.append({
            "label": "Total_Program_Cost_Including_Contingency",
            "formula": f"{TABLE_NAME}[Total_Direct_Screening_and_qPCR_Workflow_Cost]",
        })

    # --- Optional budget comparison if a budget assumption exists ---
    budget_assumption_label = None
    for candidate in [
        "Screening_Budget_USD",
        "Program_Budget_USD",
        "Available_Budget",
        "Initial_Capital_Investment_USD",
        "Initial_Budget_USD",
    ]:
        if candidate in assump_names:
            budget_assumption_label = candidate
            break

    if budget_assumption_label is not None:
        rows.append({
            "label": "Available_Screening_Budget",
            "formula": f"{assumptions_table_name}[{budget_assumption_label}]",
        })
        rows.append({
            "label": "Budget_Remaining",
            "formula": f"{TABLE_NAME}[Available_Screening_Budget]"
                       f"-{TABLE_NAME}[Total_Program_Cost_Including_Contingency]",
        })

    return rows


def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Convert rows [{label, formula}, ...] to:
    - tables: { InVitro_Screen_Budget[0:0][r]: label }
    - formulas: { InVitro_Screen_Budget[1:1][r]: "=formula" }
    """
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}

    r_idx = 1
    for row in rows:
        lab = re.sub(r"\s+", "_", row["label"].strip())
        formula = row["formula"].strip()
        tables[_key(table_name, 0, r_idx)] = lab
        # Ensure formulas start with '=' for the grid engine
        if not formula.startswith("="):
            formula = "=" + formula
        formulas[_key(table_name, 1, r_idx)] = re.sub(r"\s+", "", formula)
        r_idx += 1

    return tables, formulas


# ---------- Orchestrator ----------

def run_budget_builder(
    user_prompt: str,
    assumptions_grid: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Main pure function.

    assumptions_grid is a single grid object with x/y/wells as shown
    in the user example (no outer 'tables' dict).
    """
    # Detect actual assumptions table name from the grid
    assumptions_table_name = assumptions_grid.get("name") or ASSUMPTIONS_TABLE_NAME

    # Extract assumption rows from the grid
    assumption_rows = _assumptions_rows_from_grid(assumptions_grid)
    if not assumption_rows:
        raise RuntimeError(f"No rows found in assumptions grid '{assumptions_table_name}'.")

    # Build budget rows deterministically
    budget_rows = _build_budget_rows(assumption_rows, assumptions_table_name=assumptions_table_name)

    # Convert to wire format
    budget_tables, budget_formulas = _rows_to_wire(TABLE_NAME, budget_rows)

    # Units for the budget table
    budget_units: Dict[str, Dict[str, str]] = {TABLE_NAME: {}}
    for k, v in budget_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == TABLE_NAME and i == 0 and j >= 1:
            budget_units[TABLE_NAME][v] = _infer_units_for_budget_label(v)

    # Build final artifact
    tables_out: Dict[str, Any] = {}

    # Echo assumptions headers (for reference; no assumption rows duplicated)
    tables_out[_key(assumptions_table_name, 0, 0)] = "Label"
    tables_out[_key(assumptions_table_name, 1, 0)] = "Value"

    # Add budget table
    tables_out.update(budget_tables)

    annotations = {
        assumptions_table_name: (
            "Header echo only; assumptions rows are supplied in the input grid."
        ),
        TABLE_NAME: (
            "qPCR / RNA-screening in vitro budget model: sums step-level M&R and labor "
            "costs (from compounds, cell culture, primary & IC50 screens), plus "
            "downstream qPCR and sequencing costs into a total program cost, with "
            "optional contingency and budget remaining if a budget assumption is present."
        ),
    }

    artifact = {
        "tables": tables_out,
        "formulas": budget_formulas,
        "annotations": annotations,
        "units": budget_units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "metadata": {
            "source": "qPCR_RNA_Screening_Budget_Calculator",
            "user_prompt_excerpt": (user_prompt or "")[:200],
        },
    }
    return artifact


# ---------- Ion entry/exit ----------

def _parse_assumptions_arg(assumptions_arg: Any) -> Dict[str, Any]:
    """
    param(2) from Ion may be:
    - already a dict (recommended; e.g. the grid object),
    - a JSON string of that dict.
    """
    if isinstance(assumptions_arg, dict):
        return assumptions_arg
    if isinstance(assumptions_arg, str):
        s = assumptions_arg.strip()
        if not s:
            raise RuntimeError("Assumptions input is empty.")
        return json.loads(s)
    raise RuntimeError("Assumptions param must be a dict or JSON string of the grid object.")


def _main_ion() -> int:
    try:
        user_prompt = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    try:
        assumptions_arg = works.param(2)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(2) required (Assumptions grid)."})
        return 1

    try:
        assumptions_grid = _parse_assumptions_arg(assumptions_arg)
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to parse assumptions grid: {e}"})
        return 1

    try:
        artifact = run_budget_builder(
            user_prompt=str(user_prompt),
            assumptions_grid=assumptions_grid,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "qPCR-RNA-screening-budget-builder",
        })
        return 1


if __name__ == "__main__":
    works.msg("🔧 loading qPCR / RNA-screening budget builder…")
    _main_ion()

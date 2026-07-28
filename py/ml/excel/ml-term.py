#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
score_housekeeping_table_and_place.py

Ion Works script that:
1) reads a JSON plate/table structure
2) scores candidate well values using housekeeping_model.joblib
3) forces 384-well plate coordinates (e.g. D14, A01, P24) to score low
4) boosts values found in row/column headers
5) boosts values closer to table edges
6) finds the top-scoring wells
7) creates a placement plan that puts higher-scoring values onto:
   - the top row, or
   - the left-most column

Expected model
--------------
housekeeping_model.joblib in the same directory as this script

Inputs
------
Param(1): table JSON (same structure as sp.toValueFormulaJSON())
Param(2): optional config, either:
    - "top_row"
    - "left_column"
    - or dict like:
      {
        "orientation": "top_row",
        "top_k": 12,
        "min_score": 0.45,
        "dedupe_text": true,
        "include_headers_as_candidates": true,
        "row_header_bonus": 0.35,
        "column_header_bonus": 0.35,
        "corner_header_bonus": 0.10,
        "use_edge_bonus": true,
        "max_edge_bonus": 0.20,
        "edge_power": 1.2
      }

Behavior
--------
- Scores true strings only
- Can include headers as candidates
- Hard-suppresses 384-well coordinates such as D14 / A01 / P24
- Adds positional priors:
    * row header bonus
    * column header bonus
    * corner header bonus
    * edge proximity bonus
- Sorts descending by final score
- Creates placement targets using row 0 or col 0 header wells

Notes
-----
The saved model may contain a FunctionTransformer that references plate_feature.
That function is defined below so joblib can unpickle the model successfully.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

import joblib
import numpy as np
from ion import works  # type: ignore


# ------------------------------------------------------------------
# Model-compatibility helpers for unpickling
# ------------------------------------------------------------------

PLATE_REGEX = re.compile(r"^[A-Z]{1,2}\d{1,3}$")
PLATE_384_REGEX = re.compile(r"^(?:[A-P])(0?[1-9]|1[0-9]|2[0-4])$", re.IGNORECASE)


def plate_feature(X):
    """
    Must exist at top level so joblib can unpickle saved FunctionTransformer.
    """
    out = []
    for x in X:
        x = str(x).strip().upper()
        if PLATE_REGEX.match(x):
            out.append([1])
        else:
            out.append([0])
    return np.array(out)


# ------------------------------------------------------------------
# General helpers
# ------------------------------------------------------------------

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _norm_text(s: Any) -> str:
    s = _safe_str(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm_key(s: Any) -> str:
    return _norm_text(s).lower()


def _is_numeric_string(s: str) -> bool:
    t = _norm_text(s)
    if not t:
        return False
    return bool(re.fullmatch(r"[+-]?(?:\d+\.?\d*|\.\d+)", t))


def _is_384_plate_coordinate(s: str) -> bool:
    """
    Matches canonical 384-well coordinates:
      A1..A24, B1..B24, ..., P1..P24
    Also allows zero-padded forms like A01.
    """
    t = _norm_text(s).upper().replace(" ", "")
    return bool(PLATE_384_REGEX.fullmatch(t))


def _cell_text_and_type(cell: Any) -> Tuple[str, str]:
    """
    Returns (display_text, source_type)
    source_type in: string, number, other, empty
    """
    if cell is None:
        return "", "empty"

    if isinstance(cell, dict):
        if "value" in cell:
            v = cell.get("value")
            if v is None:
                return "", "empty"
            if isinstance(v, str):
                return v.strip(), "string"
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return _safe_str(v).strip(), "number"
            return _safe_str(v).strip(), "other"

        for k in ("name", "label", "title", "text", "display", "position"):
            if k in cell:
                v = cell.get(k)
                if v is None:
                    continue
                if isinstance(v, str):
                    return v.strip(), "string"
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    return _safe_str(v).strip(), "number"
                return _safe_str(v).strip(), "other"

        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("value", "name", "label", "title", "text", "display"):
                if k in props:
                    v = props.get(k)
                    if v is None:
                        continue
                    if isinstance(v, str):
                        return v.strip(), "string"
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        return _safe_str(v).strip(), "number"
                    return _safe_str(v).strip(), "other"

        return "", "empty"

    if isinstance(cell, str):
        return cell.strip(), "string"
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        return _safe_str(cell).strip(), "number"
    return _safe_str(cell).strip(), "other"


def _cell_uid(cell: Any) -> Optional[str]:
    if isinstance(cell, dict):
        for k in ("uid", "well_uid", "id", "_id"):
            v = cell.get(k)
            if v not in (None, ""):
                return _safe_str(v)

        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("uid", "well_uid", "id", "_id"):
                v = props.get(k)
                if v not in (None, ""):
                    return _safe_str(v)
    return None


def _is_true_string(text: str, source_type: str) -> bool:
    t = _norm_text(text)
    if source_type != "string":
        return False
    if not t:
        return False
    if _is_numeric_string(t):
        return False
    return True


def _load_model():
    model_path = Path(__file__).resolve().parent / "housekeeping_model.joblib"
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    return joblib.load(model_path)


def _extract_table(table: Dict[str, Any]) -> Tuple[str, int, int, Dict[Tuple[int, int], Dict[str, Any]]]:
    """
    Returns:
      table_name, cols, rows, by_xy[(x,y)] -> {text, source_type, uid, raw, x, y}
    """
    name = _safe_str(table.get("name") or "Untitled Plate")
    wells = table.get("wells")

    by_xy: Dict[Tuple[int, int], Dict[str, Any]] = {}
    max_x = 0
    max_y = 0

    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]:
        for raw in wells:
            try:
                x = int(raw.get("x", 0))
                y = int(raw.get("y", 0))
            except Exception:
                continue

            text, source_type = _cell_text_and_type(raw)
            uid = _cell_uid(raw)
            by_xy[(x, y)] = {
                "text": text,
                "source_type": source_type,
                "uid": uid,
                "raw": raw,
                "x": x,
                "y": y,
            }
            max_x = max(max_x, x)
            max_y = max(max_y, y)

        cols = int(table.get("cols") or (max_x + 1))
        rows = int(table.get("rows") or (max_y + 1))
        return name, cols, rows, by_xy

    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        cols = len(wells)
        rows = max((len(col) for col in wells if isinstance(col, list)), default=0)
        for x in range(cols):
            for y in range(rows):
                raw = wells[x][y] if x < len(wells) and y < len(wells[x]) else None
                text, source_type = _cell_text_and_type(raw)
                uid = _cell_uid(raw)
                by_xy[(x, y)] = {
                    "text": text,
                    "source_type": source_type,
                    "uid": uid,
                    "raw": raw,
                    "x": x,
                    "y": y,
                }
        return name, cols, rows, by_xy

    return name, 0, 0, {}


def _score_texts(model, texts: List[str]) -> List[Tuple[int, float]]:
    preds = model.predict(texts)
    probs = model.predict_proba(texts)[:, 1]
    return [(int(p), float(pr)) for p, pr in zip(preds, probs)]


def _parse_config(cfg: Any) -> Dict[str, Any]:
    out = {
        "orientation": "top_row",
        "top_k": 12,
        "min_score": 0.5,
        "dedupe_text": True,
        "positive_only": False,

        "include_headers_as_candidates": True,
        "row_header_bonus": 0.35,
        "column_header_bonus": 0.35,
        "corner_header_bonus": 0.10,

        "use_edge_bonus": True,
        "max_edge_bonus": 0.25,
        "edge_power": 1.0,

        "cap_score_at_1": True,
    }

    if isinstance(cfg, str):
        c = cfg.strip().lower()
        if c in {"top_row", "left_column"}:
            out["orientation"] = c
        return out

    if isinstance(cfg, dict):
        if _safe_str(cfg.get("orientation")).strip().lower() in {"top_row", "left_column"}:
            out["orientation"] = _safe_str(cfg.get("orientation")).strip().lower()
        if cfg.get("top_k") is not None:
            try:
                out["top_k"] = max(1, int(cfg.get("top_k")))
            except Exception:
                pass
        if cfg.get("min_score") is not None:
            try:
                out["min_score"] = float(cfg.get("min_score"))
            except Exception:
                pass
        if cfg.get("dedupe_text") is not None:
            out["dedupe_text"] = bool(cfg.get("dedupe_text"))
        if cfg.get("positive_only") is not None:
            out["positive_only"] = bool(cfg.get("positive_only"))

        if cfg.get("include_headers_as_candidates") is not None:
            out["include_headers_as_candidates"] = bool(cfg.get("include_headers_as_candidates"))
        if cfg.get("row_header_bonus") is not None:
            try:
                out["row_header_bonus"] = float(cfg.get("row_header_bonus"))
            except Exception:
                pass
        if cfg.get("column_header_bonus") is not None:
            try:
                out["column_header_bonus"] = float(cfg.get("column_header_bonus"))
            except Exception:
                pass
        if cfg.get("corner_header_bonus") is not None:
            try:
                out["corner_header_bonus"] = float(cfg.get("corner_header_bonus"))
            except Exception:
                pass

        if cfg.get("use_edge_bonus") is not None:
            out["use_edge_bonus"] = bool(cfg.get("use_edge_bonus"))
        if cfg.get("max_edge_bonus") is not None:
            try:
                out["max_edge_bonus"] = float(cfg.get("max_edge_bonus"))
            except Exception:
                pass
        if cfg.get("edge_power") is not None:
            try:
                out["edge_power"] = float(cfg.get("edge_power"))
            except Exception:
                pass

        if cfg.get("cap_score_at_1") is not None:
            out["cap_score_at_1"] = bool(cfg.get("cap_score_at_1"))

    return out


def _header_position_bonus(
    x: int,
    y: int,
    row_header_bonus: float,
    column_header_bonus: float,
    corner_header_bonus: float,
) -> float:
    bonus = 0.0

    if x == 0:
        bonus += row_header_bonus

    if y == 0:
        bonus += column_header_bonus

    if x == 0 and y == 0:
        bonus += corner_header_bonus

    return bonus


def _edge_proximity_bonus(
    x: int,
    y: int,
    cols: int,
    rows: int,
    max_edge_bonus: float,
    edge_power: float = 1.0,
) -> float:
    """
    Higher bonus for cells closer to any table edge.
    """
    if cols <= 0 or rows <= 0:
        return 0.0

    dist_left = x
    dist_top = y
    dist_right = max(0, cols - 1 - x)
    dist_bottom = max(0, rows - 1 - y)

    d = min(dist_left, dist_top, dist_right, dist_bottom)

    max_possible = max(1.0, min((cols - 1) / 2.0, (rows - 1) / 2.0))

    proximity = 1.0 - min(d / max_possible, 1.0)
    if edge_power != 1.0:
        proximity = proximity ** edge_power

    return float(max_edge_bonus * proximity)


def analyze(table: Dict[str, Any], cfg: Any) -> Dict[str, Any]:
    config = _parse_config(cfg)
    orientation = config["orientation"]
    top_k = config["top_k"]
    min_score = config["min_score"]
    dedupe_text = config["dedupe_text"]
    positive_only = config["positive_only"]

    include_headers_as_candidates = config["include_headers_as_candidates"]
    row_header_bonus = config["row_header_bonus"]
    column_header_bonus = config["column_header_bonus"]
    corner_header_bonus = config["corner_header_bonus"]

    use_edge_bonus = config["use_edge_bonus"]
    max_edge_bonus = config["max_edge_bonus"]
    edge_power = config["edge_power"]

    cap_score_at_1 = config["cap_score_at_1"]

    table_name, cols, rows, by_xy = _extract_table(table)

    if not by_xy or cols <= 0 or rows <= 0:
        return {
            "status": "ok",
            "table_name": table_name,
            "orientation": orientation,
            "selection": {"selected_well_uids": []},
            "top_scored_wells": [],
            "placements": [],
            "notes": ["No table data found."]
        }

    model = _load_model()

    candidates: List[Dict[str, Any]] = []
    texts: List[str] = []

    x_start = 0 if include_headers_as_candidates else 1
    y_start = 0 if include_headers_as_candidates else 1

    for y in range(y_start, rows):
        for x in range(x_start, cols):
            cell = by_xy.get((x, y))
            if not cell:
                continue

            text = _norm_text(cell.get("text", ""))
            source_type = cell.get("source_type", "empty")
            uid = cell.get("uid")

            if not uid:
                continue
            if not _is_true_string(text, source_type):
                continue

            candidates.append({
                "uid": uid,
                "text": text,
                "x": x,
                "y": y,
                "source_type": source_type,
            })
            texts.append(text)

    if not candidates:
        return {
            "status": "ok",
            "table_name": table_name,
            "orientation": orientation,
            "selection": {"selected_well_uids": []},
            "top_scored_wells": [],
            "placements": [],
            "notes": ["No scorable true-string well values found."]
        }

    scored = _score_texts(model, texts)

    for item, (pred, prob) in zip(candidates, scored):
        if _is_384_plate_coordinate(item["text"]):
            item["prediction"] = 0
            item["raw_model_score"] = float(prob)
            item["header_bonus"] = 0.0
            item["edge_bonus"] = 0.0
            item["position_bonus"] = 0.0
            item["score"] = 0.0
            item["label"] = "not_housekeeping_gene_concept"
            item["suppressed_reason"] = "384_plate_coordinate"
        else:
            header_bonus = _header_position_bonus(
                x=item["x"],
                y=item["y"],
                row_header_bonus=row_header_bonus,
                column_header_bonus=column_header_bonus,
                corner_header_bonus=corner_header_bonus,
            )

            edge_bonus = (
                _edge_proximity_bonus(
                    x=item["x"],
                    y=item["y"],
                    cols=cols,
                    rows=rows,
                    max_edge_bonus=max_edge_bonus,
                    edge_power=edge_power,
                )
                if use_edge_bonus else 0.0
            )

            pos_bonus = header_bonus + edge_bonus

            final_score = float(prob) + pos_bonus
            if cap_score_at_1:
                final_score = min(final_score, 1.0)

            item["prediction"] = pred
            item["raw_model_score"] = float(prob)
            item["header_bonus"] = float(header_bonus)
            item["edge_bonus"] = float(edge_bonus)
            item["position_bonus"] = float(pos_bonus)
            item["score"] = float(final_score)
            item["label"] = "housekeeping_gene_concept" if pred == 1 else "not_housekeeping_gene_concept"

    filtered = []
    for item in candidates:
        if item["score"] < min_score:
            continue
        if positive_only and item["prediction"] != 1:
            continue
        filtered.append(item)

    if dedupe_text:
        deduped: List[Dict[str, Any]] = []
        seen_texts: Set[str] = set()
        for item in sorted(filtered, key=lambda r: (-r["score"], r["y"], r["x"], r["text"].lower())):
            k = _norm_key(item["text"])
            if k in seen_texts:
                continue
            seen_texts.add(k)
            deduped.append(item)
        filtered = deduped
    else:
        filtered = sorted(filtered, key=lambda r: (-r["score"], r["y"], r["x"], r["text"].lower()))

    top_scored_wells = filtered[:top_k]

    placements: List[Dict[str, Any]] = []

    if orientation == "top_row":
        target_positions = [(x, 0) for x in range(1, cols)]
    else:
        target_positions = [(0, y) for y in range(1, rows)]

    for item, (tx, ty) in zip(top_scored_wells, target_positions):
        target_cell = by_xy.get((tx, ty), {})
        target_uid = target_cell.get("uid")
        target_text = _norm_text(target_cell.get("text", ""))

        placements.append({
            "rank": len(placements) + 1,
            "source_uid": item["uid"],
            "source_text": item["text"],
            "source_x": item["x"],
            "source_y": item["y"],
            "raw_model_score": item.get("raw_model_score"),
            "header_bonus": item.get("header_bonus", 0.0),
            "edge_bonus": item.get("edge_bonus", 0.0),
            "position_bonus": item.get("position_bonus", 0.0),
            "score": item["score"],
            "prediction": item["prediction"],
            "target_x": tx,
            "target_y": ty,
            "target_uid": target_uid,
            "target_existing_text": target_text,
        })

    selected_well_uids = [p["source_uid"] for p in placements if p.get("source_uid")]

    return {
        "status": "ok",
        "table_name": table_name,
        "orientation": orientation,
        "selection": {
            "selected_well_uids": selected_well_uids
        },
        "top_scored_wells": top_scored_wells,
        "placements": placements,
        "debug": {
            "candidate_count": len(candidates),
            "filtered_count": len(filtered),
            "returned_count": len(top_scored_wells),
            "top_k": top_k,
            "min_score": min_score,
            "dedupe_text": dedupe_text,
            "positive_only": positive_only,
            "cols": cols,
            "rows": rows,
            "include_headers_as_candidates": include_headers_as_candidates,
            "row_header_bonus": row_header_bonus,
            "column_header_bonus": column_header_bonus,
            "corner_header_bonus": corner_header_bonus,
            "use_edge_bonus": use_edge_bonus,
            "max_edge_bonus": max_edge_bonus,
            "edge_power": edge_power,
            "suppressed_plate_coordinates": sum(1 for c in candidates if _is_384_plate_coordinate(c["text"])),
        },
        "notes": [
            "Cells can be scored from headers as well when include_headers_as_candidates is true.",
            "Only true strings are scored; numeric-looking strings are excluded.",
            "384-well plate coordinates (A-P, 1-24) are hard-suppressed to score low.",
            "Header locations receive a positive positional bonus because row/column headers are more likely to contain control values.",
            "Cells closer to any table edge can receive an edge proximity bonus.",
            "Higher final scores are placed first onto the requested header axis.",
            "selection.selected_well_uids contains the source wells for the returned placements."
        ]
    }


def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table"})
        return 1

    try:
        cfg = works.param(2)
    except Exception:
        cfg = {"orientation": "top_row"}

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a dict or JSON object string"})
        return 1

    try:
        result = analyze(table, cfg)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

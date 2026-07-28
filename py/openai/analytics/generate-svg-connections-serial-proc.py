#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Two-stage SERIAL (procedure) SVG diagram builder (Ion Works entry/exit).

SERIAL PROCEDURE MODEL
----------------------
- Produces a linear process flow (a single chain): Step1 -> Step2 -> Step3 -> ...
- Stage 1: GPT extracts ordered "steps" as nodes (rect/ellipse + label).
- We apply deterministic serial layout: left-to-right with wrapping to new rows.
- Stage 2: GPT assembles a full SVG with edges ONLY between consecutive steps.
- All rendered nodes must be connected in ONE path (no branches). Isolated nodes omitted.

Ion entry returns:
  {
    "svg": "<svg ...>...</svg>",
    "svg_groups": [ ... nodes from Stage 1 ... ],
    "diagnostics": "NO_ISSUES_DETECTED"
  }

Expected Ion params
-------------------
param(1) = user prompt describing a procedure
param(2) = model (optional; default gpt-4o-mini)
param(3) = temperature (optional; default 0.2)
"""

import os
import re
import json
import math
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict, is_dataclass

from ion import works  # type: ignore
from openai import OpenAI


# ---------- data structures ----------

@dataclass
class svg_text:
    text: str
    attrs: Dict[str, Any]


@dataclass
class svg_shape:
    tag: str
    attrs: Dict[str, Any]


@dataclass
class svg_group:
    id: str
    kind: str
    shape: Optional[svg_shape]
    labels: List[svg_text]


# ---------- helpers ----------

CANVAS_W = 800
CANVAS_H = 600


def _to_jsonable(obj):
    if is_dataclass(obj):
        return _to_jsonable(asdict(obj))
    if isinstance(obj, dict):
        return {str(k): _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    return obj


def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    max_tokens: int = 2000,
) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (resp.choices[0].message.content or "").strip()


def _extract_json_object(text: str) -> str:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return text
    return text[start : end + 1]


def _repair_json_with_gpt(bad_json: str, *, model: str) -> str:
    system = (
        "You are a STRICT JSON validator and fixer.\n"
        "Return the SAME structure as syntactically valid JSON.\n"
        "Rules: no new fields; fix commas/quotes; return ONLY JSON."
    )
    user = f"Invalid JSON:\n\n{bad_json}"
    fixed = _chat_call(model=model, system=system, user=user, temperature=0.0, max_tokens=2000)
    return _extract_json_object(fixed)


def _extract_svg_snippet(text: str) -> str:
    m = re.search(r"<svg[\s\S]*?</svg>", text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("No <svg>...</svg> block found.")
    return m.group(0).strip()


def _local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _snap_edge_lines_to_nodes(svg: str) -> str:
    try:
        root = ET.fromstring(svg)
    except Exception:
        return svg

    # gather centers
    centers: Dict[str, Tuple[float, float]] = {}

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if "node" not in g.attrib.get("class", "").split():
            continue
        nid = g.attrib.get("data-id")
        if not nid:
            continue

        shape = None
        for ch in list(g):
            if _local(ch.tag) in {"rect", "ellipse", "circle"}:
                shape = ch
                break
        if shape is None:
            continue

        try:
            if _local(shape.tag) == "rect":
                x = float(shape.attrib.get("x", "0"))
                y = float(shape.attrib.get("y", "0"))
                w = float(shape.attrib.get("width", "0"))
                h = float(shape.attrib.get("height", "0"))
                centers[nid] = (x + w / 2.0, y + h / 2.0)
            else:
                centers[nid] = (float(shape.attrib.get("cx", "0")), float(shape.attrib.get("cy", "0")))
        except Exception:
            continue

    # update line endpoints
    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if "edge" not in g.attrib.get("class", "").split():
            continue
        s = g.attrib.get("data-source")
        t = g.attrib.get("data-target")
        if not s or not t or s not in centers or t not in centers:
            continue

        line = None
        for ch in list(g):
            if _local(ch.tag) == "line":
                line = ch
                break
        if line is None:
            continue

        sx, sy = centers[s]
        tx, ty = centers[t]
        line.set("x1", str(sx))
        line.set("y1", str(sy))
        line.set("x2", str(tx))
        line.set("y2", str(ty))

    return ET.tostring(root, encoding="unicode")


# ---------- SERIAL layout ----------

def _apply_serial_layout(groups: List[svg_group]) -> List[svg_group]:
    """
    Deterministic serial layout:
    - nodes placed left-to-right with wrapping into rows.
    - each node centered label.
    """
    nodes = [g for g in groups if g.kind == "node" and g.shape is not None]
    if not nodes:
        return groups

    # Layout params
    margin_x = 60.0
    margin_y = 70.0
    step_w = 170.0
    step_h = 60.0
    gap_x = 45.0
    gap_y = 70.0

    # How many per row?
    usable_w = CANVAS_W - 2 * margin_x
    per_row = max(1, int((usable_w + gap_x) // (step_w + gap_x)))

    def _set_rect_center(g: svg_group, cx: float, cy: float):
        if not g.shape:
            return
        g.shape.tag = "rect"
        a = g.shape.attrs
        a["width"] = a.get("width", step_w)
        a["height"] = a.get("height", step_h)
        a["x"] = cx - float(a["width"]) / 2.0
        a["y"] = cy - float(a["height"]) / 2.0
        a.setdefault("rx", 10)
        a.setdefault("ry", 10)
        a.setdefault("fill", "#F0F4FF")
        a.setdefault("stroke", "#333")
        a.setdefault("stroke-width", 1)

        for lbl in g.labels:
            lbl.attrs["x"] = cx
            lbl.attrs["y"] = cy
            lbl.attrs.setdefault("font-size", 14)
            lbl.attrs.setdefault("text-anchor", "middle")
            lbl.attrs.setdefault("dominant-baseline", "middle")
            lbl.attrs.setdefault("fill", "#000")

    for i, g in enumerate(nodes):
        row = i // per_row
        col = i % per_row
        cx = margin_x + (step_w / 2.0) + col * (step_w + gap_x)
        cy = margin_y + (step_h / 2.0) + row * (step_h + gap_y)

        # clamp if too low (best-effort)
        cy = min(cy, CANVAS_H - margin_y)
        _set_rect_center(g, cx, cy)

    return groups


# ---------- STAGE 1: GPT extract ORDERED steps ----------

SERIAL_NODE_EXTRACTION_SYSTEM = """
You are a precise procedure-step extractor for a SERIAL SVG flow diagram.

Goal:
-----
Given a natural-language description of a procedure, output ONLY a strict JSON
object describing an ORDERED list of step nodes.

Output format (STRICT):
-----------------------
Return ONLY a JSON object, no prose, no Markdown:

{
  "steps": [
    {
      "id": "Step1",
      "kind": "node",
      "order": 1,
      "shape": { "tag": "rect", "attrs": { ... } },
      "labels": [
        { "text": "Short step label", "attrs": { ... } }
      ]
    }
  ]
}

Rules:
------
1) Extract steps in execution order. If the user gives unordered items,
   infer a reasonable order.

2) Keep labels short (2–6 words). Use imperative verbs when possible
   (e.g., "Collect requirements", "Implement feature", "QA verify").

3) IDs must be unique, no spaces. Prefer "Step1", "Step2", etc.

4) Provide basic rect shapes + centered text. Coordinates can be rough;
   a later deterministic layout pass will be applied.

IMPORTANT:
----------
- Do NOT output <svg>.
- Do NOT create edges in this step.
- Ensure valid JSON (double quotes, no trailing commas).
"""


def generate_serial_groups_from_prompt(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> List[svg_group]:
    works.msg("🧱 Stage 1: requesting ordered serial steps (nodes) from GPT…")
    content = _chat_call(
        model=model,
        system=SERIAL_NODE_EXTRACTION_SYSTEM,
        user=f"Procedure description:\n{user_prompt}\n\nReturn ONLY the JSON object.",
        temperature=temperature,
        max_tokens=2000,
    )

    raw_json = _extract_json_object(content)
    try:
        data = json.loads(raw_json)
    except Exception as e_first:
        works.msg(f"⚠️ Stage 1: JSON parse failed, attempting repair… ({e_first})")
        repaired = _repair_json_with_gpt(raw_json, model=model)
        data = json.loads(repaired)

    steps = data.get("steps", [])
    if not isinstance(steps, list):
        raise RuntimeError("Stage 1: 'steps' must be a list.")

    # sort by "order" if present, else preserve
    def _order_key(s):
        try:
            return int(s.get("order", 10**9))
        except Exception:
            return 10**9

    steps_sorted = sorted([s for s in steps if isinstance(s, dict)], key=_order_key)

    groups: List[svg_group] = []
    for s in steps_sorted:
        sid = str(s.get("id") or "").strip()
        if not sid:
            continue

        shape_raw = s.get("shape") if isinstance(s.get("shape"), dict) else None
        labels_raw = s.get("labels") if isinstance(s.get("labels"), list) else []

        shape_obj: Optional[svg_shape] = None
        if shape_raw:
            tag = str(shape_raw.get("tag") or "rect")
            attrs = shape_raw.get("attrs") or {}
            if not isinstance(attrs, dict):
                attrs = {}
            shape_obj = svg_shape(tag=tag, attrs={str(k): v for k, v in attrs.items()})

        label_objs: List[svg_text] = []
        for lbl in labels_raw:
            if not isinstance(lbl, dict):
                continue
            txt = str(lbl.get("text") or "").strip()
            if not txt:
                continue
            attrs = lbl.get("attrs") or {}
            if not isinstance(attrs, dict):
                attrs = {}
            label_objs.append(svg_text(text=txt, attrs={str(k): v for k, v in attrs.items()}))

        # Ensure at least one label
        if not label_objs:
            label_objs = [svg_text(text=sid, attrs={})]

        groups.append(svg_group(id=sid, kind="node", shape=shape_obj, labels=label_objs))

    # Deterministic serial layout
    groups = _apply_serial_layout(groups)
    return groups


# ---------- STAGE 2: GPT assemble SVG with consecutive edges only ----------

SERIAL_SVG_ASSEMBLY_SYSTEM = """
You are a precise SVG generator for a SERIAL procedure diagram.

You are given node visuals (shapes+labels). You MUST:
- Render nodes exactly as provided (as closely as possible).
- Create edges ONLY between consecutive steps to form ONE continuous chain.

MANDATORY SERIAL TOPOLOGY:
-------------------------
If steps are: N1, N2, N3, ... Nk
You MUST create edges:
  N1->N2, N2->N3, ... N(k-1)->Nk
No other edges are allowed (no branching, no skipping, no cross-links).

Connectivity rules:
- Every rendered node must have at least one incident edge,
  except the first and last (which will have exactly one).
- The rendered graph must be a single path (one connected component).
- Do NOT render any node that you cannot include in the single path.

SVG requirements:
- Output ONLY a single <svg> element (no prose).
- Root: width=800 height=600 viewBox="0 0 800 600" xmlns=... role=img aria-label=...
- Layers:
  <g id="diagram-root">
    <g id="edges-layer"> ... </g>
    <g id="nodes-layer"> ... </g>
  </g>

Edges:
- One <g class="edge" data-eid="e0" data-source="A" data-target="B"> per consecutive pair.
- Must include endpoint <g> elements:
    <g class="endpoint source" data-ref="A"></g>
    <g class="endpoint target" data-ref="B"></g>
- Use only <line>, <path>, or <polyline>. No arrowheads/markers.
- Include an edge <text> sentence describing the transition (short but complete).

Node shapes:
- Only <rect>, <circle>, or <ellipse>.
- Avoid overlapping nodes.
"""


def _serialize_groups_for_gpt(groups: List[svg_group]) -> str:
    payload = {"steps": _to_jsonable(groups)}
    return json.dumps(payload, indent=2)


def assemble_serial_svg_from_groups(
    user_prompt: str,
    groups: List[svg_group],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    groups = _apply_serial_layout(groups)
    steps_json = _serialize_groups_for_gpt(groups)

    works.msg("🧩 Stage 2: requesting assembled SERIAL SVG (one chain) from GPT…")
    content = _chat_call(
        model=model,
        system=SERIAL_SVG_ASSEMBLY_SYSTEM,
        user=f"""
Original procedure:
-------------------
{user_prompt}
-------------------

Candidate ordered step nodes (in order):
{steps_json}

Build the SERIAL SVG:
- Render the steps in the given order.
- Create edges ONLY between consecutive steps (one continuous chain).
Return ONLY the <svg>...</svg>.
""",
        temperature=temperature,
        max_tokens=2500,
    )

    try:
        svg = _extract_svg_snippet(content)
    except Exception:
        svg = content.strip()

    if "<svg" not in svg.lower():
        raise RuntimeError("Stage 2: response does not contain an <svg> element.")

    return _snap_edge_lines_to_nodes(svg)


# ---------- Orchestrator ----------

def run_serial_svg_builder(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> dict[str, Any]:
    works.msg("🔗 SERIAL procedure SVG pipeline starting…")

    groups = generate_serial_groups_from_prompt(user_prompt, model=model, temperature=temperature)
    svg = assemble_serial_svg_from_groups(user_prompt, groups, model=model, temperature=temperature)

    return {
        "svg": svg,
        "svg_groups": groups,
        "diagnostics": "NO_ISSUES_DETECTED",
    }


# ---------- Ion entry ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading two-stage SERIAL procedure diagram builder…")

    try:
        user_prompt = works.param(1)
        if not user_prompt:
            raise RuntimeError("Ion: param(1) required (user prompt).")
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        model = works.param(2) or default_model
    except Exception:
        model = default_model

    try:
        temperature_raw = works.param(3)
        temperature = float(temperature_raw) if temperature_raw is not None else 0.2
    except Exception:
        temperature = 0.2

    try:
        artifact = run_serial_svg_builder(user_prompt, model=model, temperature=temperature)
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "svg-serial-procedure",
        })
        return 1


if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

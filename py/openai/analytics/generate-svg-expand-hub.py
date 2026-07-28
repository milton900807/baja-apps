#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Two-stage SVG connection / responsibility diagram builder (Ion Works entry/exit).

FIXED + ENHANCED
----------------
1) Fixes:
   - Removes accidental global indentation.
   - Removes duplicate _chat_call definition.
   - Correctly uses param(2) as a "starting point" SVG *if* it looks like <svg...>.
   - If param(2) is NOT SVG, it is treated as the OpenAI model name.

2) New behavior:
   - If a starting SVG is provided, we parse its existing nodes and pass them to GPT
     as a locked starting point, then ask GPT to expand with additional nodes.
   - After Stage 1, we run a deterministic overlap resolver to ensure nodes do NOT overlap.
   - Stage 2 assembles the final SVG using the expanded node set and keeps connectivity rules.
"""

import os
import json
import re
import math
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict, is_dataclass
import xml.etree.ElementTree as ET

from ion import works  # type: ignore
from openai import OpenAI


# ---------- data structures ----------

@dataclass
class svg_text:
    text: str
    attrs: Dict[str, Any]


@dataclass
class svg_shape:
    tag: str  # rect | circle | ellipse | line | path | polyline, etc.
    attrs: Dict[str, Any]


@dataclass
class svg_group:
    """
    kind:
        "node"  – groups for node objects such as boxes/circles with labels
        "edge"  – (not used in stage 1; edges only exist in final SVG for now)
    """
    id: str
    kind: str
    shape: Optional[svg_shape]
    labels: List[svg_text]


# ---------- low-level helpers ----------

CANVAS_W = 800.0
CANVAS_H = 600.0


def _local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


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
        "Rules:\n"
        "- Do NOT add new fields.\n"
        "- Do NOT remove existing fields unless they are syntactically impossible.\n"
        "- Fix trailing commas, single quotes, comments, etc.\n"
        "- Return ONLY the JSON object; no explanations, no markdown."
    )
    fixed = _chat_call(
        model=model,
        system=system,
        user=f"Here is the invalid JSON:\n\n{bad_json}",
        temperature=0.0,
        max_tokens=2000,
    )
    return _extract_json_object(fixed)


def _extract_svg_snippet(text: str) -> str:
    m = re.search(r"<svg[\s\S]*?</svg>", text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("No <svg>...</svg> block found in model output.")
    return m.group(0).strip()


# ---------- parse starting SVG into node svg_groups ----------

def _parse_starting_svg_nodes(svg: str) -> List[svg_group]:
    """
    Parses <g class="node" data-id="..."> groups from an existing SVG.
    Extracts the first rect/ellipse/circle as shape, and all immediate <text> as labels.
    """
    try:
        root = ET.fromstring(svg)
    except Exception:
        return []

    out: List[svg_group] = []

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        cls = g.attrib.get("class", "")
        if "node" not in cls.split():
            continue
        node_id = g.attrib.get("data-id") or g.attrib.get("id")
        if not node_id:
            continue

        shape_el: Optional[ET.Element] = None
        labels: List[svg_text] = []

        for ch in list(g):
            t = _local(ch.tag)
            if shape_el is None and t in {"rect", "ellipse", "circle"}:
                shape_el = ch
            elif t == "text":
                labels.append(svg_text(text="".join(ch.itertext()).strip(), attrs=dict(ch.attrib)))

        shape_obj: Optional[svg_shape] = None
        if shape_el is not None:
            shape_obj = svg_shape(tag=_local(shape_el.tag), attrs=dict(shape_el.attrib))

        # If no labels, create one centered-ish later; keep empty for now
        out.append(svg_group(id=str(node_id), kind="node", shape=shape_obj, labels=labels))

    return out


# ---------- geometry helpers (overlap resolver) ----------

def _bbox_for_node(g: svg_group) -> Optional[Tuple[float, float, float, float]]:
    """
    Returns (x0,y0,x1,y1) bounding box in canvas coords for rect/ellipse/circle.
    """
    if not g.shape:
        return None
    tag = (g.shape.tag or "").lower()
    a = g.shape.attrs

    def f(key: str, default: float = 0.0) -> float:
        try:
            return float(a.get(key, default))
        except Exception:
            return float(default)

    if tag == "rect":
        x = f("x")
        y = f("y")
        w = f("width")
        h = f("height")
        return (x, y, x + w, y + h)

    if tag == "ellipse":
        cx = f("cx")
        cy = f("cy")
        rx = f("rx")
        ry = f("ry")
        return (cx - rx, cy - ry, cx + rx, cy + ry)

    if tag == "circle":
        cx = f("cx")
        cy = f("cy")
        r = f("r")
        return (cx - r, cy - r, cx + r, cy + r)

    return None


def _move_node(g: svg_group, dx: float, dy: float) -> None:
    if not g.shape:
        return
    tag = (g.shape.tag or "").lower()
    a = g.shape.attrs

    def add(key: str, d: float):
        try:
            a[key] = float(a.get(key, 0.0)) + d
        except Exception:
            try:
                a[key] = float(d)
            except Exception:
                a[key] = d

    if tag == "rect":
        add("x", dx)
        add("y", dy)
    elif tag in {"ellipse", "circle"}:
        add("cx", dx)
        add("cy", dy)

    # move labels too (best-effort)
    for lbl in g.labels:
        try:
            lbl.attrs["x"] = float(lbl.attrs.get("x", 0.0)) + dx
        except Exception:
            pass
        try:
            lbl.attrs["y"] = float(lbl.attrs.get("y", 0.0)) + dy
        except Exception:
            pass


def _overlaps(b1: Tuple[float, float, float, float], b2: Tuple[float, float, float, float], pad: float = 10.0) -> bool:
    x0, y0, x1, y1 = b1
    a0, b0, a1, b1_ = b2
    return not (x1 + pad <= a0 or a1 + pad <= x0 or y1 + pad <= b0 or b1_ + pad <= y0)


def _clamp_into_canvas(g: svg_group) -> None:
    bb = _bbox_for_node(g)
    if bb is None:
        return
    x0, y0, x1, y1 = bb

    dx = 0.0
    dy = 0.0
    if x0 < 10:
        dx = 10 - x0
    elif x1 > CANVAS_W - 10:
        dx = (CANVAS_W - 10) - x1
    if y0 < 10:
        dy = 10 - y0
    elif y1 > CANVAS_H - 10:
        dy = (CANVAS_H - 10) - y1

    if dx or dy:
        _move_node(g, dx, dy)


def _resolve_node_overlaps(groups: List[svg_group]) -> List[svg_group]:
    """
    Deterministic overlap resolver:
    - Iterates nodes; if a node overlaps any previously-placed node, it is shifted
      right/down in a grid-like walk until it fits, with wrap.
    """
    nodes = [g for g in groups if g.kind == "node" and g.shape is not None]
    placed_bbs: List[Tuple[float, float, float, float]] = []

    step_x = 40.0
    step_y = 35.0
    max_tries = 600

    for g in nodes:
        _clamp_into_canvas(g)
        bb = _bbox_for_node(g)
        if bb is None:
            continue

        tries = 0
        while any(_overlaps(bb, pbb) for pbb in placed_bbs) and tries < max_tries:
            # Shift right; if beyond canvas, wrap and go down
            _move_node(g, step_x, 0.0)
            _clamp_into_canvas(g)

            bb = _bbox_for_node(g) or bb
            # If we're stuck on the right edge, push down and reset x by large negative
            if bb[2] >= CANVAS_W - 10:
                _move_node(g, -240.0, step_y)
                _clamp_into_canvas(g)
                bb = _bbox_for_node(g) or bb

            tries += 1

        placed_bbs.append(bb)

    return groups


# ---------- SVG post-process: snap edge lines to centers ----------

def _snap_edge_lines_to_nodes(svg: str) -> str:
    try:
        root = ET.fromstring(svg)
    except Exception:
        return svg

    node_centers: Dict[str, Tuple[float, float]] = {}

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if "node" not in g.attrib.get("class", "").split():
            continue
        node_id = g.attrib.get("data-id")
        if not node_id:
            continue

        shape_el = None
        for ch in list(g):
            if _local(ch.tag) in {"rect", "ellipse", "circle"}:
                shape_el = ch
                break
        if shape_el is None:
            continue

        try:
            if _local(shape_el.tag) == "rect":
                x = float(shape_el.attrib.get("x", "0"))
                y = float(shape_el.attrib.get("y", "0"))
                w = float(shape_el.attrib.get("width", "0"))
                h = float(shape_el.attrib.get("height", "0"))
                node_centers[node_id] = (x + w / 2.0, y + h / 2.0)
            else:
                node_centers[node_id] = (
                    float(shape_el.attrib.get("cx", "0")),
                    float(shape_el.attrib.get("cy", "0")),
                )
        except Exception:
            continue

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if "edge" not in g.attrib.get("class", "").split():
            continue

        src = g.attrib.get("data-source")
        tgt = g.attrib.get("data-target")
        if not src or not tgt:
            continue
        if src not in node_centers or tgt not in node_centers:
            continue

        line_el = None
        for ch in list(g):
            if _local(ch.tag) == "line":
                line_el = ch
                break
        if line_el is None:
            continue

        sx, sy = node_centers[src]
        tx, ty = node_centers[tgt]
        line_el.set("x1", str(sx))
        line_el.set("y1", str(sy))
        line_el.set("x2", str(tx))
        line_el.set("y2", str(ty))

    return ET.tostring(root, encoding="unicode")


# ---------- STAGE 1 (expanded): GPT → svg_groups (nodes only), seeded with starting SVG nodes ----------

NODE_EXTRACTION_SYSTEM_EXPAND = """
You are a precise network-node extractor for SVG responsibility diagrams.

Goal:
-----
Given:
  (a) the user's natural-language description of roles / responsibilities / handoffs
  (b) an OPTIONAL list of EXISTING nodes (from a starting SVG)
You MUST output ONLY a strict JSON object describing the NODE VISUALS for a
future SVG diagram.

You DO NOT create edges or full <svg> markup in this step.

IMPORTANT (starting point):
---------------------------
- If existing nodes are provided, you MUST include them in your output.
- You MAY add new nodes that are implied by the user prompt.
- You MUST NOT delete existing nodes.
- You MUST assign coordinates so that nodes do NOT overlap in an 800x600 canvas.

Output format (STRICT):
-----------------------
Return ONLY a JSON object, no prose, no Markdown:

{
  "nodes": [
    {
      "id": "Product",
      "kind": "node",
      "shape": { "tag": "rect", "attrs": { ... } },
      "labels": [ { "text": "Product", "attrs": { ... } } ]
    }
  ]
}

Rules:
------
1) Infer distinct ACTORS / OBJECTS as nodes.
2) Use 2–4 word labels.
3) Each node has:
   - id: short unique identifier (avoid spaces)
   - kind: "node"
   - shape.tag: "rect" or "ellipse"
   - shape.attrs: numeric coordinates; include fill + stroke
   - labels: at least one label centered on the shape
4) Layout:
   - Place nodes within 800x600.
   - Ensure nodes do NOT overlap.
   - Use most of the canvas area.

IMPORTANT:
----------
• Do NOT output any <svg> tags.
• Do NOT output any text outside the JSON.
• Ensure the JSON is syntactically valid.
"""


def generate_svg_groups_from_prompt(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    starting_svg: Optional[str] = None,
) -> List[svg_group]:
    existing_nodes: List[svg_group] = []
    if starting_svg and "<svg" in starting_svg.lower():
        existing_nodes = _parse_starting_svg_nodes(starting_svg)

    existing_json = json.dumps({"existing_nodes": _to_jsonable(existing_nodes)}, indent=2)

    user_msg = f"""
User description:
{user_prompt}

Existing nodes from starting SVG (if any):
{existing_json}

Now return ONLY the JSON object with the complete expanded node list.
"""

    works.msg("🧱 Stage 1: requesting EXPANDED node svg_groups (seeded by starting SVG if provided)…")
    content = _chat_call(
        model=model,
        system=NODE_EXTRACTION_SYSTEM_EXPAND,
        user=user_msg,
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

    if not isinstance(data, dict) or "nodes" not in data or not isinstance(data["nodes"], list):
        raise RuntimeError(f"Stage 1: JSON missing 'nodes' list. Got: {data}")

    groups: List[svg_group] = []
    for node in data["nodes"]:
        if not isinstance(node, dict):
            continue
        node_id = str(node.get("id") or "").strip()
        if not node_id:
            continue

        kind = str(node.get("kind") or "node")
        shape_raw = node.get("shape")
        labels_raw = node.get("labels", [])

        shape_obj: Optional[svg_shape] = None
        if isinstance(shape_raw, dict):
            tag = str(shape_raw.get("tag") or "rect").strip() or "rect"
            attrs = shape_raw.get("attrs") or {}
            if not isinstance(attrs, dict):
                attrs = {}
            shape_obj = svg_shape(tag=tag, attrs={str(k): v for k, v in attrs.items()})

        label_objs: List[svg_text] = []
        if isinstance(labels_raw, list):
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

        groups.append(svg_group(id=node_id, kind=kind, shape=shape_obj, labels=label_objs))

    # Hard guarantee: resolve overlaps deterministically
    groups = _resolve_node_overlaps(groups)
    return groups


# ---------- STAGE 2: svg_groups (nodes) + GPT → full SVG (connected) ----------

SVG_ASSEMBLY_SYSTEM = """
You are a precise SVG diagram generator for responsibility & coordination maps.

This is STAGE 2 of a pipeline:
- You are given a list of pre-defined NODE visuals (shapes + labels).
- You MUST wrap those nodes into SVG <g class="node"> groups,
  and then add edge connections as <g class="edge"> groups.

CRITICAL CONNECTIVITY REQUIREMENT:
----------------------------------
• Every node that appears in the final SVG MUST be connected to at least one edge.
• There MUST be a single connected network (one connected component).
• If a node cannot be naturally connected based on the description, OMIT it.

Requirements:
-------------
1) Output ONLY a single self-contained <svg> element.
2) SVG root width=800 height=600 viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"
3) Layers:
   <g id="diagram-root">
     <g id="edges-layer">...</g>
     <g id="nodes-layer">...</g>
   </g>

Node groups:
- <g class="node" data-id="NODE_ID"> {shape} {text...} </g>
- Reuse provided shape + text attrs as closely as possible.

Edge groups:
- <g class="edge" data-eid="e0" data-source="A" data-target="B">
    <g class="endpoint source" data-ref="A"></g>
    <g class="endpoint target" data-ref="B"></g>
    <line ... />
    <text ...>Complete sentence describing handoff/responsibility.</text>
  </g>

No arrowheads/markers.
Use only <line>, <polyline>, or <path> for edges.
SVG only, no commentary.
"""


def _serialize_groups_for_gpt(groups: List[svg_group]) -> str:
    return json.dumps({"nodes": _to_jsonable(groups)}, indent=2)


def assemble_svg_from_groups(
    user_prompt: str,
    groups: List[svg_group],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    # Ensure overlaps are resolved even if caller skipped
    groups = _resolve_node_overlaps(groups)

    nodes_json = _serialize_groups_for_gpt(groups)
    user_msg = f"""
Original description:
--------------------------------------------------
{user_prompt}
--------------------------------------------------

Candidate node visuals (already positioned; do not overlap):
{nodes_json}

Build a COMPLETE connected SVG diagram following system rules.
Return ONLY <svg>...</svg>.
"""

    works.msg("🧩 Stage 2: requesting assembled SVG (expanded nodes + edges, connected)…")
    content = _chat_call(
        model=model,
        system=SVG_ASSEMBLY_SYSTEM,
        user=user_msg,
        temperature=temperature,
        max_tokens=2500,
    )

    try:
        svg = _extract_svg_snippet(content)
    except Exception as err:
        works.msg(f"⚠️ Could not cleanly extract <svg> block: {err}")
        svg = content.strip()

    if "<svg" not in svg.lower():
        raise RuntimeError("Stage 2: Model response does not contain an <svg> element.")

    return _snap_edge_lines_to_nodes(svg)


# ---------- Orchestrator ----------

def run_svg_builder(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    starting_svg: Optional[str] = None,
) -> Dict[str, Any]:
    works.msg("🔗 SVG responsibility / coordination diagram pipeline starting…")

    groups = generate_svg_groups_from_prompt(
        user_prompt,
        model=model,
        temperature=temperature,
        starting_svg=starting_svg,
    )

    svg = assemble_svg_from_groups(
        user_prompt,
        groups,
        model=model,
        temperature=temperature,
    )

    return {
        "svg": svg,
        "svg_groups": groups,
        "diagnostics": "NO_ISSUES_DETECTED",
    }


# ---------- Ion entry ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading two-stage SVG diagram builder (expand from starting SVG; no overlap)…")

    # param(1): required prompt
    try:
        user_prompt = works.param(1)
        if not user_prompt:
            raise RuntimeError("Ion: param(1) required (user prompt).")
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    # param(2): either starting SVG or model name
    model = default_model
    starting_svg: Optional[str] = None
    try:
        p2 = works.param(2)
        if p2:
            p2s = str(p2)
            if "<svg" in p2s.lower():
                starting_svg = p2s
            else:
                model = p2s
    except Exception:
        pass

    # param(3): temperature
    try:
        temperature_raw = works.param(3)
        temperature = float(temperature_raw) if temperature_raw is not None else 0.2
    except Exception:
        temperature = 0.2

    try:
        artifact = run_svg_builder(
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
            starting_svg=starting_svg,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "svg-connection-diagram",
        })
        return 1


if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

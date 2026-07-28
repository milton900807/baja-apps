#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import xml.etree.ElementTree as ET

"""
Two-stage SVG connection / responsibility diagram builder (Ion Works entry/exit).

UPDATED: Hub-and-spoke model
----------------------------
- Stage 1 ALWAYS includes a central Hub node (id="Hub") even if not mentioned.
- We apply a deterministic hub-and-spoke layout before Stage 2.
- Stage 2 MUST render a star topology: every non-hub node connects to Hub.
"""

import os
import json
import re
import math
from typing import Any, Dict, List, Optional
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
    tag: str  # rect | circle | ellipse | line | path | polyline, etc.
    attrs: Dict[str, Any]


@dataclass
class svg_group:
    """
    Represents a semantic SVG group consisting of one primary object + label(s).

    kind:
        "node"  – groups for node objects such as boxes/circles with labels
        "edge"  – (not used in stage 1; edges only exist in final SVG for now)
    """
    id: str
    kind: str
    shape: Optional[svg_shape]
    labels: List[svg_text]


# ---------- JSON helpers ----------

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


def _repair_json_with_gpt(
    bad_json: str,
    *,
    model: str,
) -> str:
    system = (
        "You are a STRICT JSON validator and fixer.\n"
        "You are given text that is SUPPOSED to be a single JSON object.\n"
        "Your job is to return the SAME structure, but as syntactically valid JSON.\n\n"
        "Rules:\n"
        "- Do NOT add new fields.\n"
        "- Do NOT remove existing fields unless they are syntactically impossible.\n"
        "- Fix issues like trailing commas, single quotes, comments, etc.\n"
        "- Return ONLY the JSON object as text, no explanations, no markdown."
    )

    user = f"Here is the invalid JSON:\n\n{bad_json}"

    fixed = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=0.0,
        max_tokens=2000,
    ).strip()

    return _extract_json_object(fixed)


def _extract_svg_snippet(text: str) -> str:
    m = re.search(r"<svg[\s\S]*?</svg>", text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("No <svg>...</svg> block found in model output.")
    return m.group(0).strip()


def _to_jsonable(obj):
    if is_dataclass(obj):
        return _to_jsonable(asdict(obj))
    if isinstance(obj, dict):
        return {str(k): _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    return obj


# ---------- Hub-and-spoke layout injection ----------

HUB_ID = "Hub"
HUB_LABEL = "Hub"

def _ensure_hub_node(groups: List[svg_group]) -> List[svg_group]:
    """
    Ensure a hub node exists (id="Hub"). If not, create it.
    """
    for g in groups:
        if g.id == HUB_ID:
            return groups

    # Default hub visual: ellipse centered-ish (we'll layout later anyway)
    hub_shape = svg_shape(
        tag="ellipse",
        attrs={
            "cx": 400, "cy": 300, "rx": 90, "ry": 45,
            "fill": "#FFF6E5",
            "stroke": "#333",
            "stroke-width": 1,
        },
    )
    hub_label = svg_text(
        text=HUB_LABEL,
        attrs={
            "x": 400, "y": 300,
            "font-size": 14,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "fill": "#000",
        },
    )
    groups.append(svg_group(id=HUB_ID, kind="node", shape=hub_shape, labels=[hub_label]))
    return groups


def _apply_hub_spoke_layout(groups: List[svg_group]) -> List[svg_group]:
    """
    Deterministic layout:
      - Hub at (400, 300)
      - Non-hub nodes evenly spaced on a ring
    Also re-centers each node label onto its shape center.
    """
    groups = _ensure_hub_node(groups)

    # Split
    hub = next((g for g in groups if g.id == HUB_ID), None)
    spokes = [g for g in groups if g.id != HUB_ID and g.kind == "node"]

    # Layout constants
    cx, cy = 400.0, 300.0
    ring_r = 220.0
    n = max(1, len(spokes))

    def _set_center(g: svg_group, x: float, y: float) -> None:
        if not g.shape:
            return
        tag = (g.shape.tag or "rect").lower()
        a = g.shape.attrs

        # Normalize numeric conversions if present
        def _num(v, default):
            try:
                return float(v)
            except Exception:
                return float(default)

        if tag == "rect":
            w = _num(a.get("width", 160), 160)
            h = _num(a.get("height", 60), 60)
            a["x"] = x - w / 2.0
            a["y"] = y - h / 2.0
            a.setdefault("rx", 8)
            a.setdefault("ry", 8)
        elif tag in {"ellipse", "circle"}:
            a["cx"] = x
            a["cy"] = y
            if tag == "circle":
                a.setdefault("r", 35)
            else:
                a.setdefault("rx", 80)
                a.setdefault("ry", 35)
        else:
            # Fallback to rect
            a["x"] = x - 80
            a["y"] = y - 30
            a["width"] = 160
            a["height"] = 60
            g.shape.tag = "rect"

        # Center labels
        for lbl in g.labels:
            lbl.attrs["x"] = x
            lbl.attrs["y"] = y
            lbl.attrs.setdefault("text-anchor", "middle")
            lbl.attrs.setdefault("dominant-baseline", "middle")

    # Place hub
    if hub and hub.shape:
        _set_center(hub, cx, cy)
        # Make it visually a bit more hub-like if desired
        hub.shape.attrs.setdefault("fill", "#FFF6E5")

    # Place spokes
    for i, g in enumerate(spokes):
        ang = (2.0 * math.pi * i) / n - (math.pi / 2.0)
        x = cx + ring_r * math.cos(ang)
        y = cy + ring_r * math.sin(ang)
        _set_center(g, x, y)

    return groups


# ---------- SVG post-process: snap edges to node centers ----------

def _snap_edge_lines_to_nodes(svg: str) -> str:
    try:
        root = ET.fromstring(svg)
    except Exception:
        return svg

    def _local(tag: str) -> str:
        return tag.split('}')[-1] if '}' in tag else tag

    node_centers: Dict[str, tuple[float, float]] = {}

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        class_attr = g.attrib.get("class", "")
        if "node" not in class_attr.split():
            continue
        node_id = g.attrib.get("data-id")
        if not node_id:
            continue

        shape_el = None
        for child in g:
            if _local(child.tag) in {"rect", "ellipse", "circle"}:
                shape_el = child
                break
        if shape_el is None:
            continue

        tag = _local(shape_el.tag)
        attrs = shape_el.attrib

        try:
            if tag == "rect":
                x = float(attrs.get("x", "0"))
                y = float(attrs.get("y", "0"))
                w = float(attrs.get("width", "0"))
                h = float(attrs.get("height", "0"))
                cx = x + w / 2.0
                cy = y + h / 2.0
            elif tag in {"ellipse", "circle"}:
                cx = float(attrs.get("cx", "0"))
                cy = float(attrs.get("cy", "0"))
            else:
                continue
        except ValueError:
            continue

        node_centers[node_id] = (cx, cy)

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        class_attr = g.attrib.get("class", "")
        if "edge" not in class_attr.split():
            continue

        src_id = g.attrib.get("data-source")
        tgt_id = g.attrib.get("data-target")
        if not src_id or not tgt_id:
            continue
        if src_id not in node_centers or tgt_id not in node_centers:
            continue

        sx, sy = node_centers[src_id]
        tx, ty = node_centers[tgt_id]

        line_el = None
        for child in g:
            if _local(child.tag) == "line":
                line_el = child
                break
        if line_el is None:
            continue

        line_el.set("x1", str(sx))
        line_el.set("y1", str(sy))
        line_el.set("x2", str(tx))
        line_el.set("y2", str(ty))

    return ET.tostring(root, encoding="unicode")


# ---------- STAGE 1: GPT → svg_group (nodes only) ----------

NODE_EXTRACTION_SYSTEM = f"""
You are a precise network-node extractor for SVG responsibility diagrams.

Goal:
-----
Given a natural-language description of roles / responsibilities / handoffs,
you MUST output ONLY a strict JSON object describing the NODE VISUALS for a
future SVG diagram.

IMPORTANT (Hub-and-spoke):
--------------------------
You MUST ALWAYS include a central coordination hub node:
  - id: "{HUB_ID}"
  - label text: "{HUB_LABEL}"
Even if the user does not mention it explicitly.

You DO NOT create edges or full <svg> markup in this step.

Output format (STRICT):
-----------------------
Return ONLY a JSON object, no prose, no Markdown:

{{
  "nodes": [
    {{
      "id": "Product",
      "kind": "node",
      "shape": {{
        "tag": "rect",
        "attrs": {{
          "x": 100,
          "y": 100,
          "width": 160,
          "height": 60,
          "rx": 8,
          "ry": 8,
          "fill": "#F0F4FF",
          "stroke": "#333",
          "stroke-width": 1
        }}
      }},
      "labels": [
        {{
          "text": "Product",
          "attrs": {{
            "x": 180,
            "y": 130,
            "font-size": 14,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "fill": "#000"
          }}
        }}
      ]
    }}
  ]
}}

Rules:
------
1. Infer distinct ACTORS / OBJECTS as nodes:
   - Teams, systems, outcomes/hubs.

2. Use 2–4 word labels for nodes.
   - Deduplicate obvious variants.

3. Each node:
   - "id": short unique identifier (no spaces if possible).
   - "kind": must be "node".
   - "shape.tag": "rect" or "ellipse".
   - "shape.attrs": place nodes within 800x600; light fill + stroke.
   - "labels": at least one centered label.

4. Layout:
   - Roughly space nodes so they don't overlap.
   - Do NOT leave everything at (0,0). (Final layout will be adjusted.)

IMPORTANT:
----------
• Do NOT output any <svg> tags.
• Do NOT output any text outside the JSON.
• Ensure the JSON is syntactically valid (double quotes, no trailing commas).
"""


def generate_svg_groups_from_prompt(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> List[svg_group]:
    user_msg = f"""
Natural-language description of roles / responsibilities:
{user_prompt}

Now extract nodes and return ONLY the JSON object as described.
"""
    works.msg("🧱 Stage 1: requesting node svg_groups (visual objects) from GPT…")
    content = _chat_call(
        model=model,
        system=NODE_EXTRACTION_SYSTEM,
        user=user_msg,
        temperature=temperature,
        max_tokens=2000,
    )

    raw_json = _extract_json_object(content)

    try:
        data = json.loads(raw_json)
    except Exception as e_first:
        works.msg(f"⚠️ Stage 1: initial JSON parse failed, attempting repair… ({e_first})")
        repaired = _repair_json_with_gpt(raw_json, model=model)
        try:
            data = json.loads(repaired)
        except Exception as e_second:
            snippet = content[:500]
            raise RuntimeError(
                "Stage 1: GPT did not return valid JSON even after repair.\n"
                f"First error: {e_first}\nSecond error: {e_second}\nRaw: {snippet}"
            ) from e_second

    if not isinstance(data, dict) or "nodes" not in data:
        raise RuntimeError(f"Stage 1: JSON missing 'nodes' key. Got: {data}")

    nodes_raw = data.get("nodes", [])
    if not isinstance(nodes_raw, list):
        raise RuntimeError("Stage 1: 'nodes' must be a list")

    groups: List[svg_group] = []
    for node in nodes_raw:
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
            tag = str(shape_raw.get("tag") or "").strip() or "rect"
            attrs = shape_raw.get("attrs") or {}
            if isinstance(attrs, dict):
                attrs = {str(k): v for k, v in attrs.items()}
            else:
                attrs = {}
            shape_obj = svg_shape(tag=tag, attrs=attrs)

        label_objs: List[svg_text] = []
        if isinstance(labels_raw, list):
            for lbl in labels_raw:
                if not isinstance(lbl, dict):
                    continue
                txt = str(lbl.get("text") or "").strip()
                if not txt:
                    continue
                attrs = lbl.get("attrs") or {}
                if isinstance(attrs, dict):
                    attrs = {str(k): v for k, v in attrs.items()}
                else:
                    attrs = {}
                label_objs.append(svg_text(text=txt, attrs=attrs))

        groups.append(svg_group(id=node_id, kind=kind, shape=shape_obj, labels=label_objs))

    # Ensure hub exists + apply deterministic hub/spoke layout
    groups = _apply_hub_spoke_layout(groups)
    return groups


# ---------- STAGE 2: svg_groups (nodes) + GPT → full SVG (HUB-AND-SPOKE) ----------

SVG_ASSEMBLY_SYSTEM = f"""
You are a precise SVG diagram generator for responsibility & coordination maps.

This is STAGE 2 of a pipeline:
- You are given a list of pre-defined NODE visuals (shapes + labels).
- You MUST wrap those nodes into SVG <g class="node"> groups,
  and then add edge connections as <g class="edge"> groups.

HUB-AND-SPOKE REQUIREMENT (MANDATORY):
--------------------------------------
• The node with id "{HUB_ID}" is the ONLY hub.
• Every other rendered node MUST connect to "{HUB_ID}" via EXACTLY ONE edge.
• Do NOT create edges between two non-hub nodes.
• The final graph MUST be a star topology centered on "{HUB_ID}".
• If a node cannot be reasonably connected to "{HUB_ID}" based on the description,
  OMIT that node entirely (do not render it).

Connectivity:
-------------
• Every rendered non-hub node must appear in exactly one edge that references "{HUB_ID}".
• "{HUB_ID}" will have multiple incident edges.
• All rendered nodes are connected (single component).

Requirements:
-------------
1. Output ONLY a single self-contained <svg> element.
2. SVG root:
   <svg width="800" height="600" viewBox="0 0 800 600"
        xmlns="http://www.w3.org/2000/svg" role="img"
        aria-label="Responsibility and dependency network diagram">
3. Layers:
   <g id="diagram-root">
     <g id="edges-layer">...</g>
     <g id="nodes-layer">...</g>
   </g>

4. Node groups:
   <g class="node" data-id="NODE_ID"> ...shape... <text...>...</text> </g>
   Reuse provided shapes/labels as closely as possible.

5. Edge groups:
   <g class="edge" data-eid="e0" data-source="SourceId" data-target="TargetId">
     <g class="endpoint source" data-ref="SourceId"></g>
     <g class="endpoint target" data-ref="TargetId"></g>
     <line ... />
     <text ...>A COMPLETE SENTENCE describing the handoff/responsibility.</text>
   </g>

   • data-eid unique (e0, e1, ...).
   • No arrowheads/markers.
   • Use only <line>, <path>, or <polyline> for connections.

Visual constraints:
-------------------
• Node shapes: ONLY <rect>, <circle>, or <ellipse>.
• Edges: ONLY <line>, <polyline>, or <path>.
• Avoid overlapping nodes; avoid covering node labels when possible.

IMPORTANT:
----------
• Do NOT change node ids for nodes you render.
• Do NOT invent new nodes beyond the provided list.
• No commentary, no Markdown; SVG only.
"""


def _serialize_groups_for_gpt(groups: List[svg_group]) -> str:
    payload = {"nodes": _to_jsonable(groups)}
    return json.dumps(payload, indent=2)


def assemble_svg_from_groups(
    user_prompt: str,
    groups: List[svg_group],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    # Ensure hub + deterministic layout already applied
    groups = _apply_hub_spoke_layout(groups)

    nodes_json = _serialize_groups_for_gpt(groups)

    user_msg = f"""
You are given:

1) The original natural-language description:
--------------------------------------------------
{user_prompt}
--------------------------------------------------

2) A JSON structure describing the NODE visuals (candidate nodes):
{nodes_json}

Build a COMPLETE hub-and-spoke SVG diagram:
- "{HUB_ID}" is the hub.
- Every other rendered node has exactly one edge connected to "{HUB_ID}".
- No non-hub to non-hub edges.
- Omit nodes that cannot be reasonably connected to "{HUB_ID}".

Return ONLY the <svg>...</svg> markup.
"""

    works.msg("🧩 Stage 2: requesting assembled HUB-AND-SPOKE SVG (star topology) from GPT…")
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

    # Snap edge endpoints to node centers for clean geometry
    svg_snapped = _snap_edge_lines_to_nodes(svg)
    return svg_snapped


# ---------- Convenience wrapper (prompt → full SVG only) ----------

def generate_svg_diagram(
    user_prompt: str,
    *largs,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    groups = generate_svg_groups_from_prompt(user_prompt, model=model, temperature=temperature)
    svg = assemble_svg_from_groups(user_prompt, groups, model=model, temperature=temperature)
    return svg


# ---------- Orchestrator ----------

def run_svg_builder(
    user_prompt: str,
    *largs,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> dict[str, Any]:
    works.msg("🔗 SVG hub-and-spoke responsibility diagram pipeline starting…")

    groups = generate_svg_groups_from_prompt(user_prompt, model=model, temperature=temperature)
    svg = assemble_svg_from_groups(user_prompt, groups, model=model, temperature=temperature)

    artifact: dict[str, Any] = {
        "svg": svg,
        "svg_groups": groups,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading two-stage SVG HUB-AND-SPOKE diagram builder…")

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
        temperature = 0.9

    try:
        artifact = run_svg_builder(user_prompt, model=model, temperature=temperature)
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

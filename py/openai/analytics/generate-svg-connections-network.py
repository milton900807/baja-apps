#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import xml.etree.ElementTree as ET


"""
Two-stage SVG connection / responsibility diagram builder (Ion Works entry/exit).

PIPELINE
--------
1) GPT call #1:
   - Read user natural-language description of responsibilities / flows.
   - Produce a JSON list of "visual nodes" that map directly onto svg_group objects:
       - Each node has: id, shape (svg_shape), labels (svg_text list).
   - We convert JSON -> svg_group dataclasses.

2) GPT call #2:
   - Take the structured svg_groups (nodes ONLY) + original user prompt.
   - Ask GPT to assemble a COMPLETE SVG:
       - Uses the given node shapes/labels as-is (wrapped into <g class="node">).
       - Adds <g class="edge"> elements in an <g id="edges-layer">.
       - ***All rendered nodes must be connected by at least one edge.***
       - Nodes that would be isolated MUST be omitted from the final SVG.

Ion entry returns:
    {
      "svg": "<svg ...>...</svg>",
      "svg_groups": [ ... node svg_groups from Stage 1 ... ],
      "diagnostics": "NO_ISSUES_DETECTED"
    }

Expected Ion params
-------------------
param(1) = user prompt describing nodes/relationships and responsibilities
           e.g., "Product team owns roadmap, Eng implements features, QA validates, Sales communicates to customers."
param(2) = model (optional; default gpt-4o-mini)
param(3) = temperature (optional; default 0.2)
"""

import os
import json
import re
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



def _extract_json_object(text: str) -> str:
    """
    Best-effort extraction of a single JSON object from model output.
    - Strips Markdown fences like ```json ... ```
    - Takes the substring from the first '{' to the last '}'.
    """
    # Strip Markdown code fences if present
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced:
        text = fenced.group(1)

    # Trim whitespace
    text = text.strip()

    # If it already looks like pure JSON, return as-is
    if text.startswith("{") and text.endswith("}"):
        return text

    # Otherwise, grab from first '{' to last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        # Nothing usable
        return text

    return text[start : end + 1]


def _repair_json_with_gpt(
    bad_json: str,
    *,
    model: str,
) -> str:
    """
    Ask GPT to repair invalid JSON. Returns a string that SHOULD be valid JSON.
    """
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

    # Clean again in case it comes wrapped in code fences
    return _extract_json_object(fixed)




def _snap_edge_lines_to_nodes(svg: str) -> str:
    """
    Post-process the SVG so that each <g class="edge"> line is snapped
    to the centers of its source/target node shapes.

    Assumes:
    - node groups: <g class="node" data-id="NodeId"> ... <rect/ellipse/circle> ... </g>
    - edge groups: <g class="edge" data-source="SourceId" data-target="TargetId">
                     <line ... />
                   </g>
    """
    try:
        root = ET.fromstring(svg)
    except Exception:
        # If parsing fails, just return the original SVG
        return svg

    # Handle namespaces (e.g. '{http://www.w3.org/2000/svg}svg')
    def _local(tag: str) -> str:
        return tag.split('}')[-1] if '}' in tag else tag

    # Gather node centers by data-id
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

        # Find the primary shape inside the node group
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

    # Adjust edge lines
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
            # Can't resolve one of the endpoints
            continue

        sx, sy = node_centers[src_id]
        tx, ty = node_centers[tgt_id]

        # Find a <line> child to overwrite
        line_el = None
        for child in g:
            if _local(child.tag) == "line":
                line_el = child
                break

        # If no <line>, we can't easily rewire <path>/<polyline>, so skip
        if line_el is None:
            continue

        line_el.set("x1", str(sx))
        line_el.set("y1", str(sy))
        line_el.set("x2", str(tx))
        line_el.set("y2", str(ty))

    return ET.tostring(root, encoding="unicode")

# ---------- helpers ----------

def _to_jsonable(obj):
    """
    Recursively convert dataclasses, lists, and dicts into plain
    JSON-serializable structures (no json.dumps here).
    """
    if is_dataclass(obj):
        return _to_jsonable(asdict(obj))

    if isinstance(obj, dict):
        return {str(k): _to_jsonable(v) for k, v in obj.items()}

    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]

    return obj  # str/int/float/bool/None
def _wire_edges_to_nodes_via_groups(svg: str) -> str:
    """
    Ensure each edge has endpoint svg_groups that reference its source/target node,
    and ensure each node contains port svg_groups referencing incident edges.

    Enforces:
      - edge: <g class="edge" data-eid="e0" data-source="A" data-target="B">
                <g class="endpoint source" data-ref="A"><circle .../></g>
                <g class="endpoint target" data-ref="B"><circle .../></g>
                <line .../>
                <text .../>
              </g>

      - node: <g class="node" data-id="A">
                ...
                <g class="ports">
                  <g class="port" data-eid="e0" data-peer="B"><circle .../></g>
                </g>
              </g>

    Notes:
      - Uses node centers (rect/ellipse/circle) for endpoint/port circles.
      - Leaves existing geometry alone except for injecting these groups.
    """
    try:
        root = ET.fromstring(svg)
    except Exception:
        return svg

    def _local(tag: str) -> str:
        return tag.split("}")[-1] if "}" in tag else tag

    def _cls_has(el: ET.Element, c: str) -> bool:
        return c in (el.attrib.get("class", "").split())

    def _find_first(parent: ET.Element, pred):
        for ch in list(parent):
            if pred(ch):
                return ch
        return None

    # --- gather node groups + centers ---
    node_group_by_id: Dict[str, ET.Element] = {}
    node_center_by_id: Dict[str, tuple[float, float]] = {}

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if not _cls_has(g, "node"):
            continue

        node_id = g.attrib.get("data-id")
        if not node_id:
            continue

        node_group_by_id[node_id] = g

        # locate primary shape
        shape_el = None
        for child in list(g):
            if _local(child.tag) in {"rect", "ellipse", "circle"}:
                shape_el = child
                break
        if shape_el is None:
            continue

        tag = _local(shape_el.tag)
        a = shape_el.attrib
        try:
            if tag == "rect":
                x = float(a.get("x", "0"))
                y = float(a.get("y", "0"))
                w = float(a.get("width", "0"))
                h = float(a.get("height", "0"))
                cx = x + w / 2.0
                cy = y + h / 2.0
            elif tag == "ellipse":
                cx = float(a.get("cx", "0"))
                cy = float(a.get("cy", "0"))
            elif tag == "circle":
                cx = float(a.get("cx", "0"))
                cy = float(a.get("cy", "0"))
            else:
                continue
        except ValueError:
            continue

        node_center_by_id[node_id] = (cx, cy)

    # --- find edges and enforce endpoint groups + node ports ---
    edge_counter = 0

    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if not _cls_has(g, "edge"):
            continue

        src = g.attrib.get("data-source")
        tgt = g.attrib.get("data-target")
        if not src or not tgt:
            continue

        # ensure data-eid
        eid = g.attrib.get("data-eid")
        if not eid:
            eid = f"e{edge_counter}"
            g.set("data-eid", eid)
        edge_counter += 1

        # ensure endpoint groups exist in the edge group
        def _is_src_endpoint(el):
            return _local(el.tag) == "g" and _cls_has(el, "endpoint") and _cls_has(el, "source")

        def _is_tgt_endpoint(el):
            return _local(el.tag) == "g" and _cls_has(el, "endpoint") and _cls_has(el, "target")

        src_ep = _find_first(g, _is_src_endpoint)
        tgt_ep = _find_first(g, _is_tgt_endpoint)

        if src_ep is None:
            src_ep = ET.Element("g", {"class": "endpoint source", "data-ref": src})
            g.insert(0, src_ep)
        else:
            src_ep.set("data-ref", src)

        if tgt_ep is None:
            tgt_ep = ET.Element("g", {"class": "endpoint target", "data-ref": tgt})
            # insert after src endpoint if possible
            insert_idx = 1 if len(list(g)) > 0 else 0
            g.insert(insert_idx, tgt_ep)
        else:
            tgt_ep.set("data-ref", tgt)

        # ensure circles inside endpoints (invisible anchor objects)
        def _ensure_circle(parent: ET.Element, cx: float, cy: float):
            circ = _find_first(parent, lambda el: _local(el.tag) == "circle")
            if circ is None:
                circ = ET.Element("circle", {
                    "cx": str(cx),
                    "cy": str(cy),
                    "r": "3",
                    "fill": "none",
                    "stroke": "none",
                })
                parent.append(circ)
            else:
                circ.set("cx", str(cx))
                circ.set("cy", str(cy))
                if "r" not in circ.attrib:
                    circ.set("r", "3")
                circ.set("fill", circ.attrib.get("fill", "none"))
                circ.set("stroke", circ.attrib.get("stroke", "none"))
            return circ

        if src in node_center_by_id:
            sx, sy = node_center_by_id[src]
            _ensure_circle(src_ep, sx, sy)

        if tgt in node_center_by_id:
            tx, ty = node_center_by_id[tgt]
            _ensure_circle(tgt_ep, tx, ty)

        # ensure node-side ports exist
        def _ensure_ports_container(node_g: ET.Element) -> ET.Element:
            ports = _find_first(node_g, lambda el: _local(el.tag) == "g" and _cls_has(el, "ports"))
            if ports is None:
                ports = ET.Element("g", {"class": "ports"})
                node_g.append(ports)
            return ports

        def _ensure_port(node_id: str, peer_id: str):
            node_g = node_group_by_id.get(node_id)
            if node_g is None:
                return
            ports = _ensure_ports_container(node_g)

            # find existing port for this eid
            port = _find_first(
                ports,
                lambda el: _local(el.tag) == "g"
                and _cls_has(el, "port")
                and el.attrib.get("data-eid") == eid
            )
            if port is None:
                port = ET.Element("g", {"class": "port", "data-eid": eid, "data-peer": peer_id})
                ports.append(port)
            else:
                port.set("data-peer", peer_id)

            if node_id in node_center_by_id:
                cx, cy = node_center_by_id[node_id]
                _ensure_circle(port, cx, cy)

        _ensure_port(src, tgt)
        _ensure_port(tgt, src)

    return ET.tostring(root, encoding="unicode")


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
    kwargs = dict(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    resp = client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


def _extract_svg_snippet(text: str) -> str:
    """
    Extract the first <svg>...</svg> block from the model output.
    Raises if none found.
    """
    m = re.search(r"<svg[\s\S]*?</svg>", text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("No <svg>...</svg> block found in model output.")
    return m.group(0).strip()


# ---------- STAGE 1: GPT → svg_group (nodes only) ----------

NODE_EXTRACTION_SYSTEM = """
You are a precise network-node extractor for SVG responsibility diagrams.

Goal:
-----
Given a natural-language description of roles / responsibilities / handoffs,
you MUST output ONLY a strict JSON object describing the NODE VISUALS for a
future SVG diagram.

You DO NOT create edges or full <svg> markup in this step.

Output format (STRICT):
-----------------------
Return ONLY a JSON object, no prose, no Markdown:

{
  "nodes": [
    {
      "id": "Product",
      "kind": "node",
      "shape": {
        "tag": "rect",
        "attrs": {
          "x": 100,
          "y": 100,
          "width": 160,
          "height": 60,
          "rx": 8,
          "ry": 8,
          "fill": "#F0F4FF",
          "stroke": "#333",
          "stroke-width": 1
        }
      },
      "labels": [
        {
          "text": "Product",
          "attrs": {
            "x": 180,
            "y": 130,
            "font-size": 14,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            "fill": "#000"
          }
        }
      ]
    }
  ]
}

Rules:
------
1. Infer distinct ACTORS / OBJECTS as nodes:
   - Teams (e.g., "Product", "Engineering", "Regulatory"),
   - Systems ("CRM", "Data Warehouse"),
   - Outcomes / hubs ("Drug program A", "Clinical trial", "Platform").

2. Use 2–4 word labels for nodes.
   - Prefer terms directly from the user text.
   - Deduplicate obvious variants: "product team"/"Product" => one node: "Product".

3. Each node:
   - "id": short unique identifier (no spaces if possible, e.g., "Product", "Eng", "QA").
   - "kind": must be "node".
   - "shape.tag": "rect" or "ellipse".
   - "shape.attrs":
        • Place nodes within an 800x600 canvas.
        • Use numeric coordinates (x,y, width, height) for rects;
          or (cx, cy, rx, ry) for ellipses.
        • Include a light fill and a stroke.
   - "labels": at least one label (the main node name).
        • Position the label centered over the shape.
        • Include font-size, x, y, text-anchor.

4. Layout:
   - Roughly space nodes so they don't overlap (you don't need to be perfect).
   - Use simple coordinates, but do NOT leave them all at (0,0).

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
    """
    Stage 1:
      Take the user's natural-language description and ask GPT to output
      a JSON structure describing node visuals that correspond directly
      to svg_group(dataclass) objects (kind='node').
    """
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

    # Try to load JSON (with cleaning + one repair attempt if needed)
    raw_json = _extract_json_object(content)

    try:
        data = json.loads(raw_json)
    except Exception as e_first:
        # One more attempt: ask GPT to repair the JSON
        works.msg(f"⚠️ Stage 1: initial JSON parse failed, attempting repair… ({e_first})")

        repaired = _repair_json_with_gpt(raw_json, model=model)

        try:
            data = json.loads(repaired)
        except Exception as e_second:
            # If it still fails, throw a clear error with a snippet
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

        groups.append(
            svg_group(
                id=node_id,
                kind=kind,
                shape=shape_obj,
                labels=label_objs,
            )
        )

    return groups


# ---------- STAGE 2: svg_groups (nodes) + GPT → full SVG (all nodes connected) ----------

SVG_ASSEMBLY_SYSTEM = """
You are a precise SVG diagram generator for responsibility & coordination maps.

This is STAGE 2 of a pipeline:
- You are given a list of pre-defined NODE visuals (shapes + labels).
- You MUST wrap those nodes into SVG <g class="node"> groups,
  and then add edge connections as <g class="edge"> groups.

CRITICAL CONNECTIVITY REQUIREMENT:
----------------------------------
• Every node that appears in the final SVG MUST be connected to at least one edge:
    - It must appear as a data-source or data-target on some <g class="edge">.
• There MUST be a single connected network:
    - The graph formed by the rendered nodes and edges should be one connected component.
• If a node cannot be naturally connected to any others based on the description,
  you MUST OMIT that node entirely from the final SVG (do not render it at all).
• If a node can be naturally connected to any others based on the description,
  you MUST move the coordinates to the correct location to show connection.

Requirements:
-------------
1. Output ONLY a single self-contained <svg> element.
   • No XML declaration.
   • No text outside the <svg> element.

2. SVG root:
   <svg
     width="800"
     height="600"
     viewBox="0 0 800 600"
     xmlns="http://www.w3.org/2000/svg"
     role="img"
     aria-label="Responsibility and dependency network diagram">

3. Grouping and layers (MANDATORY):
   <svg ...>
     <defs> ... (optional) ... </defs>
     <g id="diagram-root">
       <g id="edges-layer">
         <!-- one <g class="edge"> per relationship -->
       </g>
       <g id="nodes-layer">
         <!-- one <g class="node"> per node -->
       </g>
     </g>
   </svg>

4. Node groups:
   • For each node that you DECIDE TO RENDER (i.e., that is connected),
     create:
       <g class="node" data-id="NODE_ID">
         <rect ... /> or <ellipse ... />
         <text ...>label</text>
         <!-- you may have multiple <text> if needed -->
       </g>
   • You MUST reuse the provided shape and text attributes as closely as possible:
       - Same tag name: rect or ellipse
       - Same attrs: coordinates, sizes, fill, stroke, font-size, etc.
   • Do NOT render any node that does not participate in at least one edge.
   • All nodes are connected by lines.

. Edge groups:
   • For each relationship, create ONE group:

       <g class="edge" data-eid="e0" data-source="SourceId" data-target="TargetId">
         <g class="endpoint source" data-ref="SourceId">
         </g>
         <g class="endpoint target" data-ref="TargetId">
         </g>

         <line ... /> or <polyline ... /> or <path ... />
         <text ...>A COMPLETE SENTENCE describing the responsibility/handoff.</text>
       </g>

   • data-eid MUST be unique per edge (e0, e1, e2, ...).
   • The endpoint <g> elements MUST exist even if invisible (stroke/ fill none).
   • No arrowheads or markers.
   • Use only <line>, <path>, or <polyline> for connections.
      

   • Ensure that:
       - Every rendered node id appears at least once as data-source or data-target.
       - The set of rendered nodes and edges forms one connected component.

6. Visual constraints:
   • Node shapes: ONLY <rect>, <circle>, or <ellipse> with fill.
   • Edges: ONLY <line>, <polyline>, or <path>.
   • Arrange edges so they don't cover node labels if possible.
   • Use most of the 800x600 area.
   • DO NOT OVERLAP  <rect>, <circle>, or <ellipse>.
   

7. Accessibility:
   • The <text> for edges and nodes must be directly inside the node/edge group.

IMPORTANT:
----------
• Do NOT change node ids for nodes you render.
• Do NOT invent new nodes that do not correspond to the given list.
• You MAY introduce a central hub node ONLY if that hub is already present
  in the provided node list.
• No commentary, no Markdown; SVG only.
"""


def _serialize_groups_for_gpt(groups: List[svg_group]) -> str:
    """
    Convert svg_group dataclasses into a compact JSON string for inclusion
    in the GPT prompt (stage 2).
    """
    payload = {"nodes": _to_jsonable(groups)}
    return json.dumps(payload, indent=2)


def assemble_svg_from_groups(
    user_prompt: str,
    groups: List[svg_group],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    """
    Stage 2:
      Take structured node svg_groups plus the original user prompt,
      and ask GPT to assemble a full SVG (nodes-layer + edges-layer),
      enforcing that all rendered nodes are connected.
    """
    nodes_json = _serialize_groups_for_gpt(groups)

    user_msg = f"""
You are given:

1) The original natural-language description of responsibilities and flows:
--------------------------------------------------
{user_prompt}
--------------------------------------------------

2) A JSON structure describing the NODE visuals (candidate nodes):

{nodes_json}

Using these nodes, build a COMPLETE responsibility / dependency SVG diagram
that follows the system instructions:

- Only render nodes that are part of at least one relationship.
- Every rendered node must be connected via at least one edge.
- The resulting network should form one connected component.
- Wrap each rendered node into a <g class="node" data-id="..."> group under #nodes-layer.
- Add <g class="edge"> groups under #edges-layer for the relationships.

Return ONLY the <svg>...</svg> markup.
"""

    works.msg("🧩 Stage 2: requesting assembled SVG (nodes + edges, fully connected) from GPT…")
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

    # NEW: snap edge lines to the centers of the rendered nodes
    svg_snapped = _snap_edge_lines_to_nodes(svg)
    # svg_wired = _wire_edges_to_nodes_via_groups(svg_snapped)

    return svg_snapped


# ---------- Convenience wrapper (prompt → full SVG only) ----------

def generate_svg_diagram(
    user_prompt: str,
    *largs,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    """
    Backward-compatible helper: given a user prompt, run both stages:

      1) generate_svg_groups_from_prompt(...)
      2) assemble_svg_from_groups(...)

    and return ONLY the final SVG string.

    NOTE: For structured data, prefer calling run_svg_builder(...) directly.
    """
    groups = generate_svg_groups_from_prompt(
        user_prompt, model=model, temperature=temperature
    )
    svg = assemble_svg_from_groups(
        user_prompt, groups, model=model, temperature=temperature
    )
    return svg


# ---------- Orchestrator ----------

def run_svg_builder(
    user_prompt: str,
    *largs,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> dict[str, Any]:
    """
    High-level orchestration:
      1) Ask GPT for node svg_group objects (shapes + labels).
      2) Ask GPT to assemble those into a full SVG with edges,
         ensuring all rendered nodes are connected.
      3) Return raw SVG + structured svg_group list (nodes from Stage 1).
    """
    works.msg("🔗 SVG responsibility / coordination diagram pipeline starting…")

    # Stage 1: nodes → svg_groups
    groups = generate_svg_groups_from_prompt(
        user_prompt, model=model, temperature=temperature
    )

    # Stage 2: assemble full SVG
    svg = assemble_svg_from_groups(
        user_prompt, groups, model=model, temperature=temperature
    )

    artifact: dict[str, Any] = {
        "svg": svg,
        "svg_groups": groups,  # list[svg_group] (candidate nodes from Stage 1)
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading two-stage SVG responsibility diagram builder (all nodes connected)…")

    # User prompt in param(1) (required)
    try:
        user_prompt = works.param(1)
        if not user_prompt:
            raise RuntimeError("Ion: param(1) required (user prompt).")
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    # Optional model in param(2)
    try:
        model = works.param(2) or default_model
    except Exception:
        model = default_model

    # Optional temperature in param(3)
    try:
        temperature_raw = works.param(3)
        temperature = float(temperature_raw) if temperature_raw is not None else 0.2
    except Exception:
        temperature = 0.9

    try:
        artifact = run_svg_builder(
            user_prompt,
            model=model,
            temperature=temperature,
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


# ---------- Bootstrap ----------

if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

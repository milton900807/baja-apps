#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
from urllib.parse import unquote
from pathlib import Path

"""
SVG "expand-selected" responsibility diagram builder.

GOAL
----
Given:
  1) user_prompt (expansion instructions)
  2) starting_svg (an existing SVG diagram OR an array of SVG snippets)
  3) selected_svg_object (a FULL <svg> snippet containing the selected component)

Return:
  - a MODIFIED SVG, preserving existing content, and expanding ONLY the selected component
    by adding new nodes + new edges implied by the user_prompt.

Key properties:
- Does NOT rebuild the whole SVG.
- Keeps existing nodes/edges unchanged.
- Adds new nodes around the selected node (deterministic placement, no overlap).
- Adds new edges that connect into the existing network via the selected component.
- Snaps new edge line endpoints to node centers.

IMPORTANT:
- We preserve existing <g class="node" data-id="..."> ids EXACTLY if present.
  This ensures the expansion is a true refinement of the original network (builder output).
- Selection is resolved purely by coordinates from selected_svg_object.

NEW (per your request):
- Stage 0: extract selected node’s text label, call GPT to write a short paragraph about
  what interacts with the objects in that text, then feed that paragraph into the existing
  expander stage (Stage 1) as additional context.
- Ensure text nodes are associated with their background shapes by centering labels on
  their respective shapes for NEW nodes we add.
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
        "edge"  – (not used for parsing; edges are stored in SVG directly)
    """
    id: str            # INTERNAL handle; for existing builder SVG, equals data-id
    kind: str
    shape: Optional[svg_shape]
    labels: List[svg_text]


# ---------- low-level helpers ----------

CANVAS_W = 800.0
CANVAS_H = 600.0

SELECTED_TOKEN = "__SELECTED__"   # what GPT uses to refer to the selected node


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


def _normalize_svg_snippet_string(s: Any) -> Optional[str]:
    if s is None:
        return None
    if not isinstance(s, str):
        s = str(s)

    s = s.strip()

    # Strip outer quotes if present
    if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
        s = s[1:-1].strip()

    # URL decode (Ion can double-encode)
    for _ in range(2):
        s2 = unquote(s)
        if s2 == s:
            break
        s = s2

    # Robust JSON-escaped XML cleanup
    if r'\"' in s:
        s = s.replace(r'\"', '"')

    s = s.replace(r"\n", "\n").replace(r"\t", "\t")

    if r"\\" in s:
        s = s.replace(r"\\", "\\")

    if "<svg" not in s.lower():
        return None
    return s


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


# ---------- helpers for start_svg array merging ----------

def _parse_viewbox(vb: str) -> Optional[Tuple[float, float, float, float]]:
    if not isinstance(vb, str):
        return None
    parts = [p for p in vb.replace(",", " ").split() if p.strip()]
    if len(parts) != 4:
        return None
    x, y, w, h = (
        _safe_float(parts[0]),
        _safe_float(parts[1]),
        _safe_float(parts[2]),
        _safe_float(parts[3]),
    )
    return (x, y, w, h)


def _inner_svg_children(svg_str: str) -> Tuple[List[ET.Element], Optional[Tuple[float, float, float, float]]]:
    root = ET.fromstring(svg_str)
    vb = _parse_viewbox(root.attrib.get("viewBox", ""))
    kids = [ET.fromstring(ET.tostring(ch, encoding="unicode")) for ch in list(root)]
    return kids, vb


def _merge_svg_array(start_svg: Any) -> Optional[str]:
    """
    Accepts:
      - list[str] of "<svg ...>...</svg>"
      - JSON string representing such a list
    Returns a single merged <svg> string (or None).
    """
    arr: Optional[List[str]] = None

    if isinstance(start_svg, list):
        arr = [str(x) for x in start_svg if isinstance(x, str) and "<svg" in x.lower()]
    elif isinstance(start_svg, str):
        s = start_svg.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                obj = json.loads(s)
                if isinstance(obj, list):
                    arr = [str(x) for x in obj if isinstance(x, str) and "<svg" in str(x).lower()]
            except Exception:
                arr = None

    if not arr:
        return None

    minx = miny = float("inf")
    maxx = maxy = float("-inf")

    merged_root = ET.Element("svg", {"xmlns": "http://www.w3.org/2000/svg"})
    diagram_root = ET.SubElement(merged_root, "g", {"id": "diagram-root"})
    edges_layer = ET.SubElement(diagram_root, "g", {"id": "edges-layer"})
    nodes_layer = ET.SubElement(diagram_root, "g", {"id": "nodes-layer"})

    for i, s in enumerate(arr):
        try:
            kids, vb = _inner_svg_children(s)
        except Exception:
            continue

        if vb is not None:
            x, y, w, h = vb
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x + w)
            maxy = max(maxy, y + h)

        wrapper = ET.Element("g", {"data-merged-from": str(i)})
        for ch in kids:
            wrapper.append(ch)

        has_node_shape = False
        for gg in wrapper.iter():
            if _local(gg.tag) == "g":
                for c in list(gg):
                    if _local(c.tag) in {"rect", "ellipse", "circle"}:
                        has_node_shape = True
                        break
            if has_node_shape:
                break

        if has_node_shape:
            nodes_layer.append(wrapper)
        else:
            edges_layer.append(wrapper)

    if minx == float("inf"):
        merged_root.attrib["viewBox"] = "0 0 800 600"
        merged_root.attrib["width"] = "800"
        merged_root.attrib["height"] = "600"
    else:
        w = max(1.0, maxx - minx)
        h = max(1.0, maxy - miny)
        merged_root.attrib["viewBox"] = f"{minx} {miny} {w} {h}"
        merged_root.attrib["width"] = "800"
        merged_root.attrib["height"] = "600"

    return ET.tostring(merged_root, encoding="unicode")


def _extract_starting_svg_any(p: Any) -> Optional[str]:
    """
    Finds starting SVG from:
      - direct "<svg ...>"
      - dict with start_svg/starting_svg/svg
      - list/JSON-list of svg strings (your start_svg)
    """
    if p is None:
        return None

    merged = _merge_svg_array(p)
    if merged:
        return merged

    if isinstance(p, dict):
        for k in ("start_svg", "starting_svg", "svg"):
            v = p.get(k)
            merged2 = _merge_svg_array(v)
            if merged2:
                return merged2
            if isinstance(v, str) and "<svg" in v.lower():
                return v
        return None

    if isinstance(p, str):
        s = p.strip()
        merged3 = _merge_svg_array(s)
        if merged3:
            return merged3
        if "<svg" in s.lower():
            return s

    return None


# ---------- parsing nodes from merged SVG ----------

def _parse_starting_svg_nodes(svg: str) -> List[svg_group]:
    """
    Parses node-ish groups from an existing SVG.

    IMPORTANT:
    - If node has data-id (builder output), preserve it EXACTLY to keep the network stable.
    - Only synthesize ids if missing.
    """
    try:
        root = ET.fromstring(svg)
    except Exception:
        return []

    out: List[svg_group] = []
    seen_ids: Dict[str, int] = {}

    def _uniq(base: str) -> str:
        base = re.sub(r"\s+", "", base.strip()) or "Node"
        base = re.sub(r"[^A-Za-z0-9_\-]", "", base) or "Node"
        n = seen_ids.get(base, 0)
        seen_ids[base] = n + 1
        return base if n == 0 else f"{base}_{n}"

    for g in root.iter():
        if _local(g.tag) != "g":
            continue

        cls = g.attrib.get("class", "")
        data_type = g.attrib.get("data-type", "")
        is_node_group = ("node" in cls.split()) or (str(data_type).lower() == "svg_group")

        if not is_node_group:
            has_shape = False
            has_text = False
            for ch in g.iter():
                t = _local(ch.tag)
                if t in {"rect", "ellipse", "circle"}:
                    has_shape = True
                if t == "text":
                    has_text = True
                if has_shape and has_text:
                    break
            if not (has_shape and has_text):
                continue

        # Prefer builder-style data-id
        node_id = g.attrib.get("data-id") or g.attrib.get("id") or g.attrib.get("data-uid")

        shape_el: Optional[ET.Element] = None
        labels: List[svg_text] = []

        for ch in list(g):
            t = _local(ch.tag)
            if shape_el is None and t in {"rect", "ellipse", "circle"}:
                shape_el = ch
            elif t == "text":
                labels.append(svg_text(text="".join(ch.itertext()).strip(), attrs=dict(ch.attrib)))

        if shape_el is None:
            for ch in g.iter():
                if _local(ch.tag) in {"rect", "ellipse", "circle"}:
                    shape_el = ch
                    break

        if not labels:
            for ch in g.iter():
                if _local(ch.tag) == "text":
                    labels.append(svg_text(text="".join(ch.itertext()).strip(), attrs=dict(ch.attrib)))

        # Preserve existing id EXACTLY if present; only synthesize if missing.
        if not node_id:
            best = None
            best_score = float("-inf")
            for lbl in labels:
                fs = _safe_float(lbl.attrs.get("font-size", 0), 0)
                ta = str(lbl.attrs.get("text-anchor", "")).lower()
                score = fs + (5.0 if ta == "middle" else 0.0)
                if lbl.text:
                    score += 1.0
                if score > best_score:
                    best_score = score
                    best = lbl.text
            node_id = _uniq(best or "Node")
        else:
            node_id = str(node_id).strip() or "Node"
            if node_id in seen_ids:
                node_id = _uniq(node_id)
            else:
                seen_ids[node_id] = 1

        shape_obj: Optional[svg_shape] = None
        if shape_el is not None:
            shape_obj = svg_shape(tag=_local(shape_el.tag), attrs=dict(shape_el.attrib))

        out.append(svg_group(id=str(node_id), kind="node", shape=shape_obj, labels=labels))

    return out


# ---------- geometry helpers ----------

def _bbox_for_node(g: svg_group) -> Optional[Tuple[float, float, float, float]]:
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


def _center_for_node(g: svg_group) -> Optional[Tuple[float, float]]:
    bb = _bbox_for_node(g)
    if not bb:
        return None
    x0, y0, x1, y1 = bb
    return ((x0 + x1) / 2.0, (y0 + y1) / 2.0)


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

    for lbl in g.labels:
        try:
            lbl.attrs["x"] = float(lbl.attrs.get("x", 0.0)) + dx
        except Exception:
            pass
        try:
            lbl.attrs["y"] = float(lbl.attrs.get("y", 0.0)) + dy
        except Exception:
            pass


def _overlaps(
    b1: Tuple[float, float, float, float],
    b2: Tuple[float, float, float, float],
    pad: float = 10.0,
) -> bool:
    x0, y0, x1, y1 = b1
    a0, b0, a1, b1_ = b2
    return not (x1 + pad <= a0 or a1 + pad <= x0 or y1 + pad <= b0 or b1_ + pad <= y0)


def _clamp_node_into_canvas(g: svg_group) -> None:
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


def _place_new_nodes_around_anchor(
    *,
    existing_nodes: List[svg_group],
    new_nodes: List[svg_group],
    anchor: svg_group,
) -> List[svg_group]:
    placed: List[svg_group] = []
    all_bbs: List[Tuple[float, float, float, float]] = []

    for g in existing_nodes:
        bb = _bbox_for_node(g)
        if bb:
            all_bbs.append(bb)

    anchor_center = _center_for_node(anchor) or (CANVAS_W / 2.0, CANVAS_H / 2.0)
    ax, ay = anchor_center

    base_r = 120.0
    ring_step = 90.0
    angles = [0, 45, 90, 135, 180, 225, 270, 315]

    for n in new_nodes:
        placed_ok = False

        for ring in range(0, 8):
            r = base_r + ring * ring_step
            for a_deg in angles:
                a = math.radians(a_deg)

                cx = ax + r * math.cos(a)
                cy = ay + r * math.sin(a)

                cur_c = _center_for_node(n)
                if cur_c:
                    dx = cx - cur_c[0]
                    dy = cy - cur_c[1]
                    _move_node(n, dx, dy)
                else:
                    continue

                _clamp_node_into_canvas(n)
                bb = _bbox_for_node(n)
                if not bb:
                    continue

                if any(_overlaps(bb, obb) for obb in all_bbs):
                    continue

                all_bbs.append(bb)
                placed.append(n)
                placed_ok = True
                break

            if placed_ok:
                break

        if not placed_ok:
            _clamp_node_into_canvas(n)
            bb = _bbox_for_node(n)
            if bb:
                all_bbs.append(bb)
            placed.append(n)

    return placed


# ---------- selection by coordinates only ----------

def _best_label_from_text_elems(text_elems: List[ET.Element]) -> str:
    best_txt = ""
    best_score = float("-inf")
    for t in text_elems:
        txt = "".join(t.itertext()).strip()
        if not txt:
            continue
        fs = _safe_float(t.attrib.get("font-size", 0), 0)
        ta = str(t.attrib.get("text-anchor", "")).lower()
        score = fs + (5.0 if ta == "middle" else 0.0) + 1.0
        if score > best_score:
            best_score = score
            best_txt = txt
    return best_txt


_NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"


def _center_from_svg_snippet_regex(svg_snippet: str) -> Optional[Tuple[float, float]]:
    if not isinstance(svg_snippet, str):
        return None

    m = re.search(r"<(ellipse|circle|rect)\b([^>]*)>", svg_snippet, flags=re.IGNORECASE)
    if not m:
        return None

    tag = m.group(1).lower()
    attrs = m.group(2)

    def get(attr: str) -> Optional[float]:
        mm = re.search(rf'\b{re.escape(attr)}\s*=\s*"({_NUM})"', attrs)
        return float(mm.group(1)) if mm else None

    if tag in ("ellipse", "circle"):
        cx = get("cx")
        cy = get("cy")
        if cx is None or cy is None:
            return None
        return (cx, cy)

    x = get("x") or 0.0
    y = get("y") or 0.0
    w = get("width")
    h = get("height")
    if w is None or h is None:
        return None
    return (x + w / 2.0, y + h / 2.0)


def _selected_hint_from_svg_snippet(svg_snippet: str) -> Tuple[str, Optional[Tuple[float, float]]]:
    m = re.search(r"<svg\b[\s\S]*?</svg>", svg_snippet, flags=re.IGNORECASE)
    if m:
        svg_snippet = m.group(0)

    try:
        root = ET.fromstring(svg_snippet)
    except Exception as e:
        works.msg(f"❌ selected_svg_object XML parse failed: {e}")
        works.msg(f"❌ selected_svg_object head repr: {repr(svg_snippet[:200])}")
        return ("", None)

    texts: List[ET.Element] = []
    for el in root.iter():
        if _local(el.tag) == "text":
            texts.append(el)

    label = _best_label_from_text_elems(texts)

    shape_el = None
    for el in root.iter():
        if _local(el.tag) in {"rect", "ellipse", "circle"}:
            shape_el = el
            break

    if shape_el is None:
        works.msg("❌ No rect/ellipse/circle found in selected_svg_object after parsing.")
        works.msg(f"❌ selected_svg_object root tag: {_local(root.tag)}")
        works.msg(f"❌ selected_svg_object tags seen: {[ _local(x.tag) for x in list(root.iter())[:25] ]}")
        return (label.strip(), None)

    tag = _local(shape_el.tag)
    try:
        if tag == "rect":
            x = float(shape_el.attrib.get("x", "0"))
            y = float(shape_el.attrib.get("y", "0"))
            w = float(shape_el.attrib.get("width", "0"))
            h = float(shape_el.attrib.get("height", "0"))
            center = (x + w / 2.0, y + h / 2.0)
        else:
            center = (float(shape_el.attrib.get("cx", "0")), float(shape_el.attrib.get("cy", "0")))
    except Exception as e:
        works.msg(f"❌ Failed computing center from {tag}: {e}")
        works.msg(f"❌ shape attrib: {shape_el.attrib}")
        return (label.strip(), None)

    return (label.strip(), center)


def _selected_center_from_object(selected_svg_object: Any) -> Optional[Tuple[float, float]]:
    if not (isinstance(selected_svg_object, str) and "<svg" in selected_svg_object.lower()):
        return None

    _, center = _selected_hint_from_svg_snippet(selected_svg_object)
    if center is not None:
        return center

    return _center_from_svg_snippet_regex(selected_svg_object)


def _find_anchor_node_by_center(
    existing_nodes: List[svg_group],
    center: Tuple[float, float],
) -> Optional[svg_group]:
    hx, hy = center

    containing: List[Tuple[float, svg_group]] = []
    for g in existing_nodes:
        bb = _bbox_for_node(g)
        if not bb:
            continue
        x0, y0, x1, y1 = bb
        if x0 <= hx <= x1 and y0 <= hy <= y1:
            area = max(1e-9, (x1 - x0) * (y1 - y0))
            containing.append((area, g))

    if containing:
        containing.sort(key=lambda t: t[0])
        return containing[0][1]

    best = None
    best_d2 = float("inf")
    for g in existing_nodes:
        c = _center_for_node(g)
        if not c:
            continue
        dx = c[0] - hx
        dy = c[1] - hy
        d2 = dx * dx + dy * dy
        if d2 < best_d2:
            best_d2 = d2
            best = g

    return best


# ---------- label centering for NEW nodes ----------

def _center_labels_on_shape(g: svg_group) -> None:
    """
    Ensure labels are centered on the node’s background shape.
    If multiple labels exist, stack them vertically around center.
    Applies ONLY to NEW nodes we create/insert (we preserve existing diagram).
    """
    c = _center_for_node(g)
    if not c or not g.labels:
        return
    cx, cy = c

    sizes = []
    for lbl in g.labels:
        sizes.append(_safe_float(lbl.attrs.get("font-size", 12), 12))
    fs = max(10.0, float(sum(sizes) / max(1, len(sizes))))
    line_h = fs * 1.2

    n = len(g.labels)
    y0 = cy - (line_h * (n - 1) / 2.0)

    for i, lbl in enumerate(g.labels):
        lbl.attrs["x"] = str(cx)
        lbl.attrs["y"] = str(y0 + i * line_h)
        lbl.attrs["text-anchor"] = "middle"
        lbl.attrs["dominant-baseline"] = "middle"
        if "font-size" not in lbl.attrs:
            lbl.attrs["font-size"] = str(int(round(fs)))
        if "font-family" not in lbl.attrs:
            lbl.attrs["font-family"] = "Arial, sans-serif"


# ---------- SVG post-process: snap all edge lines to centers ----------

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


# ---------- STAGE 0: selected text -> interaction paragraph ----------

INTERACTION_PARAGRAPH_SYSTEM = """
You write one short, concrete paragraph describing interactions between the entities named in the input text.

Rules:
- Use only the entities you can reasonably infer from the text (teams, systems, molecules, processes, roles).
- Describe who/what interacts with whom and why (handoffs, dependencies, signaling, regulation, data flow, etc.).
- Keep it 3–6 sentences.
- Do NOT output JSON.
- Do NOT use markdown.
- Output only the paragraph text.
"""


def _selected_text_from_anchor(anchor: svg_group) -> str:
    if not anchor.labels:
        return ""
    best = ""
    best_score = float("-inf")
    for lbl in anchor.labels:
        txt = (lbl.text or "").strip()
        if not txt:
            continue
        fs = _safe_float(lbl.attrs.get("font-size", 0), 0)
        ta = str(lbl.attrs.get("text-anchor", "")).lower()
        score = fs + (5.0 if ta == "middle" else 0.0) + 1.0
        if score > best_score:
            best_score = score
            best = txt
    return best.strip()


def _interaction_paragraph_from_text(text: str, *, model: str, temperature: float = 0.2) -> str:
    if not text.strip():
        return ""
    user = f"Text:\n{text}\n\nWrite the paragraph now."
    return _chat_call(
        model=model,
        system=INTERACTION_PARAGRAPH_SYSTEM,
        user=user,
        temperature=temperature,
        max_tokens=400,
    ).strip()


# ---------- STAGE 1: GPT → expansion plan (new nodes + new edges) ----------

EXPAND_SELECTED_SYSTEM = f"""
You are a precise diagram expander for SVG responsibility diagrams.

You are given:
- A list of EXISTING nodes (with bounding boxes / centers)
- The SELECTED node is identified ONLY by its coordinates (x,y) in the diagram.
- A user prompt describing how to EXPAND the selected item.

You MUST output ONLY a strict JSON object describing:
1) new nodes to add (ONLY new ones; do not repeat existing)
2) new edges to add

CRITICAL:
- You MUST refer to the selected node using the special token "{SELECTED_TOKEN}" (not an id).
- New edges may connect:
    - {SELECTED_TOKEN} <-> NewNodeId
    - NewNodeId <-> NewNodeId
  but all new connectivity must ultimately attach to {SELECTED_TOKEN}.
- Do NOT delete or modify any existing nodes.

STRICT OUTPUT:
{{
  "new_nodes": [
    {{
      "id": "ShortUniqueId",
      "kind": "node",
      "shape": {{ "tag": "rect", "attrs": {{ ... }} }},
      "labels": [ {{ "text": "2-4 words", "attrs": {{ ... }} }} ]
    }}
  ],
  "new_edges": [
    {{ "source": "{SELECTED_TOKEN} or NewId", "target": "{SELECTED_TOKEN} or NewId", "label": "Complete sentence." }}
  ]
}}

Rules:
- Every new node MUST be connected by at least one new edge.
- Use short ids (no spaces) and 2–4 word labels.
- Provide reasonable default styling for shapes/labels (fill, stroke, font-size).
- You may leave x/y/cx/cy approximate; placement will be overridden near the selected node.
"""


def _node_summary_for_gpt(nodes: List[svg_group]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for g in nodes:
        bb = _bbox_for_node(g)
        c = _center_for_node(g)
        label = ""
        if g.labels:
            for t in g.labels:
                if (t.text or "").strip():
                    label = (t.text or "").strip()
                    break
        out.append({"label_hint": label, "bbox": bb, "center": c})
    return out


def _coerce_groups_from_stage1_nodes(nodes_list: Any) -> List[svg_group]:
    out: List[svg_group] = []
    if not isinstance(nodes_list, list):
        return out
    for node in nodes_list:
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

        out.append(svg_group(id=node_id, kind=kind, shape=shape_obj, labels=label_objs))
    return out


def expand_selected_from_prompt(
    *,
    user_prompt: str,
    starting_svg: str,
    selected_center: Tuple[float, float],
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> Tuple[List[svg_group], List[Dict[str, str]]]:
    existing_nodes = _parse_starting_svg_nodes(starting_svg)
    existing_summary = _node_summary_for_gpt(existing_nodes)

    hx, hy = selected_center

    user_msg = f"""
User prompt (expansion instructions):
{user_prompt}

The selected node is the node in starting_svg that contains the point:
x={hx}, y={hy}

Existing nodes (geometry + label hints):
{json.dumps({"nodes": existing_summary}, indent=2)}

Return ONLY the strict JSON expansion object.
"""

    works.msg("🧱 Stage 1: requesting expansion plan (new nodes + new edges)…")
    content = _chat_call(
        model=model,
        system=EXPAND_SELECTED_SYSTEM,
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

    if not isinstance(data, dict):
        raise RuntimeError("Stage 1: Expected JSON object.")

    new_nodes_raw = data.get("new_nodes", [])
    new_edges_raw = data.get("new_edges", [])

    new_nodes = _coerce_groups_from_stage1_nodes(new_nodes_raw)

    edges: List[Dict[str, str]] = []
    if isinstance(new_edges_raw, list):
        for e in new_edges_raw:
            if not isinstance(e, dict):
                continue
            src = str(e.get("source") or "").strip()
            tgt = str(e.get("target") or "").strip()
            lbl = str(e.get("label") or "").strip()
            if not src or not tgt or not lbl:
                continue
            edges.append({"source": src, "target": tgt, "label": lbl})

    allowed_ids = {SELECTED_TOKEN} | {n.id for n in new_nodes}
    edges = [e for e in edges if e["source"] in allowed_ids and e["target"] in allowed_ids]

    incident: Dict[str, int] = {n.id: 0 for n in new_nodes}
    for e in edges:
        if e["source"] in incident:
            incident[e["source"]] += 1
        if e["target"] in incident:
            incident[e["target"]] += 1
    new_nodes = [n for n in new_nodes if incident.get(n.id, 0) > 0]

    return new_nodes, edges


# ---------- Inject new nodes/edges into existing SVG ----------

def _ensure_layers(root: ET.Element) -> Tuple[ET.Element, ET.Element, ET.Element]:
    if _local(root.tag) != "svg":
        raise RuntimeError("starting_svg root is not <svg>")

    diagram_root = None
    for g in list(root):
        if _local(g.tag) == "g" and g.attrib.get("id") == "diagram-root":
            diagram_root = g
            break
    if diagram_root is None:
        diagram_root = ET.SubElement(root, "g", {"id": "diagram-root"})

    edges_layer = None
    nodes_layer = None
    for g in list(diagram_root):
        if _local(g.tag) == "g" and g.attrib.get("id") == "edges-layer":
            edges_layer = g
        if _local(g.tag) == "g" and g.attrib.get("id") == "nodes-layer":
            nodes_layer = g

    if edges_layer is None:
        edges_layer = ET.SubElement(diagram_root, "g", {"id": "edges-layer"})
    if nodes_layer is None:
        nodes_layer = ET.SubElement(diagram_root, "g", {"id": "nodes-layer"})

    return diagram_root, edges_layer, nodes_layer


def _next_edge_id(root: ET.Element) -> str:
    max_n = -1
    for g in root.iter():
        if _local(g.tag) != "g":
            continue
        if "edge" not in g.attrib.get("class", "").split():
            continue
        eid = g.attrib.get("data-eid", "")
        m = re.match(r"e(\d+)$", eid)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"e{max_n + 1}"


def _group_to_svg_node_element(g: svg_group) -> ET.Element:
    node_g = ET.Element("g", {"class": "node", "data-id": g.id})

    if g.shape:
        ET.SubElement(node_g, g.shape.tag, {str(k): str(v) for k, v in g.shape.attrs.items()})
    else:
        sh = ET.SubElement(
            node_g,
            "rect",
            {
                "x": "50",
                "y": "50",
                "width": "140",
                "height": "60",
                "rx": "10",
                "fill": "#ffffff",
                "stroke": "#111111",
                "stroke-width": "1.5",
            },
        )
        g.shape = svg_shape(tag="rect", attrs=dict(sh.attrib))

    if not g.labels:
        c = _center_for_node(g) or (100.0, 80.0)
        g.labels = [
            svg_text(
                text=g.id,
                attrs={
                    "x": str(c[0]),
                    "y": str(c[1]),
                    "text-anchor": "middle",
                    "dominant-baseline": "middle",
                    "font-size": "12",
                    "font-family": "Arial, sans-serif",
                    "fill": "#111111",
                },
            )
        ]

    for lbl in g.labels:
        t = ET.SubElement(node_g, "text", {str(k): str(v) for k, v in lbl.attrs.items()})
        t.text = lbl.text

    return node_g


def _make_edge_element(eid: str, source: str, target: str, label: str) -> ET.Element:
    edge_g = ET.Element(
        "g",
        {
            "class": "edge",
            "data-eid": eid,
            "data-source": source,
            "data-target": target,
        },
    )
    ET.SubElement(edge_g, "g", {"class": "endpoint source", "data-ref": source})
    ET.SubElement(edge_g, "g", {"class": "endpoint target", "data-ref": target})

    ET.SubElement(
        edge_g,
        "line",
        {
            "x1": "0",
            "y1": "0",
            "x2": "0",
            "y2": "0",
            "stroke": "#111111",
            "stroke-width": "1.2",
        },
    )

    ET.SubElement(
        edge_g,
        "text",
        {
            "x": "10",
            "y": "10",
            "font-size": "11",
            "font-family": "Arial, sans-serif",
            "fill": "#111111",
        },
    ).text = label

    return edge_g


def inject_expansion_into_svg(
    *,
    starting_svg: str,
    existing_nodes: List[svg_group],
    selected_id: str,
    new_nodes: List[svg_group],
    new_edges: List[Dict[str, str]],
) -> str:
    try:
        root = ET.fromstring(starting_svg)
    except Exception as e:
        raise RuntimeError(f"starting_svg is not valid XML/SVG: {e}")

    root.attrib.setdefault("xmlns", "http://www.w3.org/2000/svg")
    root.attrib["width"] = root.attrib.get("width", "800") or "800"
    root.attrib["height"] = root.attrib.get("height", "600") or "600"
    root.attrib["viewBox"] = root.attrib.get("viewBox", "0 0 800 600") or "0 0 800 600"

    _, edges_layer, nodes_layer = _ensure_layers(root)

    anchor = next((g for g in existing_nodes if g.id == selected_id), None)
    if anchor is None:
        raise RuntimeError("Selected node not found after parsing (unexpected).")

    placed_new_nodes = _place_new_nodes_around_anchor(
        existing_nodes=existing_nodes,
        new_nodes=new_nodes,
        anchor=anchor,
    )

    # NEW: ensure labels are centered on background shapes for inserted nodes
    for g in placed_new_nodes:
        _center_labels_on_shape(g)

    for g in placed_new_nodes:
        nodes_layer.append(_group_to_svg_node_element(g))

    for e in new_edges:
        eid = _next_edge_id(root)
        edges_layer.append(_make_edge_element(eid, e["source"], e["target"], e["label"]))

    svg_out = ET.tostring(root, encoding="unicode")
    return _snap_edge_lines_to_nodes(svg_out)


# ---------- Orchestrator ----------

def run_svg_expander(
    user_prompt: str,
    *,
    starting_svg: str,
    selected_svg_object: Any,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> Dict[str, Any]:
    works.msg("🔗 SVG expand-selected pipeline starting…")

    existing_nodes = _parse_starting_svg_nodes(starting_svg)
    if not existing_nodes:
        raise RuntimeError("starting_svg parsed zero nodes; cannot expand selection.")

    selected_svg_object = _normalize_svg_snippet_string(selected_svg_object)
    if selected_svg_object is None:
        raise RuntimeError("selected_svg_object must be an SVG snippet string.")

    sel_center = _selected_center_from_object(selected_svg_object)
    if sel_center is None:
        raise RuntimeError("selected_svg_object SVG snippet had no rect/ellipse/circle to derive coordinates.")

    anchor = _find_anchor_node_by_center(existing_nodes, sel_center)
    if anchor is None:
        raise RuntimeError("Could not resolve selected component by geometry.")

    selected_id = anchor.id

    # -------- Stage 0: selected text -> interaction paragraph --------
    selected_text = _selected_text_from_anchor(anchor)
    works.msg(f"🧠 Stage 0: selected text = {selected_text!r}")

    interaction_paragraph = _interaction_paragraph_from_text(
        selected_text,
        model=model,
        temperature=temperature,
    )

    expanded_user_prompt = (
        (interaction_paragraph.strip() + "\n\n" if interaction_paragraph.strip() else "")
        + str(user_prompt or "").strip()
    ).strip()

    # -------- Stage 1: expansion plan --------
    new_nodes, new_edges = expand_selected_from_prompt(
        user_prompt=expanded_user_prompt,
        starting_svg=starting_svg,
        selected_center=sel_center,
        model=model,
        temperature=temperature,
    )

    # Map GPT's SELECTED_TOKEN -> selected_id
    remapped_edges: List[Dict[str, str]] = []
    for e in new_edges:
        src = selected_id if e["source"] == SELECTED_TOKEN else e["source"]
        tgt = selected_id if e["target"] == SELECTED_TOKEN else e["target"]
        remapped_edges.append({"source": src, "target": tgt, "label": e["label"]})

    modified_svg = inject_expansion_into_svg(
        starting_svg=starting_svg,
        existing_nodes=existing_nodes,
        selected_id=selected_id,
        new_nodes=new_nodes,
        new_edges=remapped_edges,
    )

    return {
        "svg": modified_svg,
        "selected_center": {"x": sel_center[0], "y": sel_center[1]},
        "selected_internal_id": selected_id,
        "selected_text": selected_text,
        "interaction_paragraph": interaction_paragraph,
        "added_node_ids": [n.id for n in new_nodes],
        "added_edges": remapped_edges,
        "diagnostics": "NO_ISSUES_DETECTED",
    }


# ---------- Ion entry ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading SVG expand-selected builder…")

    def _maybe_unquote(x, rounds: int = 2):
        if not isinstance(x, str):
            return x
        s = x
        for _ in range(rounds):
            s2 = unquote(s)
            if s2 == s:
                break
            s = s2
        return s

    def _load_if_svg_file(x):
        if not isinstance(x, str):
            return x
        try:
            p = Path(x)
            if p.exists() and p.is_file() and p.suffix.lower() == ".svg":
                return p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            pass
        return x

    # param(1): user_prompt (required)
    try:
        user_prompt = works.param(1)
        if not user_prompt:
            raise RuntimeError("Ion: param(1) required (user prompt).")
        user_prompt = str(user_prompt)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    # param(2): starting svg object wrapper {svg: "..."}
    try:
        starting_svgob = works.param(2)
        starting_svg = _load_if_svg_file(_maybe_unquote(starting_svgob["svg"]))
    except Exception:
        raise RuntimeError("Ion: could not find starting_svg/start_svg in params; no '<svg>' or svg-array detected.")

    # param(3): selected svg object wrapper {svg: "..."}
    try:
        selected_svg_objectob = works.param(3)
        selected_svg_object = _load_if_svg_file(_maybe_unquote(selected_svg_objectob["svg"]))
    except Exception:
        raise RuntimeError("Ion: could not find selected_svg_object in params; no '<svg>' detected.")

    model = default_model
    temperature = 0.2

    if starting_svg is None:
        raise RuntimeError("Ion: could not find starting_svg/start_svg in params; no '<svg>' or svg-array detected.")

    try:
        artifact = run_svg_expander(
            user_prompt=user_prompt,
            starting_svg=str(starting_svg),
            selected_svg_object=selected_svg_object,
            model=model,
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0

    except Exception as err:
        works.resolve(
            {
                "status": "❌ error",
                "error": str(err),
                "starting_svg": starting_svg,
                "selected_svg_object": selected_svg_object,
                "where": "svg-expand-selected",
            }
        )
        return 1


if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

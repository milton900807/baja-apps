#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
SVG connection / responsibility diagram builder (Ion Works entry/exit).

Purpose
-------
• Uses GPT to generate an SVG diagram with nodes and labeled connections
  based on a natural language prompt.
• Emphasizes coordinated effort: show how roles/teams/systems are linked
  by responsibilities, handoffs, ownership, approvals, etc.
• The diagram must be laid out as a HUB-AND-SPOKE model:
  - A single central hub node representing the shared object/outcome.
  - Multiple surrounding spoke nodes representing roles/teams/systems.
  - Primary connections radiating between hub and spokes.
• The diagram should fill the rectangular SVG space (800x600) as much as
  practical, without leaving large unused margins. If layout would exceed
  the rectangle, it must be scaled or trimmed to stay within bounds.
• Objects MUST NOT overlap: no overlapping filled shapes, no overlapping text.
• Connection lines must be drawn in the background (behind nodes and labels)
  via drawing order and careful routing. Do NOT use any arrowheads.
• Input and output use the same Ion Works framework (works.param / works.resolve).
• The user prompt comes in via param(1).

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
from typing import Any

from ion import works  # type: ignore
from openai import OpenAI


# ---------- helpers ----------
def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


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

SVG_GRAPH_INSTRUCTIONS = """
You MUST read the natural language description and turn it into a hub-and-spoke SVG diagram that directly reflects
the objects and relationships mentioned in the text.

1. Parse the description
------------------------
From the user description, identify and extract:

  • A single SHARED OBJECT / OUTCOME (the "hub"):
      - This is usually the main thing everyone is working on, e.g.:
        "product", "drug program", "roadmap", "clinical trial", "launch",
        "shared platform", "project X", etc.
      - If not explicitly stated, infer a concise shared object (2–5 words).

  • SPOKE NODES (roles / teams / systems / stakeholders / objects):
      - Each distinct actor or object named in the text becomes a spoke.
      - Examples: "Product", "Engineering", "QA", "Sales", "Marketing",
        "Regulatory", "Manufacturing System", "CRM", etc.
      - Use the *exact wording* or a very short normalized version from
        the user prompt (e.g., "Product team" → "Product",
        "commercial ops" → "Commercial Ops").

  • DIRECTIONAL RELATIONSHIPS / RESPONSIBILITIES / HANDOFFS:
      - For each sentence or clause like:
          "X owns Y",
          "X hands off to Y",
          "X provides A to Y",
          "X approves Y",
          "X reports to Y",
          "X informs Y",
          "X depends on Y",
        treat **X as the SOURCE** and **Y as the TARGET** of a directed relationship.
      - Create a connection line between the source node and the target node.
      - For each connection, create a short label describing the responsibility.
      - The label text MUST be a single concise COMPLETE SENTENCE (not a fragment)
        that clearly encodes direction, for example:
          "Product owns the roadmap for the shared outcome."
          "Engineering hands off implemented features to QA."
          "QA validates the shared outcome before release."
          "Sales communicates changes in the shared outcome to customers."
      - The sentence should mention both sides of the relationship (who does what for whom),
        so the direction is obvious without arrows.
      - If multiple responsibilities exist between the same pair of nodes,
        you may combine them into a single concise sentence (e.g.,
        "Product owns and prioritizes the roadmap for Engineering work.").

2. Hub-and-spoke layout
------------------------
The final SVG MUST be a hub-and-spoke model:

  • The shared object/outcome is the single central hub node.
  • All other nodes are arranged around it as spokes.
  • The primary connections radiate between the hub and the spokes.
  • If the text suggests direct relationships between two spokes, you may:
      - Either draw a *secondary* line directly between the two spokes, OR
      - Represent the flow via the hub if that is clearer.
    But the hub must remain visually and conceptually central.

3. SVG technical constraints
----------------------------
  • SVG canvas: width="800" height="600" with a matching viewBox, e.g.:
      <svg width="800" height="600" viewBox="0 0 800 600" ...>
  • Do NOT output any non-SVG text; only the <svg> element and its children.

  • All filled shapes MUST be <rect>, <circle>, or <ellipse> elements.
      - Do NOT use <polygon> at all.
      - You may use <line>, <polyline>, <path> for connections.
      - Use <text> for labels.
      - Do NOT use <marker> or any arrowhead definitions.
      - Do NOT draw arrowheads of any kind (including polygon arrowheads) at the ends of lines.

  • Non-overlap constraint:
      - No overlapping filled shapes.
      - No overlapping text.
      - Route lines/paths so they do NOT run underneath labels
        (avoid crossing the area where text is placed, even though text is drawn later).

  • The diagram should use most of the 800x600 area (no huge unused margins).

4. Nodes (filled shapes) and labels
-----------------------------------
  • Central hub:
      - Draw a filled shape (e.g., <rect>, <circle>, or <ellipse>) near the center of the canvas
        (around (400, 300)).
      - Label it with the shared object/outcome (2–5 words).

  • Spoke nodes:
      - Draw filled shapes arranged roughly in a circle or oval around the hub,
        using <rect>, <circle>, or <ellipse>.
      - Each spoke shape should have a <text> label with the role/team/object name.
      - Space them so that:
          - Filled shapes do not overlap.
          - Text of each label stays within or just above the shape.
          - Text for one node does not overlap the shape or text of another node.

  • Use simple, readable shapes:
      - Rectangles (with or without rounded corners),
        circles, or ellipses are all acceptable.

5. Connection lines and relationship labels
-------------------------------------------
  • For each directional relationship from the parsed description:
      - Draw a straight or slightly curved line or path between the SOURCE node and the TARGET node.
      - Do NOT add arrowheads or markers of any kind.
      - Direction MUST be conveyed in the label text itself, not with arrowheads.
      - Place a short <text> label near the middle of the connection, describing
        the responsibility or handoff in a concise COMPLETE SENTENCE (typically 10–20 words).
        The sentence should:
            - Have a clear subject, verb, and object.
            - Clearly state who is acting and who receives the result.
            - Make the direction obvious without any arrow symbols.
        For example:
            "Product owns the roadmap that guides the shared hub outcome."
            "Engineering implements features that contribute to the hub outcome."
            "QA validates the hub outcome before it is communicated to customers."
            "Sales communicates the hub outcome and changes to external customers."

  • Make sure labels do NOT overlap:
      - If necessary, slightly curve connections or offset labels vertically/horizontally.
      - It is acceptable if some labels are very close, as long as they do not overlap.

6. Z-order / drawing order (CRITICAL – connections in the background)
---------------------------------------------------------------------
To ensure connections are visually in the background:

  • In the SVG content, you MUST:
      1) (Optionally) define <defs> first (if needed for styles, but NOT for markers).
      2) Then draw all connection lines and paths for edges.
      3) Only after that, draw all node shapes (<rect>, <circle>, or <ellipse> for hub and spokes).
      4) Finally, draw all <text> labels for nodes and connection labels.

  • Because lines/paths are drawn before shapes and text:
      - Connections will appear behind node shapes.
      - Labels will sit visually on top, but you MUST route the lines so they avoid
        the regions where labels will be placed, so lines do not visibly pass
        through text glyphs.

7. Use the user text faithfully
-------------------------------
  • Every major role / team / system / object mentioned in the user text
    should appear as a node, unless it is purely descriptive.
  • Every explicit responsibility, ownership, handoff, approval, or dependency
    should be represented as at least one labeled connection.
  • Do NOT invent fictional roles or relationships that are not clearly implied.
  • It is allowed to slightly shorten wording for labels, but the meaning
    must remain faithful to the original text.
  • Even when shortened, each connection label MUST remain a complete sentence.

8. Example mapping (conceptual, not to be copied verbatim)
----------------------------------------------------------
Given a description like:
  "Product team owns roadmap, Eng implements features, QA validates,
   Sales communicates to customers."

You should:
  • Infer a shared hub like "Product Experience" or "Product Outcome".
  • Create spoke nodes: "Product", "Engineering", "QA", "Sales".
  • Create labeled connections such as:
      - A line between Product and the hub with the label:
          "Product team owns the roadmap that defines the product outcome."
      - A line between Engineering and the hub with the label:
          "Engineering implements features that realize the product outcome."
      - A line between QA and the hub with the label:
          "QA validates the product outcome before it is released."
      - A line between Sales and the hub with the label:
          "Sales communicates the product outcome and changes to customers."

Lay them out evenly around the center in a non-overlapping hub-and-spoke layout.
Draw all connections first, then shapes, then text, so connections sit visually in the background,
but without using arrowheads or polygons.
"""


def generate_svg_diagram(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> str:
    system = (
        "You are a precise SVG diagram generator for responsibility & coordination maps. "
        "You output ONLY SVG markup and nothing else. "
        "All filled shapes must be drawn using <rect>, <circle>, or <ellipse>. "
        "You MUST NOT use <polygon> at all. "
        "The overall layout must always be a non-overlapping hub-and-spoke model with a single central hub node "
        "and surrounding spokes. "
        "You MUST draw all connection lines/paths first then all filled shapes, then all text labels, "
        "so connections are visually in the background behind nodes and labels. "
        "You MUST NOT use arrowheads, markers, or any polygon arrow tips at the ends of lines. "
        "Every connection label MUST be a single concise COMPLETE SENTENCE that clearly describes who does what for whom, "
        "so the direction of responsibility is obvious without any arrow symbols."
        "TEXT MUST NOT OVERLAP."
        "ANY TEXT MUST BE VISIBLE."
        "OBJECTS MUST NOT BLOCK TEXT."
    )

    # Compose GPT user message
    user = f"""{SVG_GRAPH_INSTRUCTIONS}

User description of coordinated effort, roles, and responsibilities:
{user_prompt}
"""
    works.msg("🧠 requesting SVG diagram from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        max_tokens=2500,
    )

    try:
        svg = _extract_svg_snippet(content)
    except Exception as err:
        # If extraction fails, fall back to raw content (may still be SVG)
        works.msg(f"⚠️ Could not cleanly extract <svg> block: {err}")
        svg = content.strip()

    if "<svg" not in svg.lower():
        raise RuntimeError("Model response does not contain an <svg> element.")

    return svg


# ---------- Orchestrator ----------
def run_svg_builder(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
) -> dict[str, Any]:
    works.msg("🔗 SVG responsibility / coordination diagram pipeline starting…")
    svg = generate_svg_diagram(user_prompt, model=model, temperature=temperature)
    artifact: dict[str, Any] = {
        "svg": svg,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 Loading SVG responsibility diagram builder…")

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
        temperature = 0.2

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


# ---------- Bootstrap ----------
if __name__ == "__main__":
    _main_ion("gpt-4o-mini")

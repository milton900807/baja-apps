#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

DEFAULT_WIDTH = int(os.getenv("SVG_DEFAULT_WIDTH", "2048"))
DEFAULT_HEIGHT = int(os.getenv("SVG_DEFAULT_HEIGHT", "2048"))
DEFAULT_REFINE_PASSES = int(os.getenv("SVG_REFINE_PASSES", "1"))


def build_scene_plan_schema() -> Dict[str, Any]:
    return {
        "name": "svg_scene_plan",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "style_summary": {"type": "string"},
                "background": {"type": "string"},
                "composition": {"type": "string"},
                "detail_strategy": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "objects": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "role": {"type": "string"},
                            "placement": {"type": "string"},
                            "scale": {"type": "string"},
                            "silhouette": {"type": "string"},
                            "internal_details": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "surface_details": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "vector_primitives": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": [
                            "name",
                            "role",
                            "placement",
                            "scale",
                            "silhouette",
                            "internal_details",
                            "surface_details",
                            "vector_primitives",
                        ],
                    },
                },
            },
            "required": [
                "title",
                "description",
                "style_summary",
                "background",
                "composition",
                "detail_strategy",
                "objects",
            ],
        },
    }


def build_svg_schema() -> Dict[str, Any]:
    return {
        "name": "svg_generation_result",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "width": {"type": "integer"},
                "height": {"type": "integer"},
                "svg": {"type": "string"},
            },
            "required": ["title", "description", "width", "height", "svg"],
        },
    }


def build_svg_review_schema() -> Dict[str, Any]:
    return {
        "name": "svg_review_result",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "needs_revision": {"type": "boolean"},
                "issues": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "revision_brief": {"type": "string"},
            },
            "required": ["needs_revision", "issues", "revision_brief"],
        },
    }


def build_svg_repair_schema() -> Dict[str, Any]:
    return {
        "name": "svg_repair_result",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "width": {"type": "integer"},
                "height": {"type": "integer"},
                "svg": {"type": "string"},
            },
            "required": ["title", "description", "width", "height", "svg"],
        },
    }


def extract_svg(svg_text: str) -> str:
    svg_text = (svg_text or "").strip()
    svg_text = re.sub(r"^```(?:svg|xml)?\s*", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"\s*```$", "", svg_text)

    match = re.search(r"<svg\b[\s\S]*?</svg>", svg_text, flags=re.IGNORECASE)
    if not match:
        raise ValueError("Model output did not contain a valid <svg>...</svg> block")

    return match.group(0).strip()


def enforce_svg_dimensions(svg_text: str, width: int, height: int) -> str:
    svg_text = extract_svg(svg_text)

    def _replace_or_add_attr(tag: str, name: str, value: str) -> str:
        pattern = rf'(\b{name}\s*=\s*")[^"]*(")'
        if re.search(pattern, tag, flags=re.IGNORECASE):
            return re.sub(
                pattern,
                lambda m: f'{m.group(1)}{value}{m.group(2)}',
                tag,
                flags=re.IGNORECASE,
            )
        return tag[:-1] + f' {name}="{value}">'

    open_tag_match = re.search(r"<svg\b[^>]*>", svg_text, flags=re.IGNORECASE)
    if not open_tag_match:
        raise ValueError("Opening <svg> tag not found")

    open_tag = open_tag_match.group(0)
    open_tag = _replace_or_add_attr(open_tag, "width", str(width))
    open_tag = _replace_or_add_attr(open_tag, "height", str(height))
    open_tag = _replace_or_add_attr(open_tag, "viewBox", f"0 0 {width} {height}")

    if not re.search(r'\bxmlns\s*=', open_tag, flags=re.IGNORECASE):
        open_tag = open_tag[:-1] + ' xmlns="http://www.w3.org/2000/svg">'

    if not re.search(r'\bpreserveAspectRatio\s*=', open_tag, flags=re.IGNORECASE):
        open_tag = open_tag[:-1] + ' preserveAspectRatio="xMidYMid meet">'

    svg_text = svg_text[:open_tag_match.start()] + open_tag + svg_text[open_tag_match.end():]
    return svg_text


def svg_uses_forbidden_primitives(svg_text: str) -> bool:
    svg_text = extract_svg(svg_text)
    forbidden_patterns = [
        r"<rect\b",
        r"<circle\b",
        r"<ellipse\b",
    ]
    return any(re.search(pattern, svg_text, flags=re.IGNORECASE) for pattern in forbidden_patterns)


def enforce_no_basic_shape_primitives(svg_text: str) -> str:
    svg_text = extract_svg(svg_text)
    if svg_uses_forbidden_primitives(svg_text):
        raise ValueError("Generated SVG used forbidden primitives (<rect>, <circle>, or <ellipse>)")
    return svg_text


def get_client() -> "OpenAI":
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=OPENAI_API_KEY)


def json_schema_response(
    client: "OpenAI",
    *,
    model: str,
    instructions: str,
    input_text: str,
    schema: Dict[str, Any],
) -> Dict[str, Any]:
    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=input_text,
        text={
            "format": {
                "type": "json_schema",
                "name": schema["name"],
                "schema": schema["schema"],
                "strict": True,
            }
        },
    )
    return json.loads(response.output_text)


def create_scene_plan(
    client: "OpenAI",
    prompt: str,
    width: int,
    height: int,
) -> Dict[str, Any]:
    schema = build_scene_plan_schema()
    instructions = f"""
You are planning a detailed SVG illustration before it is drawn.

Return only valid JSON matching the schema.

Goals:
- Interpret the user prompt into a rich scene plan for a high-resolution SVG.
- Be specific about object structure, silhouette, internal linework, and small features.
- Favor detail-rich vector construction over simplistic icon-like output.
- Use the full {width}x{height} canvas effectively.
- Make each important object visually descriptive and not under-specified.
- Think in layers, grouped objects, and scalable SVG primitives.
- Do not rely on rectangles, circles, or ellipses as design primitives.
- Prefer paths, polygons, polylines, clipping paths, masks, reusable defs, and layered shapes.
- If the prompt is simple, still make the main subject visually rich and polished.
"""
    input_text = (
        f"Canvas size: {width}x{height}\n"
        f"User prompt:\n{prompt}\n\n"
        "Produce a high-detail scene plan."
    )
    return json_schema_response(
        client,
        model=OPENAI_MODEL,
        instructions=instructions,
        input_text=input_text,
        schema=schema,
    )


def repair_svg_remove_basic_primitives(
    client: "OpenAI",
    svg: str,
    width: int,
    height: int,
    title: str = "",
    description: str = "",
) -> Dict[str, Any]:
    schema = build_svg_repair_schema()

    instructions = f"""
You repair an existing SVG.

Return only valid JSON matching the schema.

Hard requirements:
- Remove all <rect>, <circle>, and <ellipse> elements.
- Replace them with equivalent path, polygon, or polyline constructions.
- Preserve the overall composition, detail, and style as much as possible.
- Keep the SVG self-contained and valid.
- Do not use JavaScript, external assets, or raster images.
- Keep or improve visual fidelity.
- Output a complete SVG sized for {width}x{height}.
"""
    truncated_svg = extract_svg(svg)[:26000]

    input_text = (
        f"Canvas size: {width}x{height}\n\n"
        f"Current title: {title}\n"
        f"Current description: {description}\n\n"
        "Rewrite this SVG so it contains no <rect>, <circle>, or <ellipse>. "
        "Use only paths, polygons, polylines, groups, defs, masks, gradients, and clipping paths.\n\n"
        f"SVG:\n{truncated_svg}"
    )

    data = json_schema_response(
        client,
        model=OPENAI_MODEL,
        instructions=instructions,
        input_text=input_text,
        schema=schema,
    )

    out_width = max(int(data.get("width", width) or width), width)
    out_height = max(int(data.get("height", height) or height), height)
    data["width"] = out_width
    data["height"] = out_height
    data["svg"] = enforce_svg_dimensions(data.get("svg", ""), out_width, out_height)
    data["svg"] = enforce_no_basic_shape_primitives(data["svg"])
    return data


def generate_svg_from_plan(
    client: "OpenAI",
    prompt: str,
    plan: Dict[str, Any],
    width: int,
    height: int,
) -> Dict[str, Any]:
    schema = build_svg_schema()
    instructions = f"""
You generate standalone SVG images from a user prompt plus a scene plan.

Return only valid JSON matching the schema.

Rules:
- The svg field must contain a complete, self-contained SVG string.
- Do not wrap the SVG in markdown fences.
- The SVG must begin with <svg and end with </svg>.
- Use only inline SVG markup. No JavaScript, no external assets, no remote references.
- Produce a richly detailed, high-resolution SVG suitable for {width}x{height}.
- Fill the canvas thoughtfully.
- Use layered groups, paths, gradients, masks, clipping paths, symbols, defs, and reusable structures when helpful.
- Avoid raster image embeddings.
- Preserve object detail from the plan: silhouettes, interior features, small accents, repeating structures, and secondary forms.
- Do not reduce everything to a few basic shapes unless the prompt explicitly asks for minimalism.
- The SVG must not contain <rect>, <circle>, or <ellipse>.
- Do not use oval-like primitive elements. If you need those forms, construct them using paths or polygons.
- Even backgrounds and framing elements must be built without <rect>.
- Ensure the composition feels complete rather than sparse.
- Prefer clean, valid SVG markup.
"""
    input_text = (
        f"Canvas size: {width}x{height}\n\n"
        f"User prompt:\n{prompt}\n\n"
        f"Scene plan JSON:\n{json.dumps(plan, ensure_ascii=False, indent=2)}\n\n"
        "Generate the final SVG now."
    )

    data = json_schema_response(
        client,
        model=OPENAI_MODEL,
        instructions=instructions,
        input_text=input_text,
        schema=schema,
    )

    out_width = max(int(data.get("width", width) or width), width)
    out_height = max(int(data.get("height", height) or height), height)
    data["width"] = out_width
    data["height"] = out_height
    data["svg"] = enforce_svg_dimensions(data.get("svg", ""), out_width, out_height)

    if svg_uses_forbidden_primitives(data["svg"]):
        repaired = repair_svg_remove_basic_primitives(
            client,
            svg=data["svg"],
            width=out_width,
            height=out_height,
            title=data.get("title", ""),
            description=data.get("description", ""),
        )
        return repaired

    data["svg"] = enforce_no_basic_shape_primitives(data["svg"])
    return data


def review_svg_detail(
    client: "OpenAI",
    prompt: str,
    plan: Dict[str, Any],
    svg: str,
    width: int,
    height: int,
) -> Dict[str, Any]:
    schema = build_svg_review_schema()
    instructions = f"""
You review an SVG for object detail, completeness, and primitive restrictions.

Return only valid JSON matching the schema.

Look for:
- missing secondary object details
- overly simplified silhouettes
- weak internal structure
- sparse empty composition
- objects that do not fully reflect the prompt
- forbidden primitive usage: <rect>, <circle>, <ellipse>
- opportunities to enrich vector detail without making the SVG invalid

Be strict but practical.
"""
    truncated_svg = svg[:20000]
    input_text = (
        f"Canvas size: {width}x{height}\n\n"
        f"User prompt:\n{prompt}\n\n"
        f"Scene plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}\n\n"
        f"SVG to review:\n{truncated_svg}"
    )
    return json_schema_response(
        client,
        model=OPENAI_MODEL,
        instructions=instructions,
        input_text=input_text,
        schema=schema,
    )


def revise_svg(
    client: "OpenAI",
    prompt: str,
    plan: Dict[str, Any],
    svg: str,
    review: Dict[str, Any],
    width: int,
    height: int,
) -> Dict[str, Any]:
    schema = build_svg_schema()
    instructions = f"""
You revise an existing SVG to increase object detail and completeness.

Return only valid JSON matching the schema.

Rules:
- Preserve the overall concept and valid SVG structure.
- Improve object richness, internal linework, secondary forms, surface detail, and composition density where appropriate.
- Do not introduce JavaScript, external assets, or raster images.
- Keep the SVG self-contained and valid.
- Maintain or improve visual clarity while increasing detail.
- The SVG must not contain <rect>, <circle>, or <ellipse>.
- Do not use oval-like primitives. Build all such forms using paths or polygons.
- Use the revision brief and issues list directly.
"""
    truncated_svg = svg[:26000]
    input_text = (
        f"Canvas size: {width}x{height}\n\n"
        f"User prompt:\n{prompt}\n\n"
        f"Scene plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}\n\n"
        f"Review:\n{json.dumps(review, ensure_ascii=False, indent=2)}\n\n"
        f"Current SVG:\n{truncated_svg}\n\n"
        "Revise the SVG."
    )

    data = json_schema_response(
        client,
        model=OPENAI_MODEL,
        instructions=instructions,
        input_text=input_text,
        schema=schema,
    )

    out_width = max(int(data.get("width", width) or width), width)
    out_height = max(int(data.get("height", height) or height), height)
    data["width"] = out_width
    data["height"] = out_height
    data["svg"] = enforce_svg_dimensions(data.get("svg", ""), out_width, out_height)

    if svg_uses_forbidden_primitives(data["svg"]):
        repaired = repair_svg_remove_basic_primitives(
            client,
            svg=data["svg"],
            width=out_width,
            height=out_height,
            title=data.get("title", ""),
            description=data.get("description", ""),
        )
        return repaired

    data["svg"] = enforce_no_basic_shape_primitives(data["svg"])
    return data


def infer_svg_from_prompt(
    prompt: str,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    refine_passes: int = DEFAULT_REFINE_PASSES,
) -> Dict[str, Any]:
    client = get_client()

    plan = create_scene_plan(client, prompt, width, height)
    result = generate_svg_from_plan(client, prompt, plan, width, height)

    current_svg = result["svg"]
    current_title = result.get("title", "")
    current_description = result.get("description", "")

    for _ in range(max(0, refine_passes)):
        review = review_svg_detail(client, prompt, plan, current_svg, width, height)
        if not review.get("needs_revision", False):
            break

        revised = revise_svg(client, prompt, plan, current_svg, review, width, height)
        current_svg = revised["svg"]
        current_title = revised.get("title", current_title)
        current_description = revised.get("description", current_description)

    current_svg = enforce_no_basic_shape_primitives(
        enforce_svg_dimensions(current_svg, width, height)
    )

    return {
        "title": current_title or plan.get("title", ""),
        "description": current_description or plan.get("description", ""),
        "width": width,
        "height": height,
        "svg": current_svg,
        "plan": plan,
    }


def prompt_to_svg_output(
    prompt: str,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    refine_passes: int = DEFAULT_REFINE_PASSES,
) -> Dict[str, Any]:
    if not prompt.strip():
        return {
            "ok": False,
            "error": "Prompt is empty.",
            "title": "",
            "description": "",
            "width": 0,
            "height": 0,
            "svg": "",
        }

    try:
        result = infer_svg_from_prompt(
            prompt,
            width=width,
            height=height,
            refine_passes=refine_passes,
        )
        return {
            "ok": True,
            "title": result.get("title", ""),
            "description": result.get("description", ""),
            "width": int(result.get("width", width)),
            "height": int(result.get("height", height)),
            "svg": result.get("svg", ""),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "title": "",
            "description": "",
            "width": 0,
            "height": 0,
            "svg": "",
        }


def _main() -> int:
    if works is not None:
        raw = works.param(1)

        if isinstance(raw, dict):
            prompt = str(raw.get("prompt") or "")
            width = int(raw.get("width", DEFAULT_WIDTH))
            height = int(raw.get("height", DEFAULT_HEIGHT))
            refine_passes = int(raw.get("refine_passes", DEFAULT_REFINE_PASSES))
        else:
            prompt = str(raw or "")
            width = DEFAULT_WIDTH
            height = DEFAULT_HEIGHT
            refine_passes = DEFAULT_REFINE_PASSES

        works.resolve(
            prompt_to_svg_output(
                prompt,
                width=width,
                height=height,
                refine_passes=refine_passes,
            )
        )
        return 0

    import sys

    prompt = sys.argv[1] if len(sys.argv) > 1 else "A richly detailed botanical rose illustration"
    width = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_WIDTH
    height = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_HEIGHT
    refine_passes = int(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_REFINE_PASSES

    print(
        json.dumps(
            prompt_to_svg_output(
                prompt,
                width=width,
                height=height,
                refine_passes=refine_passes,
            ),
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
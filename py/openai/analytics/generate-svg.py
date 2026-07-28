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


def extract_svg(svg_text: str) -> str:
    svg_text = (svg_text or "").strip()

    # Remove markdown fences if present
    svg_text = re.sub(r"^```(?:svg|xml)?\s*", "", svg_text, flags=re.IGNORECASE)
    svg_text = re.sub(r"\s*```$", "", svg_text)

    match = re.search(r"<svg\b[\s\S]*?</svg>", svg_text, flags=re.IGNORECASE)
    if not match:
        raise ValueError("Model output did not contain a valid <svg>...</svg> block")

    return match.group(0).strip()


def infer_svg_from_prompt(prompt: str) -> Dict[str, Any]:
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=OPENAI_API_KEY)
    schema = build_svg_schema()

    instructions = """
You generate standalone SVG images from user prompts.

Return only valid JSON matching the schema.

Rules:
- The svg field must contain a complete, self-contained SVG string.
- Do not wrap the SVG in markdown fences.
- The SVG must begin with <svg and end with </svg>.
- Use only inline SVG markup. No JavaScript, no external assets, no remote references.
- Prefer simple, clean, valid SVG.
- Set width and height to the intended canvas size in pixels.
"""

    response = client.responses.create(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=prompt,
        text={
            "format": {
                "type": "json_schema",
                "name": schema["name"],
                "schema": schema["schema"],
                "strict": True,
            }
        },
    )

    data = json.loads(response.output_text)
    data["svg"] = extract_svg(data.get("svg", ""))

    return data


def prompt_to_svg_output(prompt: str) -> Dict[str, Any]:
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
        result = infer_svg_from_prompt(prompt)
        return {
            "ok": True,
            "title": result.get("title", ""),
            "description": result.get("description", ""),
            "width": int(result.get("width", 0)),
            "height": int(result.get("height", 0)),
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
        prompt = str(works.param(1) or "")
        works.resolve(prompt_to_svg_output(prompt))
        return 0

    import sys
    prompt = sys.argv[1] if len(sys.argv) > 1 else "A simple blue circle on a white background"
    print(json.dumps(prompt_to_svg_output(prompt), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
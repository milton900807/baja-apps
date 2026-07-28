#!/usr/bin/env python3
"""
Select relevant well UIDs from a table JSON using a local transformers Llama model
stored on disk, with Ion Works for input/output.

What it does
------------
- Reads table JSON from Param(1)
- Reads a natural-language selection prompt from Param(2)
- Extracts candidate wells from the JSON
- Uses each well's own:
    * uid
    * x / y
    * value
    * field
- Runs a local Llama instruct model via transformers in chunks
- Returns matching well UIDs through works.resolve(...)
- Emits progress via works.msg(...)

Model path
----------
The script tries to find a Hugging Face-compatible local model directory by:
1. LLAMA_MODEL_DIR env var
2. Common candidate paths
3. Recursive search for a folder containing config.json + tokenizer files

Optional environment variables
------------------------------
LLAMA_MODEL_DIR           : override local model dir
LLAMA_CHUNK_SIZE          : defaults to "20" on GPU, "10" on CPU
LLAMA_MAX_NEW_TOKENS      : defaults to "256"
LLAMA_DEVICE_MAP          : defaults to "auto" on GPU, "cpu" on CPU
LLAMA_TORCH_DTYPE         : defaults to "bfloat16" if supported, else "float16" on GPU, else "float32"
LLAMA_ATTN_IMPLEMENTATION : optional, e.g. "sdpa", "flash_attention_2", "eager"

Expected input
--------------
Param(1): table JSON object or JSON string
Param(2): prompt string, e.g. "select controls but not average controls"
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from ion import works  # type: ignore


# =========================
# ---- CONFIG / CONSTANTS
# =========================

SCRIPT_DIR = Path(__file__).resolve().parent


def _find_hf_model_dir() -> Path:
    env_path = os.getenv("LLAMA_MODEL_DIR")
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if p.exists():
            return p
        raise FileNotFoundError(f"LLAMA_MODEL_DIR was set but does not exist: {p}")

    candidates = [
        SCRIPT_DIR / "models" / "Meta-Llama-3.3-70B-Instruct",
        SCRIPT_DIR / "models" / "Meta-Llama-3.3-8B-Instruct",
        Path("/home/jmilton/ljlapps/py/llama/models/Meta-Llama-3.3-70B-Instruct"),
        Path("/home/jmilton/ljlapps/py/llama/models/Meta-Llama-3.3-8B-Instruct"),
        Path("/models/Meta-Llama-3.3-70B-Instruct"),
        Path("/models/Meta-Llama-3.3-8B-Instruct"),
        Path("/data/models/Meta-Llama-3.3-70B-Instruct"),
        Path("/data/models/Meta-Llama-3.3-8B-Instruct"),
    ]

    for p in candidates:
        if (p / "config.json").exists() and (
            (p / "tokenizer.json").exists() or (p / "tokenizer_config.json").exists()
        ):
            return p.resolve()

    search_roots = [
        SCRIPT_DIR,
        Path("/home/jmilton"),
        Path("/models"),
        Path("/data/models"),
    ]

    for root in search_roots:
        if not root.exists():
            continue
        try:
            for cfg in root.rglob("config.json"):
                parent = cfg.parent
                name = parent.name.lower()
                if "llama" in name and (
                    (parent / "tokenizer.json").exists()
                    or (parent / "tokenizer_config.json").exists()
                ):
                    return parent.resolve()
        except Exception:
            pass

    raise FileNotFoundError(
        "Could not find a Hugging Face Llama model directory. "
        "Set LLAMA_MODEL_DIR to a folder containing config.json and tokenizer files."
    )


def _default_device_map() -> str:
    return "auto" if torch.cuda.is_available() else "cpu"


def _default_dtype() -> str:
    if not torch.cuda.is_available():
        return "float32"
    if torch.cuda.is_bf16_supported():
        return "bfloat16"
    return "float16"


def _default_chunk_size() -> int:
    return 20 if torch.cuda.is_available() else 10


LLAMA_MODEL_DIR = _find_hf_model_dir()
LLAMA_CHUNK_SIZE = int(os.getenv("LLAMA_CHUNK_SIZE", str(_default_chunk_size())))
LLAMA_MAX_NEW_TOKENS = int(os.getenv("LLAMA_MAX_NEW_TOKENS", "256"))
LLAMA_DEVICE_MAP = os.getenv("LLAMA_DEVICE_MAP", _default_device_map())
LLAMA_TORCH_DTYPE = os.getenv("LLAMA_TORCH_DTYPE", _default_dtype()).lower()
LLAMA_ATTN_IMPLEMENTATION = os.getenv("LLAMA_ATTN_IMPLEMENTATION", "").strip()

STOPWORDS = {
    "select", "find", "show", "get", "choose", "pick", "the", "a", "an",
    "all", "with", "that", "those", "these", "for", "of", "to", "in", "on",
    "and", "or", "by", "from", "cells", "cell", "wells", "well", "rows", "row",
    "uids", "uid"
}

SYSTEM_PROMPT = (
    "You are a careful laboratory well-selection engine. "
    "Given a user request and a list of candidate wells, choose which wells match.\n"
    "Each candidate well includes:\n"
    " - uid\n"
    " - x\n"
    " - y\n"
    " - value: the well's value\n"
    " - field: metadata associated with the well\n\n"
    "STRICT RULES:\n"
    " - Use the well's own value and field metadata together.\n"
    " - Respect exclusions like 'but not', 'except', 'excluding', and 'without'.\n"
    " - Be precise and avoid false positives.\n"
    " - Do not invent well IDs.\n"
    " - Return strict JSON only: {\"matched_well_uids\": [\"uid1\", \"uid2\"]}\n"
    " - No extra text."
)


# =========================
# ---- PROGRESS / HELPERS
# =========================

def _progress(msg: str) -> None:
    try:
        works.msg(msg)
    except Exception:
        pass


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _norm(s: Any) -> str:
    s = _safe_str(s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _tokenize(s: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9_]+", _norm(s)) if t not in STOPWORDS]


def _chunk_list(items: List[Any], chunk_size: int) -> List[List[Any]]:
    if chunk_size <= 0:
        return [items]
    return [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]


def _json_dumps_compact(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    text = _safe_str(text).strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidate = text[start:end + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None

    return None


def _resolve_torch_dtype() -> Any:
    if LLAMA_TORCH_DTYPE == "bfloat16":
        return torch.bfloat16
    if LLAMA_TORCH_DTYPE == "float16":
        return torch.float16
    if LLAMA_TORCH_DTYPE == "float32":
        return torch.float32
    return "auto"


def _model_device(model: Any) -> torch.device:
    if hasattr(model, "device"):
        try:
            return model.device
        except Exception:
            pass

    try:
        return next(model.parameters()).device
    except Exception:
        return torch.device("cpu")


# =========================
# ---- PROMPT PARSING
# =========================

def _split_prompt(prompt: str) -> Tuple[List[str], List[str]]:
    p = _norm(prompt)

    separators = [
        r"\bbut not\b",
        r"\bexcept\b",
        r"\bexcluding\b",
        r"\bwithout\b",
    ]

    for sep in separators:
        m = re.search(sep, p)
        if m:
            left = p[:m.start()].strip(" ,.")
            right = p[m.end():].strip(" ,.")
            return ([left] if left else []), ([right] if right else [])

    m = re.search(r"\bnot\b", p)
    if m:
        left = p[:m.start()].strip(" ,.")
        right = p[m.end():].strip(" ,.")
        return ([left] if left else []), ([right] if right else [])

    return ([p] if p else []), []


# =========================
# ---- CELL / WELL HELPERS
# =========================

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


def _extract_table_name(table_json: Dict[str, Any]) -> str:
    return _safe_str(table_json.get("name") or "Untitled Table")


@dataclass
class WellCandidate:
    uid: str
    x: Optional[int]
    y: Optional[int]
    value: Any
    field: Any

    def compact_payload(self) -> Dict[str, Any]:
        return {
            "uid": self.uid,
            "x": self.x,
            "y": self.y,
            "value": self.value,
            "field": self.field if self.field is not None else [],
        }


def _extract_well_candidates(table_json: Dict[str, Any]) -> List[WellCandidate]:
    wells = table_json.get("wells")
    out: List[WellCandidate] = []

    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]:
        for cell in wells:
            try:
                x = int(cell.get("x", 0))
                y = int(cell.get("y", 0))
            except Exception:
                x = cell.get("x")
                y = cell.get("y")

            if y == 0:
                continue

            uid = _cell_uid(cell)
            if not uid:
                continue

            out.append(
                WellCandidate(
                    uid=uid,
                    x=x if isinstance(x, int) else None,
                    y=y if isinstance(y, int) else None,
                    value=cell.get("value"),
                    field=cell.get("field", []),
                )
            )
        return out

    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        for x, col in enumerate(wells):
            if not isinstance(col, list):
                continue
            for y, cell in enumerate(col):
                if y == 0:
                    continue
                if not isinstance(cell, dict):
                    continue
                uid = _cell_uid(cell)
                if not uid:
                    continue
                out.append(
                    WellCandidate(
                        uid=uid,
                        x=x,
                        y=y,
                        value=cell.get("value"),
                        field=cell.get("field", []),
                    )
                )
        return out

    return out


# =========================
# ---- LOCAL HEURISTICS
# =========================

def _score_text_against_phrase(text: str, phrase: str) -> float:
    t = _norm(text)
    p = _norm(phrase)

    if not p:
        return 0.0
    if t == p:
        return 1.0
    if p in t:
        return 0.95

    ptoks = _tokenize(p)
    ttoks = set(_tokenize(t))
    if not ptoks:
        return 0.0

    overlap = sum(1 for tok in ptoks if tok in ttoks)
    return overlap / len(ptoks)


def _best_include_score(text: str, include_phrases: List[str]) -> float:
    return max((_score_text_against_phrase(text, p) for p in include_phrases), default=0.0)


def _best_exclude_score(text: str, exclude_phrases: List[str]) -> float:
    return max((_score_text_against_phrase(text, p) for p in exclude_phrases), default=0.0)


def _well_text_blob(well: WellCandidate) -> str:
    parts = [
        _safe_str(well.value),
        _json_dumps_compact(well.field if well.field is not None else []),
    ]
    return " | ".join(p for p in parts if p)


def local_select_well_uids(
    candidates: List[WellCandidate],
    include_phrases: List[str],
    exclude_phrases: List[str],
) -> List[str]:
    selected: List[str] = []

    for well in candidates:
        text = _well_text_blob(well)
        include_score = _best_include_score(text, include_phrases)
        exclude_score = _best_exclude_score(text, exclude_phrases)

        if include_score >= 0.6 and exclude_score < 0.6:
            selected.append(well.uid)

    seen = set()
    out: List[str] = []
    for uid in selected:
        if uid not in seen:
            out.append(uid)
            seen.add(uid)
    return out


# =========================
# ---- TRANSFORMERS MODEL
# =========================

_TOKENIZER = None
_MODEL = None


def load_local_model() -> Tuple[Any, Any]:
    global _TOKENIZER, _MODEL

    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL

    _progress(f"Using local model dir: {LLAMA_MODEL_DIR}")

    if not LLAMA_MODEL_DIR.exists():
        raise FileNotFoundError(
            f"Local model dir does not exist: {LLAMA_MODEL_DIR}. "
            "This script needs a Hugging Face model directory containing config.json "
            "and tokenizer files."
        )

    if not (LLAMA_MODEL_DIR / "config.json").exists():
        raise FileNotFoundError(
            f"Model dir exists but does not look like a Hugging Face model: {LLAMA_MODEL_DIR}"
        )

    _progress("Loading tokenizer from local model dir...")
    tokenizer = AutoTokenizer.from_pretrained(
        str(LLAMA_MODEL_DIR),
        local_files_only=True,
    )

    if tokenizer.pad_token_id is None and tokenizer.eos_token_id is not None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs: Dict[str, Any] = {
        "local_files_only": True,
        "torch_dtype": _resolve_torch_dtype(),
        "device_map": LLAMA_DEVICE_MAP,
    }

    if LLAMA_ATTN_IMPLEMENTATION:
        model_kwargs["attn_implementation"] = LLAMA_ATTN_IMPLEMENTATION

    _progress("Loading model from local model dir...")
    model = AutoModelForCausalLM.from_pretrained(
        str(LLAMA_MODEL_DIR),
        **model_kwargs,
    )
    model.eval()

    _TOKENIZER = tokenizer
    _MODEL = model
    _progress("Local model loaded.")
    return _TOKENIZER, _MODEL


def local_llama_select_well_uids(
    *,
    table_name: str,
    user_prompt: str,
    candidates: List[WellCandidate],
    chunk_size: int = LLAMA_CHUNK_SIZE,
    max_new_tokens: int = LLAMA_MAX_NEW_TOKENS,
) -> Tuple[List[str], int]:
    tokenizer, model = load_local_model()
    chunks = _chunk_list(candidates, chunk_size)
    selected: List[str] = []

    _progress(
        f"Running local transformers model across {len(chunks)} chunk(s) "
        f"for {len(candidates)} candidate wells..."
    )

    for i, chunk in enumerate(chunks, start=1):
        _progress(f"Processing local model chunk {i} / {len(chunks)} ({len(chunk)} wells)...")

        payload = {
            "table_name": table_name,
            "user_request": user_prompt,
            "candidate_wells": [w.compact_payload() for w in chunk],
        }

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _json_dumps_compact(payload)},
        ]

        try:
            input_ids = tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                return_tensors="pt",
            )

            device = _model_device(model)
            input_ids = input_ids.to(device)

            with torch.no_grad():
                output_ids = model.generate(
                    input_ids,
                    max_new_tokens=max_new_tokens,
                    do_sample=False,
                    temperature=None,
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )

            new_tokens = output_ids[0][input_ids.shape[-1]:]
            text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

            parsed = _extract_json_object(text)
            if not parsed:
                _progress(f"Chunk {i} failed: model response was not valid JSON.")
                continue

            chunk_uids = parsed.get("matched_well_uids", [])
            accepted = 0

            if isinstance(chunk_uids, list):
                for uid in chunk_uids:
                    uid_s = _safe_str(uid).strip()
                    if uid_s:
                        selected.append(uid_s)
                        accepted += 1

            _progress(f"Chunk {i} completed. Model returned {accepted} candidate matches.")

        except Exception as e:
            _progress(f"Chunk {i} failed: {e}")

    valid_uids = {w.uid for w in candidates}
    seen = set()
    out: List[str] = []

    for uid in selected:
        if uid in valid_uids and uid not in seen:
            out.append(uid)
            seen.add(uid)

    _progress(f"Local model selection finished with {len(out)} valid matching wells.")
    return out, len(chunks)


# =========================
# ---- ANALYZE
# =========================

def analyze(table_json: Dict[str, Any], user_prompt: str) -> Dict[str, Any]:
    table_name = _extract_table_name(table_json)
    candidates = _extract_well_candidates(table_json)
    include_phrases, exclude_phrases = _split_prompt(user_prompt)

    if not candidates:
        return {
            "status": "ok",
            "selected_well_uids": [],
            "table_name": table_name,
            "matches": {
                "include_phrases": include_phrases,
                "exclude_phrases": exclude_phrases,
            },
            "debug": {
                "selection_method": "none",
                "candidate_well_count": 0,
                "chunk_size": LLAMA_CHUNK_SIZE,
                "chunk_count": 0,
                "model_dir": str(LLAMA_MODEL_DIR),
            },
            "notes": ["No candidate wells found in table_json."]
        }

    if not include_phrases:
        return {
            "status": "ok",
            "selected_well_uids": [],
            "table_name": table_name,
            "matches": {
                "include_phrases": [],
                "exclude_phrases": exclude_phrases,
            },
            "debug": {
                "selection_method": "none",
                "candidate_well_count": len(candidates),
                "chunk_size": LLAMA_CHUNK_SIZE,
                "chunk_count": 0,
                "model_dir": str(LLAMA_MODEL_DIR),
            },
            "notes": ["user_prompt was empty after normalization."]
        }

    selected_well_uids, chunk_count = local_llama_select_well_uids(
        table_name=table_name,
        user_prompt=user_prompt,
        candidates=candidates,
    )
    selection_method = "llama_local_transformers_chunked"

    if not selected_well_uids:
        _progress("Local model returned no matches. Falling back to heuristic matching...")
        selected_well_uids = local_select_well_uids(
            candidates=candidates,
            include_phrases=include_phrases,
            exclude_phrases=exclude_phrases,
        )
        selection_method = "heuristic_value_field"

    return {
        "status": "ok",
        "selected_well_uids": selected_well_uids,
        "table_name": table_name,
        "matches": {
            "include_phrases": include_phrases,
            "exclude_phrases": exclude_phrases,
        },
        "debug": {
            "selection_method": selection_method,
            "candidate_well_count": len(candidates),
            "chunk_size": LLAMA_CHUNK_SIZE,
            "chunk_count": chunk_count,
            "model_dir": str(LLAMA_MODEL_DIR),
        },
        "notes": [
            "Selection is based on each well's own value and field metadata.",
            "A local transformers model is used first; heuristic matching is used as fallback."
        ]
    }


# =========================
# ---- MAIN
# =========================

def main() -> int:
    _progress("Reading input parameters...")

    try:
        table_json = works.param(1)
    except Exception:
        works.resolve({
            "status": "error",
            "error": "Missing param(1): table_json"
        })
        return 1

    try:
        user_prompt = works.param(2)
    except Exception:
        works.resolve({
            "status": "error",
            "error": "Missing param(2): user_prompt"
        })
        return 1

    _progress("Validating table JSON input...")

    if isinstance(table_json, str):
        _progress("Param(1) is a string. Parsing JSON...")
        try:
            table_json = json.loads(table_json)
        except Exception as e:
            works.resolve({
                "status": "error",
                "error": f"param(1) is not valid JSON: {e}"
            })
            return 1

    if not isinstance(table_json, dict):
        works.resolve({
            "status": "error",
            "error": "param(1) must be a JSON object / dict"
        })
        return 1

    user_prompt = _safe_str(user_prompt)

    try:
        _progress("Beginning analysis...")
        result = analyze(table_json, user_prompt)
        _progress("Done. Resolving result.")
        works.resolve(result)
        return 0
    except Exception as e:
        _progress(f"Fatal error: {e}")
        works.resolve({
            "status": "error",
            "error": str(e)
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
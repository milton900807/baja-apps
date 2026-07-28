#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ion Amplicon Designer + Ct Model Scorer (top-N, UNIQUE)

Fixes in this version
- NO DUPLICATES: removes identical amplicons that arise from overlapping windows
  (same amp_start/amp_end + same primer sequences [+ probe]).
- Optional MIN SPACING between returned amplicons so top hits don't cluster
  (default 150 nt; set min_sep=0 to disable).

Also fixes a bug in your pasted script
- You had TWO definitions of load_modelbundle(); the second overwrote the first.
  This version keeps ONE correct implementation.

NEW IN THIS VERSION
- Adds a globally unique identifier (UUID4) field `uid` to every returned hit.
- Adds a `uid` to EVERY dict/object at ALL NESTING LEVELS in the returned payload
  (top-level payload, params, each hit, and any nested dicts/lists).

Outputs
- Returns JSON payload in Ion mode and optionally writes CSV/XLSX

Dependencies
  pip install pandas numpy joblib primer3-py
Optional (if model trained with --use-rnafold):
  RNAfold (ViennaRNA) in PATH
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import uuid  # for globally unique identifiers
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd

import primer3
from primer3 import bindings as p3b

# Optional Ion support
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    _HAS_ION = False


# -----------------------------------------------------------------------------
# Progress / messaging helpers
# -----------------------------------------------------------------------------
def _progress(pct: float, msg: str | None = None) -> None:
    p = int(max(0, min(100, round(pct))))
    if _HAS_ION:
        try:
            works.progress(p)
            if msg:
                works.msg(str(msg))
        except Exception:
            pass
    else:
        if msg:
            print(f"[{p:3d}%] {msg}", file=sys.stderr)


def _msg(msg: str) -> None:
    if _HAS_ION:
        try:
            works.msg(str(msg))
        except Exception:
            pass
    else:
        print(msg, file=sys.stderr)


# -----------------------------------------------------------------------------
# Add uid to every object at all levels (recursive)
# -----------------------------------------------------------------------------
def add_uid_everywhere(obj: Any) -> Any:
    """
    Recursively add a 'uid' field to every dict at all nesting levels.
    - Does NOT overwrite existing uids.
    - Traverses lists/tuples and dict values.
    """
    if isinstance(obj, dict):
        if "uid" not in obj:
            obj["uid"] = str(uuid.uuid4())
        for k, v in list(obj.items()):
            obj[k] = add_uid_everywhere(v)
        return obj
    if isinstance(obj, list):
        return [add_uid_everywhere(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(add_uid_everywhere(v) for v in obj)
    return obj


# -----------------------------------------------------------------------------
# Model bundle (must match ct_good_model_amplicon_structure.py)
# -----------------------------------------------------------------------------
@dataclass
class ModelBundle:
    pipeline: Any
    feature_columns: List[str]
    ct_threshold: float
    use_primer3: bool
    use_rnafold: bool
    decision_threshold: float


# -----------------------------------------------------------------------------
# Robust Ion param normalization helpers
# -----------------------------------------------------------------------------
def _first_valid_path_from_list(items: Iterable[Any]) -> Optional[str]:
    for it in items:
        if isinstance(it, str):
            p = it.split(":", 1)[1] if it.startswith("jfile:") else it
            if os.path.exists(p):
                return p
    return None


def _normalize_path(val: Any, default: Optional[str] = None) -> Optional[str]:
    try:
        if isinstance(val, str):
            p = val.split(":", 1)[1] if val.startswith("jfile:") else val
            return p if p else default
        if isinstance(val, (list, tuple)):
            return _first_valid_path_from_list(val) or default
        return default
    except Exception:
        return default


def _parse_seq_list(x: Union[str, List[str]]) -> List[str]:
    if isinstance(x, list):
        return [str(s) for s in x if str(s).strip()]

    s = str(x).strip()
    if not s:
        return []

    # JSON list or dict?
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
        try:
            obj = json.loads(s)
            if isinstance(obj, dict) and "seqs" in obj and isinstance(obj["seqs"], list):
                return [str(v) for v in obj["seqs"] if str(v).strip()]
            if isinstance(obj, dict) and "seq" in obj:
                v = str(obj["seq"]).strip()
                return [v] if v else []
            if isinstance(obj, list):
                return [str(v) for v in obj if str(v).strip()]
        except Exception:
            pass

    # Delimited
    if ";" in s:
        parts = [p.strip() for p in s.split(";")]
        return [p for p in parts if p]
    if "," in s:
        parts = [p.strip() for p in s.split(",")]
        return [p for p in parts if p]

    toks = [t.strip() for t in re.split(r"\s+", s) if t.strip()]
    if len(toks) > 1:
        return toks

    return [s]


def read_fasta_iter(path: str) -> Iterable[Tuple[str, str]]:
    header = None
    seq_parts: List[str] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                if header is not None:
                    yield header, "".join(seq_parts)
                header = line[1:].strip() or "seq"
                seq_parts = []
            else:
                seq_parts.append(line)
    if header is not None:
        yield header, "".join(seq_parts)


def _extract_first_sequence(inp: Any) -> Tuple[str, str]:
    # string path?
    if isinstance(inp, str):
        p = inp.split(":", 1)[1] if inp.startswith("jfile:") else inp
        if os.path.exists(p):
            for h, s in read_fasta_iter(p):
                return h, s
        seqs = _parse_seq_list(inp)
        return ("input_seq", seqs[0]) if seqs else ("input_seq", "")

    # list/tuple: path inside?
    if isinstance(inp, (list, tuple)):
        p = _first_valid_path_from_list(inp)
        if p:
            for h, s in read_fasta_iter(p):
                return h, s
        flat = [x for x in inp if isinstance(x, str)]
        seqs = _parse_seq_list(flat if len(flat) > 1 else (flat[0] if flat else ""))
        return ("input_seq", seqs[0]) if seqs else ("input_seq", "")

    # dict: maybe {"seq": "..."} or {"seqs":[...]}
    if isinstance(inp, dict):
        if "seq" in inp:
            return "input_seq", str(inp["seq"])
        if "seqs" in inp and isinstance(inp["seqs"], list) and inp["seqs"]:
            return "input_seq", str(inp["seqs"][0])

    return "input_seq", ""


# -----------------------------------------------------------------------------
# Sequence utilities / normalization (RNA->DNA)
# -----------------------------------------------------------------------------
DNA_RE = re.compile(r"[^ACGTUacgtu]")
DNA_COMP = str.maketrans("ACGTUacgtu", "TGCAAtgcaa")


def norm_rna_to_dna(seq: str) -> str:
    return DNA_RE.sub("", str(seq)).upper().replace("U", "T")


def revcomp(seq: str) -> str:
    return seq.translate(DNA_COMP)[::-1]


def gc_content(seq: str) -> float:
    return (seq.count("G") + seq.count("C")) / len(seq) if seq else 0.0


def shannon_entropy(seq: str) -> float:
    if not seq:
        return 0.0
    n = len(seq)
    counts = [seq.count(b) for b in "ACGT"]
    probs = [c / n for c in counts if c > 0]
    return float(-sum(p * math.log2(p) for p in probs))


def max_homopolymer(seq: str) -> int:
    if not seq:
        return 0
    best = 1
    cur = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i - 1]:
            cur += 1
            best = max(best, cur)
        else:
            cur = 1
    return best


def dinuc_freqs(seq: str) -> Dict[str, float]:
    out = {a + b: 0.0 for a in "ACGT" for b in "ACGT"}
    if len(seq) < 2:
        return out
    total = len(seq) - 1
    for i in range(total):
        d = seq[i: i + 2]
        if d in out:
            out[d] += 1.0
    return {k: (v / total) for k, v in out.items()}


def basic_seq_features(prefix: str, seq: str) -> Dict[str, float]:
    d: Dict[str, float] = {
        f"{prefix}_len": float(len(seq)),
        f"{prefix}_gc": float(gc_content(seq)),
        f"{prefix}_entropy": float(shannon_entropy(seq)),
        f"{prefix}_homopolymer": float(max_homopolymer(seq)),
    }
    d.update({f"{prefix}_di_{k}": float(v) for k, v in dinuc_freqs(seq).items()})
    return d


# -----------------------------------------------------------------------------
# Secondary-structure proxies (matching your ct_good_model script)
# -----------------------------------------------------------------------------
def _is_complement(a: str, b: str) -> bool:
    return (a, b) in {("A", "T"), ("T", "A"), ("C", "G"), ("G", "C")}


def self_complementarity_proxy(seq: str) -> Tuple[int, float, float]:
    if not seq:
        return 0, 0.0, 0.0
    rc = revcomp(seq)
    n = len(seq)
    best_runs: List[int] = []
    total_comp = 0
    total_aligned = 0
    max_run = 0
    for shift in range(-(n - 1), n):
        run = 0
        best_this = 0
        for i in range(n):
            j = i + shift
            if 0 <= j < n:
                total_aligned += 1
                if _is_complement(seq[i], rc[j]):
                    total_comp += 1
                    run += 1
                    best_this = max(best_this, run)
                else:
                    run = 0
        best_runs.append(best_this)
        max_run = max(max_run, best_this)
    best_runs.sort(reverse=True)
    topk = best_runs[:5] if best_runs else [0]
    mean_best = float(np.mean(topk)) if topk else 0.0
    comp_density = (total_comp / total_aligned) if total_aligned else 0.0
    return int(max_run), float(mean_best), float(comp_density)


def palindromic_kmer_density(seq: str, k: int) -> float:
    if not seq or len(seq) < k:
        return 0.0
    total = len(seq) - k + 1
    pal = 0
    for i in range(total):
        kmer = seq[i: i + k]
        if kmer == revcomp(kmer):
            pal += 1
    return pal / total if total else 0.0


def rnafold_mfe(seq: str) -> Optional[float]:
    if not seq:
        return None
    if shutil.which("RNAfold") is None:
        return None
    try:
        p = subprocess.run(
            ["RNAfold", "--noPS"],
            input=(seq + "\n").encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
        )
        out = p.stdout.decode("utf-8", errors="ignore").strip().splitlines()
        if len(out) < 2:
            return None
        m = re.search(r"\(\s*([-\d\.]+)\s*\)\s*$", out[1])
        return float(m.group(1)) if m else None
    except Exception:
        return None


def secondary_structure_features(prefix: str, seq: str, use_rnafold: bool) -> Dict[str, float]:
    max_run, mean_best, comp_density = self_complementarity_proxy(seq)
    pal6 = palindromic_kmer_density(seq, 6)
    pal8 = palindromic_kmer_density(seq, 8)
    mfe = rnafold_mfe(seq) if use_rnafold else None
    return {
        f"{prefix}_selfcomp_maxrun": float(max_run),
        f"{prefix}_selfcomp_meanbest5": float(mean_best),
        f"{prefix}_selfcomp_density": float(comp_density),
        f"{prefix}_pal_k6_density": float(pal6),
        f"{prefix}_pal_k8_density": float(pal8),
        f"{prefix}_rnafold_mfe": float(mfe) if mfe is not None else 0.0,
        f"{prefix}_rnafold_available": 1.0 if mfe is not None else 0.0,
    }


# -----------------------------------------------------------------------------
# Primer3 thermo features (matching your ct_good_model script)
# -----------------------------------------------------------------------------
def primer3_oligo(prefix: str, seq: str) -> Dict[str, float]:
    if not seq:
        return {f"{prefix}_tm": 0.0, f"{prefix}_hairpin_dg": 0.0, f"{prefix}_homodimer_dg": 0.0}
    out: Dict[str, float] = {}
    try:
        out[f"{prefix}_tm"] = float(primer3.calc_tm(seq))
    except Exception:
        out[f"{prefix}_tm"] = 0.0
    try:
        hp = primer3.calc_hairpin(seq)
        out[f"{prefix}_hairpin_dg"] = float(getattr(hp, "dg", 0.0) or 0.0)
    except Exception:
        out[f"{prefix}_hairpin_dg"] = 0.0
    try:
        hd = primer3.calc_homodimer(seq)
        out[f"{prefix}_homodimer_dg"] = float(getattr(hd, "dg", 0.0) or 0.0)
    except Exception:
        out[f"{prefix}_homodimer_dg"] = 0.0
    return out


def primer3_hetero(prefix: str, a: str, b: str) -> Dict[str, float]:
    if not a or not b:
        return {f"{prefix}_heterodimer_dg": 0.0}
    try:
        het = primer3.calc_heterodimer(a, b)
        return {f"{prefix}_heterodimer_dg": float(getattr(het, "dg", 0.0) or 0.0)}
    except Exception:
        return {f"{prefix}_heterodimer_dg": 0.0}


# -----------------------------------------------------------------------------
# Featurization (align with ct_good_model_amplicon_structure.py)
# -----------------------------------------------------------------------------
def featurize_row(
    fwd: str,
    rev: str,
    probe: str,
    amp: str,
    *,
    use_primer3: bool,
    use_rnafold: bool,
) -> Dict[str, float]:
    d: Dict[str, float] = {}
    d.update(basic_seq_features("fwd", fwd))
    d.update(basic_seq_features("rev", rev))
    d.update(basic_seq_features("probe", probe))
    d.update(basic_seq_features("amp", amp))

    alen = len(amp)
    d["amp_len_sq"] = float(alen * alen)
    d["amp_len_log1p"] = float(math.log1p(alen)) if alen else 0.0
    d["amp_len_from_100"] = float(abs(alen - 100)) if alen else 0.0

    d.update(secondary_structure_features("amp", amp, use_rnafold=use_rnafold))

    ps = amp.find(probe) if amp and probe else -1
    d["probe_pos_frac"] = float((ps + len(probe) / 2) / len(amp)) if ps >= 0 and len(amp) > 0 else 0.0

    if use_primer3:
        d.update(primer3_oligo("fwd", fwd))
        d.update(primer3_oligo("rev", rev))
        d.update(primer3_oligo("probe", probe))
        d.update(primer3_hetero("fwd_rev", fwd, rev))
        d.update(primer3_hetero("fwd_probe", fwd, probe))
        d.update(primer3_hetero("rev_probe", rev, probe))
        d["tm_diff_fwd_rev"] = abs(d.get("fwd_tm", 0.0) - d.get("rev_tm", 0.0))
        d["tm_probe_minus_mean_primers"] = d.get("probe_tm", 0.0) - 0.5 * (
            d.get("fwd_tm", 0.0) + d.get("rev_tm", 0.0)
        )
    else:
        for k in [
            "fwd_tm",
            "rev_tm",
            "probe_tm",
            "fwd_hairpin_dg",
            "rev_hairpin_dg",
            "probe_hairpin_dg",
            "fwd_homodimer_dg",
            "rev_homodimer_dg",
            "probe_homodimer_dg",
            "fwd_rev_heterodimer_dg",
            "fwd_probe_heterodimer_dg",
            "rev_probe_heterodimer_dg",
            "tm_diff_fwd_rev",
            "tm_probe_minus_mean_primers",
        ]:
            d[k] = 0.0
    return d


# -----------------------------------------------------------------------------
# Primer3 design (WINDOWED fix)
# -----------------------------------------------------------------------------
def primer3_global_settings(
    *,
    product_min: int,
    product_max: int,
    allow_probe: bool,
    relax: bool,
) -> Dict[str, object]:
    if not relax:
        return dict(
            PRIMER_NUM_RETURN=1,
            PRIMER_PICK_LEFT_PRIMER=1,
            PRIMER_PICK_RIGHT_PRIMER=1,
            PRIMER_PICK_INTERNAL_OLIGO=1 if allow_probe else 0,
            PRIMER_OPT_SIZE=20,
            PRIMER_MIN_SIZE=18,
            PRIMER_MAX_SIZE=25,
            PRIMER_MIN_TM=57.0,
            PRIMER_OPT_TM=60.0,
            PRIMER_MAX_TM=63.0,
            PRIMER_MIN_GC=30.0,
            PRIMER_MAX_GC=70.0,
            PRIMER_MAX_POLY_X=5,
            PRIMER_PRODUCT_SIZE_RANGE=[[product_min, product_max]],
            PRIMER_EXPLAIN_FLAG=1,
            PRIMER_INTERNAL_OPT_SIZE=22,
            PRIMER_INTERNAL_MIN_SIZE=18,
            PRIMER_INTERNAL_MAX_SIZE=30,
            PRIMER_INTERNAL_MIN_TM=64.0,
            PRIMER_INTERNAL_OPT_TM=68.0,
            PRIMER_INTERNAL_MAX_TM=72.0,
        )
    return dict(
        PRIMER_NUM_RETURN=1,
        PRIMER_PICK_LEFT_PRIMER=1,
        PRIMER_PICK_RIGHT_PRIMER=1,
        PRIMER_PICK_INTERNAL_OLIGO=1 if allow_probe else 0,
        PRIMER_OPT_SIZE=20,
        PRIMER_MIN_SIZE=17,
        PRIMER_MAX_SIZE=28,
        PRIMER_MIN_TM=54.0,
        PRIMER_OPT_TM=60.0,
        PRIMER_MAX_TM=66.0,
        PRIMER_MIN_GC=20.0,
        PRIMER_MAX_GC=80.0,
        PRIMER_MAX_POLY_X=8,
        PRIMER_PRODUCT_SIZE_RANGE=[[product_min, product_max]],
        PRIMER_EXPLAIN_FLAG=1,
        PRIMER_INTERNAL_OPT_SIZE=22,
        PRIMER_INTERNAL_MIN_SIZE=16,
        PRIMER_INTERNAL_MAX_SIZE=35,
        PRIMER_INTERNAL_MIN_TM=60.0,
        PRIMER_INTERNAL_OPT_TM=68.0,
        PRIMER_INTERNAL_MAX_TM=75.0,
    )


def design_candidates_windowed(
    template: str,
    *,
    product_min: int,
    product_max: int,
    window_size: int,
    step: int,
    max_designs: int,
    allow_probe: bool,
    relax: bool,
    debug: bool,
) -> List[Dict[str, object]]:
    n = len(template)
    candidates: List[Dict[str, object]] = []
    global_args = primer3_global_settings(
        product_min=product_min,
        product_max=product_max,
        allow_probe=allow_probe,
        relax=relax,
    )

    window_size = max(int(window_size), int(product_max) + 60)
    starts = list(range(0, max(1, n - product_min), int(step)))

    for idx, window_start in enumerate(starts):
        if len(candidates) >= max_designs:
            break

        if idx % max(1, len(starts) // 20) == 0:
            _progress(10 + 40 * (idx / max(1, len(starts))), f"primer3 scanning... ({idx}/{len(starts)})")

        window = template[window_start: window_start + window_size]
        if len(window) < product_min + 20:
            break

        seq_args = {"SEQUENCE_ID": f"win_{window_start}", "SEQUENCE_TEMPLATE": window}

        try:
            res = p3b.design_primers(seq_args, global_args)
        except Exception:
            continue

        if res.get("PRIMER_PAIR_NUM_RETURNED", 0) < 1:
            if debug:
                explain = res.get("PRIMER_PAIR_EXPLAIN", "") or res.get("PRIMER_EXPLAIN", "")
                if explain:
                    _msg(f"[primer3 fail @ {window_start}] {explain}")
            continue

        left_seq = res.get("PRIMER_LEFT_0_SEQUENCE", "")
        right_seq = res.get("PRIMER_RIGHT_0_SEQUENCE", "")
        if not left_seq or not right_seq:
            continue

        left_pos, left_len = res.get("PRIMER_LEFT_0", [None, None])
        right_pos, right_len = res.get("PRIMER_RIGHT_0", [None, None])
        if left_pos is None or left_len is None or right_pos is None or right_len is None:
            continue

        amp_start_local = int(left_pos)
        amp_end_local = int(right_pos) + int(right_len)
        if not (0 <= amp_start_local < amp_end_local <= len(window)):
            continue

        amplicon = window[amp_start_local:amp_end_local]
        probe_seq = res.get("PRIMER_INTERNAL_0_SEQUENCE", "") or ""

        amp_start = window_start + amp_start_local
        amp_end = window_start + amp_end_local

        candidates.append(
            dict(
                uid=str(uuid.uuid4()),  # <-- NEW: uid per candidate dict
                amp_start=int(amp_start),
                amp_end=int(amp_end),
                amp_len=int(len(amplicon)),
                forward_primer=str(left_seq),
                reverse_primer=str(right_seq),
                probe=str(probe_seq),
                amplicon=str(amplicon),
                p3_pair_penalty=float(res.get("PRIMER_PAIR_0_PENALTY", 0.0) or 0.0),
                window_start=int(window_start),
                window_size=int(len(window)),
            )
        )

    return candidates


# -----------------------------------------------------------------------------
# Load model bundle (ONE definition; resolves relative to script directory)
# -----------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = str(SCRIPT_DIR / "model.joblib")  # change if you want ct_good_model/model.joblib





def load_modelbundle(model_path_or_dir: str) -> ModelBundle:
    """
    Robustly load model.joblib across NumPy RNG pickle incompatibilities.

    Handles BOTH observed failure modes:
      A) ValueError: <class '...PCG64'> is not a known BitGenerator module.
         (raised inside numpy.random._pickle.__bit_generator_ctor)
      B) TypeError: state must be a dict
         (raised when PCG64.state is assigned during __setstate__)

    Important: This function MUST NOT early-raise before retrying.
    """
    import warnings

    # --- resolve path ---
    p = model_path_or_dir or ""
    if isinstance(p, str) and p.startswith("jfile:"):
        p = p.split(":", 1)[1]

    path = Path(p)
    if not path.is_absolute():
        path = (SCRIPT_DIR / path).resolve()
    if path.is_dir():
        path = path / "model.joblib"
    if not path.exists():
        raise FileNotFoundError(f"Model bundle not found: {path}")

    # Optional: reduce sklearn persistence warning spam in Ion logs
    try:
        from sklearn.exceptions import InconsistentVersionWarning  # type: ignore
        warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
    except Exception:
        pass

    def _pcg64_state_to_dict(state_obj):
        if isinstance(state_obj, dict):
            return state_obj

        if isinstance(state_obj, (tuple, list)):
            # (state, inc)
            if len(state_obj) == 2:
                st, inc = state_obj
                return {
                    "bit_generator": "PCG64",
                    "state": {"state": st, "inc": inc},
                    "has_uint32": 0,
                    "uinteger": 0,
                }
            # (state, inc, has_uint32, uinteger)
            if len(state_obj) == 4:
                st, inc, has_uint32, uinteger = state_obj
                return {
                    "bit_generator": "PCG64",
                    "state": {"state": st, "inc": inc},
                    "has_uint32": int(has_uint32),
                    "uinteger": int(uinteger),
                }

        return state_obj  # let NumPy raise a meaningful error if unknown

    # ---- Attempt 1: normal load ----
    first_err: Exception | None = None
    try:
        return joblib.load(str(path))
    except Exception as exc:
        first_err = exc

    # ---- Attempt 2: patched load (patch ctor + PCG64.state setter) ----
    try:
        # Patch the exact module in your traceback: numpy.random._pickle
        from numpy.random import _pickle as np_random_pickle  # type: ignore
        from numpy.random import _pcg64 as np_pcg64_mod       # type: ignore

        # 1) Patch __bit_generator_ctor to accept a CLASS and instantiate it directly
        orig_ctor = getattr(np_random_pickle, "__bit_generator_ctor", None)
        if orig_ctor is None:
            raise first_err

        def _patched_bit_generator_ctor(bit_generator_name, *args, **kwargs):
            # If pickle gives a class (your error), instantiate it directly
            if isinstance(bit_generator_name, type):
                cls = bit_generator_name
                bg = cls()

                if args:
                    st = args[0]
                    if getattr(cls, "__name__", "") == "PCG64":
                        st = _pcg64_state_to_dict(st)
                    # This may still error if state schema is unknown
                    bg.state = st
                return bg

            # Otherwise defer to NumPy's original behavior
            return orig_ctor(bit_generator_name, *args, **kwargs)

        # 2) Patch PCG64.state setter to coerce legacy tuple/list state into dict
        PCG64 = getattr(np_pcg64_mod, "PCG64", None)
        if PCG64 is None:
            raise first_err

        orig_state_prop = getattr(PCG64, "state", None)
        if orig_state_prop is None or not hasattr(orig_state_prop, "fset") or orig_state_prop.fset is None:
            raise first_err

        orig_fset = orig_state_prop.fset

        def _patched_state_set(self, state):
            return orig_fset(self, _pcg64_state_to_dict(state))

        patched_state_prop = property(
            orig_state_prop.fget,
            _patched_state_set,
            orig_state_prop.fdel,
            orig_state_prop.__doc__,
        )

        # Apply both patches
        np_random_pickle.__bit_generator_ctor = _patched_bit_generator_ctor  # type: ignore
        setattr(PCG64, "state", patched_state_prop)

        try:
            return joblib.load(str(path))
        finally:
            # Restore both patches
            np_random_pickle.__bit_generator_ctor = orig_ctor  # type: ignore
            setattr(PCG64, "state", orig_state_prop)

    except Exception as retry_err:
        raise ValueError(
            "Failed to load model bundle due to NumPy RNG pickle incompatibility.\n"
            f"First load error: {first_err}\n"
            f"Retry error: {retry_err}\n"
            "Permanent fix:\n"
            "  - Re-export model.joblib using the SAME NumPy version as this Ion runtime, or pin NumPy to match training.\n"
        ) from first_err
        
        

        
# -----------------------------------------------------------------------------
# Scoring + output
# -----------------------------------------------------------------------------
def score_candidates(bundle: ModelBundle, cands: List[Dict[str, object]]) -> pd.DataFrame:
    feat_rows: List[Dict[str, float]] = []
    for c in cands:
        feat_rows.append(
            featurize_row(
                fwd=str(c["forward_primer"]),
                rev=str(c["reverse_primer"]),
                probe=str(c.get("probe", "")),
                amp=str(c["amplicon"]),
                use_primer3=bool(bundle.use_primer3),
                use_rnafold=bool(bundle.use_rnafold),
            )
        )
    X = pd.DataFrame(feat_rows).fillna(0.0)

    for col in bundle.feature_columns:
        if col not in X.columns:
            X[col] = 0.0
    X = X[bundle.feature_columns].copy()

    proba = np.asarray(bundle.pipeline.predict_proba(X)[:, 1], dtype=float)

    out = pd.DataFrame(cands)
    out["prob_good_ct_lt_threshold"] = proba
    out["ct_threshold_used"] = float(bundle.ct_threshold)
    out["decision_threshold_star"] = float(bundle.decision_threshold)
    return out


# -----------------------------------------------------------------------------
# Deduping / spacing
# -----------------------------------------------------------------------------
def dedupe_exact(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove exact duplicates caused by overlapping windows.
    Considered duplicate if same coords + same primers (+ probe).
    """
    if df.empty:
        return df
    return df.drop_duplicates(
        subset=["amp_start", "amp_end", "forward_primer", "reverse_primer", "probe"],
        keep="first",
    ).reset_index(drop=True)


def enforce_spacing(df: pd.DataFrame, min_sep: int) -> pd.DataFrame:
    """
    Keep hits whose amp_start are at least min_sep apart.
    Assumes df is already sorted best->worst.
    """
    if df.empty or min_sep <= 0:
        return df
    kept = []
    starts: List[int] = []
    for _, r in df.iterrows():
        s = int(r["amp_start"])
        if all(abs(s - ss) >= min_sep for ss in starts):
            kept.append(r)
            starts.append(s)
    return pd.DataFrame(kept).reset_index(drop=True)


def topn_as_payload(df: pd.DataFrame, topn: int) -> Dict[str, Any]:
    hits = df.head(topn).to_dict(orient="records")
    return {
        "n_candidates": int(len(df)),
        "n_returned": int(len(hits)),
        "ct_threshold_used": float(df["ct_threshold_used"].iloc[0]) if len(df) else None,
        "decision_threshold_star": float(df["decision_threshold_star"].iloc[0]) if len(df) else None,
        "hits": hits,
    }


# -----------------------------------------------------------------------------
# Ion entrypoint
# -----------------------------------------------------------------------------
def ion_main() -> None:
    inp = works.param(1) if _HAS_ION else None
    modelp = works.param(2) if _HAS_ION else None
    outp = works.param(3) if _HAS_ION else None
    optp = works.param(4) if _HAS_ION else None

    model_path = _normalize_path(modelp, default=DEFAULT_MODEL) or DEFAULT_MODEL
    out_path = _normalize_path(outp, default=None)

    options: Dict[str, Any] = {}
    if isinstance(optp, str) and optp.strip():
        try:
            options = json.loads(optp)
        except Exception:
            options = {}
    elif isinstance(optp, dict):
        options = optp

    topn = int(options.get("topn", 10))
    product_min = int(options.get("product_min", 60))
    product_max = int(options.get("product_max", 120))
    window_size = int(options.get("window_size", 260))
    step = int(options.get("step", 10))
    max_designs = int(options.get("max_designs", 3000))
    relax = bool(options.get("relax", True))
    no_probe = bool(options.get("no_probe", True))
    debug_primer3 = bool(options.get("debug_primer3", False))

    # dedupe + spacing knobs
    dedupe = bool(options.get("dedupe", True))
    min_sep = int(options.get("min_sep", 150))  # set 0 to disable

    _progress(1, "Parsing input sequence...")
    name, raw_seq = _extract_first_sequence(inp)
    template = norm_rna_to_dna(raw_seq)

    if not template or len(template) < (product_min + 60):
        payload = {
            "error": "Input sequence is empty or too short after normalization.",
            "name": name,
            "raw_len": len(str(raw_seq)) if raw_seq is not None else 0,
            "clean_len": len(template),
        }
        payload = add_uid_everywhere(payload)  # <-- add uid at all levels
        if _HAS_ION:
            works.resolve(payload)
        else:
            print(json.dumps(payload, indent=2))
        return

    _progress(5, f"Loading model bundle from: {model_path}")
    bundle = load_modelbundle(model_path)

    allow_probe = not no_probe

    _progress(10, "Designing candidates with primer3 (windowed)...")
    cands = design_candidates_windowed(
        template,
        product_min=product_min,
        product_max=product_max,
        window_size=window_size,
        step=step,
        max_designs=max_designs,
        allow_probe=allow_probe,
        relax=relax,
        debug=debug_primer3,
    )

    if not cands:
        payload = {
            "error": "No primer3 candidates found (even after windowing).",
            "name": name,
            "clean_len": len(template),
            "suggestions": [
                "Try relax=true, no_probe=true",
                "Try product_min/product_max = 50..100",
                "Increase window_size (e.g., 320) and max_designs (e.g., 5000)",
                "Check transcript for long low-complexity/poly-A regions",
            ],
        }
        payload = add_uid_everywhere(payload)  # <-- add uid at all levels
        if _HAS_ION:
            works.resolve(payload)
        else:
            print(json.dumps(payload, indent=2))
        return

    _progress(55, f"Scoring {len(cands)} candidates with Ct model...")
    df = score_candidates(bundle, cands)

    _progress(75, "Ranking candidates...")
    df = df.sort_values(
        by=["prob_good_ct_lt_threshold", "p3_pair_penalty", "amp_len"],
        ascending=[False, True, True],
    ).reset_index(drop=True)

    # remove duplicates + spacing
    if dedupe:
        _progress(82, "De-duplicating exact amplicons...")
        df = dedupe_exact(df)

    if min_sep > 0:
        _progress(88, f"Enforcing min spacing (min_sep={min_sep})...")
        df = enforce_spacing(df, min_sep=min_sep)

    topn = max(1, topn)
    topdf = df.head(topn).copy()

    # uid should already exist from candidate creation; ensure it does
    if "uid" not in topdf.columns:
        topdf.insert(0, "uid", [str(uuid.uuid4()) for _ in range(len(topdf))])

    topdf.insert(1, "transcript_id", name)

    if out_path:
        _progress(90, f"Writing output: {out_path}")
        if out_path.lower().endswith(".xlsx"):
            topdf.to_excel(out_path, index=False)
        else:
            topdf.to_csv(out_path, index=False)

    payload = topn_as_payload(topdf, topn=topn)
    payload["transcript_id"] = name
    payload["clean_len"] = len(template)
    payload["params"] = {
        "topn": topn,
        "product_min": product_min,
        "product_max": product_max,
        "window_size": window_size,
        "step": step,
        "max_designs": max_designs,
        "relax": relax,
        "no_probe": no_probe,
        "dedupe": dedupe,
        "min_sep": min_sep,
        "model_path": model_path,
    }

    # NEW: add uid to EVERY dict at EVERY nesting level in the payload
    payload = add_uid_everywhere(payload)

    _progress(100, "Done.")
    if _HAS_ION:
        works.resolve(payload)
    else:
        print(json.dumps(payload, indent=2))


# -----------------------------------------------------------------------------
# CLI entrypoint (optional)
# -----------------------------------------------------------------------------
def cli_main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="FASTA path or raw sequence or JSON list")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="model.joblib path or directory containing model.joblib")
    ap.add_argument("--out", default="", help="optional CSV/XLSX output path")
    ap.add_argument("--topn", type=int, default=10)

    ap.add_argument("--product-min", type=int, default=60)
    ap.add_argument("--product-max", type=int, default=120)
    ap.add_argument("--window-size", type=int, default=260)
    ap.add_argument("--step", type=int, default=10)
    ap.add_argument("--max-designs", type=int, default=3000)
    ap.add_argument("--relax", action="store_true", help="Relax primer3 constraints")
    ap.add_argument("--no-probe", action="store_true", help="SYBR mode (no probe)")
    ap.add_argument("--debug-primer3", action="store_true")

    # dedupe + spacing
    ap.add_argument("--dedupe", action="store_true", help="Remove exact duplicate amplicons")
    ap.add_argument("--min-sep", type=int, default=150, help="Minimum spacing between returned amplicons (0 disables)")
    args = ap.parse_args()

    name, raw = _extract_first_sequence(args.input)
    template = norm_rna_to_dna(raw)
    if not template or len(template) < args.product_min + 60:
        raise SystemExit("Input sequence is empty/too short after normalization.")

    bundle = load_modelbundle(args.model)
    cands = design_candidates_windowed(
        template,
        product_min=args.product_min,
        product_max=args.product_max,
        window_size=args.window_size,
        step=args.step,
        max_designs=args.max_designs,
        allow_probe=not args.no_probe,
        relax=bool(args.relax),
        debug=bool(args.debug_primer3),
    )
    if not cands:
        raise SystemExit("No primer3 candidates found.")

    df = score_candidates(bundle, cands).sort_values(
        by=["prob_good_ct_lt_threshold", "p3_pair_penalty", "amp_len"],
        ascending=[False, True, True],
    ).reset_index(drop=True)

    if args.dedupe:
        df = dedupe_exact(df)
    if args.min_sep > 0:
        df = enforce_spacing(df, min_sep=args.min_sep)

    topdf = df.head(max(1, args.topn)).copy()

    # uid should already exist from candidate creation; ensure it does
    if "uid" not in topdf.columns:
        topdf.insert(0, "uid", [str(uuid.uuid4()) for _ in range(len(topdf))])

    topdf.insert(1, "transcript_id", name)

    if args.out:
        if args.out.lower().endswith(".xlsx"):
            topdf.to_excel(args.out, index=False)
        else:
            topdf.to_csv(args.out, index=False)

    print(topdf.to_string(index=False))


if __name__ == "__main__":
    if _HAS_ION:
        ion_main()
    else:
        cli_main()
"""Where the model and its reference tables live.

Resolution order mirrors bajaclip / bajasplice:

    1. explicit argument
    2. environment variable (DJPRIMER_MODEL, DJPRIMER_GTEX, DJPRIMER_HPA)
    3. the copy bundled with the package
"""
from __future__ import annotations

import os
from pathlib import Path

__all__ = ["resolve_model", "resolve_expression"]


def resolve_model(model=None, name: str = "djprimer_model.v1") -> Path:
    """Path to load the model bundle from (an override or the bundled copy)."""
    if model:
        return Path(model)
    env = os.environ.get("DJPRIMER_MODEL")
    if env:
        return Path(env)
    from djprimer.weights import bundled
    b = bundled(name)
    if b is not None:
        return b
    raise FileNotFoundError(
        f"no model for '{name}'. Set DJPRIMER_MODEL or pass model=...")


def resolve_expression(kind: str, path=None) -> Path:
    """Path to a per-gene expression table ('gtex' or 'hpa')."""
    if path:
        return Path(path)
    env = os.environ.get(f"DJPRIMER_{kind.upper()}")
    if env:
        return Path(env)
    from djprimer.weights import expression_path
    p = expression_path(kind)
    if p is not None:
        return p
    raise FileNotFoundError(
        f"no bundled '{kind}' expression table. Set DJPRIMER_{kind.upper()} or pass path=...")

"""Where the model weights live.

Resolution order for the checkpoint mirrors bajasplice:

    1. explicit argument
    2. BAJACLIP_CKPT environment variable
    3. the copy bundled with the package
"""
from __future__ import annotations

import os
from pathlib import Path

__all__ = ["resolve_checkpoint", "reliable_table"]


def resolve_checkpoint(ckpt=None, name: str = "bajaclip_predict.v1") -> Path:
    """Where to load weights from (a retrained copy or the bundled one)."""
    if ckpt:
        return Path(ckpt)
    env = os.environ.get("BAJACLIP_CKPT")
    if env:
        return Path(env)
    from bajaclip.weights import bundled
    b = bundled(name)
    if b is not None:
        return b
    raise FileNotFoundError(
        f"no checkpoint for '{name}'. Set BAJACLIP_CKPT or pass ckpt=...")


def reliable_table() -> Path | None:
    """Path to the reliable-RBP table, or None if it isn't bundled."""
    env = os.environ.get("BAJACLIP_RELIABLE")
    if env and Path(env).exists():
        return Path(env)
    from bajaclip.weights import reliable_path
    return reliable_path()

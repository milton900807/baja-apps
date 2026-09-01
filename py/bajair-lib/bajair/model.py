"""Load the bundled retention scorer and place a score on the calibration."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from joblib import load as _joblib_load

from bajair import weights

__all__ = ["Scorer", "load_model", "tier_for"]


@dataclass
class Scorer:
    clf: object
    features: list
    meta: dict
    calibration: dict

    @property
    def tiers(self):
        return self.calibration.get("tiers", [])

    def threshold(self, tier: str = "notable") -> float:
        for t in self.tiers:
            if t["name"] == tier:
                return float(t["threshold"])
        raise ValueError(f"unknown tier {tier!r}; have "
                         f"{[t['name'] for t in self.tiers]}")


_CACHE = {}


def load_model(name: str = "ir_scorer", path=None) -> Scorer:
    key = str(path or name)
    if key not in _CACHE:
        p = path or weights.bundled(name)
        if p is None:
            raise FileNotFoundError(
                f"no bundled model {name!r}. Fit one with "
                f"`python3 src/fit_model.py` in the retained_introns project.")
        b = _joblib_load(str(p))
        _CACHE[key] = Scorer(clf=b["clf"], features=list(b["features"]),
                             meta=weights.metadata(name),
                             calibration=weights.calibration(name))
    return _CACHE[key]


def tier_for(score: float, scorer: Scorer) -> Optional[dict]:
    """The highest tier this score reaches, or None if it reaches none.

    None is the normal case and means the intron is not reported at all.
    Tiers are ordered strongest first in the calibration file.
    """
    for t in scorer.tiers:
        if score >= t["threshold"]:
            return t
    return None

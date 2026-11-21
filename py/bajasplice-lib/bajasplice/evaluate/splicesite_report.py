"""One table for the splice-site task: baselines first, then the models.

Reads whatever metric files exist in <root>/results and prints the rows in the
order a reader should believe them: the motif-only PWM, the other species'
model run zero-shot, then every model trained here. A model row means
something only relative to the rows above it.
"""
from __future__ import annotations

import glob
import json
import os

from bajasplice.config import paths, species


def _row(label, m, note=""):
    def f(k):
        v = m.get(k)
        return "  n/a " if v is None else f"{v:6.3f}"
    return (f"{label:34s} {f('acceptor_prauc')}  {f('donor_prauc')}  "
            f"{f('acceptor_topk')}  {f('donor_topk')}  {note}")


def collect():
    res = paths().results
    rows = []
    p = os.path.join(res, "baseline_pwm_metrics.json")
    if os.path.exists(p):
        rows.append(("PWM baseline (motif only)", json.load(open(p)), ""))
    for p in sorted(glob.glob(os.path.join(res, "zero_shot_*_metrics.json"))):
        d = json.load(open(p))
        m = d.get("test") or d.get("val") or {}
        note = "orthologs seen in training" + ("" if "test" in d else "; VAL split")
        rows.append((f"{d.get('trained_on', '?')} model, zero-shot", m, note))
    for p in sorted(glob.glob(os.path.join(res, "*_metrics.json"))):
        name = os.path.basename(p)[:-len("_metrics.json")]
        if name.startswith(("zero_shot_", "baseline_")):
            continue
        d = json.load(open(p))
        if "test" not in d or "acceptor_prauc" not in d["test"]:
            continue
        init = d.get("init_from_species")
        note = f"initialised from {init}; orthologs seen" if init else "from scratch"
        rows.append((f"SpliceNet {name}", d["test"], note))
    return rows


def main():
    sp = species()
    rows = collect()
    if not rows:
        raise SystemExit(f"no splice-site metrics in {paths().results} yet")
    n = next((m.get("n_positions") for _, m, _ in rows if m.get("n_positions")), None)
    print(f"Splice sites, {sp.label} ({sp.assembly})"
          + (f", {n:,} test positions" if n else ""))
    print(f"{'model':34s} {'acc PR':>6s}  {'don PR':>6s}  {'acc tk':>6s}  {'don tk':>6s}")
    for r in rows:
        print(_row(*r))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

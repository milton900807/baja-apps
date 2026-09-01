"""Turn a scored intron into something a person can read.

The model is two features in a trenchcoat -- intron length and GC -- with the
splice-site scores adding a little at the margin. A description that says so is
more useful than a bare probability, because the reader can immediately see
whether the call rests on anything they believe.

Every description carries the measured precision of its tier. A "strong" hit is
right about 37% of the time, and saying that plainly is the difference between a
shortlist and a claim.
"""
from __future__ import annotations

__all__ = ["describe"]

SHORT = 250          # nt, below which an intron reads as short
LONG = 3000
GC_HIGH = 0.55
GC_LOW = 0.40
WEAK_SITE = 0.90


def _headline(r, short, gc_high):
    if short and gc_high:
        return "Short and GC-rich, the classic retained-intron profile"
    if short:
        return "Unusually short intron"
    if gc_high:
        return "GC-rich intron"
    return "Retention-prone on the combined features"


def describe(r, tier, scorer):
    """r: a mapping with the intron's features. tier: from tier_for()."""
    ref = scorer.calibration.get("reference", {})
    ref_len = ref.get("clean_median_len", 1562)
    ref_gc = ref.get("clean_median_gc", 0.437)

    length = int(r["intron_len"])
    gc = float(r["gc_intron"])
    short, gc_high = length <= SHORT, gc >= GC_HIGH

    ev = []
    if length <= ref_len / 2:
        ev.append(f"{length:,} nt, {ref_len / max(length, 1):.0f}x shorter than "
                  f"the typical annotated intron ({ref_len:,} nt)")
    elif length >= LONG:
        ev.append(f"{length:,} nt, longer than typical, which argues against retention")
    else:
        ev.append(f"{length:,} nt, near the typical {ref_len:,} nt")

    if gc >= GC_HIGH:
        ev.append(f"GC {gc:.2f}, well above the {ref_gc:.2f} of a typical intron")
    elif gc <= GC_LOW:
        ev.append(f"GC {gc:.2f}, below typical, which argues against retention")
    else:
        ev.append(f"GC {gc:.2f}, near typical")

    d, a = float(r.get("ss_donor", float("nan"))), float(r.get("ss_acceptor", float("nan")))
    if d == d and a == a:
        if min(d, a) < WEAK_SITE:
            which = "donor" if d < a else "acceptor"
            ev.append(f"weak {which} site ({min(d, a):.2f}), so the intron may simply "
                      f"be spliced inefficiently")
        else:
            ev.append(f"both splice sites strong ({d:.2f} donor, {a:.2f} acceptor), "
                      f"so this is not a weak-site artifact")

    n = int(r.get("n_introns", 0) or 0)
    k = int(r.get("intron_number", 0) or 0)
    if n and k:
        where = "first" if k == 1 else "last" if k == n else f"{k} of {n}"
        ev.append(f"intron {where}")

    prec, lift = tier["precision"], tier["lift"]
    base = scorer.calibration.get("base_rate", 0.0376)
    expect = (f"Introns scoring this high are measurably retained in {prec:.0%} of "
              f"cases ({lift:.1f}x the {base:.1%} background). Median measured "
              f"retention among them is {tier['median_measured_ir']:.0%}.")

    return {
        "tier": tier["name"],
        "headline": _headline(r, short, gc_high),
        "evidence": ev,
        "expect": expect,
        "caveat": ("Average propensity across tissues. Condition-specific retention "
                   "-- stress, differentiation, a single cell type -- is not modelled "
                   "and will not appear here."),
        "text": _headline(r, short, gc_high) + ". " + "; ".join(ev) + ". " + expect,
    }

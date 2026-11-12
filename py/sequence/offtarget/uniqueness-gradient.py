"""Uniqueness / repeat gradient along a transcript.

For every window of size k (3-30) sliding along a transcript, score two things
that fail independently and are therefore never collapsed into one number
before the caller sees both:

  complexity  intrinsic repetitiveness of the window itself: composition
              entropy, longest homopolymer, strongest tandem periodicity
              (chance-corrected), DUST-style triplet redundancy. Needs no
              reference and is defined for every k from 3 to 30.

  off/on      occurrences of the window elsewhere, from the existing 2-bit
              off-target indexes (see README.md in this directory). Hits in the
              contig set carrying the on-target gene symbol are counted as
              on-target -- that covers both the transcript itself and its
              orthologue in each other species -- and everything else is
              off-target.

The composite `score` is complexity x 1/(1+worst off-target across species), so
a window scores well only when it is both locally clean and absent elsewhere.

This deliberately reuses `search.py`'s index rather than carrying its own
reference data: baja-server already builds and refreshes those indexes per
species, they are 2-bit packed and mmap'd, and their contigs already carry gene
symbols.

Params (from JS via exec, after the EngineMonitor):
  param(1) : transcript sequence (string)
  param(2) : window size k, 3-30. Default 20.
  param(3) : species list, e.g. ["human","mouse","rat","dog","cyno"], or raw
             index names. Default ["human"].
  param(4) : on-target gene symbol. Strongly recommended: without it the
             transcript's own gene counts as an off-target and the whole track
             looks non-unique.
  param(5) : stride in nt between scored windows. Default 1 for exact mode.
  param(6) : mode, "exact" (default) or "editdistance".
  param(7) : edit distance 0-3, editdistance mode only. Default 2.

Resolves {mode, k, stride, nWindows, species, gradient (JSON), warnings}.
"""

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import search as ots            # noqa: E402  index loading, decoding, search

K_MIN, K_MAX = 3, 30
MIN_MEANINGFUL_K = 12           # below this, see the note in `warnings`
MAX_PERIOD = 6
EDITDIST_MAX_WINDOWS = 400      # editdistance mode is ~0.1 s/window/species

# Species -> off-target index names. Mirrors SPECIES_INDEX in
# py/sequence/prompt-to-transcript.py; keep the two in sync, as with the
# _ALIASES table in search.py.
SPECIES_INDEX = {
    "human": ["human_cdna", "human_all_transcripts", "human_cdna_all"],
    "mouse": ["mouse_cdna"],
    "rat": ["rat_cdna"],
    "dog": ["dog_cdna"],
    "cyno": ["monkey_cyno_cdna"],
    "cynomolgus monkey": ["monkey_cyno_cdna"],
    "nhp": ["monkey_cyno_cdna", "monkey_rhesus_cdna"],
    "rhesus": ["monkey_rhesus_cdna"],
    "rhesus macaque": ["monkey_rhesus_cdna"],
    "yeast": ["yeast_cdna"],
}

_LUT = np.full(256, 255, dtype=np.uint8)
for _c, _v in (("A", 0), ("C", 1), ("G", 2), ("T", 3), ("U", 3),
               ("a", 0), ("c", 1), ("g", 2), ("t", 3), ("u", 3)):
    _LUT[ord(_c)] = _v


# --- sequence helpers ---------------------------------------------------------
def encode(seq):
    """ACGT/acgt/U -> 0..3, anything else -> 255."""
    return _LUT[np.frombuffer(str(seq).encode("ascii", "replace"), dtype=np.uint8)]


def rolling_codes(codes, w):
    """2-bit packed code of every w-window; -1 where the window holds an N."""
    n = len(codes) - w + 1
    if n <= 0:
        return np.zeros(0, dtype=np.int64)
    acc = np.zeros(n, dtype=np.int64)
    bad = np.zeros(n, dtype=bool)
    for j in range(w):
        seg = codes[j:j + n]
        acc = (acc << 2) | (seg & 3).astype(np.int64)
        bad |= seg == 255
    acc[bad] = -1
    return acc


# --- intrinsic complexity -----------------------------------------------------
def window_complexity(codes, k):
    """Per-window metrics, oriented so 1.0 = complex and 0.0 = repetitive."""
    from numpy.lib.stride_tricks import sliding_window_view

    W = sliding_window_view(codes, k)
    has_n = (W == 255).any(axis=1)
    Wc = np.where(W == 255, 0, W)

    counts = np.stack([(Wc == b).sum(axis=1) for b in range(4)], axis=1).astype(float)
    p = counts / max(k, 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        terms = np.where(p > 0, p * np.log(p), 0.0)
    entropy = -terms.sum(axis=1) / np.log(min(4, k))

    same = Wc[:, 1:] == Wc[:, :-1]
    best = np.ones(Wc.shape[0], dtype=np.int32)
    run = np.ones(Wc.shape[0], dtype=np.int32)
    for j in range(same.shape[1]):
        run = np.where(same[:, j], run + 1, 1)
        best = np.maximum(best, run)
    homo = best

    tandem = np.zeros(Wc.shape[0])
    period = np.zeros(Wc.shape[0], dtype=np.int8)
    for pr in range(1, min(MAX_PERIOD, k - 1) + 1):
        frac = (Wc[:, pr:] == Wc[:, :-pr]).mean(axis=1)
        better = frac > tandem
        tandem = np.where(better, frac, tandem)
        period = np.where(better, pr, period)
    # Random sequence matches position+p a quarter of the time, so chance-correct
    # before penalising: raw 0.42 at period 6 is noise, not a repeat.
    tandem_adj = np.clip((tandem - 0.25) / 0.75, 0, 1)

    if k >= 4:
        trip = Wc[:, :-2].astype(np.int32) * 16 + Wc[:, 1:-1] * 4 + Wc[:, 2:]
        s = np.sort(trip, axis=1)
        eq = s[:, 1:] == s[:, :-1]
        dust = np.zeros(Wc.shape[0])
        run = np.ones(Wc.shape[0], dtype=np.int32)
        for j in range(eq.shape[1]):
            run = np.where(eq[:, j], run + 1, 1)
            dust += np.where(eq[:, j], run - 1, 0)
        n_trip = trip.shape[1]
        dust = dust / (n_trip * (n_trip - 1) / 2) if n_trip > 1 else dust
    else:
        dust = np.zeros(Wc.shape[0])

    homo_term = 1.0 - np.clip((homo - 4) / max(k - 4, 1), 0, 1)
    composite = (0.35 * entropy + 0.25 * (1.0 - tandem_adj)
                 + 0.20 * homo_term + 0.20 * (1.0 - dust))
    composite = np.where(has_n, np.nan, np.clip(composite, 0, 1))
    return {"complexity": composite, "entropy": entropy, "maxHomopolymer": homo,
            "tandemFraction": tandem, "tandemPeriod": period, "dust": dust,
            "hasAmbiguous": has_n}


# --- reference occurrence -----------------------------------------------------
def open_index(name):
    return ots.load_index(ots.resolve_index_dir(name))


def resolve_species(entry):
    """A species key -> the first index name that actually exists on disk."""
    names = SPECIES_INDEX.get(str(entry).strip().lower(), [str(entry)])
    for n in names:
        try:
            ots.resolve_index_dir(n)
            return n
        except KeyError:
            continue
    return None


def exact_counts(idx, qcodes, k, starts, on_symbol):
    """Exact occurrences of each window, split on-target / off-target.

    Seeded off the index's W-mer CSR rather than scanning the whole reference:
    a linear 2-bit sweep is ~30x more work on a 440 Mbp transcriptome. When the
    window is long enough to carry two disjoint seeds (k >= 2W) the two
    candidate position sets are intersected first, which drops the candidate
    volume by ~4^W and leaves almost nothing to verify.
    """
    W = idx["W"]
    off_csr = idx["offsets"]
    pos = idx["positions"]
    coff = idx["contig_off"]
    symbols = idx["symbols"]

    seed = rolling_codes(qcodes, W)
    on = np.zeros(len(starts), dtype=np.int64)
    off = np.zeros(len(starts), dtype=np.int64)
    examples = {}

    for i, s in enumerate(starts):
        s = int(s)
        if s >= len(seed) or seed[s] < 0:
            on[i] = off[i] = -1
            continue
        c0 = int(seed[s])
        cand = np.asarray(pos[off_csr[c0]:off_csr[c0 + 1]], dtype=np.int64)
        if k >= 2 * W and (s + W) < len(seed) and seed[s + W] >= 0:
            c1 = int(seed[s + W])
            other = np.asarray(pos[off_csr[c1]:off_csr[c1 + 1]], dtype=np.int64) - W
            cand = np.intersect1d(cand, other, assume_unique=False)
        if cand.size == 0:
            continue

        win = ots._decode_windows(idx, cand, k)
        hit = (win == qcodes[s:s + k][None, :]).all(axis=1)
        cand = cand[hit]
        if cand.size == 0:
            continue

        ci = np.searchsorted(coff, cand, side="right") - 1
        inside = (cand + k) <= coff[ci + 1]
        cand, ci = cand[inside], ci[inside]
        if cand.size == 0:
            continue
        # N-runs are excluded from the seed index at build time, but the tail of
        # a window can still overlap one; decoding maps N to A, so verify.
        ok = np.array([ots._window_ok(idx, int(a), int(a) + k) for a in cand])
        cand, ci = cand[ok], ci[ok]

        if on_symbol:
            is_on = np.array([symbols[int(c)] == on_symbol for c in ci], dtype=bool)
        else:
            is_on = np.zeros(len(ci), dtype=bool)
        on[i] = int(is_on.sum())
        off[i] = int(len(ci) - on[i])
        if off[i] and len(examples) < 50:
            j = int(np.flatnonzero(~is_on)[0])
            examples[int(s)] = {"contig": idx["names"][int(ci[j])],
                                "start": int(cand[j] - coff[int(ci[j])])}
    return on, off, examples


def editdistance_counts(index_name, seq, k, starts, dist, on_symbol):
    """Mismatch-tolerant counts, delegated wholesale to search.py."""
    oligos = [{"id": int(s), "synthesisSequence": seq[int(s):int(s) + k]}
              for s in starts]
    res = ots.search([index_name], oligos, int(dist), "+-")
    by_id = {str(o.get("id")): o for o in res.get("oligoQuery", [])}
    on = np.zeros(len(starts), dtype=np.int64)
    off = np.zeros(len(starts), dtype=np.int64)
    idx = open_index(index_name)
    sym_of = dict(zip(idx["names"], idx["symbols"]))
    for i, s in enumerate(starts):
        rec = by_id.get(str(int(s)))
        if not rec:
            on[i] = off[i] = -1
            continue
        for h in rec.get("offtarget", []) or []:
            if on_symbol and sym_of.get(h.get("chr"), "") == on_symbol:
                on[i] += 1
            else:
                off[i] += 1
    return on, off, {}


# --- entry point --------------------------------------------------------------
def run(sequence, k=20, species=None, on_symbol=None, stride=None,
        mode="exact", dist=2, progress=lambda p: None):
    warnings = []
    k = int(k)
    if not K_MIN <= k <= K_MAX:
        raise ValueError("window size must be %d-%d, got %d" % (K_MIN, K_MAX, k))
    if k < MIN_MEANINGFUL_K:
        warnings.append({
            "scope": "k",
            "reason": ("k=%d: a reference of R bases holds any k-mer about R/4^k "
                       "times by chance, so off-target counts at this window size "
                       "describe the alphabet rather than the transcript. The "
                       "complexity track is still meaningful." % k)})

    seq = "".join(str(sequence).split()).upper().replace("U", "T")
    codes = encode(seq)
    if len(codes) < k:
        raise ValueError("sequence (%d nt) shorter than the window (%d)" % (len(codes), k))

    comp = window_complexity(codes, k)
    n_win = len(comp["complexity"])

    mode = (mode or "exact").lower()
    stride = int(stride) if stride else (1 if mode == "exact" else
                                         max(1, n_win // EDITDIST_MAX_WINDOWS))
    starts = np.arange(0, n_win, stride)

    species = species or ["human"]
    if isinstance(species, str):
        species = [s for s in species.replace(",", " ").split() if s]

    per_species, used = {}, []
    for n, entry in enumerate(species):
        index_name = resolve_species(entry)
        if index_name is None:
            warnings.append({"scope": str(entry),
                             "reason": "no off-target index on this server for "
                                       "'%s'; it is skipped" % entry})
            continue
        try:
            if mode == "editdistance":
                on, off, ex = editdistance_counts(index_name, seq, k, starts,
                                                  dist, on_symbol)
            else:
                idx = open_index(index_name)
                if k < idx["W"]:
                    warnings.append({
                        "scope": str(entry),
                        "reason": "k=%d is below the index seed length W=%d, so "
                                  "windows cannot be seeded; reference counts are "
                                  "omitted for this species" % (k, idx["W"])})
                    continue
                on, off, ex = exact_counts(idx, codes, k, starts, on_symbol)
        except Exception as exc:                        # noqa: BLE001
            warnings.append({"scope": str(entry),
                             "reason": "%s: %s" % (exc.__class__.__name__, exc)})
            continue
        per_species[str(entry)] = {"index": index_name,
                                   "on": on.tolist(), "off": off.tolist(),
                                   "examples": ex}
        used.append(str(entry))
        progress(int(100 * (n + 1) / max(len(species), 1)))

    complexity = comp["complexity"][starts]
    if per_species:
        offs = np.vstack([np.asarray(v["off"], dtype=float) for v in per_species.values()])
        offs = np.where(offs < 0, np.nan, offs)
        worst = np.nanmax(offs, axis=0)
        uniqueness = 1.0 / (1.0 + np.nan_to_num(worst, nan=0.0))
        ons = np.vstack([np.asarray(v["on"], dtype=float) for v in per_species.values()])
        conserved = (ons >= 1).sum(axis=0).astype(int)
    else:
        worst = np.full(len(starts), np.nan)
        uniqueness = np.full(len(starts), np.nan)
        conserved = np.zeros(len(starts), dtype=int)
        warnings.append({"scope": "reference",
                         "reason": "no reference index was scanned; the score is "
                                   "the complexity track alone"})

    score = complexity * uniqueness if per_species else complexity

    def clean(a):
        return [None if (x is None or (isinstance(x, float) and np.isnan(x))) else
                (round(float(x), 4) if isinstance(x, float) else x) for x in a]

    gradient = {
        "position": [int(s) + 1 for s in starts],            # 1-based window start
        "center": [float(s) + 1 + (k - 1) / 2.0 for s in starts],
        "complexity": clean(complexity),
        "uniqueness": clean(uniqueness),
        "worstOffTarget": clean(worst),
        "speciesOnTarget": [int(c) for c in conserved],
        "score": clean(score),
        "perSpecies": {kk: {"index": v["index"], "on": v["on"], "off": v["off"],
                            "examples": v["examples"]}
                       for kk, v in per_species.items()},
    }
    return {"mode": mode, "k": k, "stride": stride, "nWindows": int(len(starts)),
            "sequenceLength": len(seq), "species": used, "geneSymbol": on_symbol,
            "editDistance": int(dist) if mode == "editdistance" else 0,
            "gradient": json.dumps(gradient), "warnings": warnings}


def _main_cli(argv):
    """Testing entry point: uniqueness-gradient.py <fasta> <k> <species> [symbol]"""
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("fasta")
    ap.add_argument("--k", type=int, default=20)
    ap.add_argument("--species", default="human")
    ap.add_argument("--gene", default=None)
    ap.add_argument("--stride", type=int, default=None)
    ap.add_argument("--mode", default="exact")
    ap.add_argument("--dist", type=int, default=2)
    a = ap.parse_args(argv)
    seq = "".join(l.strip() for l in open(a.fasta) if not l.startswith(">"))
    out = run(seq, a.k, a.species.split(","), a.gene, a.stride, a.mode, a.dist)
    g = json.loads(out.pop("gradient"))
    print(json.dumps(out, indent=2))
    return g


if __name__ == "__main__":
    try:
        from ion import works
    except ImportError:
        _main_cli(sys.argv[1:])
    else:
        result = run(works.param(1), works.param(2) or 20, works.param(3),
                     works.param(4), works.param(5), works.param(6) or "exact",
                     works.param(7) or 2, progress=works.progress)
        works.progress(100)
        works.resolve(result)

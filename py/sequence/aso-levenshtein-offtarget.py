import json
from ion import works

# ---------------------------------------------------------------------------
# Levenshtein off-target scanner.
#
# The fuzzy counterpart to map-oligos-no-levenshtein.py: instead of exact-match
# sites, it slides each ASO (and its reverse / complement / reverse-complement)
# across a reference sequence and reports every window whose edit distance to
# the ASO is within a tolerance -- i.e. candidate off-target binding sites.
#
# Params (passed from JS via exec, after the EngineMonitor):
#   param(1) : list of ASO sequences. Either plain strings, or objects
#              {name, seq}. A single string is also accepted.
#   param(2) : reference DNA/RNA sequence to scan against.
#   param(3) : max Levenshtein distance (off-target tolerance). Default 2.
#   param(4) : optional parallel list of ASO names (used when param(1) is a
#              list of bare sequence strings).
# ---------------------------------------------------------------------------

asos_in = works.param(1)
sequence = works.param(2)
max_dist = works.param(3)
names_in = works.param(4)

# --- normalise the tolerance -------------------------------------------------
try:
    max_dist = int(max_dist)
except (TypeError, ValueError):
    max_dist = 2
if max_dist < 0:
    max_dist = 0

# --- normalise the ASO list --------------------------------------------------
if asos_in is None:
    asos_in = []
if isinstance(asos_in, str):
    s = asos_in.strip()
    if s.startswith("["):
        try:
            asos_in = json.loads(s)
        except Exception:
            asos_in = [asos_in]
    else:
        asos_in = [asos_in]

if not isinstance(names_in, list):
    names_in = []


def clean(seq):
    return str(seq).strip().upper().replace("U", "T")


def norm_aso(item, i):
    if isinstance(item, dict):
        name = item.get("name") or item.get("id") or ("ASO_%d" % (i + 1))
        seq = item.get("seq") or item.get("sequence") or ""
    else:
        name = names_in[i] if i < len(names_in) else ("ASO_%d" % (i + 1))
        seq = item
    return {"name": str(name), "seq": clean(seq)}


asos = [norm_aso(a, i) for i, a in enumerate(asos_in)]
asos = [a for a in asos if a["seq"]]

sequence = clean(sequence) if sequence else ""
seq_len = len(sequence)


# --- sequence variants (same set as the exact-match mapper) ------------------
def complement(seq):
    return seq.translate(str.maketrans("ATCG", "TAGC"))


def reverse(seq):
    return seq[::-1]


def variants(aso):
    return {
        "forward": aso,
        "reverse": reverse(aso),
        "complement": complement(aso),
        "reverse_complement": reverse(complement(aso)),
    }


# --- banded Levenshtein: bails out early once the distance exceeds max_k ------
def bounded_levenshtein(a, b, max_k):
    la, lb = len(a), len(b)
    if abs(la - lb) > max_k:
        return max_k + 1
    INF = max_k + 1
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        ca = a[i - 1]
        lo = max(1, i - max_k)
        hi = min(lb, i + max_k)
        row_min = cur[0]
        for j in range(1, lb + 1):
            if j < lo or j > hi:
                cur[j] = INF
                continue
            cost = 0 if ca == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if cur[j] < row_min:
                row_min = cur[j]
        if row_min > max_k:
            return INF
        prev = cur
    return prev[lb]


def scan(vseq, max_k):
    """Slide vseq across the reference; return hits within max_k, then keep a
    greedy non-overlapping set (best distance first) so each site appears once."""
    wlen = len(vseq)
    if wlen == 0 or seq_len == 0:
        return []
    raw = []
    # allow the window to run slightly past the end so trailing indels are seen
    last_start = seq_len - wlen + max_k
    for start in range(0, max(last_start, 0) + 1):
        window = sequence[start:start + wlen + max_k]
        if not window:
            break
        # try the exact-width window first, then width +/- for indels
        best = max_k + 1
        best_win = window[:wlen]
        for w in range(max(1, wlen - max_k), wlen + max_k + 1):
            sub = sequence[start:start + w]
            if not sub:
                continue
            d = bounded_levenshtein(vseq, sub, max_k)
            if d < best:
                best = d
                best_win = sub
                if best == 0:
                    break
        if best <= max_k:
            raw.append({"start": start, "end": start + len(best_win),
                        "distance": best, "match": best_win})
    # greedy non-overlapping selection
    raw.sort(key=lambda h: (h["distance"], h["start"]))
    chosen, occupied = [], []
    for h in raw:
        if any(not (h["end"] <= s or h["start"] >= e) for (s, e) in occupied):
            continue
        chosen.append(h)
        occupied.append((h["start"], h["end"]))
    chosen.sort(key=lambda h: h["start"])
    return chosen


# --- run ---------------------------------------------------------------------
results = []
total = max(len(asos), 1)

for idx, aso in enumerate(asos):
    hits = []
    if seq_len and aso["seq"]:
        for vname, vseq in variants(aso["seq"]).items():
            for h in scan(vseq, max_dist):
                hits.append({
                    "orientation": vname,
                    "start": h["start"],
                    "end": h["end"],
                    "distance": h["distance"],
                    "match": h["match"],
                })
        hits.sort(key=lambda h: (h["distance"], h["start"]))
    results.append({
        "aso": aso["name"],
        "seq": aso["seq"],
        "hitCount": len(hits),
        "offTargets": hits,
    })
    works.progress(int(100 * (idx + 1) / total))

works.progress(100)
works.resolve({
    "mode": "levenshtein-offtarget",
    "threshold": max_dist,
    "asoCount": len(asos),
    "sequenceLength": seq_len,
    "results": json.dumps(results),
})

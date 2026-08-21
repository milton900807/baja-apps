#!/usr/bin/env python3
"""
Off-target search over a prebuilt 2-bit / seed index (see build-index.py).

Finds, for each oligo (8-25 nt), every site in the indexed reference whose
Levenshtein (edit) distance to the oligo is <= k (k<=3), on both strands.

Algorithm: pigeonhole seed-and-verify. Split the query into k+1 disjoint seeds;
at least one seed must match exactly under <=k edits. Look up each seed's first
W bases (an exact anchor) in the CSR seed index, back-shift to a predicted oligo
start, then verify the candidate window with a banded bounded-Levenshtein
(indels included). Greedy non-overlapping dedupe; map global position back to
{chr,start,end}. Reverse-complement of the query gives the '-' strand.

Invoked one-shot (fresh process) by the server:
    python3 search.py jfile:<argsfile>
with ionworks params:
    (1) index name (str) or list of names
    (2) oligoQuery = [ {id, synthesisSequence}, ... ]
    (3) editDistance (int, clamped 0..3)
    (4) strand ("+", "-", or "+-")
    (5) runMode (optional)
Emits IONWORKS:RESOLUTION with {"oligoQuery":[...], "warnings":[...], ...}.

The core is importable (resolve_index_dir/load_index/search) so a persistent
Flask service can wrap it unchanged.
"""

import os
import sys
import json

import numpy as np

try:
    from ion import works  # type: ignore
except Exception:  # standalone / tests
    works = None

# result-shape constants -------------------------------------------------------
MAX_K = 3
MAXSTORE = 1000            # number of full hit objects returned
HARDCAP = 100000          # ceiling reported when there are "too many" hits
CANDIDATE_GUARD = 1500000  # above this candidate volume, don't enumerate -> count-only

_BASES = "ACGT"
_RC = str.maketrans("ACGT", "TGCA")
_CODE = {"A": 0, "C": 1, "G": 2, "T": 3}


def clean(seq):
    return str(seq).strip().upper().replace("U", "T")


def revcomp(seq):
    return seq.translate(_RC)[::-1]


# --- banded Levenshtein (verbatim from aso-levenshtein-offtarget.py:91) --------
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


# --- index name resolution + alias table -------------------------------------
# Legacy / UI-default names -> on-disk index directory names. Mirror of the
# alias map in baja-server so saved workflows keep resolving.
_ALIASES = {
    "Homo_sapiens.GRCh38.88.3utr": "human_all_transcripts",
    "3UTR_human": "human_3utr",
    "3UTR_mouse": "mouse_3utr",
}


def index_root():
    return os.environ.get("OFFTARGET_INDEX_DIR", "").strip()


def resolve_index_dir(name):
    root = index_root()
    for cand in (name, _ALIASES.get(name)):
        if not cand:
            continue
        d = os.path.join(root, cand)
        if os.path.exists(os.path.join(d, "meta.json")):
            return d
    raise KeyError("no local off-target index for '%s'" % name)


# --- index loading ------------------------------------------------------------
def load_index(index_dir):
    with open(os.path.join(index_dir, "meta.json")) as f:
        meta = json.load(f)
    with open(os.path.join(index_dir, "contigs.json")) as f:
        contigs = json.load(f)
    seq = np.memmap(os.path.join(index_dir, "seq.pack"), dtype=np.uint8, mode="r")
    return {
        "meta": meta,
        "W": int(meta["W"]),
        "seqLen": int(meta["seqLen"]),
        "contigs": contigs,
        "names": [c["name"] for c in contigs],
        "symbols": [c.get("symbol", "") for c in contigs],
        "seq": seq,
        "contig_off": np.load(os.path.join(index_dir, "contig.off.npy")),
        "nmask": np.load(os.path.join(index_dir, "nmask.iv.npy")),
        "offsets": np.load(os.path.join(index_dir, "kmer.offsets.npy")),
        "positions": np.load(os.path.join(index_dir, "kmer.positions.npy"),
                             mmap_mode="r"),
    }


def decode_slice(idx, a, b):
    """Decode global [a,b) (clamped) from the packed 2-bit sequence to a str."""
    a = max(0, a)
    b = min(idx["seqLen"], b)
    if b <= a:
        return ""
    g = np.arange(a, b, dtype=np.int64)
    byte = idx["seq"][g >> 2]
    shift = (6 - ((g & 3) << 1)).astype(np.uint8)
    codes = (byte >> shift) & 3
    return "".join(_BASES[c] for c in codes)


def _kmer_code(s):
    v = 0
    for ch in s:
        c = _CODE.get(ch)
        if c is None:
            return -1
        v = (v << 2) | c
    return v


def _contig_of(idx, g):
    ci = int(np.searchsorted(idx["contig_off"], g, side="right")) - 1
    return ci


def _window_ok(idx, a, b):
    """True if [a,b) lies within a single contig and touches no N-run."""
    if a < 0 or b > idx["seqLen"] or b <= a:
        return False
    if _contig_of(idx, a) != _contig_of(idx, b - 1):
        return False
    nm = idx["nmask"]
    if nm.size:
        # overlap if any run start < b and run end > a
        i = int(np.searchsorted(nm[:, 0], b, side="left"))
        # check the few runs ending after a
        for j in range(max(0, i - 1), i):
            if nm[j, 1] > a and nm[j, 0] < b:
                return False
        # also the run that may start before a but end after a
        lo = int(np.searchsorted(nm[:, 0], a, side="right")) - 1
        if 0 <= lo < nm.shape[0] and nm[lo, 1] > a and nm[lo, 0] < b:
            return False
    return True


def _anchors(qlen, k, W):
    """Return (offsets, approximate) -- query offsets of exact W-mer anchors."""
    n = k + 1
    s = qlen // n
    if s >= W:
        return [i * s for i in range(n)], False
    # seeds shorter than W: use as many disjoint W-mers as fit
    n_eff = qlen // W
    if n_eff <= 0:
        return [], True
    return [i * W for i in range(n_eff)], (k > n_eff - 1)


def _candidate_volume(idx, q, offs, W):
    off = idx["offsets"]
    vol = 0
    codes = []
    for qo in offs:
        c = _kmer_code(q[qo:qo + W])
        codes.append((qo, c))
        if c >= 0:
            vol += int(off[c + 1] - off[c])
    return vol, codes


def _candidates(idx, q, k, W):
    qlen = len(q)
    offs, approx = _anchors(qlen, k, W)
    if not offs:
        return None, approx  # cannot seed
    vol, codes = _candidate_volume(idx, q, offs, W)
    if vol > CANDIDATE_GUARD:
        return "too_many", approx
    off = idx["offsets"]
    pos = idx["positions"]
    starts = []
    for qo, c in codes:
        if c < 0:
            continue
        p = np.asarray(pos[off[c]:off[c + 1]], dtype=np.int64) - qo
        starts.append(p)
    if not starts:
        return np.zeros(0, dtype=np.int64), approx
    cand = np.unique(np.concatenate(starts))
    return cand, approx


_QLUT = np.full(256, 255, dtype=np.uint8)
for _c, _v in (("A", 0), ("C", 1), ("G", 2), ("T", 3)):
    _QLUT[ord(_c)] = _v


def _q_codes(q):
    return _QLUT[np.frombuffer(q.encode("ascii", "replace"), dtype=np.uint8)]


def _decode_windows(idx, starts, L):
    """Bulk-decode M windows of length L starting at global `starts` (may be
    out of range). Returns (M,L) uint8 codes with 255 marking invalid cells."""
    cols = np.arange(L, dtype=np.int64)
    g = starts[:, None] + cols[None, :]                 # (M, L) global positions
    seq_len = idx["seqLen"]
    valid = (g >= 0) & (g < seq_len)
    gc = np.clip(g, 0, seq_len - 1)
    byte = np.asarray(idx["seq"])[gc >> 2]              # (M, L) packed bytes
    shift = (6 - ((gc & 3) << 1)).astype(np.uint8)
    code = ((byte >> shift) & 3).astype(np.uint8)
    code[~valid] = 255
    return code


def _fitting_align(win, qcodes, k):
    """Vectorized fitting alignment of query q into every window row.

    Free start/end on the target (window), query fully consumed. Returns
    (dist, end_col) per row -- min edit distance and the target end position.
    255-sentinel cells count as a mismatch. int16 DP, banding via the final
    <=k filter (windows are short so full DP is cheap)."""
    M, L = win.shape
    Q = qcodes.shape[0]
    prev = np.zeros((M, L + 1), dtype=np.int16)          # D[0,j]=0 (free start)
    for i in range(1, Q + 1):
        qi = int(qcodes[i - 1])
        cur = np.empty((M, L + 1), dtype=np.int16)
        cur[:, 0] = i                                    # D[i,0]=i
        diag = prev[:, :-1]                              # D[i-1, j-1]
        up = prev[:, 1:]                                 # D[i-1, j]
        cost = ((win != qi) | (win == 255)).astype(np.int16)  # (M,L)
        base = np.minimum(up + 1, diag + cost)           # (M,L) -> cur[:,1:] pre-left
        # left dependency (cur[:,j-1]+1) resolved sequentially over j
        row = cur[:, 1:]
        left = cur[:, 0]
        for j in range(L):
            v = base[:, j]
            np.minimum(v, left + 1, out=v)
            row[:, j] = v
            left = v
        prev = cur
    dist = prev[:, 1:].min(axis=1)
    end_col = prev[:, 1:].argmin(axis=1) + 1
    return dist, end_col


def _verify_batch(idx, q, k, cand_starts, strand):
    """Verify predicted oligo starts in bulk; return list of hit dicts."""
    if cand_starts.size == 0:
        return []
    qlen = len(q)
    qcodes = _q_codes(q)
    L = qlen + 2 * k
    win_starts = cand_starts.astype(np.int64) - k        # window begins k before p
    win = _decode_windows(idx, win_starts, L)
    dist, end_col = _fitting_align(win, qcodes, k)
    keep = np.nonzero(dist <= k)[0]
    hits = []
    seq_len = idx["seqLen"]
    for m in keep.tolist():
        gend = int(win_starts[m]) + int(end_col[m])       # genomic end (exclusive)
        gstart = gend - qlen                              # approx start (exact for subs)
        if gstart < 0 or gend > seq_len:
            continue
        if not _window_ok(idx, gstart, gend):             # single contig, N-free
            continue
        hits.append(_to_coords(idx, gstart, gend - gstart, strand, int(dist[m])))
    return hits


def _to_coords(idx, gstart, width, strand, dist):
    ci = _contig_of(idx, gstart)
    base = int(idx["contig_off"][ci])
    start = int(gstart - base)
    return {
        "chr": idx["names"][ci],
        "symbol": idx["symbols"][ci] if ci < len(idx["symbols"]) else "",
        "start": start,          # 0-based, half-open
        "end": start + int(width),
        "strand": strand,
        "editdistance": int(dist),
    }


def _greedy_nonoverlap(hits):
    # per (chr,strand) greedy non-overlapping, best distance first
    hits.sort(key=lambda h: (h["editdistance"], h["chr"], h["strand"], h["start"]))
    chosen, occupied = [], {}
    for h in hits:
        key = (h["chr"], h["strand"])
        occ = occupied.setdefault(key, [])
        if any(not (h["end"] <= s or h["start"] >= e) for (s, e) in occ):
            continue
        chosen.append(h)
        occ.append((h["start"], h["end"]))
    chosen.sort(key=lambda h: (h["chr"], h["start"], h["strand"]))
    return chosen


def _search_one_oligo(idxs, q0, k, strands):
    hits = []
    approximate = False
    too_many = False
    for strand in strands:
        q = q0 if strand == "+" else revcomp(q0)
        if len(q) < 1 or _kmer_code(q[:1]) < 0:
            continue
        for idx in idxs:
            W = idx["W"]
            cand, approx = _candidates(idx, q, k, W)
            approximate = approximate or approx
            if cand is None:
                approximate = True
                continue
            if isinstance(cand, str) and cand == "too_many":
                too_many = True
                continue
            hits.extend(_verify_batch(idx, q, k, cand, strand))
    hits = _greedy_nonoverlap(hits)
    return hits, approximate, too_many


def _pack_offtarget(hits, too_many):
    """Return the offtarget value + true count, honoring the client's
    length>1000 -> count-string convention (padding is never inspected)."""
    T = len(hits)
    if too_many and T <= MAXSTORE:
        # candidate explosion short-circuited before enumeration; report a count
        # above the client's 1000 threshold so it renders a count label.
        T = HARDCAP
        return [0] * min(T, HARDCAP), T
    if T == 0:
        return [], 0
    if T <= MAXSTORE:
        return hits, T
    reported = min(T, HARDCAP)
    return hits[:MAXSTORE] + [0] * (reported - MAXSTORE), T


def search(index_names, oligos, k, strand, run_mode=None):
    if isinstance(index_names, str):
        index_names = [index_names]
    k = max(0, min(MAX_K, int(k)))
    strands = {"+": ["+"], "-": ["-"], "+-": ["+", "-"], "-+": ["+", "-"]}.get(
        strand, ["+", "-"])

    idxs = []
    missing = []
    for nm in index_names:
        try:
            idxs.append(load_index(resolve_index_dir(nm)))
        except KeyError:
            missing.append(nm)
    if missing:
        raise KeyError("missing local index: " + ",".join(missing))

    out = []
    warnings = []
    total = max(len(oligos), 1)
    for i, ol in enumerate(oligos):
        oid = ol.get("id") if isinstance(ol, dict) else None
        seq = ol.get("synthesisSequence") or ol.get("seq") or ol.get("sequence") if isinstance(ol, dict) else ol
        q0 = clean(seq or "")
        entry = {"id": oid, "synthesisSequence": q0}
        if not q0:
            entry["offtarget"] = []
            entry["offtargetsymbols"] = []
        else:
            hits, approx, too_many = _search_one_oligo(idxs, q0, k, strands)
            val, T = _pack_offtarget(hits, too_many)
            entry["offtarget"] = val
            # Distinct gene symbols of the off-target hits (order preserved).
            seen_sym = set()
            symbols = []
            for h in hits:
                s = h.get("symbol")
                if s and s not in seen_sym:
                    seen_sym.add(s)
                    symbols.append(s)
            entry["offtargetsymbols"] = symbols
            if approx or too_many:
                warnings.append({"id": oid,
                                 "reason": "non-selective seed; count approximate"})
        out.append(entry)
        if works:
            works.progress(int(100 * (i + 1) / total))
    return {"oligoQuery": out, "warnings": warnings,
            "editdistance": k, "strand": strand}


def main():
    if works is None:
        sys.stderr.write("search.py: ion.works unavailable; running standalone\n")

    def P(i):
        if works:
            return works.param(i)
        # standalone: read jfile from argv[1]
        argf = sys.argv[1]
        path = argf[argf.index(":") + 1:] if argf.startswith("jfile") else argf
        with open(path) as f:
            t = json.load(f)
        return t.get(str(i)) if isinstance(t, dict) else (t[i] if i < len(t) else None)

    names = P(1)
    oligos = P(2) or []
    k = P(3)
    strand = P(4) or "+-"
    run_mode = P(5)
    try:
        result = search(names, oligos, k if k is not None else 3, strand, run_mode)
    except KeyError as e:
        result = {"oligoQuery": [], "error": str(e)}
    payload = json.dumps(result)
    if works:
        works.resolve(result)
    else:
        sys.stdout.write("IONWORKS:RESOLUTION:\t" + payload + "\n")


if __name__ == "__main__":
    main()

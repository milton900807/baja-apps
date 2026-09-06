"""Splicing profile for a raw sequence, via the bajasplice-lib models.

Takes a track sequence plus its strand and returns predicted splice junctions
for a sashimi plot, in track coordinates. Two magnitude modes:

    sites : junction magnitude = splice-site strength (SpliceNet ss_ctx2000),
            i.e. how confident each end is a real donor / acceptor.
    psi   : junction magnitude = cassette-exon inclusion level (PSINet
            psi_ctx2000), averaged over 54 GTEx tissues. Emits inclusion arcs
            (mag = PSI) for the two flanking introns and a skip arc (mag = 1-PSI)
            spanning the exon.

Replaces the external TF-serving POSTJSON call in
baja/bio/splicing/splicing-attributions2.js with a local `exec` python service.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/N, transcript 5'->3')
    param(2) : xi — the track-local x of the first base (positions are xi + i)
    param(3) : strand ('1' | '-1'). sequence[i] is always the base at track
               x = xi + i; every result is mapped back to track x, which for a
               minus-strand track is x = xi + (n - 1 - j) for transcript index j.
    param(6) : orientation of a MINUS-strand track's string, decided by the
               launcher (splicing-profile.js) from the track's exon boundaries:
                 'plus'   -- the plus-strand genomic slice (what the server's
                             pre-mRNA payload holds); transcript = reverse
                             complement.
                 'coding' -- the coding strand laid out by ascending x (what the
                             older Ensembl loader stored: the transcript sequence
                             reversed); transcript = plain reverse.
               Default 'plus'. Ignored for plus-strand tracks.
    param(4) : mode ('sites' | 'psi'), default 'sites'

Resolves { acceptor, donor, junctions, mode, xi, strand, n, context, error }.
Each junction is { d, a, dp, ap, mag, kind } (d/a in track-local coords).
"""
import os
import sys
import json

from ion import works


# The server spawns the system python3, which has neither torch nor bajasplice.
# Re-exec under the project virtualenv (which does) if this interpreter can't
# import them. The environment — including PYTHONPATH for `ion` — is inherited.
def _reexec_under_venv():
    try:
        import numpy      # noqa: F401
        import torch      # noqa: F401
        import bajasplice  # noqa: F401
        return
    except Exception:
        pass
    # Guard against looping: a venv that also lacks the packages must not re-exec forever.
    if os.environ.get("BAJASPLICE_REEXEC") == "1":
        return
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3"),
               "/opt/venv/bin/python3"):
        # Compare the venv PREFIX, not the binary: a venv's python is usually a symlink to
        # the system interpreter, so realpath() said "same interpreter" and skipped the
        # re-exec even though the packages live only under the venv's prefix.
        if not py or not os.path.exists(py):
            continue
        prefix = os.path.dirname(os.path.dirname(os.path.abspath(py)))
        if os.path.abspath(prefix) == os.path.abspath(sys.prefix):
            continue
        os.environ["BAJASPLICE_REEXEC"] = "1"
        os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])
    # No venv found — let the import below raise a clear error.


_reexec_under_venv()

# Make the library importable even if it isn't pip-installed in this interpreter.
_LIB = os.path.expanduser("~/baja-apps/py/bajasplice-lib")
if os.path.isdir(_LIB) and _LIB not in sys.path:
    sys.path.insert(0, _LIB)


seq = str(works.param(1) or "").strip().upper()
try:
    xi = int(float(works.param(2) or 0))
except Exception:
    xi = 0
strand = str(works.param(3) or "1")
mode = str(works.param(4) or "sites").strip().lower()
if mode not in ("sites", "psi"):
    mode = "sites"
# Optional annotated exons for PSI mode: JSON [[xi, xf], ...] in track-local
# coordinates (transcript order). PSINet needs real exon structure, so these
# are preferred over reconstructing exons from predicted sites.
exons_arg = str(works.param(5) or "").strip()
orientation = str(works.param(6) or "plus").strip().lower()
if orientation not in ("plus", "coding"):
    orientation = "plus"

# Positions below this probability are dropped — the profile is sparse peaks.
THRESHOLD = 0.02
# A site must be at least this probable to anchor a junction / cassette event.
SITE_THRESHOLD = 0.10
# Longest donor->acceptor span (bp) allowed to form a junction.
MAX_INTRON = 500000
# Scan in chunks to bound GPU/CPU memory on long transcripts.
CHUNK = 8000

acceptor = []
donor = []
junctions = []
n = 0
context = 0
err = None


def pick_peaks(prob, thr):
    """Collapse each run of positions >= thr to its single argmax peak."""
    peaks = []
    i = 0
    N = len(prob)
    while i < N:
        if prob[i] >= thr:
            j = i
            best = i
            while j < N and prob[j] >= thr:
                if prob[j] > prob[best]:
                    best = j
                j += 1
            peaks.append((best, float(prob[best])))
            i = j
        else:
            i += 1
    return peaks


minus = strand.strip() in ("-1", "-")

if not seq:
    err = "no sequence provided"
else:
    try:
        import numpy as np
        import torch
        from bajasplice.scan import load_splicenet
        from bajasplice.genome import one_hot, _BASE, _COMP

        works.msg("Loading splicing model…")
        model, context, device = load_splicenet()
        c = context // 2

        # codes_x is in track order (index i <-> track x = xi + i). codes is in
        # transcript order, which is what the models were trained on. On the
        # minus strand the transcript is the reverse complement of the plus
        # strand ('plus' orientation) or the plain reverse of a string the
        # loader already complemented ('coding' orientation) -- see param(6).
        codes_x = _BASE[np.frombuffer(seq.encode(), np.uint8)].astype(np.int64)  # 0=N,1..4=ACGT
        n = int(len(codes_x))
        if minus:
            codes = codes_x[::-1].copy()
            if orientation == "plus":
                codes = _COMP[codes].astype(np.int64)
        else:
            codes = codes_x

        def tx2x(j):
            """Transcript index -> track x."""
            return int(xi + (n - 1 - j)) if minus else int(xi + j)

        def x2tx(x):
            """Track x -> transcript index."""
            return int((n - 1) - (x - xi)) if minus else int(x - xi)

        pad = np.concatenate([np.zeros(c, np.int64), codes, np.zeros(c, np.int64)])
        acc = np.zeros(n, np.float32)
        don = np.zeros(n, np.float32)

        works.msg("Scoring splice sites…")
        for off in range(0, n, CHUNK):
            L = min(CHUNK, n - off)
            window = pad[off: off + L + 2 * c]
            x = torch.from_numpy(one_hot(window)[None]).to(device)
            with torch.no_grad():
                p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
            acc[off:off + L] = p[1, :L]
            don[off:off + L] = p[2, :L]
            works.progress(int(100 * (off + L) / max(1, n)))

        # Per-position profiles, keyed by track x (sorted so a minus-strand
        # profile reads left to right like a plus-strand one).
        acceptor = sorted([[tx2x(i), round(float(v), 4)]
                           for i, v in enumerate(acc) if v >= THRESHOLD])
        donor = sorted([[tx2x(i), round(float(v), 4)]
                        for i, v in enumerate(don) if v >= THRESHOLD])

        if mode == "psi":
            # A cassette event needs three consecutive exons (C1, A, C2). Work
            # entirely in transcript indices, where an exon always runs
            # first..last with first < last, so one code path serves both
            # strands. Site positions follow the training labels: the acceptor
            # is the base before the exon (last intronic base) and the donor is
            # the base after it (first intronic base). Prefer the track's
            # annotated exons; fall back to reconstructing them from predicted
            # sites (D,A,D,A quadruplets).
            works.msg("Detecting cassette exons…")

            def prob_at(arr, idx, wwin=3):
                a0, b0 = max(0, idx - wwin), min(n, idx + wwin + 1)
                return float(arr[a0:b0].max()) if b0 > a0 else 0.0

            provided = None
            if exons_arg:
                try:
                    pe = json.loads(exons_arg)
                    provided = []
                    for e in pe:
                        if not e or len(e) < 2:
                            continue
                        lo, hi = int(min(e[0], e[1])), int(max(e[0], e[1]))
                        # in transcript order the exon's first base is at the
                        # high track x on the minus strand
                        first, last = (x2tx(hi), x2tx(lo)) if minus else (x2tx(lo), x2tx(hi))
                        if 0 <= first <= last < n:
                            provided.append((first, last))
                    provided.sort()
                except Exception:
                    provided = None

            def make_event(c1d, a_acc, a_don, c2a, p0, p1, p2, p3):
                """Geometry from four site indices, as in PSINet training:
                exon_len = a_end - a_start + 1, intron = gap between exon bodies."""
                c1_last, a_first, a_last, c2_first = c1d - 1, a_acc + 1, a_don - 1, c2a + 1
                exon_len = a_last - a_first + 1
                up = a_first - c1_last - 1
                dn = c2_first - a_last - 1
                if exon_len <= 0 or up <= 0 or dn <= 0:
                    return None
                if up > MAX_INTRON or dn > MAX_INTRON:
                    return None
                return (c1d, a_acc, a_don, c2a, exon_len, up, dn, p0, p1, p2, p3)

            events = []          # (c1d, a_acc, a_don, c2a, exon_len, up, dn, p0..p3)
            if provided and len(provided) >= 3:
                for k in range(1, len(provided) - 1):
                    c1d = provided[k - 1][1] + 1      # upstream exon donor
                    a_acc = provided[k][0] - 1        # cassette exon acceptor
                    a_don = provided[k][1] + 1        # cassette exon donor
                    c2a = provided[k + 1][0] - 1      # downstream exon acceptor
                    ev = make_event(c1d, a_acc, a_don, c2a,
                                    prob_at(don, c1d), prob_at(acc, a_acc),
                                    prob_at(don, a_don), prob_at(acc, c2a))
                    if ev:
                        events.append(ev)
            else:
                dpk = pick_peaks(don, SITE_THRESHOLD)
                apk = pick_peaks(acc, SITE_THRESHOLD)
                merged = sorted([(i, "D", p) for i, p in dpk] +
                                [(i, "A", p) for i, p in apk])
                for t in range(len(merged) - 3):
                    s0, s1, s2, s3 = merged[t], merged[t + 1], merged[t + 2], merged[t + 3]
                    if (s0[1], s1[1], s2[1], s3[1]) != ("D", "A", "D", "A"):
                        continue
                    ev = make_event(s0[0], s1[0], s2[0], s3[0], s0[2], s1[2], s2[2], s3[2])
                    if ev:
                        events.append(ev)

            if events:
                works.msg("Scoring exon inclusion (PSINet)…")
                from bajasplice.scan import resolve_checkpoint
                from bajasplice.models import PSINet
                pck = resolve_checkpoint(name="psi_ctx2000")
                ck = torch.load(str(pck), map_location="cpu", weights_only=False)
                pa = ck["args"]
                n_tis = int(ck["model"]["out_tissue.weight"].shape[0])
                pnet = PSINet(n_tissues=n_tis, context=pa["context"],
                              ch=pa["channels"], win=pa["win"]).to(device).eval()
                pnet.load_state_dict(ck["model"])
                total = int(pa["win"] + pa["context"])
                half = total // 2

                def win_at(center):
                    w = np.zeros(total, np.int64)
                    lo, hi = center - half, center + half
                    a0, b0 = max(0, lo), min(n, hi)
                    if b0 > a0:
                        w[a0 - lo:b0 - lo] = codes[a0:b0]
                    return one_hot(w)

                def gcf(cc):
                    return float(((cc == 2) | (cc == 3)).sum() / max(int((cc > 0).sum()), 1))

                wins_all, geom_all = [], []
                for (c1d, a_acc, a_don, c2a, exon_len, up, dn, *_pr) in events:
                    wins_all.append(np.stack([win_at(c1d), win_at(a_acc),
                                              win_at(a_don), win_at(c2a)]))
                    ex = codes[a_acc + 1:a_don]            # exon body
                    intr = codes[c1d:c1d + 200]            # first 200 nt of upstream intron
                    geom_all.append(np.array([
                        np.log10(max(exon_len, 1)), np.log10(max(up, 1)),
                        np.log10(max(dn, 1)), 1.0 if exon_len % 3 == 0 else 0.0,
                        gcf(ex), gcf(intr)], dtype=np.float32))

                wt = torch.from_numpy(np.stack(wins_all)).to(device)
                gt = torch.from_numpy(np.stack(geom_all)).to(device)
                with torch.no_grad():
                    ot, _om = pnet(wt, gt)
                    psi = torch.sigmoid(ot).mean(dim=1).cpu().numpy()   # mean over tissues

                for ev, ps in zip(events, psi):
                    c1d, a_acc, a_don, c2a, _el, _up, _dn, p0, p1, p2, p3 = ev
                    ps = float(ps)
                    # Two inclusion introns carry the exon's PSI; the skip arc carries 1-PSI.
                    junctions.append({"d": tx2x(c1d), "a": tx2x(a_acc),
                                      "dp": round(p0, 4), "ap": round(p1, 4),
                                      "mag": round(ps, 4), "kind": "inclusion"})
                    junctions.append({"d": tx2x(a_don), "a": tx2x(c2a),
                                      "dp": round(p2, 4), "ap": round(p3, 4),
                                      "mag": round(ps, 4), "kind": "inclusion"})
                    junctions.append({"d": tx2x(c1d), "a": tx2x(c2a),
                                      "dp": round(p0, 4), "ap": round(p3, 4),
                                      "mag": round(1.0 - ps, 4), "kind": "skip"})
        else:
            # sites mode: each confident donor joins its nearest downstream
            # acceptor, downstream meaning 3' in the transcript (lower track x
            # on the minus strand); magnitude = min(donorProb, acceptorProb).
            import bisect
            dsites = pick_peaks(don, SITE_THRESHOLD)
            asites = sorted(pick_peaks(acc, SITE_THRESHOLD))
            apos = [a[0] for a in asites]
            for di, dp in dsites:
                k = bisect.bisect_right(apos, di)
                if k < len(asites):
                    ai, ap = asites[k]
                    if 0 < (ai - di) <= MAX_INTRON:
                        junctions.append({"d": tx2x(di), "a": tx2x(ai),
                                          "dp": round(dp, 4), "ap": round(ap, 4),
                                          "mag": round(min(dp, ap), 4),
                                          "kind": "junction"})
    except Exception as e:
        err = str(e)

works.resolve({
    "acceptor": json.dumps(acceptor),
    "donor": json.dumps(donor),
    "junctions": json.dumps(junctions),
    "mode": mode,
    "xi": xi,
    "strand": strand,
    "orientation": orientation,
    "n": n,
    "context": context,
    "error": err,
})

"""Splicing profile for a raw sequence, via the bajasplice-lib models.

Takes a sequence (transcript orientation) and returns predicted splice junctions
for a sashimi plot. Two magnitude modes:

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
    param(3) : strand ('1' | '-1'), informational
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
        import torch      # noqa: F401
        import bajasplice  # noqa: F401
        return
    except Exception:
        pass
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3")):
        if py and os.path.exists(py) and \
                os.path.realpath(py) != os.path.realpath(sys.executable):
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


if not seq:
    err = "no sequence provided"
else:
    try:
        import numpy as np
        import torch
        from bajasplice.scan import load_splicenet
        from bajasplice.genome import one_hot, _BASE

        works.msg("Loading splicing model…")
        model, context, device = load_splicenet()
        c = context // 2

        codes = _BASE[np.frombuffer(seq.encode(), np.uint8)].astype(np.int64)  # 0=N,1..4=ACGT
        n = int(len(codes))
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

        acceptor = [[int(xi + i), round(float(v), 4)]
                    for i, v in enumerate(acc) if v >= THRESHOLD]
        donor = [[int(xi + i), round(float(v), 4)]
                 for i, v in enumerate(don) if v >= THRESHOLD]

        if mode == "psi":
            # A cassette event needs three consecutive exons (C1, A, C2). In
            # transcript-local coordinates each exon runs acceptor(xi)..donor(xf),
            # so the four splice sites are C1 donor, A acceptor, A donor,
            # C2 acceptor. Prefer the track's annotated exons; fall back to
            # reconstructing them from predicted sites (D,A,D,A quadruplets).
            works.msg("Detecting cassette exons…")

            def prob_at(arr, idx, wwin=3):
                a0, b0 = max(0, idx - wwin), min(n, idx + wwin + 1)
                return float(arr[a0:b0].max()) if b0 > a0 else 0.0

            provided = None
            if exons_arg:
                try:
                    pe = json.loads(exons_arg)
                    provided = sorted(
                        [(int(min(e[0], e[1])), int(max(e[0], e[1])))
                         for e in pe if e and len(e) >= 2],
                        key=lambda t: t[0])
                except Exception:
                    provided = None

            events = []          # (c1d, a_acc, a_don, c2a, exon_len, up, dn, p0..p3)
            if provided and len(provided) >= 3:
                for k in range(1, len(provided) - 1):
                    c1d = provided[k - 1][1] - xi     # upstream exon donor (xf)
                    a_acc = provided[k][0] - xi       # cassette exon acceptor (xi)
                    a_don = provided[k][1] - xi       # cassette exon donor (xf)
                    c2a = provided[k + 1][0] - xi     # downstream exon acceptor (xi)
                    exon_len, up, dn = a_don - a_acc, a_acc - c1d, c2a - a_don
                    if exon_len <= 0 or up <= 0 or dn <= 0:
                        continue
                    if up > MAX_INTRON or dn > MAX_INTRON:
                        continue
                    events.append((c1d, a_acc, a_don, c2a, exon_len, up, dn,
                                   prob_at(don, c1d), prob_at(acc, a_acc),
                                   prob_at(don, a_don), prob_at(acc, c2a)))
            else:
                dpk = pick_peaks(don, SITE_THRESHOLD)
                apk = pick_peaks(acc, SITE_THRESHOLD)
                merged = sorted([(i, "D", p) for i, p in dpk] +
                                [(i, "A", p) for i, p in apk])
                for t in range(len(merged) - 3):
                    s0, s1, s2, s3 = merged[t], merged[t + 1], merged[t + 2], merged[t + 3]
                    if (s0[1], s1[1], s2[1], s3[1]) != ("D", "A", "D", "A"):
                        continue
                    c1d, a_acc, a_don, c2a = s0[0], s1[0], s2[0], s3[0]
                    exon_len, up, dn = a_don - a_acc, a_acc - c1d, c2a - a_don
                    if exon_len <= 0 or up <= 0 or dn <= 0:
                        continue
                    if up > MAX_INTRON or dn > MAX_INTRON:
                        continue
                    events.append((c1d, a_acc, a_don, c2a, exon_len, up, dn,
                                   s0[2], s1[2], s2[2], s3[2]))

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
                    ex = codes[a_acc:a_don]
                    intr = codes[c1d + 1:c1d + 201]
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
                    junctions.append({"d": xi + c1d, "a": xi + a_acc,
                                      "dp": round(p0, 4), "ap": round(p1, 4),
                                      "mag": round(ps, 4), "kind": "inclusion"})
                    junctions.append({"d": xi + a_don, "a": xi + c2a,
                                      "dp": round(p2, 4), "ap": round(p3, 4),
                                      "mag": round(ps, 4), "kind": "inclusion"})
                    junctions.append({"d": xi + c1d, "a": xi + c2a,
                                      "dp": round(p0, 4), "ap": round(p3, 4),
                                      "mag": round(1.0 - ps, 4), "kind": "skip"})
        else:
            # sites mode: each confident donor joins its nearest downstream
            # acceptor; magnitude = min(donorProb, acceptorProb).
            import bisect
            dsites = pick_peaks(don, SITE_THRESHOLD)
            asites = pick_peaks(acc, SITE_THRESHOLD)
            asites_g = sorted([(xi + i, p) for i, p in asites])
            apos = [a[0] for a in asites_g]
            for di, dp in dsites:
                dpos = xi + di
                k = bisect.bisect_right(apos, dpos)
                if k < len(asites_g):
                    apos_k, ap = asites_g[k]
                    if 0 < (apos_k - dpos) <= MAX_INTRON:
                        junctions.append({"d": dpos, "a": apos_k,
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
    "n": n,
    "context": context,
    "error": err,
})

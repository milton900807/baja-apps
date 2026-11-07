"""Splicing profile for a raw sequence, via the bajasplice-lib models.

Takes a track sequence plus its strand and returns predicted splice junctions
for a sashimi plot, in track coordinates. Two magnitude modes:

    sites : junction magnitude = splice-site strength (SpliceNet ss_ctx2000),
            i.e. how confident each end is a real donor / acceptor.
    psi   : junction magnitude = cassette-exon inclusion level (PSINet
            psi_ctx2000), averaged over 54 GTEx tissues. Emits inclusion arcs
            (mag = PSI) for the two flanking introns and a skip arc (mag = 1-PSI)
            spanning the exon. Cassette events come from the track's annotated
            exons AND from the model's own predicted sites, scored together, each
            junction marked `annotated` -- so a variant that destroys a splice
            site changes WHICH arcs exist, not merely their magnitude.

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

Resolves { acceptor, donor, junctions, lostSites, mode, xi, strand, n, context,
error }. Each junction is { d, a, dp, ap, mag, kind, annotated } (d/a in
track-local coords). lostSites lists annotated splice sites the sequence no
longer supports, as { x, kind, p }.

PSI mode also puts each annotated splice site in COMPETITION with the AGs / GTs
near it (within COMPETE_WIN nt): AltSSNet's predicted usage, weighed by
SpliceNet's probability that each candidate is a site at all. The inclusion
junction is divided between the edges accordingly, a competitor taking 1% or more
gets its own arc (kind 'alt-acceptor' / 'alt-donor', with `shift` in nt and
`share`), and `competition` lists every annotated edge that has a competitor as
{ exon, site, x, p, share, method, alts: [{ x, p, share, shift, inFrame, codons }] }.
A competitor within COMPETE_NEAR nt is always listed, however weak.

`branchPoints` gives each annotated acceptor's predicted branch point:
{ exon, acceptor, best, others }, each candidate { x, dist, motif, score, prob,
ppt, agez, support } where support is the drop in the acceptor's log-odds when
that A is changed (the splice-site model's own vote).
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
# Cap on cassette events scored in one PSI run. The annotated exons come first, so
# this only ever limits how many model-proposed topologies join them, and it bounds
# the PSINet batch on a long transcript with many confident peaks.
MAX_EVENTS = 200
# Scan in chunks to bound GPU/CPU memory on long transcripts.
CHUNK = 8000

acceptor = []
donor = []
junctions = []
# Annotated splice sites the sequence no longer supports (PSI mode).
lost_sites = []
# Competing splice sites at each annotated edge (PSI mode): see _compete.
competition = []
# Predicted branch point of each annotated acceptor (PSI mode): see _branch_points.
branch_points = []
# Branch A to the acceptor's G, in nt.
BP_MIN, BP_MAX = 15, 50
# Candidates per acceptor checked against the splice-site model.
BP_CHECK = 3

# How far either side of an annotated site to look for a competing AG / GT, in nt.
COMPETE_WIN = 120
# Always report a competitor this close, however weak: a 3-12 nt shift is exactly the
# event a bulk assay cannot see, so "scored and negligible" is itself the answer.
COMPETE_NEAR = 12
# Report a farther competitor once it takes at least this share of the edge.
COMPETE_REPORT = 0.01
# Draw an arc for a competitor once it takes at least this share of the edge.
COMPETE_ARC = 0.01
# At most this many competitors reported per site.
COMPETE_MAX = 4
# Sites put to AltSSNet together, the annotated one included (its training group size).
COMPETE_GROUP = 6
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
            # the base after it (first intronic base). Events come from the
            # track's annotated exons AND from predicted sites (D,A,D,A
            # quadruplets) -- see add_event below.
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
                return {"sites": (c1d, a_acc, a_don, c2a), "probs": (p0, p1, p2, p3),
                        "exon_len": exon_len, "up": up, "dn": dn}

            # THE ANNOTATED EXONS ARE NOT THE ONLY TOPOLOGY. Enumerating cassette
            # events from `provided` alone means every arc sits at a canonical
            # junction whatever the sequence says: mutate a donor and PSI falls to
            # 0, but the only arcs on the plot are still the canonical ones, now
            # drawn at magnitude 0. The prevailing pattern -- the cryptic donor the
            # spliceosome actually uses, or no junction at all -- was never in the
            # result to draw. (This branch used to be an `else`, reached only when a
            # track had no exon annotation.)
            #
            # So both topologies are enumerated and scored together: the annotated
            # exons, and whatever the MODEL's own site predictions imply. A
            # predicted event that is just the annotated one rediscovered is
            # dropped; one that is genuinely different is kept and marked novel, and
            # PSINet scores it on the same footing, so the arc that dominates the
            # plot is the arc the models say dominates the transcript.
            events = []          # dicts: sites, probs, geometry, src
            SAME_SITE = 3        # a predicted peak this close to an annotated site is that site

            def add_event(ev, src):
                """Keep `ev` unless it is a near-duplicate of one already held."""
                if not ev:
                    return
                for e in events:
                    if all(abs(a - b) <= SAME_SITE for a, b in zip(ev["sites"], e["sites"])):
                        return
                ev["src"] = src
                events.append(ev)

            if provided and len(provided) >= 3:
                for k in range(1, len(provided) - 1):
                    c1d = provided[k - 1][1] + 1      # upstream exon donor
                    a_acc = provided[k][0] - 1        # cassette exon acceptor
                    a_don = provided[k][1] + 1        # cassette exon donor
                    c2a = provided[k + 1][0] - 1      # downstream exon acceptor
                    ev = make_event(c1d, a_acc, a_don, c2a,
                                    prob_at(don, c1d), prob_at(acc, a_acc),
                                    prob_at(don, a_don), prob_at(acc, c2a))
                    # WHICH EXON'S INCLUSION this event reports. PSI is a property of an
                    # EXON, not of a junction, and consecutive cassette events share a
                    # junction: the event on exon k emits (donor k -> acceptor k+1), and so
                    # does the event on exon k+1. Both are correct and they carry different
                    # numbers -- exon k's PSI and exon k+1's -- so the same junction gets
                    # two arcs reading, say, 100% and 96%. Without knowing which exon each
                    # one is about, that looks like the plot contradicting itself.
                    if ev:
                        ev["exon"] = k + 1        # 1-based, transcript order
                    add_event(ev, "annotated")

            dpk = pick_peaks(don, SITE_THRESHOLD)
            apk = pick_peaks(acc, SITE_THRESHOLD)
            merged = sorted([(i, "D", p) for i, p in dpk] +
                            [(i, "A", p) for i, p in apk])
            for t in range(len(merged) - 3):
                s0, s1, s2, s3 = merged[t], merged[t + 1], merged[t + 2], merged[t + 3]
                if (s0[1], s1[1], s2[1], s3[1]) != ("D", "A", "D", "A"):
                    continue
                if len(events) >= MAX_EVENTS:
                    break
                # A model-proposed event has no annotated exon number to quote.
                add_event(make_event(s0[0], s1[0], s2[0], s3[0],
                                     s0[2], s1[2], s2[2], s3[2]), "novel")

            # ANNOTATED SITES THE SEQUENCE NO LONGER SUPPORTS. This is what a
            # donor-destroying variant looks like directly, and it is reported
            # rather than left to be inferred from an arc that went quiet.
            if provided:
                last_k = len(provided) - 1
                for k, (first, last) in enumerate(provided):
                    # The transcript's own ends are not splice sites: the first exon has no
                    # acceptor and the last no donor, and reporting them as lost would put two
                    # false alarms on every transcript.
                    cands = []
                    if k > 0:
                        cands.append((first - 1, acc, "acceptor"))
                    if k < last_k:
                        cands.append((last + 1, don, "donor"))
                    for idx, arr, what in cands:
                        if not (0 <= idx < n):
                            continue
                        pv = prob_at(arr, idx)
                        if pv < SITE_THRESHOLD:
                            lost_sites.append({"x": tx2x(idx), "kind": what,
                                               "p": round(pv, 4)})

            # yUnAy, positions -3..+1 around the branch A, as base probabilities (A, C, G, T).
            # Mercer et al. 2015 (Genome Res 25:290) and Pineda & Bradley 2018 (Genes Dev
            # 32:577): T at -2 is the strongest position after the A itself, then the
            # pyrimidines at -3 and +1; -1 is nearly uninformative.
            BP_PWM = {-3: (0.15, 0.35, 0.12, 0.38), -2: (0.05, 0.10, 0.05, 0.80),
                      -1: (0.25, 0.30, 0.20, 0.25), 1: (0.15, 0.40, 0.10, 0.35)}

            def _bp_window(seqc, center):
                w = np.zeros(2 * c + 1, np.int64)
                lo = center - c
                a0, b0 = max(0, lo), min(len(seqc), center + c + 1)
                if b0 > a0:
                    w[a0 - lo:b0 - lo] = seqc[a0:b0]
                return w

            def _branch_points(idx, partner, k):
                """Branch-point candidates for the acceptor whose AG ends at transcript index
                idx (the G). Returns the best, with the runner-up, or None."""
                if not (50 < idx < n):
                    return None
                cands = []
                for d in range(BP_MIN, BP_MAX + 1):
                    b = idx - d
                    if b - 3 < max(0, partner + 10) or codes[b] != 1:          # an A, inside the intron
                        continue
                    sc = 0.0
                    for off, pr in BP_PWM.items():
                        base = int(codes[b + off])
                        sc += np.log2(pr[base - 1] / 0.25) if base else 0.0
                    # distance prior: flat across the usual 21-34, falling away outside it
                    sc += -0.15 * max(0, 21 - d) - 0.12 * max(0, d - 34)
                    # polypyrimidine tract between the branch point and the AG
                    ppt = codes[b + 4: idx - 2]
                    py = float(((ppt == 2) | (ppt == 4)).mean()) if len(ppt) else 0.0
                    sc += 3.0 * (py - 0.5)
                    # AG exclusion zone: an AG more than 12 nt past the branch point and before
                    # the real one would be taken first, so this A is unlikely to be the one used
                    agez = False
                    for t in range(b + 12, idx - 2):
                        if codes[t] == 1 and codes[t + 1] == 3:
                            agez = True
                            break
                    if agez:
                        sc -= 3.0
                    cands.append([b, d, sc, py, agez])
                if not cands:
                    return None
                cands.sort(key=lambda r: -r[2])
                top = cands[:BP_CHECK]
                # In silico check: A -> C at each candidate, acceptor log-odds rescored.
                support = [None] * len(top)
                try:
                    wins = [_bp_window(codes, idx)]
                    for b, *_r in top:
                        mut = codes.copy()
                        mut[b] = 2
                        wins.append(_bp_window(mut, idx))
                    xb = torch.from_numpy(np.stack([one_hot(w) for w in wins])).float().to(device)
                    with torch.no_grad():
                        pp = torch.softmax(model(xb).float(), 1).cpu().numpy()[:, 1, 0]
                    lo_ = lambda v: float(np.log(max(v, 1e-6) / max(1 - v, 1e-6)))
                    ref_lo = lo_(float(pp[0]))
                    support = [round(ref_lo - lo_(float(v)), 3) for v in pp[1:]]
                except Exception:
                    pass
                # Probability across the candidates from the motif score (log2 units).
                ws = np.array([2.0 ** r[2] for r in cands])
                ws = ws / ws.sum()
                out = []
                for i, (b, d, sc, py, agez) in enumerate(top):
                    out.append({"x": tx2x(b), "dist": int(d), "score": round(float(sc), 2),
                                "prob": round(float(ws[i]), 3), "ppt": round(py, 2), "agez": bool(agez),
                                "motif": "".join("NACGT"[int(v)] for v in codes[b - 3:b + 2]),
                                "support": support[i]})
                return {"exon": k + 1, "acceptor": tx2x(idx), "best": out[0], "others": out[1:]}

            # BRANCH POINTS. The branch-site A sits 18-44 nt upstream of the acceptor AG
            # (most often 21-34), in the yUnAy consensus, with the polypyrimidine tract
            # between it and the AG and, as a rule, no AG in between (the AG exclusion zone:
            # the spliceosome takes the first AG it meets after the branch point). Each
            # annotated acceptor's candidates are scored on those four things, and the best
            # few are checked against the splice-site model: change the A and rescore the
            # acceptor. A real branch point is one the acceptor depends on.
            if provided:
                works.msg("Scoring branch points…")
                for k in range(1, len(provided)):
                    r = _branch_points(provided[k][0] - 1, provided[k - 1][1] + 1, k)
                    if r:
                        branch_points.append(r)

            # AltSSNet: the bundled model trained on exactly this question -- given a
            # group of competing 3' (or 5') sites that share one partner, what share of
            # the junction reads does each take (GTEx usage). Loaded lazily, once.
            _altss = {}

            def _altss_model():
                if "m" in _altss:
                    return _altss["m"]
                m = None
                try:
                    import torch.nn as nn
                    from bajasplice.models import SpliceNet
                    from bajasplice.scan import resolve_checkpoint

                    class AltSSNet(nn.Module):
                        # mirrors bajasplice/train/altss.py (kept here so serving does not
                        # import the training stack)
                        def __init__(self, context=2000, ch=32):
                            super().__init__()
                            self.trunk = SpliceNet(context=context, ch=ch)
                            self.pool = nn.AdaptiveAvgPool1d(8)
                            self.score = nn.Sequential(nn.Linear(ch * 8 + 2, 128), nn.ReLU(),
                                                       nn.Dropout(0.1), nn.Linear(128, 1))

                        def forward(self, x, feat):
                            G = x.shape[0]
                            h = self.pool(self.trunk.trunk(x)).reshape(G, -1)
                            return self.score(torch.cat([h, feat], 1)).reshape(G)

                    ck = torch.load(str(resolve_checkpoint(name="altss")), map_location="cpu",
                                    weights_only=False)
                    a = ck.get("args", {}) or {}
                    net = AltSSNet(context=int(a.get("context", 2000)))
                    net.load_state_dict(ck["model"])
                    net = net.to(device).eval()
                    m = (net, int(a.get("win", 200)) + int(a.get("context", 2000)))
                except Exception as e:      # fall back to SpliceNet ratios, and say so
                    _altss["error"] = str(e)
                    m = None
                _altss["m"] = m
                return m

            def _altss_shares(what, sites, partner):
                """Usage share of each site in `sites` (transcript indices) at one edge."""
                mm = _altss_model()
                if not mm:
                    return None
                net, total = mm
                half = total // 2
                lo_off = -half + (1 if minus else 0)      # GenomeReader's window, in transcript order
                xs, feats = [], []
                for j in sites:
                    w = np.zeros(total, np.int64)
                    lo = j + lo_off
                    a0, b0 = max(0, lo), min(n, lo + total)
                    if b0 > a0:
                        w[a0 - lo:b0 - lo] = codes[a0:b0]
                    xs.append(one_hot(w))
                    ilen = (j - partner + 1) if what == "acceptor" else (partner - j + 1)
                    feats.append([np.log10(max(ilen, 1)), 1.0 if what == "acceptor" else 0.0])
                with torch.no_grad():
                    sc = net(torch.from_numpy(np.stack(xs)).float().to(device),
                             torch.tensor(feats, dtype=torch.float32).to(device))
                    return torch.softmax(sc.float(), 0).cpu().numpy().tolist()

            def _compete(what, idx, k, first, last):
                """Put the annotated site at transcript index `idx` in competition with the
                AGs (acceptor) or GTs (donor) near it.

                Site indices follow the training labels: an acceptor is the G of its AG (the
                last intronic base), a donor the G of its GT (the first intronic base). The
                candidates are every such dinucleotide within COMPETE_WIN nt; the group put to
                AltSSNet is the annotated site, every candidate within COMPETE_NEAR nt, and
                the strongest of the rest by SpliceNet, up to six in all (its training size).
                Each one's share is AltSSNet's predicted usage, or, if that model cannot be
                loaded, its SpliceNet probability over the group's sum. `shift` is the change
                in exon length if that site is used instead: positive extends the exon into
                the intron, negative eats into the exon; a multiple of 3 keeps the frame.
                """
                if not (0 <= idx < n):
                    return None
                arr = acc if what == "acceptor" else don
                if what == "acceptor":
                    partner = provided[k - 1][1] + 1                 # upstream donor
                    lo = max(1, idx - COMPETE_WIN, partner + 20)
                    hi = min(n - 1, idx + COMPETE_WIN, last - 3)
                else:
                    partner = provided[k + 1][0] - 1                 # downstream acceptor
                    lo = max(0, idx - COMPETE_WIN, first + 3)
                    hi = min(n - 2, idx + COMPETE_WIN, partner - 20)
                cands = []
                for j in range(lo, hi + 1):
                    if j == idx:
                        continue
                    if what == "acceptor" and not (codes[j - 1] == 1 and codes[j] == 3):   # AG
                        continue
                    if what == "donor" and not (codes[j] == 3 and codes[j + 1] == 4):      # GT
                        continue
                    cands.append(j)
                near = sorted([j for j in cands if abs(j - idx) <= COMPETE_NEAR],
                              key=lambda j: -float(arr[j]))
                far = sorted([j for j in cands if abs(j - idx) > COMPETE_NEAR],
                             key=lambda j: -float(arr[j]))
                group = [idx] + (near + far)[:COMPETE_GROUP - 1]
                if len(group) < 2:
                    return None
                shares = None
                try:
                    shares = _altss_shares(what, group, partner)
                except Exception as e:
                    _altss["error"] = str(e)
                # AltSSNet was trained only on groups whose every member is a REAL, used site,
                # so it ranks sites on the assumption that each one is a site at all. Handed an
                # arbitrary GT it still gives it a share (a GT the splice-site model scores at
                # 0.0000 was taking 30% in testing). So its preference is weighed by SpliceNet's
                # probability that each candidate is a site, and renormalised:
                #     share_i  proportional to  AltSS_i * P_site(i)
                # which leaves real competitors to AltSSNet and junk dinucleotides at ~0.
                method = "AltSSNet x SpliceNet"
                if shares:
                    w = [float(sh) * max(float(arr[j]), 1e-6) for j, sh in zip(group, shares)]
                    tw = sum(w)
                    shares = [x / tw for x in w] if tw > 0 else None
                if not shares:
                    tot = sum(float(arr[j]) for j in group)
                    if tot <= 0:
                        return None
                    shares = [float(arr[j]) / tot for j in group]
                    method = "SpliceNet ratio"
                alts = []
                for j, sh in zip(group[1:], shares[1:]):
                    shift = (idx - j) if what == "acceptor" else (j - idx)
                    if abs(shift) <= COMPETE_NEAR or sh >= COMPETE_REPORT:
                        alts.append({"x": tx2x(j), "p": round(float(arr[j]), 5),
                                     "share": round(float(sh), 4), "shift": int(shift),
                                     "inFrame": (shift % 3 == 0),
                                     "codons": (int(shift // 3) if shift % 3 == 0 else None)})
                alts.sort(key=lambda a: (-a["share"], abs(a["shift"])))
                alts = alts[:COMPETE_MAX]
                return {"exon": k + 1, "site": what, "x": tx2x(idx), "p": round(float(arr[idx]), 4),
                        "share": round(float(shares[0]), 4), "method": method, "alts": alts}

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
                for ev in events:
                    c1d, a_acc, a_don, c2a = ev["sites"]
                    exon_len, up, dn = ev["exon_len"], ev["up"], ev["dn"]
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

                # ONE ARC PER JUNCTION. PSI is a property of an EXON; an arc is a JUNCTION,
                # and consecutive cassette events SHARE the junction between them: the event
                # on exon k emits (donor k -> acceptor k+1), and so does the event on exon
                # k+1. Emitting both put two arcs on one intron leap carrying two different
                # numbers -- "PSI e7 100%" and "PSI e8 96%" on the same line, which reads as
                # the plot contradicting itself.
                #
                # Neither number is that junction's usage. A transcript uses the 7->8 junction
                # only if it contains BOTH exons adjacently, so its usage is bounded by the
                # lesser of the two inclusion levels -- min() is taken rather than either one
                # alone, and the arc is labelled with the exons it joins instead of with one
                # exon's PSI.
                #
                # Skip arcs are NOT merged: a skip of exon k is its own junction (k-1 -> k+1)
                # and 1 - PSI(k) really is how often it is used.
                incl = {}
                for ev, ps in zip(events, psi):
                    c1d, a_acc, a_don, c2a = ev["sites"]
                    p0, p1, p2, p3 = ev["probs"]
                    ps = float(ps)
                    ann = (ev.get("src") == "annotated")
                    exn = ev.get("exon")
                    for (dd, aa, pdp, pap, side) in ((c1d, a_acc, p0, p1, "in"),
                                                     (a_don, c2a, p2, p3, "out")):
                        key = (tx2x(dd), tx2x(aa))
                        rec = incl.get(key)
                        if rec is None:
                            rec = {"d": key[0], "a": key[1], "dp": round(pdp, 4),
                                   "ap": round(pap, 4), "psis": [], "exons": [],
                                   "annotated": ann}
                            incl[key] = rec
                        rec["psis"].append(ps)
                        rec["annotated"] = rec["annotated"] or ann
                        if exn is not None:
                            # the junction INTO exon k borders k-1 and k; the one OUT of it
                            # borders k and k+1
                            for e in ((exn - 1, exn) if side == "in" else (exn, exn + 1)):
                                if e >= 1 and e not in rec["exons"]:
                                    rec["exons"].append(e)
                    junctions.append({"d": tx2x(c1d), "a": tx2x(c2a),
                                      "dp": round(p0, 4), "ap": round(p3, 4),
                                      "mag": round(1.0 - ps, 4), "kind": "skip",
                                      "annotated": ann, "exon": exn,
                                      "exons": ([exn] if exn is not None else [])})
                # COMPETITION BETWEEN NEARBY SITES. PSINet answers "is the exon in?", not
                # "which AG (or GT) is its edge?". An exon whose acceptor has another AG a
                # few nt away can be included at 96% and still be split between the two
                # edges -- the NAGNAG-type event that removes or adds a couple of codons
                # and is invisible to any assay not designed at single-nucleotide
                # resolution. So each annotated site is put in competition with every
                # same-kind dinucleotide near it, scored by SpliceNet, and the inclusion
                # junction is divided between them by relative strength.
                comp_share = {}          # track x of a site -> its share at that edge
                alt_arcs = []
                if provided:
                    last_k = len(provided) - 1
                    for k, (first, last) in enumerate(provided):
                        sides = []
                        if k > 0:
                            sides.append(("acceptor", first - 1))
                        if k < last_k:
                            sides.append(("donor", last + 1))
                        for what, idx in sides:
                            r = _compete(what, idx, k, first, last)
                            if not r:
                                continue
                            comp_share[tx2x(idx)] = r["share"]
                            # the inclusion junction this edge belongs to
                            if what == "acceptor":
                                key = (tx2x(provided[k - 1][1] + 1), tx2x(idx))
                            else:
                                key = (tx2x(idx), tx2x(provided[k + 1][0] - 1))
                            rec = incl.get(key)
                            for alt in r["alts"]:
                                if rec is None or alt["share"] < COMPETE_ARC:
                                    continue
                                base = min(rec["psis"])
                                ax = alt["x"]
                                alt_arcs.append({
                                    "d": (key[0] if what == "acceptor" else ax),
                                    "a": (ax if what == "acceptor" else key[1]),
                                    "dp": (rec["dp"] if what == "acceptor" else alt["p"]),
                                    "ap": (alt["p"] if what == "acceptor" else rec["ap"]),
                                    "mag": round(base * alt["share"], 4),
                                    "kind": "alt-" + what, "annotated": False,
                                    "exon": k + 1, "exons": [k + 1], "shift": alt["shift"],
                                    "share": alt["share"], "inFrame": alt["inFrame"]})
                            if r["alts"]:
                                competition.append(r)
                for rec in incl.values():
                    # the canonical edges keep only their share of the junction
                    share = comp_share.get(rec["d"], 1.0) * comp_share.get(rec["a"], 1.0)
                    junctions.append({"d": rec["d"], "a": rec["a"],
                                      "dp": rec["dp"], "ap": rec["ap"],
                                      "mag": round(min(rec["psis"]) * share, 4), "kind": "inclusion",
                                      "annotated": rec["annotated"],
                                      "exon": (rec["exons"][0] if rec["exons"] else None),
                                      "exons": sorted(rec["exons"])})
                junctions.extend(alt_arcs)
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
    "lostSites": json.dumps(lost_sites),
    "competition": json.dumps(competition),
    "branchPoints": json.dumps(branch_points),
    "mode": mode,
    "xi": xi,
    "strand": strand,
    "orientation": orientation,
    "n": n,
    "context": context,
    "error": err,
})

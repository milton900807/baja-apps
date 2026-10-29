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
                for rec in incl.values():
                    junctions.append({"d": rec["d"], "a": rec["a"],
                                      "dp": rec["dp"], "ap": rec["ap"],
                                      "mag": round(min(rec["psis"]), 4), "kind": "inclusion",
                                      "annotated": rec["annotated"],
                                      "exon": (rec["exons"][0] if rec["exons"] else None),
                                      "exons": sorted(rec["exons"])})
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
    "mode": mode,
    "xi": xi,
    "strand": strand,
    "orientation": orientation,
    "n": n,
    "context": context,
    "error": err,
})

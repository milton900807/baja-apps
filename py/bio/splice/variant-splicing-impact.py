"""What a variant does to splicing, and whether the result is degraded by NMD.

One call for the whole mechanistic chain, because the pieces already existed
separately and nothing joined them:

    variant -> splice-site strength (SpliceNet, ref vs alt)
            -> which boundary moves, and by how far
            -> the frame consequence of that shift
            -> the premature stop it creates, against the 50-55 nt rule
            -> which RBPs sit over the affected sequence (context only)

WHY SpliceNet AND NOT THE RBP MODEL for the variant itself. The question "does
this base matter" is a single-nucleotide question, and SpliceNet is trained on
exactly it. BajaCLIP is a 64-nt window CNN with a global max pool: it reports
which motifs are PRESENT in a window, not which base holds a site up. Measured
directly, destroying a 3'SS AG moves U2AF1's specificity rank by 0.00 and
destroying a 5'SS GT moves every head by less than 0.01, while disrupting a
GAAGAA enhancer across several bases does move TRA2A by -0.18. The library says
the same thing about RBP identity in bajasplice/bajaclip.py: matched-vs-
mismatched AUROC 0.698 against 0.516. So the RBP block below is reported as
context for forming a hypothesis, never as evidence that a variant changed a
protein's binding.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/N) in TRACK order, as splicing-profile.py takes it
    param(2) : xi -- the track x of the first base
    param(3) : strand ('1' | '-1')
    param(4) : the variant's track x
    param(5) : reference allele (plus-strand base(s), as a VCF writes them)
    param(6) : alternate allele
    param(7) : exons, JSON [[start, end], ...] in track x, optional but needed
               for the frame and NMD answers
    param(8) : CDS start in track x, optional; needed for the NMD answer
    param(9) : orientation of a minus-strand string ('plus' | 'coding'),
               same meaning as splicing-profile.py's param(6)

Resolves { delta, moved, frame, nmd, rbp, error }.
"""
import json

# How far either side of the variant a changed site is looked for. SpliceAI uses
# 50; a cryptic site further out than that is not plausibly caused by this base.
WIN = 50
# A change smaller than this is noise rather than a finding.
MIN_DELTA = 0.02
# THE 50-55 NT RULE. A stop more than this far upstream of the LAST exon-exon
# junction leaves an exon junction complex downstream of the ribosome, which is
# what triggers NMD. Closer than this, or in the last exon, and the transcript
# escapes. 55 is the conservative end of the range quoted in the literature.
NMD_LAST_JUNCTION_NT = 55

works = lion_engine.works(works_param)
em = works.param(0)

seq = str(works.param(1) or "").strip().upper()
try:
    xi = int(float(works.param(2) or 0))
except Exception:
    xi = 0
strand = str(works.param(3) or "1")
minus = strand.strip() in ("-1", "-")
try:
    var_x = int(float(works.param(4)))
except Exception:
    var_x = None
ref = str(works.param(5) or "").strip().upper()
alt = str(works.param(6) or "").strip().upper()
try:
    exons = json.loads(works.param(7) or "[]") or []
except Exception:
    exons = []
try:
    cds_start = int(float(works.param(8)))
except Exception:
    cds_start = None
orientation = str(works.param(9) or "plus").strip().lower()

delta = {}
moved = {}
frame = {}
nmd = {}
rbp = []
err = ""

STOPS = ("TAA", "TAG", "TGA")

if not seq:
    err = "no sequence provided"
elif var_x is None:
    err = "no variant position provided"
elif not ref or not alt:
    err = "ref and alt alleles are required"
else:
    try:
        import numpy as np
        import torch
        from bajasplice.scan import load_splicenet
        from bajasplice.genome import one_hot, _BASE, _COMP

        works.msg("Loading splicing model…")
        model, context, device = load_splicenet()
        c = context // 2

        codes_x = _BASE[np.frombuffer(seq.encode(), np.uint8)].astype(np.int64)
        n = int(len(codes_x))
        vi_x = int(var_x - xi)                      # variant index in track order
        if not (0 <= vi_x < n):
            raise RuntimeError("variant at x=%d is outside the sequence" % var_x)

        # The string the model sees is the TRANSCRIPT, which on the minus strand
        # is the reverse (complemented when the loader has not done it already).
        def to_tx(arr_x):
            if not minus:
                return arr_x
            a = arr_x[::-1].copy()
            return _COMP[a].astype(np.int64) if orientation == "plus" else a

        def tx2x(j):
            return int(xi + (n - 1 - j)) if minus else int(xi + j)

        def x2tx(x):
            return int((n - 1) - (x - xi)) if minus else int(x - xi)

        # ALLELES ARE PLUS-STRAND, as a VCF writes them, so on a minus-strand
        # track they are complemented before being spliced into the track array.
        COMPCH = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}
        ref_t = ref if (not minus or orientation != "plus") else "".join(COMPCH.get(b, "N") for b in ref)
        alt_t = alt if (not minus or orientation != "plus") else "".join(COMPCH.get(b, "N") for b in alt)

        got = "".join("NACGT"[int(v)] for v in codes_x[vi_x:vi_x + len(ref_t)])
        ref_ok = (got == ref_t)

        alt_codes_x = np.concatenate([
            codes_x[:vi_x],
            _BASE[np.frombuffer(alt_t.encode(), np.uint8)].astype(np.int64),
            codes_x[vi_x + len(ref_t):]])

        def score(codes):
            """(acceptor, donor) over the whole sequence, transcript order."""
            m = int(len(codes))
            pad = np.concatenate([np.zeros(c, np.int64), codes, np.zeros(c, np.int64)])
            x = torch.from_numpy(one_hot(pad)[None]).to(device)
            with torch.no_grad():
                p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
            return p[1, :m], p[2, :m]

        works.msg("Scoring the reference…")
        a_ref, d_ref = score(to_tx(codes_x))
        works.progress(40)
        works.msg("Scoring the variant…")
        a_alt, d_alt = score(to_tx(alt_codes_x))
        works.progress(75)

        # Compare over the common length: an indel shifts everything after it.
        L = min(len(a_ref), len(a_alt))
        vi_t = x2tx(var_x) if not minus else x2tx(var_x)
        lo, hi = max(0, vi_t - WIN), min(L, vi_t + WIN + 1)
        da = a_alt[lo:hi] - a_ref[lo:hi]
        dd = d_alt[lo:hi] - d_ref[lo:hi]

        def peak(arr, sign):
            if not len(arr):
                return 0.0, None
            j = int(np.argmax(arr * sign))
            return float(arr[j] * sign), tx2x(lo + j)

        ag, ag_x = peak(da, 1.0)
        al, al_x = peak(da, -1.0)
        dg, dg_x = peak(dd, 1.0)
        dl, dl_x = peak(dd, -1.0)
        delta = {
            "acceptor_gain": round(ag, 4), "acceptor_gain_x": ag_x,
            "acceptor_loss": round(al, 4), "acceptor_loss_x": al_x,
            "donor_gain": round(dg, 4), "donor_gain_x": dg_x,
            "donor_loss": round(dl, 4), "donor_loss_x": dl_x,
            "max": round(max(ag, al, dg, dl), 4),
            "ref_matches_sequence": bool(ref_ok),
            "window_nt": WIN,
        }

        # WHICH BOUNDARY MOVES. The strongest loss is the site being broken; the
        # strongest gain within the window is where splicing goes instead. The
        # distance between them is the shift, and its remainder mod 3 is whether
        # the protein frame survives.
        kind, lost_x, lost = max(
            [("acceptor", al_x, al), ("donor", dl_x, dl)], key=lambda t: t[2])
        gain_x, gain = (ag_x, ag) if kind == "acceptor" else (dg_x, dg)
        if lost >= MIN_DELTA:
            shift = (int(gain_x) - int(lost_x)) if (gain >= MIN_DELTA and gain_x is not None) else None
            moved = {
                "site": kind,
                "lost_x": lost_x, "lost_delta": round(lost, 4),
                "gained_x": gain_x if gain >= MIN_DELTA else None,
                "gained_delta": round(gain, 4) if gain >= MIN_DELTA else None,
                "shift_nt": shift,
                "outcome": ("cryptic " + kind) if shift else (
                    "exon skipping or intron retention"),
            }
            if shift is not None:
                frame = {"shift_nt": shift, "in_frame": (shift % 3 == 0),
                         "codons": (shift // 3) if shift % 3 == 0 else None}
            else:
                # No replacement site: the exon is lost whole, so the frame
                # depends on the exon's own length.
                ex = None
                for s, e in exons:
                    if min(s, e) <= lost_x <= max(s, e):
                        ex = (min(s, e), max(s, e)); break
                if ex:
                    ln = ex[1] - ex[0] + 1
                    frame = {"skipped_exon_nt": ln, "in_frame": (ln % 3 == 0),
                             "codons": (ln // 3) if ln % 3 == 0 else None}
        else:
            moved = {"site": None, "outcome": "no splice-site change above %.2f" % MIN_DELTA}

        # NMD. Needs the exon structure and where translation starts: without
        # them the frame answer still stands but the verdict does not.
        if exons and cds_start is not None and frame and frame.get("in_frame") is False:
            ex = sorted([(min(s, e), max(s, e)) for s, e in exons])
            if minus:
                ex = ex[::-1]
            # Spliced transcript, with each exon's start in transcript coords, so
            # the LAST junction can be located.
            tx, bounds, acc_len = [], [], 0
            for s, e in ex:
                a, b = x2tx(e), x2tx(s)
                a, b = min(a, b), max(a, b)
                piece = "".join("NACGT"[int(v)] for v in to_tx(codes_x)[a:b + 1])
                bounds.append((acc_len, acc_len + len(piece) - 1))
                tx.append(piece); acc_len += len(piece)
            mrna = "".join(tx)
            last_junction = bounds[-1][0] if len(bounds) > 1 else None
            # Translation start in transcript coords, then the first stop in the
            # SHIFTED frame, which is what the variant creates.
            cds_t = x2tx(cds_start)
            start_in_mrna = None
            run = 0
            for (s, e), (bs, be) in zip(ex, bounds):
                a, b = x2tx(e), x2tx(s)
                a, b = min(a, b), max(a, b)
                if a <= cds_t <= b:
                    start_in_mrna = bs + (cds_t - a); break
            if start_in_mrna is not None and last_junction is not None:
                off = (frame.get("shift_nt") or frame.get("skipped_exon_nt") or 0) % 3
                ptc = None
                i = start_in_mrna + off
                while i + 3 <= len(mrna):
                    if mrna[i:i + 3] in STOPS:
                        ptc = i; break
                    i += 3
                if ptc is not None:
                    d_last = last_junction - ptc
                    nmd = {
                        "ptc_tx": int(ptc),
                        "last_junction_tx": int(last_junction),
                        "nt_upstream_of_last_junction": int(d_last),
                        "rule_nt": NMD_LAST_JUNCTION_NT,
                        "predicted": bool(d_last > NMD_LAST_JUNCTION_NT),
                        "basis": ("premature stop more than %d nt upstream of the last "
                                  "exon-exon junction, so an EJC remains downstream"
                                  % NMD_LAST_JUNCTION_NT) if d_last > NMD_LAST_JUNCTION_NT else
                                 ("stop is within %d nt of the last junction, or in the "
                                  "last exon, so NMD is escaped" % NMD_LAST_JUNCTION_NT),
                    }

        # RBP CONTEXT ONLY. See the module docstring: this model cannot resolve a
        # single base, so a change here is a hypothesis about the region, never
        # evidence that the variant altered a protein's binding.
        try:
            works.msg("RBP context…")
            from bajaclip.scan import load_model as load_clip
            clip = load_clip()
            W = int(clip.max_len)
            h = W // 2
            def win(codes):
                a = max(0, vi_x - h); b = min(len(codes), a + W)
                return "".join("NACGT"[int(v)] for v in codes[a:b]).ljust(W, "A")
            P = clip.score_windows([win(codes_x), win(alt_codes_x)])
            nh = P.shape[1]
            rk = [(P[k] < P[k][:, None]).sum(axis=1) / max(1, nh - 1) for k in (0, 1)]
            d = rk[1] - rk[0]
            order = sorted(range(nh), key=lambda i: -abs(float(d[i])))[:8]
            rbp = [{"rbp": clip.proteins[i],
                    "rank_ref": round(float(rk[0][i]), 3),
                    "rank_alt": round(float(rk[1][i]), 3),
                    "delta": round(float(d[i]), 3)} for i in order]
        except Exception:
            rbp = []

        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "delta": json.dumps(delta),
    "moved": json.dumps(moved),
    "frame": json.dumps(frame),
    "nmd": json.dumps(nmd),
    "rbp": json.dumps(rbp),
    "error": err,
})

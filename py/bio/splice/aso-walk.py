"""BajaASOWalk: tile an oligo footprint along an exon's flanks and report where
blocking the RNA would help the exon.

The wet experiment this imitates is standard: tile antisense oligos, measure
inclusion, and the positions that raise it are the silencers worth drugging.
ISS-N1 and nusinersen came out of exactly that.

MASKING, NOT SUBSTITUTION. An ASO occludes its site rather than rewriting it, so
N -- information removed, no motif added -- is the honest analogue. Substituting
scrambled sequence is not, and that is measured rather than argued: against
ISS-N1 it gave donor scores from 0.037 to 0.996 across twelve shuffles, because
a shuffle 10 nt from a real donor invents cryptic GTs and creates elements
instead of removing one.

RANKED ON LOGITS. A donor already at 0.93 can gain at most 0.07 as a
probability, so every effective footprint pins against the ceiling and the
ordering among them is noise.

FOOTPRINTS ON THE SITE ITSELF ARE EXCLUDED. Masking the exonic half of a weak
donor's consensus RAISES the model's score, because removing unfavourable
context lets it fall back on a better prior. In a cell an oligo there blocks the
donor and causes skipping, so those hits are not noisy but inverted.

Validated on the one case with a drug attached: masking ISS-N1 (intron 7
+10..+27 of SMN2) takes the exon 7 donor from 0.93012 to 0.99754, the same mask
34 nt further in takes it DOWN to 0.812, and ISS-N1 ranks 4th of 311 targetable
footprints in a 341-position walk.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/N) in TRACK order
    param(2) : xi, the track x of the first base
    param(3) : strand ('1' | '-1')
    param(4) : the exon's LAST base, in track x (its donor side)
    param(5) : oligo length, default 18
    param(6) : first offset relative to that base, default -40
    param(7) : last offset, default 300
    param(8) : orientation of a minus-strand string ('plus' | 'coding')

Resolves { walk, reference, excluded, error } where walk is
[[x, gain_logit, donor_prob, on_site], ...].
"""
import json

# The donor consensus runs about exon -6 to intron +6. A footprint overlapping
# it is reported with on_site=1 and left out of the ranking.
GUARD_EXON, GUARD_INTRON = -6, 6

works = lion_engine.works(works_param)
em = works.param(0)

seq = str(works.param(1) or "").strip().upper()
try:
    xi = int(float(works.param(2) or 0))
except Exception:
    xi = 0
minus = str(works.param(3) or "1").strip() in ("-1", "-")
try:
    exon_end_x = int(float(works.param(4)))
except Exception:
    exon_end_x = None
try:
    aso_len = max(6, int(float(works.param(5) or 18)))
except Exception:
    aso_len = 18
try:
    lo_off = int(float(works.param(6) if works.param(6) is not None else -40))
except Exception:
    lo_off = -40
try:
    hi_off = int(float(works.param(7) if works.param(7) is not None else 300))
except Exception:
    hi_off = 300
orientation = str(works.param(8) or "plus").strip().lower()

walk = []
reference = 0.0
excluded = 0
err = ""

if not seq:
    err = "no sequence provided"
elif exon_end_x is None:
    err = "no exon end provided"
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

        def to_tx(arr_x):
            if not minus:
                return arr_x
            a = arr_x[::-1].copy()
            return _COMP[a].astype(np.int64) if orientation == "plus" else a

        def x2tx(x):
            return int((n - 1) - (x - xi)) if minus else int(x - xi)

        # Transcript order runs 5'->3' on either strand, and x2tx has already
        # done the flip, so the first intronic base is always one further along.
        d_tx = x2tx(exon_end_x) + 1
        if not (0 <= d_tx < n):
            raise RuntimeError("the exon end is outside the sequence")

        def donor(codes_tx):
            pad = np.concatenate([np.zeros(c, np.int64), codes_tx, np.zeros(c, np.int64)])
            x = torch.from_numpy(one_hot(pad)[None]).to(device)
            with torch.no_grad():
                p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
            return float(p[2, d_tx])

        def lg(v):
            v = min(max(float(v), 1e-7), 1 - 1e-7)
            return float(np.log(v / (1 - v)))

        base_tx = to_tx(codes_x)
        reference = donor(base_tx)
        ref_lg = lg(reference)

        total = (hi_off - lo_off) + 1
        for k, off in enumerate(range(lo_off, hi_off + 1)):
            # the footprint covers off .. off+aso_len-1, in transcript order
            start = d_tx - 1 + off
            if start < 0 or start + aso_len > n:
                continue
            m2 = base_tx.copy()
            m2[start:start + aso_len] = 0                     # N: the oligo
            v = donor(m2)
            on_site = 1 if (off <= GUARD_INTRON and off + aso_len - 1 >= GUARD_EXON) else 0
            excluded += on_site
            x_at = int(exon_end_x + off) if not minus else int(exon_end_x - off)
            walk.append([x_at, round(lg(v) - ref_lg, 4), round(v, 5), on_site])
            if k % 25 == 0:
                works.progress(int(100.0 * k / max(1, total)))
        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "walk": json.dumps(walk),
    "reference": json.dumps(round(float(reference), 5)),
    "excluded": json.dumps(int(excluded)),
    "error": err,
})

import os
import re
import sys
import json
import subprocess

# WHICH CLINVAR VARIANTS CHANGE SPLICING, for one gene or one region.
#
#   exec('py/bio/splice/clinvar-splice-variants.py', em, gene, window, minDelta, classes)
#     param(1) gene symbol (e.g. 'TARDBP'), OR a region 'chr:start-end'
#     param(2) nt from an annotated splice site to consider   (default 300)
#     param(3) minimum delta to report                        (default 0.1)
#     param(4) comma-separated ClinVar significance filter, '' = all
#              (e.g. 'pathogenic,likely_pathogenic' or 'uncertain')
#     param(5) '1' to include indels as well as substitutions (default: SNVs only)
#
# WHAT IT ACTUALLY PREDICTS, said plainly because the distinction matters:
# the model scores the CHANGE IN SPLICE-SITE PROBABILITY caused by the variant --
# the same quantity SpliceAI reports. It does not predict delta-PSI, and it does not
# predict pathogenicity. On this machine's own validation it separates pathogenic
# splice variants from benign missense at AUC 0.991, but only AUC 0.718 for
# pathogenic-vs-benign among splice variants. So: good at "does this disturb a splice
# site", weak at "is that clinically bad". The output says so.
#
# WHY IT DOES NOT JUST REUSE bajasplice.validate.datasets.load_clinvar():
# that loader selects on ClinVar's own MC=splice_donor_variant|splice_acceptor_variant,
# which by construction can only return variants already called splice variants. The
# interesting cases for ALTERNATIVE splicing are the ones nobody labelled: deep-intronic
# variants that create a cryptic site, synonymous and missense variants that break an
# exonic splicing enhancer or a real site the annotation does not credit. So candidates
# are selected by DISTANCE TO AN ANNOTATED SPLICE SITE instead, and every consequence
# class is kept.

from ion import works


# The server spawns the system python3, which has neither torch nor bajasplice.
# Re-exec under the project virtualenv (which does) if this interpreter can't import
# them. Copied from py/bio/splice/splicing-profile.py, which solved this first.
def _reexec_under_venv():
    try:
        import numpy      # noqa: F401
        import torch      # noqa: F401
        import bajasplice  # noqa: F401
        return
    except Exception:
        pass
    if os.environ.get("BAJASPLICE_REEXEC") == "1":
        return
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3"),
               "/opt/venv/bin/python3"):
        if not py or not os.path.exists(py):
            continue
        # Compare the venv PREFIX, not the binary: a venv's python is usually a symlink
        # to the system interpreter.
        prefix = os.path.dirname(os.path.dirname(os.path.abspath(py)))
        if os.path.abspath(prefix) == os.path.abspath(sys.prefix):
            continue
        os.environ["BAJASPLICE_REEXEC"] = "1"
        os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])


_reexec_under_venv()

_LIB = os.path.expanduser("~/baja-apps/py/bajasplice-lib")
if os.path.isdir(_LIB) and _LIB not in sys.path:
    sys.path.insert(0, _LIB)

MAX_VARIANTS = 4000          # a whole-gene ClinVar pull, bounded
MAX_ALLELE = 50              # skip structural variants, as read-vcf-variants.py does


def clinvar_vcf():
    """The ClinVar VCF, preferring the server's canonical copy.

    bajasplice's own clinvar_path() misses this one and falls back to an older copy
    under ~/ml/rna_binding, so the path is resolved here rather than inherited.
    """
    # The reference store is at ~/baja-server here and /opt/baja-server on the box, and
    # a py job's working directory is not guaranteed either -- so try both roots and the
    # relative path the other service scripts use.
    for p in (os.environ.get("BAJASPLICE_CLINVAR"),
              "reference_data/variants/clinvar.vcf.gz",
              "/opt/baja-server/reference_data/variants/clinvar.vcf.gz",
              os.path.expanduser("~/baja-server/reference_data/variants/clinvar.vcf.gz"),
              os.path.expanduser("~/ml/splicing/data/raw/clinvar/clinvar.vcf.gz"),
              os.path.expanduser("~/ml/rna_binding/clinvar.vcf.gz")):
        if p and os.path.exists(p) and os.path.exists(p + ".tbi"):
            return p
    # A copy with no .tbi cannot be queried by region; say so rather than fail obscurely.
    for p in (os.environ.get("BAJASPLICE_CLINVAR"),
              "/opt/baja-server/reference_data/variants/clinvar.vcf.gz",
              os.path.expanduser("~/baja-server/reference_data/variants/clinvar.vcf.gz")):
        if p and os.path.exists(p):
            return p
    return None


def fetch_region(path, chrom, start, end):
    """VCF rows for a region, via pysam or the tabix CLI (production has no pysam)."""
    try:
        import pysam
        tb = pysam.TabixFile(path, encoding="utf-8")
        names = set(tb.contigs)
        c = chrom if chrom in names else ("chr" + chrom if "chr" + chrom in names else chrom)
        for row in tb.fetch(c, max(0, start - 1), end):
            yield row
        return
    except ImportError:
        pass
    except Exception:
        pass
    import shutil
    tabix = shutil.which("tabix") or "/usr/bin/tabix"
    if not os.path.exists(tabix):
        raise RuntimeError("neither pysam nor the tabix CLI is available")
    for c in (chrom, "chr" + chrom):
        r = subprocess.run([tabix, path, "%s:%d-%d" % (c, start, end)],
                           capture_output=True, text=True, timeout=300)
        if r.returncode == 0 and r.stdout.strip():
            for line in r.stdout.splitlines():
                if line and not line.startswith("#"):
                    yield line
            return


def parse_info(info):
    d = {}
    for kv in str(info or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k] = v
        elif kv:
            d[kv] = ""
    return d


# Most variants a run reports; beyond this the delta-PSI pass is skipped for the rest.
# Four 2400 nt windows, twice (reference and alternate), per variant is real compute.
MAX_DPSI = 400
# Samples per PSINet forward pass. The whole batch at once is tens of megabytes of
# activations on a CPU-only box, which is where this runs in production.
DPSI_CHUNK = 12
# BANDS CALIBRATED ON MFASS, because the raw magnitude is not calibrated and reading it as a
# percentage is wrong (see add_dpsi's docstring: predicted medians are ~100x smaller than
# measured). These two thresholds on -delta-PSI are the 95th and 99th percentiles of the
# predicted score among 225 MFASS variants MEASURED as neutral (|measured dPSI| < 0.02), so
# they are false-positive rates against real measurements rather than guesses.
#   >= 0.032  99% specificity, 36% sensitivity for measured SDVs (measured dPSI <= -0.5)
#   >= 0.010  95% specificity, 50% sensitivity
DPSI_LIKELY = 0.032
DPSI_POSSIBLE = 0.010


def add_dpsi(scored, exons, strand, ref_chrom, genome, device):
    """PSI of the exon each variant sits in, on the reference AND the alternate sequence.

    WHY THIS EXISTS. The site-level score is max(acceptor_gain, acceptor_loss,
    donor_gain, donor_loss) over a +/-50 nt window around the variant, so it asks "is a
    splice site disturbed here". That is not the same question as "is this exon skipped",
    for two reasons:

      * max() throws the PAIRING away. An exon is defined by its acceptor AND its donor
        together, and degrading both ends compromises inclusion in a way neither alone
        does -- but one 0.3 loss and two 0.3 losses at the two ends of one exon both
        report delta = 0.3.
      * the other end is usually not even in the window. The median human exon is ~120 nt,
        so for a variant at the acceptor the donor lies outside +/-50 nt entirely.

    PSINet answers the real question directly: it takes all four sites of a cassette event
    (upstream donor, this exon's acceptor and donor, downstream acceptor) plus geometry and
    returns inclusion. Running it on the reference and on the alternate sequence gives
    delta-PSI -- how far the isoform ratio moves -- which is what "skipping" means.

    NOT A REPLACEMENT for the site-level delta, which stays the ranking number. Measured on
    303 ClinVar variants across 20 genes (BRCA1/2, ATM, NF1, CFTR, MSH2/6, MLH1, TP53, LDLR,
    FBN1, RB1, APC, PALB2, PTEN, NPC1, DYSF, COL4A5, POLE, VHL), pathogenic splice variants
    vs benign:

        site-level delta   AUC 0.989      <- still the better discriminator
        |delta-PSI|        AUC 0.965
        -delta-PSI         AUC 0.909
        delta + |dPSI|     AUC 0.995      <- only marginally better, on a confounded set

    The comparison IS confounded and cannot be de-confounded with ClinVar: all 194
    pathogenic variants within 2 nt of a site had no benign counterpart at those positions
    (median distance to a site: 2 nt for pathogenic, 185 nt for benign). A variant at GT/AG
    is essentially never called benign, so "at the essential position" and "pathogenic" are
    the same stratum and any AUC here partly measures distance.

    WHAT THE NUMBERS DO SUPPORT, because they are one-sided:
      * specificity is excellent -- 0 of 64 benign variants moved inclusion by 0.05, and
        none in either direction;
      * sensitivity is poor -- 42% of pathogenic splice variants show |delta-PSI| < 0.05.
        The reason is saturation: 76% of these exons are predicted at PSI > 0.99, and on
        those 50% of pathogenic variants produce no movement at all (25% on exons the model
        calls alternative). A sigmoid pinned at 1.0 cannot report that a site was destroyed.
      * coverage is 58% -- terminal exons have no skip event to score.

    CALIBRATED AGAINST MEASURED delta-PSI (MFASS; Cheung et al., Mol Cell 2019;
    KosuriLab/MFASS processed_data/snv/snv_data_clean.txt, column v2_dpsi). 960 variants
    sampled stratified by measured effect, mapped to their endogenous exon by hg38 boundary
    match, scored in NATIVE context by this function:

        Spearman vs measured dPSI:   predicted delta-PSI  +0.501
                                     site-level delta     -0.427   (less of the same signal)
        measured SDV vs neutral:     |delta-PSI| AUC 0.855
                                     site-level  AUC 0.825
        at 95% specificity on measured neutrals: 50% sensitivity (site-level: 47%)

    So delta-PSI RANKS better against measured truth than the site-level score -- the
    opposite of the ClinVar comparison above, and the more trustworthy of the two, because
    MFASS is a measurement and ClinVar is a label.

    THE MAGNITUDE IS NOT CALIBRATED, and this is the number that matters:

        measured stratum   median MEASURED    median PREDICTED
        strong (<=-0.5)         -0.847             -0.010
        moderate                -0.140             -0.002
        mild                    -0.052             -0.000
        neutral                 +0.006             +0.000

    Compressed by about two orders of magnitude, and 66% of variants MEASURED as strongly
    splice-disrupting get |predicted| < 0.05. Saturation explains most of it: 70% of these
    exons are predicted at PSI > 0.99 in native context, and among measured SDVs on those
    exons 80% show no predicted movement at all.

    PART OF THE GAP IS THE ASSAY, NOT MODEL ERROR, and it must not be read as "the model is
    100x wrong". MFASS measures a 170 nt MINIGENE -- the exon (median 81 nt) with only ~45 nt
    of flanking intron -- so the exon is cut off from its real neighbours and its real
    kilobase introns. An exon that is robustly constitutive at its own locus can be fragile
    in that reporter. The two are not measuring the same system, which is precisely why the
    RANK agrees and the SCALE does not.

    CONCLUSION, and what this function therefore reports: the BAND (DPSI_LIKELY /
    DPSI_POSSIBLE, set at 99% and 95% specificity against measured neutrals), never the
    magnitude as a percentage. A blank means no information, not "no effect".

    Mutates `scored` in place, setting psi_ref / psi_alt / dpsi / psi_exon where it could be
    computed and dpsi_note where it could not. Returns a note about the pass as a whole, or
    None when it ran normally.
    """
    if not scored:
        return None
    if exons is None:
        return "delta-PSI needs annotated exons; a region was given rather than a gene"

    import numpy as np
    import torch
    from bajasplice.genome import one_hot
    from bajasplice.scan import resolve_checkpoint
    from bajasplice.models import PSINet

    # ONE TRANSCRIPT, NOT THE WHOLE GENE. gene_span returns every exon of every
    # transcript -- SMN2 has 157 exon rows across 23 transcripts -- and a cassette event
    # built from that is nonsense: "the exon before this one" becomes an arbitrary
    # overlapping exon from a different isoform. Scored that way SMN2 reported an exon
    # number of 130 for a nine-exon gene, which is how the mistake announced itself.
    # MANE Select is the transcript to use where it is flagged; otherwise the one with the
    # most exons, which is the best available stand-in for the dominant isoform.
    tx_id = None
    ex_g = None
    try:
        if hasattr(exons, "columns") and "transcript_id" in exons.columns:
            df = exons
            pick = None
            if "mane" in df.columns:
                mane = df[df["mane"].astype(str).isin(("1", "True", "true"))]
                if len(mane):
                    pick = mane
                    tx_id = str(mane["transcript_id"].iloc[0])
            if pick is None:
                counts = df.groupby("transcript_id").size().sort_values(ascending=False)
                tx_id = str(counts.index[0])
                pick = df[df["transcript_id"] == tx_id]
            ex_g = sorted([(int(a), int(b)) for a, b in pick[["start", "end"]].values])
    except Exception:
        ex_g = None
    if ex_g is None:
        ex_g = sorted([(int(a), int(b)) for a, b in
                       (exons[["start", "end"]].values if hasattr(exons, "values") else exons)])
    # Overlapping or duplicated entries would still break the chain, so collapse them.
    merged = []
    for a, b in ex_g:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    ex_g = merged
    if len(ex_g) < 3:
        return ("delta-PSI needs three consecutive exons to form a skip event; "
                "the chosen transcript has %d" % len(ex_g))
    minus = (str(strand) in ("-", "-1"))

    works.msg("Loading the inclusion model (PSINet)\u2026")
    pck = resolve_checkpoint(name="psi_ctx2000")
    ck = torch.load(str(pck), map_location="cpu", weights_only=False)
    pa = ck["args"]
    total = int(pa["win"] + pa["context"])
    half = total // 2
    n_tis = int(ck["model"]["out_tissue.weight"].shape[0])
    pnet = PSINet(n_tissues=n_tis, context=pa["context"],
                  ch=pa["channels"], win=pa["win"]).to(device).eval()
    pnet.load_state_dict(ck["model"])

    # ONE transcript-order array for the whole gene, so every genomic position maps with the
    # same two lines of arithmetic and the window extraction is byte-identical to the one
    # splicing-profile.py feeds PSINet. Extended by a full window either side so a site in a
    # terminal exon gets real sequence instead of zero padding. Getting this mapping wrong is
    # the failure that produces confident nonsense rather than an error, so it lives in one
    # place and is asserted against the reference allele below.
    span_lo = ex_g[0][0] - total
    span_hi = ex_g[-1][1] + total
    codes = genome.codes(ref_chrom, span_lo, span_hi,
                         "-" if minus else "+").astype(np.int64)
    N = len(codes)

    def tx(g):
        """Genomic position -> index into `codes` (transcript order)."""
        return (span_hi - g) if minus else (g - span_lo)

    # Each exon as (first, last) transcript indices, first < last on either strand; then put
    # the list itself in transcript order, which on the minus strand is descending genomic.
    ex_tx = [((tx(b), tx(a)) if minus else (tx(a), tx(b))) for (a, b) in ex_g]
    if minus:
        ex_tx.reverse()

    def event_sites(k):
        """The four site indices of the cassette event whose middle exon is k.

        Same convention as the PSINet training labels and splicing-profile.py: the acceptor
        is the last intronic base before the exon, the donor the first intronic base after.
        """
        return (ex_tx[k - 1][1] + 1, ex_tx[k][0] - 1,
                ex_tx[k][1] + 1, ex_tx[k + 1][0] - 1)

    def win_at(arr, center):
        w = np.zeros(total, np.int64)
        lo, hi = center - half, center + half
        a0, b0 = max(0, lo), min(len(arr), hi)
        if b0 > a0:
            w[a0 - lo:b0 - lo] = arr[a0:b0]
        return one_hot(w)

    def gcf(cc):
        return float(((cc == 2) | (cc == 3)).sum() / max(int((cc > 0).sum()), 1))

    def geom_of(arr, k):
        c1d, a_acc, a_don, c2a = event_sites(k)
        c1_last, a_first, a_last, c2_first = c1d - 1, a_acc + 1, a_don - 1, c2a + 1
        exon_len = a_last - a_first + 1
        up = a_first - c1_last - 1
        dn = c2_first - a_last - 1
        return np.array([
            np.log10(max(exon_len, 1)), np.log10(max(up, 1)), np.log10(max(dn, 1)),
            1.0 if exon_len % 3 == 0 else 0.0,
            gcf(arr[a_acc + 1:a_don]), gcf(arr[c1d:c1d + 200])], dtype=np.float32)

    def exon_for(t):
        """The exon a transcript index belongs to, or the nearest one."""
        best, bd = None, None
        for k, (a, b) in enumerate(ex_tx):
            d = 0 if (a <= t <= b) else min(abs(t - a), abs(t - b))
            if bd is None or d < bd:
                bd, best = d, k
        return best

    CODE = {"A": 1, "C": 2, "G": 3, "T": 4}
    COMP = {0: 0, 1: 4, 2: 3, 3: 2, 4: 1}

    jobs = []
    for c in scored:
        if c.get("kind") != "snv":
            # An indel shifts everything downstream, so ref and alt windows are out of
            # register and the difference measures the shift as much as the splicing.
            c["dpsi_note"] = "computed for substitutions only"
            continue
        if len(jobs) >= MAX_DPSI:
            c["dpsi_note"] = "not computed (per-run limit of %d reached)" % MAX_DPSI
            continue
        t = tx(int(c["pos"]))
        if not (0 <= t < N):
            c["dpsi_note"] = "outside the scored span"
            continue
        k = exon_for(t)
        if k is None:
            c["dpsi_note"] = "no exon found near this position"
            continue
        if k == 0 or k == len(ex_tx) - 1:
            # There is no "skip this exon" isoform for a terminal exon: skipping it would
            # remove the transcript's own start or end, which is a different event.
            c["dpsi_note"] = "a terminal exon has no skip event to score"
            continue
        ac = CODE.get(str(c["alt"]).upper()[:1])
        rc = CODE.get(str(c["ref"]).upper()[:1])
        if not ac:
            c["dpsi_note"] = "unrecognised alternate allele"
            continue
        if minus:
            ac = COMP[ac]
            rc = COMP[rc] if rc else rc
        # THE COORDINATE CHECK. If the assembly base here is not the one ClinVar calls the
        # reference, the mapping is wrong and the substitution is being applied somewhere
        # else -- which would produce a confident delta-PSI for a mutation that is not the
        # one asked about. Refuse instead.
        if rc and int(codes[t]) != rc:
            c["dpsi_note"] = "reference base does not match the assembly at this position"
            continue
        alt = codes.copy()
        alt[t] = ac
        jobs.append((c, k, alt))

    if not jobs:
        return "delta-PSI: no variant in this run sits in a scoreable cassette exon"

    works.msg("Scoring exon inclusion for %d variant%s (PSINet)\u2026"
              % (len(jobs), "" if len(jobs) == 1 else "s"))
    wins, geoms = [], []
    for (c, k, alt) in jobs:
        s4 = event_sites(k)
        wins.append(np.stack([win_at(codes, q) for q in s4]))
        geoms.append(geom_of(codes, k))
        wins.append(np.stack([win_at(alt, q) for q in s4]))
        geoms.append(geom_of(alt, k))

    psi = np.zeros(len(wins), np.float32)
    for off in range(0, len(wins), DPSI_CHUNK):
        wt = torch.from_numpy(np.stack(wins[off:off + DPSI_CHUNK])).to(device)
        gt = torch.from_numpy(np.stack(geoms[off:off + DPSI_CHUNK])).to(device)
        with torch.no_grad():
            ot, _om = pnet(wt, gt)
            psi[off:off + wt.shape[0]] = torch.sigmoid(ot).mean(dim=1).cpu().numpy()
        works.progress(int(100 * min(off + DPSI_CHUNK, len(wins)) / max(1, len(wins))))

    for i, (c, k, _alt) in enumerate(jobs):
        pr, pl = float(psi[2 * i]), float(psi[2 * i + 1])
        c["psi_ref"] = round(pr, 4)
        c["psi_alt"] = round(pl, 4)
        c["dpsi"] = round(pl - pr, 4)
        c["psi_exon"] = k + 1                     # 1-based, transcript order
        c["psi_transcript"] = tx_id
        c["psi_exons_total"] = len(ex_tx)
        d = pl - pr
        # The BAND is the part to report; the raw number is kept for transparency but must
        # not be read as "the exon loses this much inclusion".
        if -d >= DPSI_LIKELY:
            c["dpsi_band"] = "likely skipping"
        elif -d >= DPSI_POSSIBLE:
            c["dpsi_band"] = "possible skipping"
        else:
            c["dpsi_band"] = "no skipping signal"
        # Gains of inclusion are NOT calibrated: on the 88 MFASS variants measured as
        # INCREASING inclusion the model predicted a median of +0.000, i.e. nothing. So a
        # positive delta-PSI is not reported as a finding.
        c["dpsi_effect"] = c["dpsi_band"] if d < 0 else "no skipping signal"
    return None


def main():
    gene_or_region = str(works.param(1) or "").strip()
    win_nt = int(float(works.param(2) or 300))
    min_delta = float(works.param(3) or 0.1)
    sig_filter = [s.strip().lower().replace(" ", "_")
                  for s in str(works.param(4) or "").split(",") if s.strip()]
    # SUBSTITUTIONS ONLY BY DEFAULT. delta_score compares the ref and alt tracks over a
    # common window, so for an indel the two sequences are out of register downstream of
    # the variant and the difference partly measures that shift rather than a change in
    # splicing -- a 4 nt deletion in TARDBP scored a perfect 1.000 that way. Indels are
    # still scoreable and can be asked for, but they are not the default and the payload
    # says which was used.
    include_indels = str(works.param(5) or "").strip() in ("1", "true", "yes")

    if not gene_or_region:
        works.resolve({"status": "error", "error": "give a gene symbol or chr:start-end"})
        return

    import numpy as np
    import torch                                      # noqa: F401
    from bajasplice.scan import load_splicenet, gene_span
    from bajasplice.genome import GenomeReader
    from bajasplice.variants import delta_score

    # ---- the region, and the strand ------------------------------------------------
    # Strand matters: the validation suite takes max(delta) over both strands because a
    # gene symbol was not to hand. Here it is, so the real strand is used -- cheaper,
    # and it stops a plus-strand donor being reported for a minus-strand gene.
    gene = None
    m = re.match(r"^(chr)?([\w.]+):(\d[\d,]*)-(\d[\d,]*)$", gene_or_region)
    if m:
        chrom = m.group(2)
        start = int(m.group(3).replace(",", ""))
        end = int(m.group(4).replace(",", ""))
        strand = "+"
        exons = None
    else:
        gene = gene_or_region.upper()
        try:
            chrom, start, end, strand, exons = gene_span(gene)
        except Exception as e:
            works.resolve({"status": "error", "error": "gene not found: %s (%s)" % (gene, e)})
            return
        chrom = str(chrom)

    # TWO NAMINGS FOR THE SAME CHROMOSOME, and they are not interchangeable. The genome
    # FASTA this model reads is GENCODE-style ('chr1'); ClinVar's VCF is Ensembl-style
    # ('1'). Passing the VCF's name to the genome reader raises KeyError per variant --
    # which, caught per variant, produced a clean "0 results" for a gene full of splice
    # variants. Keep both names and use each where it belongs.
    ref_chrom = chrom if chrom.startswith("chr") else "chr" + chrom
    vcf_chrom = chrom[3:] if chrom.startswith("chr") else chrom

    # ---- annotated splice sites, to select candidates by distance -------------------
    # An exon boundary that is not the transcript's own start or end is a splice site.
    sites = []
    try:
        if exons is not None and len(exons):
            ex = sorted([(int(a), int(b)) for a, b in
                         (exons[["start", "end"]].values if hasattr(exons, "values") else exons)])
            for k, (a, b) in enumerate(ex):
                if k > 0:
                    sites.append(a)          # acceptor side
                if k < len(ex) - 1:
                    sites.append(b)          # donor side
    except Exception:
        sites = []
    sites = sorted(set(sites))

    def near_site(pos):
        """Distance to the closest annotated splice site, or None when unknown."""
        if not sites:
            return None
        import bisect
        i = bisect.bisect_left(sites, pos)
        best = None
        for j in (i - 1, i):
            if 0 <= j < len(sites):
                d = abs(sites[j] - pos)
                if best is None or d < best:
                    best = d
        return best

    vcf = clinvar_vcf()
    if not vcf:
        works.resolve({"status": "error", "error": "ClinVar VCF not found"})
        return

    # ---- candidates ------------------------------------------------------------------
    cands, skipped_far, skipped_indel, total = [], 0, 0, 0
    for line in fetch_region(vcf, vcf_chrom, start, end):
        f = line.split("\t")
        if len(f) < 8:
            continue
        pos = int(f[1])
        ref = f[3]
        if len(ref) > MAX_ALLELE:
            continue
        info = parse_info(f[7])
        clnsig = info.get("CLNSIG", "").lower()
        if sig_filter and not any(s in clnsig for s in sig_filter):
            continue
        d = near_site(pos)
        # Selection is by DISTANCE, not by ClinVar's own consequence call -- the point is
        # to find variants nobody has labelled as splice variants.
        if d is not None and d > win_nt:
            skipped_far += 1
            continue
        for alt in str(f[4] or "").split(","):
            if not alt or alt == "." or len(alt) > MAX_ALLELE:
                continue
            is_snv = (len(ref) == 1 and len(alt) == 1)
            if not is_snv and not include_indels:
                skipped_indel += 1
                continue
            total += 1
            if len(cands) < MAX_VARIANTS:
                cands.append({
                    "chrom": vcf_chrom, "pos": pos, "ref": ref, "alt": alt,
                    "id": ("rs" + info["RS"]) if info.get("RS") else (f[2] if f[2] != "." else None),
                    "clinsig": info.get("CLNSIG", "").replace("_", " "),
                    "consequence": (info.get("MC", "").split("|")[-1] or None),
                    "gene": (info.get("GENEINFO", "").split(":")[0] or None),
                    "conditions": [c.replace("_", " ") for c in info.get("CLNDN", "").split("|")
                                   if c and c.lower() not in ("not_provided", "not_specified")][:4],
                    "dist_to_site": d,
                    "kind": "snv" if is_snv else "indel",
                })

    if not cands:
        works.resolve({"status": "ok", "gene": gene, "region": "%s:%d-%d" % (chrom, start, end),
                       "strand": strand, "count": 0, "scanned": 0, "skipped_far": skipped_far,
                       "skipped_indel": skipped_indel,
                       "variants": json.dumps([]),
                       "note": "no ClinVar variants within %d nt of an annotated splice site" % win_nt})
        return

    # ---- score ------------------------------------------------------------------------
    model, context, device = load_splicenet()
    genome = GenomeReader()
    scored, failed = [], []
    for c in cands:
        try:
            r = delta_score(model, context, ref_chrom, c["pos"], c["ref"], c["alt"],
                            device, strand=strand, window=50, genome=genome)
        except Exception as e:
            # COUNTED AND REPORTED, never just skipped. Swallowing these is what turned a
            # wrong chromosome name into a confident "0 variants affect splicing".
            failed.append({"pos": c["pos"], "error": str(e)[:200]})
            continue
        if r["delta"] < min_delta:
            continue
        c.update({k: round(float(v), 4) for k, v in r.items()})
        # WHICH WAY the splicing changes, which is the actual question. A loss destroys a
        # site the transcript uses; a gain creates one that competes with it. Those are
        # different mechanisms and different therapeutic handles, so they are named rather
        # than collapsed into one score.
        gain = max(r["acceptor_gain"], r["donor_gain"])
        loss = max(r["acceptor_loss"], r["donor_loss"])
        if gain >= loss:
            c["effect"] = "creates a cryptic %s site" % ("acceptor" if r["acceptor_gain"] >= r["donor_gain"] else "donor")
        else:
            c["effect"] = "weakens the %s site" % ("acceptor" if r["acceptor_loss"] >= r["donor_loss"] else "donor")
        c["direction"] = "gain" if gain >= loss else "loss"
        scored.append(c)

    scored.sort(key=lambda x: -x["delta"])

    # ---- delta-PSI: is the exon actually skipped? -------------------------------------
    # Only for the variants that already passed the site-level screen, which is what keeps
    # this affordable: DMD returns ten thousand variants and this would be four 2400 nt
    # windows, twice, for each of them.
    dpsi_note = None
    try:
        dpsi_note = add_dpsi(scored, exons, strand, ref_chrom, genome, device)
    except Exception as e:
        # Never let this sink the run: the site-level result is the validated one and stands
        # on its own. Say why it is missing instead of silently omitting a column.
        dpsi_note = "delta-PSI failed: %s" % (str(e)[:200])
    dpsi_count = sum(1 for c in scored if c.get("dpsi") is not None)

    works.resolve({
        "status": "ok",
        "gene": gene,
        "region": "%s:%d-%d" % (vcf_chrom, start, end),
        "strand": strand,
        "model": "ss_ctx2000 (bajasplice)",
        # Said in the payload, not just in this file, because whoever reads the table is
        # the person who could otherwise mistake this for a pathogenicity call.
        "predicts": ("change in splice-site probability (SpliceAI-style delta), not pathogenicity; "
                     "delta-PSI is reported separately where a cassette event exists"),
        "dpsi_model": "psi_ctx2000 (PSINet, 54 GTEx tissues, mean)",
        "dpsi_count": dpsi_count,
        "dpsi_note": dpsi_note,
        "dpsi_validated": False,
        "window_nt": win_nt,
        "min_delta": min_delta,
        "scanned": len(cands),
        "count": len(scored),
        "skipped_far": skipped_far,
        "skipped_indel": skipped_indel,
        "variant_kinds": "substitutions + indels" if include_indels else "substitutions only",
        "truncated": total > MAX_VARIANTS,
        "annotated_sites": len(sites),
        # A run where everything failed must not look like a run where nothing scored.
        "failed": len(failed),
        "failures": json.dumps(failed[:5]),
        "variants": json.dumps(scored),
    })


try:
    main()
except Exception as e:
    import traceback
    works.resolve({"status": "error", "error": str(e), "trace": traceback.format_exc()[-1500:]})

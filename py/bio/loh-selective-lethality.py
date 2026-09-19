"""Essential genes the tumor has mutated: where a specific change could make it selectively lethal.

The LOH report's question after "what did the tumor lose" is "what did it change that it cannot
do without". A gene every cell needs is no target in itself -- inhibit it and normal tissue dies
too. But a SPECIFIC change in such a gene can open a window: a mutant allele that is now the only
copy (so an allele-specific agent removes all of it in the tumor and half of it in normal cells),
a hypomorph on the last copy that leaves the tumor with no reserve, an essential gene down to one
copy by LOH (CYCLOPS), a paralog the mutant now leans on, a neighbour lost with a deletion
(collateral lethality). Whether any of that applies to a given variant is judgement, and that is
the part handed to Claude -- over candidates chosen deterministically, with the numbers attached.

Six actions (param 1):

  essential   species
      -> { ok, genes: [[symbol, chr, start, end, strand, effect_mean, dep_frac, class], ...] }
      Genes DepMap calls a dependency in at least ESS_MIN_FRAC of cell lines, with their span
      from the annotation, so the browser can find the tumor's variants inside them. Human only:
      DepMap is a human screen.

  transcripts species, JSON [symbol, ...]
      -> { ok, transcripts: JSON { SYMBOL: "ENST..." } }   one transcript per gene, as the editor
      opens it: MANE Select, else Ensembl canonical, else basic protein-coding, else the longest.
      Versions are dropped, the form the editor hand-off uses.

  spans       species, JSON [symbol, ...]
      -> { ok, genes: [[symbol, chr, start, end, strand], ...] }   protein-coding spans, for the
      gain-of-function scan's oncogene catalogue (any species with a gene-symbols table).

  depmap      JSON { genes: [symbol, ...] }  (human; up to MAX_DEPMAP_GENES)
      -> { ok, n_models, genes: JSON { SYMBOL: { effect_mean, effect_median, dep_frac, class,
                n_models, lineages: [[lineage, mean_effect, n]], dosage: {...}, paralog: {...},
                tpm: { source, cns: [[tissue, tpm]], other: [[tissue, tpm]] },
                fn: { desc, cats: [...], terms: [...] } } } }
      What the cell-line panel says about each gene in a design strategy: how essential it is,
      where it is most essential, whether the lines that are themselves down to one copy of it
      are more dependent (the dosage test, lineage regressed out, as loh-synthetic-lethal.py
      does it), and the paralog most likely to stand in for it. Genes DepMap never screened
      come back as { screened: false }. tpm is GTEx v10 median TPM: every CNS region GTEx
      sampled, then other tissues; null when GTEx has no such symbol. fn is what the gene is
      for -- a description and plain functional categories such as "stem cell / self-renewal" --
      from reference_data/geneannot; null when that bundle has no such symbol.

  tpm         JSON [symbol, ...]  (up to MAX_TPM_GENES)
      -> { ok, source, n_cns, tissues: [label, ...], values: JSON { SYMBOL: [tpm, ...] } }
      GTEx TPM only, in the order of tissues (the first n_cns are the CNS), for the tract gene
      lists; genes GTEx lacks are left out.

  assess      JSON { tumor, germline, species, candidates: [...], single_copy: [...],
                     gain_of_function: [...], context }
      -> { ok, assessment: JSON { summary, findings: [...], not_pursued }, model }
      candidates: [{ gene, depmap: {effect_mean, dep_frac, class}, in_loh, loh_fraction,
                     variants: [{ change, effect, origin, tumor_state, tumor_vaf }] }]
      single_copy: [{ gene, effect_mean, dep_frac, class }]  essential genes inside a tract with
                     no mutation (the CYCLOPS kind), for context.
      gain_of_function: [{ gene, change, effect, level, in_loh, tumor_state, origin, tumor_vaf }]
                     changes in oncogenes (level: hotspot / likely / possible), with whether LOH
                     has left the activating allele on every remaining copy.

The findings are hypotheses. The model is told to tie every one to a variant it was given, to say
when the data do not support a mechanism, and that "none" is an acceptable answer.
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# The strongest model, on purpose, and its own setting: ANTHROPIC_MODEL is the server-wide default
# and is set to a fast model on production, where this judgement came back from Haiku with most
# findings filed as "other" and the tumor-state fields misread.
ANTHROPIC_MODEL = os.environ.get("LOH_SL_MODEL") or "claude-opus-5"
API_URL = "https://api.anthropic.com/v1/messages"

DEP_CUT = -0.5            # a line "depends on" a gene below this Chronos effect (as everywhere here)
ESS_MIN_FRAC = 0.20       # dependent in at least this share of lines to be listed
MAX_CANDIDATE_GENES = 80
MAX_VARIANTS_PER_GENE = 8
MAX_SINGLE_COPY = 60

out = {"ok": False, "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


MAX_DEPMAP_GENES = 200
MAX_TPM_GENES = 5000
CN_LOW, CN_HI_LO, CN_HI_HI = 0.60, 0.85, 1.15      # copy number / ploidy: one copy of two; normal
MIN_HEMI, MIN_NEUTRAL, CN_FDR = 10, 20, 0.25
MIN_LINEAGE = 10


# Tissue expression from GTEx v10 (median TPM per tissue): every CNS region GTEx sampled, then
# a panel of other tissues.
GTEX_FILE = "reference_data/gtex/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz"
GTEX_SOURCE = "GTEx v10, median TPM"
GTEX_CNS = [
    ("Brain_Cortex", "Cortex"),
    ("Brain_Frontal_Cortex_BA9", "Frontal cortex (BA9)"),
    ("Brain_Anterior_cingulate_cortex_BA24", "Anterior cingulate (BA24)"),
    ("Brain_Hippocampus", "Hippocampus"),
    ("Brain_Amygdala", "Amygdala"),
    ("Brain_Hypothalamus", "Hypothalamus"),
    ("Brain_Caudate_basal_ganglia", "Caudate"),
    ("Brain_Putamen_basal_ganglia", "Putamen"),
    ("Brain_Nucleus_accumbens_basal_ganglia", "Nucleus accumbens"),
    ("Brain_Substantia_nigra", "Substantia nigra"),
    ("Brain_Cerebellum", "Cerebellum"),
    ("Brain_Cerebellar_Hemisphere", "Cerebellar hemisphere"),
    ("Brain_Spinal_cord_cervical_c-1", "Spinal cord (C1)"),
]
GTEX_OTHER = [
    ("Nerve_Tibial", "Tibial nerve"),
    ("Pituitary", "Pituitary"),
    ("Whole_Blood", "Whole blood"),
    ("Spleen", "Spleen"),
    ("Liver", "Liver"),
    ("Lung", "Lung"),
    ("Heart_Left_Ventricle", "Heart (LV)"),
    ("Kidney_Cortex", "Kidney cortex"),
    ("Muscle_Skeletal", "Skeletal muscle"),
    ("Colon_Transverse", "Colon"),
    ("Stomach", "Stomach"),
    ("Pancreas", "Pancreas"),
    ("Breast_Mammary_Tissue", "Breast"),
    ("Skin_Not_Sun_Exposed_Suprapubic", "Skin"),
    ("Adipose_Subcutaneous", "Adipose"),
    ("Thyroid", "Thyroid"),
    ("Adrenal_Gland", "Adrenal"),
    ("Testis", "Testis"),
    ("Ovary", "Ovary"),
    ("Prostate", "Prostate"),
    ("Uterus", "Uterus"),
]


# WHAT THE GENE IS FOR, from reference_data/geneannot (built by py/bio/build-gene-annotations.py
# out of NCBI gene_info and the GO annotations): a descriptive name, a few plain functional
# categories -- "stem cell / self-renewal", "splicing / spliceosome" -- and the process terms
# behind them. A dependency score says how much a cell needs the gene; this says what for.
GENEFN_FILE = "reference_data/geneannot/gene-function.tsv.gz"
GENEFN_SOURCE = "NCBI Gene and the Gene Ontology"


def gene_function(symbols):
    """{SYMBOL: {desc, cats: [...], terms: [...]}} for the symbols the bundle knows."""
    import gzip
    path = first_existing(GENEFN_FILE)
    want = set(symbols)
    if not path or not want:
        return {}
    out_ = {}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        fh.readline()
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 4 or f[0] not in want:
                continue
            cats = [x for x in f[2].split("|") if x]
            terms = [x for x in f[3].split("|") if x]
            if f[1] or cats or terms:
                out_[f[0]] = {"desc": f[1], "cats": cats, "terms": terms, "source": GENEFN_SOURCE}
            if len(out_) == len(want):
                break
    return out_


def gtex_tpm(symbols):
    """{SYMBOL: {source, cns: [[label, tpm]], other: [[label, tpm]]}} for the symbols GTEx has."""
    import gzip
    path = first_existing(GTEX_FILE)
    want = set(symbols)
    if not path or not want:
        return {}
    found = {}
    with gzip.open(path, "rt") as fh:
        fh.readline()
        fh.readline()
        head = fh.readline().rstrip("\n").split("\t")
        col = {name: i for i, name in enumerate(head)}
        for line in fh:
            f = line.rstrip("\n").split("\t")
            sym = f[1].strip().upper()
            if sym not in want:
                continue
            total = sum(float(x) for x in f[2:] if x)
            if sym in found and found[sym][0] >= total:
                continue          # a symbol on two gene ids: keep the more expressed one

            def panel(tissues):
                return [[label, round(float(f[col[key]]), 2)] for key, label in tissues if key in col]
            found[sym] = (total, {"source": GTEX_SOURCE, "cns": panel(GTEX_CNS), "other": panel(GTEX_OTHER)})
    return {s: v for s, (_, v) in found.items()}


def tpm_only(symbols):
    """GTEx TPM for many genes at once, without the DepMap work: the tract gene lists.

    Compact on purpose -- the tissue labels once, then one array of values per gene in that
    order -- because a whole-chromosome tract carries hundreds of genes.
    """
    want = [str(g).strip().upper() for g in (symbols or [])]
    want = [g for g in dict.fromkeys(want) if g][:MAX_TPM_GENES]
    got = gtex_tpm(want)
    values = {}
    for g in want:
        v = got.get(g)
        if v:
            values[g] = [x[1] for x in v["cns"]] + [x[1] for x in v["other"]]
    return {"ok": True, "source": GTEX_SOURCE, "n_cns": len(GTEX_CNS),
            "tissues": [label for _, label in GTEX_CNS] + [label for _, label in GTEX_OTHER],
            "values": json.dumps(values)}


def depmap(req):
    import math
    import numpy as np
    bd = os.path.dirname(first_existing("reference_data/depmap/gene_effect.npy"))
    if not bd:
        return {"ok": False, "error": "the DepMap bundle is not on this server"}
    want = []
    for g in (req.get("genes") or []):
        g = str(g).strip().upper()
        if g and g not in want:
            want.append(g)
    want = want[:MAX_DEPMAP_GENES]
    genes = [g.strip().upper() for g in open(os.path.join(bd, "genes.txt")).read().rstrip("\n").split("\n")]
    gidx = {g: i for i, g in enumerate(genes)}
    known = [g for g in want if g in gidx]
    res = {g: {"screened": False} for g in want if g not in gidx}
    tpm = gtex_tpm(want)
    fn = gene_function(want)
    for g in res:
        res[g]["tpm"] = tpm.get(g)          # always present, so a cached row shows it was looked up
        res[g]["fn"] = fn.get(g)
    if not known:
        return {"ok": True, "n_models": 0, "genes": json.dumps(res)}
    works.msg("Reading DepMap for %d gene(s)…" % len(known))
    G = np.load(os.path.join(bd, "gene_effect.npy"), mmap_mode="r")
    n_models = G.shape[0]
    cols = np.array([gidx[g] for g in known])
    order = np.argsort(cols)
    back = np.empty(len(cols), dtype=np.int64)
    back[order] = np.arange(len(cols))
    E = np.asarray(G[:, cols[order]], dtype=np.float64)[:, back]
    lin = []
    lp = os.path.join(bd, "lineage.txt")
    if os.path.exists(lp):
        lin = [x.strip() for x in open(lp).read().rstrip("\n").split("\n")]
    lin = (lin + [""] * n_models)[:n_models]
    # Lineage regressed out for the dosage test, so a vulnerability of one tissue is not read
    # as a consequence of dosage.
    cats = sorted(set(lin))
    D = np.zeros((n_models, len(cats) + 1))
    D[:, 0] = 1.0
    cidx = {c: k + 1 for k, c in enumerate(cats)}
    for i, c in enumerate(lin):
        D[i, cidx[c]] = 1.0
    Ef = np.where(np.isfinite(E), E, np.nanmean(E, axis=0))
    beta, _, _, _ = np.linalg.lstsq(D, Ef, rcond=None)
    Rres = Ef - D @ beta
    C = PL = None
    cp, pp = os.path.join(bd, "cn.npy"), os.path.join(bd, "ploidy.npy")
    if os.path.exists(cp) and os.path.exists(pp):
        C = np.asarray(np.load(cp, mmap_mode="r")[:, cols[order]], dtype=np.float64)[:, back]
        PL = np.asarray(np.load(pp), dtype=np.float64)
    tests = []
    lin_arr = np.array(lin)
    for j, g in enumerate(known):
        e = E[:, j]
        ok = np.isfinite(e)
        ev = e[ok]
        frac = float((ev < DEP_CUT).mean()) if len(ev) else 0.0
        row = {"screened": True, "n_models": int(ok.sum()), "effect_mean": round(float(ev.mean()), 3) if len(ev) else None,
               "effect_median": round(float(np.median(ev)), 3) if len(ev) else None, "dep_frac": round(frac, 3),
               "class": ess_class(frac) if frac >= ESS_MIN_FRAC else ("rarely essential" if frac < 0.05 else "essential in a few lines")}
        # Where it matters most: the lineages with the most negative mean effect.
        lins = []
        for c in cats:
            m = (lin_arr == c) & ok
            if c and m.sum() >= MIN_LINEAGE:
                lins.append((c, float(e[m].mean()), int(m.sum())))
        lins.sort(key=lambda x: x[1])
        row["lineages"] = [[c, round(v, 3), n] for c, v, n in lins[:3]]
        row["dosage"] = {"tested": False, "why": "no copy number in this DepMap bundle"}
        if C is not None:
            with np.errstate(invalid="ignore", divide="ignore"):
                ratio = C[:, j] / PL
            prof = np.isfinite(ratio) & np.isfinite(C[:, j]) & ok
            hemi = prof & (ratio <= CN_LOW) & (C[:, j] >= 1)
            neut = prof & (ratio >= CN_HI_LO) & (ratio <= CN_HI_HI)
            if hemi.sum() >= MIN_HEMI and neut.sum() >= MIN_NEUTRAL:
                a, b = Rres[hemi, j], Rres[neut, j]
                se = math.sqrt(max(a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b), 1e-12))
                t = (a.mean() - b.mean()) / se
                row["dosage"] = {"tested": True, "n_hemizygous": int(hemi.sum()), "n_neutral": int(neut.sum()),
                                 "delta": round(float(a.mean() - b.mean()), 3), "t": round(float(t), 2),
                                 "p": math.erfc(abs(t) / math.sqrt(2.0)) if t < 0 else 1.0}
                tests.append(j)
            else:
                row["dosage"] = {"tested": False, "why": "too few lines down to one copy (%d)" % int(hemi.sum())}
        res[g] = row
    # Benjamini-Hochberg over the genes tested here.
    if tests:
        ps = sorted(((res[known[j]]["dosage"]["p"], j) for j in tests))
        m = len(ps)
        prev = 1.0
        adj = {}
        for rank in range(m - 1, -1, -1):
            p, j = ps[rank]
            prev = min(prev, p * m / (rank + 1))
            adj[j] = prev
        for j in tests:
            d = res[known[j]]["dosage"]
            d["fdr"] = round(adj[j], 4)
            d["confirmed"] = bool(d["delta"] < 0 and d["fdr"] <= CN_FDR)
            d.pop("p", None)
    # The paralog the trained model thinks would stand in, where it has one.
    pp2 = os.path.join(bd, "paralog_sl.tsv")
    if os.path.exists(pp2):
        best = {}
        with open(pp2) as fh:
            head = fh.readline().rstrip("\n").split("\t")
            ia, ib, ip = head.index("A"), head.index("B"), head.index("pred")
            for line in fh:
                f = line.rstrip("\n").split("\t")
                a = f[ia].upper()
                if a in res and res[a].get("screened"):
                    try:
                        pr = float(f[ip])
                    except ValueError:
                        continue
                    if a not in best or pr > best[a][1]:
                        best[a] = (f[ib], pr)
        for a, (b2, pr) in best.items():
            res[a]["paralog"] = {"gene": b2, "pred": round(pr, 3)}
    for g in known:
        res[g]["tpm"] = tpm.get(g)
        res[g]["fn"] = fn.get(g)
    return {"ok": True, "n_models": int(n_models), "genes": json.dumps(res)}


ANNOTATION = {"human": "reference_data/human.gencode.annotation.gff3.bgz", "mouse": "reference_data/mouse.annotation.gff3.bgz",
              "rat": "reference_data/rat.annotation.gff3.bgz", "dog": "reference_data/dog.annotation.gff3.bgz",
              "yeast": "reference_data/yeast.annotation.gff3.bgz"}


def transcripts(species, symbols):
    sp = spans(species, symbols)
    if not sp.get("ok"):
        return sp
    gpath = first_existing(ANNOTATION.get(species, ""))
    if not gpath:
        return {"ok": False, "error": "no annotation for %s on this server" % species}
    try:
        import pysam
        tbx = pysam.TabixFile(gpath)
        contigs = set(tbx.contigs)
    except Exception as e:
        return {"ok": False, "error": "the annotation could not be read: %s" % e}
    out = {}
    for sym, chrom, start, end, _strand in json.loads(sp["genes"]):
        c = chrom if chrom in contigs else (chrom[3:] if chrom.startswith("chr") and chrom[3:] in contigs else ("chr" + chrom if "chr" + chrom in contigs else ""))
        if not c:
            continue
        best = None
        try:
            rows = tbx.fetch(c, max(0, start - 1), end)
        except Exception:
            continue
        for r in rows:
            f = r.split("\t")
            if len(f) < 9 or f[2] not in ("transcript", "mRNA"):
                continue
            a = {}
            for kv in f[8].split(";"):
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    a[k] = v
            if (a.get("gene_name") or a.get("Name") or "").upper() != sym.upper():
                continue
            tags = a.get("tag", "")
            tid = a.get("ID", "").replace("transcript:", "").split(".")[0]
            if not tid:
                continue
            rank = 0 if "MANE_Select" in tags else 1 if "Ensembl_canonical" in tags else \
                2 if ("basic" in tags and a.get("transcript_type", "protein_coding") == "protein_coding") else 3
            key = (rank, -(int(f[4]) - int(f[3])))
            if best is None or key < best[0]:
                best = (key, tid)
        if best:
            out[sym.upper()] = best[1]
    return {"ok": True, "transcripts": json.dumps(out)}


def spans(species, symbols):
    sym_path = first_existing("reference_data/%s.gene-symbols.tsv" % re.sub(r"[^a-z0-9]", "", species))
    if not sym_path:
        return {"ok": False, "error": "no gene-symbols table for %s on this server" % species}
    want = {str(x).strip().upper() for x in (symbols or []) if str(x).strip()}
    rows, seen = [], set()
    with open(sym_path) as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 6 or f[5] != "protein_coding":
                continue
            s = f[0].upper()
            if s in want and s not in seen:
                seen.add(s)
                try:
                    rows.append([f[0], f[1], int(f[2]), int(f[3]), f[4]])
                except ValueError:
                    pass
    return {"ok": True, "genes": json.dumps(rows)}


def ess_class(frac):
    if frac >= 0.90:
        return "common essential"
    if frac >= 0.50:
        return "broadly essential"
    return "selectively essential"


def essential(species):
    if species != "human":
        return {"ok": False, "error": "DepMap is a human screen; there is no essentiality data for %s" % species}
    bd = os.path.dirname(first_existing("reference_data/depmap/gene_effect.npy"))
    if not bd:
        return {"ok": False, "error": "the DepMap bundle is not on this server (py/bio/build-depmap-sl.py builds it)"}
    sym_path = first_existing("reference_data/human.gene-symbols.tsv")
    if not sym_path:
        return {"ok": False, "error": "reference_data/human.gene-symbols.tsv is not on this server"}
    import numpy as np
    works.msg("Reading which genes the cell lines depend on…")
    genes = [g.strip().upper() for g in open(os.path.join(bd, "genes.txt")).read().rstrip("\n").split("\n")]
    G = np.load(os.path.join(bd, "gene_effect.npy"), mmap_mode="r")
    G = np.asarray(G, dtype=np.float32)
    ok = ~np.isnan(G)
    n = ok.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(n > 0, np.nansum(G, axis=0) / np.maximum(n, 1), np.nan)
        frac = np.where(n > 0, ((G < DEP_CUT) & ok).sum(axis=0) / np.maximum(n, 1), 0.0)
    stats = {}
    for i, g in enumerate(genes):
        if n[i] and frac[i] >= ESS_MIN_FRAC:
            stats[g] = (round(float(mean[i]), 2), round(float(frac[i]), 3))
    # Coordinates: the protein-coding row of each symbol, first seen.
    rows, seen = [], set()
    with open(sym_path) as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 6:
                continue
            s = f[0].upper()
            if s in seen or s not in stats or f[5] != "protein_coding":
                continue
            seen.add(s)
            try:
                st, en = int(f[2]), int(f[3])
            except ValueError:
                continue
            em, fr = stats[s]
            rows.append([f[0], f[1], st, en, f[4], em, fr, ess_class(fr)])
    works.msg("%d essential genes placed on the genome" % len(rows))
    return {"ok": True, "genes": json.dumps(rows), "n_models": int(G.shape[0])}


SYSTEM = (
    "You are a cancer geneticist assessing a tumor/normal comparison for SELECTIVE LETHALITY: a "
    "way to kill cells carrying a specific tumor change while sparing the patient's normal cells.\n"
    "You are given (1) genes the DepMap CRISPR screen calls essential, each carrying variants that "
    "are specific to the tumor -- somatic, or germline heterozygous where the tumor has lost the "
    "other allele by LOH -- with each variant's consequence, origin and the tumor's allele state; "
    "(2) essential genes inside LOH tracts with no mutation; (3) changes in ONCOGENES, each marked "
    "as a known activating hotspot, likely or possible gain of function, with whether an LOH tract "
    "has left the activating allele on every remaining copy (the wild-type copy that restrains it is "
    "gone, and mutant dosage is doubled, as with JAK2 V617F or KRAS after copy-neutral LOH).\n"
    "Judge, gene by gene, whether a specific change creates a therapeutic window. Mechanisms to "
    "consider (name the one that applies): single-copy essential (CYCLOPS: an essential gene the "
    "tumor holds one copy of, normal cells two); mutant-allele-specific targeting (the tumor's only "
    "copy carries a sequence normal cells lack or hold only one copy of -- an allele-selective "
    "oligo or a mutant-selective drug removes all of it in the tumor); hypomorph on the last copy "
    "(a damaging change leaves reduced function with no reserve, so partial inhibition becomes "
    "lethal); synthetic lethality with a pathway partner (the gene is lost outright and a partner "
    "pathway becomes essential, as PARP is to BRCA loss); paralog dependency; collateral lethality; "
    "neomorphic or gain-of-dependency changes; oncogene activation (a gain-of-function allele the "
    "tumor depends on -- oncogene addiction -- and that a mutant-selective drug or an allele-selective "
    "oligo can remove without touching the wild-type protein normal cells use). For every "
    "gain-of-function change given, say whether it is plausibly activating, what LOH did to it, and "
    "whether it is targetable.\n"
    "Rules: every finding must name a gene and a variant from the input; the variant field is the "
    "change exactly as given (e.g. p.Lys700Glu), or 'no variant' for a single-copy gene. "
    "Use the DepMap numbers given; do not invent statistics, trials or citations. "
    "General biological knowledge is allowed but say when a claim rests on it rather than on the "
    "data. A common-essential gene with no tumor-specific change is not a finding by itself. A "
    "variant with uncertain effect gets low confidence. If nothing holds up, return no findings and "
    "say why in not_pursued. Plain text in every field; no markdown."
)

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "gene": {"type": "string"},
                    "variant": {"type": "string"},
                    "mechanism": {"type": "string", "enum": [
                        "single-copy essential (CYCLOPS)", "mutant-allele-specific targeting",
                        "hypomorph on the last copy", "synthetic lethality with a pathway partner",
                        "oncogene activation (gain of function)",
                        "paralog dependency", "collateral lethality",
                        "neomorphic or gain of dependency", "other"]},
                    "rationale": {"type": "string"},
                    "approach": {"type": "string"},
                    "normal_cells": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "caveats": {"type": "string"},
                },
                "required": ["gene", "variant", "mechanism", "rationale", "approach", "normal_cells",
                             "confidence", "caveats"],
                "additionalProperties": False,
            },
        },
        "not_pursued": {"type": "string"},
    },
    "required": ["summary", "findings", "not_pursued"],
    "additionalProperties": False,
}


def call_claude(content):
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server", ""
    if requests is None:
        return None, "python 'requests' is not available on the server", ""
    body = {
        "model": ANTHROPIC_MODEL, "max_tokens": 8000, "system": SYSTEM,
        "messages": [{"role": "user", "content": content}],
        "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}, "effort": "high"},
        "fallbacks": "default",
    }
    headers = {"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
               "anthropic-beta": "server-side-fallback-2026-07-01", "content-type": "application/json"}
    try:
        r = requests.post(API_URL, headers=headers, json=body, timeout=(20, 420))
        if r.status_code == 400 and "fallback" in (r.text or "").lower():
            body.pop("fallbacks", None)
            headers.pop("anthropic-beta", None)
            r = requests.post(API_URL, headers=headers, json=body, timeout=(20, 420))
        if r.status_code == 400 and "effort" in (r.text or "").lower():
            body["output_config"].pop("effort", None)
            r = requests.post(API_URL, headers=headers, json=body, timeout=(20, 420))
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, (r.text or "")[:300]), ""
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the model declined the request", data.get("model") or ANTHROPIC_MODEL
        txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text").strip()
        try:
            return json.loads(txt), None, data.get("model") or ANTHROPIC_MODEL
        except Exception:
            m = re.search(r"\{.*\}", txt, re.S)
            if not m:
                return None, "no JSON in the model response", data.get("model") or ANTHROPIC_MODEL
            return json.loads(m.group(0)), None, data.get("model") or ANTHROPIC_MODEL
    except Exception as ex:
        return None, str(ex), ""


def clean(s, n=600):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def assess(req):
    cands = [c for c in (req.get("candidates") or []) if isinstance(c, dict) and c.get("gene")][:MAX_CANDIDATE_GENES]
    single = [c for c in (req.get("single_copy") or []) if isinstance(c, dict) and c.get("gene")][:MAX_SINGLE_COPY]
    gof = [c for c in (req.get("gain_of_function") or []) if isinstance(c, dict) and c.get("gene")][:MAX_CANDIDATE_GENES]
    if not cands and not single and not gof:
        return {"ok": True, "assessment": json.dumps({"summary": "No essential gene carries a tumor-specific change, "
                                                                 "and none sits in an LOH tract.",
                                                      "findings": [], "not_pursued": ""}), "model": ""}
    for c in cands:
        c["variants"] = (c.get("variants") or [])[:MAX_VARIANTS_PER_GENE]
    tumor, germ = clean(req.get("tumor"), 80), clean(req.get("germline"), 80)
    ask = ("Tumor: %s. Germline (normal) compared against: %s. Species: %s.\n%s\n\n"
           "ESSENTIAL GENES WITH TUMOR-SPECIFIC VARIANTS (%d). DepMap: effect_mean is the mean Chronos "
           "effect across %s cell lines (below -0.5 is a dependency), dep_frac the share of lines "
           "dependent, class from dep_frac. origin: somatic = absent from the germline; "
           "germline_lost_wt = heterozygous in the germline, and the tumor has lost the other allele. "
           "tumor_state: retained = carried on every remaining copy in the tumor; both = the tumor "
           "still reads both alleles; tumor_vaf = the tumor's variant allele fraction (-1 unknown). "
           "in_loh: the gene lies in an LOH tract.\n%s\n\n"
           "ESSENTIAL GENES IN LOH TRACTS WITH NO MUTATION (%d), for single-copy dependence:\n%s\n\n"
           "CHANGES IN ONCOGENES (%d). level: hotspot = a recurrent activating codon; likely = an "
           "activating class of change in that gene; possible = another protein-altering change, effect "
           "unknown. in_loh / tumor_state as above.\n%s\n")
    ask = ask % (tumor or "tumor", germ or "normal", clean(req.get("species"), 20) or "human",
                 clean(req.get("context"), 1500), len(cands), str(req.get("n_models") or "the"),
                 json.dumps(cands), len(single), json.dumps(single), len(gof), json.dumps(gof))
    works.msg("Assessing %d essential gene(s) and %d oncogene change(s)…" % (len(cands) + len(single), len(gof)))
    try:
        import claude_usage as _cu  # type: ignore
        _cu.bump("loh-selective-lethality")
    except Exception:
        pass
    parsed, err, model = call_claude(ask)
    if err or not isinstance(parsed, dict):
        return {"ok": False, "error": "the assessment could not be made: %s" % (err or "empty reply")}
    known = ({str(c.get("gene")).upper() for c in cands} | {str(c.get("gene")).upper() for c in single}
             | {str(c.get("gene")).upper() for c in gof})
    findings = []
    for f in (parsed.get("findings") or []):
        if not isinstance(f, dict):
            continue
        g = clean(f.get("gene"), 40)
        # A finding about a gene it was not given is not a reading of this tumor.
        if g.upper() not in known:
            continue
        conf = str(f.get("confidence") or "low").lower()
        findings.append({k: clean(f.get(k), 2000) for k in ("gene", "variant", "mechanism", "rationale", "approach",
                                                          "normal_cells", "caveats")})
        findings[-1]["confidence"] = conf if conf in ("high", "medium", "low") else "low"
    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: order.get(f["confidence"], 3))
    works.msg("%d finding(s)" % len(findings))
    return {"ok": True, "model": model, "assessment": json.dumps({
        "summary": clean(parsed.get("summary"), 4000), "findings": findings,
        "not_pursued": clean(parsed.get("not_pursued"), 6000)})}


action = str(works.param(1) or "").strip()
try:
    if action == "transcripts":
        raw = works.param(3)
        out = transcripts(str(works.param(2) or "human").strip().lower(), raw if isinstance(raw, list) else json.loads(str(raw or "[]")))
    elif action == "depmap":
        raw = works.param(2)
        out = depmap(raw if isinstance(raw, dict) else json.loads(str(raw or "{}")))
    elif action == "tpm":
        raw = works.param(2)
        out = tpm_only(raw if isinstance(raw, list) else json.loads(str(raw or "[]")))
    elif action == "spans":
        raw = works.param(3)
        out = spans(str(works.param(2) or "human").strip().lower(), raw if isinstance(raw, list) else json.loads(str(raw or "[]")))
    elif action == "essential":
        out = essential(str(works.param(2) or "human").strip().lower())
    elif action == "assess":
        raw = works.param(2)
        req = raw if isinstance(raw, dict) else json.loads(str(raw or "{}"))
        out = assess(req)
    else:
        out = {"ok": False, "error": "unknown action %r" % action}
except Exception as e:
    out = {"ok": False, "error": "loh-selective-lethality: %s" % e}
works.resolve(out)

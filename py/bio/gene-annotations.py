"""What kind of cancer gene is this? Classification for the loss matrix's Refine panel.

Deterministic, no model: curated lists plus one number from DepMap. A gene can carry
several classes at once (BRCA1 is a tumour suppressor AND a DNA-repair gene); a gene with
none of them is "not previously associated with cancer", which is a statement about these
lists and not about the literature.

    tumour_suppressor   COSMIC-census style tumour suppressors (loss drives cancer)
    oncogene            COSMIC-census style oncogenes (activation drives cancer)
    cancer_dependency   DepMap: mean CRISPR knockout effect across all screened lines
                        below -0.5 (Chronos), i.e. most cancer lines need it
    dna_repair          the DNA damage response and repair machinery
    immune_regulatory   antigen presentation, interferon signalling, immune checkpoints
                        and the genes whose loss confers immunotherapy resistance

Params (after the EngineMonitor):
    param(1) : JSON { genes: [symbol, ...] }

Resolves:
    { ok, genes, notes, error }
  genes JSON: { GENE: { classes: [...], depmap_mean_effect: float|null, depmap_frac_dependent: float|null } }
"""
import hashlib
import json
import os
import time

from ion import works

try:
    import numpy as np
except Exception:
    np = None

out = {"ok": False, "genes": "{}", "notes": "[]", "error": None}

TUMOUR_SUPPRESSORS = {
    "TP53", "RB1", "PTEN", "CDKN2A", "CDKN2B", "CDKN1B", "CDKN1A", "MTAP", "ARID1A", "ARID1B", "ARID2", "BAP1", "KEAP1",
    "NF1", "NF2", "PBRM1", "SMAD4", "SMAD2", "SMAD3", "SMARCA4", "SMARCB1", "STK11", "VHL", "BRCA1", "BRCA2", "APC",
    "ATM", "ATR", "CDH1", "PALB2", "CHEK2", "CHEK1", "MLH1", "MSH2", "MSH6", "PMS2", "KMT2D", "KMT2C", "CREBBP", "EP300",
    "FBXW7", "ATRX", "CIC", "DAXX", "KDM6A", "KDM5C", "MEN1", "NOTCH1", "PTCH1", "RNF43", "SETD2", "TSC1", "TSC2", "WT1",
    "AXIN1", "AXIN2", "CASP8", "ZFHX3", "SPOP", "FUBP1", "BRIP1", "BARD1", "RAD51C", "RAD51D", "NBN", "MRE11", "RAD50",
    "FANCA", "FANCC", "FANCD2", "FANCE", "FANCF", "FANCG", "FANCL", "FANCM", "BLM", "WRN", "RECQL4", "POLE", "POLD1",
    "MUTYH", "EPCAM", "SDHA", "SDHB", "SDHC", "SDHD", "SDHAF2", "FH", "FLCN", "MAX", "TMEM127", "PRKAR1A", "DICER1",
    "SUFU", "BMPR1A", "GATA3", "RUNX1", "CEBPA", "ETV6", "IKZF1", "PAX5", "TET2", "DNMT3A", "ASXL1", "EZH2", "CBL",
    "NPM1", "PHF6", "BCOR", "BCORL1", "STAG2", "RAD21", "SMC1A", "SMC3", "CUX1", "ELF3", "ERBB4", "FAT1", "FAT4",
    "KMT2A", "MAP2K4", "MAP3K1", "NCOR1", "PIK3R1", "PPP2R1A", "RASA1", "RBM10", "TGFBR2", "ACVR2A", "AMER1",
    "ARHGAP35", "B2M", "BCL11B", "CDC73", "CTCF", "CYLD", "DDX3X", "EED", "SUZ12", "HNF1A", "JAK1", "KLF4", "LATS1",
    "LATS2", "LZTR1", "NCOR2", "NFE2L2", "PIK3CA", "POLQ", "PTPN11", "PTPRD", "PTPRT", "RASA2", "RPL5", "RPL10", "RPL22",
    "SF3B1", "SOX9", "TBX3", "TNFAIP3", "TRAF3", "TRAF7", "ZMYM3", "ZNRF3", "CDKN2C", "CTNNA1", "PTPRB", "TSHR",
}
# PIK3CA / NFE2L2 / PTPN11 / SF3B1 sit in both lists in the census; leave them where the
# dominant biology is.
for g in ("PIK3CA", "NFE2L2", "PTPN11", "SF3B1"):
    TUMOUR_SUPPRESSORS.discard(g)
ONCOGENES = {
    "KRAS", "NRAS", "HRAS", "BRAF", "RAF1", "ARAF", "EGFR", "ERBB2", "ERBB3", "MET", "ALK", "ROS1", "RET", "NTRK1", "NTRK2",
    "NTRK3", "FGFR1", "FGFR2", "FGFR3", "FGFR4", "KIT", "PDGFRA", "PDGFRB", "FLT3", "JAK2", "JAK3", "ABL1", "SRC", "MYC",
    "MYCN", "MYCL", "CCND1", "CCND2", "CCND3", "CCNE1", "CDK4", "CDK6", "MDM2", "MDM4", "PIK3CA", "PIK3CB", "AKT1",
    "AKT2", "AKT3", "MTOR", "RHEB", "IDH1", "IDH2", "GNAS", "GNAQ", "GNA11", "CTNNB1", "SMO", "GLI1", "GLI2", "NOTCH2",
    "NOTCH3", "BCL2", "BCL6", "MCL1", "MAP2K1", "MAP2K2", "MAPK1", "AR", "ESR1", "PGR", "KLF5", "SOX2", "TERT",
    "NFE2L2", "PTPN11", "SF3B1", "U2AF1", "SRSF2", "STAT3", "STAT5B", "CARD11", "MYD88", "CD79A", "CD79B", "CXCR4",
    "FOXA1", "FOXL2", "GATA2", "HIF1A", "XPO1", "EZH2", "DNMT3A", "SETBP1", "CALR", "MPL", "CSF1R", "CSF3R", "ERG",
    "ETV1", "ETV4", "EWSR1", "FLI1", "FUS", "SS18", "TFE3", "TFEB", "MITF", "PAX3", "PAX8", "WT1", "IRS2", "PPM1D",
    "PRKACA", "RAC1", "RIT1", "SHOC2", "SOS1", "MAP3K13", "TRAF2", "BIRC3", "CDK12", "CDKN1B", "LMO1", "LMO2", "TAL1",
    "TLX1", "TLX3", "HOXA9", "MEIS1", "MLLT3", "MLLT10", "NUP98", "DDX6", "DEK", "KAT6A", "NCOA2", "NCOA3", "NUTM1",
    "BRD4", "CRTC1", "MAML2", "PLAG1", "HMGA2", "YAP1", "WWTR1", "TEAD1", "AXL", "IGF1R", "INSR", "ERBB4", "EPHA2",
    "DDR2", "MAP3K1", "PIK3CD", "PIK3CG", "PTK2", "SYK", "BTK", "LCK", "FYN", "LYN", "JUN", "FOS", "FOSL1", "MAFB", "MAF",
    "IRF4", "PRDM1", "NKX2-1", "SOX17", "CDX2", "RUNX1", "TP63", "MYB", "MYBL1", "REL", "RELA", "NFKB2", "IKBKB",
}
for g in ("WT1", "RUNX1", "EZH2", "DNMT3A", "CDKN1B", "MAP3K1", "ERBB4", "KLF5"):
    ONCOGENES.discard(g)          # dual-role genes stay with their suppressor entry above
DNA_REPAIR = {
    "BRCA1", "BRCA2", "PALB2", "BARD1", "BRIP1", "RAD51", "RAD51B", "RAD51C", "RAD51D", "XRCC2", "XRCC3", "RAD52", "RAD54L",
    "ATM", "ATR", "ATRIP", "CHEK1", "CHEK2", "TP53BP1", "RBBP8", "MRE11", "RAD50", "NBN", "MDC1", "H2AX", "RNF8", "RNF168",
    "PARP1", "PARP2", "XRCC1", "LIG1", "LIG3", "LIG4", "XRCC4", "XRCC5", "XRCC6", "PRKDC", "DCLRE1C", "NHEJ1", "POLQ",
    "MLH1", "MLH3", "MSH2", "MSH3", "MSH6", "PMS1", "PMS2", "EXO1", "POLE", "POLD1", "POLD3", "POLH", "POLK", "POLI",
    "REV1", "REV3L", "REV7", "MAD2L2", "SHLD1", "SHLD2", "SHLD3", "FANCA", "FANCB", "FANCC", "FANCD2", "FANCE", "FANCF",
    "FANCG", "FANCI", "FANCL", "FANCM", "UBE2T", "SLX4", "ERCC1", "ERCC2", "ERCC3", "ERCC4", "ERCC5", "ERCC6", "ERCC8",
    "XPA", "XPC", "DDB1", "DDB2", "RAD23B", "CETN2", "GTF2H1", "MNAT1", "OGG1", "MUTYH", "NTHL1", "NEIL1", "NEIL2", "NEIL3",
    "APEX1", "APEX2", "UNG", "SMUG1", "TDG", "MBD4", "MPG", "PNKP", "APTX", "TDP1", "TDP2", "FEN1", "RPA1", "RPA2", "RPA3",
    "BLM", "WRN", "RECQL", "RECQL4", "RECQL5", "TOP3A", "RMI1", "RMI2", "HELQ", "EME1", "MUS81", "GEN1", "SLX1A",
    "TOPBP1", "CLSPN", "TIMELESS", "TIPIN", "WEE1", "PKMYT1", "CDC25A", "USP1", "WDR48", "RAD18", "HLTF", "SHPRH",
    "SMARCAL1", "ZRANB3", "HROB", "RADX", "EYA1", "RTEL1", "DNA2", "ATRX", "SETD2", "KMT5B", "KMT5C", "BRCC3", "ABRAXAS1",
    "UIMC1", "BABAM1", "BABAM2", "PAXIP1", "RIF1", "TRIP13",
}
IMMUNE_REGULATORY = {
    "B2M", "HLA-A", "HLA-B", "HLA-C", "HLA-E", "HLA-DRA", "HLA-DRB1", "HLA-DQA1", "HLA-DQB1", "HLA-DPA1", "HLA-DPB1",
    "TAP1", "TAP2", "TAPBP", "TAPBPL", "CALR", "CANX", "PDIA3", "ERAP1", "ERAP2", "PSMB8", "PSMB9", "PSMB10", "NLRC5",
    "CIITA", "RFX5", "RFXAP", "RFXANK", "JAK1", "JAK2", "TYK2", "STAT1", "STAT2", "IRF1", "IRF9", "IFNGR1", "IFNGR2",
    "IFNAR1", "IFNAR2", "SOCS1", "PTPN2", "ADAR", "APLNR", "CD274", "PDCD1LG2", "PDCD1", "CTLA4", "LAG3", "HAVCR2",
    "TIGIT", "CD47", "SIRPA", "CD58", "CD80", "CD86", "CD40", "CD40LG", "TNFRSF14", "BTLA", "VSIR", "CD276", "VTCN1",
    "LGALS9", "PVR", "NECTIN2", "CD200", "CD200R1", "TNFAIP3", "CASP8", "FAS", "FASLG", "TNFRSF10A", "TNFRSF10B",
    "TRAF2", "RIPK1", "CFLAR", "BIRC2", "BIRC3", "CYLD", "OTULIN", "TBK1", "STING1", "CGAS", "MAVS", "RIGI", "IFIH1",
    "TLR3", "TLR4", "TLR7", "TLR9", "MYD88", "TRAF3", "IKBKG", "NFKB1", "RELB", "IL2RG", "IL7R", "IL15", "IL15RA",
    "IL6", "IL10", "TGFB1", "TGFBR1", "TGFBR2", "SMAD3", "CXCL9", "CXCL10", "CXCL11", "CXCR3", "CCL5", "CCR5", "CX3CR1",
    "GZMB", "PRF1", "IFNG", "TNF", "IDO1", "TDO2", "ARG1", "ARG2", "NOS2", "PTGS2", "ENTPD1", "NT5E", "ADORA2A",
    "CD38", "IL4I1", "AHR", "PTPN1", "PTPN22", "SHP2", "PTPN11", "DOK1", "SETDB1", "KDM1A", "EZH2", "DNMT1", "PBRM1",
    "ARID2", "BRD9", "SMARCA4", "MEN1", "KEAP1", "STK11", "PTEN", "MTAP", "CDKN2A", "APC", "CTNNB1", "MYC", "WNT5A",
    "CCND1", "FGFR3", "SERPINB3", "SERPINB4", "SERPINB9", "GBP1", "IRF2", "IFNE", "CD74", "MR1", "CD1D", "ULBP1",
    "MICA", "MICB", "RAET1E", "KLRK1", "KLRC1", "HLA-G", "HLA-F", "CEACAM1", "PVRIG", "TIM3", "SIGLEC15", "IL1B",
    "IL18", "NLRP3", "GSDMD", "GSDME", "CASP1", "CASP3", "CASP9", "APAF1", "BAX", "BAK1", "BCL2L1", "MCL1",
}
DEPENDENCY_CUTOFF = -0.5


def bundle_dir():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, "reference_data", "depmap")
        if os.path.exists(os.path.join(p, "gene_effect.npy")):
            return p
    return ""


# SERVER-SIDE CACHE, per gene, beside the DepMap bundle. The answer depends on the
# curated lists and on the bundle, so the cache carries a version made from both: a
# changed list or a rebuilt bundle simply misses and recomputes.
def lists_version(bd):
    h = hashlib.sha1()
    for name, st in (("tsg", TUMOUR_SUPPRESSORS), ("onc", ONCOGENES), ("rep", DNA_REPAIR), ("imm", IMMUNE_REGULATORY)):
        h.update((name + ":" + ",".join(sorted(st))).encode())
    h.update(("cut:%s" % DEPENDENCY_CUTOFF).encode())
    built = ""
    try:
        if bd:
            built = str(json.load(open(os.path.join(bd, "meta.json"))).get("built") or "")
    except Exception:
        built = ""
    h.update(("built:" + built).encode())
    return h.hexdigest()[:16]


def cache_path():
    for base in ["/opt/baja-server", os.path.expanduser("~/baja-server"), os.getcwd()]:
        d = os.path.join(base, "reference_data", "depmap")
        if os.path.isdir(d):
            return os.path.join(d, "annotations-cache.json")
    return ""


def cache_load(version):
    p = cache_path()
    if not p or not os.path.exists(p):
        return {}
    try:
        c = json.load(open(p))
        if not isinstance(c, dict) or c.get("version") != version:
            return {}
        return c.get("genes") or {}
    except Exception:
        return {}


def cache_save(version, genes):
    p = cache_path()
    if not p:
        return
    try:
        tmp = p + ".%d.part" % os.getpid()
        with open(tmp, "w") as fh:
            json.dump({"version": version, "at": time.time(), "genes": genes}, fh)
        os.replace(tmp, p)
    except Exception:
        pass


raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
want = [str(g).strip().upper() for g in (req.get("genes") or []) if str(g).strip()]
want = list(dict.fromkeys(want))[:2000]

if not want:
    out["error"] = "no genes were given"
else:
    notes = []
    dep = {}
    bd = bundle_dir()
    version = lists_version(bd)
    cache = cache_load(version)
    res = {}
    for g in want:
        c = cache.get(g)
        if isinstance(c, dict) and "classes" in c:
            res[g] = c
    todo = [g for g in want if g not in res]
    if res:
        works.msg("%d gene(s) from the cache; classifying %d…" % (len(res), len(todo)))
    if todo and bd and np is not None:
        try:
            genes = [g.strip() for g in open(os.path.join(bd, "genes.txt")).read().rstrip("\n").split("\n")]
            gidx = {g.upper(): i for i, g in enumerate(genes)}
            G = np.load(os.path.join(bd, "gene_effect.npy"), mmap_mode="r")
            for g in todo:
                i = gidx.get(g)
                if i is None:
                    continue
                col = np.asarray(G[:, i], dtype=np.float32)
                dep[g] = (float(col.mean()), float((col < DEPENDENCY_CUTOFF).mean()))
        except Exception as e:
            notes.append("DepMap dependency could not be read: %s" % e)
    elif todo and not bd:
        notes.append("The DepMap bundle is not on this server, so 'cancer dependency' could not be assessed.")
    fresh = {}
    for g in todo:
        classes = []
        if g in TUMOUR_SUPPRESSORS:
            classes.append("tumour_suppressor")
        if g in ONCOGENES:
            classes.append("oncogene")
        d = dep.get(g)
        if d and d[0] < DEPENDENCY_CUTOFF:
            classes.append("cancer_dependency")
        if g in DNA_REPAIR:
            classes.append("dna_repair")
        if g in IMMUNE_REGULATORY:
            classes.append("immune_regulatory")
        if not any(c in classes for c in ("tumour_suppressor", "oncogene", "dna_repair", "immune_regulatory")):
            classes.append("not_associated")
        fresh[g] = {"classes": classes,
                    "depmap_mean_effect": (round(d[0], 3) if d else None),
                    "depmap_frac_dependent": (round(d[1], 3) if d else None)}
    if fresh:
        res.update(fresh)
        # Only genes the bundle could score are worth remembering when the bundle is
        # missing; with it present every answer is final for this version.
        if bd or not todo:
            cache.update(fresh)
            cache_save(version, cache)
    res = {g: res[g] for g in want if g in res}
    notes.append("Classes come from curated lists (COSMIC-census style tumour suppressors and oncogenes, the DNA "
                 "damage response, antigen presentation / interferon / checkpoint genes) and from DepMap: a gene "
                 "is a cancer dependency when its mean CRISPR knockout effect across all screened lines is below "
                 "%.1f. 'Not previously associated' means absent from these lists, not from the literature." % DEPENDENCY_CUTOFF)
    out["ok"] = True
    out["genes"] = json.dumps(res)
    out["notes"] = json.dumps(notes)
    works.msg("%d gene(s) classified" % len(res))

works.resolve(out)

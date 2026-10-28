"""Allele-selective oligo design around a known variant.

Both modalities here are designed against the MUTANT allele; the wild-type allele then
presents a single mismatch (or a bulge, for an indel). For an siRNA, whether that costs the
wild-type its activity depends on WHERE the mismatch falls in the guide. For a gapmer it does
not, and the two modalities are therefore ranked on different things:

  siRNA   the guide (antisense) is loaded into RISC. A mismatch in the central/cleavage
          region (guide positions 9-11) is the most disruptive to slicing, and one in the
          seed (2-8) disrupts target engagement. Mismatches at the very 5' base (position 1,
          which is not read as a base pair) or past ~position 15 discriminate poorly.
  gapmer  selectivity is NOT positional and is not a property of the mutation. An
          allele-selective gapmer is aimed at a discriminating base that is PHASED with the
          disease allele, which in practice is a heterozygous SNP on the disease haplotype
          rather than the causative mutation itself. Any register covering that base inherits
          the haplotype's selectivity, so no register is downranked for where the base happens
          to sit relative to the DNA gap. Gapmer registers are ranked on sequence quality.

A HAPLOTYPE IS A SET OF PHASED ALLELES, so the input is a list of variants and a candidate is
every oligo of the requested length covering AT LEAST ONE of them. With a single site that is
twenty registers for a 20-mer, the site sitting at position 1 of the first and position 20 of
the last. With two sites close enough to share a window, the registers that span both carry
two mismatches against the wild-type haplotype and rank above equal-quality registers that
carry one. The list is taken to be IN PHASE: that is an assertion about the patient's
genotype, not something recoverable from the window, and it is the caller's to establish. Each is scored by that placement first and by
ordinary sequence quality (GC, runs, thermodynamic asymmetry) second.

A register whose mismatch lands where it cannot discriminate (an siRNA's P1 or 3' end) used
to be DROPPED. It is now returned, carrying discriminates=false,
a weight low enough to sort it below every real candidate, and a note saying what is wrong
with it. Dropping them meant a 20-mer gapmer came back as ten compounds and the other ten
walks across the same allele were never shown -- and a design is easier to judge against the
alternatives it was picked over than on its own.

Params (after the EngineMonitor):
    param(1) : JSON
      { "target_wt": "...",        wild-type window, sense/mRNA orientation, 5'->3'
        "target_mut": "...",       the same window with the variant applied
        "variants": [                the phased haplotype, one entry per site
          { "start": i,              0-based offset of the change in target_mut
            "end": j,                exclusive; equals start for a pure insertion point
            "wt_start": i, "wt_end": j,   the same span in target_wt
            "type": "snp"|"ins"|"del", "ref": "A", "alt": "T", "label": "rs362331" } ],
        "variant": { ... },          accepted as before; a haplotype of one
        "modality": "sirna" | "gapmer",
        "lengths": [21],           oligo lengths to try
        "top_n": 0,          # 0 / absent = every register; a number caps the list
        "gapmer": { "wing": 5, "gap": 10, "strict": true },   strict: the geometry is exact

        "chemistry": { "template": "standard"|"esc"|"esc_plus"|"galnac_esc"|"all_2ome",   siRNA
                       "wing": "LNA"|"2'-MOE"|"2'-OMe",   gapmer wings
                       "backbone": "PS" } }

Resolves { ok, modality, candidates: [...], considered, discriminating, haplotype_size,
rejected, error }. Each candidate carries its offset into the window, both strands, every
phased site it covers with that site's position in the antisense strand (1-based from its 5'
end) in variant_positions, the dominant one repeated as the scalar variant_position for
callers that predate haplotypes, variants_covered, why it discriminates, and a score.
"""
import json
import re

from ion import works

COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "U": "A", "N": "N"}


def rc(s):
    return "".join(COMP.get(b, "N") for b in reversed(s.upper()))


def gc_percent(s):
    s = s.upper()
    return 100.0 * sum(1 for b in s if b in "GC") / max(1, len(s))


def longest_run(s):
    best = run = 1
    for i in range(1, len(s)):
        run = run + 1 if s[i] == s[i - 1] else 1
        best = max(best, run)
    return best if s else 0


# --- selectivity ---------------------------------------------------------------------------
#
# EVERY REGISTER IS DESIGNED; POSITION RANKS IT, IT NO LONGER VETOES IT.
#
# This applied to siRNA only. sirna_discrimination returned None for a mismatch that does not
# discriminate and the caller dropped the candidate. The reasoning was sound -- an oligo that
# does not discriminate is not an allele-selective oligo -- but the effect was that registers
# whose mismatch fell outside the seed or cleavage site were never shown at all, and a design
# is easier to judge against the alternatives it was picked over than in isolation.
#
# So it returns (weight, label, discriminates). A non-discriminating register keeps a weight
# low enough to sort it below every real candidate and to color it red in the client, and its
# label says what is wrong with it rather than just being a small number.
#
# THERE IS NO GAPMER EQUIVALENT, DELIBERATELY. A gapmer_discrimination() used to score the
# variant by its position relative to the DNA gap, on the argument that RNase H needs a
# well-formed DNA:RNA duplex across the gap and so a mismatch under a wing cannot discriminate.
# That is sound enzymology and the wrong model for this problem: an allele-selective gapmer is
# not aimed at the mutation, it is aimed at a discriminating base phased with the disease
# allele, typically a heterozygous SNP on the haplotype. Selectivity is conferred by the
# haplotype, so every register covering the discriminating base carries it equally and the
# positional term was penalising registers that are in fact selective. Gapmer registers are
# ranked on sequence quality instead.
def sirna_discrimination(pos, guide_len):
    """pos is 1-based from the guide's 5' end. Returns (weight 0..1, label, discriminates)."""
    if pos <= 1:
        return 0.05, "5' base (P1) - not read as a base pair, no discrimination", False
    if 9 <= pos <= 11:
        return 1.00, "central / cleavage site (P%d)" % pos, True
    if 2 <= pos <= 8:
        return 0.80, "seed (P%d)" % pos, True
    if 12 <= pos <= 15:
        return 0.45, "3' supplementary (P%d)" % pos, True
    return 0.10, "3' end (P%d) - discriminates poorly" % pos, False


# --- chemistry -----------------------------------------------------------------------------
# A STARTING template, per position, in the vocabulary the chemistry editor already uses
# ("DNA", "LNA", "2'-OMe", "2'-MOE", "2'-F"). These are the standard shapes of each design, not
# a claim about one published compound: the point is that a candidate arrives with the
# chemistry the user chose already on it, and the chemistry editor refines it from there.
SIRNA_TEMPLATES = {
    # Alternating 2'-OMe / 2'-F along each strand -- the classic template.
    "standard": {"label": "2'-F / 2'-OMe (standard)", "alt": True, "f_positions": None, "ps_ends": 2, "conjugate": None},
    # ESC: mostly 2'-OMe with 2'-F kept to the positions that matter for potency, and PS at
    # the terminal linkages of both strands.
    "esc": {"label": "ESC (Enhanced Stabilization)", "alt": False,
            "f_positions": {"sense": [7, 9, 10, 11], "antisense": [2, 14]}, "ps_ends": 2, "conjugate": None},
    # ESC+: ESC with 2'-F reduced further and more PS.
    "esc_plus": {"label": "Advanced ESC (ESC+)", "alt": False,
                 "f_positions": {"sense": [9, 10], "antisense": [2]}, "ps_ends": 3, "conjugate": None},
    "galnac_esc": {"label": "GalNAc-conjugated ESC", "alt": False,
                   "f_positions": {"sense": [7, 9, 10, 11], "antisense": [2, 14]}, "ps_ends": 2,
                   "conjugate": "GalNAc (sense 3')"},
    "all_2ome": {"label": "Fully 2'-OMe", "alt": False, "f_positions": {"sense": [], "antisense": []},
                 "ps_ends": 2, "conjugate": None},
}
GAPMER_WINGS = {"LNA": "LNA", "2'-MOE": "2'-MOE", "2'-OMe": "2'-OMe", "cEt": "cEt"}
# HELM monomer symbols, as the app's own monomer set names them (baja/chem/monomers.js):
# d Deoxyribose, m 2'-O-Methylribose, moe 2'-O-methoxyethylribose, lna LNA, cet (S)-cEt BNA.
HELM_SYMBOL = {"DNA": "d", "2'-OMe": "m", "2'-MOE": "moe", "LNA": "lna", "cEt": "cet", "2'-F": "fl2r"}


def helm_template(layout, backbone):
    """A chemistry template in the form Biopolymer.applySequenceToTemplate() fills:
    one 'symbol()' token per position, joined by the linkage between them ('sp' = PS,
    'p' = PO). The last position carries no trailing linkage."""
    toks = []
    for i, mod in enumerate(layout):
        sym = HELM_SYMBOL.get(mod, "d")
        link = ""
        if i < len(layout) - 1:
            bb = backbone[i] if i < len(backbone) else "PS"
            link = "sp" if str(bb).upper() == "PS" else "p"
        toks.append("%s()%s" % (sym, link))
    return ".".join(toks)


def sirna_chemistry(template_key, length, strand):
    """Per-position modifications for one siRNA strand, 5'->3'."""
    t = SIRNA_TEMPLATES.get(template_key) or SIRNA_TEMPLATES["standard"]
    if t["alt"]:
        # 2'-OMe on odd positions, 2'-F on even (sense); the antisense starts the other way,
        # which is what makes the duplex alternate out of phase.
        first, second = ("2'-OMe", "2'-F") if strand == "sense" else ("2'-F", "2'-OMe")
        return [first if (i % 2 == 0) else second for i in range(length)]
    f = set((t["f_positions"] or {}).get(strand) or [])
    return ["2'-F" if (i + 1) in f else "2'-OMe" for i in range(length)]


def sirna_backbone(template_key, length):
    """Linkages between positions: PS at each end, PO in between."""
    t = SIRNA_TEMPLATES.get(template_key) or SIRNA_TEMPLATES["standard"]
    n = max(0, length - 1)
    ends = min(int(t["ps_ends"] or 0), n // 2)
    return ["PS" if (i < ends or i >= n - ends) else "PO" for i in range(n)]


def quality(seq, modality):
    """Ordinary sequence quality, 0..1, with the reasons. Not selectivity."""
    notes = []
    q = 1.0
    gc = gc_percent(seq)
    lo, hi = (30.0, 60.0) if modality == "sirna" else (35.0, 65.0)
    if gc < lo or gc > hi:
        q -= 0.25
        notes.append("GC %.0f%% outside %.0f-%.0f%%" % (gc, lo, hi))
    run = longest_run(seq)
    if run >= 5:
        q -= 0.30
        notes.append("run of %d identical bases" % run)
    elif run == 4:
        q -= 0.12
        notes.append("run of 4 identical bases")
    if "GGGG" in seq.upper():
        q -= 0.20
        notes.append("G-quadruplex risk (GGGG)")
    if modality == "sirna":
        # Thermodynamic asymmetry: an A/U at the guide 5' end favours guide loading.
        guide = rc(seq)
        if guide[0] in "AT":
            q += 0.08
            notes.append("A/U at guide 5' end (favours guide strand loading)")
        else:
            q -= 0.08
            notes.append("G/C at guide 5' end (passenger strand may load)")
    return max(0.0, min(1.0, q)), notes


def design(cfg):
    wt = re.sub(r"[^ACGTN]", "", str(cfg.get("target_wt") or "").upper())
    mut = re.sub(r"[^ACGTN]", "", str(cfg.get("target_mut") or "").upper())
    modality = str(cfg.get("modality") or "sirna").lower()
    lengths = [int(x) for x in (cfg.get("lengths") or ([21] if modality == "sirna" else [16, 18, 20])) if int(x) > 5]
    _tn = cfg.get("top_n")
    top_n = max(1, int(_tn)) if _tn else 0        # 0 = keep every register designed
    gcfg = cfg.get("gapmer") or {}
    wing = max(2, int(gcfg.get("wing") or 5))
    gap_len = max(4, int(gcfg.get("gap") or 10))
    strict = bool(gcfg.get("strict"))
    chem = cfg.get("chemistry") or {}
    template = str(chem.get("template") or "standard").lower()
    if modality == "sirna" and template not in SIRNA_TEMPLATES:
        return None, "unknown siRNA chemistry template: %s" % template
    wing_chem = str(chem.get("wing") or "2'-MOE")
    if modality == "gapmer" and wing_chem not in GAPMER_WINGS:
        return None, "unknown gapmer wing chemistry: %s" % wing_chem
    backbone = str(chem.get("backbone") or "PS").upper()

    if not mut:
        return None, "no mutant sequence for the window"
    # A HAPLOTYPE IS A SET OF PHASED ALLELES, so the input is a list. `variant` (singular) is
    # still accepted and is treated as a haplotype of one, which is the ordinary case.
    #
    # The list is taken to be IN PHASE on the disease allele. That is an assertion about the
    # patient's genotype, not something recoverable from the window, so it is the caller's to
    # establish. An unphased list of heterozygous sites is not a haplotype and designing
    # against it will produce oligos that discriminate nothing.
    raw = cfg.get("variants")
    if not raw:
        _v = cfg.get("variant") or {}
        raw = [_v] if _v else []
    variants = []
    dropped_variants = 0
    for _v in (raw if isinstance(raw, list) else [raw]):
        try:
            st = int(_v.get("start"))
        except Exception:
            dropped_variants += 1
            continue
        if not (0 <= st <= len(mut)):
            # Counted, not silent. A site outside the window is usually a coordinate-convention
            # error upstream, and dropping it quietly would design against the wrong haplotype.
            dropped_variants += 1
            continue
        variants.append({"start": st,
                         "end": max(int(_v.get("end", st + 1)), st + 1),
                         "type": str(_v.get("type") or "snp").lower(),
                         "ref": _v.get("ref") or "", "alt": _v.get("alt") or "",
                         "label": _v.get("label") or "",
                         "wt_start": _v.get("wt_start", st)})
    if not variants:
        return None, "the haplotype has no variant with a position in the window"
    variants.sort(key=lambda x: x["start"])
    all_snp = all(x["type"] == "snp" for x in variants)

    out = []
    considered = 0
    rejected = {"no_overlap": 0, "position": 0, "edge": 0, "geometry": 0,
                "variant_out_of_window": dropped_variants}

    for L in lengths:
        if modality == "gapmer":
            if strict:
                # A NAMED GEOMETRY IS A RULE, NOT A STARTING POINT. 5-10-5 means five wing
                # residues, a ten-base DNA gap and a twenty-mer; if the length asked for cannot
                # hold exactly that, the answer is to design nothing at that length rather than
                # to quietly ship a 3-10-3 wearing the 5-10-5 label. The gap is never shrunk.
                if L != 2 * wing + gap_len:
                    rejected["geometry"] = rejected.get("geometry", 0) + 1
                    continue
                w, g_len = wing, gap_len
            else:
                # The gap is centerd in the oligo; wings take the rest.
                g_len = min(gap_len, max(4, L - 2 * 2))
                w = max(2, (L - g_len) // 2)
            g_start = w + 1                     # 1-based, inclusive
            g_end = w + g_len
        # Every window of length L that covers AT LEAST ONE of the haplotype's variants. A
        # register covering two phased sites is not a different design, it is the same design
        # carrying two mismatches against the wild-type haplotype.
        lo = max(0, variants[0]["start"] - L + 1)
        hi = max(0, min(variants[-1]["start"], len(mut) - L))
        for start in range(lo, hi + 1):
            end = start + L
            if end > len(mut):
                rejected["edge"] += 1
                continue
            covered = [x for x in variants if start <= x["start"] < end]
            if not covered:
                rejected["no_overlap"] += 1
                continue
            considered += 1
            site = mut[start:end]            # sense / mRNA orientation
            guide = rc(site)                 # antisense, 5'->3'
            # Where does each covered variant sit in the ANTISENSE strand, from its 5' end?
            # The antisense is the reverse complement, so a sense offset k maps to L - k.
            placed = []
            for x in covered:
                ap = L - (x["start"] - start)
                if modality == "sirna":
                    w_, lab, disc = sirna_discrimination(ap, L)
                else:
                    w_, lab, disc = 1.0, "P%d" % ap, True
                placed.append({"label": x["label"], "type": x["type"],
                               "ref": x["ref"], "alt": x["alt"],
                               "offset_in_site": x["start"] - start,
                               "position": ap, "weight": round(w_, 3),
                               "discriminates": bool(disc), "note": lab})
            placed.sort(key=lambda p: -p["weight"])
            best = placed[0]                       # the dominant discriminator
            n_cov = len(placed)
            n_disc = sum(1 for p in placed if p["discriminates"])
            discriminates = n_disc > 0
            sel = best["weight"]
            if modality == "sirna":
                why = best["note"] if n_cov == 1 else ("%s; %d of %d phased sites covered"
                                                       % (best["note"], n_disc, n_cov))
            else:
                why = ("covers %d discriminating base%s of the phased haplotype (%s); "
                       "selectivity is carried by the haplotype, not by position relative to "
                       "the gap" % (n_cov, "" if n_cov == 1 else "s",
                                    ", ".join("P%d" % p["position"] for p in placed)))
            if not discriminates:
                # Still designed and still returned -- counted, not dropped. The count is what
                # the caller reports as "N of these do not discriminate".
                rejected["position"] += 1
            qual, notes = quality(site, modality)
            # Every additional phased mismatch against the wild-type haplotype adds
            # discrimination, with diminishing returns: the first one already makes the oligo
            # allele-selective, so this ranks multi-site registers above equal-quality
            # single-site ones rather than treating one site as inadequate.
            cov = min(1.25, 1.0 + 0.12 * (n_disc - 1)) if n_disc > 1 else 1.0
            # siRNA blends placement with sequence quality; a gapmer has no placement term, so
            # blending a constant would only compress the range. Rank it on quality alone.
            base = (0.65 * sel + 0.35 * qual) if modality == "sirna" else qual
            score = round(min(100.0, 100.0 * base * cov), 1)
            if not discriminates:
                notes = list(notes) + ["Does not discriminate the wild-type allele: " + why]
            cand = {
                "offset": start, "length": L,
                "target_site": site,
                "sense": site.replace("T", "U") if modality == "sirna" else site,
                "antisense": guide.replace("T", "U") if modality == "sirna" else guide,
                "antisense_dna": guide,
                # The dominant discriminator, kept scalar for callers that predate haplotypes.
                "variant_position": best["position"],
                "variant_offset_in_site": best["offset_in_site"],
                # Every phased site this register covers, strongest first.
                "variant_positions": placed,
                "variants_covered": n_cov,
                "variants_discriminating": n_disc,
                "coverage_factor": round(cov, 3),
                "discrimination": why,
                "discriminates": bool(discriminates),
                "selectivity": round(sel, 3),
                "quality": round(qual, 3),
                "gc_percent": round(gc_percent(site), 1),
                "score": score,
                "notes": notes,
                "label": "; ".join(p["label"] for p in placed if p["label"]),
            }
            if modality == "sirna":
                cand["sense_overhang"] = "dTdT"
                cand["antisense_overhang"] = "dTdT"
                cand["chemistry_template"] = template
                cand["chemistry_label"] = SIRNA_TEMPLATES[template]["label"]
                cand["sense_chemistry"] = sirna_chemistry(template, L, "sense")
                cand["antisense_chemistry"] = sirna_chemistry(template, L, "antisense")
                cand["chemistry_layout"] = cand["antisense_chemistry"]
                cand["backbone_pattern"] = sirna_backbone(template, L)
                cand["conjugate"] = SIRNA_TEMPLATES[template]["conjugate"]
            else:
                cand["gap_start_1based"] = g_start
                cand["gap_end_1based"] = g_end
                cand["gap_size"] = g_end - g_start + 1
                cand["left_wing_size"] = g_start - 1
                cand["right_wing_size"] = L - g_end
                # Wings in the chosen chemistry, a DNA gap for RNase H, and the chosen
                # backbone throughout. The gap MUST stay DNA -- that is what recruits the
                # enzyme -- so the choice applies to the wings only.
                cand["chemistry_layout"] = ([wing_chem] * (g_start - 1) + ["DNA"] * (g_end - g_start + 1)
                                            + [wing_chem] * (L - g_end))
                cand["backbone_pattern"] = [backbone] * (L - 1)
                cand["wing_modification"] = wing_chem
                cand["chemistry_label"] = ("%d-%d-%d %s gapmer, %s backbone"
                                           % (g_start - 1, g_end - g_start + 1, L - g_end, wing_chem, backbone))
                # The template the client hands to Biopolymer.generateCompound, which fills it
                # with the SYNTHESIS sequence (the ASO itself, 5'->3'), so the layout is in that
                # same order -- which is how chemistry_layout is already built.
                cand["helm_template"] = helm_template(cand["chemistry_layout"], cand["backbone_pattern"])
            # The wild-type site, for the report: what this oligo sees on the other allele.
            try:
                if all_snp:
                    wt_off = start          # SNPs preserve length, so offsets map 1:1
                else:
                    v0 = variants[0]        # anchor on the leftmost variant's own mapping
                    wt_off = start + (int(v0["wt_start"]) - v0["start"])
                cand["wt_site"] = wt[wt_off:wt_off + L] if wt else ""
            except Exception:
                cand["wt_site"] = ""
            out.append(cand)

    out.sort(key=lambda c: (not c["discriminates"], -c["score"], -c["variants_discriminating"],
                            -c["selectivity"], c["offset"]))
    kept = out[:top_n] if top_n else out
    for i, c in enumerate(kept, 1):
        c["rank"] = i
    return {"candidates": kept, "considered": considered, "rejected": rejected,
            "haplotype_size": len(variants),
            "discriminating": sum(1 for c in kept if c["discriminates"])}, None


try:
    cfg = works.param(1)
    if isinstance(cfg, str):
        cfg = json.loads(cfg or "{}")
    cfg = cfg or {}
except Exception:
    cfg = {}

works.msg("Designing allele-selective candidates…")
res, err = design(cfg)
works.resolve({
    "ok": bool(res and not err),
    "modality": str(cfg.get("modality") or "sirna").lower(),
    "candidates": json.dumps((res or {}).get("candidates") or []),
    "considered": (res or {}).get("considered") or 0,
    # How many of the returned registers actually discriminate the wild-type allele. The rest
    # are still designed and still placed, marked and ranked last -- see the note above.
    "discriminating": (res or {}).get("discriminating") or 0,
    "rejected": json.dumps((res or {}).get("rejected") or {}),
    # How many phased sites the haplotype was defined by.
    "haplotype_size": (res or {}).get("haplotype_size") or 0,
    "error": err,
})

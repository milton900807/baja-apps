"""Allele-selective oligo design around a known variant.

Allele selectivity is a question of WHERE the wild-type mismatch falls inside the oligo, not
of how good the oligo is in general. Both modalities here are designed against the MUTANT
allele; the wild-type allele then presents a single mismatch (or a bulge, for an indel), and
whether that costs the wild-type its activity depends entirely on its position:

  siRNA   the guide (antisense) is loaded into RISC. A mismatch in the central/cleavage
          region (guide positions 9-11) is the most disruptive to slicing, and one in the
          seed (2-8) disrupts target engagement. Mismatches at the very 5' base (position 1,
          which is not read as a base pair) or past ~position 15 discriminate poorly.
  gapmer  RNase H needs a well-formed DNA:RNA duplex across the DNA gap. A mismatch INSIDE
          the gap, near its centre, blocks cleavage of the wild-type transcript; a mismatch
          under a modified wing does not, because the wings do not recruit the enzyme.

So candidates are EVERY oligo of the requested length that covers the variant -- one per
register, so a 20-mer over one allele is twenty candidates, the variant sitting at position 1
of the first and position 20 of the last. Each is scored by that placement first and by
ordinary sequence quality (GC, runs, thermodynamic asymmetry) second.

A register whose mismatch lands where it cannot discriminate (an siRNA's P1 or 3' end, or
under a gapmer's wing) used to be DROPPED. It is now returned, carrying discriminates=false,
a weight low enough to sort it below every real candidate, and a note saying what is wrong
with it. Dropping them meant a 20-mer gapmer came back as ten compounds and the other ten
walks across the same allele were never shown -- and a design is easier to judge against the
alternatives it was picked over than on its own.

Params (after the EngineMonitor):
    param(1) : JSON
      { "target_wt": "...",        wild-type window, sense/mRNA orientation, 5'->3'
        "target_mut": "...",       the same window with the variant applied
        "variant": { "start": i,   0-based offset of the change in target_mut
                     "end": j,     exclusive; equals start for a pure insertion point
                     "wt_start": i, "wt_end": j,   the same span in target_wt
                     "type": "snp"|"ins"|"del", "ref": "A", "alt": "T", "label": "K27M" },
        "modality": "sirna" | "gapmer",
        "lengths": [21],           oligo lengths to try
        "top_n": 0,          # 0 / absent = every register; a number caps the list
        "gapmer": { "wing": 5, "gap": 10, "strict": true },   strict: the geometry is exact

        "chemistry": { "template": "standard"|"esc"|"esc_plus"|"galnac_esc"|"all_2ome",   siRNA
                       "wing": "LNA"|"2'-MOE"|"2'-OMe",   gapmer wings
                       "backbone": "PS" } }

Resolves { ok, modality, candidates: [...], considered, discriminating, rejected, error }.
Each candidate carries its offset into the window, both strands, the variant's position in
the antisense strand (1-based from its 5' end), why that position discriminates, and a score.
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


# --- selectivity: the position of the wild-type mismatch inside the oligo -------------------
#
# EVERY REGISTER IS DESIGNED; POSITION RANKS IT, IT NO LONGER VETOES IT.
#
# These returned None for a mismatch that does not discriminate, and the caller dropped the
# candidate. The reasoning was sound -- an oligo that does not discriminate is not an
# allele-selective oligo -- but the effect was that a 20-mer gapmer came back as ten
# compounds, not twenty: only the registers with the variant inside the DNA gap survived, and
# the other ten walks across the same allele were never shown at all. A design is easier to
# judge against the alternatives it was picked over than in isolation, and "this register is
# poor, here is why" is more useful than the register being absent.
#
# So each returns (weight, label, discriminates). A non-discriminating register keeps a weight
# low enough to sort it below every real candidate and to colour it red in the client, and its
# label says what is wrong with it rather than just being a small number.
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


def gapmer_discrimination(pos, gap_start, gap_end, oligo_len):
    """pos 1-based from the ASO 5' end; gap_start/gap_end 1-based inclusive."""
    if not (gap_start <= pos <= gap_end):
        wing = "5'" if pos < gap_start else "3'"
        return (0.10, "under the %s wing (P%d, gap is %d-%d) - RNase H is unaffected by a mismatch here"
                % (wing, pos, gap_start, gap_end), False)
    centre = (gap_start + gap_end) / 2.0
    half = max(1.0, (gap_end - gap_start) / 2.0)
    # 1.0 dead centre, falling to 0.55 at the gap edges.
    return (1.0 - 0.45 * (abs(pos - centre) / half),
            "DNA gap position %d of %d-%d" % (pos, gap_start, gap_end), True)


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
    v = cfg.get("variant") or {}
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
    try:
        v_start = int(v.get("start"))
        v_end = int(v.get("end", v_start + 1))
    except Exception:
        return None, "the variant has no position in the window"
    if not (0 <= v_start <= len(mut)):
        return None, "the variant lies outside the window"
    v_end = max(v_end, v_start + 1) if v.get("type") != "ins" else max(v_end, v_start + 1)

    out = []
    considered = 0
    rejected = {"no_overlap": 0, "position": 0, "edge": 0, "geometry": 0}

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
                # The gap is centred in the oligo; wings take the rest.
                g_len = min(gap_len, max(4, L - 2 * 2))
                w = max(2, (L - g_len) // 2)
            g_start = w + 1                     # 1-based, inclusive
            g_end = w + g_len
        # every window of length L that covers the variant
        for start in range(max(0, v_start - L + 1), min(v_start + 1, max(0, len(mut) - L + 1))):
            end = start + L
            if end > len(mut):
                rejected["edge"] += 1
                continue
            if not (start <= v_start < end):
                rejected["no_overlap"] += 1
                continue
            considered += 1
            site = mut[start:end]            # sense / mRNA orientation
            guide = rc(site)                 # antisense, 5'->3'
            # Where does the variant sit in the ANTISENSE strand, counted from its 5' end?
            # The antisense is the reverse complement, so a sense offset k maps to L - k.
            k = v_start - start              # 0-based offset in the sense site
            anti_pos = L - k                 # 1-based from the antisense 5' end
            if modality == "sirna":
                d = sirna_discrimination(anti_pos, L)
            else:
                d = gapmer_discrimination(anti_pos, g_start, g_end, L)
            sel, why, discriminates = d
            if not discriminates:
                # Still designed and still returned -- counted, not dropped. The count is what
                # the caller reports as "N of these do not discriminate".
                rejected["position"] += 1
            qual, notes = quality(site, modality)
            score = round(100.0 * (0.65 * sel + 0.35 * qual), 1)
            if not discriminates:
                notes = list(notes) + ["Does not discriminate the wild-type allele: " + why]
            cand = {
                "offset": start, "length": L,
                "target_site": site,
                "sense": site.replace("T", "U") if modality == "sirna" else site,
                "antisense": guide.replace("T", "U") if modality == "sirna" else guide,
                "antisense_dna": guide,
                "variant_position": anti_pos,
                "variant_offset_in_site": k,
                "discrimination": why,
                "discriminates": bool(discriminates),
                "selectivity": round(sel, 3),
                "quality": round(qual, 3),
                "gc_percent": round(gc_percent(site), 1),
                "score": score,
                "notes": notes,
                "label": v.get("label") or "",
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
                wt_off = start + (int(v.get("wt_start", v_start)) - v_start)
                cand["wt_site"] = wt[wt_off:wt_off + L] if wt else ""
            except Exception:
                cand["wt_site"] = ""
            out.append(cand)

    out.sort(key=lambda c: (not c["discriminates"], -c["score"], -c["selectivity"], c["offset"]))
    kept = out[:top_n] if top_n else out
    for i, c in enumerate(kept, 1):
        c["rank"] = i
    return {"candidates": kept, "considered": considered, "rejected": rejected,
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
    "error": err,
})

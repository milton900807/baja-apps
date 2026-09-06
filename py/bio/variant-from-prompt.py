"""Describe a variant in words, get the exact edit on THIS track.

The user types "K27M", "p.Arg175His", "c.83A>T", "delete codon 27", ... for a track that is
already loaded. Claude is asked only to NORMALISE the description into a structured change --
which level (protein / cDNA / genomic / rsID), which reference residue or base, which
position, which alternate -- given the gene and the track's own protein sequence. Everything
after that is deterministic and checked here against the coding sequence the client sent:
the residue really is what the user said it is (with the histone-style off-by-one, where the
initiator Met is not counted, recognised and corrected), and the nucleotide change is the
smallest one that produces the requested residue. The client then places it on the track.

Params (after the EngineMonitor):
    param(1) : the user's description
    param(2) : JSON context from the track:
               { gene, transcript, description, strand, chr, cds }
               cds is the coding sequence in TRANSCRIPT orientation, ATG first.
    param(3) : optional free-text instructions from the user, added to the prompt --
               a numbering convention, a transcript to prefer, a disambiguation the
               description alone cannot carry. It steers the READING only: the answer is
               still checked base by base against `cds` below, so an instruction cannot
               produce a change the sequence does not support.

Resolves:
    { ok, level, edits: [{cds_offset, ref, alt, type, label}], hgvs_p, hgvs_c,
      protein_len, note, explanation, model, error }
    cds_offset is 0-based into cds; ref/alt are transcript-orientation bases.
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# The server may pin a model through ANTHROPIC_MODEL; otherwise the current Opus.
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

CODON = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M", "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S", "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T", "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*", "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K", "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W", "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R", "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}
AA3 = {"A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln", "E": "Glu", "G": "Gly",
       "H": "His", "I": "Ile", "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro", "S": "Ser",
       "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val", "*": "Ter"}
AA1 = {v.upper(): k for k, v in AA3.items()}


def translate(cds):
    return "".join(CODON.get(cds[i:i + 3], "X") for i in range(0, len(cds) - len(cds) % 3, 3))


def parse_json_blob(txt):
    if not txt:
        return None
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# Histone genes number their residues on the MATURE protein, without the initiator
# methionine, so the famous alleles are one behind HGVS: K27M is Lys28, G34R is Gly35. That
# convention has to be decided HERE rather than left to the model, because the model applies
# it inconsistently -- and the case where it matters most is exactly the case where a
# reference-residue check cannot catch the mistake: H3's tandem glycines at HGVS 34 and 35
# mean "G34" matches at both positions, so whichever is tried first wins.
HISTONE_GENE = re.compile(r"^(H3-3[AB]|H3F3[AB]|H3C\d+|HIST1H3[A-Z]|H3[.-]?[13]|H2A|H2B|H4)\b", re.I)
# The H3 N-terminal tail, read after the initiator Met: ARTKQTARKSTGG...
H3_SIGNATURE = "ARTKQTARKSTGG"
AA3_NAMES = "Ala|Arg|Asn|Asp|Cys|Gln|Glu|Gly|His|Ile|Leu|Lys|Met|Phe|Pro|Ser|Thr|Trp|Tyr|Val|Ter"


def is_histone(ctx, protein):
    g = str((ctx or {}).get("gene") or "").strip()
    if g and HISTONE_GENE.match(g):
        return True
    return protein[1:1 + len(H3_SIGNATURE)].upper().startswith(H3_SIGNATURE)


def wrote_explicit_hgvs(text):
    """Did the user ask in HGVS terms? 'p.Gly34Val' and 'p.G34V' are literal positions;
    a bare 'G34V' on a histone is the histone convention."""
    t = str(text or "")
    if re.search(r"\bp\.", t):
        return True
    if re.search(r"(%s)\s*\d+" % AA3_NAMES, t, re.I):
        return True
    if re.search(r"\bhgvs\b", t, re.I):
        return True
    return False


def one_letter(a):
    a = str(a or "").strip()
    if not a:
        return ""
    if len(a) == 1:
        return a.upper()
    if a.upper() in ("STOP", "TER", "X", "*"):
        return "*"
    return AA1.get(a.upper()[:3], "")


# A description that names a gene and a context but no single change is not a mistake -- it
# is a different question. "KRAS lung cancer" cannot be normalised to one edit, and refusing it
# is correct for the single-variant path; but the variants it denotes ARE nameable, and each one
# can then be checked against this transcript exactly like a typed one. VAGUE marks the failures
# that mean "no single change was named" so that the caller can ask the other question, and
# never marks a description that named a change badly.
VAGUE = "VAGUE: "
MAX_COHORT = 12


def ask_cohort(text, ctx, protein, extra=""):
    """The variants a gene-plus-context description denotes. Returns (list, error).

    The model names them; it does not place them. Every one comes back as a protein change
    that protein_edit then verifies against this transcript's own coding sequence, so a
    residue the model misremembers is dropped here rather than drawn on the track."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    system = (
        "You are given a gene, its protein sequence, and a description that names a disease, "
        "trait or biological context rather than one specific variant. List the coding "
        "variants OF THAT GENE that are established as linked to THAT context. Reply with "
        "ONLY a JSON object, no prose:\n"
        "{\n"
        '  "variants": [{"ref": "G", "pos": 12, "alt": "C", "label": "G12C", '
        '"why": "most common KRAS variant in lung adenocarcinoma"}],\n'
        '  "note": ""\n'
        "}\n"
        "Rules:\n"
        "- One-letter amino acids. Write a stop as \"*\", never \"X\".\n"
        "- pos is HGVS (initiator methionine = 1) AND MUST AGREE WITH THE PROTEIN SEQUENCE "
        "GIVEN BELOW. Check that your ref residue really is at that position in that sequence "
        "before you answer, and leave out anything you cannot place in it -- the protein given "
        "is the transcript that is loaded, and a position from a different isoform is wrong "
        "here even if it is the number the literature uses.\n"
        "- LINKED MEANS ANY WELL-DOCUMENTED LINK, not only cancer hotspots: recurrent somatic "
        "mutations, pathogenic or risk germline variants, and common coding polymorphisms with "
        "a documented association with the trait all count. A gene whose association runs "
        "through common variants is answered with those common variants.\n"
        "- Single-residue substitutions only; skip copy-number, repeat-length, whole-exon and "
        "splice changes, which cannot be placed as one coding change. If the gene's link to "
        "the context is mainly through such a mechanism, say so in the note AND still list any "
        "coding variants that are documented.\n"
        "- Order by how strongly each is linked, strongest first. At most %d.\n"
        "- Give the reason in \"why\", naming the rsID where there is one.\n"
        '- If nothing about this gene is linked to that context, return {"variants": [], '
        '"note": "why not"}.' % MAX_COHORT
    )
    user = (
        "Gene / transcript: %s / %s (%s)\nChromosome: %s\n"
        "Protein (HGVS numbering, Met = 1; %d residues):\n%s\n\n"
        "Description from the user: %s"
        % (ctx.get("gene") or "?", ctx.get("transcript") or "?", ctx.get("description") or "",
           ctx.get("chr"), len(protein), protein, text)
    )
    if extra:
        user += ("\n\nAdditional instructions from the user:\n%s" % extra)
    try:
        try:
            import claude_usage as _cu
            _cu.bump("variant-from-prompt-cohort")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 2000, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=120,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the model declined this request"
        txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")
        parsed = parse_json_blob(txt)
        if parsed is None:
            return None, "could not parse model output: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


def ask(text, ctx, protein, extra=""):
    """One Anthropic call: normalise the description. Returns (dict, error)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    system = (
        "You normalise a human description of a genetic variant into a structured change for "
        "ONE specific transcript that is already loaded. You never invent coordinates: you only "
        "classify the description and restate it in standard form. Reply with ONLY a JSON "
        "object, no prose:\n"
        "{\n"
        '  "level": "protein" | "cdna" | "genomic" | "rsid" | "unknown",\n'
        '  "protein": {"ref": "K", "pos": 28, "alt": "M"},          // level protein: one-letter, HGVS numbering (Met = 1)\n'
        '  "cdna": {"pos": 83, "type": "sub"|"del"|"ins"|"dup", "ref": "A", "alt": "T", "end": 83, "seq": ""},  // level cdna: c. numbering, A of ATG = 1\n'
        '  "genomic": {"chr": "17", "pos": 7675088, "ref": "C", "alt": "T"},   // level genomic, GRCh38\n'
        '  "rsid": "rs...",\n'
        '  "hgvs_p": "p.Lys28Met", "hgvs_c": "c.83A>T",\n'
        '  "numbering_note": "",   // e.g. "histone numbering omits Met1: K27 is Lys28 in HGVS"\n'
        '  "explanation": ""\n'
        "}\n"
        "Rules: protein positions are HGVS (initiator methionine = 1). If the user's convention "
        "omits Met1 -- histone variants such as H3 K27M, K36M, G34R -- convert to HGVS numbering and "
        "say so in numbering_note. Use the supplied protein sequence to check that the reference "
        "residue is at the position you give; if it is at the neighbouring position because of "
        "such a convention, use that position. If the text is an rsID or genomic coordinates, "
        "return that level and leave the other fields empty. If it cannot be resolved for this "
        "gene, level is \"unknown\" and explanation says why."
    )
    user = (
        "Gene / transcript: %s / %s (%s)\nStrand: %s   Chromosome: %s\n"
        "Protein (HGVS numbering, Met = 1; %d residues):\n%s\n\n"
        "Description from the user: %s"
        % (ctx.get("gene") or "?", ctx.get("transcript") or "?", ctx.get("description") or "",
           ctx.get("strand"), ctx.get("chr"), len(protein), protein, text)
    )
    # The user's own instructions, kept separate from the description and clearly labelled as
    # guidance rather than as the variant itself, so a sentence of context cannot be mistaken
    # for part of the change being described.
    if extra:
        user += ("\n\nAdditional instructions from the user (guidance on how to read the "
                 "description; the description above is still what is being asked for):\n%s" % extra)
    try:
        try:
            import claude_usage as _cu
            _cu.bump("variant-from-prompt")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 1500, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=90,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the model declined this request"
        txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")
        parsed = parse_json_blob(txt)
        if not parsed:
            return None, "could not parse model output: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


def smallest_codon_change(codon, alt_aa):
    """The codon coding alt_aa reachable with the fewest base changes; (new_codon, n_changes)."""
    best = None
    for c, aa in CODON.items():
        if aa != alt_aa:
            continue
        n = sum(1 for a, b in zip(codon, c) if a != b)
        if best is None or n < best[1] or (n == best[1] and c < best[0]):
            best = (c, n)
    return best


def protein_edit(spec, cds, protein, histone_offset=0, user_text=""):
    ref = one_letter(spec.get("ref"))
    alt = one_letter(spec.get("alt"))
    try:
        pos = int(spec.get("pos"))
    except Exception:
        return None, VAGUE + "no protein position in the description"
    if ref and not alt:
        # A residue and a position, but nothing to change them to. Say that, rather than
        # reporting an internal parse failure: the user is one character from a valid answer.
        try:
            at = "%s%d" % (ref, int(spec.get("pos")))
        except Exception:
            at = ref
        return None, ("%s names a residue but not what it becomes. Add the new residue -- "
                      "%sM for methionine, %sR for arginine." % (at, at, at))
    if not ref or not alt:
        return None, "could not read which residue changes, or what it changes to"

    # A POSITION THE USER DID NOT GIVE IS A POSITION THE MODEL CHOSE. "change lysine to
    # methionine" has no number in it, so whatever position comes back was inferred -- and on a
    # protein with many lysines that is a guess presented as an answer. Accept it only when the
    # residue is unique; otherwise say how many there are and ask which.
    if not re.search(r"\d", str(user_text or "")):
        seats = [i + 1 for i, a in enumerate(protein) if a == ref]
        if len(seats) > 1:
            shown = ", ".join("%s%d" % (ref, q) for q in seats[:8]) + ("…" if len(seats) > 8 else "")
            # NOT vague in the sense that invites enumeration: this description DID name a
            # change, it just did not say where. Enumerating hotspots would answer a question
            # nobody asked, so this stays a refusal with the positions listed.
            return None, ("the description gives no position, and %s occurs %d times in this "
                          "protein (%s). Say which one, e.g. %s%d%s."
                          % (ref, len(seats), shown, ref, seats[0], alt))
    # The convention decides which position is tried FIRST. On a histone gene, a bare "G34V"
    # is mature-protein numbering, so HGVS 35 is tried before 34 -- and with a glycine at both,
    # trying 34 first would silently take the wrong one. The other positions remain as
    # fallbacks for when the leading candidate does not carry the reference residue.
    order = [(pos, ""),
             (pos + 1, "numbering omits Met1: %s%d is %s%d in HGVS" % (ref, pos, ref, pos + 1)),
             (pos - 1, "position given one past HGVS: %s%d is %s%d" % (ref, pos, ref, pos - 1))]
    if histone_offset == 1:
        order = [order[1], order[0], order[2]]
    tried = []
    chosen = None
    note = ""
    for p, why in order:
        if 1 <= p <= len(protein):
            tried.append("%d=%s" % (p, protein[p - 1]))
            if protein[p - 1] == ref:
                chosen, note = p, why
                break
    if chosen is None:
        return None, ("residue %s is not at position %d of this protein (found %s); the description "
                      "does not match this transcript" % (ref, pos, ", ".join(tried)))
    codon = cds[3 * (chosen - 1): 3 * chosen]
    best = smallest_codon_change(codon, alt)
    if not best:
        return None, "no codon encodes %s" % alt
    new_codon, n = best
    changed = [i for i in range(3) if codon[i] != new_codon[i]]
    lo, hi = changed[0], changed[-1]
    edit = {
        "cds_offset": 3 * (chosen - 1) + lo,
        "ref": codon[lo:hi + 1],
        "alt": new_codon[lo:hi + 1],
        "type": "snp",
        # The short name uses the numbering the field writes: on a histone that is the mature
        # protein, so the change at HGVS 28 is the one everyone calls K27M. hgvs_p below keeps
        # the formal name, so both are on the object and neither is guessed at.
        "label": "%s%d%s" % (ref, chosen - histone_offset, alt),
    }
    hgvs_p = "p.%s%d%s" % (AA3.get(ref, ref), chosen, AA3.get(alt, alt))
    hgvs_c = ("c.%d%s>%s" % (edit["cds_offset"] + 1, edit["ref"], edit["alt"]) if n == 1
              else "c.%d_%ddelins%s" % (edit["cds_offset"] + 1, edit["cds_offset"] + len(edit["ref"]), edit["alt"]))
    return {"edits": [edit], "hgvs_p": hgvs_p, "hgvs_c": hgvs_c, "note": note,
            "codon": codon, "new_codon": new_codon, "changes": n}, None


def cdna_edit(spec, cds):
    try:
        pos = int(spec.get("pos"))
    except Exception:
        return None, "no cDNA position in the description"
    kind = str(spec.get("type") or "sub").lower()
    if not (1 <= pos <= len(cds)):
        return None, "c.%d is outside the coding sequence (%d nt)" % (pos, len(cds))
    if kind == "sub":
        ref = str(spec.get("ref") or "").upper()
        alt = str(spec.get("alt") or "").upper()
        if not alt:
            return None, "no alternate base"
        have = cds[pos - 1: pos - 1 + max(1, len(ref))]
        if ref and have != ref:
            return None, "c.%d is %s in this transcript, not %s" % (pos, have, ref)
        return {"edits": [{"cds_offset": pos - 1, "ref": have, "alt": alt, "type": "snp",
                           "label": "c.%d%s>%s" % (pos, have, alt)}],
                "hgvs_c": "c.%d%s>%s" % (pos, have, alt)}, None
    end = int(spec.get("end") or pos)
    if kind == "del":
        if pos < 2:
            return None, "a deletion at c.1 has no anchor base"
        deleted = cds[pos - 1: end]
        anchor = cds[pos - 2]
        return {"edits": [{"cds_offset": pos - 2, "ref": anchor + deleted, "alt": anchor, "type": "del",
                           "label": "c.%d_%ddel" % (pos, end) if end > pos else "c.%ddel" % pos}],
                "hgvs_c": "c.%d_%ddel" % (pos, end) if end > pos else "c.%ddel" % pos}, None
    if kind in ("ins", "dup"):
        seq = str(spec.get("seq") or "").upper()
        if kind == "dup":
            seq = cds[pos - 1: end]
            anchor_off = end - 1
        else:
            anchor_off = pos - 1     # HGVS ins: between pos and pos+1
        if not seq:
            return None, "no inserted sequence"
        anchor = cds[anchor_off]
        return {"edits": [{"cds_offset": anchor_off, "ref": anchor, "alt": anchor + seq, "type": "ins",
                           "label": ("c.%d_%ddup" % (pos, end)) if kind == "dup" else ("c.%d_%dins%s" % (pos, pos + 1, seq))}],
                "hgvs_c": ("c.%d_%ddup" % (pos, end)) if kind == "dup" else ("c.%d_%dins%s" % (pos, pos + 1, seq))}, None
    return None, "unsupported cDNA change type: %s" % kind


text = str(works.param(1) or "").strip()
try:
    ctx = json.loads(str(works.param(2) or "{}"))
except Exception:
    ctx = {}
extra = str(works.param(3) or "").strip()
mode = str(works.param(4) or "").strip().lower()
# mode "verify": the variants were named elsewhere (a disease context resolved by
# py/bio/disease-variants.py) and only have to be checked against THIS transcript.
# Nothing is asked of anything; the whole step is the coding sequence and arithmetic.
given = []
if mode == "verify":
    try:
        given = json.loads(str(works.param(5) or "[]")) or []
    except Exception:
        given = []
cds = re.sub(r"[^ACGTN]", "", str(ctx.get("cds") or "").upper())
out = {"ok": False, "level": None, "edits": [], "hgvs_p": None, "hgvs_c": None,
       "protein_len": 0, "note": "", "explanation": "", "model": ANTHROPIC_MODEL,
       "instructions": extra, "error": None, "vague": False, "cohort": False,
       "rejected": []}

if not text:
    out["error"] = "no description given"
elif len(cds) < 3:
    out["error"] = "this track has no coding sequence (no ORF); load a transcript with a CDS"
else:
    protein = translate(cds)
    out["protein_len"] = len(protein.rstrip("*"))

if mode in ("cohort", "verify") and not out["error"]:
    # The other question: not "which change is this" but "which changes does this context
    # mean". Each one still has to survive protein_edit against this transcript.
    out["cohort"] = True
    out["level"] = "protein"
    if mode == "verify":
        got, err = {"variants": given}, (None if given else "no variants were given to check")
    else:
        works.msg("Finding the variants that %s means…" % text)
        got, err = ask_cohort(text, ctx, protein, extra)
    if err:
        out["error"] = err
    else:
        wanted = (got.get("variants") or [])[:MAX_COHORT]
        out["explanation"] = str(got.get("note") or "")
        hist = is_histone(ctx, protein) and not wrote_explicit_hgvs(text)
        if hist:
            out["numbering"] = "histone (mature protein, Met1 not counted)"
        works.msg("Checking %d variant(s) against this transcript…" % len(wanted))
        edits, rejected = [], []
        for v in wanted:
            label = str(v.get("label") or "")
            # A LABEL THAT CONTRADICTS ITS OWN COORDINATES IS TWO ANSWERS, NOT ONE. "S622P"
            # carrying ref=T pos=1864 is a number taken from one numbering and a name from
            # another, and there is no way to tell which half was meant. Drop it rather than
            # verify one half and display the other.
            m = re.match(r"^([A-Z])(\d+)([A-Z*])$", label.strip().upper())
            if m and (m.group(1) != one_letter(v.get("ref")) or m.group(3) != one_letter(v.get("alt"))):
                rejected.append({"label": label,
                                 "why": "the name and the change given for it disagree"})
                continue
            # user_text carries a digit so the no-position guard does not fire: the position
            # here came from the enumeration, which is the thing being verified below.
            res, verr = protein_edit(v, cds, protein, 1 if hist else 0, label or "pos given")
            if verr or not res:
                rejected.append({"label": label or "?", "why": str(verr or "no edit")})
                continue
            e = dict(res["edits"][0])
            e["hgvs_p"] = res.get("hgvs_p")
            e["hgvs_c"] = res.get("hgvs_c")
            e["why"] = str(v.get("why") or "")
            edits.append(e)
        out["edits"] = edits
        out["rejected"] = rejected
        if edits:
            out["ok"] = True
            out["note"] = ("%d variant%s named for this context%s"
                           % (len(edits), "" if len(edits) == 1 else "s",
                              ("; %d dropped as not matching this transcript" % len(rejected))
                              if rejected else ""))
        else:
            out["error"] = ("no variant could be placed for \"%s\"%s"
                            % (text, ("; " + "; ".join("%s: %s" % (r["label"], r["why"])
                                                       for r in rejected[:3])) if rejected else ""))
elif not out["error"]:
    protein = translate(cds)
    works.msg("Reading the description…")
    spec, err = ask(text, ctx, protein, extra)
    if err:
        out["error"] = err
    else:
        level = str(spec.get("level") or "unknown").lower()
        out["level"] = level
        out["explanation"] = str(spec.get("explanation") or "")
        out["hgvs_p"] = spec.get("hgvs_p")
        out["hgvs_c"] = spec.get("hgvs_c")
        works.msg("Checking the change against this transcript…")
        if level == "protein":
            hist = is_histone(ctx, protein) and not wrote_explicit_hgvs(text)
            if hist:
                out["numbering"] = "histone (mature protein, Met1 not counted)"
            res, err = protein_edit(spec.get("protein") or {}, cds, protein, 1 if hist else 0, text)
        elif level == "cdna":
            res, err = cdna_edit(spec.get("cdna") or {}, cds)
        elif level in ("genomic", "rsid"):
            res, err = None, None
            out["genomic"] = spec.get("genomic")
            out["rsid"] = spec.get("rsid")
            out["ok"] = True
        else:
            # Nothing this transcript can be asked for: no residue, no codon, no coordinate.
            # That is the shape of "KRAS lung cancer", so mark it as the other question.
            res, err = None, VAGUE + (out["explanation"] or "the description could not be resolved for this gene")
        if err:
            # VAGUE means "no single change was named" -- a different question, not a bad
            # answer. Strip the marker from what the user reads and raise the flag instead.
            if err.startswith(VAGUE):
                err = err[len(VAGUE):]
                out["vague"] = True
            out["error"] = err
        elif res:
            out.update({k: v for k, v in res.items() if v is not None})
            note = str(spec.get("numbering_note") or "")
            if note and note not in out.get("note", ""):
                out["note"] = (out.get("note") + "; " + note).strip("; ")
            out["ok"] = True

works.resolve({k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in out.items()})

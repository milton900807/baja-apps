"""SLIM scan -- short linear motifs on a protein, and what a variant does to them.

Backend for baja/bio/protein/slim-motif-layer.js.

    param(1)  protein sequence       one-letter, the track's own translation
    param(2)  variants               comma separated, PROTEIN space, e.g.
                                     "R578C,S577A"; "" for none
    param(3)  min score              drop motifs below this (default 0.5);
                                     every gained and lost motif is kept
                                     whatever it scores
    param(4)  accession              UniProt acc, optional; only used to look
                                     up cached conservation

Resolves with motifs / gained / lost / meta, JSON-stringified in the house
style, plus `error`, always present and "" on success. Nothing here raises.

WHAT THIS IS AND IS NOT
A motif here is a REGEX MATCH from the ELM catalogue, re-ranked by slimrank.
A short pattern matches by chance: a 1300-residue protein carries roughly 500
matches and almost all of them are noise. The score orders candidates; it does
not establish that any one of them is real. That is why min score exists and
why meta.caveats travels with the numbers rather than living in a help page
the caller can skip.

THE GAINED-MOTIF SCORE IS AN UPPER BOUND, and the payload says so per motif.
Conservation and pLDDT are properties of the WILD-TYPE position. There is no
orthologue or structural evidence for a sequence that does not occur in
nature, so a gained motif inherits numbers earned by the residue that was
replaced. Treating a gained motif's rank as comparable to a wild-type one
flatters it.

DEGRADES RATHER THAN FAILS. With no trained model on the host the scan still
returns motifs, scored only by the ELM class prior, and meta.scoring says
"regex" instead of "model". A screen that shows a ranked list without noticing
the difference would be showing the user a ranking that is not one.
"""
import os
import re
import sys
import json

from ion import works


# The server spawns the system python3, which has neither sklearn nor joblib.
# Re-exec under the project virtualenv if this interpreter cannot import them.
def _reexec_under_venv():
    try:
        import numpy       # noqa: F401
        import pandas      # noqa: F401
        import sklearn     # noqa: F401
        import joblib      # noqa: F401
        return
    except Exception:
        pass
    if os.environ.get("SLIMRANK_REEXEC") == "1":
        return
    for py in (os.environ.get("SLIMRANK_PYTHON"),
               "/opt/baja-apps/venv/bin/python3",
               "/opt/venv/bin/python3"):
        if py and os.path.exists(py):
            env = dict(os.environ)
            env["SLIMRANK_REEXEC"] = "1"
            try:
                os.execve(py, [py] + sys.argv, env)
            except Exception:
                pass


_reexec_under_venv()

# Where the ELM tables and the trained model live on the host. Both are DATA,
# deployed beside the app rather than committed: the ELM tables carry their own
# licence terms, and the model is a build artefact.
HOME = os.environ.get("SLIMRANK_HOME", "/opt/baja-apps/data/slimrank")
PAD = 13                      # longest motif span either side of a variant


def _unq(s):
    """ELM ships quoted TSV: every field, the header row included, is wrapped in
    double quotes. A plain tab split leaves the quotes attached to the header
    keys, so every row lookup misses and the table parses to nothing. Strip one
    surrounding pair and unescape doubled quotes."""
    s = s.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1].replace('""', '"')
    return s


def _read_classes():
    """ELM classes as {name: (compiled regex, prior)}. Empty dict if absent."""
    path = os.path.join(HOME, "elm_classes.tsv")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as fh:
        header = None
        for line in fh:
            if line.startswith("#"):
                continue
            parts = [_unq(x) for x in line.rstrip("\n").split("\t")]
            if header is None:
                header = parts
                continue
            row = dict(zip(header, parts))
            name = row.get("ELMIdentifier")
            rx = row.get("Regex")
            if not name or not rx:
                continue
            try:
                prior = float(row.get("Probability") or 1e-3)
            except Exception:
                prior = 1e-3
            try:
                # (?=(...)) so overlapping instances are all found, not just the
                # leftmost non-overlapping ones. A protein's motifs overlap.
                out[name] = (re.compile("(?=(" + rx + "))"), prior)
            except re.error:
                continue
    return out


def _scan(seq, classes, lo=None, hi=None):
    """Every motif instance in seq, optionally only those touching [lo, hi]."""
    hits = []
    for name, (rx, prior) in classes.items():
        for m in rx.finditer(seq):
            s = m.start() + 1
            e = s + len(m.group(1)) - 1
            if lo is not None and (e < lo or s > hi):
                continue
            hits.append({"elm": name, "start": s, "end": e,
                         "peptide": seq[s - 1:e], "prior": prior})
    return hits


def _load_model():
    path = os.path.join(HOME, "model.joblib")
    if not os.path.exists(path):
        return None, None
    try:
        import joblib
        b = joblib.load(path)
        return b.get("model"), b.get("features")
    except Exception:
        return None, None


def _conservation(acc):
    """Cached per-residue conservation, or None. Never fetched here: a screen
    redraw must not wait on Ensembl, and a missing file is not an error."""
    if not acc:
        return None
    path = os.path.join(HOME, "cons", acc + ".npy")
    if not os.path.exists(path):
        return None
    try:
        import numpy as np
        a = np.load(path)
        return a if a.size > 1 else None
    except Exception:
        return None


def _featurize(hits, seq, cons, class_counts):
    import numpy as np
    import pandas as pd
    rows = []
    L = len(seq)
    for h in hits:
        a, b = h["start"], h["end"]
        idx = np.arange(a, b + 1)
        if cons is not None:
            mc = cons[idx[idx < len(cons)]]
            loq, hiq = max(1, a - 50), min(L, b + 50)
            bg = cons[np.arange(loq, min(hiq + 1, len(cons)))]
            with np.errstate(invalid="ignore"):
                cm = float(np.nanmean(mc)) if mc.size else np.nan
                cn = float(np.nanmin(mc)) if mc.size else np.nan
                cb = float(np.nanmean(bg)) if bg.size else np.nan
            ct = cm - cb if cm == cm and cb == cb else np.nan
        else:
            cm = cn = cb = ct = np.nan
        win = seq[max(0, a - 11):min(L, b + 10)]
        rows.append({
            "len": b - a + 1,
            "elm_prob_log": float(np.log10(max(h["prior"], 1e-12))),
            "cons_mean": cm, "cons_min": cn, "cons_bg": cb, "cons_contrast": ct,
            "plddt_mean": np.nan, "plddt_frac_low": np.nan,
            "idp_motif": np.nan, "idp_window": np.nan,
            "hyd_motif": np.nan, "entropy_window": np.nan,
            "rel_pos": a / float(max(L, 1)),
            "dist_term": min(a, L - b) / float(max(L, 1)),
            "class_n_annot_log": float(np.log10(1 + class_counts.get(h["elm"], 0))),
        })
    return pd.DataFrame(rows)


def _score(hits, seq, cons, model, feats):
    """Attach a score to every hit. Falls back to the class prior."""
    if not hits:
        return "none"
    if model is None or not feats:
        for h in hits:
            # Rarer pattern, higher rank. This is an ORDERING, not a probability,
            # and meta.scoring says so.
            h["score"] = 1.0 / (1.0 + h["prior"] * 1e5)
        return "regex"
    try:
        import numpy as np
        counts = {}
        path = os.path.join(HOME, "class_counts.json")
        if os.path.exists(path):
            with open(path) as fh:
                counts = json.load(fh)
        X = _featurize(hits, seq, cons, counts)
        missing = [c for c in feats if c not in X.columns]
        for c in missing:
            X[c] = np.nan
        p = model.predict_proba(X[feats])[:, 1]
        for h, v in zip(hits, p):
            h["score"] = float(v)
        return "model"
    except Exception:
        for h in hits:
            h["score"] = 1.0 / (1.0 + h["prior"] * 1e5)
        return "regex"


def _select(hits, cutoff):
    """Which motifs the track paints.

    The score is a RANK, not a probability: it orders candidates against each
    other and nothing more. A fixed magnitude therefore means nothing, and what
    it selects drifts with protein length, which is why 0.5 painted an empty
    track on a 1336 residue protein whose best candidate scores 0.05. A cutoff
    of 1 or more is read as a COUNT, the top N by score. Below 1 it is still
    honoured as a score threshold so an explicit magnitude still works.
    """
    if not hits:
        return [], "none", 0.0
    ranked = sorted(hits, key=lambda h: -h.get("score", 0.0))
    if cutoff >= 1:
        n = int(cutoff)
        keep = ranked[:n]
        rule = "top %d by score" % n
    else:
        keep = [h for h in ranked if h.get("score", 0.0) >= cutoff]
        rule = "score >= %g" % cutoff
    eff = keep[-1].get("score", 0.0) if keep else 0.0
    keep.sort(key=lambda h: (h["start"], h["end"], h["elm"]))
    return keep, rule, eff


MUT = re.compile(r"^([A-Z])(\d+)([A-Z])$")


def _apply(seq, spec):
    """('R578C') -> (mutated sequence, note) or (None, why not)."""
    m = MUT.match(spec.strip().upper())
    if not m:
        return None, "could not read '%s'; expected e.g. R578C" % spec
    wt, pos, mt = m.group(1), int(m.group(2)), m.group(3)
    if pos < 1 or pos > len(seq):
        return None, "%s is outside this protein (%d residues)" % (spec, len(seq))
    if seq[pos - 1] != wt:
        # Numbering mismatches between UniProt and a track's own translation are
        # common and silent. Refusing is the only safe answer: applying it anyway
        # would paint a motif at a position the user did not mean.
        return None, ("%s: this protein has %s at %d, not %s"
                      % (spec, seq[pos - 1], pos, wt))
    return seq[:pos - 1] + mt + seq[pos:], None


protein = (works.param(1) or "").strip().upper()
variants = [v for v in (works.param(2) or "").replace(";", ",").split(",") if v.strip()]
try:
    min_score = float(works.param(3) or 30)
except Exception:
    min_score = 30
acc = (works.param(4) or "").strip()

err = ""
payload = None
try:
    protein = re.sub(r"[^A-Z]", "", protein)
    if len(protein) < 10:
        raise ValueError("no protein sequence (got %d residues)" % len(protein))
    works.progress(5)
    classes = _read_classes()
    if not classes:
        raise ValueError("ELM tables at %s parsed to zero classes" % HOME)
    works.msg("%d motif classes" % len(classes))

    works.progress(20)
    model, feats = _load_model()
    cons = _conservation(acc)
    wt_hits = _scan(protein, classes)
    scoring = _score(wt_hits, protein, cons, model, feats)
    works.progress(55)
    works.msg("%d candidate motif instances" % len(wt_hits))

    def key(h):
        return (h["elm"], h["start"], h["end"])

    wt_keys = {key(h) for h in wt_hits}
    gained, lost, notes = [], [], []
    for spec in variants:
        mseq, why = _apply(protein, spec)
        if mseq is None:
            notes.append(why)
            continue
        m = MUT.match(spec.strip().upper())
        pos = int(m.group(2))
        lo, hi = max(1, pos - PAD), min(len(protein), pos + PAD)
        # Only the window around the variant can change, so only it is rescanned.
        wt_local = {key(h) for h in _scan(protein, classes, lo, hi)}
        mu_local = _scan(mseq, classes, lo, hi)
        mu_keys = {key(h) for h in mu_local}
        g = [h for h in mu_local if key(h) not in wt_local]
        _score(g, mseq, cons, model, feats)
        for h in g:
            h["variant"] = spec
            # The one number on this record that is not what it looks like.
            h["score_is_upper_bound"] = True
        gained.extend(g)
        l = [h for h in wt_hits if key(h) in (wt_local - mu_keys)]
        for h in l:
            h["variant"] = spec
        lost.extend(l)

    works.progress(85)
    shown, cutoff_rule, cutoff_eff = _select(wt_hits, min_score)
    # Rank by score, then hand them back in positional order so the layer
    # draws left to right. list.index() is O(n^2) and mis-ranks two hits
    # that compare equal.
    for i, h in enumerate(sorted(shown, key=lambda h: -h.get("score", 0))):
        h["rank"] = i + 1
    # A motif the variant DESTROYS has to appear in the wild-type lane whatever
    # its rank. Without this the track showed a loss against a list that never
    # held it: the two motifs R578C destroys score 0.0465 and 0.0148, both below
    # a top-30 cutoff, so the before/after read as pure addition. These are not
    # selected candidates and carry no rank; they are the "before" of a claim
    # the variant layers are already making.
    _shown_keys = {key(h) for h in shown}
    n_below_cutoff = 0
    for _h in lost:
        if key(_h) in _shown_keys:
            continue
        _c = dict(_h)
        _c.pop("variant", None)
        _c["below_cutoff"] = True
        shown.append(_c)
        _shown_keys.add(key(_h))
        n_below_cutoff += 1
    shown.sort(key=lambda h: (h["start"], h["end"], h["elm"]))

    caveats = [
        "A motif is a regex match from the ELM catalogue. A protein of this "
        "length carries hundreds of them and most are not functional.",
        "The score orders candidates against each other. It is not a "
        "probability that a motif is real.",
    ]
    if n_below_cutoff:
        caveats.append(
            "%d motif(s) shown in the wild type rank BELOW the display cutoff and "
            "are included only because the variant destroys them. The cutoff keeps "
            "the top candidates; it is not a claim that what falls below it is absent."
            % n_below_cutoff)
    if scoring == "regex":
        caveats.insert(0, "NO TRAINED MODEL ON THIS HOST: motifs are ordered by "
                          "the rarity of their pattern alone, which is a weak "
                          "ordering, not a ranking.")
    if cons is None:
        caveats.append("No cached conservation for this protein, so the "
                       "conservation features are absent and the ranking rests "
                       "on sequence and class alone.")
    if gained:
        caveats.append("A gained motif's score is an UPPER BOUND: conservation "
                       "is a property of the wild-type residue and is inherited "
                       "by the substitution that replaced it.")
    for n in notes:
        caveats.append("Variant skipped -- " + n)

    payload = {
        "n": len(wt_hits), "n_shown": len(shown),
        "motifs": shown, "gained": gained, "lost": lost,
        "meta": {"scoring": scoring, "classes": len(classes),
                 "length": len(protein), "min_score": min_score, "cutoff_rule": cutoff_rule, "cutoff_score": cutoff_eff, "n_below_cutoff": n_below_cutoff,
                 "conservation": bool(cons is not None),
                 "accession": acc, "variants": variants,
                 "caveats": caveats},
    }
    works.progress(100)
    works.msg("%d shown, %d gained, %d lost"
              % (len(shown), len(gained), len(lost)))
except Exception as e:
    err = "%s: %s" % (type(e).__name__, e)
    works.msg("SLIM scan failed: " + err)

if payload is None:
    works.resolve({"n": 0, "n_shown": 0, "motifs": json.dumps([]),
                   "gained": json.dumps([]), "lost": json.dumps([]),
                   "meta": json.dumps({"caveats": []}),
                   "error": err or "no result"})
else:
    works.resolve({
        "n": payload["n"], "n_shown": payload["n_shown"],
        "motifs": json.dumps(payload["motifs"]),
        "gained": json.dumps(payload["gained"]),
        "lost": json.dumps(payload["lost"]),
        "meta": json.dumps(payload["meta"]),
        "error": err,
    })

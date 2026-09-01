"""Intron-retention propensity for a gene, via bajair + the bajasplice adapter.

Scores every intron of a gene for how retention-prone it is from SEQUENCE ALONE —
no reads, no expression — and returns the ones that clear the requested tier so
the client can draw them as track layers.

The splice-site features bajair needs (five frozen ss_ctx2000 scores) are not
computed here: bajair stays free of torch and gets them from bajasplice through
bajasplice/bajair.py, which is what score_gene() wraps.

Params (after the EngineMonitor at param(0)):
    param(1) : gene symbol (e.g. 'UNC13A')
    param(2) : tier ('notable' default) — the bar an intron must clear
    param(3) : limit (0 = no cap)
    param(4) : transcript id, optional — restrict to one transcript

Resolves { hits, n, gene, tier, error } where `hits` is a JSON array of
{ chrom, start, end, strand, gene, transcript, intron_number, n_introns,
  length, gc, ss_donor, ss_acceptor, score, tier, text }.

An EMPTY list is the normal, correct answer for most genes — a retention track is
sparse by nature, and hits() deliberately returns nothing when no intron clears
the bar. The client must not treat that as an error.
"""
import os
import sys
import json

from ion import works


# The server spawns the system python3, which has neither torch nor bajasplice.
# Re-exec under the project virtualenv if this interpreter can't import them.
# Same shape as py/bio/splice/splicing-profile.py.
def _reexec_under_venv():
    try:
        import torch        # noqa: F401
        import bajasplice   # noqa: F401
        import bajair       # noqa: F401
        return
    except Exception:
        pass
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               "/opt/venv/bin/python3",
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3")):
        if py and os.path.exists(py) and \
                os.path.realpath(py) != os.path.realpath(sys.executable):
            os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])
    # No venv found — let the import below raise a clear error.


_reexec_under_venv()

# Importable even when not pip-installed in this interpreter.
for _lib in ("~/baja-apps/py/bajasplice-lib", "~/baja-apps/py/bajair-lib"):
    _p = os.path.expanduser(_lib)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)


gene = str(works.param(1) or "").strip()
tier = (str(works.param(2) or "notable").strip().lower() or "notable")
try:
    limit = int(float(works.param(3) or 0))
except Exception:
    limit = 0
transcript = str(works.param(4) or "").strip() or None

if not gene:
    works.resolve({"error": "no gene given", "hits": json.dumps([]), "n": "0"})
    sys.exit(0)

try:
    from bajasplice.bajair import score_gene, available

    # available() reports whether the splice-site checkpoint bajair depends on is
    # actually present. Checking it first turns a missing-model deployment into a
    # clear message instead of a stack trace from deep inside the adapter.
    try:
        ok = bool(available())
    except Exception:
        ok = True          # older adapter without the probe — try anyway
    if not ok:
        works.resolve({
            "error": "The splice-site model bajair depends on is not available on this server.",
            "hits": json.dumps([]), "n": "0", "gene": gene, "tier": tier,
        })
        sys.exit(0)

    rows = score_gene(gene, tier=tier, limit=limit, transcript=transcript) or []

    # Keep only JSON-safe scalars; describe() adds text fields whose types vary.
    clean = []
    for r in rows:
        row = {}
        for k, v in dict(r).items():
            if isinstance(v, (str, int, float, bool)) or v is None:
                row[k] = v
            else:
                row[k] = str(v)
        clean.append(row)

    works.resolve({
        "hits": json.dumps(clean),
        "n": str(len(clean)),
        "gene": gene,
        "tier": tier,
        "error": None,
    })
except Exception as e:
    works.resolve({
        "error": str(e), "hits": json.dumps([]), "n": "0",
        "gene": gene, "tier": tier,
    })

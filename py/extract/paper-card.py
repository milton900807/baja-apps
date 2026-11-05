"""A paper's title, authors and institution, read off the PDF itself.

For the literature list on a campaign: somebody adds a PDF, and the entry that appears
beside it should say what the paper is without them typing it in.

THE PDF GOES TO THE MODEL WHOLE, rather than being parsed here first. There is no PDF
library on this server -- no fitz, no pypdf, no pdftotext -- and the Messages API reads
a PDF natively, so a text-extraction step would be a dependency to install for a worse
answer: an affiliation is a superscript tied to a name by POSITION, and flattening the
page to text is exactly where that mapping is lost.

Only the front matter is wanted, so the model is asked for a few fields and a couple of
sentences rather than a reading of the paper.

Params (after the EngineMonitor):
    param(1) : path to the stored upload -- the JSON wrapper the console writes, holding
               { dataUri } with the PDF base64 inside it, or a bare .pdf on disk. It must
               resolve inside the server's user-data root; anything else is refused.
    param(2) : optional user-data root (default the BAJA_USERDATA env var, else
               ~/baja-users), which is the only directory a path may point into.

Resolves:
    { ok, title, authors, institution, year, journal, doi, summary, error }
  authors is a JSON array of names, institution a single line naming the lead
  institution (and 'and others' where there are several), summary two or three
  sentences saying what the paper found.
"""
import base64
import json
import os
import re

import requests

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5-5"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# 32MB is the request ceiling and base64 inflates by about a third, so this is the point
# past which the call cannot be made rather than a preference.
MAX_PDF_BYTES = 20 * 1024 * 1024

SYSTEM = (
    "You read the front matter of a scientific paper and return what a reader needs to "
    "identify it. Return ONE JSON object and nothing else, with these keys:\n"
    '  title        the paper\'s title, as printed\n'
    '  authors      an array of author names in the order printed; [] if none are shown\n'
    '  institution  the lead author\'s institution, one line. Where authors are split '
    'across several, name the first and add " and others". "" if none is shown.\n'
    '  year         publication year as a string, or ""\n'
    '  journal      the journal or preprint server, or ""\n'
    '  doi          the DOI if one is printed, or ""\n'
    '  summary      two or three sentences on what the paper did and found\n'
    "\n"
    "Read these off the document. Do not infer an institution from an author's name, do "
    "not complete a half-printed DOI from memory, and where a field is not on the page "
    "return an empty string rather than a guess -- a citation that is nearly right is "
    "worse than one that is visibly incomplete. If the file is not a paper (a slide "
    "deck, a form, a scan of something else), say so in summary and leave the rest empty."
)


def fail(out, msg):
    out["error"] = msg
    works.resolve(out)
    raise SystemExit(0)


out = {"ok": False, "title": "", "authors": "[]", "institution": "", "year": "",
       "journal": "", "doi": "", "summary": "", "cached": False, "error": None}

CARD_KEYS = ("title", "authors", "institution", "year", "journal", "doi", "summary")

raw_path = ("" + (works.param(1) or "")).strip()
root = ("" + (works.param(2) or "")).strip() \
    or os.environ.get("BAJA_USERDATA") \
    or os.path.join(os.path.expanduser("~"), "baja-users")

if not raw_path:
    fail(out, "no file was given")
if not ANTHROPIC_API_KEY:
    fail(out, "ANTHROPIC_API_KEY is not set on the server")

# INSIDE THE USER-DATA ROOT, AND NOWHERE ELSE. The path arrives from a browser, so it is
# a request rather than a fact: resolve it, then check where it landed.
root_abs = os.path.realpath(root)
target = os.path.realpath(raw_path if os.path.isabs(raw_path) else os.path.join(root_abs, raw_path))
if target != root_abs and not target.startswith(root_abs + os.sep):
    fail(out, "that file is outside the user data directory")
if not os.path.isfile(target):
    fail(out, "that file is not there")

# READ ONCE, EVER. The card is written beside the upload, and a later ask is answered from
# it without going near the model.
#
# This is not a speed optimisation. The route that runs this script answers callers who are
# not signed in, and a campaign's display is a public page: without the card on disk, every
# visit to a campaign with ten papers would be ten PDFs read at the owner's expense, and
# anyone who wanted to could ask for the same paper in a loop. With it, a given PDF costs
# one reading however many times it is asked for.
card_path = target + ".card.json"
try:
    if os.path.isfile(card_path) and os.path.getmtime(card_path) >= os.path.getmtime(target):
        with open(card_path, "r", encoding="utf-8") as fh:
            saved = json.load(fh)
        if isinstance(saved, dict) and saved.get("title") is not None:
            for key in CARD_KEYS:
                out[key] = saved.get(key, out[key])
            out["ok"] = True
            out["cached"] = True
            works.msg("already read")
            works.resolve(out)
            raise SystemExit(0)
except SystemExit:
    raise
except Exception:
    pass    # an unreadable card is a card to write again, not an error to report

# The console stores an upload as JSON carrying a data URI; a plain .pdf is read as it is.
try:
    with open(target, "rb") as fh:
        blob = fh.read()
except Exception as exc:
    fail(out, "could not read the file: %s" % exc)

pdf_bytes = None
if blob[:5] == b"%PDF-":
    pdf_bytes = blob
else:
    try:
        wrapper = json.loads(blob.decode("utf-8", "replace"))
        uri = "" + (wrapper.get("dataUri") or "")
        b64 = uri.split(",", 1)[1] if "," in uri else uri
        pdf_bytes = base64.b64decode(b64)
    except Exception:
        pdf_bytes = None
if not pdf_bytes or pdf_bytes[:5] != b"%PDF-":
    fail(out, "that file is not a PDF")
if len(pdf_bytes) > MAX_PDF_BYTES:
    fail(out, "that PDF is %.1fMB; the limit is %dMB"
         % (len(pdf_bytes) / 1048576.0, MAX_PDF_BYTES // 1048576))

works.msg("Reading the paper…")

try:
    reply = requests.post(
        ANTHROPIC_URL,
        headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json={
            "model": ANTHROPIC_MODEL,
            "max_tokens": 1500,
            "system": SYSTEM,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "document", "source": {
                        "type": "base64", "media_type": "application/pdf",
                        "data": base64.standard_b64encode(pdf_bytes).decode("ascii"),
                    }},
                    {"type": "text", "text": "The front matter of this paper, as JSON."},
                ],
            }],
        },
        timeout=180,
    )
except Exception as exc:
    fail(out, "could not reach the model: %s" % exc)

if reply.status_code != 200:
    fail(out, "anthropic %s: %s" % (reply.status_code, reply.text[:300]))

data = reply.json()
# A refusal is an HTTP 200 with nothing usable in it, so it is checked before the content.
if data.get("stop_reason") == "refusal":
    fail(out, "the model declined to read that file")

text = "".join(b.get("text", "") for b in (data.get("content") or [])
               if b.get("type") == "text")
match = re.search(r"\{.*\}", text, re.S)
try:
    card = json.loads(match.group(0)) if match else None
except Exception:
    card = None
if not isinstance(card, dict):
    fail(out, "could not read the reply: %s" % (text[:200] or "empty"))


def one_line(value, limit):
    return re.sub(r"\s+", " ", "" + (value or "")).strip()[:limit]


authors = card.get("authors")
authors = [one_line(a, 120) for a in authors if one_line(a, 120)] if isinstance(authors, list) else []
out["title"] = one_line(card.get("title"), 300)
out["authors"] = json.dumps(authors[:60])
out["institution"] = one_line(card.get("institution"), 200)
out["year"] = one_line(card.get("year"), 8)
out["journal"] = one_line(card.get("journal"), 160)
out["doi"] = one_line(card.get("doi"), 120)
out["summary"] = one_line(card.get("summary"), 900)
out["ok"] = True

# Beside the upload, so the next ask is free. A card that cannot be written is not worth
# failing over -- the reading is already done and the caller is holding it.
try:
    with open(card_path, "w", encoding="utf-8") as fh:
        json.dump({k: out[k] for k in CARD_KEYS}, fh)
except Exception:
    pass

works.msg(out["title"] or "read")

works.resolve(out)

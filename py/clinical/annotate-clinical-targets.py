#!/usr/bin/env python3
"""
annotate-clinical-targets.py — find the gene target of every compound in the clinical
library by exact-matching its sequence against the human pre-mRNA and cDNA indexes, and
write the result back into the manifest so the library card can show it.

    python3 annotate-clinical-targets.py [--manifest PATH] [--host URL] [--dry-run]

Search: POST {host}/off-targets-file with editDistance 0 and strand "+-", against
human_premrna + human_cdna_all. Edit distance 0 means only an exact complementary site
counts, so a symbol that comes back IS the compound's target rather than an off-target.

Which index a hit came from is read off the accession in the hit's `chr` field:
ENSG... = pre-mRNA (gene), ENST... = cDNA (transcript).

Sequences need normalizing first: the manifest stores RNA (U), splits multi-strand
compounds on "|", and carries overhang/placeholder characters (e.g. the trailing X on a
siRNA passenger strand). Each strand is searched separately and the symbols unioned, so a
duplex whose guide matches is annotated even when the passenger strand does not.

Fields written per compound (existing target_gene is never overwritten):
    target_gene        top symbol, if the manifest had none
    target_symbols     every distinct symbol found
    target_evidence    {edit_distance, datasets, premrna_hits, cdna_hits, total_hits, strands_matched}
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "..", "data", "clinical", "manifest.json")
DEFAULT_HOST = "https://oligodesigner.com"
GENOMES = ["human_premrna", "human_cdna_all"]
MIN_LEN = 15          # below this a match is not specific enough to call a target
TIMEOUT = 300
RETRIES = 3


def normalize_strands(raw):
    """Manifest sequence -> list of searchable DNA strands."""
    out = []
    for part in str(raw or "").split("|"):
        p = re.sub(r"[^ACGT]", "", part.strip().upper().replace("U", "T"))
        if len(p) >= MIN_LEN:
            out.append(p)
    return out


def search(host, sequences):
    body = json.dumps({
        "editDistance": 0,
        "strand": "+-",
        "genomes": GENOMES,
        "sequences": sequences,
        "runMode": "editdistance",
    }).encode()
    req = urllib.request.Request(host.rstrip("/") + "/off-targets-file", body,
                                 {"Content-Type": "application/json"})
    last = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)
        except Exception as e:            # transient server/network error — back off
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("search failed after %d attempts: %s" % (RETRIES, last))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=os.path.normpath(DEFAULT_MANIFEST))
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="only process the first N compounds")
    args = ap.parse_args()

    with open(args.manifest) as f:
        compounds = json.load(f)

    todo = compounds[: args.limit] if args.limit else compounds
    found = missing = errored = 0

    for i, c in enumerate(todo, 1):
        cid = c.get("compound_id") or c.get("name") or ("#%d" % i)
        strands = normalize_strands(c.get("sequence_5to3"))
        if not strands:
            missing += 1
            print("%3d/%d  %-24s no usable sequence" % (i, len(todo), cid), flush=True)
            continue

        try:
            res = search(args.host, strands)
        except Exception as e:
            errored += 1
            print("%3d/%d  %-24s ERROR %s" % (i, len(todo), cid, e), flush=True)
            continue

        symbols, premrna, cdna, matched = [], 0, 0, 0
        transcripts, gene_ids = [], []      # accessions that actually carry the binding site
        for q in (res.get("oligoQuery") or []):
            hits = q.get("offtarget") or []
            if hits:
                matched += 1
            for h in hits:
                sym = (h or {}).get("symbol")
                if sym and sym not in symbols:
                    symbols.append(sym)
                # Accessions come back versioned (ENST00000237014.8); /transcript wants the
                # bare stable id.
                acc = str((h or {}).get("chr") or "").split(".")[0]
                if acc.startswith("ENSG"):
                    premrna += 1
                    if acc not in gene_ids:
                        gene_ids.append(acc)
                elif acc.startswith("ENST"):
                    cdna += 1
                    if acc not in transcripts:
                        transcripts.append(acc)

        if symbols:
            found += 1
            c["target_symbols"] = symbols
            # The transcript to LOAD. Taking it straight from the hit means the loaded
            # transcript is one that provably carries the binding site, and removes the
            # per-click symbol -> transcript LLM round trip (prompt-to-transcript.py) that
            # the realtime path would otherwise make.
            c["target_transcripts"] = transcripts
            c["target_gene_ids"] = gene_ids
            if transcripts:
                c["target_transcript"] = transcripts[0]
            elif gene_ids:
                # pre-mRNA-only hit: the gene id is the only accession carrying the site
                c["target_transcript"] = gene_ids[0]
            c["target_evidence"] = {
                "edit_distance": 0,
                "datasets": GENOMES,
                "premrna_hits": premrna,
                "cdna_hits": cdna,
                "total_hits": premrna + cdna,
                "strands_matched": matched,
            }
            # Never overwrite a curated target_gene — only fill a blank one.
            if not str(c.get("target_gene") or "").strip():
                c["target_gene"] = symbols[0]
            print("%3d/%d  %-24s %-22s premrna=%-4d cdna=%-4d %s" %
                  (i, len(todo), cid, ",".join(symbols[:3]), premrna, cdna,
                   c.get("target_transcript", "-")), flush=True)
        else:
            missing += 1
            print("%3d/%d  %-24s no exact target" % (i, len(todo), cid), flush=True)

    print("\ntargets found: %d   no match: %d   errors: %d   of %d"
          % (found, missing, errored, len(todo)), flush=True)

    if args.dry_run:
        print("dry run — manifest not written", flush=True)
        return 0

    backup = args.manifest + ".bak"
    shutil.copy2(args.manifest, backup)
    with open(args.manifest, "w") as f:
        json.dump(compounds, f, indent=2)
        f.write("\n")
    print("wrote %s (backup: %s)" % (args.manifest, backup), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
verify-target-transcripts.py — guarantee every clinical-library target can be loaded from
LOCAL reference data, so clicking a compound never depends on a realtime lookup.

    python3 verify-target-transcripts.py [--manifest PATH] [--host URL] [--dry-run]

Run this after annotate-clinical-targets.py. Three passes:

  1. RESOLVE  Compounds whose only accession is a gene id (a pre-mRNA-only hit, i.e. an
              intronic site no cDNA transcript carries) get a real transcript via
              {host}/gene-lookup?field=Gene stable ID, preferring the Ensembl Canonical
              row. Looking up by GENE ID rather than symbol matters: the symbol index is
              fuzzy and matches synonyms (key=TTR returns TDP2, whose synonym is TTRAP).

  2. VERIFY   GET {host}/transcript/<id> for each target and confirm it comes back with a
              non-empty sequence from a LOCAL source. The payload reports sequenceSource
              and annotationSource; anything sourced from 'ensembl' is a live remote call
              that can fail or rate-limit at click time, and is reported as such.

  3. CONFIRM  Check the compound's binding site is actually present in the returned
              sequence. /transcript serves the UNSPLICED pre-mRNA, so intronic sites do
              resolve here even though they are absent from the cDNA index.

Writes data/clinical/target-transcripts.json — the local index the loader consults — and
back-fills target_transcript on each compound in the manifest.
"""

import argparse
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MANIFEST = os.path.normpath(os.path.join(HERE, "..", "..", "data", "clinical", "manifest.json"))
DEFAULT_INDEX = os.path.normpath(os.path.join(HERE, "..", "..", "data", "clinical", "target-transcripts.json"))
DEFAULT_HOST = "https://oligodesigner.com"
TIMEOUT = 180
REMOTE_SOURCES = ("ensembl", "none", "", None)
MAX_MISMATCH = 4        # how far to widen the search when the exact site is not on this isoform


def get_json(url):
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        return json.load(r)


def to_dna(s):
    return re.sub(r"[^ACGT]", "", str(s or "").upper().replace("U", "T"))


def rev_comp(s):
    m = {"A": "T", "T": "A", "G": "C", "C": "G"}
    return "".join(m.get(b, "N") for b in reversed(to_dna(s)))


def fuzzy_find(seq, pat, max_mm):
    """Best Hamming match of pat in seq within max_mm mismatches -> (offset, mismatches).

    Pigeonhole seeding: split the pattern into max_mm+1 chunks — any match with at most
    max_mm mismatches must contain at least one chunk intact — then verify each candidate
    the chunk anchors. That keeps the scan at C-level str.find instead of walking a
    500 kb pre-mRNA base by base in Python.
    """
    L = len(pat)
    if L == 0 or len(seq) < L:
        return (-1, max_mm + 1)
    parts = max_mm + 1
    step = max(1, L // parts)
    best_i, best_mm = -1, max_mm + 1
    for p in range(parts):
        s0 = p * step
        e0 = L if p == parts - 1 else (p + 1) * step
        seed = pat[s0:e0]
        if not seed:
            continue
        start = 0
        while True:
            j = seq.find(seed, start)
            if j < 0:
                break
            i = j - s0
            if 0 <= i <= len(seq) - L:
                mm = 0
                for k in range(L):
                    if seq[i + k] != pat[k]:
                        mm += 1
                        if mm > max_mm:
                            break
                if mm <= max_mm and mm < best_mm:
                    best_i, best_mm = i, mm
                    if mm == 0:
                        return (best_i, 0)
            start = j + 1
    return (best_i, best_mm)


def strands(raw):
    out = []
    for part in str(raw or "").split("|"):
        p = to_dna(part)
        if len(p) >= 15:
            out.append(p)
    return out


def canonical_transcript(host, gene_id):
    """Gene id -> its Ensembl Canonical transcript, from the server's local gene table."""
    url = host.rstrip("/") + "/gene-lookup?" + urllib.parse.urlencode(
        {"key": gene_id, "field": "Gene stable ID"})
    try:
        rows = get_json(url)
    except Exception:
        return None
    if not isinstance(rows, list) or not rows:
        return None
    # Prefer the canonical row, then a MANE Select match, then whatever came back first.
    for want in ("Ensembl Canonical", "RefSeq match transcript (MANE Select)"):
        for r in rows:
            if str(r.get(want) or "").strip():
                t = str(r.get("Transcript stable ID") or "").strip()
                if t:
                    return t
    t = str(rows[0].get("Transcript stable ID") or "").strip()
    return t or None


def gene_transcripts(host, gene_id, limit=8):
    """Every transcript of a gene, longest genomic span first.

    A pre-mRNA index hit is keyed by GENE and its offset is relative to the gene's full
    span, but gene-lookup returns only the CANONICAL transcript — whose span can stop short
    of the site. C9orf72/tadnersen is exactly that: the site sits ~307 nt from the gene's 5'
    end (minus strand, so genomic ~27,573,588) while canonical ENST00000380003 ends at
    27,573,481, 107 nt short. Longest-span-first because a wider transcript is more likely
    to reach the site.
    """
    url = host.rstrip("/") + "/ensembl/lookup/" + urllib.parse.quote(gene_id) + "?expand=1"
    try:
        d = get_json(url)
    except Exception:
        return []
    ts = d.get("Transcript") or []
    rows = []
    for t in ts:
        tid = str(t.get("id") or "").strip()
        if not tid:
            continue
        try:
            span = int(t.get("end", 0)) - int(t.get("start", 0))
        except Exception:
            span = 0
        rows.append((span, tid))
    rows.sort(reverse=True)
    return [tid for _, tid in rows[:limit]]


def fetch_cdna(host, tid):
    """Spliced cDNA for a transcript, as raw text.

    /transcript always prefers the UNSPLICED pre-mRNA and has no override, so a site that
    spans an exon junction exists in the cDNA index but not in what that endpoint serves.
    This is the spliced form, and its coordinates match the cDNA index exactly.
    """
    url = host.rstrip("/") + "/api/ensembl/sequence/" + urllib.parse.quote(tid)
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
            return to_dna(r.read().decode("utf-8", "replace"))
    except Exception:
        return ""


def fetch_transcript(host, tid):
    url = host.rstrip("/") + "/transcript/" + urllib.parse.quote(tid)
    try:
        return get_json(url)
    except Exception as e:
        return {"error": str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST)
    ap.add_argument("--index", default=DEFAULT_INDEX)
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.manifest) as f:
        compounds = json.load(f)

    index = {}
    ok = remote = empty = nosite = skipped = 0

    for i, c in enumerate(compounds, 1):
        gene = str(c.get("target_gene") or "").strip()
        tid = str(c.get("target_transcript") or "").strip()
        if not gene or not tid:
            skipped += 1
            continue

        # Candidate isoforms, best-first. EVERY transcript that carried the site is a
        # candidate, not just the first: the site frequently sits on a non-canonical isoform,
        # and picking the wrong one is what leaves a compound unplaceable. Gene-only
        # accessions contribute their canonical transcript (gene-lookup returns one row).
        resolved_from = None
        candidates = []
        for t0 in (c.get("target_transcripts") or []):
            if t0 and t0 not in candidates:
                candidates.append(t0)
        for gid in (c.get("target_gene_ids") or []):
            ct = canonical_transcript(args.host, gid)
            if ct and ct not in candidates:
                candidates.append(ct)
                if not resolved_from:
                    resolved_from = gid
            # The canonical transcript may not span the site — add the gene's other
            # transcripts behind it so the candidate loop can find one that does.
            for t2 in gene_transcripts(args.host, gid):
                if t2 not in candidates:
                    candidates.append(t2)
            if not resolved_from:
                resolved_from = gid
        if tid and tid not in candidates:
            candidates.append(tid)
        if not candidates:
            print("%3d  %-22s %-16s NO CANDIDATE TRANSCRIPT" % (i, c.get("compound_id"), tid), flush=True)
            empty += 1
            continue

        def load(tid):
            cached = index.get(tid)
            if cached is not None:
                return cached
            p = fetch_transcript(args.host, tid)
            seq = to_dna(p.get("sequence") or "")
            cached = {
                "transcript": tid,
                "gene": gene,
                "sequence_length": len(seq),
                "annotations": len(p.get("annotations") or []),
                "sequence_source": p.get("sequenceSource"),
                "annotation_source": p.get("annotationSource"),
                "local": bool(seq) and p.get("sequenceSource") not in REMOTE_SOURCES
                         and p.get("annotationSource") not in REMOTE_SOURCES,
                "__seq": seq,          # dropped before writing
            }
            index[tid] = cached
            return cached

        pats = []
        for st in strands(c.get("sequence_5to3")):
            pats.extend([rev_comp(st), st])
        pats = [x for x in pats if x]

        # Pass 1: the first candidate whose SERVED sequence carries the site exactly.
        chosen = None
        for cand in candidates:
            cc = load(cand)
            if not cc["__seq"] or not cc["local"]:
                continue
            for pat in pats:
                k = cc["__seq"].find(pat)
                if k >= 0:
                    chosen = (cand, cc, k, 0)
                    break
            if chosen:
                break
        # Pass 2: nothing exact anywhere — take the closest fuzzy match across candidates.
        if not chosen:
            best = None
            for cand in candidates:
                cc = load(cand)
                if not cc["__seq"] or not cc["local"]:
                    continue
                for mm_budget in range(1, MAX_MISMATCH + 1):
                    for pat in pats:
                        i2, mm = fuzzy_find(cc["__seq"], pat, mm_budget)
                        if i2 >= 0 and (best is None or mm < best[3]):
                            best = (cand, cc, i2, mm)
                    if best and best[3] <= mm_budget:
                        break
            chosen = best
        # Pass 2b: still nothing — try the SPLICED cDNA of each candidate. A junction-spanning
        # site (pelacarsen/LPA) exists only in the spliced form, never in the pre-mRNA that
        # /transcript serves, so no isoform or mismatch budget can find it there.
        if not chosen or chosen[3] > 0:
            for cand in candidates:
                cdna = fetch_cdna(args.host, cand)
                if not cdna:
                    continue
                for pat in pats:
                    k = cdna.find(pat)
                    if k >= 0:
                        cc = load(cand)
                        cc = dict(cc)
                        cc["__seq"] = cdna
                        cc["sequence_length"] = len(cdna)
                        cc["form"] = "cdna"
                        chosen = (cand, cc, k, 0)
                        break
                if chosen and chosen[3] == 0 and chosen[1].get("form") == "cdna":
                    break

        # Pass 3: no local candidate worked at all — keep the first for reporting.
        if not chosen:
            cand = candidates[0]
            chosen = (cand, load(cand), -1, -1)

        tid, cached, site, site_mm = chosen
        seq = cached["__seq"]
        status = "OK"
        if not seq:
            empty += 1
            status = "EMPTY"
        elif not cached["local"]:
            remote += 1
            status = "REMOTE(%s/%s)" % (cached["sequence_source"], cached["annotation_source"])
        else:
            if site < 0:
                nosite += 1
                status = "NO SITE (>%d mm, %d isoform%s tried)" % (MAX_MISMATCH, len(candidates), "" if len(candidates) == 1 else "s")
            else:
                ok += 1
                c["target_site"] = site
                c["target_site_mismatches"] = site_mm
                # 'cdna' tells the loader to build the track from the SPLICED sequence
                # rather than the pre-mRNA /transcript would otherwise serve.
                c["target_form"] = cached.get("form") or "premrna"
                if cached.get("form") == "cdna":
                    status = "OK (spliced cDNA)"
                if site_mm:
                    status = "OK (%d mm)" % site_mm

        c["target_transcript"] = tid
        if resolved_from:
            c["target_transcript_from_gene"] = resolved_from
        c["target_local"] = bool(cached["local"] and seq)

        print("%3d  %-22s %-9s %-16s len=%-8d ann=%-4d %s" %
              (i, c.get("compound_id"), gene, tid, cached["sequence_length"],
               cached["annotations"], status), flush=True)

    for v in index.values():
        v.pop("__seq", None)

    print("\nloadable locally: %d   remote-sourced: %d   empty: %d   site not found: %d   no target: %d"
          % (ok, remote, empty, nosite, skipped), flush=True)

    if args.dry_run:
        print("dry run — nothing written", flush=True)
        return 0

    if os.path.exists(args.manifest):
        shutil.copy2(args.manifest, args.manifest + ".bak")
    with open(args.manifest, "w") as f:
        json.dump(compounds, f, indent=2)
        f.write("\n")
    with open(args.index, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print("wrote %s\nwrote %s" % (args.manifest, args.index), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

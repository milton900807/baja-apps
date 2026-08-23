"""Scan sequence for splice sites, and rank cryptic candidates in a gene.

The chunking here has a sharp edge that caused a real bug: a minus-strand
window is read reverse-complemented, so within each chunk the model's output
index j corresponds to genomic offset off + L - 1 - j. Reversing the whole
track once at the end looks equivalent but is not, because it also reverses the
order of the chunks. `chunk_offsets` isolates that mapping so it can be tested.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from bajasplice.config import paths
from bajasplice.genome import GenomeReader, one_hot
from bajasplice.models import SpliceNet

_LAST_INDEX = {"slim": None, "path": None}

__all__ = ["chunk_offsets", "resolve_checkpoint", "load_splicenet", "scan_region", "scan_gene",
           "gene_span", "rank_candidates"]


def chunk_offsets(off: int, length: int, strand: str) -> np.ndarray:
    """Genomic offsets for each model output index within one chunk."""
    idx = np.arange(length)
    return off + (idx if strand == "+" else length - 1 - idx)


def resolve_checkpoint(ckpt=None, name="ss_ctx2000"):
    """Where to load weights from.

    A retrained model in the data root wins over the bundled one, so shipping
    weights never silently overrides work the user has done.

        1. explicit argument
        2. BAJASPLICE_CKPT
        3. <root>/models/<name>.pt
        4. the copy bundled with the package
    """
    if ckpt:
        return Path(ckpt)
    env = os.environ.get("BAJASPLICE_CKPT")
    if env:
        return Path(env)
    local = paths().models / f"{name}.pt"
    if local.exists():
        return local
    from bajasplice.weights import bundled
    b = bundled(name)
    if b is not None:
        return b
    raise FileNotFoundError(
        f"no checkpoint for '{name}'. Train one with `bajasplice train splicesite`, "
        f"set BAJASPLICE_CKPT, or pass --ckpt.")


def load_splicenet(ckpt=None, device=None):
    ckpt = resolve_checkpoint(ckpt)
    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(str(ckpt), map_location="cpu", weights_only=False)
    model = SpliceNet(context=ck["args"]["context"], ch=ck["args"]["channels"]).to(device).eval()
    model.load_state_dict(ck["model"])
    return model, ck["args"]["context"], device


@torch.no_grad()
def scan_region(model, context, chrom, start, end, strand, device,
                chunk=5000, genome=None):
    """Per-position acceptor and donor probability, indexed by genomic offset."""
    g = genome or GenomeReader()
    n = end - start + 1
    acc = np.zeros(n, np.float32)
    don = np.zeros(n, np.float32)
    c = context // 2
    for off in range(0, n, chunk):
        L = min(chunk, n - off)
        s = start + off
        codes = g.codes(chrom, s - c, s + L - 1 + c, strand)
        x = torch.from_numpy(one_hot(codes)[None]).to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
        where = chunk_offsets(off, L, strand)
        acc[where] = p[1, :L]
        don[where] = p[2, :L]
    return acc, don


def gene_span(name, exons=None, transcript=None):
    """(chrom, start, end, strand, exon_frame) for a gene.

    Uses the SQLite gene index when it exists, which turns a half-gigabyte scan
    into a keyed lookup. Falls back to the flat table so the library still
    works before `bajasplice prepare geneindex` has been run.
    """
    if exons is None:
        try:
            from bajasplice.index import GeneIndex
            idx = GeneIndex()
            rec = idx.gene(name)
            if rec is None:
                raise SystemExit(f"gene {name} not found in the gene index")
            _LAST_INDEX["slim"] = idx.slim
            _LAST_INDEX["path"] = str(idx.path)
            ex = idx.exons(name, transcript)
            if ex.empty:
                raise SystemExit(f"gene {name} has no exons for transcript {transcript}")
            ex = ex.assign(chrom=rec["chrom"], strand=rec["strand"], gene_name=name)
            return rec["chrom"], int(rec["start"]), int(rec["end"]), rec["strand"], ex
        except FileNotFoundError:
            pass
    from bajasplice.prepare.gencode import load_exons
    ex = exons if exons is not None else load_exons(
        usecols=["chrom", "start", "end", "strand", "gene_name", "transcript_id", "mane"])
    g = ex[ex.gene_name == name]
    if g.empty:
        raise SystemExit(f"gene {name} not found in the exon table")
    return g.chrom.iloc[0], int(g.start.min()), int(g.end.max()), g.strand.iloc[0], g


def scan_gene(name, ckpt=None, device=None):
    """(acceptor, donor, (chrom, start, end, strand)) for a whole gene."""
    model, context, device = load_splicenet(ckpt, device)
    chrom, gs, ge, strand, _ = gene_span(name)
    acc, don = scan_region(model, context, chrom, gs, ge, strand, device)
    return acc, don, (chrom, gs, ge, strand)


def rank_candidates(name, kind="acceptor", ckpt=None, device=None, exclude_annotated=True):
    """Rank every intronic AG (acceptor) or GT (donor) dinucleotide in a gene.

    Annotated splice sites are excluded by default. They sit just outside the
    exons they belong to, so an exon-body mask does not remove them, and they
    score near 1.0 and crowd out every cryptic candidate.
    """
    model, context, device = load_splicenet(ckpt, device)
    chrom, gs, ge, strand, gex = gene_span(name)
    g = GenomeReader()
    acc, don = scan_region(model, context, chrom, gs, ge, strand, device, genome=g)
    codes = g.codes(chrom, gs, ge, "+")

    exonic = np.zeros(ge - gs + 1, bool)
    for s, e in zip(gex.start, gex.end):
        exonic[max(0, s - gs):max(0, e - gs + 1)] = True
    annot = set()
    if exclude_annotated:
        for s, e in zip(gex.start, gex.end):
            annot.add(int(s) - 1)
            annot.add(int(e) + 1)

    if kind == "acceptor":
        hit = (np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 3)) + 1 if strand == "+"
               else np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4)))
        track = acc
    else:
        hit = (np.flatnonzero((codes[:-1] == 3) & (codes[1:] == 4)) if strand == "+"
               else np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 2)) + 1)
        track = don
    rows = [(gs + int(i), float(track[i])) for i in hit
            if not exonic[i] and (gs + int(i)) not in annot]
    df = pd.DataFrame(rows, columns=["pos", "score"]).sort_values("score", ascending=False)
    df.insert(0, "rank", np.arange(1, len(df) + 1))
    df["chrom"], df["strand"], df["type"] = chrom, strand, kind
    df = df.reset_index(drop=True)
    # which annotation the exclusion used materially changes the candidate set,
    # so record it rather than leaving the caller to guess
    df.attrs["index"] = dict(_LAST_INDEX)
    return df


def main():
    ap = argparse.ArgumentParser(description="score a gene or interval for splice sites")
    ap.add_argument("--gene")
    ap.add_argument("--region", help="chr:start-end:strand")
    ap.add_argument("--rank", choices=["acceptor", "donor"],
                    help="rank intronic cryptic candidates instead of printing a track")
    ap.add_argument("--ckpt")
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--out")
    a = ap.parse_args()

    if a.rank:
        if not a.gene:
            raise SystemExit("--rank requires --gene")
        df = rank_candidates(a.gene, a.rank, ckpt=a.ckpt)
        src = df.attrs.get("index", {})
        scope = ("canonical transcript only (slim index)" if src.get("slim")
                 else "all annotated transcripts")
        print(f"{a.gene}: {len(df):,} intronic {a.rank} candidates "
              f"(annotated sites excluded, {scope})")
        print(df.head(a.top)[["rank", "chrom", "pos", "score"]].to_string(index=False))
        if a.out:
            df.to_csv(a.out, sep="\t", index=False)
        return 0

    if a.gene:
        acc, don, (chrom, gs, ge, strand) = scan_gene(a.gene, ckpt=a.ckpt)
        label = a.gene
    elif a.region:
        loc, strand = a.region.rsplit(":", 1)
        chrom, rng = loc.split(":")
        gs, ge = (int(v) for v in rng.split("-"))
        model, context, device = load_splicenet(a.ckpt)
        acc, don = scan_region(model, context, chrom, gs, ge, strand, device)
        label = a.region
    else:
        raise SystemExit("give --gene or --region")

    print(f"{label}: {chrom}:{gs:,}-{ge:,} ({strand})  {ge-gs+1:,} nt")
    for nm, arr in (("DONOR", don), ("ACCEPTOR", acc)):
        idx = np.argsort(-arr)[:a.top]
        print(f"\ntop {a.top} {nm}")
        print(f"  {'position':>12s} {'score':>8s}")
        for i in sorted(idx, key=lambda j: -arr[j]):
            print(f"  {gs + int(i):12,d} {arr[i]:8.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

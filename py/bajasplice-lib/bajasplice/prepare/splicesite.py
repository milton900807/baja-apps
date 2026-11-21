"""Build the splice-site training index from the flattened exon table.

One canonical protein-coding transcript per gene, its donor and acceptor
positions, and the fixed-length windows that tile it, each tagged with the
chromosome split of the active species. Written to
data/processed/splicesite_index.pkl, which the trainer and the PWM baseline
both read so they score exactly the same windows.
"""
from __future__ import annotations

import pickle

from bajasplice.config import paths, species
from bajasplice.datasets import build_splicesite_index


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--target-len", type=int, default=5000)
    ap.add_argument("--all-gene-types", action="store_true",
                    help="include non-coding genes (default: protein_coding only)")
    a = ap.parse_args()

    W, S, G = build_splicesite_index(target_len=a.target_len,
                                     protein_coding_only=not a.all_gene_types)
    if G.empty:
        raise SystemExit("no multi-exon transcripts found. Run `%s prepare gencode` first "
                         "and check the GTF is a %s annotation."
                         % (species().command, species().label))
    out = paths().processed / "splicesite_index.pkl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        pickle.dump({"windows": W, "sites": S, "genes": G,
                     "species": species().key, "assembly": species().assembly}, f)

    n_sites = sum(len(d) for d, _ in S.values())
    print(f"wrote {out}  ({species().label}, {species().assembly})")
    print(f"  {len(G):,} transcripts, {n_sites:,} introns, {len(W):,} windows x {a.target_len} nt")
    counts = W.split.value_counts()
    for sp in ("train", "val", "test"):
        print(f"  {sp:5s} {int(counts.get(sp, 0)):>8,} windows")
    missing = [sp for sp in ("train", "val", "test") if counts.get(sp, 0) == 0]
    if missing:
        print(f"WARNING: no windows in split(s): {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

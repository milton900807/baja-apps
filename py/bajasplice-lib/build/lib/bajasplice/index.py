"""Fast gene lookup backed by SQLite.

The flat exon table is ~5M rows and half a gigabyte; reading it per request is
not an option for a service, and holding it in every worker is wasteful. This
builds a small indexed database once, so a gene lookup is a keyed query instead
of a full scan.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pandas as pd

from bajasplice.config import paths, MAIN_CHROMS

__all__ = ["build_index", "build_slim_index", "index_path", "slim_index_path",
           "resolve_index", "GeneIndex"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS genes (
    name TEXT PRIMARY KEY, chrom TEXT, strand TEXT,
    start INTEGER, end INTEGER, canonical_tx TEXT, n_tx INTEGER
);
CREATE TABLE IF NOT EXISTS exons (
    gene TEXT, transcript_id TEXT, start INTEGER, end INTEGER, mane INTEGER
);
CREATE INDEX IF NOT EXISTS ix_exons_gene ON exons(gene);
CREATE INDEX IF NOT EXISTS ix_genes_chrom ON genes(chrom, start);
"""


SLIM_SCHEMA = """
CREATE TABLE IF NOT EXISTS genes (
    name TEXT PRIMARY KEY, chrom TEXT, strand TEXT,
    start INTEGER, end INTEGER, tx TEXT, n_exons INTEGER, exons BLOB
);
CREATE INDEX IF NOT EXISTS ix_genes_chrom ON genes(chrom, start);
"""


def index_path() -> Path:
    return paths().processed / "genes.sqlite"


def slim_index_path() -> Path:
    """The compact index bundled with the package."""
    return Path(__file__).parent / "data" / "genes.slim.sqlite"


def resolve_index(path=None) -> Path:
    """Full index in the data root wins; fall back to the bundled slim one.

    The full index carries every annotated transcript, which the evaluation
    pipeline needs. The slim one carries a single canonical transcript per gene,
    which is all that gene-name lookup, scanning and plotting require.
    """
    if path:
        return Path(path)
    full = index_path()
    if full.exists():
        return full
    slim = slim_index_path()
    if slim.exists():
        return slim
    raise FileNotFoundError(
        f"no gene index found. Expected {full} (build with "
        f"`bajasplice prepare geneindex`) or a bundled slim index at {slim}.")


def build_slim_index(exons_tsv=None, out=None):
    """One canonical transcript per gene, exon coordinates packed as a blob.

    A row-per-exon schema costs ~322 MB for the full annotation. Keeping only
    the canonical transcript and storing its exons as an int32 array relative
    to the gene start gets the same lookups into ~10 MB, small enough to ship.
    """
    import numpy as np

    exons_tsv = Path(exons_tsv) if exons_tsv else paths().interim / "exons.tsv"
    out = Path(out) if out else slim_index_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()

    cols = ["chrom", "start", "end", "strand", "gene_name", "transcript_id", "mane"]
    df = pd.read_csv(exons_tsv, sep="\t", usecols=cols, low_memory=False)
    df = df[df.chrom.isin(MAIN_CHROMS)].dropna(subset=["gene_name", "transcript_id"])

    # canonical transcript: MANE Select if annotated, else the most exonic sequence
    df["_len"] = df.end - df.start + 1
    per_tx = (df.groupby(["gene_name", "transcript_id"], sort=False)
                .agg(mane=("mane", "max"), exonic=("_len", "sum")).reset_index()
                .sort_values(["gene_name", "mane", "exonic"], ascending=[True, False, False]))
    canon = per_tx.groupby("gene_name", sort=False).head(1)
    keep = set(zip(canon.gene_name, canon.transcript_id))
    sub = df[[(g, t) in keep for g, t in zip(df.gene_name, df.transcript_id)]]

    con = sqlite3.connect(out)
    con.executescript(SLIM_SCHEMA)
    rows = []
    for (gene, tx), grp in sub.groupby(["gene_name", "transcript_id"], sort=False):
        grp = grp.sort_values("start")
        s0 = int(grp.start.min()); e0 = int(grp.end.max())
        arr = np.empty((len(grp), 2), dtype=np.int32)
        arr[:, 0] = grp.start.to_numpy() - s0
        arr[:, 1] = grp.end.to_numpy() - s0
        rows.append((gene, grp.chrom.iloc[0], grp.strand.iloc[0], s0, e0, tx,
                     len(grp), arr.tobytes()))
    con.executemany("INSERT OR REPLACE INTO genes VALUES (?,?,?,?,?,?,?,?)", rows)
    con.commit()
    con.execute("VACUUM")
    con.close()
    return out, len(rows)


def build_index(exons_tsv=None, out=None, chunksize=1_000_000):
    """Build the SQLite index from the flat exon table."""
    exons_tsv = Path(exons_tsv) if exons_tsv else paths().interim / "exons.tsv"
    out = Path(out) if out else index_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    con = sqlite3.connect(out)
    con.executescript(SCHEMA)

    cols = ["chrom", "start", "end", "strand", "gene_name", "transcript_id", "mane"]
    meta, n = {}, 0
    for chunk in pd.read_csv(exons_tsv, sep="\t", usecols=cols, chunksize=chunksize,
                             low_memory=False):
        chunk = chunk[chunk.chrom.isin(MAIN_CHROMS)].dropna(subset=["gene_name"])
        if chunk.empty:
            continue
        con.executemany(
            "INSERT INTO exons (gene, transcript_id, start, end, mane) VALUES (?,?,?,?,?)",
            chunk[["gene_name", "transcript_id", "start", "end", "mane"]].itertuples(
                index=False, name=None))
        # collect chrom/strand as we go rather than re-reading the whole table
        for g, c, s in chunk[["gene_name", "chrom", "strand"]].drop_duplicates(
                "gene_name").itertuples(index=False, name=None):
            meta.setdefault(g, (c, s))
        n += len(chunk)
        con.commit()

    spans = con.execute("SELECT gene, MIN(start), MAX(end), "
                        "COUNT(DISTINCT transcript_id) FROM exons GROUP BY gene").fetchall()
    # canonical transcript: MANE Select if annotated, else the most exonic sequence
    canon = dict(con.execute("""
        SELECT gene, transcript_id FROM (
            SELECT gene, transcript_id, MAX(mane) m, SUM(end - start + 1) L
            FROM exons GROUP BY gene, transcript_id
            ORDER BY m DESC, L DESC)
        GROUP BY gene""").fetchall())
    con.executemany(
        "INSERT OR REPLACE INTO genes (name, chrom, strand, start, end, canonical_tx, n_tx)"
        " VALUES (?,?,?,?,?,?,?)",
        [(g, meta.get(g, ("", ""))[0], meta.get(g, ("", ""))[1], s, e, canon.get(g), k)
         for g, s, e, k in spans])
    con.commit()
    con.execute("ANALYZE")
    con.close()
    return out, n


class GeneIndex:
    """Read-only handle. Safe to open once per worker process."""

    def __init__(self, path=None):
        self.path = resolve_index(path)
        self._con = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True,
                                    check_same_thread=False)
        cols = {r[1] for r in self._con.execute("PRAGMA table_info(genes)")}
        self.slim = "exons" in cols        # packed-blob schema, canonical only

    def gene(self, name):
        if self.slim:
            r = self._con.execute(
                "SELECT name, chrom, strand, start, end, tx, n_exons "
                "FROM genes WHERE name = ?", (name,)).fetchone()
        else:
            r = self._con.execute(
                "SELECT name, chrom, strand, start, end, canonical_tx, n_tx "
                "FROM genes WHERE name = ?", (name,)).fetchone()
        if not r:
            return None
        keys = ("name", "chrom", "strand", "start", "end", "canonical_tx", "n_tx")
        return dict(zip(keys, r))

    def exons(self, name, transcript=None):
        if self.slim:
            import numpy as np
            r = self._con.execute(
                "SELECT tx, start, exons FROM genes WHERE name = ?", (name,)).fetchone()
            if not r:
                return pd.DataFrame(columns=["transcript_id", "start", "end", "mane"])
            tx, s0, blob = r
            if transcript and transcript not in ("canonical", tx):
                # the slim index only carries the canonical transcript
                return pd.DataFrame(columns=["transcript_id", "start", "end", "mane"])
            a = np.frombuffer(blob, dtype=np.int32).reshape(-1, 2).astype(np.int64) + s0
            return pd.DataFrame({"transcript_id": tx, "start": a[:, 0], "end": a[:, 1],
                                 "mane": 1})
        q = "SELECT transcript_id, start, end, mane FROM exons WHERE gene = ?"
        args = [name]
        if transcript:
            q += " AND transcript_id = ?"
            args.append(transcript)
        q += " ORDER BY start"
        return pd.DataFrame(self._con.execute(q, args).fetchall(),
                            columns=["transcript_id", "start", "end", "mane"])

    def search(self, prefix, limit=25):
        col = "n_exons" if self.slim else "n_tx"
        rows = self._con.execute(
            f"SELECT name, chrom, strand, start, end, {col} FROM genes "
            "WHERE name LIKE ? ORDER BY name LIMIT ?",
            (prefix.upper() + "%", limit)).fetchall()
        keys = ("name", "chrom", "strand", "start", "end", "n_tx")
        return [dict(zip(keys, r)) for r in rows]

    def count(self):
        return self._con.execute("SELECT COUNT(*) FROM genes").fetchone()[0]


def main():
    import argparse
    ap = argparse.ArgumentParser(description="build the SQLite gene index")
    ap.add_argument("--exons")
    ap.add_argument("--out")
    ap.add_argument("--slim", action="store_true",
                    help="canonical transcript per gene, packed exons; small "
                         "enough to ship with the package")
    a = ap.parse_args()
    if a.slim:
        out, n = build_slim_index(a.exons, a.out)
        print(f"wrote {out}  ({n:,} genes, canonical transcript only, "
              f"{out.stat().st_size/1e6:.1f} MB)")
        return 0
    out, n = build_index(a.exons, a.out)
    idx = GeneIndex(out)
    print(f"wrote {out}  ({n:,} exon rows, {idx.count():,} genes, "
          f"{out.stat().st_size/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

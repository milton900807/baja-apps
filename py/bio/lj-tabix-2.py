from ion import works
from subprocess import Popen, PIPE
import json

file = works.param(1)
chrom = works.param(2)
startIndex = works.param(3)
endIndex = works.param(4)
strand = works.param(5)

print('file', file)
print('chrom', chrom)
print('start', startIndex)
print('end', endIndex)
print('strand', strand)


def bgzip(filename):
    """Call bgzip to compress a file."""
    Popen(['bgzip', '-f', filename])

def tabix_index(filename,
        preset="gff", chrom=1, start=4, end=5, skip=0, comment="#"):
    """Call tabix to create an index for a bgzip-compressed file."""
    Popen(['tabix', '-p', preset, '-s', str(chrom), '-b', str(start), '-e', str(end),
           '-S', str(skip), '-c', comment])

def chrom_candidates(c):
    """
    Return a list of likely chromosome name variants.
    Examples:
      "1" -> ["1","chr1","01","chr01"]
      "chr1" -> ["chr1","1","chr01","01"]
      "M"/"MT" -> tries common mito spellings
    """
    if c is None:
        return []
    s = str(c).strip()
    if not s:
        return []

    # Normalize case for comparison, but keep originals we emit as lowercase 'chr' + payload
    raw = s
    s_lower = s.lower()

    # Strip leading 'chr' if present
    if s_lower.startswith("chr"):
        base = s[3:]  # preserve original remainder
    else:
        base = s

    base_stripped = str(base).strip()
    base_lower = base_stripped.lower()

    out = []
    def add(x):
        if x and x not in out:
            out.append(x)

    # Handle mitochondrial special cases
    mito_map = {"m", "mt", "chrm", "chrmt"}
    if base_lower in mito_map:
        add("MT"); add("chrMT")
        add("M");  add("chrM")
        add("mt"); add("chrmt")
        add("m");  add("chrm")
        # also include original raw forms
        add(raw); add(raw.upper()); add(raw.lower())
        return out

    # Add original forms (as-is, upper, lower)
    add(raw)
    add(raw.upper())
    add(raw.lower())

    # Build canonical-ish forms for autosomes/sex chromosomes/other contigs
    add(base_stripped)
    add(base_stripped.upper())
    add(base_stripped.lower())

    add("chr" + base_stripped)
    add("chr" + base_stripped.upper())
    add("chr" + base_stripped.lower())

    # Zero-pad numeric chromosomes (01..09 style)
    # If someone passes "01" we still want "1", and vice versa.
    try:
        n = int(base_stripped)
        add(str(n))
        add("chr" + str(n))
        if 0 <= n < 10:
            z = f"{n:02d}"
            add(z)
            add("chr" + z)
    except Exception:
        pass

    return out


def tabix_query_rows(filename, chrom, start, end):
    """
    Run tabix once and return (rows, rc, stderr_text).
    rows: list[list[bytes]]
    """
    query = f"{chrom}:{start}-{end}"
    filename = filename.replace("//", "/")

    process = Popen(
        ["tabix", filename, query],
        stdout=PIPE,
        stderr=PIPE
    )

    rows = []
    for raw in process.stdout:
        rows.append(raw.rstrip(b"\n").split(b"\t"))

    stderr = process.stderr.read().decode("utf-8", errors="replace").strip()
    rc = process.wait()
    return rows, rc, stderr


def tabix_query_permissive(filename, chrom, start, end, verbose=True):
    """
    Try multiple chromosome spellings until we get at least one record.
    Returns (rows, chrom_used).
    """
    tried = []
    for c in chrom_candidates(chrom):
        tried.append(c)
        rows, rc, stderr = tabix_query_rows(filename, c, start, end)

        # Many tabix builds use rc=1 for "no matches". Treat that as empty, not fatal.
        if rc not in (0, 1):
            if stderr:
                print("TABIX STDERR:", stderr)
            raise RuntimeError(f"tabix exited with code {rc} for chrom={c}")

        # Optional: show stderr but don't fail if rc is acceptable.
        if stderr and verbose:
            print(f"TABIX STDERR (chrom={c}):", stderr)

        if rows:
            if verbose and c != str(chrom):
                print("tabix chrom fallback succeeded:", str(chrom), "->", c)
            return rows, c

    if verbose:
        print("No records found. Tried chrom variants:", tried)
    return [], None


# ---- Execute query (permissive chrom handling) ----
rows, chrom_used = tabix_query_permissive(
    file,
    chrom,
    int(startIndex),
    int(endIndex),
    verbose=True
)

snps = []

for r in rows:
    ftype = 'snp'
    snpid = r[2].decode('utf-8')
    ref = r[3].decode("utf-8")
    alt = r[4].decode("utf-8")

    if len(ref) > len(alt):
        ftype = 'del'
    elif len(ref) < len(alt):
        ftype = 'ins' if alt.find(",") == -1 else 'snp'
    else:
        ftype = 'snp'

    annotations = r[7].decode("utf-8")
    name = r[2].decode("utf-8")
    if name is None or len(name) <= 0:
        name = ftype + str(r[1].decode('utf-8'))

    if r[2] is not None:
        snpindel = {
            "name": name,
            "type": ftype,
            "id": str(r[2].decode("utf-8")),
            "xi": int(r[1].decode("utf-8")),
            "xf": len(alt),
            "strand": str(strand),
            "alternate": str(r[4].decode("utf-8")),
            "reference": str(r[3].decode("utf-8")),
            "phase": 1,
            "annotations": annotations,
            # Optional: include the chrom we actually queried successfully
            "chrom": chrom_used if chrom_used else str(chrom),
        }
        snps.append(snpindel)

works.resolve({'results': snps})
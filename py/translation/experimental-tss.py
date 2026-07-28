"""
Ion Works script: Given an Ensembl transcript ID (ENST...), download FANTOM5 hg38 CAGE peaks,
extract peaks near the transcript TSS, render a simple plot, and return results via works.resolve().

Inputs (works.param):
  1) transcript_id  (required)  e.g. "ENST00000335137"
  2) window_bp      (optional)  e.g. "2000"  (default 2000)
  3) cage_bed_url   (optional)  override FANTOM5 URL (default below)

Outputs (works.resolve):
  {
    "transcript": "...",
    "locus": "chr:start-end(strand)",
    "tss_1based": <int>,
    "window_bp": <int>,
    "cage_peaks_bed": "<BED lines>",
    "plot_png_base64": "<base64 PNG>",
    "log": "<text log>"
  }

Notes:
- This version uses CAGE peaks only (BED.gz). It avoids bigWig parsing to keep dependencies light.
- Coordinate conventions:
  - Ensembl REST returns 1-based inclusive coordinates.
  - BED is 0-based half-open.
"""

from ion import works

import matplotlib as mpl
mpl.use("agg")

import matplotlib.pyplot as plt
from tempfile import NamedTemporaryFile
import tempfile
import os
import os.path
import subprocess
import pipes
import gzip
import base64
import json
import sys
import urllib.request


# ----------------------------
# Helpers
# ----------------------------

def runShellCommand(*args):
    """Run a shell command and return stdout bytes; raise on nonzero exit."""
    qargs = []
    for a in args:
        if a.strip() != "|":
            qargs.append(pipes.quote(a))
        else:
            qargs.append("|")
    cmd_line = " ".join(qargs)
    po = subprocess.Popen(cmd_line, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = po.communicate()
    po.wait()
    if po.returncode != 0:
        raise Exception(
            "Command line {} got return code {}.\nSTDOUT: {}\nSTDERR: {}".format(
                cmd_line, po.returncode, stdout.decode("utf-8", "ignore"), stderr.decode("utf-8", "ignore")
            )
        )
    return stdout

def http_get_json(url, headers=None, timeout=60):
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode("utf-8")
    return json.loads(body)

def download_url_to_path(url, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    with open(out_path, "wb") as f:
        f.write(data)
    return out_path

def parse_cage_bed_gz_near_tss(bed_gz_path, chrom, tss_1based, window_bp):
    """
    Stream BED.gz and return list of BED lines overlapping [tss-window, tss+window).
    BED: chrom, start0, end0, ...
    """
    tss0 = tss_1based - 1
    lo = max(0, tss0 - window_bp)
    hi = tss0 + window_bp

    out_lines = []
    with gzip.open(bed_gz_path, "rt", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if not line or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            if parts[0] != chrom:
                continue
            try:
                start0 = int(parts[1])
                end0 = int(parts[2])
            except:
                continue

            # overlap if end0 > lo and start0 < hi
            if end0 > lo and start0 < hi:
                out_lines.append(line.rstrip("\n"))
    return out_lines

def bed_midpoints(bed_lines):
    mids = []
    for ln in bed_lines:
        parts = ln.split("\t")
        if len(parts) < 3:
            continue
        try:
            s = int(parts[1]); e = int(parts[2])
            mids.append((s + e) // 2)
        except:
            pass
    return mids

def ensembl_transcript_locus(transcript_id):
    """
    Ensembl REST: lookup/id/:id?expand=1
    Returns: (chrom, start_1based, end_1based, strand)
    """
    url = "https://rest.ensembl.org/lookup/id/{}?expand=1".format(transcript_id)
    data = http_get_json(url)
    chrom = str(data["seq_region_name"])
    start = int(data["start"])
    end = int(data["end"])
    strand = int(data["strand"])  # 1 or -1
    return chrom, start, end, strand

def plot_tss_and_cage(chrom, start_1based, end_1based, strand, tss_1based, window_bp, cage_midpoints_list):
    """
    Create a simple plot with vertical lines for CAGE peak midpoints and a thick line at the TSS.
    Returns PNG bytes.
    """
    tss0 = tss_1based - 1
    x0 = max(0, tss0 - window_bp)
    x1 = tss0 + window_bp

    fig = plt.figure(figsize=(12, 3.5))
    ax = fig.add_subplot(111)

    # Draw cage lines
    for m in cage_midpoints_list:
        if x0 <= m <= x1:
            ax.axvline(m, alpha=0.25, linewidth=1.0)

    # Draw TSS
    ax.axvline(tss0, linewidth=2.0, label="TSS ({})".format("+" if strand == 1 else "-"))

    ax.set_xlim([x0, x1])
    ax.set_title("CAGE peaks near TSS | {}:{}-{} (TSS={} 1-based)".format(chrom, start_1based, end_1based, tss_1based))
    ax.set_xlabel("Genomic position on {} (0-based)".format(chrom))
    ax.set_ylabel("CAGE peaks (lines)")
    ax.legend(loc="upper right")

    # Save to bytes
    with NamedTemporaryFile(suffix=".png", delete=False) as tf:
        png_path = tf.name
    fig.tight_layout()
    fig.savefig(png_path, dpi=200)
    plt.close(fig)

    with open(png_path, "rb") as f:
        png_bytes = f.read()
    try:
        os.unlink(png_path)
    except:
        pass
    return png_bytes


# ----------------------------
# Main (Ion Works)
# ----------------------------

log_lines = []

try:
    works.progress(5)

    transcript_id = works.param(1)
    if transcript_id is None or str(transcript_id).strip() == "":
        raise Exception("works.param(1) must be an Ensembl transcript id like ENST00000335137")

    window_bp = 2000
    try:
        w = works.param(2)
        if w is not None and str(w).strip() != "":
            window_bp = int(str(w))
    except:
        window_bp = 2000

    default_cage_url = (
        "https://fantom.gsc.riken.jp/5/datafiles/reprocessed/hg38_latest/extra/CAGE_peaks/"
        "hg38_fair+new_CAGE_peaks_phase1and2.bed.gz"
    )
    cage_url = default_cage_url
    try:
        u = works.param(3)
        if u is not None and str(u).strip() != "":
            cage_url = str(u).strip()
    except:
        cage_url = default_cage_url

    log_lines.append("Transcript: {}".format(transcript_id))
    log_lines.append("Window bp: {}".format(window_bp))
    log_lines.append("CAGE URL: {}".format(cage_url))

    works.progress(15)

    # 1) Fetch transcript locus
    chrom, start_1based, end_1based, strand = ensembl_transcript_locus(transcript_id)
    tss_1based = start_1based if strand == 1 else end_1based

    log_lines.append("Locus: {}:{}-{} strand={}".format(chrom, start_1based, end_1based, strand))
    log_lines.append("TSS (1-based): {}".format(tss_1based))

    works.progress(30)

    # 2) Download CAGE BED.gz (cache in /tmp)
    outdir = tempfile.mkdtemp(prefix="ion_tss_")
    cage_path = os.path.join(outdir, "fantom5_cage_peaks_hg38.bed.gz")
    download_url_to_path(cage_url, cage_path)
    log_lines.append("Downloaded CAGE to: {}".format(cage_path))

    works.progress(55)

    # 3) Filter peaks near TSS
    cage_bed_lines = parse_cage_bed_gz_near_tss(cage_path, chrom, tss_1based, window_bp)
    log_lines.append("CAGE peaks overlapping window: {}".format(len(cage_bed_lines)))

    mids = bed_midpoints(cage_bed_lines)

    works.progress(75)

    # 4) Plot
    png_bytes = plot_tss_and_cage(chrom, start_1based, end_1based, strand, tss_1based, window_bp, mids)
    png_b64 = base64.b64encode(png_bytes).decode("ascii")

    works.progress(95)

    # 5) Resolve
    works.resolve({
        "transcript": transcript_id,
        "locus": "{}:{}-{}({})".format(chrom, start_1based, end_1based, "+" if strand == 1 else "-"),
        "tss_1based": tss_1based,
        "window_bp": window_bp,
        "cage_peaks_bed": "\n".join(cage_bed_lines),
        "plot_png_base64": png_b64,
        "log": "\n".join(log_lines),
    })

    works.progress(100)

except Exception as e:
    # Return a structured error payload
    log_lines.append("ERROR: {}".format(str(e)))
    works.resolve({
        "error": str(e),
        "log": "\n".join(log_lines),
    })

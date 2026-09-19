"""Sequencing reads dropped on the Genome Viewer: align them and call the variants.

The Upload button reads VCFs, reports and tables. A FASTQ is none of those: it is the reads
the VCF would have been called from. This takes one FASTQ (single-end) or two (a pair, R1
and R2), plain or gzipped, aligns them to the viewer's own genome with bwa mem, and calls
SNVs and indels with bcftools. The VCF comes back to the viewer, which draws it with the same
reader it uses for any other VCF -- so a called file and an uploaded one look alike.

THE WORK IS DETACHED. The /py bridge kills a script after 15 minutes and holds one of its six
site-wide slots while it runs; an alignment can take longer than that, and would starve every
other tool while it did. So the bridge only STARTS a job and ASKS about it:

  start   files, species, sample  -> {job}          the files are basenames in baja-server/tmp,
                                                    put there by the chunked /upload endpoint
  status  job                     -> {state, stage, message, pct, ...}
                                     and, once, when state is 'done': vcf_b64, the bgzipped VCF
  cancel  job                     -> {state}

The job itself is this same file run as `fastq-to-vcf.py --run <jobdir>`, in its own session.
It writes status.json as it goes; nothing is shared with the process that started it.

THE GENOME INDEX IS BUILT HERE THE FIRST TIME IT IS NEEDED, into reference_data/bwa/<species>/.
For yeast that is seconds; for human it is about an hour and 5 GB of memory, once per box.
A second job that needs an index while one is being built waits for it rather than building
a second copy.
"""
from __future__ import annotations

import base64
import glob
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

GENOME = {
    "human": "data/genome/GRCh38.primary_assembly.genome.fa",
    "mouse": "data/genome/Mus_musculus.GRCm39.dna.primary_assembly.fa",
    "yeast": "data/genome/Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa",
}
ASSEMBLY_OF = {"human": "GRCh38", "mouse": "GRCm39", "yeast": "R64-1-1"}
BWA_EXT = (".amb", ".ann", ".bwt", ".pac", ".sa")

# Jobs running at once, site-wide. Each takes most of the machine's cores for as long as it
# runs, and they are outside the /py bridge's own cap, so they need one of their own.
MAX_JOBS = int(os.environ.get("FASTQ_MAX_JOBS") or 2)
# A finished job's directory (its VCF and log) is kept this long so a reload can still ask.
KEEP_SEC = 3 * 24 * 3600
# The VCF comes back through the bridge's output file as base64. Past this it is refused with
# the reason, and stays on the server.
VCF_SEND_MAX = 40 * 1024 * 1024
MIN_QUAL = 20
# More than this fraction of reads flagged as duplicates is amplicon data, where every read
# of an amplicon starts in the same place: removing duplicates would remove the data.
AMPLICON_DUP_FRACTION = 0.6

JOB_RE = re.compile(r"^[0-9a-f]{16}$")
UPLOAD_RE = re.compile(r"^fq-[0-9a-z]{6,40}-[\w.\-]{1,200}$")


def first_existing(rel):
    for base in [os.getcwd(),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps"),
                 "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def server_tmp():
    # The /upload endpoint writes untyped uploads to path.join(__dirname, "../tmp"), which is
    # baja-server/tmp; the bridge runs python with baja-server as its working directory.
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        if os.path.exists(os.path.join(base, "dist")):
            p = os.path.join(base, "tmp")
            os.makedirs(p, exist_ok=True)
            return p
    p = os.path.join(os.getcwd(), "tmp")
    os.makedirs(p, exist_ok=True)
    return p


def jobs_root():
    d = os.path.join(server_tmp(), "fastq-jobs")
    os.makedirs(d, exist_ok=True)
    return d


def reference_dir():
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, "reference_data")
        if os.path.isdir(p):
            return p
    p = os.path.join(os.getcwd(), "reference_data")
    os.makedirs(p, exist_ok=True)
    return p


def tool(name):
    return shutil.which(name) or ("/usr/bin/" + name if os.path.exists("/usr/bin/" + name) else "")


def read_json(path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh)
    os.replace(tmp, path)


def pid_alive(pid):
    try:
        pid = int(pid)
        if pid <= 0:
            return False
        os.kill(pid, 0)
    except Exception:
        return False
    # A zombie still answers kill(0); it is not running.
    try:
        with open("/proc/%d/stat" % pid) as fh:
            return fh.read().split(")")[-1].split()[0] != "Z"
    except Exception:
        return True


def fmt_n(n):
    return "{:,}".format(int(n))


# ============================================================== the job (detached)

class Job:
    def __init__(self, d):
        self.d = d
        self.path = os.path.join(d, "status.json")
        self.st = read_json(self.path, {}) or {}
        self.log = open(os.path.join(d, "job.log"), "a", buffering=1)
        if not self.st.get("pid"):
            # The job says who it is itself: the process that started it does not write
            # status.json again, so there is no race over whose copy lands last.
            self.set(pid=os.getpid())

    def set(self, **kw):
        self.st.update(kw)
        self.st["updated"] = time.time()
        write_json(self.path, self.st)
        if kw.get("message"):
            self.log.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), kw["message"]))

    def fail(self, msg):
        self.set(state="error", error=msg, message=msg)
        raise SystemExit(1)

    def run(self, cmd, stage, parse=None, stdout=None):
        """Run one step; stderr goes to the log, and to `parse` line by line when given."""
        self.log.write("$ %s\n" % " ".join(cmd))
        p = subprocess.Popen(cmd, stdout=stdout or subprocess.DEVNULL, stderr=subprocess.PIPE,
                             stdin=subprocess.DEVNULL, text=True, errors="replace")
        tail = []
        for line in p.stderr:
            self.log.write(line)
            tail = (tail + [line.rstrip()])[-8:]
            if parse:
                try:
                    parse(line)
                except Exception:
                    pass
        code = p.wait()
        if code != 0:
            self.fail("%s failed (exit %d): %s" % (stage, code, " / ".join(t for t in tail if t)[-400:]))


def ensure_index(job, species, fasta):
    d = os.path.join(reference_dir(), "bwa", species)
    os.makedirs(d, exist_ok=True)
    prefix = os.path.join(d, os.path.basename(fasta))
    if all(os.path.exists(prefix + e) for e in BWA_EXT):
        return prefix
    lock = os.path.join(d, "building.pid")
    # Someone else is building it: wait for theirs.
    while True:
        other = read_json(lock, {}) or {}
        if other.get("pid") and pid_alive(other["pid"]) and other.get("pid") != os.getpid():
            job.set(stage="index", message="Waiting for the %s genome index another job is building "
                                            "(started %s)…" % (ASSEMBLY_OF.get(species, species),
                                                               time.strftime("%H:%M", time.localtime(other.get("t", 0)))))
            time.sleep(20)
            if all(os.path.exists(prefix + e) for e in BWA_EXT):
                return prefix
            continue
        break
    write_json(lock, {"pid": os.getpid(), "t": time.time()})
    try:
        size = os.path.getsize(fasta)
        mins = max(1, int(size / 3.1e9 * 60))
        job.set(stage="index", pct=0,
                message="Building the %s genome index for alignment — first time only on this server, "
                        "about %d minute%s…" % (ASSEMBLY_OF.get(species, species), mins, "" if mins == 1 else "s"))
        tmp_prefix = prefix + ".building"
        job.run([tool("bwa"), "index", "-p", tmp_prefix, fasta], "bwa index")
        for e in BWA_EXT:
            os.replace(tmp_prefix + e, prefix + e)
    finally:
        try:
            os.unlink(lock)
        except Exception:
            pass
    return prefix


def is_gzip(path):
    with open(path, "rb") as fh:
        return fh.read(2) == b"\x1f\x8b"


def fastq_reads_estimate(path):
    """Reads in a FASTQ from the size of the file and of its first records."""
    import gzip
    size = os.path.getsize(path)
    try:
        opener = gzip.open if is_gzip(path) else open
        with opener(path, "rb") as fh:
            n, raw = 0, 0
            for i, line in enumerate(fh):
                raw += len(line)
                if i % 4 == 3:
                    n += 1
                    if n >= 20000:
                        break
            if not n:
                return 0
            if opener is gzip.open:
                # The compressed size of what was read, from the underlying file offset.
                comp = fh.fileobj.tell() if hasattr(fh, "fileobj") and fh.fileobj else size
                return int(size / max(1, comp) * n)
            return int(size / max(1, raw) * n)
    except Exception:
        return 0


def check_fastq(path):
    """The first records have to BE fastq records; bwa's own complaint is less helpful."""
    import gzip
    try:
        with (gzip.open if is_gzip(path) else open)(path, "rt", errors="replace") as fh:
            lines = [fh.readline().rstrip("\r\n") for _ in range(8)]
    except Exception as e:
        return "could not be read (%s)" % e
    if not lines[0].startswith("@"):
        return "does not start with a FASTQ record ('@' line)"
    if not lines[2].startswith("+") or len(lines[1]) != len(lines[3]) or not lines[1]:
        return "is not in four-line FASTQ form"
    return ""


def worker(d):
    job = Job(d)
    st = job.st
    species = st.get("species")
    fasta = first_existing(GENOME.get(species, ""))
    if not fasta or not os.path.exists(fasta + ".fai"):
        job.fail("The %s genome FASTA (with .fai) is not on this server." % species)
    for t in ("bwa", "samtools", "bcftools"):
        if not tool(t):
            job.fail("%s is not installed on this server." % t)
    fastqs = [os.path.join(d, f) for f in st.get("files", [])]
    for f in fastqs:
        why = check_fastq(f)
        if why:
            job.fail("%s %s." % (os.path.basename(f)[len("fq-"):].split("-", 1)[-1], why))

    threads = max(2, min(16, (os.cpu_count() or 4) - 1))
    prefix = ensure_index(job, species, fasta)

    # ---- align
    expected = sum(fastq_reads_estimate(f) for f in fastqs)
    job.set(stage="align", pct=0, reads_expected=expected,
            message="Aligning %s%s reads to %s…" % ("~" if expected else "", fmt_n(expected) if expected else "the",
                                                  ASSEMBLY_OF.get(species, species)))
    sample = re.sub(r"[^\w.\-]", "_", st.get("sample") or "sample")[:60]
    rg = "@RG\\tID:%s\\tSM:%s\\tPL:ILLUMINA" % (sample, sample)
    bam = os.path.join(d, "aln.bam")
    done = [0]
    last = [0.0]

    def on_bwa(line):
        m = re.search(r"Processed (\d+) reads", line)
        if m:
            done[0] += int(m.group(1))
            if time.time() - last[0] > 3:
                last[0] = time.time()
                pct = min(99, int(done[0] * 100 / expected)) if expected else None
                job.set(pct=pct, reads_done=done[0],
                        message="Aligning — %s reads%s" % (fmt_n(done[0]), " (%d%%)" % pct if pct is not None else ""))

    # bwa -> fixmate (mate scores, for markdup) -> sort -> markdup. One pipeline, so nothing
    # uncompressed touches the disk.
    bwa = subprocess.Popen([tool("bwa"), "mem", "-t", str(threads), "-R", rg, "-v", "2", "-K", "10000000", prefix] + fastqs,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, text=False)
    fix = subprocess.Popen([tool("samtools"), "fixmate", "-m", "-u", "-", "-"], stdin=bwa.stdout,
                           stdout=subprocess.PIPE, stderr=job.log)
    bwa.stdout.close()
    sort = subprocess.Popen([tool("samtools"), "sort", "-@", str(min(4, threads)), "-m", "768M", "-u",
                             "-T", os.path.join(d, "sort"), "-"], stdin=fix.stdout,
                            stdout=subprocess.PIPE, stderr=job.log)
    fix.stdout.close()
    mdstats = os.path.join(d, "markdup.txt")
    mdup = subprocess.Popen([tool("samtools"), "markdup", "-@", str(min(4, threads)), "-f", mdstats,
                             "--write-index", "-", bam], stdin=sort.stdout, stderr=job.log)
    sort.stdout.close()
    tail = []
    for raw in bwa.stderr:
        line = raw.decode("utf-8", "replace")
        job.log.write(line)
        tail = (tail + [line.rstrip()])[-6:]
        on_bwa(line)
    codes = [bwa.wait(), fix.wait(), sort.wait(), mdup.wait()]
    if any(codes):
        job.fail("Alignment failed (exit %s): %s" % ("/".join(map(str, codes)), " / ".join(t for t in tail if t)[-400:]))
    for f in fastqs:
        try:
            os.unlink(f)
        except Exception:
            pass

    # ---- how the alignment went
    flag = subprocess.run([tool("samtools"), "flagstat", "-@", "2", "-O", "json", bam],
                          capture_output=True, text=True)
    fs = {}
    try:
        fs = json.loads(flag.stdout)["QC-passed reads"]
    except Exception:
        pass
    primary = fs.get("primary", 0) or fs.get("total", 0)
    mapped = fs.get("primary mapped", fs.get("mapped", 0))
    dups = fs.get("primary duplicates", fs.get("duplicates", 0))
    if not mapped:
        job.fail("None of the %s reads aligned to %s. Are they from this species?"
                 % (fmt_n(primary), ASSEMBLY_OF.get(species, species)))
    dup_frac = dups / float(mapped or 1)
    amplicon = dup_frac > AMPLICON_DUP_FRACTION
    job.set(reads=primary, mapped=mapped, duplicates=dups, amplicon=amplicon,
            mapped_pct=round(100.0 * mapped / max(1, primary), 1))

    # ---- call, one contig at a time, on the contigs that have reads
    idx = subprocess.run([tool("samtools"), "idxstats", bam], capture_output=True, text=True).stdout
    contigs = [f[0] for f in (l.split("\t") for l in idx.splitlines()) if len(f) >= 3 and f[0] != "*" and int(f[2]) > 0]
    job.set(stage="call", pct=0, message="Calling variants on %d contig%s…" % (len(contigs), "" if len(contigs) == 1 else "s"))
    skip = "UNMAP,SECONDARY,QCFAIL" + ("" if amplicon else ",DUP")
    depth = "100000" if amplicon else "1000"

    def call(i_c):
        i, c = i_c
        out = os.path.join(d, "call.%05d.bcf" % i)
        mp = subprocess.Popen([tool("bcftools"), "mpileup", "-Ou", "-f", fasta, "-r", c, "-d", depth,
                               "-q", "20", "-Q", "20", "--skip-any-set", skip, "-a", "FORMAT/AD,FORMAT/DP", bam],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        cl = subprocess.run([tool("bcftools"), "call", "-mv", "-Ob", "-o", out], stdin=mp.stdout,
                            stderr=subprocess.PIPE, text=True)
        mp.stdout.close()
        mp.wait()
        if cl.returncode != 0:
            raise RuntimeError("bcftools call on %s: %s" % (c, cl.stderr.strip()[-300:]))
        return out

    parts, n_done = [], 0
    with ThreadPoolExecutor(max_workers=threads) as ex:
        for out in ex.map(call, enumerate(contigs)):
            parts.append(out)
            n_done += 1
            job.set(pct=int(n_done * 100 / max(1, len(contigs))),
                    message="Calling variants — %d of %d contigs" % (n_done, len(contigs)))
    parts.sort()

    raw_bcf = os.path.join(d, "raw.bcf")
    job.run([tool("bcftools"), "concat", "--threads", "2", "-Ob", "-o", raw_bcf] + parts, "bcftools concat")
    vcf = os.path.join(d, "%s.vcf.gz" % sample)
    job.run([tool("bcftools"), "view", "-i", "QUAL>=%d" % MIN_QUAL, "-Oz", "-o", vcf, raw_bcf], "bcftools view")
    job.run([tool("bcftools"), "index", "-t", vcf], "bcftools index")
    for p in parts + [raw_bcf]:
        try:
            os.unlink(p)
        except Exception:
            pass
    n = subprocess.run([tool("bcftools"), "index", "-n", vcf], capture_output=True, text=True).stdout.strip()
    try:
        n = int(n)
    except Exception:
        n = sum(1 for l in subprocess.run([tool("bcftools"), "view", "-H", vcf], capture_output=True, text=True).stdout.splitlines())
    # The BAM is what the VCF was called from and is not sent anywhere; it goes, to save disk.
    for p in glob.glob(os.path.join(d, "aln.bam*")):
        try:
            os.unlink(p)
        except Exception:
            pass
    job.set(state="done", stage="done", pct=100, variants=n, vcf=os.path.basename(vcf),
            message="%s variants called from %s reads (%.1f%% aligned%s)."
                    % (fmt_n(n), fmt_n(primary), 100.0 * mapped / max(1, primary),
                       ", amplicon data: duplicates kept" if amplicon else
                       ", %.1f%% duplicates" % (100 * dup_frac)))


# ============================================================== the bridge side

def live_jobs(root):
    n = 0
    for s in glob.glob(os.path.join(root, "*", "status.json")):
        st = read_json(s, {}) or {}
        if st.get("state") == "running" and pid_alive(st.get("pid", 0)):
            n += 1
    return n


def sweep(root):
    now = time.time()
    for d in glob.glob(os.path.join(root, "*")):
        st = read_json(os.path.join(d, "status.json"), {}) or {}
        if st.get("state") == "running" and pid_alive(st.get("pid", 0)):
            continue
        if now - float(st.get("updated") or os.path.getmtime(d)) > KEEP_SEC:
            shutil.rmtree(d, ignore_errors=True)
    # Uploads that no job ever claimed: a closed tab mid-upload, a failed start.
    for f in glob.glob(os.path.join(server_tmp(), "fq-*")):
        try:
            if now - os.path.getmtime(f) > 24 * 3600:
                os.unlink(f)
        except Exception:
            pass


def start(files, species, sample):
    root = jobs_root()
    sweep(root)
    tmp = server_tmp()
    names = [f.strip() for f in re.split(r"[\n,]", files or "") if f.strip()]
    for f in names:
        if not UPLOAD_RE.match(f) or not os.path.isfile(os.path.join(tmp, f)):
            return {"state": "error", "error": "The uploaded reads were not found on the server (%s)." % f[:80]}

    def refuse(msg):
        # A refused job's uploads go now, not at the next day's sweep: reads are big.
        for f in names:
            try:
                os.unlink(os.path.join(tmp, f))
            except Exception:
                pass
        return {"state": "error", "error": msg}

    if species not in GENOME:
        return refuse("Reads can be aligned to human, mouse or yeast; this genome is %s." % species)
    if not 1 <= len(names) <= 2:
        return refuse("One FASTQ, or two for a read pair.")
    if live_jobs(root) >= MAX_JOBS:
        return refuse("%d alignments are already running on the server. Try again when one finishes." % MAX_JOBS)
    job = uuid.uuid4().hex[:16]
    d = os.path.join(root, job)
    os.makedirs(d)
    for f in names:
        os.replace(os.path.join(tmp, f), os.path.join(d, f))
    st = {"job": job, "state": "running", "stage": "queued", "species": species,
          "assembly": ASSEMBLY_OF.get(species, ""), "sample": sample or "sample", "files": names,
          "paired": len(names) == 2, "started": time.time(), "updated": time.time(),
          "message": "Starting…", "pct": 0}
    write_json(os.path.join(d, "status.json"), st)
    log = open(os.path.join(d, "job.log"), "ab")
    try:
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--run", d],
                             stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             close_fds=True, start_new_session=True, cwd=os.getcwd())
    except Exception as e:
        return {"state": "error", "error": "could not start the alignment: %s" % e}
    st["pid"] = p.pid
    return st


def status(job):
    if not JOB_RE.match(job or ""):
        return {"state": "error", "error": "no such job"}
    d = os.path.join(jobs_root(), job)
    st = read_json(os.path.join(d, "status.json"))
    if not st:
        return {"state": "error", "error": "The alignment job is gone from the server (they are kept for three days)."}
    young = time.time() - float(st.get("started") or 0) < 60
    if st.get("state") == "running" and not pid_alive(st.get("pid", 0)) and not (young and not st.get("pid")):
        # Killed with the machine, or out of memory: the job could not say so itself.
        st.update(state="error", error="The alignment stopped without finishing (the server may have restarted "
                                       "or run out of memory). Upload the reads again.")
    st.pop("files", None)
    st["elapsed"] = int(time.time() - float(st.get("started") or time.time()))
    if st.get("state") == "done" and st.get("vcf"):
        path = os.path.join(d, st["vcf"])
        size = os.path.getsize(path) if os.path.exists(path) else 0
        if not size:
            return {"state": "error", "error": "The called VCF is missing on the server."}
        if size > VCF_SEND_MAX:
            st["state"] = "error"
            st["error"] = ("%s variants were called, a %d MB VCF: too large to send to the viewer."
                           % (fmt_n(st.get("variants", 0)), size // 1048576))
        else:
            with open(path, "rb") as fh:
                st["vcf_b64"] = base64.b64encode(fh.read()).decode("ascii")
    return st


def cancel(job):
    if not JOB_RE.match(job or ""):
        return {"state": "error", "error": "no such job"}
    d = os.path.join(jobs_root(), job)
    st = read_json(os.path.join(d, "status.json"), {}) or {}
    pid = int(st.get("pid") or 0)
    if st.get("state") == "running" and pid_alive(pid):
        try:
            os.killpg(pid, signal.SIGTERM)
        except Exception:
            pass
    shutil.rmtree(d, ignore_errors=True)
    return {"state": "cancelled"}


if __name__ == "__main__" and len(sys.argv) >= 3 and sys.argv[1] == "--run":
    try:
        worker(sys.argv[2])
    except SystemExit:
        raise
    except Exception as e:  # anything unforeseen still has to reach the viewer
        j = Job(sys.argv[2])
        j.set(state="error", error="The alignment failed: %s" % e, message=str(e))
        raise
    raise SystemExit(0)

# ---------------------------------------------------------------- main (the /py bridge)
from ion import works  # noqa: E402

action = str(works.param(1) or "").strip()
try:
    if action == "start":
        out = start(str(works.param(2) or ""), str(works.param(3) or "human").strip().lower(),
                    re.sub(r"[^\w.\-]", "_", str(works.param(4) or "sample").strip())[:60])
    elif action == "status":
        out = status(str(works.param(2) or "").strip())
    elif action == "cancel":
        out = cancel(str(works.param(2) or "").strip())
    else:
        out = {"state": "error", "error": "unknown action %r" % action}
except Exception as e:
    out = {"state": "error", "error": "fastq-to-vcf: %s" % e}
works.resolve(out)

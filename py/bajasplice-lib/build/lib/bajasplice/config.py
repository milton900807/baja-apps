"""Where everything lives.

Every path the package uses is resolved here, so nothing downstream carries an
absolute path. Resolution order for each setting:

    1. explicit argument to configure()
    2. environment variable (BAJASPLICE_ROOT, BAJASPLICE_GENOME, ...)
    3. ~/.config/bajasplice/config.json
    4. built-in default, relative to the project root

The reference data (genome FASTA, GENCODE GTF) is usually shared with other
projects, so those two are settable independently of the project root.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

CONFIG_FILE = Path(os.environ.get("BAJASPLICE_CONFIG",
                                  Path.home() / ".config" / "bajasplice" / "config.json"))

# chromosome-disjoint splits, following the SpliceAI convention so numbers stay
# comparable with published work
TEST_CHROMS = frozenset({"chr1", "chr3", "chr5", "chr7", "chr9"})
VAL_CHROMS = frozenset({"chr2", "chr4"})
MAIN_CHROMS = frozenset({f"chr{c}" for c in list(range(1, 23)) + ["X", "Y"]})


def split_of(chrom: str) -> str:
    """Which split a chromosome belongs to."""
    if chrom in TEST_CHROMS:
        return "test"
    if chrom in VAL_CHROMS:
        return "val"
    return "train"


@dataclass
class Paths:
    root: Path
    genome_fasta: Optional[Path] = None
    gencode_gtf: Optional[Path] = None          # current release, for the models
    gencode_v29_gtf: Optional[Path] = None      # matches ENCODE kallisto quantifications
    bajaclip_bundle: Optional[Path] = None      # optional eCLIP binding predictor
    eclip_dataset: Optional[Path] = None        # optional held-out eCLIP windows

    @property
    def raw(self) -> Path: return self.root / "data" / "raw"
    @property
    def interim(self) -> Path: return self.root / "data" / "interim"
    @property
    def processed(self) -> Path: return self.root / "data" / "processed"
    @property
    def models(self) -> Path: return self.root / "models"
    @property
    def results(self) -> Path: return self.root / "results"
    @property
    def logs(self) -> Path: return self.root / "logs"

    def ensure(self) -> "Paths":
        for p in (self.raw, self.interim, self.processed, self.models,
                  self.results, self.logs):
            p.mkdir(parents=True, exist_ok=True)
        return self

    def require(self, name: str) -> Path:
        """Fetch an optional reference path, with a message that says how to set it."""
        v = getattr(self, name)
        if v is None or not Path(v).exists():
            env = "BAJASPLICE_" + name.upper().replace("_PATH", "")
            raise FileNotFoundError(
                f"{name} is not configured or does not exist ({v}). "
                f"Set it with `bajasplice config --{name.replace('_', '-')} PATH`, "
                f"the {env} environment variable, or configure({name}=...)."
            )
        return Path(v)

    def to_dict(self) -> dict:
        return {k: (str(v) if v is not None else None) for k, v in asdict(self).items()}


_PATHS: Optional[Paths] = None


def _from_file() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            return {}
    return {}


def configure(root=None, genome_fasta=None, gencode_gtf=None, gencode_v29_gtf=None,
              bajaclip_bundle=None, eclip_dataset=None, save: bool = False) -> Paths:
    """Set paths for this session, optionally persisting them."""
    global _PATHS
    stored = _from_file()

    def pick(explicit, env, key, default=None):
        for v in (explicit, os.environ.get(env), stored.get(key), default):
            if v:
                return Path(v).expanduser()
        return None

    root_p = pick(root, "BAJASPLICE_ROOT", "root", Path.cwd())
    _PATHS = Paths(
        root=Path(root_p),
        genome_fasta=pick(genome_fasta, "BAJASPLICE_GENOME", "genome_fasta"),
        gencode_gtf=pick(gencode_gtf, "BAJASPLICE_GTF", "gencode_gtf"),
        gencode_v29_gtf=pick(gencode_v29_gtf, "BAJASPLICE_GTF_V29", "gencode_v29_gtf"),
        bajaclip_bundle=pick(bajaclip_bundle, "BAJASPLICE_BAJACLIP", "bajaclip_bundle"),
        eclip_dataset=pick(eclip_dataset, "BAJASPLICE_ECLIP", "eclip_dataset"),
    )
    if save:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(_PATHS.to_dict(), indent=2))
    return _PATHS


def paths() -> Paths:
    """The active configuration, initialised from env/config file on first use."""
    global _PATHS
    if _PATHS is None:
        configure()
    return _PATHS

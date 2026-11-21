"""Where everything lives.

Every path the package uses is resolved here, so nothing downstream carries an
absolute path. Resolution order for each setting:

    1. explicit argument to configure()
    2. environment variable (BAJASPLICE_ROOT, BAJASPLICE_GENOME, ...)
    3. ~/.config/bajasplice/config.json
    4. built-in default, relative to the project root

The reference data (genome FASTA, GENCODE GTF) is usually shared with other
projects, so those two are settable independently of the project root.

SPECIES. The package runs as one species per process: human by default, mouse
as BajaSpliceMM (the `bajasplicemm` command, `import bajasplicemm`, or
BAJASPLICE_SPECIES=mouse). A SPECIES OWNS ITS OWN ROOT, CONFIG FILE AND
ENVIRONMENT VARIABLES, because the failure this prevents is silent: mouse
coordinates read out of a human FASTA return real sequence and plausible
scores. So mouse reads BAJASPLICEMM_ROOT / BAJASPLICEMM_GENOME / ... and
~/.config/bajasplice/config.mouse.json, and never falls back to the human ones.
"""
from __future__ import annotations

import json
import os
from collections.abc import Set as _AbstractSet
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

CONFIG_FILE = Path(os.environ.get("BAJASPLICE_CONFIG",
                                  Path.home() / ".config" / "bajasplice" / "config.json"))

def _chroms(n_autosomes):
    return frozenset({f"chr{c}" for c in list(range(1, n_autosomes + 1)) + ["X", "Y"]})


@dataclass(frozen=True)
class Species:
    """Everything that differs between organisms, in one place.

    `supported` lists the CLI steps that are valid for the species; None means
    all of them. Mouse lists only what has mouse data behind it, so a
    human-only step (GTEx, ENCODE, VastDB hg38) refuses instead of running
    against the wrong organism.
    """
    key: str
    label: str
    assembly: str
    command: str                 # console script name
    env_prefix: str              # BAJASPLICE_ROOT vs BAJASPLICEMM_ROOT
    config_name: str             # file name under ~/.config/bajasplice/
    main_chroms: frozenset
    test_chroms: frozenset
    val_chroms: frozenset
    canonical_tag: str           # GTF tag that marks the canonical transcript
    weight_prefix: str           # bundled checkpoints: ss_ctx2000.pt vs mm_ss_ctx2000.pt
    slim_index: str              # bundled gene index file name
    absent_chroms: tuple = ()    # in the other species' assembly, never in this one
    # Label every same-strand canonical site that falls in a training window,
    # not only the window's own transcript. See datasets.with_neighbor_sites.
    label_neighbors: bool = False
    supported: Optional[dict] = None


# chromosome-disjoint splits, following the SpliceAI convention so numbers stay
# comparable with published work. Mouse keeps the same chromosome NAMES for the
# splits (test = chr1,3,5,7,9; val = chr2,4) over its own karyotype, chr1-19,X,Y.
SPECIES = {
    "human": Species(
        key="human", label="Homo sapiens", assembly="GRCh38",
        command="bajasplice", env_prefix="BAJASPLICE", config_name="config.json",
        main_chroms=_chroms(22),
        test_chroms=frozenset({"chr1", "chr3", "chr5", "chr7", "chr9"}),
        val_chroms=frozenset({"chr2", "chr4"}),
        canonical_tag="MANE_Select", weight_prefix="",
        slim_index="genes.slim.sqlite"),
    "mouse": Species(
        key="mouse", label="Mus musculus", assembly="GRCm39",
        command="bajasplicemm", env_prefix="BAJASPLICEMM",
        config_name="config.mouse.json",
        main_chroms=_chroms(19),
        test_chroms=frozenset({"chr1", "chr3", "chr5", "chr7", "chr9"}),
        val_chroms=frozenset({"chr2", "chr4"}),
        # MANE is a human-only collaboration; GENCODE mouse marks one transcript
        # per gene with Ensembl_canonical instead
        canonical_tag="Ensembl_canonical", weight_prefix="mm_",
        slim_index="genes.slim.mouse.sqlite",
        absent_chroms=("chr20", "chr21", "chr22"),
        supported={
            "prepare": {"gencode", "geneindex", "splicesite"},
            "train": {"splicesite"},
            "evaluate": {"baseline-splicesite", "zero-shot", "splicesite-report"},
            "scan": None, "plot": None, "config": None,
        }),
    # Fly has no GENCODE. The reference is Ensembl's BDGP6 build, WHICH NAMES
    # CHROMOSOMES WITHOUT A chr PREFIX (2L, 3R, X); the UCSC dm6 FASTA spells
    # the same arms chr2L and will not match the annotation.
    #
    # There are five large arms, so the split is by arm: 2L is held out for
    # test and X for validation, leaving 2R, 3L, 3R, 4 and Y to train on. Each
    # of the five carries a comparable share of genes; 4 and Y are too small
    # to select a model on.
    "fly": Species(
        key="fly", label="Drosophila melanogaster", assembly="BDGP6",
        command="bajasplicedm", env_prefix="BAJASPLICEDM",
        config_name="config.fly.json",
        main_chroms=frozenset({"2L", "2R", "3L", "3R", "4", "X", "Y"}),
        test_chroms=frozenset({"2L"}),
        val_chroms=frozenset({"X"}),
        canonical_tag="Ensembl_canonical", weight_prefix="dm_",
        slim_index="genes.slim.fly.sqlite",
        absent_chroms=("chr1", "chr2", "chr3"),
        label_neighbors=True,
        supported={
            "prepare": {"gencode", "geneindex", "splicesite"},
            "train": {"splicesite"},
            "evaluate": {"baseline-splicesite", "zero-shot", "splicesite-report"},
            "scan": None, "plot": None, "config": None,
        }),
}

_ALIASES = {"hs": "human", "homo_sapiens": "human", "grch38": "human", "hg38": "human",
            "mm": "mouse", "mus_musculus": "mouse", "grcm39": "mouse", "mm39": "mouse",
            "dm": "fly", "drosophila": "fly", "drosophila_melanogaster": "fly",
            "bdgp6": "fly", "dm6": "fly"}

# what each path setting is called in the environment, after the species prefix
_ENV_SUFFIX = {"root": "ROOT", "genome_fasta": "GENOME", "gencode_gtf": "GTF",
               "gencode_v29_gtf": "GTF_V29", "bajaclip_bundle": "BAJACLIP",
               "eclip_dataset": "ECLIP", "untrusted_bed": "UNTRUSTED_BED",
               "measured_psi": "MEASURED_PSI"}


def _species_key(name) -> str:
    k = str(name or "human").strip().lower().replace(" ", "_")
    k = _ALIASES.get(k, k)
    if k not in SPECIES:
        raise ValueError(f"unknown species '{name}'. choose from: {', '.join(sorted(SPECIES))}")
    return k


_SPECIES = _species_key(os.environ.get("BAJASPLICE_SPECIES"))


def species() -> Species:
    """The species this process is running as."""
    return SPECIES[_SPECIES]


def set_species(name) -> Species:
    """Switch the process to another species.

    THE SWITCH IS EXPORTED TO THE ENVIRONMENT AS WELL AS SET HERE, so DataLoader
    workers started with spawn re-import this module as the same species
    instead of quietly reverting to human chromosome splits. Paths are dropped
    because they belong to the species they were resolved for.
    """
    global _SPECIES, _PATHS
    k = _species_key(name)
    if k != _SPECIES:
        _PATHS = None
    _SPECIES = k
    os.environ["BAJASPLICE_SPECIES"] = k
    return SPECIES[k]


class _ChromSet(_AbstractSet):
    """A chromosome set that follows the active species.

    Modules import TEST_CHROMS / VAL_CHROMS / MAIN_CHROMS by name, which binds
    the object once. A plain frozenset would stay human forever in a process
    that switched to mouse after import, so these are live views instead. They
    behave as sets: `in`, iteration, `&`, `==`, and `Series.isin(...)`.
    """

    def __init__(self, attr):
        self._attr = attr

    def _cur(self) -> frozenset:
        return getattr(SPECIES[_SPECIES], self._attr)

    def __contains__(self, x): return x in self._cur()
    def __iter__(self): return iter(self._cur())
    def __len__(self): return len(self._cur())
    def __repr__(self): return f"{self._attr}({_SPECIES})={sorted(self._cur())}"

    @classmethod
    def _from_iterable(cls, it):
        return frozenset(it)


TEST_CHROMS = _ChromSet("test_chroms")
VAL_CHROMS = _ChromSet("val_chroms")
MAIN_CHROMS = _ChromSet("main_chroms")


def split_of(chrom: str) -> str:
    """Which split a chromosome belongs to."""
    if chrom in TEST_CHROMS:
        return "test"
    if chrom in VAL_CHROMS:
        return "val"
    return "train"


def config_file() -> Path:
    """The persisted config for the active species.

    Human keeps CONFIG_FILE. Mouse gets a sibling file, so saving a mouse root
    cannot overwrite the human one or the other way round.
    """
    sp = species()
    if sp.key == "human":
        return CONFIG_FILE
    own = os.environ.get(f"{sp.env_prefix}_CONFIG")
    return Path(own) if own else CONFIG_FILE.with_name(sp.config_name)


@dataclass
class Paths:
    root: Path
    genome_fasta: Optional[Path] = None
    gencode_gtf: Optional[Path] = None          # current release, for the models
    gencode_v29_gtf: Optional[Path] = None      # matches ENCODE kallisto quantifications
    bajaclip_bundle: Optional[Path] = None      # optional eCLIP binding predictor
    eclip_dataset: Optional[Path] = None        # optional held-out eCLIP windows
    # Exons whose PSI is not trustworthy because the reads behind it were not
    # uniquely assignable: a segmental-duplication / low-mappability BED, or the
    # export of mappability.cached_flags. Unset means NOTHING IS FLAGGED, which
    # is why untrusted.py reports which file it used. See untrusted.py.
    untrusted_bed: Optional[Path] = None        # optional low-mappability intervals
    # Published exon-inclusion measurements, for exons where no model can be
    # right. Defaults to the table shipped in bajasplice/data; set this only to
    # override it with your own. See measured.py.
    measured_psi: Optional[Path] = None         # optional measured-PSI table

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
            sp = species()
            # the name the code actually reads: BAJASPLICE_GENOME, not _GENOME_FASTA
            env = f"{sp.env_prefix}_" + _ENV_SUFFIX.get(name, name.upper())
            raise FileNotFoundError(
                f"{name} is not configured or does not exist ({v}). "
                f"Set it with `{sp.command} config --{name.replace('_', '-')} PATH`, "
                f"the {env} environment variable, or configure({name}=...)."
            )
        return Path(v)

    def to_dict(self) -> dict:
        return {k: (str(v) if v is not None else None) for k, v in asdict(self).items()}


_PATHS: Optional[Paths] = None


def _from_file() -> dict:
    cf = config_file()
    if cf.exists():
        try:
            return json.loads(cf.read_text())
        except Exception:
            return {}
    return {}


def configure(root=None, genome_fasta=None, gencode_gtf=None, gencode_v29_gtf=None,
              bajaclip_bundle=None, eclip_dataset=None, untrusted_bed=None,
              measured_psi=None, save: bool = False) -> Paths:
    """Set paths for this session, optionally persisting them."""
    global _PATHS
    stored = _from_file()

    prefix = species().env_prefix

    def pick(explicit, env, key, default=None):
        # env names are written for human; another species reads its own prefix
        env = prefix + env[len("BAJASPLICE"):]
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
        untrusted_bed=pick(untrusted_bed, "BAJASPLICE_UNTRUSTED_BED", "untrusted_bed"),
        measured_psi=pick(measured_psi, "BAJASPLICE_MEASURED_PSI", "measured_psi"),
    )
    if save:
        cf = config_file()
        cf.parent.mkdir(parents=True, exist_ok=True)
        cf.write_text(json.dumps(_PATHS.to_dict(), indent=2))
    return _PATHS


def paths() -> Paths:
    """The active configuration, initialised from env/config file on first use."""
    global _PATHS
    if _PATHS is None:
        configure()
    return _PATHS

"""BajaSpliceMM: the species switch, and the ways it must not leak.

Every failure guarded here is silent. A mouse run that reads the human root,
the human weights or a human FASTA does not crash; it returns plausible scores
for the wrong organism.
"""
import json
import random
import sys

import numpy as np
import pandas as pd
import pytest

import bajasplice
from bajasplice import config


@pytest.fixture(autouse=True)
def _back_to_human(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "CONFIG_FILE", tmp_path / "cfg" / "config.json")
    for v in ("ROOT", "GENOME", "GTF", "CKPT", "CONFIG"):
        monkeypatch.delenv(f"BAJASPLICE_{v}", raising=False)
        monkeypatch.delenv(f"BAJASPLICEMM_{v}", raising=False)
    yield
    config.set_species("human")
    config._PATHS = None


def test_human_is_the_default_and_unchanged():
    assert config.species().key == "human"
    assert config.MAIN_CHROMS == {f"chr{c}" for c in list(range(1, 23)) + ["X", "Y"]}
    assert config.split_of("chr1") == "test" and config.split_of("chr21") == "train"


def test_chromosome_sets_follow_the_species_after_import():
    from bajasplice.genome import MAIN_CHROMS        # bound by name, like every module does
    assert "chr22" in MAIN_CHROMS
    config.set_species("mouse")
    assert "chr22" not in MAIN_CHROMS and "chr19" in MAIN_CHROMS
    assert len(MAIN_CHROMS) == 21
    assert not (config.TEST_CHROMS & config.VAL_CHROMS)
    # the form the pipeline actually uses
    s = pd.Series(["chr1", "chr19", "chr20", "chrM", "chrX"])
    assert list(s[s.isin(MAIN_CHROMS)]) == ["chr1", "chr19", "chrX"]


def test_species_is_exported_for_spawned_workers(monkeypatch):
    import os
    config.set_species("mm")
    assert os.environ["BAJASPLICE_SPECIES"] == "mouse"
    with pytest.raises(ValueError):
        config.set_species("zebrafish")


def test_mouse_never_reads_the_human_root_or_config(tmp_path, monkeypatch):
    human_root = tmp_path / "human"
    monkeypatch.setenv("BAJASPLICE_ROOT", str(human_root))
    monkeypatch.setenv("BAJASPLICE_GENOME", str(tmp_path / "GRCh38.fa"))
    bajasplice.configure(gencode_gtf=tmp_path / "v50.gtf", save=True)
    assert config.paths().root == human_root

    config.set_species("mouse")
    monkeypatch.chdir(tmp_path)
    p = config.paths()
    assert p.root == tmp_path                     # cwd default, not the human root
    assert p.genome_fasta is None and p.gencode_gtf is None

    bajasplice.configure(root=tmp_path / "mouse", genome_fasta=tmp_path / "GRCm39.fa", save=True)
    assert config.config_file().name == "config.mouse.json"
    human_saved = json.loads(config.CONFIG_FILE.read_text())
    assert human_saved["root"] == str(human_root)           # not overwritten
    config.set_species("human")
    assert config.paths().root == human_root


def test_mouse_gets_no_human_weight_by_accident(tmp_path, monkeypatch):
    from bajasplice.scan import resolve_checkpoint
    from bajasplice import weights
    wdir = tmp_path / "w"
    wdir.mkdir()
    (wdir / "ss_ctx2000.pt").write_bytes(b"human")
    monkeypatch.setattr(weights, "__file__", str(wdir / "__init__.py"))
    monkeypatch.setenv("BAJASPLICE_CKPT", str(tmp_path / "human_env.pt"))

    config.set_species("mouse")
    bajasplice.configure(root=tmp_path / "mouse")
    assert weights.bundled("ss_ctx2000") is None
    assert weights.bundled("ss_ctx2000", species="human") == wdir / "ss_ctx2000.pt"
    with pytest.raises(FileNotFoundError, match="bajasplicemm train splicesite"):
        resolve_checkpoint()

    (wdir / "mm_ss_ctx2000.pt").write_bytes(b"mouse")
    assert resolve_checkpoint() == wdir / "mm_ss_ctx2000.pt"


def test_the_slim_index_is_per_species():
    from bajasplice.index import slim_index_path
    human = slim_index_path()
    config.set_species("mouse")
    assert slim_index_path() != human
    assert slim_index_path().name == "genes.slim.mouse.sqlite"


def test_the_other_species_genome_is_refused():
    from bajasplice.genome import check_assembly
    human = [f"chr{c}" for c in list(range(1, 23)) + ["X", "Y", "M"]]
    mouse = [f"chr{c}" for c in list(range(1, 20)) + ["X", "Y", "M"]]
    check_assembly(human)
    check_assembly(["chr1"])                       # a reduced FASTA is not evidence
    with pytest.raises(ValueError, match="Mus musculus karyotype"):
        check_assembly(mouse)
    config.set_species("mouse")
    check_assembly(mouse)
    check_assembly(["chr1", "chr2", "chr8"])
    with pytest.raises(ValueError, match="another species"):
        check_assembly(human)


def test_human_only_steps_refuse_under_mouse(tmp_path):
    from bajasplicemm.cli import main
    with pytest.raises(SystemExit, match="not available for Mus musculus"):
        main(["prepare", "gtex"])
    with pytest.raises(SystemExit, match="not available for Mus musculus"):
        main(["train", "psi"])
    with pytest.raises(SystemExit, match="not available for Mus musculus"):
        main(["cis"])


# ----------------------------------------------------------------------
# end to end on a synthetic mouse genome
# ----------------------------------------------------------------------

def _synthetic_mouse(root, chroms=("chr1", "chr2", "chr8"), genes_per_chrom=6, seed=0):
    """A FASTA with real GT..AG introns and a GENCODE-shaped GTF over it.

    Gene symbols are capitalised the mouse way (Gene1). One transcript per gene
    carries Ensembl_canonical and a second, shorter one does not.
    """
    rng = random.Random(seed)
    fa, gtf, truth = [], [], {}
    gid = 0
    for chrom in chroms:
        seq = [rng.choice("ACGT") for _ in range(genes_per_chrom * 4000 + 2000)]
        for g in range(genes_per_chrom):
            gid += 1
            strand = "+" if g % 2 == 0 else "-"
            start = 1000 + g * 4000
            exons, pos = [], start
            for _ in range(4):
                exons.append((pos, pos + 119))
                pos += 120 + 600
            for (_, e1), (s2, _) in zip(exons[:-1], exons[1:]):
                a, b = e1 + 1, s2 - 1                      # intron, 1-based inclusive
                left, right = ("GT", "AG") if strand == "+" else ("CT", "AC")
                seq[a - 1:a + 1] = left
                seq[b - 2:b] = right
            name = f"Gene{gid}"
            truth[name] = (chrom, strand, exons)
            for tx, exs, tag in ((f"ENSMUST{gid:011d}.1", exons,
                                  ' tag "basic"; tag "Ensembl_canonical";'),
                                 (f"ENSMUST{gid + 900:011d}.1", exons[:2], ' tag "basic";')):
                for n, (s, e) in enumerate(exs, 1):
                    gtf.append("\t".join([
                        chrom, "HAVANA", "exon", str(s), str(e), ".", strand, ".",
                        f'gene_id "ENSMUSG{gid:011d}.1"; transcript_id "{tx}"; '
                        f'gene_type "protein_coding"; gene_name "{name}"; '
                        f'transcript_type "protein_coding"; exon_number {n};{tag}']))
        s = "".join(seq)
        fa.append(f">{chrom}\n" + "\n".join(s[i:i + 60] for i in range(0, len(s), 60)))
    (root / "mm.fa").write_text("\n".join(fa) + "\n")
    (root / "mm.gtf").write_text("\n".join(gtf) + "\n")
    return truth


def test_mouse_pipeline_end_to_end(tmp_path, capsys):
    """config -> gencode -> index -> splicesite index -> train -> scan, as mouse."""
    from bajasplicemm.cli import main
    truth = _synthetic_mouse(tmp_path)
    root = tmp_path / "splicing-mm"
    assert main(["config", "--root", str(root), "--genome-fasta", str(tmp_path / "mm.fa"),
                 "--gencode-gtf", str(tmp_path / "mm.gtf"), "--save"]) == 0
    assert json.loads(capsys.readouterr().out)["assembly"] == "GRCm39"

    assert main(["prepare", "gencode"]) == 0
    ex = pd.read_csv(root / "data" / "interim" / "exons.tsv", sep="\t")
    # the canonical flag comes from Ensembl_canonical: 4 of each gene's 6 exon rows
    assert ex.mane.sum() == 4 * len(truth)

    assert main(["prepare", "geneindex"]) == 0
    assert main(["prepare", "splicesite"]) == 0
    import pickle
    idx = pickle.load(open(root / "data" / "processed" / "splicesite_index.pkl", "rb"))
    assert idx["species"] == "mouse"
    assert set(idx["windows"].split) == {"train", "val", "test"}
    # the canonical 4-exon transcript was chosen, not the 2-exon one
    assert all(len(d) == 3 for d, _ in idx["sites"].values())

    # donors and acceptors land on GT / AG in transcript orientation
    from bajasplice.genome import GenomeReader
    g = GenomeReader()
    G = idx["genes"].set_index("transcript_id")
    for tid, (don, acc) in idx["sites"].items():
        r = G.loc[tid]
        for d in don:
            lo, hi = (d, d + 1) if r.strand == "+" else (d - 1, d)
            assert g.sequence(r.chrom, lo, hi, r.strand) == "GT"
        for a in acc:
            lo, hi = (a - 1, a) if r.strand == "+" else (a, a + 1)
            assert g.sequence(r.chrom, lo, hi, r.strand) == "AG"

    main(["train", "splicesite", "--context", "80", "--channels", "8", "--epochs", "1",
          "--batch-size", "4", "--workers", "0"])
    import torch
    ck = torch.load(root / "models" / "ss_ctx80.pt", weights_only=False)
    assert ck["species"] == "mouse" and ck["assembly"] == "GRCm39"
    assert ck["init_from_species"] is None

    # a symbol typed the human way still finds the mouse gene
    from bajasplice.scan import scan_gene
    acc, don, (chrom, gs, ge, strand) = scan_gene("GENE1", ckpt=root / "models" / "ss_ctx80.pt")
    c, s, exons = truth["Gene1"]
    assert (chrom, strand, gs, ge) == (c, s, exons[0][0], exons[-1][1])
    assert acc.shape == don.shape == (ge - gs + 1,)

    # the controls: motif-only PWM, and a human-trained model run zero-shot
    main(["evaluate", "baseline-splicesite"])
    from bajasplice.models import SpliceNet
    human = tmp_path / "human_ss.pt"
    torch.save({"model": SpliceNet(context=80, ch=8).state_dict(),
                "args": {"context": 80, "channels": 8}}, human)
    with pytest.raises(SystemExit, match="not a zero-shot control"):
        main(["evaluate", "zero-shot", "--ckpt", str(root / "models" / "ss_ctx80.pt"),
              "--workers", "0"])
    assert main(["evaluate", "zero-shot", "--ckpt", str(human), "--workers", "0"]) == 0
    z = json.loads((root / "results" / "zero_shot_human_metrics.json").read_text())
    assert z["trained_on"] == "human" and z["species"] == "mouse"
    assert z["test"]["n_positions"] == 6 * 5000

    # fine-tuning from the human weights is recorded as such
    main(["train", "splicesite", "--context", "80", "--channels", "8", "--epochs", "1",
          "--batch-size", "4", "--workers", "0", "--init-from", str(human),
          "--tag", "ss_ctx80_from_human"])
    assert torch.load(root / "models" / "ss_ctx80_from_human.pt",
                      weights_only=False)["init_from_species"] == "human"

    capsys.readouterr()
    assert main(["evaluate", "splicesite-report"]) == 0
    out = capsys.readouterr().out
    assert "Mus musculus (GRCm39)" in out and "from scratch" in out
    assert "PWM baseline" in out and "human model, zero-shot" in out
    assert "initialised from human" in out


def test_a_human_trained_checkpoint_is_flagged_on_mouse(tmp_path):
    import torch
    from bajasplice.models import SpliceNet
    from bajasplice.scan import load_splicenet
    p = tmp_path / "human.pt"
    torch.save({"model": SpliceNet(context=80, ch=8).state_dict(),
                "args": {"context": 80, "channels": 8}}, p)     # no species key: human
    load_splicenet(p)                                          # silent as human
    config.set_species("mouse")
    with pytest.warns(UserWarning, match="trained on human"):
        load_splicenet(p)

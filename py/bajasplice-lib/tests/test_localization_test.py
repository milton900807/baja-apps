import os
import tempfile

import pandas as pd
import pytest

from bajasplice.evaluate.localization_test import (
    DECAY_FATES, PRODUCTIVE_FATES, contrast, dataset_counts, fate_class,
    match_datasets, norm_symbol, parse_junction, program_vs_background,
    read_gene_list, summarize, HEADER_TOKENS, _verdict,
)


def _write(tmp, name, text):
    p = os.path.join(tmp, name)
    with open(p, "w") as fh:
        fh.write(text)
    return p


def _fate(rows):
    return pd.DataFrame(rows, columns=["gene", "chrom", "strand", "a_start",
                                       "a_end", "fate"])


# ---- symbol normalization -------------------------------------------------

def test_norm_symbol_uppercases_and_strips():
    assert norm_symbol("  Actb \n") == "ACTB"
    assert norm_symbol('"Stmn2"') == "STMN2"


def test_norm_symbol_drops_blanks_and_nulls():
    for v in ("", "  ", "nan", "NA", "none", "-"):
        assert norm_symbol(v) == ""


def test_norm_symbol_strips_ensembl_version_only_for_ens_ids():
    assert norm_symbol("ENSG00000012048.21") == "ENSG00000012048"
    # a real symbol with a dot is not a versioned id and keeps its shape
    assert norm_symbol("HLA-A") == "HLA-A"


def test_mouse_and_human_symbols_collide_on_purpose():
    assert norm_symbol("Stmn2") == norm_symbol("STMN2")


# ---- gene lists -----------------------------------------------------------

def test_read_gene_list_plain_text():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "l.txt", "STMN2\nUNC13A\nG3BP1\n")
        assert read_gene_list(p) == {"STMN2", "UNC13A", "G3BP1"}


def test_read_gene_list_tsv_takes_every_cell():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "l.tsv", "gene\tlogfc\nSTMN2\t1.2\nG3BP1\t0.4\n")
        got = read_gene_list(p)
        assert {"STMN2", "G3BP1"} <= got
        # a numeric column cannot contribute symbols
        assert "1.2" not in got


def test_read_gene_list_named_column():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "l.tsv", "gene_name\tother\nSTMN2\tUNC13A\nG3BP1\tTARDBP\n")
        assert read_gene_list(p, "gene_name") == {"STMN2", "G3BP1"}


def test_read_gene_list_missing_column_is_an_error():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "l.tsv", "symbol\nSTMN2\n")
        with pytest.raises(SystemExit):
            read_gene_list(p, "gene_name")


def test_read_gene_list_rejects_an_empty_file():
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(SystemExit):
            read_gene_list(_write(t, "e.txt", ""))


def test_read_gene_list_rejects_a_file_with_no_symbols():
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(SystemExit):
            read_gene_list(_write(t, "n.txt", "1\n2\n3\n"))


def test_read_gene_list_csv_splits_on_commas():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "l.csv", "gene,fc\nSTMN2,1\nUNC13A,2\n")
        assert {"STMN2", "UNC13A"} <= read_gene_list(p)


# ---- junction parsing -----------------------------------------------------

def test_parse_junction_igv_form():
    assert parse_junction("chr8:79611214-79616822") == ("chr8", 79611214, 79616822)


def test_parse_junction_handles_scaffold_names():
    assert parse_junction("chrUn_KI270742v1:100-200")[0] == "chrUn_KI270742v1"


def test_parse_junction_returns_nones_on_junk():
    assert parse_junction("not a junction") == (None, None, None)


# ---- dataset counts -------------------------------------------------------

def _compendium(tmp):
    return _write(tmp, "c.csv",
                  "gene_name,paste_into_igv_junction,comparison,is_cryptic\n"
                  "STMN2,chr8:79611214-79616822,Brown-SHSY5Y,TRUE\n"
                  "STMN2,chr8:79611214-79616822,Brown-SKNBE2,TRUE\n"
                  "STMN2,chr8:79611214-79616822,Brown-SKNBE2,TRUE\n"
                  "UNC13A,chr19:17641556-17642414,Brown-SHSY5Y,TRUE\n"
                  "JUNK,chr1:1-2,Brown-SHSY5Y,FALSE\n")


def test_dataset_counts_counts_distinct_comparisons_not_rows():
    with tempfile.TemporaryDirectory() as t:
        g = dataset_counts(_compendium(t))
        row = g[g["paste_into_igv_junction"] == "chr8:79611214-79616822"]
        # three rows, two distinct datasets
        assert int(row["n_datasets"].iloc[0]) == 2


def test_dataset_counts_drops_non_cryptic_rows():
    with tempfile.TemporaryDirectory() as t:
        g = dataset_counts(_compendium(t))
        assert "chr1:1-2" not in set(g["paste_into_igv_junction"])


def test_dataset_counts_errors_on_a_missing_column():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "bad.csv", "a,b\n1,2\n")
        with pytest.raises(SystemExit):
            dataset_counts(p)


# ---- coordinate matching --------------------------------------------------

def test_match_datasets_matches_either_boundary():
    with tempfile.TemporaryDirectory() as t:
        rep = dataset_counts(_compendium(t))
    # exon whose start sits on the junction's right endpoint
    f = _fate([["STMN2", "chr8", "-", 79616822, 79616900, "stop_in_exon"]])
    assert match_datasets(f, rep) == [2]


def test_match_datasets_respects_tolerance():
    with tempfile.TemporaryDirectory() as t:
        rep = dataset_counts(_compendium(t))
    f = _fate([["STMN2", "chr8", "-", 79616830, 79616900, "stop_in_exon"]])
    assert match_datasets(f, rep, tol=5) == [0]
    assert match_datasets(f, rep, tol=20) == [2]


def test_match_datasets_zero_means_unmatched_not_zero_datasets():
    with tempfile.TemporaryDirectory() as t:
        rep = dataset_counts(_compendium(t))
    f = _fate([["NOPE", "chr5", "+", 100, 200, "in_frame"]])
    assert match_datasets(f, rep) == [0]


def test_match_datasets_ignores_other_chromosomes():
    with tempfile.TemporaryDirectory() as t:
        rep = dataset_counts(_compendium(t))
    # same coordinates as the STMN2 junction but on another chromosome
    f = _fate([["X", "chr9", "-", 79616822, 79616900, "in_frame"]])
    assert match_datasets(f, rep) == [0]


def test_match_datasets_takes_the_best_supported_junction():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "c.csv",
                   "gene_name,paste_into_igv_junction,comparison,is_cryptic\n"
                   "G,chr1:100-200,A,TRUE\n"
                   "G,chr1:300-400,A,TRUE\n"
                   "G,chr1:300-400,B,TRUE\n"
                   "G,chr1:300-400,C,TRUE\n")
        rep = dataset_counts(p)
    f = _fate([["G", "chr1", "+", 200, 300, "in_frame"]])
    assert match_datasets(f, rep) == [3]


# ---- classification -------------------------------------------------------

def test_fate_class_only_in_frame_is_productive():
    assert fate_class("in_frame") == "novel_protein"
    for d in DECAY_FATES:
        assert fate_class(d) == "decay"


def test_fate_class_treats_an_unknown_label_as_decay():
    assert fate_class("something_new") == "decay"


def test_productive_and_decay_fates_do_not_overlap():
    assert not set(PRODUCTIVE_FATES) & set(DECAY_FATES)


# ---- contrasts ------------------------------------------------------------

def _classified(rows):
    f = _fate(rows)
    f["gene_norm"] = [norm_symbol(g) for g in f["gene"]]
    f["klass"] = [fate_class(x) for x in f["fate"]]
    return f


def test_contrast_counts_each_class_separately():
    f = _classified([
        ["A", "chr1", "+", 1, 2, "in_frame"],
        ["B", "chr1", "+", 3, 4, "in_frame"],
        ["C", "chr1", "+", 5, 6, "stop_in_exon"],
        ["D", "chr1", "+", 7, 8, "frameshift"],
    ])
    r = contrast(f, {"A", "B"}, "x")
    assert (r["n_in_frame"], r["in_frame_localized"]) == (2, 2)
    assert (r["n_decay"], r["decay_localized"]) == (2, 0)
    assert r["in_frame_rate"] == 1.0 and r["decay_rate"] == 0.0


def test_contrast_reports_both_directions():
    f = _classified([
        ["A", "chr1", "+", 1, 2, "in_frame"],
        ["C", "chr1", "+", 5, 6, "stop_in_exon"],
        ["D", "chr1", "+", 7, 8, "stop_in_exon"],
        ["E", "chr1", "+", 9, 10, "stop_in_exon"],
    ])
    # localization sits entirely in the decay class, so the forward p must be
    # unremarkable and the reverse p must be the small one
    r = contrast(f, {"C", "D", "E"}, "x")
    assert r["p"] > r["p_reverse"]


def test_contrast_is_robust_to_a_class_with_no_members():
    f = _classified([["A", "chr1", "+", 1, 2, "stop_in_exon"]])
    r = contrast(f, {"A"}, "x")
    assert r["n_in_frame"] == 0


def test_summarize_filters_by_reproducibility():
    f = _fate([
        ["A", "chr1", "+", 1, 2, "in_frame"],
        ["B", "chr1", "+", 3, 4, "stop_in_exon"],
    ])
    f["n_datasets"] = [3, 1]
    _, out, _ = summarize(f, {"x": {"A", "B"}}, min_datasets=3)
    assert out["n_in_frame"].iloc[0] == 1 and out["n_decay"].iloc[0] == 0


def test_summarize_needs_a_compendium_for_min_datasets():
    f = _fate([["A", "chr1", "+", 1, 2, "in_frame"]])
    with pytest.raises(SystemExit):
        summarize(f, {"x": {"A"}}, min_datasets=2)


def test_summarize_adjusts_across_lists():
    f = _classified([
        ["A", "chr1", "+", 1, 2, "in_frame"],
        ["B", "chr1", "+", 3, 4, "stop_in_exon"],
    ])
    _, out, _ = summarize(_fate([
        ["A", "chr1", "+", 1, 2, "in_frame"],
        ["B", "chr1", "+", 3, 4, "stop_in_exon"],
    ]), {"one": {"A"}, "two": {"A"}})
    assert "padj" in out.columns and "padj_reverse" in out.columns
    assert (out["padj"] >= out["p"]).all()


def test_program_vs_background_excludes_hosts_from_the_background():
    f = _classified([["A", "chr1", "+", 1, 2, "in_frame"]])
    r = program_vs_background(f, {"A", "B"}, {"A", "B", "C"}, "x")
    # A is a host, so the background is B and C only
    assert r["n_background"] == 2 and r["background_localized"] == 1


# ---- verdict --------------------------------------------------------------

def test_verdict_says_nothing_when_no_lists_were_tested():
    assert "nothing was tested" in _verdict(pd.DataFrame())


def test_verdict_requires_an_adjusted_p_not_a_raw_one():
    out = pd.DataFrame([{"list": "x", "p": 0.01, "padj": 0.4,
                         "p_reverse": 0.9, "padj_reverse": 0.9,
                         "odds_ratio": 4.0}])
    assert "no difference" in _verdict(out)


def test_verdict_fires_only_in_the_predicted_direction():
    out = pd.DataFrame([{"list": "x", "p": 0.001, "padj": 0.001,
                         "p_reverse": 0.9, "padj_reverse": 0.9,
                         "odds_ratio": 5.0}])
    assert "ARE enriched" in _verdict(out)


def test_verdict_reports_a_backwards_result_rather_than_calling_it_null():
    out = pd.DataFrame([{"list": "x", "p": 0.99, "padj": 0.99,
                         "p_reverse": 0.001, "padj_reverse": 0.001,
                         "odds_ratio": 0.2}])
    v = _verdict(out)
    assert "BACKWARDS" in v and "no difference" not in v


def test_read_gene_list_says_which_file_is_missing():
    with pytest.raises(SystemExit) as e:
        read_gene_list("/nope/mmc5.xlsx")
    assert "mmc5.xlsx" in str(e.value)


def test_read_gene_list_rejects_a_directory():
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(SystemExit) as e:
            read_gene_list(t)
        assert "directory" in str(e.value)


def test_read_gene_list_expands_a_tilde_path():
    import pathlib
    home = pathlib.Path.home()
    with tempfile.NamedTemporaryFile("w", suffix=".txt", dir=home,
                                     delete=False) as fh:
        fh.write("STMN2\n")
        name = os.path.basename(fh.name)
    try:
        assert read_gene_list(f"~/{name}") == {"STMN2"}
    finally:
        os.unlink(os.path.join(home, name))


def _twosheet(tmp):
    """A workbook shaped like mmc3: a gene list beside a DEG table."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Mouse axonal transcriptome"
    ws.append(["Axonal transcriptome (genes detected in 3/5 samples)"])
    ws.append(["Gene", "baseMean", "padj"])
    for g in ("STMN2", "ACTB", "GAP43"):
        ws.append([g, 1.0, 0.01])
    ws2 = wb.create_sheet("DEGs control axon vs. soma")
    ws2.append(["Differential Gene Expression between axons and somas"])
    ws2.append(["Gene", "log2FoldChange"])
    for g in ("UNC13A", "MYH7"):
        ws2.append([g, -3.0])
    p = os.path.join(tmp, "mmc3.xlsx")
    wb.save(p)
    return p


def test_sheet_pin_takes_only_that_sheet():
    with tempfile.TemporaryDirectory() as t:
        p = _twosheet(t)
        got = read_gene_list(p, sheet="Mouse axonal transcriptome")
        assert got == {"STMN2", "ACTB", "GAP43"}
        assert "MYH7" not in got


def test_without_a_sheet_pin_every_sheet_is_merged():
    with tempfile.TemporaryDirectory() as t:
        got = read_gene_list(_twosheet(t))
        # this is the contamination case the warning exists for
        assert {"STMN2", "MYH7"} <= got


def test_unknown_sheet_names_the_available_sheets():
    with tempfile.TemporaryDirectory() as t:
        with pytest.raises(SystemExit) as e:
            read_gene_list(_twosheet(t), sheet="Nope")
        assert "Mouse axonal transcriptome" in str(e.value)


def test_column_headers_are_not_taken_as_genes():
    with tempfile.TemporaryDirectory() as t:
        got = read_gene_list(_twosheet(t), sheet="Mouse axonal transcriptome")
        for junk in ("GENE", "BASEMEAN", "PADJ"):
            assert junk not in got


def test_a_title_row_contributes_nothing():
    with tempfile.TemporaryDirectory() as t:
        got = read_gene_list(_twosheet(t), sheet="Mouse axonal transcriptome")
        for junk in ("AXONAL", "TRANSCRIPTOME", "SAMPLES"):
            assert junk not in got


def test_header_tokens_keep_real_genes_that_look_like_words():
    # SET, FAU and CPE are in the published core neurite list
    for g in ("SET", "FAU", "CPE", "MAPT"):
        assert g not in HEADER_TOKENS

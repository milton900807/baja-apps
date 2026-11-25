"""Tests for the exon-age calculation.

The liftOver step is mocked throughout. A chain file is hundreds of megabytes
and the logic worth testing is what happens to the result of a lift, not
pyliftover's arithmetic: which of the three outcomes a position is called,
how strand is carried through a chain that maps to the opposite strand, and
how the age call bounds itself when an inner species lacks the site.
"""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.exon_age import (
    genomic_pos, genomic_span, acceptor_from_junction, flip, target_strand,
    dinucleotide, pyrimidine_fraction, classify, age_call, score_events,
    MIN_PY, TRACT,
)


class _Genome:
    """Returns a planted sequence, reverse-complemented on the minus strand."""
    _C = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}

    def __init__(self, seq, origin=1):
        self.seq, self.origin = seq.upper(), origin

    def sequence(self, chrom, lo, hi, strand):
        s = self.seq[int(lo) - self.origin:int(hi) - self.origin + 1]
        if strand == "-":
            s = "".join(self._C[c] for c in reversed(s))
        return s


class _Lift:
    """A stand-in for pyliftover: a dict of what each position maps to."""
    def __init__(self, table):
        self.table = table

    def lift(self, chrom, pos):
        return self.table.get((str(chrom), int(pos)))


# --- coordinates ----------------------------------------------------------------

def test_offsets_run_the_right_way_on_each_strand():
    assert genomic_pos(100, "+", -1) == 99
    assert genomic_pos(100, "-", -1) == 101


def test_a_span_is_returned_in_genomic_order():
    assert genomic_span(100, "+", -20, 2) == (80, 102)
    assert genomic_span(100, "-", -20, 2) == (98, 120)


def test_the_acceptor_is_the_last_intron_base():
    assert acceptor_from_junction(100, 200, "+") == 199
    assert acceptor_from_junction(100, 200, "-") == 101


# --- strand through a chain -----------------------------------------------------

def test_a_chain_that_maps_forward_leaves_the_strand_alone():
    assert target_strand("+", "+") == "+"
    assert target_strand("-", "+") == "-"


def test_a_chain_that_maps_to_the_other_strand_flips_the_gene():
    assert target_strand("+", "-") == "-"
    assert target_strand("-", "-") == "+"
    assert flip("+") == "-" and flip("-") == "+"


# --- reading the target ---------------------------------------------------------

def test_the_dinucleotide_is_read_in_transcript_orientation():
    # ...CCCCCCCCAG| on the plus strand, acceptor at the G
    g = _Genome("CCCCCCCCAG", origin=1)
    assert dinucleotide(g, "chr1", 10, "+") == "AG"


def test_the_minus_strand_reads_the_complement():
    # plus-strand CT at 1-2 is AG when read right to left on the minus strand
    g = _Genome("CTTTTTTTTT", origin=1)
    assert dinucleotide(g, "chr1", 1, "-") == "AG"


def test_a_pyrimidine_tract_scores_high():
    g = _Genome("T" * 40, origin=1)
    assert pyrimidine_fraction(g, "chr1", 30, "+") == pytest.approx(1.0)


def test_a_purine_run_scores_low():
    g = _Genome("A" * 40, origin=1)
    assert pyrimidine_fraction(g, "chr1", 30, "+") == pytest.approx(0.0)


def test_the_tract_is_measured_upstream_in_transcript_orientation():
    lo, hi = genomic_span(100, "-", *TRACT)
    assert lo > 100 - 1   # upstream on a minus-strand gene means higher coords


# --- the three outcomes ---------------------------------------------------------

def test_a_position_that_does_not_lift_is_sequence_absent():
    assert classify(None, "AG", 0.9) == "sequence absent"


def test_losing_the_ag_and_keeping_it_over_a_weak_tract_are_different_states():
    # They shared the label "site absent" until a run showed 40 of 103 macaque
    # absences held an intact AG, so the cutoff was making the call.
    assert classify(("chr1", 10, "+"), "GG", 0.9) == "dinucleotide lost"
    assert classify(("chr1", 10, "+"), "AG", 0.1) == "tract below cutoff"


def test_an_ag_rich_tract_fails_the_pyrimidine_test_by_construction():
    # STMN2 exon 2a: the UG element is replaced by an AG tract in Old World
    # monkeys. An AG tract is purine-rich, so it cannot pass a pyrimidine
    # cutoff. The state has to say that is what happened.
    assert classify(("chr8", 1, "+"), "AG", 0.529) == "tract below cutoff"


def test_an_ag_with_a_tract_is_site_present():
    assert classify(("chr1", 10, "+"), "AG", 0.9) == "site present"


def test_lifting_without_a_genome_is_reported_rather_than_guessed():
    assert classify(("chr1", 10, "+"), "", float("nan")) == "lifted, sequence unread"


def test_a_missing_tract_measurement_does_not_veto_an_ag():
    # NaN pyrimidine fraction means unread, not failed
    assert classify(("chr1", 10, "+"), "AG", float("nan")) == "site present"


# --- the age call ---------------------------------------------------------------

def test_age_stops_at_the_first_species_missing_the_site():
    per = {"macaque": "site present", "mouse": "site absent"}
    assert age_call(per, ["macaque", "mouse"]) == "macaque"


def test_a_site_in_the_outermost_species_reports_that_species():
    per = {"macaque": "site present", "mouse": "site present"}
    assert age_call(per, ["macaque", "mouse"]) == "mouse"


def test_nothing_in_any_species_is_human_only():
    # The case the old suite never covered: the test that claimed to check it
    # passed mouse="site present", so it was testing non-monotonicity instead.
    for a in ("dinucleotide lost", "tract below cutoff", "sequence absent"):
        per = {"macaque": a, "mouse": a}
        assert age_call(per, ["macaque", "mouse"]) == "human only"


def test_a_site_in_the_deeper_species_only_is_not_human_only():
    # Folding this into "human only" made 8 of 354 events, UNC13A among them,
    # indistinguishable from events with nothing in any species.
    for a in ("dinucleotide lost", "tract below cutoff", "sequence absent"):
        per = {"macaque": a, "mouse": "site present"}
        assert age_call(per, ["macaque", "mouse"]) == "non-monotonic"


def test_the_closest_relative_still_bounds_a_monotonic_age():
    per = {"macaque": "site present", "mouse": "dinucleotide lost"}
    assert age_call(per, ["macaque", "mouse"]) == "macaque"
    per = {"macaque": "site present", "mouse": "site present"}
    assert age_call(per, ["macaque", "mouse"]) == "mouse"


# --- end to end -----------------------------------------------------------------

def test_score_events_calls_each_species_and_sets_an_age():
    ev = pd.DataFrame([{"gene": "G", "chrom": "chr1", "strand": "+",
                        "acceptor": 10, "fate": "in_frame"}])
    g = _Genome("CCCCCCCCAG", origin=1)
    lifters = {"macaque": _Lift({("chr1", 10): ("chr1", 10, "+")}),
               "mouse": _Lift({})}
    out = score_events(ev, lifters, {"macaque": g}, ["macaque", "mouse"])
    assert out["macaque_state"].iloc[0] == "site present"
    assert out["mouse_state"].iloc[0] == "sequence absent"
    assert out["age"].iloc[0] == "macaque"


def test_an_event_with_no_genome_still_reports_whether_it_lifted():
    ev = pd.DataFrame([{"chrom": "chr1", "strand": "+", "acceptor": 10}])
    lifters = {"mouse": _Lift({("chr1", 10): ("chr5", 77, "+")})}
    out = score_events(ev, lifters, {}, ["mouse"])
    assert out["mouse_state"].iloc[0] == "lifted, sequence unread"
    assert out["mouse_pos"].iloc[0] == "chr5:77:+"


def test_a_chain_to_the_opposite_strand_is_recorded_as_such():
    ev = pd.DataFrame([{"chrom": "chr1", "strand": "+", "acceptor": 10}])
    lifters = {"mouse": _Lift({("chr1", 10): ("chr5", 77, "-")})}
    out = score_events(ev, lifters, {}, ["mouse"])
    assert out["mouse_pos"].iloc[0] == "chr5:77:-"


# --- reading a foreign assembly -------------------------------------------------
#
# The two FASTAs this runs against come from different sources and are keyed
# differently: a GENCODE mouse file uses chr1, an Ensembl rhesus file uses 1,
# and the chains emit UCSC names for both. These tests pin the resolution so a
# rhesus run cannot come back as "no sequence" for a naming reason.

from bajasplice.evaluate.exon_age import TargetFasta


def _fasta(tmp_path, name, recs):
    p = tmp_path / name
    p.write_text("".join(f">{k}\n{v}\n" for k, v in recs.items()))
    return p


def test_an_ensembl_keyed_fasta_answers_to_ucsc_names(tmp_path):
    fa = TargetFasta(_fasta(tmp_path, "ens.fa", {"1": "ACGTACGTAC"}))
    assert fa.resolve("chr1") == "1"
    assert fa.resolve("1") == "1"
    assert fa.sequence("chr1", 1, 4) == "ACGT"


def test_a_ucsc_keyed_fasta_answers_to_ensembl_names(tmp_path):
    fa = TargetFasta(_fasta(tmp_path, "ucsc.fa", {"chr1": "ACGTACGTAC"}))
    assert fa.resolve("1") == "chr1"
    assert fa.resolve("chr1") == "chr1"
    assert fa.sequence("1", 1, 4) == "ACGT"


def test_a_contig_the_file_does_not_have_reads_empty_not_wrong(tmp_path):
    # Must not fall through to some other contig: a wrong base would be
    # scored as a real site.
    fa = TargetFasta(_fasta(tmp_path, "one.fa", {"chr1": "ACGT"}))
    assert fa.resolve("chr9") is None
    assert fa.sequence("chr9", 1, 4) == ""


def test_the_minus_strand_is_reverse_complemented(tmp_path):
    fa = TargetFasta(_fasta(tmp_path, "rc.fa", {"chr1": "ACGTTTTTTT"}))
    assert fa.sequence("chr1", 1, 4, "+") == "ACGT"
    assert fa.sequence("chr1", 1, 4, "-") == "ACGT".translate(
        str.maketrans("ACGT", "TGCA"))[::-1]


def test_a_span_off_the_end_is_clipped_rather_than_raising(tmp_path):
    fa = TargetFasta(_fasta(tmp_path, "edge.fa", {"chr1": "ACGT"}))
    assert fa.sequence("chr1", 3, 99) == "GT"
    assert fa.sequence("chr1", -5, 2) == "AC"
    assert fa.sequence("chr1", 99, 120) == ""


def test_no_species_check_runs_so_a_foreign_genome_is_accepted(tmp_path):
    # GenomeReader would raise here: these are mouse-shaped contigs read by a
    # process running as human. That guard protects the training path and
    # would make the cross-species lift impossible.
    recs = {f"chr{i}": "ACGTACGTAG" for i in range(1, 20)}
    fa = TargetFasta(_fasta(tmp_path, "mm.fa", recs))
    assert fa.sequence("chr19", 9, 10) == "AG"


def test_mitochondrial_naming_resolves_both_ways(tmp_path):
    fa = TargetFasta(_fasta(tmp_path, "mt.fa", {"MT": "ACGT"}))
    assert fa.resolve("chrM") == "MT"
    assert fa.sequence("chrM", 1, 2) == "AC"


# --- loading the events table ---------------------------------------------------
#
# These read a real file from disk. The previous tests all called score_events
# directly, so main()'s own parsing was never executed and a read_csv that
# raises on every input passed the suite.

from bajasplice.evaluate.exon_age import read_events
from bajasplice.evaluate.exon_age import main as exon_age_main


def test_a_tab_file_with_exon_spans_loads_and_derives_the_acceptor(tmp_path):
    p = tmp_path / "fate.tsv"
    p.write_text("gene\tchrom\tstrand\ta_start\ta_end\tfate\n"
                 "AGRN\tchr1\t+\t1000\t1086\tin_frame\n"
                 "STMN2\tchr8\t-\t2000\t2100\tframeshift\n")
    ev = read_events(p)
    assert list(ev["acceptor"]) == [999, 2101]
    assert list(ev["fate"]) == ["in_frame", "frameshift"]


def test_a_comma_file_loads_too_so_the_separator_is_sniffed(tmp_path):
    p = tmp_path / "fate.csv"
    p.write_text("gene,chrom,strand,a_start,a_end\nAGRN,chr1,+,1000,1086\n")
    assert list(read_events(p)["acceptor"]) == [999]


def test_an_explicit_acceptor_column_is_used_as_given(tmp_path):
    p = tmp_path / "acc.tsv"
    p.write_text("chrom\tstrand\tacceptor\nchr1\t+\t4242\n")
    assert list(read_events(p)["acceptor"]) == [4242]


def test_a_table_with_nothing_usable_says_what_it_found(tmp_path):
    p = tmp_path / "bad.tsv"
    p.write_text("gene\tchrom\tstrand\nAGRN\tchr1\t+\n")
    with pytest.raises(SystemExit) as e:
        read_events(p)
    assert "a_start" in str(e.value)


def test_main_reaches_the_chain_check_which_means_the_read_worked(tmp_path):
    # The regression this pins: read_events raising before main() can get as
    # far as complaining about a missing --chain.
    p = tmp_path / "fate.tsv"
    p.write_text("gene\tchrom\tstrand\ta_start\ta_end\nAGRN\tchr1\t+\t1000\t1086\n")
    with pytest.raises(SystemExit) as e:
        exon_age_main(["--events", str(p)])
    assert "chain" in str(e.value)


# --- reporting the right statistic ----------------------------------------------
#
# The first run printed a fate-table chi-square directly beneath the in-frame
# shares, which reads as though the gradient were significant. It was not:
# in-frame alone gave p=0.275 while the table gave p=0.0034, and deleting the
# in-frame column made the table p smaller still.

from bajasplice.evaluate.exon_age import inframe_trend


def _table(rows):
    return pd.DataFrame(rows, index=["human only", "macaque", "mouse"],
                        columns=["frameshift", "in_frame", "stop_no_signal",
                                 "terminating"])


def test_the_trend_test_sees_a_real_rising_gradient():
    # in-frame share climbing 5% -> 25% -> 50% with age
    t = _table([[19, 1, 0, 0], [15, 5, 0, 0], [10, 10, 0, 0]])
    z, p = inframe_trend(t)
    assert z > 0 and p < 0.01


def test_the_trend_test_sees_an_inverted_gradient_as_negative():
    t = _table([[10, 10, 0, 0], [15, 5, 0, 0], [19, 1, 0, 0]])
    z, p = inframe_trend(t)
    assert z < 0 and p < 0.01


def test_the_observed_table_is_not_significant_for_the_gradient():
    # the actual 354-event run; the claim it was printed next to was false
    t = _table([[36, 19, 20, 43], [32, 21, 51, 82], [7, 4, 8, 31]])
    z, p = inframe_trend(t)
    # the real values: z = -1.595, p = 0.111. Not significant, and the sign
    # runs backwards to what exonization predicts.
    assert p > 0.05, f"this run's gradient must read as null, got p={p}"
    assert z < 0, "and it ran backwards to the prediction"


def test_the_trend_test_ignores_shifts_in_the_other_fate_classes():
    # frameshift and terminating swap hard, in-frame share held flat at 20%.
    # A fate-table chi-square lights up here; the gradient test must not.
    t = _table([[40, 10, 5, 5], [20, 10, 5, 25], [2, 10, 5, 43]])
    from scipy import stats as sps
    _, table_p, _, _ = sps.chi2_contingency(t.values)
    assert table_p < 0.001
    z, p = inframe_trend(t)
    assert p > 0.9, f"in-frame is flat, trend must be null, got p={p}"


def test_a_single_age_class_has_no_trend_to_report():
    t = pd.DataFrame([[10, 5, 0, 0]], index=["human only"],
                     columns=["frameshift", "in_frame", "stop_no_signal",
                              "terminating"])
    assert inframe_trend(t) is None


# --- output columns -------------------------------------------------------------

from bajasplice.evaluate.exon_age import passthrough_columns


def test_extra_input_columns_are_carried_into_the_output():
    # parent_acceptor, dist_exon and is_decoy were dropped, which left the
    # decoy run comparable only in aggregate: no pairing, no stratification.
    ev = pd.DataFrame(columns=["gene", "chrom", "strand", "acceptor", "fate",
                               "parent_acceptor", "dist_exon", "is_decoy"])
    got = passthrough_columns(ev, ["macaque", "mouse"])
    assert set(got) == {"parent_acceptor", "dist_exon", "is_decoy"}


def test_generated_columns_are_not_duplicated_from_the_input():
    ev = pd.DataFrame(columns=["chrom", "strand", "acceptor", "gene", "fate",
                               "frame_disrupting", "age"])
    assert passthrough_columns(ev, ["macaque"]) == []


def test_an_input_cannot_shadow_a_per_species_result_column():
    # A stale macaque_state in the input must not survive and be mistaken for
    # this run's call.
    ev = pd.DataFrame(columns=["chrom", "strand", "acceptor", "macaque_state",
                               "macaque_py", "keepme"])
    assert passthrough_columns(ev, ["macaque"]) == ["keepme"]

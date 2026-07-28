from Bio import SeqIO, AlignIO
from Bio.Align.Applications import ClustalwCommandline
from Bio.Seq import Seq
from Bio.Alphabet import IUPAC
from Bio.Emboss.Applications import Primer3Commandline
import os

def align_sequences(sequences, output_format='fasta', aligned_output='aligned.fasta'):
    """Aligns a list of sequences using ClustalW and saves the alignment."""
    with open("temp_sequences.fasta", "w") as output_handle:
        SeqIO.write(sequences, output_handle, output_format)
    clustalw_exe = "clustalw2"  # Ensure ClustalW is correctly installed and path is set
    clustalw_cline = ClustalwCommandline(clustalw_exe, infile="temp_sequences.fasta")
    stdout, stderr = clustalw_cline()
    align = AlignIO.read("aligned.fasta", output_format)
    os.remove("temp_sequences.fasta")
    return align

def find_common_amplicon(align):
    """Finds a common region suitable for priming across all aligned sequences."""
    consensus = align[0].seq
    for record in align[1:]:
        consensus = consensus & record.seq  # Bitwise AND to find common regions
    return consensus

def design_primers(template):
    """Uses EMBOSS primer3 to design primers for a given sequence."""
    primer3_cline = Primer3Commandline(sequence=template, auto=True)
    stdout, stderr = primer3_cline()
    print(stdout)

def main():
    sequence_files = ['sequence1.fasta', 'sequence2.fasta', 'sequence3.fasta']
    sequences = [SeqIO.read(seq_file, 'fasta') for seq_file in sequence_files]
    alignment = align_sequences(sequences)
    common_region = find_common_amplicon(alignment)
    if common_region:
        design_primers(str(common_region))
    else:
        print("No common amplicon found.")

if __name__ == "__main__":
    main()

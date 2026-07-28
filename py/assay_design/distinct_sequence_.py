from Bio import SeqIO, AlignIO
from Bio.Align.Applications import ClustalwCommandline
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.Alphabet import IUPAC
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

def find_unique_regions(align):
    """Finds regions that are unique to each sequence in the alignment."""
    unique_regions = []
    consensus = align[0].seq.tomutable()
    for i in range(len(align[0].seq)):
        column = align[:, i]
        if column.count(column[0]) == len(column):
            consensus[i] = 'N'  # Replace consensus position with N if all are the same
    for record in align:
        positions = [i for i, (a, b) in enumerate(zip(record.seq, consensus)) if a != 'N' and b != 'N']
        if positions:
            start, end = positions[0], positions[-1]
            unique_regions.append(SeqRecord(record.seq[start:end+1], id=record.id))
    return unique_regions

def design_primers_for_unique_regions(unique_regions):
    """Designs primers for each unique region identified."""
    for region in unique_regions:
        # Here you could integrate primer design software or logic
        print(f"Primers for {region.id}: sequence {region.seq}")

def main():
    sequence_files = ['sequence1.fasta', 'sequence2.fasta', 'sequence3.fasta']
    sequences = [SeqIO.read(seq_file, 'fasta') for seq_file in sequence_files]
    alignment = align_sequences(sequences)
    unique_regions = find_unique_regions(alignment)
    design_primers_for_unique_regions(unique_regions)

if __name__ == "__main__":
    main()

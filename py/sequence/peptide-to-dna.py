from Bio.Blast import NCBIWWW, NCBIXML
import time

def get_optimized_codon_table():
    return {
        'A': 'GCG', 'C': 'TGC', 'D': 'GAC', 'E': 'GAG', 'F': 'TTC', 'G': 'GGC',
        'H': 'CAC', 'I': 'ATC', 'K': 'AAG', 'L': 'CTG', 'M': 'ATG', 'N': 'AAC',
        'P': 'CCG', 'Q': 'CAG', 'R': 'CGG', 'S': 'AGC', 'T': 'ACC', 'V': 'GTG',
        'W': 'TGG', 'Y': 'TAC', 'Aib': 'GCG'  # Assuming Aib uses Alanine codon
    }

def peptide_to_optimized_dna(peptide_sequence):
    codon_table = get_optimized_codon_table()
    return ''.join(codon_table[aa] for aa in peptide_sequence)

# HIS-ALA-GLU-GLY-THR-PHE-THR-SER-ASP-VAL-SER-SER
# peptide = ['A', 'A', 'K', 'E', 'F', 'I', 'A', 'W', 'L', 'V', 'R', 'G', 'R', 'G']
peptide = ["H", "A", "E", "G", "T", "F", "T", "S", "D", "V", "S", "S"]

# Get optimized DNA sequence
dna_sequence = peptide_to_optimized_dna(peptide)
print(f"Optimized DNA Sequence: {dna_sequence}")

# Perform BLAST search against all known reference genomes
print("Running BLAST for optimized sequence against all known reference genomes...")
result_handle = NCBIWWW.qblast("blastn", "refseq_genomic", dna_sequence)
blast_record = NCBIXML.read(result_handle)
time.sleep(2)  # Avoid overwhelming NCBI servers

# Parse and display results with species names
print("\nBLAST Results:")
for alignment in blast_record.alignments:
    species_name = alignment.title.split('|')[4] if '|' in alignment.title else alignment.title
    common_name = "Unknown"
    if "Homo sapiens" in species_name:
        common_name = "Human"
    elif "Mus musculus" in species_name:
        common_name = "Mouse"
    elif "Rattus norvegicus" in species_name:
        common_name = "Rat"
    
    for hsp in alignment.hsps:
        print(f"Match: {species_name} ({common_name})")
        print(f"Score: {hsp.score}, E-value: {hsp.expect}")
        print(f"Alignment:\n{hsp.sbjct}\n")

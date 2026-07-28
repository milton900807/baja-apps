import pandas as pd
import numpy as np
from Levenshtein import distance as lev_distance


from Bio.Seq import Seq
from Bio.SeqUtils import six_frame_translations

# Example DNA sequence
def find_orfs_and_translate(dna_seq):
    proteins = []
    seq_obj = Seq(dna_seq)
    for frame in range(3):  # Loop through the three forward reading frames
        length = len(seq_obj)
        for start_pos in range(frame, length, 3):
            codon = seq_obj[start_pos:start_pos+3]
            if codon == 'ATG':  # Start codon
                for end_pos in range(start_pos+3, length, 3):
                    stop_codon = seq_obj[end_pos:end_pos+3]
                    if stop_codon in ['TAA', 'TAG', 'TGA']:  # Stop codons
                        orf_seq = seq_obj[start_pos:end_pos+3]
                        protein = orf_seq.translate(to_stop=True)
                        proteins.append(str(protein))
                        break  # Move to the next start codon
  
  
  
    return proteins








from Bio.Seq import Seq
import pandas as pd
from Levenshtein import distance as lev_distance

# Assuming you have a function like `find_orfs_and_translate(dna_seq)` defined as above

def compare_to_reference(protein_seq, reference_seq, window_size=10):
    distances = []
    for start in range(len(protein_seq) - window_size + 1):
        window = protein_seq[start:start + window_size]
        ref_window = reference_seq[start:start + window_size]
        dist = lev_distance(window, ref_window)
        distances.append(dist)
    return distances

def process_sequences(row, reference_protein):
    dna_seq = row['canonical_transcript_sequence']
    orf_proteins = find_orfs_and_translate(dna_seq)
    all_distances = [compare_to_reference(prot, reference_protein) for prot in orf_proteins]
    return all_distances


# Example consensus sequence
reference_protein = "MDSSAAPTNASNCTDALAYSSCSPAPSPGSWVNLSHLDGNLSDPCGPNRTDLGGRDSLCPPTGSPSMITAITIMALYSIVCVVGLFGNFLVMYVIVRYTKMKTATNIYIFNLALADALATSTLPFQSVNYLMGTWPFGTILCKIVISIDYYNMFTSIFTLCTMSVDRYIAVCHPVKALDFRTPRNAKIINVCNWILSSAIGLPVMFMATTKYRQGSIDCTLTFSHPTWYWENLLKICVFIFAFIMPVLIITVCYGLMILRLKSVRMLSGSKEKDRNLRRITRMVLVVVAVFIVCWTPIHIYVIIKALVTIPETTFQTVSWHFCIALGYTNSCLNPVLYAFLDENFKRCFREFCIPTSSNIEQQNSTRIRQNTRDHPSTANTVDRTNHQS"
csv_file_path = '../bt-seq.csv'
df = pd.read_csv(csv_file_path)
df['orf_distances'] = df.apply(process_sequences, args=(reference_protein,), axis=1)
df.to_csv('modified_table_with_distances.csv', index=False)
















# Find ORFs and translate to protein sequences
# protein_array = find_orfs_and_translate(dna_sequence)





# print(protein_array)




# # Function to calculate Levenshtein distances with sliding window
# def calculate_distances_sliding_window(sequence, consensus, window_size=1000):
#     distances = []
#     # The end condition is until we reach the end of the shortest sequence
#     min_length = min(len(sequence), len(consensus))
#     for start in range(min_length - window_size + 3):
#         end = start + window_size
#         window_seq = sequence[start:end]
#         window_cons = consensus[start:end]
#         dist = lev_distance(window_seq, window_cons)
#         distances.append(dist)
#     return distances

# # Replace 'canonical_transcript_sequence' with distances array
# df['canonical_transcript_distance'] = df['canonical_transcript_sequence'].apply(
#     lambda x: calculate_distances_sliding_window(x, consensus_sequence)
# )

# # Save the modified DataFrame to a new CSV file
# df.to_csv('bt-le-sliding.csv', index=False)
# # Replace each canonical_transcript_sequence with the array of distances
# df['canonical_transcript_sequence'] = df['canonical_transcript_sequence'].apply(
#     lambda x: calculate_distances(x, consensus_sequence)
# )

# # Save the modified DataFrame to a new CSV file
# new_csv_file_path = 'bt-le.csv'
# df.to_csv(new_csv_file_path, index=False)

# print(f"Modified DataFrame saved to {new_csv_file_path}")

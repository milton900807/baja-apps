from Bio import Seq
from Bio.SeqUtils import GC
# import matplotlib.pyplot as plt
import numpy as np
from ion import works

def calculate_conservation_score(seq, window_size):
    conservation_scores = []
    seq_len = len(seq)
    for i in range(seq_len):
        window_start = max(0, i - window_size // 2)
        window_end = min(seq_len, i + window_size // 2 + 1)
        window = seq[window_start:window_end]
        conservation_scores.append(GC(window))
    return conservation_scores

def highlight_conservation(seq, conservation_scores, threshold):
    highlighted_seq = ""
    for i, score in enumerate(conservation_scores):
        if score >= threshold:
            highlighted_seq += seq[i].upper()
        else:
            highlighted_seq += seq[i].lower()
    return highlighted_seq

try: 
    sequence_str = works.param (1)
    window_size = works.param (2)
    conservation_scores = calculate_conservation_score(sequence_str, window_size)
    works.resolve( (conservation_scores))
except: 
    works.resolve('')


# if __name__ == "__main__":
#     # Example nucleic acid sequence
#     sequence_str = "AGCTGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG"

#     # Define window size for calculating conservation (odd number)
#     window_size = 5

#     # Calculate conservation scores
#     conservation_scores = calculate_conservation_score(sequence_str, window_size)

#     # Set threshold for highlighting conservation (e.g., 50% GC content)
#     threshold = 50

#     # Generate highlighted sequence
#     highlighted_sequence = highlight_conservation(sequence_str, conservation_scores, threshold)

#     # Print the highlighted sequence
#     print("Original Sequence: ", sequence_str)
#     print("Highlighted Sequence: ", highlighted_sequence)

#     # Plot the conservation scores
#     x = np.arange(len(conservation_scores))
#     plt.plot(x, conservation_scores, label="Conservation Score", marker="o", linestyle="-")
#     plt.axhline(y=threshold, color="red", linestyle="--", label="Threshold")
#     plt.xlabel("Position")
#     plt.ylabel("GC Content (%)")
#     plt.title("Conservation in Nucleic Acid Sequence")
#     plt.legend()
#     plt.show()

#!/usr/bin/env python

from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys

# write an algorithm that traverses a long  dna sequence called the reference with a window
#   defined by a variable n and stores this reference window sequence in a variable called reference_window and then uses this reference_window 
#   sequence to find 
#   matches within a series of other long dna sequences  

reference_sequence = works.param (1)
target_sequences = works.param (2)

def find_matches(reference_sequence, dna_sequences, n):
    matches = []
    
    for dna_sequence in dna_sequences:
        for i in range(len(dna_sequence) - n + 1):
            reference_window = reference_sequence[i:i + n]
            window = dna_sequence[i:i + n]
            
            if reference_window == window:
                matches.append((i, i + n - 1))
    
    return matches

# Example usage:
reference_sequence = "AGCTAGCT"
dna_sequences = [
    "ACGTAGCTAGCTAGCTAGCTAGCTAGCTAGCT",
    "TAGCTAGCTAGCTAGCTAGCTAGCTAGCTAGC",
    "AGCTAGCTAGCTAGCTAGCTAGCTAGCTAGCT"
]
window_length = len(reference_sequence)

result = find_matches(reference_sequence, dna_sequences, window_length)
print(result)

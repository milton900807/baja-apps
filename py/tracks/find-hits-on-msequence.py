#!/usr/bin/env python
from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys
import random




# refs = works.param (1)
# vars = works.param (2)






def introduce_variants(base_sequence, variants):
    """
    Introduce variants into the base DNA sequence.
    
    Parameters:
    - base_sequence (str): The original DNA sequence.
    - variants (list): List of tuples containing the operation, position, and value.
                       Operation: "sub" for substitution, "ins" for insertion, "del" for deletion
                       Position: 0-based index where the operation will be performed
                       Value: The nucleotide(s) involved in the operation or length of deletion
    
    Returns:
    - str: The new DNA sequence with introduced variants.
    """
    base_sequence_list = list(base_sequence)
    
    for operation, position, value in variants:
        if operation == 'snp':
            if position < len(base_sequence_list):
                base_sequence_list[position] = value
            else:
                print(f"Warning: Substitution position {position} is out of range. Skipping.")
        
        elif operation == 'ins':
            if position <= len(base_sequence_list):
                base_sequence_list.insert(position, value)
            else:
                print(f"Warning: Insertion position {position} is out of range. Skipping.")
        
        elif operation == 'del':
            if position < len(base_sequence_list):
                if isinstance(value, int):
                    del base_sequence_list[position:position + value]
                else:
                    del base_sequence_list[position]
            else:
                print(f"Warning: Deletion position {position} is out of range. Skipping.")
    
    return ''.join(base_sequence_list)

def lift_coordinates(position, variants):
    """
    Translate a position from the mutated sequence back to the original sequence.
    
    Parameters:
    - position (int): The position in the mutated sequence.
    - variants (list): List of tuples containing the operation, position, and value.
                       Operation: "sub" for substitution, "ins" for insertion, "del" for deletion
                       Position: 0-based index where the operation will be performed
                       Value: The nucleotide(s) involved in the operation or length of deletion
    
    Returns:
    - int or None: The corresponding position in the original sequence. Returns None if not applicable.
    """
    offset = 0
    
    for operation, var_position, value in sorted(variants, key=lambda x: x[1]):
        
        if var_position > position:
            break
        
        if operation == 'ins':
            if var_position <= position:
                offset -= len(value)
        
        elif operation == 'del':
            del_length = value if isinstance(value, int) else 1
            if var_position <= position < var_position + del_length:
                return None
            if var_position <= position:
                offset += del_length
                
    return position + offset

def complement(sequence):
    """
    Generate the complement of a DNA sequence.
    
    Parameters:
    - sequence (str): The original DNA sequence.
    
    Returns:
    - str: The complement of the original DNA sequence.
    """
    complement_dict = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C'}
    complement_sequence = [complement_dict[base] for base in sequence]
    return ''.join(complement_sequence)


def reverse_complement(sequence):
    """
    Generate the reverse complement of a DNA sequence.
    
    Parameters:
    - sequence (str): The original DNA sequence.
    
    Returns:
    - str: The reverse complement of the original DNA sequence.
    """
    complement_dict = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C'}
    complement_sequence = [complement_dict[base] for base in reversed(sequence)]
    return ''.join(complement_sequence)

def find_all_indices(reference, queries):
    """
    Find all the indices of a list of query sequences within a reference sequence.
    
    Parameters:
    - reference (str): The reference DNA sequence.
    - queries (list): A list of query DNA sequences to find in the reference.
    
    Returns:
    - dict: A dictionary mapping each query to a list of its indices in the reference sequence.
    """
    indices = {}
    for query in queries:
        query_length = len(query)
        query_indices = []
        
        for i in range(len(reference) - query_length + 1):
            if reference[i:i + query_length] == query:
                query_indices.append(i)
        
        indices[query] = query_indices
    
    return indices

def print_sequence_difference(seq1, seq2):
    """
    Print the differences between two DNA sequences of the same length.
    
    Parameters:
    - seq1 (str): The first DNA sequence.
    - seq2 (str): The second DNA sequence.
    
    Returns:
    - None: Prints the differences directly.
    """
    if len(seq1) != len(seq2):
        print("Sequences must be of the same length.")
        return
    
    differences = []
    for i, (base1, base2) in enumerate(zip(seq1, seq2)):
        if base1 != base2:
            differences.append(f"Position {i}: {base1} != {base2}")
    
    if differences:
        print("Differences between the sequences:")
        for diff in differences:
            print(diff)
    else:
        print("The sequences are identical.")




# if __name__ == '__main__':
#     refs=argus[0]
#     vars = argus[1]
#     l = argus[2]
#     direction = argus[3]
#     tseq = []
#     mutated_sequence = introduce_variants ( refs, vars )

#     print ( f'primary ', l)
#     result = find_all_indices(refs, l)
#     print ( result )

#     for seq in l:
#         if direction > 0:
#             t = reverse_complement ( seq )
#             tseq.append ( t )
#         else:
#             t = complement ( seq )
#             tseq.append ( t )


    # # print_sequence_difference(refs, mutated_sequence)
    # print ( f' seq match ', tseq )

    # result = find_all_indices(mutated_sequence, tseq)
    # print ( result )
    # adjusted = {}
    # for query, indices in result.items():
    #     indices_a = []
    #     for position in indices:
    #         indices_a.append (lift_coordinates ( position, vars ) )
    #     adjusted[query] = indices_a


refs = works.param (1)
vars = works.param (2)
l = works.param(3)
direction = works.param(4)

tseq = []
mutated_sequence = introduce_variants ( refs, vars )
for seq in l:
    if direction >= 0:
        t = reverse_complement ( seq )
        tseq.append ( t )
    else:
        t = complement ( seq )
        tseq.append ( t )


result = find_all_indices(mutated_sequence, tseq)


adjusted = {}
v = []

total_queries = len(result)  # Total number of queries to process
processed_queries = 0  # To keep track of the processed queries
percent = 0  # Initialize percent

for query, indices in result.items():
    indices_a = []
    tindex = tseq.index(query)
    synthesis = l[tindex]

    for position in indices:
        indices_a.append(lift_coordinates(position, vars))
    
    adjusted[query] = indices_a
    for hit in indices_a:
        v.append([synthesis, synthesis, query, hit])

    # Update the number of processed queries
    processed_queries += 1
    # Calculate the completion percentage
    percent = (processed_queries / total_queries) * 100
    works.progress ( percent )


#  [
#      "",
#      "GGACAAAACTGCAAGT",
#      "ACTTGCAGTTTTGTCC",
#      1622,
#      0,
#      "Reverse Complement",
#      -1
#  ]



    # print( adjusted )
works.resolve ( v )

# new_sequence = introduce_variants(refs, vars)
# works.resolve( {'result_sequence': new_sequence } )
# nv = lift_coordinates ( 5, vars )
# print ( f' nv ', nv )

    # variants = [
    #     ('sub', 5, 'G'),   # Substitute 'G' at position 5
    #     ('ins', 20, 'C'),  # Insert 'C' at position 20
    #     ('del', 37, 3),    # Delete 3 nucleotides starting at position 37
    #     ('sub', 58, 'T'),  # Substitute 'T' at position 58
    #     ('ins', 80, 'A')   # Insert 'A' at position 80
    # ]
    
    # # Introduce variants
    # new_sequence = introduce_variants(base_sequence, variants)
    # print("New sequence with variants:")
    # print(new_sequence)

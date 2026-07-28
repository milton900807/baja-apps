from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys
from Bio.pairwise2 import format_alignment
import Levenshtein
from Bio import pairwise2
import numpy as np




try:
    
    
     
    query_sequence = works.param (1)
    target_sequence = works.param (2)
    
    def levenshtein_distance(s1, s2):
        m, n = len(s1), len(s2)
        if m < n:
            return levenshtein_distance(s2, s1)

        dp = [0] * (n + 1)

        for j in range(1, n + 1):
            dp[j] = j

        for i in range(1, m + 1):
            prev = dp[0]
            dp[0] = i
            for j in range(1, n + 1):
                cost = 0 if s1[i - 1] == s2[j - 1] else 1
                temp = dp[j]
                dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
                prev = temp
        return dp[n]

    def find_substring_with_edit_distance(larger_string, substring, max_distance):
        positions = []

        for i in range(len(larger_string) - len(substring) + 1):
            window = larger_string[i:i + len(substring)]
            distance = levenshtein_distance(substring, window)

            if distance <= max_distance:
                positions.append(i)

        return positions

    print ( ' -  ')
    positions = find_substring_with_edit_distance(target_sequence, query_sequence, 1)
    works.resolve({'start': positions })

except Exception as e:
    print(f"An error occurred: {e}")
    works.resolve("{e}")



    # window_size = len(query_sequence)
    # def find_best_alignment(target, query, window):
    #     best_alignment = None
    #     best_score = float("-inf")
        
    #     for i in range(len(target) - len(query) + int(window_size/2)):
    #         subsequence = target[i:i + len(query)]
            
    #         distance = Levenshtein.distance(subsequence, query)
            
    #         if distance <= window:
    #             expanded_target = target[i:i + len(query) + window]
                
    #             alignments = pairwise2.align.globalxx(expanded_target, query)
                
    #             for alignment in alignments:
    #                 score = alignment[2]
    #                 if score > best_score:
    #                     best_score = score
    #                     best_alignment = alignment
        
    #     if best_alignment:
    #         return best_alignment
    #     else:
    #         reversed_query = query[::-1]
    #         return find_best_alignment(target, reversed_query, window)

    # # Call the recursive function to find the best alignment
    # best_alignment = find_best_alignment(target_sequence, query_sequence, window_size)

    # # Check if a valid alignment was found
    # if best_alignment:
    #     # Extract alignment details
    #     aligned_target = best_alignment[0]
    #     aligned_query = best_alignment[1]
    #     alignment_score = best_alignment[2]
    #     start_position = best_alignment[3]
    #     end_position = best_alignment[4]

    #     # Print alignment details
    #     print("Target Sequence:", aligned_target)
    #     print("Query Sequence:", aligned_query)
    #     print("Alignment Score:", alignment_score)
    #     print("Optimal Start Position:", start_position)
    #     print("Optimal End Position:", end_position)

    #     # Display the alignment
    #     print("\nOptimal Alignment:")
    #     print(format_alignment(*best_alignment))

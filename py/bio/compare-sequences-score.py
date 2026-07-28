#!/usr/bin/env python
from Levenshtein import distance
from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys
import math

def find_closest_dna_match_normalized(long_sequence, short_sequence):
    if len(short_sequence) > len(long_sequence):
        return "Error: Short sequence is longer than the long sequence"

    best_match_start_index = -1
    best_match_end_index = -1
    highest_score = -1

    short_seq_length = len(short_sequence)

    for i in range(len(long_sequence) - short_seq_length + 1):
        current_segment = long_sequence[i:i + short_seq_length]
        score = sum(1 for a, b in zip(current_segment, short_sequence) if a == b) / short_seq_length

        if score > highest_score:
            highest_score = score
            best_match_start_index = i
            best_match_end_index = i + short_seq_length - 1

    return best_match_start_index, best_match_end_index, (highest_score*100)

try: 
    s1 = works.param (1)
    s2 = works.param (2)
    
    if s2 is not None:
        # result  = find_closest_dna_match_details ( s1, s2 )
        # print ( result )
        match_start, match_end, score  = find_closest_dna_match_normalized ( s1, s2 )
        
        if math.isnan(score):
            print ( ' score was not possible ')
            works.resolve( {"msg":"failed" })
        else: 
            print (  {"index":match_start, "match_end": match_end, "percent": score })
            works.resolve( {"match_start":match_start, "match_end": match_end, "percent": score })
except Exception as e:
    works.resolve({'status':'failed'})
    print (e)

    # for hsp in alignment.hsps:
    #     print ('****Alignment****')
    #     print ('sequence:', alignment.title)
    #     print ('length:', alignment.length)
    #     print ('e value:', hsp.expect)
    #     print (hsp.query)
    #     print ( hsp.match)
    #     print (hsp.sbjct)
    #     alignment = { 
    #         "name": alignment.title,
    #         "length":alignment.length,
    #         "query":str(hsp.query ),
    #         "match":str(hsp.match ),
    #         "subject":str(hsp.sbjct)
    #     }


# seq1 = SeqRecord(Seq(s1),
#                    id="seq1")
# seq2 = SeqRecord(Seq(s2),
#                    id="seq2")

# f1 = tempfile.NamedTemporaryFile(suffix='.fasta', delete=False)
# f2 = tempfile.NamedTemporaryFile(suffix='.fasta', delete=False)

# f1.write((seq1.format("fasta")).encode())
# f2.write((seq2.format("fasta")).encode())
# f1.flush()
# f2.flush()

# # Run BLAST and parse the output as XML
# output = NcbiblastpCommandline( query=f1.name, subject=f2.name, outfmt=5)()[0]
# print (output)

# blast_result_record = NCBIXML.read(StringIO(output))
# # Print some information on the result
# for alignment in blast_result_record.alignments:
#     for hsp in alignment.hsps:
#         print ('****Alignment****')
#         print ('sequence:', alignment.title)
#         print ('length:', alignment.length)
#         print ('e value:', hsp.expect)
#         print (hsp.query)
#         print ( hsp.match)
#         print (hsp.sbjct)
#         alignment = { 
#             "name": alignment.title,
#             "length":alignment.length,
#             "query":str(hsp.query ),
#             "match":str(hsp.match ),
#             "subject":str(hsp.sbjct)
#         }
#         works.resolve( {'results': alignment } )

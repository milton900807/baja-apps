#!/usr/bin/env python
from Levenshtein import distance
from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys
import math

# def find_closest_dna_match_details(long_sequence, short_sequence):
#     if len(short_sequence) > len(long_sequence):
#         return "Error: Short sequence is longer than the long sequence"

#     best_match_start_index = -1
#     best_match_end_index = -1
#     highest_score = -1

#     for i in range(len(long_sequence) - len(short_sequence) + 1):
#         current_segment = long_sequence[i:i + len(short_sequence)]
#         score = sum(1 for a, b in zip(current_segment, short_sequence) if a == b)

#         if score > highest_score:
#             highest_score = score
#             best_match_start_index = i
#             best_match_end_index = i + len(short_sequence) - 1

#     return best_match_start_index, best_match_end_index, highest_score




try: 
    s1 = works.param (1)
    s2 = works.param (2)
    
    # if s2 is not None and len(s1)>len(s2)*10:
    #     # result  = find_closest_dna_match_details ( s1, s2 )
    #     # print ( result )
    #     match_start, match_end, score  = find_closest_dna_match_details ( s1, s2 )
        
    #     if math.isnan(score):
    #         print ( ' score was not possible ')
    #     else: 
    #         print (  {"index":match_start, "match_end": match_end, "percent": score })
    #         works.resolve( {"match_start":match_start, "match_end": match_end, "percent": score })
    # else:
    ldv = -1
    leng = len(s1)
    if len(s2) > len(s1):
        ldv = distance ( s2, s1 )
        leng = len(s2)
    else:
        ldv = distance ( s1, s2 )
    percent = 1 - (ldv/leng)
    if ldv == 1:
        percent = 1
    print ("s1", s1 )
    print ("s2", s2 )
    print ( " s1 length ", len(s1))
    print ( " s2 length ", len(s2))
    print ( " levenshtein distance ", ldv )
    print ( " percent ", percent )
    percent = percent*100
    works.resolve( {"ld":ldv, "percent":percent })
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

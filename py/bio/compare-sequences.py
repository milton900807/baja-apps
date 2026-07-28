#!/usr/bin/env python

from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys



def alignment_score(x, y, alignment):
    """Score an alignment.
    x, y -- sequences.
    alignment -- an alignment of x and y.
    """
    score_gap = -1
    score_same = +1
    score_different = -1

    score = 0
    for i, j in alignment:
        if (i is None) or (j is None):
            score += score_gap
        elif x[i] == y[j]:
            score += score_same
        elif x[i] != y[j]:
            score += score_different

    return score

try: 
    s1 = works.param (1)
    s2 = works.param (2)
    
    
    
    aligner = PairwiseAligner()
    alignments = aligner.align(Seq(s1), Seq(s2))
    # print ( alignments )
    # works.resolve( {'hello':'world'})
    works.resolve( str(alignments[0]))
except Exception as e:
    print(f"An error occurred: {e}")
    works.resolve("{e}")

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


from ion import works
from Bio.Seq import Seq
from Bio.Align import PairwiseAligner
import json 
import sys



import editdistance
from Bio.Seq import Seq



target = works.param (1)
oligos = works.param (2)
le = works.param(3)


if le > 4:
    works.resolve ({'le':' must be less than 4'})

def has_whitespace(input_string):
    return ' ' in input_string or '\t' in input_string or '\n' in input_string or '\r' in input_string

def map_sequences(oligos, long_sequence, max_distance=2):
    default_value = 0
    mapped_oligos = [default_value] * len(oligos)

    lo = len(oligos)
    idv = 0
    oid = ''
    percent_control = -1
    reference_value = -1
    index = 0
    oindex = 0
    for o in oligos:
        oligo = o
        oindex = 0

        works.progress ( idv/lo * 100 )

        if has_whitespace(oligo) or isinstance (oligo, list):
            t = []
            if isinstance (oligo, str):
                t = oligo.split()
            elif isinstance (oligo, list):
                t = oligo
            
            if len(t)>1:
                oligo = t[1]
                oid = t[0] 
            else:
                oligo = t[0]
                oid = index


            reference_value = -1
            index+=1
            if len(t)>2:
                try:
                    if len(t) > 1:
                        percent_control = float(t[2])
                    if len(t) > 2:
                        reference_value = float(t[3])
                except:
                    percent_control = -1

        if len(oligo) > 5:
            mapped_oligos[idv] = []

            # Forward mapping
            for i in range(len(long_sequence) - len(oligo) + 1):
                substring = long_sequence[i:i + len(oligo)]
                distance = editdistance.eval(oligo, substring)
                if distance <= max_distance:
                    mapped_oligos[idv].append((oid, oligo, substring, i, distance, "Forward", percent_control, reference_value, oindex))
                    oindex+=1
            
            # Reverse mapping
            reverse_sequence = long_sequence[::-1]
            for i in range(len(reverse_sequence) - len(oligo) + 1):
                substring = reverse_sequence[i:i + len(oligo)]
                distance = editdistance.eval(oligo, substring)

                if distance <= max_distance:
                    mapped_oligos[idv].append((oid, oligo, substring, len(long_sequence) - i - len(oligo), distance, "Reverse", percent_control, reference_value, oindex))
                    oindex+=1

            # Forward and reverse complement mapping
            oligo_seq = Seq(oligo)
            complement = str(oligo_seq.complement ())
            reverse_complement = str(oligo_seq.reverse_complement())
            for i in range(len(long_sequence) - len(oligo) + 1):
                substring = long_sequence[i:i + len(oligo)]
                distance_forward = editdistance.eval(complement, substring)
                distance_reverse = editdistance.eval(reverse_complement, substring)

                if distance_forward <= max_distance:
                    mapped_oligos[idv].append((oid, oligo, substring, i, distance_forward, "Forward Complement", percent_control, reference_value, oindex))
                    oindex+=1

                elif distance_reverse <= max_distance:
                    mapped_oligos[idv].append((oid, oligo, substring, i, distance_reverse, "Reverse Complement", percent_control, reference_value, oindex))
                    oindex+=1

        idv=idv+1
    return mapped_oligos

# Example usage
# long_sequence = "ACGTAGCTAGCGTAGCTAGCAGCTAGCTAGCTAGCTAGCTAGCGTAGCTAGCTAGCTAGC"
# oligos = ["AGCTAGC", "CGTAGC", "ATCGAT", "GCTAGC"]
# mapped_oligos = map_sequences(oligos, long_sequence)

# for oligo, mappings in mapped_oligos.items():
#     print(f"Oligo: {oligo}")
#     if mappings:
#         for mapping in mappings:
#             mapped_substring, position, distance, orientation = mapping
#             print(f"  Mapped substring: {mapped_substring}")
#             print(f"  Position in long sequence: {position}")
#             print(f"  Edit distance: {distance}")
#             print(f"  Orientation: {orientation}")
#             print("=" * 30)
#     else:
#         print("  No valid mappings found.")
#     print("-" * 40)

mapped = map_sequences ( oligos, target, le )
works.resolve (mapped)



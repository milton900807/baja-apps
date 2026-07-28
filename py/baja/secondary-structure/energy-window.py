import RNA  # ViennaRNA package
from ion import works
import json

sequence = works.param (1)
oligo_length = works.param (2)
threshold = works.param (3)
max_count = 10000

print ( 'Threshold', threshold)

def calculate_secondary_structure(sequence):
    # This function calculates the secondary structure of a given RNA sequence.
    # Using ViennaRNA package
    try:
        sequence_t = sequence.replace('T', 'U');
        md = RNA.md()
        md.temperature = 37.0 # 20 Deg Celcius
        fc = RNA.fold_compound(str(sequence_t), md)
        s = fc.mfe()[0]
        print (s)
        return s
    except Exception as e: 
        print(f"An error occurred: {e}")




def analyze_structure(sequence, window_size=10000, sub_window_size=20, threshold=0.7):
    results = []
    index = 0
    k = 0
    start = 0
    works.progress ( 1 )
    if len(sequence)<window_size:
        window_size=len(sequence)
    run_count = len(sequence) - window_size + 1
    for i in range(0, run_count):
        cut = start + window_size
        if cut > len(sequence):
            cut = len(sequence)
        window_seq = sequence[start:start + cut]
        sec_structure = calculate_secondary_structure(window_seq)
        works.progress ( 25 )
        for j in range(0, cut - sub_window_size +1 ):
            if k >= len(sequence) or len(window_seq) < j+sub_window_size:
                break
            sub_window_seq = window_seq[j:j + sub_window_size]
            sub_window_structure = sec_structure[j:j + sub_window_size]
            # b = count_bases_linked_to_unpaired (j, sub_window_structure, sub_window_size )
            b = count_unpaired ( sub_window_structure )
            k = start + j
            index+=1
            if index % 10 == 0:
                works.progress ( k/len(sequence) * 100 )
            if len(results) > max_count:
                return results
            if b > threshold:
                results.append ( {"i": i, "j":j, "pos": k, "seq": sub_window_seq, "count": int(b)})
        start += window_size
    return results



def count_unpaired(sequence):
    unpaired = sequence.count('.')
    linked = sequence.count('(') + sequence.count(')')
    return unpaired/len(sequence)

def count_bases_linked_to_unpaired(window_index, sequence, window_size):
    if window_size <= 0 or window_size > len(sequence):
        raise ValueError("Invalid window size")
    counts = []
    for i in range(len(sequence) - window_size + 1):
        window = sequence[i:i+window_size]
        # Count unpaired bases ('.') and bases linked to unpaired parts ('(' or ')')
        unpaired = window.count('.')
        linked = window.count('(') + window.count(')')
        # Check if there's at least one unpaired base
        counts.append ( {
            'start':int(window_index + i), 'end': int (i+window_index + window_size), 'count':int(linked)    
        })
    return counts

def is_bound(sub_window_structure):
    return '(' in sub_window_structure or ')' in sub_window_structure

def print_first_10_items(array):
    for i, item in enumerate(array):
        if i < 10000:  # Check if the index is less than 10
            print(item)
        else:
            break  # Break the loop afte

# transcript_sequence = "AGGTAGCTGCGTGGCTAACGGAGAAAAGAAGCCGTGGCCGCGGGAGGAGGCGAGAGGAGTCGGGATCTGCGCTGCAGCCACCGCCGCGGTTGATACTACTTTGACCTTCCGAGTGCAGTGGTAGGGGCGCGGAGG"
# transcript_sequence = "AGGTAGCTGCGTGGCTAACGGAGAAAAGAAGCCGTGGCCGCGGGAGGAGGCGAGAGGAGTCGGGATCTGCGCTGCAGCCACCGCCGCGGTTGATACTACTTTGACCTTCCGAGTGCAGTGGTAGGGGCGCGGAGGCAACGCAGCGGCTTCTGCGCTGGGAAATTCAGTCGTGTGCGACCCAGTCTGTCCTCTCCCCAGACCGCCAATCTCATGCACCCCTCCAGAGTGGCCCTTGACTCCTCCCTCTCCTCACTCCATCTTTCCTGGCCTCTCTCCGGGTGCTTAGCGGACTTGGCCAATAACCTCCTCCTTTTAAACGCCCTGAATTGAACCCTGCCTCCTGCGCATCCTCTTTTTGTGTCACCTTAGGGTTCAGATTTAACTACGCGACTTGACTAGTCATCTTTTGATCTCTCTCTCGTATTTAGTACTTTTAGTCAGCGAGCATTTATTGATATTTCAACTTCAGCCTCGCGGTTAAGAGCTTGGGCTCTGGAATCATACGGCTGGAATTGGAATTCTGTCAGTCGTGTGGCCGCTCTCTACTGTCTTGTGAAGATAAGTGAGATAATCTTGACCTGTGGTGAGCACTCGTGAGCGTTAGCTGCTGTATTTACCAGGTACAGATAAGACAACTACAGTGGATGATAATGTATGTGGTGATAGGGGAGTACTCTGATGGTAGAGGAGTGACTTTGGTTCTCTGCAAACTCAGCCTGAGACTATCAATTCAGTTTGTGGTGAGACCTCGCAGTGTTACCTTGGCAGATGGTAGAAGCCTTCCAGATGGAAGGAAAAATGCGTGTAAAGGCACAAAGTGTAGAAGGACCCTGAAGCTCCAGCGTGAGGCCTGGCATTGAATGAAATATATTTTGTGGGTTTTCAGCTGCTGAAGTCATAGGAATGGATGAGACCAAGAAAACAAAGCTGTTTTTGAGGTATGAGCGGAAGAAGAGATATCAGGAGACTTTCGAAACAGTCATAACGGAAGTTAATATGATCATTGCTAACATTTGCTGTGTTTCAGGCACTGTAAGCATGTATATGGGTCCTTAAAGGGACTCATAGAGGTAGGTACTAGTATTGTTTTTCCTTTTATCATTGAGAAACTGAGGTTTGAAGAGATTAGTGAACTTGCTCTAGATTATACAGTTTGTAAGTGGCTGAACCAGGATTTGAACTAATACAATCTGACTACAGAGGCCACACTCCTTAGCACTAGAAAAGAATGGCATGCCAAGGGCAGAGTTATTTCTAGGAAGATGGGATATAAGCGTCATTGTCAAGTTGTG"
# results = analyze_structure(transcript_sequence)
# print ( 'Results: ')
# print_first_10_items ( sorterd_array )
if threshold is None: 
    threshold = 0.70

results = analyze_structure(str(sequence), 6000, int(oligo_length), threshold)

sorted_array = sorted(results, key=lambda x: x['count'])
filtered_ = sorted_array[:5000]  # Attempting to slice the first 1000 items
works.progress ( 100 )
works.resolve ( {'results': filtered_  } )



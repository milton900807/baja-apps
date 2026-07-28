import primer3
import json
from ion import works

sequence = works.param (1)
region_list = works.param (2)
taqman_flag = works.param(3)





def generate_primer_probes_simple(sequence, region_list, taqman_flag):
    primer_length = 20  # Typical length for a primer
    primers = {}

    def reverse_complement(seq):
        complement = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C'}
        return ''.join([complement[base] for base in seq[::-1]])

    # Parse region list; expected format "start1,end1;start2,end2;..."
    allowed_regions = []
    if region_list:
        regions = region_list.split(';')
        for region in regions:
            if region:
                start, end = map(int, region.split(','))
                allowed_regions.append((start, end))

    # Generate forward primer (5' -> 3')
    for start, end in allowed_regions:
        if end - start > primer_length:
            primer_sequence = sequence[start:start + primer_length]
            primers[f'Forward_{start}'] = primer_sequence
            break  # Assume we only need one primer per direction for simplicity

    # Generate reverse primer (3' -> 5')
    for start, end in reversed(allowed_regions):
        if end - start > primer_length:
            primer_sequence = reverse_complement(sequence[start:start + primer_length])
            primers[f'Reverse_{start}'] = primer_sequence
            break  # Assume we only need one primer per direction for simplicity

    return {
        "primers": primers,
        "info": f"Generated {len(primers)} primers based on given regions and sequence."
    }



def generate_primer_probes(sequence, region_list, taqman_flag):
    # Parse region list; expected format "start1,end1;start2,end2;..."
    allowed_regions = []
    if region_list:
        regions = region_list.split(';')
        for region in regions:
            if region:
                start, end = map(int, region.split(','))
                allowed_regions.append([int(start), int(end)])
 # Define global arguments for the sequence
    print (allowed_regions)
    global_args = {
        'SEQUENCE_ID': 'example',
        'SEQUENCE_TEMPLATE': sequence,
        'SEQUENCE_INCLUDED_REGION': [0, len(sequence)],  # Initial default that might be overwritten
    }
    primer_config = {
        'SEQUENCE_ID': 'example',
        'SEQUENCE_TEMPLATE': sequence,
        'SEQUENCE_INCLUDED_REGION': [0, len(sequence)],  # This will be overwritten by specific regions
        'PRIMER_OPT_SIZE': 20,  # Optimum primer size in bases
        'PRIMER_PICK_INTERNAL_OLIGO': 1,
        'PRIMER_INTERNAL_MAX_SELF_END': 8,
        'PRIMER_MIN_SIZE': 18,
        'PRIMER_MAX_SIZE': 25,
        'PRIMER_OPT_TM': 60.0,
        'PRIMER_MIN_TM': 57.0,
        'PRIMER_MAX_TM': 63.0,
        'PRIMER_MIN_GC': 20.0,
        'PRIMER_MAX_GC': 80.0,
        'PRIMER_MAX_POLY_X': 100,
        'PRIMER_INTERNAL_MAX_POLY_X': 100,
        'PRIMER_SALT_MONOVALENT': 50.0,
        'PRIMER_DNA_CONC': 50.0,
        'PRIMER_MAX_NS_ACCEPTED': 1,
        'PRIMER_MAX_SELF_ANY': 12,
        'PRIMER_MAX_SELF_END': 8,
        'PRIMER_PAIR_MAX_COMPL_ANY': 12,
        'PRIMER_PAIR_MAX_COMPL_END': 8,
    }
    # global_args['SEQUENCE_INCLUDED_REGION'] = allowed_regions
    result = primer3.bindings.design_primers(global_args, primer_config)
    primers = {}    


# PRIMER_LEFT_EXPLAIN', 'PRIMER_RIGHT_EXPLAIN', 'PRIMER_INTERNAL_EXPLAIN', 'PRIMER_PAIR_EXPLAIN', 'PRIMER_LEFT_NUM_RETURNED', 
# 'PRIMER_RIGHT_NUM_RETURNED', 'PRIMER_INTERNAL_NUM_RETURNED', 'PRIMER_PAIR_NUM_RETURNED', 'PRIMER_PAIR', 'PRIMER_LEFT', 'PRIMER_RIGHT', 
# 'PRIMER_INTERNAL', 'PRIMER_PAIR_0_PENALTY', 'PRIMER_LEFT_0_PENALTY', 'PRIMER_RIGHT_0_PENALTY', 'PRIMER_INTERNAL_0_PENALTY', 
# 'PRIMER_LEFT_0_SEQUENCE', 'PRIMER_RIGHT_0_SEQUENCE', 'PRIMER_INTERNAL_0_SEQUENCE', 'PRIMER_LEFT_0', 'PRIMER_RIGHT_0', 'PRIMER_INTERNAL_0',
# 'PRIMER_LEFT_0_TM', 'PRIMER_RIGHT_0_TM', 'PRIMER_INTERNAL_0_TM', 'PRIMER_LEFT_0_GC_PERCENT', 'PRIMER_RIGHT_0_GC_PERCENT', 'PRIMER_INTERNAL_0_GC_PERCENT',
# 'PRIMER_LEFT_0_SELF_ANY_TH', 'PRIMER_RIGHT_0_SELF_ANY_TH', 'PRIMER_INTERNAL_0_SELF_ANY_TH', 'PRIMER_LEFT_0_SELF_END_TH', 'PRIMER_RIGHT_0_SELF_END_TH', 'PRIMER_INTERNAL_0_SELF_END_TH',
# 'PRIMER_LEFT_0_HAIRPIN_TH', 'PRIMER_RIGHT_0_HAIRPIN_TH', 'PRIMER_INTERNAL_0_HAIRPIN_TH', 'PRIMER_LEFT_0_END_STABILITY', 'PRIMER_RIGHT_0_END_STABILITY', 'PRIMER_PAIR_0_COMPL_ANY_TH', 'PRIMER_PAIR_0_COMPL_END_TH',
# 'PRIMER_PAIR_0_PRODUCT_SIZE', 'PRIMER_PAIR_0_PRODUCT_TM', 'PRIMER_PAIR_1_PENALTY', 'PRIMER_LEFT_1_PENALTY', 'PRIMER_RIGHT_1_PENALTY', 'PRIMER_INTERNAL_1_PENALTY', 'PRIMER_LEFT_1_SEQUENCE', 'PRIMER_RIGHT_1_SEQUENCE', 
# 'PRIMER_INTERNAL_1_SEQUENCE', 'PRIMER_LEFT_1', 'PRIMER_RIGHT_1',
# 'PRIMER_INTERNAL_1', 'PRIMER_LEFT_1_TM', 'PRIMER_RIGHT_1_TM', 'PRIMER_INTERNAL_1_TM', 'PRIMER_LEFT_1_GC_PERCENT', 'PRIMER_RIGHT_1_GC_PERCENT', 'PRIMER_INTERNAL_1_GC_PERCENT', 'PRIMER_LEFT_1_SELF_ANY_TH', 'PRIMER_RIGHT_1_SELF_ANY_TH',
# 'PRIMER_INTERNAL_1_SELF_ANY_TH', 'PRIMER_LEFT_1_SELF_END_TH', 'PRIMER_RIGHT_1_SELF_END_TH', 'PRIMER_INTERNAL_1_SELF_END_TH', 'PRIMER_LEFT_1_HAIRPIN_TH', 'PRIMER_RIGHT_1_HAIRPIN_TH', 'PRIMER_INTERNAL_1_HAIRPIN_TH', 'PRIMER_LEFT_1_END_STABILITY', 'PRIMER_RIGHT_1_END_STABILITY', 'PRIMER_PAIR_1_COMPL_ANY_TH', 'PRIMER_PAIR_1_COMPL_END_TH', 'PRIMER_PAIR_1_PRODUCT_SIZE', 'PRIMER_PAIR_1_PRODUCT_TM', 'PRIMER_PAIR_2_PENALTY', 'PRIMER_LEFT_2_PENALTY', 'PRIMER_RIGHT_2_PENALTY', 'PRIMER_INTERNAL_2_PENALTY', 'PRIMER_LEFT_2_SEQUENCE', 'PRIMER_RIGHT_2_SEQUENCE', 'PRIMER_INTERNAL_2_SEQUENCE', 'PRIMER_LEFT_2', 'PRIMER_RIGHT_2', 'PRIMER_INTERNAL_2', 'PRIMER_LEFT_2_TM', 'PRIMER_RIGHT_2_TM', 'PRIMER_INTERNAL_2_TM', 'PRIMER_LEFT_2_GC_PERCENT', 'PRIMER_RIGHT_2_GC_PERCENT', 'PRIMER_INTERNAL_2_GC_PERCENT', 'PRIMER_LEFT_2_SELF_ANY_TH', 'PRIMER_RIGHT_2_SELF_ANY_TH', 'PRIMER_INTERNAL_2_SELF_ANY_TH', 'PRIMER_LEFT_2_SELF_END_TH', 'PRIMER_RIGHT_2_SELF_END_TH', 'PRIMER_INTERNAL_2_SELF_END_TH', 'PRIMER_LEFT_2_HAIRPIN_TH', 'PRIMER_RIGHT_2_HAIRPIN_TH', 'PRIMER_INTERNAL_2_HAIRPIN_TH', 'PRIMER_LEFT_2_END_STABILITY', 'PRIMER_RIGHT_2_END_STABILITY', 'PRIMER_PAIR_2_COMPL_ANY_TH', 'PRIMER_PAIR_2_COMPL_END_TH', 'PRIMER_PAIR_2_PRODUCT_SIZE', 'PRIMER_PAIR_2_PRODUCT_TM', 'PRIMER_PAIR_3_PENALTY', 'PRIMER_LEFT_3_PENALTY', 'PRIMER_RIGHT_3_PENALTY', 'PRIMER_INTERNAL_3_PENALTY', 'PRIMER_LEFT_3_SEQUENCE', 'PRIMER_RIGHT_3_SEQUENCE', 'PRIMER_INTERNAL_3_SEQUENCE', 'PRIMER_LEFT_3', 'PRIMER_RIGHT_3', 'PRIMER_INTERNAL_3', 'PRIMER_LEFT_3_TM', 'PRIMER_RIGHT_3_TM', 'PRIMER_INTERNAL_3_TM', 'PRIMER_LEFT_3_GC_PERCENT', 'PRIMER_RIGHT_3_GC_PERCENT', 'PRIMER_INTERNAL_3_GC_PERCENT', 'PRIMER_LEFT_3_SELF_ANY_TH', 'PRIMER_RIGHT_3_SELF_ANY_TH', 'PRIMER_INTERNAL_3_SELF_ANY_TH', 'PRIMER_LEFT_3_SELF_END_TH', 'PRIMER_RIGHT_3_SELF_END_TH', 'PRIMER_INTERNAL_3_SELF_END_TH', 'PRIMER_LEFT_3_HAIRPIN_TH', 'PRIMER_RIGHT_3_HAIRPIN_TH', 'PRIMER_INTERNAL_3_HAIRPIN_TH', 'PRIMER_LEFT_3_END_STABILITY', 'PRIMER_RIGHT_3_END_STABILITY', 'PRIMER_PAIR_3_COMPL_ANY_TH', 'PRIMER_PAIR_3_COMPL_END_TH', 'PRIMER_PAIR_3_PRODUCT_SIZE', 'PRIMER_PAIR_3_PRODUCT_TM', 'PRIMER_PAIR_4_PENALTY', 'PRIMER_LEFT_4_PENALTY', 'PRIMER_RIGHT_4_PENALTY', 'PRIMER_INTERNAL_4_PENALTY', 'PRIMER_LEFT_4_SEQUENCE', 'PRIMER_RIGHT_4_SEQUENCE', 'PRIMER_INTERNAL_4_SEQUENCE', 'PRIMER_LEFT_4', 'PRIMER_RIGHT_4', 'PRIMER_INTERNAL_4', 'PRIMER_LEFT_4_TM', 'PRIMER_RIGHT_4_TM', 'PRIMER_INTERNAL_4_TM', 'PRIMER_LEFT_4_GC_PERCENT', 'PRIMER_RIGHT_4_GC_PERCENT', 'PRIMER_INTERNAL_4_GC_PERCENT', 'PRIMER_LEFT_4_SELF_ANY_TH', 'PRIMER_RIGHT_4_SELF_ANY_TH', 'PRIMER_INTERNAL_4_SELF_ANY_TH', 'PRIMER_LEFT_4_SELF_END_TH', 'PRIMER_RIGHT_4_SELF_END_TH', 'PRIMER_INTERNAL_4_SELF_END_TH', 'PRIMER_LEFT_4_HAIRPIN_TH', 'PRIMER_RIGHT_4_HAIRPIN_TH', 'PRIMER_INTERNAL_4_HAIRPIN_TH', 'PRIMER_LEFT_4_END_STABILITY', 'PRIMER_RIGHT_4_END_STABILITY', 'PRIMER_PAIR_4_COMPL_ANY_TH', 'PRIMER_PAIR_4_COMPL_END_TH', 'PRIMER_PAIR_4_PRODUCT_SIZE', 'PRIMER_PAIR_4_PRODUCT_TM'])
    # print ( result.keys() )
    # Extract primer information from the result
    
    primers = {}  # Dictionary to store all primer related information

    # Loop through the number of left primers returned
    # for i in range(result['PRIMER_LEFT_NUM_RETURNED']):
    #     # Creating separate dictionaries for left and right primer details
    #     left_primer = {
    #         'sequence': result.get(f'PRIMER_LEFT_{i}_SEQUENCE', ''),
    #         'position': result.get(f'PRIMER_LEFT_{i}', '')
    #     }

    #     right_primer = {
    #         'sequence': result.get(f'PRIMER_RIGHT_{i}_SEQUENCE', ''),
    #         'position': result.get(f'PRIMER_RIGHT_{i}', '')
    #     }

    #     # Check for internal explain and pair explain only if the indices are valid
    #     if 'PRIMER_INTERNAL_NUM_RETURNED' in result and i < result['PRIMER_INTERNAL_NUM_RETURNED']:
    #         internal_explain = result.get(f'PRIMER_INTERNAL_{i}_EXPLAIN', '')
    #     else:
    #         internal_explain = ''

    #     if 'PRIMER_PAIR_NUM_RETURNED' in result and i < result['PRIMER_PAIR_NUM_RETURNED']:
    #         pair_explain = result.get(f'PRIMER_PAIR_{i}_EXPLAIN', '')
    #         pair_info = result.get(f'PRIMER_PAIR_{i}', {})
    #     else:
    #         pair_explain = ''
    #         pair_info = {}

    #     # Combine left and right primers into a pair dictionary with additional details
    #     primer_pair = {
    #         'left_primer': left_primer,
    #         'right_primer': right_primer,
    #         'internal_explain': internal_explain,
    #         'pair_explain': pair_explain,
    #         'pair_info': pair_info
    #     }
    return result

primers = generate_primer_probes ( sequence, region_list, taqman_flag)
works.resolve(primers)

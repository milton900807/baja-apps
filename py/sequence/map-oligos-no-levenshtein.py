import json
from ion import works

oligos = works.param(1)
sequence = works.param(2)



# Function to get the complement of a DNA sequence
def complement(seq):
    complement_map = str.maketrans('ATCG', 'TAGC')
    return seq.translate(complement_map)

# Function to reverse a sequence
def reverse(seq):
    return seq[::-1]

# Function to generate all configurations of an ASO
def generate_aso_variants(aso):
    variants = {
        "forward": aso,
        "reverse": reverse(aso),
        "complement": complement(aso),
        "reverse_complement": reverse(complement(aso))
    }
    return variants

# Function to find all occurrences of a pattern in a sequence
def find_sites(sequence, pattern):
    start = 0
    while True:
        start = sequence.find(pattern, start)
        if start == -1:
            break
        yield start
        start += 1

# Function to map ASOs to a DNA sequence
def map_asos_to_sequence(asos, dna_sequence):
    mapping = {}

    for aso in asos:
        aso_variants = generate_aso_variants(aso)
        mapping[aso] = {}

        for variant_name, variant_seq in aso_variants.items():
            sites = list(find_sites(dna_sequence, variant_seq))
            if sites:
                mapping[aso][variant_name] = sites

    return mapping


result = map_asos_to_sequence(oligos, sequence)
works.resolve ( result )



import re

from Bio import Entrez
from Bio import SeqIO

# sirnaSyntax = works.param (1)
# gene_sequence = works.param(2)
Entrez.email = "milton@lajollalabs.com"

def parse_capital_letters_within_parentheses(input_string):
    pattern = r'\(([A-Za-z]+)\)'
    capital_letters = re.findall(pattern, input_string)
    return capital_letters

def process_capital_letters(capital_letters_list):
    processed_letters = []
    for letters in capital_letters_list:
        processed_letters.append(''.join(c for c in letters if c.isupper()).replace('U', 'T'))
    return processed_letters


def reverse_complement(dna_sequence):
    complement_dict = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C'}
    reversed_sequence = dna_sequence[::-1]
    complement_sequence = ''.join(complement_dict[base] for base in reversed_sequence)
    return complement_sequence

def find_subsequence_locations(gene_sequence, subsequence):
    locations = []
    start_index = gene_sequence.find(subsequence)
    while start_index != -1:
        end_index = start_index + len(subsequence) - 1
        locations.append((start_index, end_index))
        start_index = gene_sequence.find(subsequence, start_index + 1)
    return locations


if __name__ == "__main__":
    input_string = "P(mU)#(fG)#(mU)(fG)(fG)(fG)(mA)(fA)(mU)(fU)(mA)(fA)(mC)#(fA)#(mG)#(fC)#(mA)#(mG)#(mG)#(fU)"
    capital_letters_within_parentheses = parse_capital_letters_within_parentheses(input_string)
    print (capital_letters_within_parentheses)

    processed_letters = process_capital_letters(capital_letters_within_parentheses)
    print("Processed capital letters:")
    print(processed_letters)

    accession_number = "NM_002439.5"
    handle = Entrez.efetch(db="nucleotide", id=accession_number, rettype="gb", retmode="text")
    record = SeqIO.read(handle, "genbank")
    handle.close()

    subsequence_to_find = ''.join(processed_letters)
    kras_sequence = record.seq
    reverse_complement_sequence = reverse_complement(subsequence_to_find)
    locations = find_subsequence_locations(kras_sequence, subsequence_to_find)

    if locations:
        for location in locations:
            start, end = location
            print(f"Start index: {start}, End index: {end}")
    else:
        locations = find_subsequence_locations(kras_sequence, reverse_complement_sequence)
        if locations:
            for location in locations:
                start, end = location
                print(f"Start index: {start}, End index: {end}")
        else: 
            print("The subsequence was not found in the gene sequence.")

import pandas as pd
import json
import os
import sys
import pandas as pd
from pyensembl import EnsemblRelease
import json



import pandas as pd
from Bio.Seq import Seq
import Levenshtein as lv
from openpyxl import Workbook

def find_amplicon(seq, primer, max_distance=2):
    primer_len = len(primer)
    potential_sites = []
    for i in range(len(seq) - primer_len + 1):
        segment = seq[i:i + primer_len]
        if lv.distance(str(segment), str(primer)) <= max_distance:
            potential_sites.append(i)
    return potential_sites

def extract_amplicons(dna_sequence, forward_primer, reverse_primer):
    amplicons = []
    fwd_sites = find_amplicon(dna_sequence, forward_primer)
    rev_primer_seq = Seq(reverse_primer).reverse_complement_rna()
    rev_sites = find_amplicon(dna_sequence, rev_primer_seq)
    for f_site in fwd_sites:
        for r_site in rev_sites:
            if r_site > f_site:
                amplicons.append(dna_sequence[f_site:r_site + len(rev_primer_seq)])
    return amplicons

def process_excel(file_path):
    df = pd.read_excel(file_path)
    df['Amplicons_Forward'] = ''
    df['Amplicons_Reverse'] = ''

    for index, row in df.iterrows():
        dna_sequence = Seq(row['amplicon_sequence'])
        forward_primer = row['forward']
        reverse_primer = row['reverse']

        # Find amplicons on the forward strand
        amplicons_forward = extract_amplicons(dna_sequence, forward_primer, reverse_primer)
        df.at[index, 'Amplicons_Forward'] = ' | '.join([str(amp) for amp in amplicons_forward])

        # Find amplicons on the reverse strand
        reverse_dna_sequence = dna_sequence.reverse_complement_rna()
        amplicons_reverse = extract_amplicons(reverse_dna_sequence, forward_primer, reverse_primer)
        df.at[index, 'Amplicons_Reverse'] = ' | '.join([str(amp) for amp in amplicons_reverse])

    # Save the updated DataFrame to a new Excel file
    df.to_excel("output_with_amplicons.xlsx", index=False)










# Load Ensembl data
data = EnsemblRelease(109)



def get_flanking_sequence(chromosome, start, end, strand, flank=500):
    # Adjust start and end based on the flanking requirement
    start_flank = max(1, start - flank if strand == '1' else start + flank)
    end_flank = end + flank if strand == '1' else end - flank

    # Retrieve sequence
    sequence = data.sequence(region=chromosome, start=start_flank, end=end_flank)
    return sequence

def levenshtein_distance(s1, s2):
    # Create a table to store results of subproblems
    dp = [[0 for x in range(len(s2) + 1)] for x in range(len(s1) + 1)]

    # Fill dp[][] in bottom up manner
    for i in range(len(s1) + 1):
        for j in range(len(s2) + 1):
            # If first string is empty, the only option is to
            # insert all characters of second string
            if i == 0:
                dp[i][j] = j    # Min. operations = j

            # If second string is empty, the only option is to
            # remove all characters of first string
            elif j == 0:
                dp[i][j] = i    # Min. operations = i

            # If last characters are the same, ignore the last char
            # and recur for remaining string
            elif s1[i-1] == s2[j-1]:
                dp[i][j] = dp[i-1][j-1]

            # If the last character is different, consider all
            # possibilities and find the minimum
            else:
                dp[i][j] = 1 + min(dp[i][j-1],        # Insert
                                   dp[i-1][j],        # Remove
                                   dp[i-1][j-1])      # Replace

    return dp[len(s1)][len(s2)]

def count_levenshtein_hits(dna_seq, oligo, max_dist):
    count = 0
    oligo_len = len(oligo)
    dna_len = len(dna_seq)

    # Slide over the DNA sequence
    for i in range(dna_len - oligo_len + 1):
        # Extract the segment of DNA that's the length of the oligo
        segment = dna_seq[i:i + oligo_len]

        # Calculate the Levenshtein distance
        if levenshtein_distance(segment, oligo) <= max_dist:
            count += 1

    return count

def reverse_complement(dna_seq):
    """Return the reverse complement of the given DNA sequence."""
    return str(Seq(dna_seq).reverse_complement())


def process_excel(filename, data):
    # Load the Excel file
    df = pd.read_excel(filename)
    df['Amplicons_Forward'] = ''
    df['Amplicons_Reverse'] = ''

    # Columns that contain JSON with genomic data
    json_columns = ['forward', 'reverse', 'probe']

    # Load sequence cache from file if it exists
    cache_file = './sequence_cache2.json'
    if os.path.exists(cache_file):
        with open(cache_file, 'r') as file:
            sequence_cache = json.load(file)
    else:
        sequence_cache = {}

    # Process each column
    for column in json_columns:
        # Define a new column to store the Levenshtein count results
        df[column + '_LE'] = 0

        for index, row in df.iterrows():
            # Correct JSON format in the cell
            corrected_json = row[column].replace("'", '"')
            json_data = json.loads(corrected_json)
            coord_info = json_data[1]['coords']
            seq = json_data[1]['seq']
            chromosome = coord_info['coord_system']  # Using coord_system as chromosome
            start = coord_info['start']
            end = coord_info['end']
            strand = coord_info['strand']

            # Create cache key based on genomic coordinates
            cache_key = f"{chromosome}_{start}"

            if cache_key not in sequence_cache:
                gene_names = data.gene_names_at_locus(contig=chromosome, position=start+10)
                try:
                    print ( row['gene'])
                    genes = data.genes_by_name(row['gene'])
                except Exception as e:
                    print('Failed to fetch gene data for:', gene_names)
                    if gene_names:
                        genes = data.genes_by_name(gene_names[-1])
                        print(':', len(genes))
                if genes:
                    sequence_cache[cache_key] = genes[0].transcripts[0].sequence
                else:
                    sequence_cache[cache_key] = None
                                # Write cache to file every 100 rows processed
                with open(cache_file, 'w') as file:
                    json.dump(sequence_cache, file, indent=4)

            transcript_sequence = sequence_cache.get(cache_key)
            if transcript_sequence:
                forward_primer = row['forward']
                reverse_primer = row['reverse']
                amplicons_forward = extract_amplicons(transcript_sequence, forward_primer, reverse_primer)
                df.at[index, 'Amplicons_Forward'] = ' | '.join([str(amp) for amp in amplicons_forward])
                reverse_dna_sequence = reverse_complement(transcript_sequence)
                amplicons_reverse = extract_amplicons(reverse_dna_sequence, forward_primer, reverse_primer)
                df.at[index, 'Amplicons_Reverse'] = ' | '.join([str(amp) for amp in amplicons_reverse])
                print ( index, ' --- > ', forward_primer )


    # Save the final cache state
    with open(cache_file, 'w') as file:
        json.dump(sequence_cache, file, indent=4)

    # Save the updated DataFrame back to an Excel file
    df.to_excel('updated_data_with_amplicon_sequences.xlsx', index=False)

# def count_levenshtein_hits(transcript_seq, query_seq, max_dist):
#     # Dummy implementation of Levenshtein distance calculation
#     # Replace this with your actual function logic
#     import Levenshtein
#     distance = Levenshtein.distance(transcript_seq, query_seq)
#     return distance <= max_dist


process_excel('../../amplicon_sequences_a549.xlsx', data)

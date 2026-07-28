import sys
import pandas as pd
from io import StringIO
import re
import json
from collections import defaultdict
import string, re

def convert_to_pssm(score_strings):
    """
    Convert an array of complex formatted strings to a PSSM object.
    
    Args:
        score_strings (list of str): Array of strings, where each string may contain
                                     metadata and comma-separated scores.
    
    Returns:
        list of dict: PSSM represented as a list of dictionaries.
    """
    amino_acids = "ACDEFGHIKLMNPQRSTVWY"  # Standard amino acids
    pssm = []
    
    for score_str in score_strings:
        # Example of extracting numeric scores from the complex string
        # Adjust the regex pattern as needed based on your input format
        matches = re.findall(r"M=(-?\d+)", score_str)
        scores = list(map(int, matches))  # Convert matched score strings to integers
        
        # Check if the number of scores matches the expected number of amino acids
        if len(scores) == len(amino_acids):
            position_scores = dict(zip(amino_acids, scores))
            pssm.append(position_scores)
        else:
            print("Warning: Score string does not match expected format or length.")
    
    return pssm


def parse_pssm(dat_content):
    scores_str = dat_content.split("M=")[-1].strip()
    
    # Splitting the scores string into individual score components
    scores_list = scores_str.split()

    scores_str = scores_str.rstrip(";") 
    scores_list = scores_str.split()
   # Assuming the standard order of amino acids for PROSITE scoring matrices
    amino_acids = "ACDEFGHIKLMNPQRSTVWY"
    
    # Constructing the PSSM dictionary
    pssm = {aa: int(score) for aa, score in zip(amino_acids, scores_list)}
    
    return pssm

def score_sequence(sequence, pssm):
    score = 0
    for i, aa in enumerate(sequence):
        if i < len(pssm) and aa in pssm[i]:
            score += pssm[i][aa]
        else:
            # Handle cases where sequence is longer than PSSM or aa is not in PSSM
            pass
    return score
# Calculate the score for the protein sequence using the PSSM
#print(f"Sequence Score: {sequence_score}")



def score_sequence_against_pssm(sequence, pssm):
    """
    Calculates the total score of a protein sequence against a PSSM.
    
    Args:
    - sequence: The protein sequence to be scored.
    - pssm: A list of dictionaries, each representing the scoring matrix for a motif position.
    
    Returns:
    - A list of tuples, each containing the start position of the match and its score.
    """
    motif_length = len(pssm)
    matches = []
    for i in range(len(sequence) - motif_length + 1):
        window = sequence[i:i+motif_length]
        score = 0
        
        # Corrected scoring calculation
        for pos, acid in enumerate(window):
            if acid in pssm[pos]:  # Ensure amino acid is in the PSSM for this position
                score += pssm[pos][acid]
            else:
                # Handle the case where the amino acid is not in the PSSM
                score += 0  # Or some default penalty score
        
        # Assuming a simple threshold for a 'match'; adjust as necessary
        if score > 0:  # Example threshold; adjust based on actual use case
            matches.append((i, score))
    
    return matches

# Example usage with a simplified PSSM and a sample sequence
dat_content = [
"/M: SY='I'; M=-14,-34,-10,-34,-30,0,-40,-30,33,-30,27,14,-34,-30,-26,-26,-24,-10,23,-20,-10,-30;",
"/M: SY='P'; M=-10,-20,-30,-20,-10,-40,-20,-20,-30,-10,-30,-30,-20,80,-10,-20,-10,-10,-20,-40,-30,-10;",
"/M: SY='D'; M=-6,15,-13,22,6,-30,-9,-11,-24,-8,-32,-24,7,-17,-3,-17,13,-2,-24,-38,-24,1;",
"/M: SY='L'; M=-3,-32,-10,-33,-26,-3,-29,-26,16,-23,17,16,-31,-24,-17,-22,-19,-6,17,-23,-10,-23;",
"/M: SY='R'; M=-8,-21,-24,-26,-16,-17,-28,-16,3,-4,0,-4,-16,-23,-8,13,-16,-8,3,-27,-15,-13;"
]

pssm = convert_to_pssm(dat_content)
print ( pssm )

protein_sequence = "MSILILLESPGKISKISSILGKNYVVKASMGHFRDLDPKKMSIDFDNDFEPVYIVTKPDVVKNLKSAMKNIDLVYLAADEDREGEAIAQSLYDVLKPSNYKRLRFNAITKDAIMSAIKNAGDIDKNLVDAQKARRVLDRLFGYLISPILQRQIGGKLSAGRVQSVTVRIIIDKENEIKNFINKNADSSYFKVSGTFNGAKATLHESNDKKPFDLETAYKGKTAQIALINSENPNSKVVNFMKRCLKSQFFIHSVEDKMTTRSPAPPFTTSTLQQEANRKFGMSIDSTMKTAQKLYEGGYITYMRTDSVEISAEGHRDIKKIITDQYGADYYQKNLYKNKAANSQEAHEAIRPTHPELLTLEGEIEDAYQIKLYKLIWQRTIASQMKPAKIKVTIIQISISKYVEDKLNPFYYFQSQIETVVFPGFMKVYVESIDDPDTDNQITKNFTGKIPTVGSKVTMEEIIARQEYMRPPPRYSEASLVKKLEELGIGRPSTYVNTIKTIINREYVKITDVPGIKKDITIYSIKSENKKHIMEVYEDTDTILLGKENKKIVPTNLGITVNDFLMKYFPEFLDYKFTANMETDLDYVSTGTKNWVDIVQDFYDKLKPIVDELSKQKGLSQSSERLLGEDNDGNEITATKTKFGPVVRKKIGDKYVYAKIKDPLTLDTIKLSDAIKLLEYPKNLGQYKGFDVLLQKGDYGFYLSYNKENFSLGEIDDPEDINLDTAIKAIEAKKANNIAEFNLTENGKKIKAIVLNGKYGYYVQVTRNRIKKNYPIPKDLDPNNLTEQQILSIISVKKTYKKSAPKGGSKTIRKPSQTKYSQTKSTKSTKSTKSTNKKFVGKSAKKTTKKTTKK"
sequence_score = score_sequence(protein_sequence, pssm)
print ( ' sequence score', sequence_score)




data = """
ID   PHOSPHOPANTETHEINE; PATTERN.
AC   PS00012;
DT   01-APR-1990 CREATED; 01-DEC-2004 DATA UPDATE; 24-JAN-2024 INFO UPDATE.
DE   Phosphopantetheine attachment site.
PA   [DEQGSTALMKRH]-[LIVMFYSTAC]-[GNQ]-[LIVMFYAG]-[DNEKHS]-S-[LIVMST]-{PCFY}-
PA   [STAGCPQLIVMF]-[LIVMATN]-[DENQGTAKRHLM]-[LIVMWSTA]-[LIVGSTACR]-{LPIY}-
PA   {VY}-[LIVMFA].
NR   /RELEASE=2024_01,570830; /TOTAL=1552(1328); /POSITIVE=1155(931); /UNKNOWN=2(2);
NR   /FALSE_POS=395(395); /FALSE_NEG=319; /PARTIAL=5;
CC   /TAXO-RANGE=??EP?; /MAX-REPEAT=8;
CC   /SITE=6,phosphopantetheine;
CC   /VERSION=1;
DR   Q0CRQ5    , 5MOAS_ASPTN, T; A0A2I2F262, ACDB_ASPCN , T;
DR   G4MVZ2    , ACE1_PYRO7 , T; Q2UPA9    , ACLP_ASPOR , T;
DR   P11829    , ACP1_ARATH , T; P10352    , ACP1_BRANA , T;
DR   P93092    , ACP1_CASGL , T; P52411    , ACP1_CUPLA , T;
DR   P02902    , ACP1_HORVU , T; O54439    , ACP1_PSEAE , T;
DR   Q8Y0J1    , ACP1_RALN1 , T; P0A6B3    , ACP1_SHIFL , T;
DR   P07854    , ACP1_SPIOL , T; P25701    , ACP2_ARATH , T;
"""

# Function to parse the simplified data
def parse_simplified_data(data):
    # Splitting the data by lines
    lines = data.split('\n')
    # Initializing a dictionary to hold the data
    parsed_data = {'ID': [], 'DE': [], 'PA': []}
    # Temporary variables to hold data for each entry
    current_id, current_de, current_pa = '', '', ''
    
    for line in lines:
        if line.startswith("ID"):
            if current_id:  # Saving the previous entry if there is one
                parsed_data['ID'].append(current_id)
                parsed_data['DE'].append(current_de)
                parsed_data['PA'].append(current_pa)
                current_pa = ''  # Resetting the PA string for the next entry
            current_id = line.split('   ')[1].strip()
        elif line.startswith("DE"):
            current_de = line.split('   ')[1].strip()
        elif line.startswith("PA"):
            current_pa += line.split('   ')[1].strip() + ' '
            current_pa = current_pa.replace(" ", "")

    # Adding the last entry
    if current_id:
        parsed_data['ID'].append(current_id)
        parsed_data['DE'].append(current_de)
        parsed_data['PA'].append(current_pa)
    
    # Converting the dictionary to a DataFrame
    df = pd.DataFrame(parsed_data)
    return df

# Parsing the data into a structured format
def parse_data(data):
    # Initialize an empty list to store the rows
    rows = []
    current_row = {}
    for line in data.split('\n'):
        if line.startswith("ID"):
            current_row['ID'] = line[3:].strip()
        elif line.startswith("AC"):
            current_row['AC'] = line[3:].strip()
        elif line.startswith("DT"):
            current_row['DT'] = line[3:].strip()
        elif line.startswith("DE"):
            current_row['DE'] = line[3:].strip()
        elif line.startswith("PA"):
            current_row.setdefault('PA', '').join(line[3:].strip() + ' ')
        elif line.startswith("NR"):
            current_row.setdefault('NR', '').join(line[3:].strip() + ' ')
        elif line.startswith("CC"):
            current_row.setdefault('CC', '').join(line[3:].strip() + ' ')
        elif line.startswith("DR"):
            current_row.setdefault('DR', []).append(line[3:].strip())
        else:
            # Assuming the end of a record or empty line
            if current_row:
                rows.append(current_row)
                current_row = {}
    
    # In case the last line was part of a record
    if current_row:
        rows.append(current_row)
    
    return pd.DataFrame(rows)


# New method for loading and parsing a file
def load_and_parse_file(filepath):
    with open(filepath, 'r') as file:
        data = file.read()
    return parse_simplified_data(data)

# [DEQGSTALMKRH]-[LIVMFYSTAC]-[GNQ]-[LIVMFYAG]-[DNEKHS]-S-[LIVMST]-{PCFY}-[STAGCPQLIVMF]-[LIVMATN]-[DENQGTAKRHLM]-[LIVMWSTA]-[LIVGSTACR]-{LPIY}-{VY}-[LIVMFA].

def find_pattern_locations(pattern, sequence):
    """
    Finds hits of a protein sequence pattern.
    
    Args:
    - pattern (str): The protein pattern in regex.
    - sequence (str): The protein sequence to search.
    
    Returns:
    - List of tuples: Each tuple contains the start and end indices of a match.
    """
    # print ( pattern )
    
    # Translate the PROSITE-like pattern to regex
    regex_pattern = pattern.replace('-', '')  # Remove hyphens
    regex_pattern = regex_pattern.replace('{', '[^')  # Translate not allowed amino acids
    regex_pattern = regex_pattern.replace('}', ']')  # Close negated character class
    
    # Find all matches of the regex pattern in the sequence
    matches = [(match.start(), match.end()) for match in re.finditer(regex_pattern, sequence)]
    
    return matches

# def find_pattern_locations(pattern, protein_sequence):
#     pattern = pattern.replace('x', '.')  # '.' in regex matches any character
#     pattern = pattern.replace('[', '')  # Remove bracket notation
#     pattern = pattern.replace(']', '')  # since we're directly translating
#     pattern = pattern.replace('x(0,1)', '.{0,1}')  # Specify 0 or 1 occurrences
#     pattern = pattern.replace('>', '$')  # End of the string

#     # Search for the pattern
#     matches = re.finditer(pattern, protein_sequence)

#     # Collect and return the start positions of all matches
#     locations = [match.start() for match in matches]
#     return locations
# is this correct:  [DEQGSTALMKRH]-[LIVMFYSTAC]-[GNQ]-[LIVMFYAG]-[DNEKHS]-S-[LIVMST]-{PCFY}-[STAGCPQLIVMF]-[LIVMATN]-[DENQGTAKRHLM]-[LIVMWSTA]-[LIVGSTACR]-{LPIY}-{VY}-[LIVMFA]. converts to 
# [DEQGSTALMKRH][LIVMFYSTAC][GNQ][LIVMFYAG][DNEKHS]S[LIVMST][^PCFY][STAGCPQLIVMF][LIVMATN][DENQGTAKRHLM][LIVMWSTA][LIVGSTACR][^LPIY][^VY][LIVMFA]

# is this correct [RK](2)-x-[ST]. converted to [RK]{2}.[ST]


def prosite_to_regex(prosite_pattern):

    prosite_pattern = prosite_pattern.replace('-', '')
    if prosite_pattern.endswith('.'):
        prosite_pattern = prosite_pattern[:-1]
    regex_pattern = prosite_pattern.replace('x', '.')

    # Correct handling of exclusions
    regex_pattern = re.sub(r'\{([^}]+)\}', r'[^\1]', regex_pattern)

    # Translate repetition ranges
    regex_pattern = regex_pattern.replace('(', '{').replace(')', '}')

    # Start and end of string
    regex_pattern = regex_pattern.replace('<', '^').replace('>', '$')

    return regex_pattern

def find_matches(pattern, protein_sequence):
    """
    Find matches of a PROSITE pattern within a protein sequence.
    """
    # Convert the PROSITE pattern to a regular expression pattern
    regex_pattern = prosite_to_regex(pattern)

    # print ( pattern )
    # print ( regex_pattern )    
    # print ( protein_sequence )    
    
    try: 
        matches = re.findall(regex_pattern, protein_sequence)
        # if len(matches)==0:
        if len(matches) ==0:
            print ( pattern, 'No hits for ', regex_pattern)
        return matches
    except Exception:
        return []

# # Example usage
# pattern = "[DEQGSTALMKRH]-[LIVMFYSTAC]-[GNQ]-[LIVMFYAG]-[DNEKHS]-S-[LIVMST]-{PCFY}-[STAGCPQLIVMF]-[LIVMATN]-[DENQGTAKRHLM]-[LIVMWSTA]-[LIVGSTACR]-{LPIY}-{VY}-[LIVMFA]."
# protein_sequence = "YOUR_PROTEIN_SEQUENCE_HERE"

def find_pattern_hits(df, protein_sequence):
    results = []
    for _, row in df.iterrows():
        id = row['ID']
        de = row['DE']
        pa_pattern = ''.join(row['PA'])  # Assuming PA patterns are split across multiple entries
        # print (id,  pa_pattern )
        if pa_pattern and len(pa_pattern)>0:
            locations = find_matches ( pa_pattern, protein_sequence )
            if len(locations)>0:
                result = {
                    'ID': id,
                    'LOC': locations,
                    'NUM': len(locations),
                    'DES': de
                }
                results.append(result)
    return results


# # Example usage
# pattern = "[DEQGSTALMKRH]-[LIVMFYSTAC]-[GNQ]-[LIVMFYAG]-[DNEKHS]-S-[LIVMST]-{PCFY}-[STAGCPQLIVMF]-[LIVMATN]-[DENQGTAKRHLM]-[LIVMWSTA]-[LIVGSTACR]-{LPIY}-{VY}-[LIVMFA]."
# protein_sequence = "YOUR_PROTEIN_SEQUENCE_HERE"

def find_pattern_hits_from_id(protein_sequence, df, idv):
    results = []
    filtered_df = df[df['ID'] == idv]
    for _, row in filtered_df.iterrows():
        id = row['ID']
        de = row['DE']
        pa_pattern = ''.join(row['PA'])
        if pa_pattern and len(pa_pattern)>0:
            locations = find_matches ( pa_pattern, protein_sequence )
            if len(locations)>0:
                result = {
                    'ID': id,
                    'LOC': locations,
                    'NUM': len(locations),
                    'DES': de
                }
                results.append(result)
    return results

def countHits ( results ):
    id_counts = defaultdict(int)
    for result in results:
        id_counts[result['ID']] += result['NUM']
    sorted_id_counts = sorted(id_counts.items(), key=lambda x: x[1], reverse=True)
    return sorted_id_counts



def find_motifs_in_sequences(sequences, df):
    motif_info = []
    for _, row in df.iterrows():
        regex_pattern = convert_pa_to_regex(row['PA'])
        motif_info.append((row['ID'], row['DE'], regex_pattern))
    
    # Dictionary to count hits for each motif
    motif_counts = defaultdict(int)
    
    # Search each sequence for each motif
    for sequence in sequences:
        for id, de, pattern in motif_info:
            if re.search(pattern, sequence):
                motif_counts[(id, de)] += 1
    
    # Sort motifs by hit count, most hits first
    sorted_motifs = sorted(motif_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Print sorted motifs with their counts
    for (id, de), count in sorted_motifs:
        print(f"ID: {id}, DE: {de}, Count: {count}")

def loadProsite (filepath, showdb=True):
    # filepath = './prosite.db'  # Update this to the path of your file
    df = load_and_parse_file(filepath)
    if showdb:
        pd.set_option('display.max_rows', None)  # None means unlimited
        pd.set_option('display.max_columns', None)  # Adjust as per your DataFrame's width
        pd.set_option('display.width', 1000)  # Adjust the width for better readability
        pd.set_option('display.max_colwidth', None)  # None means unlimited column width
        print(df)
    return  df
        
        
        
        
# Example usage
if __name__ == "__main__":
    db = loadProsite(False)
    protein_sequence = "CWLPYPCCWMPCPYCGAGTGCTWLPYPCCDDEESTWPCCCCWLPYPCCWMPCPYCAGCTGAGTAGCTCWLPYPCCWMPCPYCGTACGTAGCTAGCTG"
    locations = find_pattern_hits ( protein_sequence, db )
    for l in locations:
        print ( l["DES"])
    # print ('patterns ',  locations )

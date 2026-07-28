import json
from ion import works

def compare_protein_sequences(seq1, seq2):
    """
    Compare two protein sequences and return the percentage similarity
    and the mismatches.
    
    Parameters:
    seq1 (str): First protein sequence
    seq2 (str): Second protein sequence
    
    Returns:
    dict: JSON object with similarity percentage and mismatches
    """
    if len(seq1) != len(seq2):
        raise ValueError("Sequences must be of the same length")

    matches = 0
    mismatches = []

    for i in range(len(seq1)):
        if seq1[i] == seq2[i]:
            matches += 1
        else:
            mismatches.append({"position": i, "seq1": seq1[i], "seq2": seq2[i]})

    similarity_percentage = (matches / len(seq1)) * 100

    result = {
        "similarity_percentage": similarity_percentage,
        "mismatches": mismatches
    }

    return result

def generate_kmers(sequence, k):
    kmers = set()
    for i in range(len(sequence) - k + 1):
        kmers.add(sequence[i:i + k])
    return kmers

def compare_sequences(seq1, seq2, k):
    kmers1 = generate_kmers(seq1, k)
    kmers2 = generate_kmers(seq2, k)
    
    # Find the intersection of k-mers
    common_kmers = kmers1.intersection(kmers2)
    
    # Calculate similarity score
    score = len(common_kmers) / max(len(kmers1), len(kmers2))
    
    return score




# Example usage
seq1 = works.param (1)
seq2 = works.param (2)
k = 3
similarity_score = compare_sequences(seq1, seq2, k)
works.resolve({'score':similarity_score})



# comparison_result = compare_protein_sequences(seq1, seq2)
# comparison_result_json = json.dumps(comparison_result, indent=4)
# works.resolve(comparison_result_json)

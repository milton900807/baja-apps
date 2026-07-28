import numpy as np
from collections import Counter

def one_hot_encode_kmer(kmer):
    """
    One-hot encode a k-mer.

    Parameters:
    kmer (str): The k-mer to be encoded.

    Returns:
    np.array: A one-hot encoded representation of the k-mer.
    """
    # Define the mapping of nucleotides to binary vectors
    mapping = {
        'A': [1, 0, 0, 0],
        'C': [0, 1, 0, 0],
        'G': [0, 0, 1, 0],
        'T': [0, 0, 0, 1]
    }
    
    # Initialize an empty list to hold the encoded k-mer
    one_hot_encoded_kmer = []
    
    # Convert each nucleotide in the k-mer to its binary vector
    for nucleotide in kmer:
        if nucleotide in mapping:
            one_hot_encoded_kmer.extend(mapping[nucleotide])
        else:
            raise ValueError(f"Invalid nucleotide: {nucleotide}")
    
    # Convert the list of binary vectors to a NumPy array
    return np.array(one_hot_encoded_kmer)

def dna_to_kmer_feature_vector(dna_sequence, k):
    """
    Convert a DNA sequence to a k-mer feature vector.

    Parameters:
    dna_sequence (str): The DNA sequence to be converted.
    k (int): The length of k-mers to be generated.

    Returns:
    np.array: A feature vector representing the one-hot encoded k-mers of the DNA sequence.
    """
    # Generate k-mers from the DNA sequence
    k_mers = [dna_sequence[i:i + k] for i in range(len(dna_sequence) - k + 1)]
    
    # One-hot encode each k-mer and concatenate the results
    feature_vector = np.array([one_hot_encode_kmer(kmer) for kmer in k_mers])
    
    # Flatten the feature vector to a single array
    flattened_feature_vector = feature_vector.flatten()
    
    return flattened_feature_vector

# Example usage
dna_sequence = "AGCTTAGCTAAGCTTAGCTA"
k = 20
feature_vector = one_hot_encode_kmer(dna_sequence)
print("Feature Vector:", feature_vector)
print("Feature Vector Shape:", feature_vector.shape)

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

# Example usage
seq1 = works.param (1)
seq2 = works.param (2)
k = works.param(3)
similarity_score = compare_sequences(seq1, seq2, k)
works.resolve({'score':similarity_score})

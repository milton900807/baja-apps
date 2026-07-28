





def generate_sequences_with_edit_distance(sequence, remaining_edits, allowed_bases=('A', 'T', 'C', 'G')):
    if remaining_edits == 0:
        return [sequence]

    sequences = []
    for i in range(len(sequence)):
        for base in allowed_bases:
            if base != sequence[i]:
                mutated_sequence = sequence[:i] + base + sequence[i+1:]
                sequences.extend(generate_sequences_with_edit_distance(mutated_sequence, remaining_edits-1))
    return sequences

if __name__ == "__main__":
    reference_sequence = "ATCGATCGATCGATCGATCG"
    edit_distance_limit = 2

    all_sequences = generate_sequences_with_edit_distance(reference_sequence, edit_distance_limit)
    print(f"Number of sequences with edit distance {edit_distance_limit}: {len(all_sequences)}")
    print("Some example sequences:")
    for i in range(min(10, len(all_sequences))):
        print(all_sequences[i])

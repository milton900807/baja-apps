from ion import works

short_seq = works.param (1)
long_seq = works.param (2)


def find_best_alignment(short_seq, long_seq):
    max_score = 0
    best_pos = 0
    length_of_short = len(short_seq)

    # Iterate through the long sequence with a sliding window the size of the short sequence
    for i in range(len(long_seq) - length_of_short + 1):
        sub_seq = long_seq[i:i + length_of_short]
        score = sum(1 for a, b in zip(short_seq, sub_seq) if a == b)

        # Update the best score and position
        if score > max_score:
            max_score = score
            best_pos = i

    # Determine the end position
    best_end = best_pos + length_of_short - 1
    best_match = long_seq[best_pos:best_pos + length_of_short]
    return best_pos, best_end, best_match, max_score

# Example usage:
start, end, match, score = find_best_alignment(short_seq, long_seq)
# print("Best position:", position)
# print("Best match:", match)
# print("Max score:", score)
works.resolve({"start": start, "end":end, "match":match, "score": score })

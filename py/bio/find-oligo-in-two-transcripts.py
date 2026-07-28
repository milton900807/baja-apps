

    
import time
from ion import works
     
transcript1 = works.param (1)
transcript2 = works.param (2)

def levenshtein_distance(s1, s2):
    # Create a matrix to store distances
    # The size of the matrix is (len(s1)+1) x (len(s2)+1)
    # +1 is because we also consider empty prefixes of both strings
    distances = [[0 for _ in range(len(s2) + 1)] for _ in range(len(s1) + 1)]

    # Initialize the first column and first row of the matrix
    # This corresponds to transformations from an empty string to prefixes of each string
    for i in range(len(s1) + 1):
        distances[i][0] = i  # Deletion from s1 to empty s2 prefix
    for j in range(len(s2) + 1):
        distances[0][j] = j  # Insertion from empty s1 prefix to s2

    # Populate the distances matrix
    for i in range(1, len(s1) + 1):
        for j in range(1, len(s2) + 1):
            # If last characters of two substrings are the same, no operation is needed
            # Else, consider the cost of substitution
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            distances[i][j] = min(
                distances[i - 1][j] + 1,  # Deletion
                distances[i][j - 1] + 1,  # Insertion
                distances[i - 1][j - 1] + cost  # Substitution
            )

    # The distance between the two strings is in the bottom-right corner of the matrix
    return distances[len(s1)][len(s2)]

def calculate_edit_distance(s1, s2):
    """Calculate the edit distance between two strings, considering only 0, 1, or more than 1."""
    if s1 == s2:
        return 0
    elif abs(len(s1) - len(s2)) > 1:
        return 2  # Return a value indicating the strings are more than 1 edit apart
    else:
        differences = 0
        for a, b in zip(s1, s2):
            if a != b:
                differences += 1
            if differences > 1:
                return differences
        return differences

def find_matches(transcript1, transcript2, match_length):
    matches = []
    total_iterations = (len(transcript1) - match_length + 1) * (len(transcript2) - match_length + 1)
    current_iteration = 0
    last_reported_progress = -1
    start_time = time.time()

    for i in range(len(transcript1) - match_length + 1):
        sub1 = transcript1[i:i+match_length]
        for j in range(len(transcript2) - match_length + 1):
            sub2 = transcript2[j:j+match_length]
            if levenshtein_distance(sub1, sub2) <= 2:
                matches.append({"seq": sub1, "t1": i, "t2": j})
                if len(matches) > 100:
                    return matches
            current_iteration += 1
            current_progress = (current_iteration / total_iterations) * 100

            if int(current_progress) > last_reported_progress:
                print(f"Progress: {current_progress:.2f}%")
                last_reported_progress = int(current_progress)

            if current_iteration % (total_iterations // 100) == 0 or current_iteration == total_iterations:
                elapsed_time = time.time() - start_time  # Elapsed time in seconds
                estimated_total_time = elapsed_time / (current_progress / 100)  # Estimated total time in seconds
                estimated_time_remaining = estimated_total_time - elapsed_time  # Estimated remaining time in seconds
                estimated_time_remaining_minutes = int(estimated_time_remaining / 60)
                works.msg(f"Progress: {current_progress:.2f}% - Estimated Time Remaining: {estimated_time_remaining_minutes} minutes")

    return matches

    # Aggregate matches by sequence and their positions
    # aggregated_matches = {}
    # for match in matches:
    #     key = match["sequence"]
    #     if key not in aggregated_matches:
    #         aggregated_matches[key] = {"count": 1, "positions": [(match["transcript1_pos"], match["transcript2_pos"])]}
    #     else:
    #         aggregated_matches[key]["count"] += 1
    #         aggregated_matches[key]["positions"].append((match["transcript1_pos"], match["transcript2_pos"]))

    # # Sort aggregated matches by count and return the top 10
    # sorted_matches = sorted(aggregated_matches.items(), key=lambda item: item[1]["count"], reverse=True)
    # top_matches = sorted_matches[:10]

    # # Format results to include sequence, count, and positions
    # formatted_results = [{
    #     "sequence": match[0],
    #     "count": match[1]["count"],
    #     "positions": match[1]["positions"]
    # } for match in top_matches]

    # return formatted_results

match_length = 16  # Adjust match_length as needed
results = find_matches(transcript1, transcript2, match_length)


print(results)
works.resolve({'matches': results })


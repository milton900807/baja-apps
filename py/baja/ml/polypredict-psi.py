import numpy as np

def calculate_psi(polygon_points, window_start, window_end):
    """
    Calculate Percent Spliced In (PSI) for a given window along a transcript.

    Args:
        polygon_points (dict): A named array of arrays representing RNA-seq data, 
                               where each key is a transcript ID and the value is an array of coverage points.
        window_start (int): The start position of the window along the transcript.
        window_end (int): The end position of the window along the transcript.

    Returns:
        dict: A dictionary with transcript IDs as keys and the calculated PSI as values.
    """
    psi_values = {}

    for transcript_id, coverage_points in polygon_points.items():
        # Ensure coverage points are within the range of the specified window
        if len(coverage_points) < window_end:
            print(f"Warning: Transcript {transcript_id} does not cover the entire window.")
            continue

        # Extract relevant reads in the window
        inclusion_reads = np.sum(coverage_points[window_start:window_end])
        exclusion_reads = np.sum(coverage_points[:window_start]) + np.sum(coverage_points[window_end:])

        # Calculate PSI
        if (inclusion_reads + exclusion_reads) == 0:
            psi = 0  # Avoid division by zero
        else:
            psi = inclusion_reads / (inclusion_reads + exclusion_reads)

        psi_values[transcript_id] = psi

    return psi_values


# Example usage
polygon_points = {
    "transcript_1": [10, 15, 20, 15, 10, 5, 5, 10, 15, 20],
    "transcript_2": [5, 10, 15, 10, 5, 0, 0, 5, 10, 15],
    # Add more transcripts as needed
}

# Define the window start and end positions
window_start = 2
window_end = 8

# Calculate PSI
psi_results = calculate_psi(polygon_points, window_start, window_end)

# Display the results
for transcript, psi in psi_results.items():
    print(f"Transcript {transcript}: PSI = {psi:.2f}")

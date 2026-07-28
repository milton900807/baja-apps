import numpy as np
from twobitreader import TwoBitFile
from collections import defaultdict

def load_all_chromosomes_from_2bit(filepath):
    """
    Loads all chromosome sequences from a 2bit file.

    Parameters:
    - filepath (str): Path to the .2bit file.

    Returns:
    - dict: Dictionary with chromosome names as keys and sequences as values.
    """
    genome = TwoBitFile(filepath)  # Open the 2bit file
    chromosomes = {}

    print(f"Found chromosomes: {list(genome.keys())}")

    # Load all available chromosomes into the dictionary
    for chrom in genome.keys():
        print(f"Loading chromosome: {chrom}")
        chromosomes[chrom] = str(genome[chrom])  # Store each sequence as a string

    return chromosomes

def find_window_counts(sequence, window_size=30):
    """
    Extracts all windows from a sequence and counts their occurrences.

    Parameters:
    - sequence (str): A genome sequence to extract windows from.
    - window_size (int): The size of the sliding window (default is 30).

    Returns:
    - list: List of window counts.
    """
    window_counts = defaultdict(int)  # Dictionary to store window counts

    # Slide the window over the sequence one base at a time
    for i in range(len(sequence) - window_size + 1):
        window = sequence[i:i + window_size]
        window_counts[window] += 1  # Increment the count for this window

    return list(window_counts.values())  # Return counts as a list

def compute_statistics(counts):
    """
    Computes the max, mean, median, and standard deviation of the given counts.

    Parameters:
    - counts (list): List of counts.

    Returns:
    - dict: Dictionary with max, mean, median, and standard deviation.
    """
    return {
        "max_count": np.max(counts),
        "mean_count": np.mean(counts),
        "median_count": np.median(counts),
        "std_dev": np.std(counts)
    }

def write_results_to_file(results, output_file):
    """
    Writes the statistics results to a file.

    Parameters:
    - results (dict): Dictionary with statistics for each chromosome.
    - output_file (str): Path to the output file.
    """
    with open(output_file, 'w') as f:
        f.write("Chromosome Statistics:\n")
        for chrom, stats in results.items():
            f.write(f"\nChromosome: {chrom}\n")
            for key, value in stats.items():
                f.write(f"  {key}: {value}\n")

if __name__ == "__main__":
    filepath = "./hs1.2bit"  # Replace with the path to your 2bit file
    output_file = "chromosome_statistics.txt"  # Output file to store results

    # Load all chromosomes from the 2bit file
    chromosomes = load_all_chromosomes_from_2bit(filepath)

    # Compute statistics for each chromosome
    results = {}
    for chrom, sequence in chromosomes.items():
        print(f"\nProcessing chromosome: {chrom}")
        counts = find_window_counts(sequence)
        stats = compute_statistics(counts)
        results[chrom] = stats  # Store the stats for this chromosome

    # Write the results to the output file
    write_results_to_file(results, output_file)

    print(f"\nAnalysis complete. Results saved to {output_file}.")

from ion import works
from collections import Counter


sequence  = works.param (1)

def find_repeated_windows(sequence, window_length=16):
    # Check if the sequence length is at least as long as the window_length
    if len(sequence) < window_length:
        print("The sequence is shorter than the window length.")
        return []

    # Sliding through the sequence and collecting windows
    windows = [sequence[i:i + window_length] for i in range(len(sequence) - window_length + 1)]

    # Count occurrences of each window
    window_counts = Counter(windows)

    # Filter and collect windows that have more than one occurrence
    repeated_windows = [window for window, count in window_counts.items() if count > 1]

    return repeated_windows

# Example usage
repeated_windows = find_repeated_windows(sequence)
print("Repeated windows:", repeated_windows)
works.resovle ( {'repeate': repeated_windows })
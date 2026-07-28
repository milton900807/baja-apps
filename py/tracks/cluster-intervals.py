from sklearn.decomposition import PCA
from sklearn.preprocessing import OneHotEncoder
import numpy as np
import json



from ion import works
import json
from sklearn.metrics import classification_report

intervals = works.param(1)
from sklearn.decomposition import PCA
from sklearn.preprocessing import OneHotEncoder
import numpy as np
import json


# Step 1: Pad sequences to the same length
def pad_sequences(sequences, max_len):
    padded_sequences = []
    for seq in sequences:
        if len(seq) < max_len:
            padded_seq = seq + 'N' * (max_len - len(seq))  # Use 'N' to pad
        else:
            padded_seq = seq[:max_len]  # Truncate if necessary
        padded_sequences.append(padded_seq)
    return padded_sequences

# Extract DNA sequences
dna_sequences = [interval['seq'] for interval in intervals]
max_length = max(len(seq) for seq in dna_sequences)
padded_sequences = pad_sequences(dna_sequences, max_length)

# Step 2: Encode DNA sequences using one-hot encoding
def encode_sequences(sequences):
    encoder = OneHotEncoder(categories=[['A', 'T', 'C', 'G', 'N']], sparse_output=False)
    encoded_sequences = []
    
    for seq in sequences:
        encoded_seq = encoder.fit_transform(np.array(list(seq)).reshape(-1, 1)).flatten()
        encoded_sequences.append(encoded_seq)
    
    return np.array(encoded_sequences)

encoded_sequences = encode_sequences(padded_sequences)

# Step 3: Normalize based on sequence length
sequence_lengths = np.array([len(seq) for seq in dna_sequences])
# normalized_sequences = encoded_sequences / sequence_lengths[:, np.newaxis]

# Step 4: Apply PCA
pca = PCA(n_components=2)
pca_result = pca.fit_transform(encoded_sequences)

# Step 5: Create a scatter plot data structure
scatter_plot_data = {
    "title": "PCA of DNA Sequences",
    "xlabel": "Principal Component 1",
    "ylabel": "Principal Component 2",
    "points": []
}

for i, interval in enumerate(intervals):
    scatter_plot_data["points"].append({
        "name": interval['t'],
        "xi": float(interval['x1']),
        "xf": float(interval['x2']),
        "seq": str(interval['seq']),
        "x": float(pca_result[i, 0]),
        "y": float(pca_result[i, 1])
    })

# Convert the scatter plot data to JSON
works.resolve(scatter_plot_data)
# Display JSON output

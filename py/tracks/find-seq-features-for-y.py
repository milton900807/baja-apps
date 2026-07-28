import numpy as np
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import json
from ion import works

data = works.param(1)
# data = [
#     {'interval': (1, 100), 'seq': 'ATGCGT...', 'x': 50, 'y': 1.5},
#     {'interval': (101, 200), 'seq': 'CGTAGC...', 'x': 150, 'y': 2.3},
#     # Add more data points here
# ]

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

# Extract DNA sequences and other relevant data
dna_sequences = [entry['seq'] for entry in data]
intervals = [entry['interval'] for entry in data]
x_points = [entry['x'] for entry in data]
y_values = np.array([entry['y'] for entry in data])

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

# Step 3: Extract features
# Combine encoded sequences with interval range and x position as features
features = []
for i in range(len(data)):
    interval = intervals[i]
    x_point = x_points[i]
    
    # Feature 1: Encoded sequence
    seq_features = encoded_sequences[i]
    
    # Feature 2: Normalized interval range (to consider interval size)
    interval_range = np.array(interval) / max_length
    
    # Feature 3: Normalized x position within interval
    normalized_x = (x_point - interval[0]) / (interval[1] - interval[0])
    
    # Combine all features
    combined_features = np.concatenate([seq_features, interval_range, [normalized_x]])
    features.append(combined_features)

features = np.array(features)

# Step 4: Split data into training and test sets
X_train, X_test, y_train, y_test = train_test_split(features, y_values, test_size=0.2, random_state=42)

# Step 5: Train a RandomForestRegressor model
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Step 6: Evaluate the model
y_pred = model.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

# Step 7: Identify important features
feature_importances = model.feature_importances_
important_features = np.argsort(feature_importances)[-10:].tolist()  # Top 10 important feature indices

# Step 8: Prepare the report as a JSON object
report = {
    "metrics": {
        "Mean Squared Error": mse,
        "R-squared": r2
    },
    "feature_importances": important_features,
    "feature_importance_values": feature_importances.tolist()
}

# report_json = json.dumps(report, indent=4)
works.resolve(report)

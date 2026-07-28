import joblib
import numpy as np

# Load the trained model
model = joblib.load('../ljlapps/py/ml/dilution_series_model.pkl')

# Function to find contiguous sequences (same as in training)
def find_contiguous_sequences(array):
    numeric_indices = []
    numeric_values = []

    for i, val in enumerate(array):
        if val.isdigit():
            numeric_indices.append(i)
            numeric_values.append(int(val))

    contiguous_sequences = []
    temp_sequence = [numeric_indices[0]]

    for i in range(1, len(numeric_indices)):
        if len(temp_sequence) >= 4 and abs(numeric_values[i] - numeric_values[i-1]) * 2 == abs(numeric_values[i] - numeric_values[temp_sequence[0]]):
            temp_sequence.append(numeric_indices[i])
        else:
            if len(temp_sequence) >= 4:
                contiguous_sequences.append(temp_sequence)
            temp_sequence = [numeric_indices[i]]

    if len(temp_sequence) >= 4:
        contiguous_sequences.append(temp_sequence)

    return contiguous_sequences

# New test array
test_array = [
    "X1", "X2", "X3", "X4", "X5", "1000", "1001", "1002", "1003", "1004", "X6", "X7",
    "5000", "5001", "5002", "5003", "5004", "X8", "X9", "99999", "100000", "100001", "100002", "100003"
]

# Prepare test features
X_test = np.array([i for i in range(len(test_array))]).reshape(-1, 1)

# Make predictions
predictions = model.predict(X_test)

# Output results
for i, (val, pred) in enumerate(zip(test_array, predictions)):
    print(f"Index {i}: {val} - {'Part of contiguous sequence' if pred == 1 else 'Not part of contiguous sequence'}")
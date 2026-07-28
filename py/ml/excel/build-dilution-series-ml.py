import numpy as np
import pandas as pd
import joblib
import re
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

# Function to extract numerical values from a string
def extract_numeric_value(s):
    match = re.search(r'\d+\.\d+|\d+', s)  # Extract first occurrence of a number
    if match:
        return float(match.group())
    return None  # Return None if no digits found

# Function to find numerical sequences, considering duplications
def find_numerical_sequences(array):
    extracted_values = {}
    for i, val in enumerate(array):
        num_val = extract_numeric_value(val)
        if num_val is not None:
            extracted_values.setdefault(num_val, []).append(i)  # Store indices for each numerical value
    
    # Sort by numerical value
    sorted_values = sorted(extracted_values.keys(), reverse=True)
    
    # Identify dilution sequences
    sequences = []
    temp_sequence = extracted_values[sorted_values[0]] if sorted_values else []
    
    for i in range(1, len(sorted_values)):
        prev_val = sorted_values[i - 1]
        curr_val = sorted_values[i]
        
        # Allow for minor floating-point inaccuracies and ensure sequence continuity
        if np.isclose(prev_val / curr_val, 2.0, atol=0.2) or np.isclose(curr_val / prev_val, 0.5, atol=0.2):
            temp_sequence.extend(extracted_values[curr_val])
        else:
            if len(temp_sequence) >= 2:  # Ensuring minimum sequence length
                sequences.append(temp_sequence)
            temp_sequence = extracted_values[curr_val]
    
    if len(temp_sequence) >= 2:
        sequences.append(temp_sequence)
    
    return sequences

# Generate a large dataset for training
def generate_large_dataset(size=10000):
    base_values = ["STD" + str(100 / (2 ** i)) for i in range(10)] + ["TE"]
    dataset = np.random.choice(base_values, size=size, p=[0.09] * 10 + [0.1])
    return dataset.tolist()

# Create dataset
large_array = generate_large_dataset()
sequences = find_numerical_sequences(large_array)

# Creating training data
X = np.array([i for i in range(len(large_array))]).reshape(-1, 1)  # Features: Index positions
y = np.array([1 if any(i in seq for seq in sequences) else 0 for i in range(len(large_array))])  # Labels: 1 if part of a sequence, else 0

# Ensure class balance
neg_indices = np.where(y == 0)[0]
pos_indices = np.where(y == 1)[0]
if len(neg_indices) > len(pos_indices):
    sampled_neg_indices = np.random.choice(neg_indices, size=len(pos_indices), replace=False)
    sampled_indices = np.concatenate([pos_indices, sampled_neg_indices])
    X, y = X[sampled_indices], y[sampled_indices]

# Splitting data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Training a classifier
model = RandomForestClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

# Saving the trained model
joblib.dump(model, "numerical_sequence_model.pkl")

# Function to predict sequence locations in a given array
def predict_numerical_sequences(array, model_path="numerical_sequence_model.pkl"):
    model = joblib.load(model_path)
    X_input = np.array([i for i in range(len(array))]).reshape(-1, 1)
    predictions = model.predict(X_input)
    positive_indices = X_input.flatten()[predictions == 1]
    positive_values = [array[i] for i in positive_indices]
    return positive_indices, positive_values

# Example usage
example_array = ["STD100", "STD50", "STD25", "STD12.5", "TE", "TE", "STD6.25", "STD3.12", "TE", "STD1.56"]
indices, values = predict_numerical_sequences(example_array)
print("Predicted Indices:", indices)
print("Predicted Values:", values)
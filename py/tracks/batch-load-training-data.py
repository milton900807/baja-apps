import numpy as np
import pandas as pd
import requests
import joblib
import pymongo
import io
import json
import re
from bson.binary import Binary
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from datetime import datetime

# MongoDB client setup
client = pymongo.MongoClient("mongodb://localhost:27017/")
db = client['model_db']
collection = db['models']

payload = {"a": "/bd/rnaseq/heart/ENCFF904TSK_minus_strand.bw", "b": 55039548, "c": 55064852, "d": 1}

# Function to fetch RNA-seq data
def fetch_rnaseq_data(transcript_id, start, end):
    url = "https://data.lajollalabs.com/ionworks/py/py/baja/bigwig/view-bigwig.py"
    headers = {
        "Content-Type": "application/json"
    }
    response = requests.post(url, data=json.dumps(payload), headers=headers, verify=False)
    # response = requests.post(url, data=json.dumps(payload), headers=headers)
    if response.status_code == 200:
        data = response.json()
        return data
        # return [{"x": point[0], "y": point[1]} for point in data]
    else:
        raise ValueError(f"Failed to fetch RNA-seq data for {transcript_id}: {response.text}")

# # Parameters from works
# polygons = works.param(1)
# sequence = works.param(5)  # Assuming this is the sequence data
# reference_polygon = works.param(2)
# user = works.param(3)
# model_name = works.param(4)
# transcript_list = works.param(6)  # List of transcript IDs and coordinates
polygons = []


def label_positions(x_pos, annotations):
    for exon in annotations:
        if exon['xi'] <= x_pos <= exon['xf']:
            return 1  # Exon present
    return 0

def extract_features(polygon_points, key, reference_polygon, sequence, sequence_length=500):
    features = []
    labels = []
    
    if sequence is None:
        raise ValueError("The sequence parameter is None. Please provide a valid sequence.")

    if not polygon_points:
        raise ValueError("The polygon_points list is empty. Cannot extract features.")

    for pt in polygon_points:
        x_pos = pt['x']
        y_val = pt['y']

        # Ensure that the sequence can be sliced correctly
        if len(sequence) < sequence_length:
            raise ValueError("The sequence length is shorter than the expected sequence_length of 500 bp.")
        
        # Extract sequence segment centered on x_pos
        seq_start = max(0, x_pos - sequence_length // 2)
        seq_end = min(len(sequence), seq_start + sequence_length)
        seq_segment = sequence[seq_start:seq_end]

        if len(seq_segment) < sequence_length:
            seq_segment = seq_segment.ljust(sequence_length, 'N')  # Pad with 'N' if too short

        # Convert sequence to features (e.g., one-hot encoding or k-mer frequencies)
        sequence_features = convert_sequence_to_features(seq_segment)

        # Combine position, y-value, and sequence features
        combined_features = [x_pos, y_val] + sequence_features
        features.append(combined_features)

        label = label_positions(x_pos, reference_polygon)
        labels.append(label)

    if not labels:
        raise ValueError("No labels were generated during feature extraction.")

    # Define the feature names
    sequence_feature_names = [f"{key}_seq_{i}" for i in range(len(sequence_features))]
    feature_columns = ['x', key] + sequence_feature_names
    df_features = pd.DataFrame(features, columns=feature_columns)
    df_features['label'] = labels
    return df_features

def convert_sequence_to_features(seq_segment):
    """
    Convert a sequence segment to features.
    This could be one-hot encoding, k-mer counts, etc.
    For simplicity, we’ll use a simple k-mer count example here.
    """
    kmer_size = 3
    kmer_counts = {}
    for i in range(len(seq_segment) - kmer_size + 1):
        kmer = seq_segment[i:i+kmer_size]
        if kmer in kmer_counts:
            kmer_counts[kmer] += 1
        else:
            kmer_counts[kmer] = 1

    # Convert k-mer counts to a feature vector (example: A simple vector of counts)
    kmer_vector = list(kmer_counts.values())
    return kmer_vector

def sanitize_name(name):
    pattern = r'[.$\[\]/]'
    sanitized_name = re.sub(pattern, '_', name)
    return sanitized_name

def save_model_to_mongo(model, user, model_name, feature_names, description="", path="", version=1):
    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_buffer.seek(0)
    model_bin = Binary(model_buffer.read())

    model_document = {
        "name": model_name,
        "description": description,
        "id": version,
        "path": path,
        "user": user,
        "model_type": type(model).__name__,
        "date_created": datetime.utcnow(),
        "model": model_bin,
        "feature_names": feature_names,
    }

    collection.replace_one(
        {"user": user, "name": model_name}, 
        model_document, 
        upsert=True
    )

    print(f"Model '{model_name}' for user '{user}' saved to MongoDB.")

def load_model_from_mongo(user, model_name):
    model_data = collection.find_one({"user": user, "name": model_name})
    if model_data:
        model_buffer = io.BytesIO(model_data['model'])
        model = joblib.load(model_buffer)
        feature_names = model_data.get('feature_names', [])
        return model, feature_names
    else:
        return None, []

def ensure_feature_order(df, expected_features):
    df = df.copy()
    for feature in expected_features:
        if feature not in df.columns:
            df[feature] = 0
    df = df[expected_features]
    return df

def update_feature_set(saved_feature_names, new_feature_names):
    updated_features = list(set(saved_feature_names).union(set(new_feature_names)))
    updated_features.sort(key=lambda x: (saved_feature_names.index(x) if x in saved_feature_names else len(saved_feature_names)))
    return updated_features

transcript_list = [{
    "transcript_id": 'Test',
    'start': 55039548,
    'end': 55064852,
    'chr' : 1
}]
# Step 1: Fetch RNA-seq data for each transcript and add to polygons
for transcript_info in transcript_list:
    transcript_id = transcript_info["transcript_id"]
    start = transcript_info["start"]
    end = transcript_info["end"]
    
    rnaseq_data = fetch_rnaseq_data(transcript_id, start, end)
    print ( rnaseq_data )
    polygons[transcript_id] = rnaseq_data

# Step 2: Load existing model and features
clf, saved_feature_names = load_model_from_mongo(user, model_name)

# Step 3: Process new polygons with sequence features
df_features = pd.DataFrame()
sanitized_feature_columns = [sanitize_name(col) for col in polygons.keys()]

for polygon_type in polygons:
    sanitized_polygon_type = sanitize_name(polygon_type)
    dff = extract_features(polygons[polygon_type], sanitized_polygon_type, reference_polygon, sequence)
    df_features = pd.concat([df_features, dff], ignore_index=True)

df_features.columns = [sanitize_name(col) for col in df_features.columns]
X = df_features[sanitized_feature_columns]
y = df_features.get('label')  # Safely access the 'label' column

if y is None:
    raise ValueError("The 'label' column is missing from the DataFrame. Ensure labels are generated during feature extraction.")

# Step 4: Merge new features with existing features
if clf:
    print("Model loaded from MongoDB.")
    # Update the feature set to include new features
    updated_features = update_feature_set(saved_feature_names, sanitized_feature_columns)
    X = ensure_feature_order(X, updated_features)
else:
    updated_features = sanitized_feature_columns
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    print("Training new model.")

# Step 5: Train or retrain the model
clf.fit(X, y)
save_model_to_mongo(clf, user, model_name, updated_features)
print(f"Model '{model_name}' for user '{user}' trained and saved with updated features.")

# Step 6: Split the data for testing and evaluate
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
X_test = ensure_feature_order(X_test, updated_features)

y_pred = clf.predict(X_test)
report_dict = classification_report(y_test, y_pred, output_dict=True)
report_dict['features'] = updated_features

works.resolve(report_dict)

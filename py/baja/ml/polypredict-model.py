import numpy as np
import pandas as pd
import joblib
import pymongo
import io
import re
from bson.binary import Binary
from ion import works


# Parameters from works
polygon_points = works.param(1)  # Polygon data
sequence = works.param(2)  # The 500 bp sequence data
user = works.param(3)
database = works.param(4)
model_name = works.param(5)
model_name = 'models'
database = 'ljldb'
# Remove the leading '/' if it exists in the database string
if database.startswith('/'):
    database = database[1:]

client = pymongo.MongoClient(f"mongodb://{database}:27017/")
db = client['model_db']
collection_models = db[model_name]



def load_model_from_mongo(user, model_set_name):
    model_data = collection_models.find_one({"user": user, "name": model_set_name})
    if model_data:
        model_buffer = io.BytesIO(model_data['model'])
        model = joblib.load(model_buffer)
        feature_names = model_data.get('feature_names', [])
        return model, feature_names
    else:
        return None, []

def sanitize_name(name):
    pattern = r'[.$\[\]/]'
    sanitized_name = re.sub(pattern, '_', name)
    return sanitized_name

def convert_sequence_to_features(seq_segment):
    nucleotide_to_vector = {
        'A': [1, 0, 0, 0],
        'C': [0, 1, 0, 0],
        'G': [0, 0, 1, 0],
        'T': [0, 0, 0, 1],
        'N': [0, 0, 0, 0],  # N is a placeholder for any nucleotide
    }

    feature_vector = []
    for nucleotide in seq_segment:
        feature_vector.extend(nucleotide_to_vector.get(nucleotide, [0, 0, 0, 0]))

    return feature_vector

def scale_value(x, original_min=0, original_max=1, new_min=0, new_max=2.0):
    scaled_value = (x - original_min) / (original_max - original_min) * (new_max - new_min) + new_min
    return scaled_value

def extract_features(polygon_points, key):
    features = []
    coords = []

    if not polygon_points:
        raise ValueError("The polygon_points list is empty. Cannot extract features.")

    for pt in polygon_points:
        y_val = scale_value(float(pt['y'])) * 100
        combined_features = [y_val]
        features.append(combined_features)

        coords.append({"x": pt['x'], "y": y_val})  # Store the coordinates

    feature_columns = [key]
    df_features = pd.DataFrame(features, columns=feature_columns)
    return df_features, coords  # Return both features and coordinates

def ensure_feature_order(df, expected_features):
    df = df.copy()
    for feature in expected_features:
        if feature not in df.columns:
            df[feature] = 0
    df = df[expected_features]
    return df

def predict_labels(polygon_points, sequence, user, model_set_name, sequence_length):
    clf, saved_feature_names = load_model_from_mongo(user, model_set_name)
    df_features = pd.DataFrame()
    all_coords = []

    # Extract polygon features
    for polygon_type in polygon_points:
        sanitized_polygon_type = sanitize_name(polygon_type)
        dff, coords = extract_features(polygon_points[polygon_type], sanitized_polygon_type)
        df_features = pd.concat([df_features, dff], ignore_index=True)
        all_coords.extend(coords)

    # Convert the sequence to one-hot encoded features
    sequence_features = convert_sequence_to_features(sequence)
    sequence_df = pd.DataFrame([sequence_features], columns=[f"seq_{i}" for i in range(len(sequence_features))])

    # Combine the polygon features with the sequence features
    df_features = pd.concat([df_features, sequence_df], axis=1)
    
    df_features.columns = [sanitize_name(col) for col in df_features.columns]
    X = ensure_feature_order(df_features, saved_feature_names)

    predictions = clf.predict(X)
    return predictions.tolist(), all_coords  # Return predictions and coordinates

try:
    predictions, coords = predict_labels(polygon_points, sequence, user, model_set_name, sequence_length)

    results = []
    for pt, pred in zip(coords, predictions):
        result = {
            "x": pt['x'],
            "y": pt['y'],
            "label": pred
        }
        results.append(result)
        print(f"Point {pt} -> Predicted Label: {pred}")

    works.resolve(results)
except Exception as e:
    print(f"Error: {e}")

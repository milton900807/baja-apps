import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, learning_curve
from sklearn.metrics import accuracy_score, classification_report
from ion import works
import joblib
import pymongo
from bson import Binary
from datetime import datetime
import io
import re
import json

# Parameters from works
polygons = works.param(1)
reference_polygon = works.param(2)
user = works.param(3)
data_model_name = 'datasets'
model_set_name = 'models'
database = works.param(6)

if database.startswith('/'):
    database = database[1:]

if database is None:
    database = 'localhost'
database = database.rstrip('/')

client = pymongo.MongoClient(f"mongodb://{database}:27017/")
db = client['model_db']
collection_models = db['models']
collection_data = db['datasets']

def save_data(X, y, user, data_model_name):
    data_buffer = io.BytesIO()
    joblib.dump((X, y), data_buffer)
    data_buffer.seek(0)
    data_bin = Binary(data_buffer.read())

    data_document = {
        "user": user,
        "model_name": data_model_name,
        "data_type": "training_data",
        "data": data_bin,
        "date_created": datetime.utcnow(),
        "dataset_id": str(datetime.utcnow().timestamp())  # Unique identifier for each dataset
    }

    try:
        collection_data.insert_one(data_document)
        print(f"New training data for model '{data_model_name}' for user '{user}' saved to MongoDB.")
    except pymongo.errors.WriteError as e:
        print(f"Failed to save data_document due to validation error: {e.details}")
        raise

def load_all_existing_data(user, data_model_name):
    cursor = collection_data.find(
        {"user": user, "model_name": data_model_name, "data_type": "training_data"}
    )
    
    X_combined, y_combined = None, None

    for data_document in cursor:
        data_buffer = io.BytesIO(data_document["data"])
        X, y = joblib.load(data_buffer)
        if X_combined is None and y_combined is None:
            X_combined, y_combined = X, y
        else:
            X_combined = pd.concat([X_combined, X], ignore_index=True)
            y_combined = np.concatenate([y_combined, y])

    if X_combined is not None and y_combined is not None:
        print(f"Loaded all existing datasets for model '{data_model_name}' for user '{user}' from MongoDB.")
    else:
        print(f"No existing data found for model '{data_model_name}' for user '{user}'.")
        
    return X_combined, y_combined

def label_positions(x_pos, annotations):
    for exon in annotations:
        if exon['xi'] <= x_pos <= exon['xf']:
            return 1  # Exon present
    return 0

def scale_value(x, original_min=0, original_max=1, new_min=0, new_max=2.0):
    scaled_value = (x - original_min) / (original_max - original_min) * (new_max - new_min) + new_min
    return scaled_value

def extract_features(polygon_points, key, reference_polygon):
    features = []
    labels = []

    if not polygon_points:
        raise ValueError("The polygon_points list is empty. Cannot extract features.")

    for pt in polygon_points:
        y_val = scale_value(float(pt['y'])) * 100
        combined_features = [y_val]
        features.append(combined_features)
        x_pos = pt['x']
        label = label_positions(x_pos, reference_polygon)
        labels.append(label)

    feature_columns = [key]
    df_features = pd.DataFrame(features, columns=feature_columns)
    df_features['label'] = labels
    return df_features

def sanitize_name(name):
    pattern = r'[.$\[\]/]'
    sanitized_name = re.sub(pattern, '_', name)
    return sanitized_name

def save_model_to_mongo(model, user, model_name, feature_names, description="---", path="no path", version=1):
    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_buffer.seek(0)
    model_bin = Binary(model_buffer.read())

    model_size_bytes = model_buffer.tell()
    model_size_kb = model_size_bytes / 1024
    model_size_mb = model_size_kb / 1024
    print(f"Size of the model binary: {model_size_bytes} bytes ({model_size_kb:.2f} KB, {model_size_mb:.2f} MB)")

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
        "data_type": "polygons"
    }

    try:
        result = collection_models.replace_one(
            {"user": user, "name": model_name},
            model_document,
            upsert=True
        )
        print(f"Model '{model_name}' for user '{user}' saved to MongoDB. Matched count: {result.matched_count}, Modified count: {result.modified_count}")
    except pymongo.errors.WriteError as e:
        print(f"Failed to save model_document due to validation error: {e.details}")
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")

def load_model_from_mongo(user, model_name):
    model_data = collection_models.find_one({"user": user, "name": model_name})
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

if polygons is None or len(polygons) == 0:
    works.resolve({
        'msg': 'nothing to train'
    })
else:
    clf, saved_feature_names = load_model_from_mongo(user, model_set_name)
    
    df_features = pd.DataFrame()
    sanitized_feature_columns = [sanitize_name(col) for col in polygons.keys()]

    for polygon_type in polygons:
        sanitized_polygon_type = sanitize_name(polygon_type)
        dff = extract_features(polygons[polygon_type], sanitized_polygon_type, reference_polygon)
        df_features = pd.concat([df_features, dff], ignore_index=True)
    
    df_features.columns = [sanitize_name(col) for col in df_features.columns]

    X_new = df_features[sanitized_feature_columns]
    y_new = df_features.get('label')

    X_existing, y_existing = load_all_existing_data(user, data_model_name)

    if clf:
        print("Model loaded from MongoDB.")
        
        updated_features = update_feature_set(saved_feature_names, sanitized_feature_columns)
        X_new = ensure_feature_order(X_new, updated_features)

        if X_existing is not None and y_existing is not None:
            X = pd.concat([X_existing, X_new], ignore_index=True)
            y = np.concatenate([y_existing, y_new])
        else:
            print("No existing data found, proceeding with new data only.")
            X, y = X_new, y_new
    else:
        updated_features = sanitized_feature_columns
        clf = RandomForestClassifier(n_estimators=100, random_state=402)
        print("Training new model.")
        X, y = X_new, y_new

    clf.fit(X, y)

    save_model_to_mongo(clf, user, model_set_name, updated_features)

    save_data(X_new, y_new, user, data_model_name)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=400)
    X_test = ensure_feature_order(X_test, updated_features)

    y_pred = clf.predict(X_test)
    report_dict = classification_report(y_test, y_pred, output_dict=True)
    report_dict['features'] = updated_features

    # Generate learning curve data
    train_sizes, train_scores, test_scores = learning_curve(
        clf, X, y, train_sizes=np.linspace(0.1, 1.0, 5), cv=5, scoring='accuracy', n_jobs=-1
    )

    train_scores_mean = np.mean(train_scores, axis=1)
    test_scores_mean = np.mean(test_scores, axis=1)

    # Prepare learning curve data to be returned as JSON
    learning_curve_data = {
        "train_sizes": train_sizes.tolist(),
        "train_scores_mean": train_scores_mean.tolist(),
        "test_scores_mean": test_scores_mean.tolist()
    }

    # Append learning curve data to the report dictionary
    report_dict['learning_curve'] = learning_curve_data

    # Return the report and learning
    works.resolve(report_dict)

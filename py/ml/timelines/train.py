import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import LabelEncoder
from joblib import dump

# === Load orientation labels ===
labels_df = pd.read_csv("table_orientations.csv")

def extract_features_from_table(file_path):
    try:
        df = pd.read_csv(file_path, sep='\t', index_col=0)

        # Basic shape info
        n_rows, n_cols = df.shape

        # How many column names look like years?
        col_years = sum(str(c).isdigit() and 1900 <= int(c) <= 2100 for c in df.columns)

        # How many index values look like years?
        idx_years = sum(str(i).isdigit() and 1900 <= int(i) <= 2100 for i in df.index)

        # Count of numeric cells
        numeric_cells = df.applymap(lambda x: isinstance(x, (int, float))).values.sum()

        # Percentage of numeric values
        percent_numeric = numeric_cells / (n_rows * n_cols) if n_rows * n_cols else 0

        return {
            "n_rows": n_rows,
            "n_cols": n_cols,
            "col_years": col_years,
            "idx_years": idx_years,
            "percent_numeric": percent_numeric
        }

    except Exception as e:
        print(f"⚠️ Skipping {file_path}: {e}")
        return None

# === Build dataset ===
feature_rows = []
target_labels = []

for _, row in labels_df.iterrows():
    features = extract_features_from_table(row["filename"])
    if features:
        feature_rows.append(features)
        target_labels.append(row["orientation"])

X = pd.DataFrame(feature_rows)
y = pd.Series(target_labels)

# === Encode labels ===
le = LabelEncoder()
y_encoded = le.fit_transform(y)

# === Train/test split ===
X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.2, random_state=42)

# === Train model ===
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)

# === Evaluate ===
y_pred = clf.predict(X_test)
print("\n=== Classification Report ===")
print(classification_report(y_test, y_pred, target_names=le.classes_))

# === Save model and label encoder ===
os.makedirs("model", exist_ok=True)
dump(clf, "model/orientation_model.joblib")
dump(le, "model/label_encoder.joblib")

print("✅ Model saved to 'model/orientation_model.joblib'")
print("✅ Label encoder saved to 'model/label_encoder.joblib'")

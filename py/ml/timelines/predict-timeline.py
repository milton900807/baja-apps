import joblib
import pandas as pd
import os
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from sklearn.preprocessing import LabelEncoder


clf = joblib.load("orientation_model.pkl")
le = joblib.load("label_encoder.pkl")

# === Feature Extraction ===
def extract_features(df):
    features = {}
    # Size features
    features["n_rows"] = df.shape[0]
    features["n_cols"] = df.shape[1]
    
    # Numeric ratio
    try:
        numeric_ratio = df.applymap(lambda x: isinstance(x, (int, float))).mean().mean()
    except:
        numeric_ratio = 0.0
    features["numeric_ratio"] = numeric_ratio

    # Header year fraction
    header_year_frac = np.mean([str(c).isdigit() and 1900 <= int(c) <= 2100 for c in df.columns])
    index_year_frac = np.mean([str(i).isdigit() and 1900 <= int(i) <= 2100 for i in df.index])
    features["header_year_frac"] = header_year_frac
    features["index_year_frac"] = index_year_frac

    return features

df = pd.read_csv("some_table.tsv", sep='\t', index_col=0)
features = extract_features(df)
X = [list(features.values())]
prediction = clf.predict(X)
orientation = le.inverse_transform(prediction)[0]
print(f"Predicted orientation: {orientation}")

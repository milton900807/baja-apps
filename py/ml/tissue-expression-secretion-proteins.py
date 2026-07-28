import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
import matplotlib.pyplot as plt
import seaborn as sns

# Load the merged dataset
merged_file = "merged_data.csv"
merged_df = pd.read_csv(merged_file)


# Drop the 'symbol' column if it exists
if "symbol" in merged_df.columns:
    merged_df.drop(columns=["symbol"], inplace=True)
# Convert numerical columns to more memory-efficient types
for col in merged_df.select_dtypes(include=["float64"]).columns:
    merged_df[col] = pd.to_numeric(merged_df[col], downcast="float")

for col in merged_df.select_dtypes(include=["int64"]).columns:
    merged_df[col] = pd.to_numeric(merged_df[col], downcast="integer")

# Debugging: Print available columns
print("Columns in merged dataset:", merged_df.columns.tolist())

# Identify expression columns (assuming first few columns are metadata)
expression_cols = merged_df.columns[6:]  # Adjust index if needed

# Normalize expression values
scaler = StandardScaler()
merged_df[expression_cols] = scaler.fit_transform(merged_df[expression_cols])

# Encode disease labels
label_encoder = LabelEncoder()
merged_df["Disease_Label"] = label_encoder.fit_transform(merged_df["Disease"])

# Split dataset for ML training
X = merged_df[expression_cols]
y = merged_df["Disease_Label"]

print ( ' training ')

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a Random Forest model
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(X_train, y_train)

# Feature Importance Analysis
feature_importance = pd.Series(clf.feature_importances_, index=expression_cols).sort_values(ascending=False)

# Plot feature importance (Top 20)
plt.figure(figsize=(12, 6))
sns.barplot(x=feature_importance[:20].index, y=feature_importance[:20].values)
plt.xticks(rotation=90)
plt.title("Top 20 Tissue Features Contributing to Disease Upregulation")
plt.xlabel("Tissue")
plt.ylabel("Feature Importance Score")
plt.show()

# Predict on test data
y_pred = clf.predict(X_test)

# Convert predicted labels back to disease names
predicted_diseases = label_encoder.inverse_transform(y_pred)

# Save predictions
results_df = X_test.copy()
results_df["Predicted Disease"] = predicted_diseases
results_df["Actual Disease"] = label_encoder.inverse_transform(y_test)
results_df.to_csv("predicted_disease_upregulation.csv", index=False)

print("Predictions saved as 'predicted_disease_upregulation.csv'.")

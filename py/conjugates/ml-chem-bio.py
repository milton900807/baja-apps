import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.feature_selection import SelectFromModel

# Load your dataset
df = pd.read_csv('bt-proteins2.csv')

# Assuming 'df' is your DataFrame
# Convert 'Kd' to numeric, coercing errors to NaN (which marks unconvertible values)
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')

# Remove rows where 'Kd' is NaN (which were unconvertible values)
df = df.dropna(subset=['Kd'])

# Preprocessing
X = df.drop(['SMILES', 'protein_sequence', 'Kd'], axis=1)
y = df['Kd']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Feature Selection
selector = SelectFromModel(estimator=XGBRegressor()).fit(X_train_scaled, y_train)
X_train_selected = selector.transform(X_train_scaled)
X_test_selected = selector.transform(X_test_scaled)

# Model Training
model = XGBRegressor()
model.fit(X_train_selected, y_train)

# Predictions and Evaluation
y_pred = model.predict(X_test_selected)
rmse = mean_squared_error(y_test, y_pred, squared=False)
r2 = r2_score(y_test, y_pred)

print(f"RMSE: {rmse}")
print(f"R² score: {r2}")



import numpy as np

# Continue from the previous code...

# Feature Importance
feature_importances = model.feature_importances_
selected_features = X.columns[selector.get_support()]
important_features_sorted = sorted(zip(selected_features, feature_importances), key=lambda x: x[1], reverse=True)

# Write Report to a File
with open('./protein-structure/xgregressor.report.txt', 'w') as f:
        f.write("Model Performance Report\n")
        f.write("=======================\n\n")
        f.write(f"RMSE: {rmse}\n")
        f.write(f"R² score: {r2}\n\n")
        f.write("Feature Importance (Top features):\n")
        for feature, importance in important_features_sorted[:10]:  # Top 10 features
            f.write(f"{feature}: {importance}\n")
print("Report saved to /mnt/data/model_performance_report.txt")


import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, confusion_matrix

# Assuming df is your DataFrame and Kd values have been converted to numeric

# Create a binary target variable for low Kd
df['Low_Kd'] = (df['Kd'] < 1).astype(int)

# List of functional group columns
functional_groups = ['hydroxyl', 'carboxyl', 'amino', 'aldehyde', 'ketone', 'ester', 'amide', 
                     'ether', 'nitrile', 'sulfone', 'sulfoxide', 'thiol', 'halide', 'phenyl', 
                     'benzyl', 'alkene', 'alkyne', 'aromatic_nitrogen', 'hydrazone', 'imine', 
                     'alkyl_halide', 'aromatic', 'alcohol', 'epoxide', 'alkane']

X = df[functional_groups]
y = df['Low_Kd']

# Split the dataset into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Normalize the feature data
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Train a Random Forest Classifier
clf = RandomForestClassifier(random_state=42)
clf.fit(X_train_scaled, y_train)

# Evaluate the model
y_pred = clf.predict(X_test_scaled)
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy}")
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# Get feature importance
feature_importances = pd.DataFrame(clf.feature_importances_,
                                   index = functional_groups,
                                   columns=['importance']).sort_values('importance', ascending=False)

# Output the feature importance
print("Feature Importances:")
print(feature_importances)

# Save the feature importances to a file
feature_importances.to_csv('/mnt/data/functional_groups_importance.csv')

# Inform the user of the report's location
print("Feature importance report saved to './protein-structure/functional_groups_importance.csv'")



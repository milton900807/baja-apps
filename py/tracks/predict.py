import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from ion import works

polygon_data = works.param( 1 )
annotations = works.param ( 2 )
new_polygon = works.param ( 3 )

# new_polygon = [(5, 0.5), (6, 0.6), (7, 0.4)]  # New polygon data

# polygon_data = [
#     [(1, 0.5), (2, 0.6), (3, 0.4)],  # Example polygon 1
#     [(2, 0.7), (3, 0.8), (4, 0.6)],  # Example polygon 2
# ]
# annotations = [
#     (1, 3),  # Annotation for polygon 1
#     (2, 4),  # Annotation for polygon 2
# ]



def extract_features(polygon):
    xs = np.array([point[0] for point in polygon])
    ys = np.array([point[1] for point in polygon])
    features = [
        np.mean(xs), np.std(xs), np.min(xs), np.max(xs),  # Statistical features for x
        np.mean(ys), np.std(ys), np.min(ys), np.max(ys),  # Statistical features for y
        np.sum(np.sqrt(np.diff(xs)**2 + np.diff(ys)**2)),  # Perimeter as a feature
        np.abs(np.trapz(ys, xs))  # Area as a feature
    ]
    return features

X = np.array([extract_features(polygon) for polygon in polygon_data])
y = np.array([1 if (ann[0] <= np.mean([pt[0] for pt in polygon]) <= ann[1]) else 0 for polygon, ann in zip(polygon_data, annotations)])

# Step 2: Model Training
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Step 3: Prediction and Evaluation
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

print(f"Model Accuracy: {accuracy:.2f}")

# Predicting on new data
new_features = extract_features(new_polygon)
predicted_annotation = model.predict([new_features])

print(f"Predicted Annotation: {predicted_annotation[0]}")

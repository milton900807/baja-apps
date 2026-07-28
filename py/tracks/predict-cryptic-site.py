import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import pymongo
from bson.objectid import ObjectId


uri = "mongodb://localhost:27017/"
client = pymongo.MongoClient(uri)


training_set_data_layer = {
    name:'name',
    polygon : [
        (x,y),(x,y),(x,y) 
    ]
}

training_set_annotation_layer = {
    name:'name',
    interval : [
        (xi,xf),(xi,yf),(xi,yf) 
    ]    
}

training_set_data_layers = [ ]
training_set_annotation_layers = [ ]



polygon_data = [
    [(1, 0.5), (2, 0.6), (3, 0.4)],  # Example polygon 1
    [(2, 0.7), (3, 0.8), (4, 0.6)],  # Example polygon 2
    # More polygons...
]
annotations = [
    (1, 3),  # Annotation for polygon 1
    (2, 4),  # Annotation for polygon 2
    # More annotations...
]
named_annotations = [
    ('geneA', 1, 3),  # Named annotation 1
    ('geneB', 2, 5),  # Named annotation 2
    # More named annotations...
]
db = client["genomicDB"]

# Select the collection
training_set_collection = db["trainingsets"]


training_set = training_set_collection.find_one({"_id": ObjectId(training_set_id)})
if training_set:
    print("TrainingSet found:")
    print(training_set)
else:
    print("TrainingSet not found")




# Step 1: Feature Engineering
def extract_features(polygon, named_ann):
    xs = np.array([point[0] for point in polygon])
    ys = np.array([point[1] for point in polygon])
    features = [
        np.mean(xs), np.std(xs), np.min(xs), np.max(xs),  # Statistical features for x
        np.mean(ys), np.std(ys), np.min(ys), np.max(ys),  # Statistical features for y
        np.sum(np.sqrt(np.diff(xs)**2 + np.diff(ys)**2)),  # Perimeter as a feature
        np.abs(np.trapz(ys, xs))  # Area as a feature
    ]
    
    # Add features from named annotations
    for ann in named_ann:
        ann_name, xi, xf = ann
        overlap = max(0, min(np.max(xs), xf) - max(np.min(xs), xi))
        features.append(overlap)
        features.append(xf - xi)  # Length of the annotation interval
    
    return features

# Create feature matrix and label vector
X = np.array([extract_features(polygon, named_annotations) for polygon in polygon_data])
y = np.array([1 if (ann[0] <= np.mean([pt[0] for pt in polygon]) <= ann[1]) else 0 for polygon, ann in zip(polygon_data, annotations)])

# Step 2: Model Training
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
# print(f"Model Accuracy: {accuracy:.2f}")



# Predicting on new data
# new_polygon = [(5, 0.5), (6, 0.6), (7, 0.4)]  # New polygon data
# new_features = extract_features(new_polygon, named_annotations)
# predicted_annotation = model.predict([new_features])

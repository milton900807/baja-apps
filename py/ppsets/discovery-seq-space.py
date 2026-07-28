import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.preprocessing import LabelEncoder

# Load the Excel file
file_path = './ppsets2.xlsx'
df = pd.read_excel(file_path)

# Filter Ct values between 16 and 40
df = df[(df['ct'] > 16) & (df['ct'] < 40)]

# Combine sequences into a single column for simplicity
df['combined_sequence'] = df['forward_sequence'] + df['probe_sequence'] + df['reverse_sequence']

# Transform Ct values into a binary classification (low/high based on median)
median_ct = df['ct'].median()
df['ct_class'] = (df['ct'] < median_ct).astype(int)

# Feature extraction with k-mer counting (example with tri-nucleotide, k=3)
vectorizer = CountVectorizer(analyzer='char', ngram_range=(2, 2))
X = vectorizer.fit_transform(df['combined_sequence'])
y = df['ct_class']

# Split the data into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a Random Forest Classifier
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Get feature importance
importances = model.feature_importances_
feature_names = vectorizer.get_feature_names_out()

# Sort features by importance
important_features = sorted(zip(importances, feature_names), reverse=True)[:20]  # Top 20 features

# Output important features
for importance, feature in important_features:
    print(f"Feature: {feature}, Importance: {importance}")

# Optionally: Assess model performance
# from sklearn.metrics import accuracy_score
# y_pred = model.predict(X_test)
# print("Accuracy:", accuracy_score(y_test, y_pred))

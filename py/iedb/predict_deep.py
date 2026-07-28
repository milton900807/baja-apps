import pandas as pd
import numpy as np
import joblib
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout
from tensorflow.keras.optimizers import Adam
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler

# Define valid amino acids
AMINO_ACIDS = set("ACDEFGHIKLMNPQRSTVWY")

# Feature dictionaries
def get_hydrophobicity():
    return {
        'A': 1.8, 'C': 2.5, 'D': -3.5, 'E': -3.5, 'F': 2.8, 'G': -0.4, 'H': -3.2, 'I': 4.5,
        'K': -3.9, 'L': 3.8, 'M': 1.9, 'N': -3.5, 'P': -1.6, 'Q': -3.5, 'R': -4.5, 'S': -0.8,
        'T': -0.7, 'V': 4.2, 'W': -0.9, 'Y': -1.3
    }

def get_polarity():
    return {
        'A': 8.1, 'C': 5.5, 'D': 13.0, 'E': 12.3, 'F': 5.2, 'G': 9.0, 'H': 10.4, 'I': 5.2,
        'K': 11.3, 'L': 4.9, 'M': 5.7, 'N': 11.6, 'P': 8.0, 'Q': 10.5, 'R': 10.5, 'S': 9.2,
        'T': 8.6, 'V': 5.9, 'W': 5.4, 'Y': 6.2
    }

def get_molecular_weight():
    return {
        'A': 89.1, 'C': 121.2, 'D': 133.1, 'E': 147.1, 'F': 165.2, 'G': 75.1, 'H': 155.2, 'I': 131.2,
        'K': 146.2, 'L': 131.2, 'M': 149.2, 'N': 132.1, 'P': 115.1, 'Q': 146.2, 'R': 174.2, 'S': 105.1,
        'T': 119.1, 'V': 117.1, 'W': 204.2, 'Y': 181.2
    }
    
def get_functional_groups():
    return {
        'A': [0, 1, 0, 0], 'C': [0, 1, 1, 0], 'D': [1, 0, 0, 0], 'E': [1, 0, 0, 0], 'F': [0, 0, 1, 0],
        'G': [0, 1, 0, 0], 'H': [0, 0, 1, 1], 'I': [0, 1, 0, 0], 'K': [1, 0, 0, 0], 'L': [0, 1, 0, 0],
        'M': [0, 1, 1, 0], 'N': [1, 0, 0, 0], 'P': [0, 1, 0, 0], 'Q': [1, 0, 0, 0], 'R': [1, 0, 0, 1],
        'S': [0, 1, 0, 0], 'T': [0, 1, 0, 0], 'V': [0, 1, 0, 0], 'W': [0, 0, 1, 0], 'Y': [0, 0, 1, 0]
    }

def is_valid_peptide(peptide):
    return isinstance(peptide, str) and all(aa in AMINO_ACIDS for aa in peptide)

def extract_valid_peptides(file_path):
    df = pd.read_excel(file_path)
    peptide_column = df.iloc[:, 2].dropna().apply(str).apply(lambda x: x.strip())
    return peptide_column[peptide_column.apply(is_valid_peptide)].tolist()

def compute_charge_features(peptides):
    hydrophobicity = get_hydrophobicity()
    polarity = get_polarity()
    molecular_weight = get_molecular_weight()
    functional_groups = get_functional_groups()
    
    feature_vectors = []
    for peptide in peptides:
        hydro_values = [hydrophobicity.get(aa, 0) for aa in peptide]
        polar_values = [polarity.get(aa, 0) for aa in peptide]
        mw_values = [molecular_weight.get(aa, 0) for aa in peptide]
        func_values = np.sum([functional_groups.get(aa, [0, 0, 0, 0]) for aa in peptide], axis=0)
        
        features = [
            np.mean(hydro_values), np.std(hydro_values),
            np.mean(polar_values), np.std(polar_values),
            np.mean(mw_values), np.std(mw_values),
            len(peptide)
        ] + list(func_values)
        feature_vectors.append(features)
    
    return np.array(feature_vectors)

def generate_negative_samples(peptides, num_samples=3000000):
    np.random.shuffle(peptides)
    return ["".join(np.random.choice(list(AMINO_ACIDS), len(p))) for p in peptides[:num_samples]]

def generate_labels(positive_samples, negative_samples):
    return np.concatenate([np.ones(len(positive_samples)), np.zeros(len(negative_samples))])

def balance_classes(X, y):
    smote = SMOTE(sampling_strategy=0.5)
    rus = RandomUnderSampler(sampling_strategy=0.75)
    X_resampled, y_resampled = smote.fit_resample(X, y)
    return rus.fit_resample(X_resampled, y_resampled)

def build_deep_learning_model(input_shape):
    model = Sequential([
        Dense(128, activation='relu', input_shape=(input_shape,)),
        Dropout(0.3),
        Dense(64, activation='relu'),
        Dropout(0.3),
        Dense(32, activation='relu'),
        Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer=Adam(learning_rate=0.001), loss='binary_crossentropy', metrics=['accuracy'])
    return model

def train_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = build_deep_learning_model(X.shape[1])
    model.fit(X_train, y_train, epochs=10, batch_size=32, validation_data=(X_test, y_test))
    y_pred = (model.predict(X_test) > 0.5).astype("int32")
    print("Accuracy:", accuracy_score(y_test, y_pred))
    print(classification_report(y_test, y_pred))
    model.save("epitope_model.h5")
    return model

def predict_epitope_scores(file_path, model_path):
    peptides = extract_valid_peptides(file_path)
    model = tf.keras.models.load_model(model_path)
    X = compute_charge_features(peptides)
    scores = model.predict(X).flatten()
    results = pd.DataFrame({'Peptide': peptides, 'Epitope Score': scores})
    results.to_csv("epitope_scores.csv", index=False)
    print("Predictions saved to epitope_scores.csv")
    return results

# Example usage
file_path = "../../epitope_full_v3.xlsx"
positive_peptides = extract_valid_peptides(file_path)
negative_peptides = generate_negative_samples(positive_peptides)
all_peptides = positive_peptides + negative_peptides
X = compute_charge_features(all_peptides)
y = generate_labels(positive_peptides, negative_peptides)
model = train_model(X, y)
predict_epitope_scores("../../epitope_full_v3.xlsx", "epitope_model.h5")
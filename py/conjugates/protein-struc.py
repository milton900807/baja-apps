import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, confusion_matrix

# Assuming df is your DataFrame and Kd values have been converted to numeric

df = pd.read_csv('bt-proteins2.csv')
# Assuming 'df' is your DataFrame and it already includes amino acid composition
# Convert 'Kd' to numeric, removing non-numeric rows as previously discussed
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])

# Create a binary target variable for low Kd
df['Low_Kd'] = (df['Kd'] < 1).astype(int)

# List of functional group columns
functional_groups = ['hydroxyl', 'carboxyl', 'amino', 'aldehyde', 'ketone', 'ester', 'amide', 
                             'ether', 'nitrile', 'sulfone', 'sulfoxide', 'thiol', 'halide', 'phenyl', 
                                                  'benzyl', 'alkene', 'alkyne', 'aromatic_nitrogen', 'hydrazone', 'imine', 
                                                                       'alkyl_halide', 'aromatic', 'alcohol', 'epoxide', 'alkane']


def predict_structure_and_calculate_ratios(peptide_sequence):
    # Definitions based on simplified propensities
    helix_prone = 'ALMQKRH'
    strand_prone = 'VIYFWT'
    
    # Counters for helix and strand residues
    helix_count = 0
    strand_count = 0
    
    # Predict secondary structure and count
    for amino_acid in peptide_sequence:
        if amino_acid in helix_prone:
            helix_count += 1
        elif amino_acid in strand_prone:
            strand_count += 1
    
    # Calculate the ratio (H:E)
    if strand_count == 0:  # Prevent division by zero
        helix_strand_ratio = "Undefined"  # Strand count is zero, cannot divide
    else:
        helix_strand_ratio = helix_count / strand_count
    
    # Normalize the ratio by the length of the protein sequence
    normalized_ratio = helix_strand_ratio / len(peptide_sequence)
    
    return normalized_ratio



# Concatenate the original DataFrame with the pattern counts
# Ensure Kd is numeric and create a binary classification target based on Kd values
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)

df['Kd_category'] = (df['Kd'] < 1).astype(int) - (df['Kd'] > 10).astype(int)
df=df[df['Kd_category'] != 0]
chemical_features = [
    "hydroxyl", "carboxyl", "amino", "aldehyde",
    "ketone", "ester", "amide", "ether", "nitrile", "sulfone", "sulfoxide",
    "thiol", "halide", "phenyl", "benzyl", "alkene", "alkyne", "aromatic_nitrogen",
    "hydrazone", "imine", "alkyl_halide", "aromatic", "alcohol", "epoxide",
    "alkane", "logP"
]

method_names = [
    "count_zinc_fingers",
    "count_helix_loop_helix",
   # "count_SH3_domains",
   # "count_leucine_zipper",
   # "count_serine_threonine_kinase_domains",
   # "count_PH_domains",
   
   #"count_WW_domains",
   # "count_EF_hand_domains",
   # "find_cam_binding_domains"
]
amino_acid_names = [
    'Alanine',
    'Arginine',
    'Asparagine',
    'Aspartic acid',
    'Cysteine',
    'Glutamic acid',
    'Glutamine',
    'Glycine',
    'Histidine',
    'Isoleucine',
    'Leucine',
    'Lysine',
    'Methionine',
    'Phenylalanine',
    'Proline',
    'Serine',
    'Threonine',
    'Tryptophan',
    'Tyrosine',
    'Valine'
]

protein_domains = method_names + chemical_features + amino_acid_names



X = df[protein_domains]
y = df['Low_Kd']

# Split the dataset into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Normalize the feature data
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
clf = RandomForestClassifier(n_estimators=10000, random_state=42)
# Train a Random Forest Classifier
#clf = RandomForestClassifier(random_state=42)
clf.fit(X_train_scaled, y_train)

# Evaluate the model
y_pred = clf.predict(X_test_scaled)
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy}")
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# Get feature importance
feature_importances = pd.DataFrame(clf.feature_importances_,
                                           index =protein_domains,
                                                                              columns=['importance']).sort_values('importance', ascending=False)

# Output the feature importance
print("Feature Importances:")
print(feature_importances)

# Save the feature importances to a file
feature_importances.to_csv('./protein-structure/protein_struct_groups_importance.csv')

# Inform the user of the report's location
print("Feature importance report saved to '/mnt/data/functional_groups_importance.csv'")


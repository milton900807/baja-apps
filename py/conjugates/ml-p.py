import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from pathlib import Path

def extract_features(sequence):
#    print ( sequence )
    """Extract descriptive features from a protein sequence using ProteinAnalysis."""
    analysis = ProteinAnalysis(sequence)
    features = {
        'molecular_weight': analysis.molecular_weight(),
        'aromaticity': analysis.aromaticity(),
        'instability_index': analysis.instability_index(),
        'isoelectric_point': analysis.isoelectric_point(),
    }
    
    # Adding secondary structure fractions
    helix, turn, sheet = analysis.secondary_structure_fraction()
    features.update({
        'secondary_structure_helix': helix,
        'secondary_structure_turn': turn,
        'secondary_structure_sheet': sheet,
    })
    
    # Adding amino acid percentages
    aa_percent = analysis.get_amino_acids_percent()
    aa_percent = {f'aa_percent_{aa}': percent for aa, percent in aa_percent.items()}
    features.update(aa_percent)
    
    return features
def Kd_less_than_1(df):
    """Preprocess the data to extract features and encode the target variable.
    If feature extraction fails for a sequence, that sequence is excluded from the dataset.
    """
    # Initialize an empty list to store the feature dictionaries
    features_list = []

    for index, row in df.iterrows():
        try:
            # Attempt to extract features for the given protein sequence
            features = extract_features(row['protein_sequence'])
            features['Kd_less_than_1'] = (row['Kd'] < 0.51)#.astype(int)
            features_list.append(features)
        except Exception as e:
            # If an error occurs, print the error and continue to the next row
            print(f"Error processing sequence at index {index}: {e}")
            continue

    # Convert the list of feature dictionaries into a DataFrame
    features_df = pd.DataFrame(features_list)

    return features_df


def get_isoelectric_point(sequence):
    try:
        analysis = ProteinAnalysis(sequence)
        return analysis.isoelectric_point()
    except Exception as e:
        print(f"Error processing sequence: {e}")
        return np.nan


def remove_outliers_for_large_groups(df, group_column='protein_sequence', target_column='Kd', min_group_size=5):
    """
    Removes potential outliers from a DataFrame within each group defined by 'group_column',
    based on the 'target_column' values using the Interquartile Range (IQR) method, but only
    for groups with a number of observations greater than 'min_group_size'.
    
    Args:
    df (pd.DataFrame): The input DataFrame.
    group_column (str): The name of the column to group by.
    target_column (str): The name of the column to analyze for outliers.
    min_group_size (int): The minimum number of observations a group must have to consider
                          outlier removal.
    
    Returns:
    pd.DataFrame: A new DataFrame with potential outliers removed from groups meeting
                  the size criterion.
    """
    # Function to identify outliers within a group
    def identify_outliers(group):
        if len(group) >= min_group_size:
            q1 = group.quantile(0.25)
            q3 = group.quantile(0.75)
            iqr = q3 - q1
            return (group < (q1 - 2 * iqr)) | (group > (q3 + 2 * iqr))
        else:
            # If the group size is smaller than min_group_size, do not identify any outliers
            return pd.Series([False] * len(group), index=group.index)
    
    # Apply the outlier identification function within each group and get a boolean mask
    outlier_mask = df.groupby(group_column)[target_column].transform(identify_outliers)
    
    # Filter the DataFrame to exclude outliers
    filtered_df = df[~outlier_mask]
    
    return filtered_df

def train_model(X, y):
    """Train a RandomForest classifier and return the model and the scaler."""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    model = RandomForestClassifier(random_state=42)
    model.fit(X_train_scaled, y_train)
    predictions = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, predictions)
    print(f'Model accuracy: {accuracy}')
    return model, scaler

def write_report(model, filepath):
    """Write a report of features associated with lower Kd values to a file."""
    feature_importances = model.feature_importances_
    features = X.columns
    important_features = sorted(zip(feature_importances, features), reverse=True)
    with open(filepath, 'w') as file:
        file.write("Features associated with lower Kd values:\n")
        for importance, feature_name in important_features:
            file.write(f"{feature_name}: {importance}\n")



def preprocess_data(df):
    """Filter for Kd < 4 and add a column for the isoelectric points of the sequences."""
    df_filtered = df[df['Kd'] < 4]
    df_filtered['isoelectric_point'] = df_filtered['protein_sequence'].apply(get_isoelectric_point)
    return df_filtered.dropna(subset=['isoelectric_point'])

df = pd.read_csv('./bt-proteins.csv')  # Make sure you have your actual dataset path here
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)
df = remove_outliers_for_large_groups ( df )
feature_df = preprocess_data(df)
print("Column names:", df.columns.tolist())


# X = feature_df.drop([''], axis=1)
# y = feature_df['Kd_less_than_1']
# model, scaler = train_model(X, y)
# report_path = 'kd_feature_importance_report.txt'
# write_report(model, report_path)
# print(f'Report written to {report_path}')



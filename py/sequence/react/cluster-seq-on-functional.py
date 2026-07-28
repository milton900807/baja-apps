
from sklearn.metrics import accuracy_score
from sklearn.utils import shuffle
import numpy as np
import tensorflow as tf
from rdkit import Chem
from rdkit.Chem import AllChem
import random
import pandas as pd
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv1D, GlobalMaxPooling1D, Dense
from sklearn.model_selection import train_test_split
from tensorflow.keras.layers import Input, Conv1D, MaxPooling1D, Flatten, Dense
import numpy as np
from tensorflow.keras.models import Model
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier


def get_smiles_features(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return [Descriptors.MolLogP(mol), Descriptors.MolWt(mol), Chem.RDKFingerprint(mol)]

amino_acids = ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V']
df = pd.read_csv('../../conjugates/bt-proteins2.csv')
pd.set_option('display.max_rows', 10)  # None means unlimited
pd.set_option('display.max_columns', None)  # Adjust as per your DataFrame's width
pd.set_option('display.width', 1000)  # Adjust the width for better readability
pd.set_option('display.max_colwidth', None)  # None means unlimited column width

df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])
df = df[df['Kd'].apply(lambda x: isinstance(x, float) and not pd.isnull(x))]

df = df.groupby('protein_sequence')['Kd'].agg(['mean', 'std']).reset_index()

pdata = create_low_kd_group (df, 'protein_sequence')
hdata  = create_high_kd_group (df, 'protein_sequence')


print(' Unique low>  ', len(pdata) == len(set(pdata)))
print ( " Low count ", len(pdata))
print(' Unique high>  ', len(hdata) == len(set(hdata)))
print ( " High count " , len(hdata))


plabels = np.zeros(len(pdata))
hlabels = np.ones(len(hdata))

max_length = max(max(len(seq) for seq in pdata), max(len(seq) for seq in hdata))


scaler = StandardScaler()
sequence_features_scaled = scaler.fit_transform(df['sequence_features'].tolist())
kmeans = KMeans(n_clusters=5, random_state=0).fit(sequence_features_scaled)
df['cluster'] = kmeans.labels_
for cluster in df['cluster'].unique():
    cluster_data = df[df['cluster'] == cluster]
    smiles_features = pd.DataFrame(cluster_data['smiles_features'].tolist(), columns=['LogP', 'MolWt', 'Fingerprint'])
    # Simplified example: Predicting cluster membership based on SMILES features
    # In real application, this might be replaced with more meaningful analysis
    X = smiles_features[['LogP', 'MolWt']]  # Example features
    y = cluster_data['cluster']
    
    model = RandomForestClassifier()
    model.fit(X, y)
    feature_importances = pd.Series(model.feature_importances_, index=X.columns)
    print(f"Cluster {cluster} important features:")
    print(feature_importances.sort_values(ascending=False))

# Note: For actual feature importance, consider using the entire dataset or more sophisticated methods.

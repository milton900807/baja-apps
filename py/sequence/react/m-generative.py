
from sklearn.metrics import accuracy_score
from sklearn.utils import shuffle
import numpy as np
import tensorflow as tf
from rdkit import Chem
from rdkit.Chem import AllChem
from tensorflow.keras.callbacks import EarlyStopping
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.utils import to_categorical
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
from Bio import SeqIO

# from tensorflow.keras.mixed_precision import experimental as mixed_precision
# policy = mixed_precision.Policy('mixed_float16')
# mixed_precision.set_policy(policy)

def one_hot_encode(seq, max_length):
    """Converts a protein sequence to a one-hot encoded 2D array with padding.
    Parameters:
    - seq (str): A protein sequence.
    - max_length (int): The length to which the sequence should be padded.
    Returns:
    - 2D NumPy array of shape (max_length, 20) representing the one-hot encoded sequence.
    """
    amino_acids = 'ACDEFGHIKLMNPQRSTVWY'
    aa_index = {aa: i for i, aa in enumerate(amino_acids)}
    
    # Initialize the encoded array with padding
    encoded = np.zeros((max_length, len(amino_acids)))
    
    # One-hot encode each amino acid in the sequence
    for i, aa in enumerate(seq[:max_length]):  # Trim sequences longer than max_length
        if aa in aa_index:
            encoded[i, aa_index[aa]] = 1
    return np.array(encoded)


def encode_pairs(sequence_pairs, max):
    """Encodes all pairs of sequences using one-hot encoding.
    Parameters:
    - sequence_pairs (List[Tuple[str, str]]): List of tuples, each containing a pair of sequences.
    Returns:
    - NumPy array containing the encoded pairs.
    """
    encoded_pairs = [np.hstack((one_hot_encode(pair[0], max), one_hot_encode(pair[1], max))) for pair in sequence_pairs]
    return np.array(encoded_pairs)

def encode(sequence_pairs, max):
    encoded_pairs = [np.hstack(one_hot_encode(pair, max)) for pair in sequence_pairs]
    return np.array(encoded_pairs)


def sencode(sequence_pairs):
    max_length_string = max(sequence_pairs, key=len)
    maxl = len(max_length_string)
    ec = []    
    for seq in sequence_pairs:
        aseq = one_hot_encode ( seq, maxl )
        ec.append ( aseq )
        # print ( aseq )
    return ec

def build_cnn_model(input_length, num_amino_acids):
    input_layer = Input(shape=(input_length, num_amino_acids), dtype='float32')

    conv1 = Conv1D(filters=32, kernel_size=3, activation='relu')(input_layer)
    pool1 = MaxPooling1D(pool_size=2)(conv1)
    flatten = Flatten()(pool1)
    dense = Dense(64, activation='relu')(flatten)
    # output_layer = Dense(2, activation='softmax')(dense)  # Adjusted for 2 classes
    output_layer = Dense(1, activation='sigmoid')(dense)
    model = Model(inputs=input_layer, outputs=output_layer)
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    model.summary()
    return model


def build_model_dep(input_shape):
    """Builds a simple CNN model for sequence comparison."""
    model = Sequential([
        Conv1D(filters=32, kernel_size=3, activation='relu', input_shape=input_shape),
        GlobalMaxPooling1D(),
        Dense(64, activation='relu'),
        Dense(1, activation='sigmoid')  # Assuming a binary classification problem
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model




def encode_groups(sequence_groups, max_length):
    """Encodes groups of sequences using one-hot encoding.
    
    Parameters:
    - sequence_groups (List[Tuple[str, ...]]): List of tuples, each containing a group of sequences.
    - max_length (int): The length to pad each sequence to.
    
    Returns:
    - NumPy array containing the encoded groups.
    """
    encoded_groups = [np.hstack([one_hot_encode(seq, max_length) for seq in group]) for group in sequence_groups]
    return np.array(encoded_groups)

# Create a function to pair sequences and also pair their labels
def create_pairs_with_labels(sequences, labels):
    pairs = []
    paired_labels = []
    for i in range(len(sequences)):
        for j in range(i+1, len(sequences)):
            pairs.append((sequences[i], sequences[j]))
            paired_labels.append((labels[i], labels[j]))
    return pairs, paired_labels

amino_acid_weights = {
    # Nonpolar amino acids, weight = 1
    'A': 1, 'V': 1, 'L': 1, 'I': 1, 'P': 1, 'W': 1, 'F': 1, 'M': 1, 'G': 1,
    
    # Polar amino acids, weight = 2.5
    'S': 2.5, 'T': 2.5, 'Y': 2.5, 'C': 2.5, 'N': 2.5, 'Q': 2.5,
    
    # Positively charged (basic), considered polar, weight = 2.5
    'R': 2.5, 'H': 2.5, 'K': 2.5,
    
    # Negatively charged (acidic), considered polar, weight = 2.5
    'D': 2.5, 'E': 2.5
}
a = {'A': 83.42533980914959, 'V': 97.12701769524689, 'L': 6.255780273557187, 'I': 52.88210892145915, 'P': 61.02764662801393, 'W': 95.8323978465841, 'F': 65.40583174280748, 'M': 1.4006890100337954, 'G': 83.11833571700016, 'S': 43.626234068544036, 'T': 62.83078874916155, 'Y': 15.737935393121226, 'C': 35.772291382129595, 'N': 5.214722217262501, 'Q': 59.46066869160379, 'R': 97.13838927668925, 'H': 55.5860204334924, 'K': 32.6069409505197, 'D': 76.37334172396959, 'E': 78.62083530354013}
b = {'A': 22.604531186541788, 'V': 81.18351951925055, 'L': 80.33603724646103, 'I': 58.04866051720005, 'P': 36.611750644140315, 'W': 86.09217892723571, 'F': 15.726743490786909, 'M': 28.480386425664715, 'G': 63.547778007515845, 'S': 26.010533400915282, 'T': 10.911738605078735, 'Y': 99.62558211496987, 'C': 59.52574409907232, 'N': 84.75453602570636, 'Q': 1.2015725964183988, 'R': 97.5970002882156, 'H': 64.02837022216364, 'K': 54.532295691057165, 'D': 15.333012939930345, 'E': 6.500578638999621}
c = {'A': 1, 'V': 1, 'L': 10.72028795884542, 'I': 1, 'P': 1, 'W': 1, 'F': 1, 'M': 1, 'G': 1, 'S': 1, 'T': 1, 'Y': 1, 'C': 1, 'N': 1, 'Q': 1, 'R': 1, 'H': 1, 'K': 1, 'D': 1, 'E': 1}
# smarts_patterns_filtered = {
#     'hydroxyl': '[OH]',
#     'carboxyl': 'C(=O)O',
#     'amino': '[NX3;H2,H1;!$(NC=O)]',
#     'aldehyde': '[CX3H1](=O)[#6]',
#     'ketone': '[#6][CX3](=O)[#6]',
#     'ester': '[#6]C(=O)O[#6]',
#     'amide': '[NX3][CX3](=O)[#6]',
#     'ether': '[#6]O[#6]',
#     'nitrile': '[CX2]#[NX1]',
#     'sulfone': '[SX4](=[OX1])(=[OX1])([#6])[#6]',
#     'sulfoxide': '[SX3](=O)[#6]',
#     'thiol': '[#16H]',
#     'halide': '[F,Cl,Br,I]',
#     'phenyl': 'c1ccccc1',
#     'benzyl': '[#6]c1ccccc1',
#     'alkene': 'C=C',
#     'alkyne': 'C#C',
#     'aromatic_nitrogen': '[nX2]',
#     'hydrazone': '[#6]=[NX2]-[#6]',
#     'imine': '[NX2]=[CX3]',
#     'alkyl_halide': '[CX4][F,Cl,Br,I]',
#     'aromatic': 'c1ccccc1',
#     'alcohol': '[OH]',
#     'epoxide': 'O1CC1',
#     'alkane': 'C'
# }

smarts_patterns_filtered = {
    'hydroxyl': '[*][OH]',
    'carboxyl': '[*]C(=O)O',
    'amino': '[*][NX3;H2,H1;!$(NC=O)]',
    'aldehyde': '[*][CX3H1](=O)[#6]',
    'ketone': '[*][#6][CX3](=O)[#6]',
    'ester': '[*][#6]C(=O)O[#6]',
    'amide': '[*][NX3][CX3](=O)[#6]',
    'ether': '[*][#6]O[#6]',
    'nitrile': '[*][CX2]#[NX1]',
    'sulfone': '[*][SX4](=[OX1])(=[OX1])([#6])[#6]',
    'sulfoxide': '[*][SX3](=O)[#6]',
    'thiol': '[*][#16H]',
    'halide': '[*][F,Cl,Br,I]',
    'phenyl': '[*]c1ccccc1',
    'benzyl': '[*][#6]c1ccccc1',
    'alkene': '[*]C=C',
    'alkyne': '[*]C#C',
    'aromatic_nitrogen': '[*][nX2]',
    'hydrazone': '[*][#6]=[NX2]-[#6]',
    'imine': '[*][NX2]=[CX3]',
    'alkyl_halide': '[*][CX4][F,Cl,Br,I]',
    'aromatic': '[*]c1ccccc1',
    'alcohol': '[*][OH]',
    'epoxide': '[*]O1CC1',
    'alkane': '[*]C'
}




def create_low_kd_group ( df, group_field="protein_sequence" ): 
    low_kd_threshold = 1.0 # Example threshold, adjust based on your criteria
    low_std_threshold = 1.5  # Example threshold, adjust based on your criteria
    # grouped = df.groupby('protein_sequence')['Kd'].agg(['mean', 'std']).reset_index()
    # filtered_groups = df[(df['mean'] <= low_kd_threshold) & (df['std'] <= low_std_threshold)]
    filtered_groups = df[(df['mean'] <= low_kd_threshold)]
    result = pd.merge(filtered_groups, df, on=group_field, how='inner')
    print ( len(result))
    final_result = result
    protein_sequences_list = final_result[group_field].tolist()
    print ( ' --------------------------------------------- ')
    print ( ' Final: ', len (result) )
    print ( ' --------------------------------------------- ')
    protein_sequences_array = np.array(protein_sequences_list)
    return protein_sequences_array

def create_high_kd_group ( df, group_field='protein_sequence' ): 
    low_kd_threshold =1000 # Example threshold, adjust based on your criteria
    # low_std_threshold = 900  # Example threshold, adjust based on your criteria
    filtered_groups = df[(df['mean'] > low_kd_threshold)]
    #  & (df['std'] <= low_std_threshold)
    result = pd.merge(filtered_groups, df, on=group_field, how='inner')
    print ( len(result))
    final_result = result
    protein_sequences_list = final_result[group_field].tolist()
    print ( ' --------------------------------------------- ')
    print ( ' Final: ', len (result) )
    print ( ' --------------------------------------------- ')
    protein_sequences_array = np.array(protein_sequences_list)
    return protein_sequences_array











# # Create a function to pair sequences and also pair their labels
# def create_pairs_with_labels(sequences, labels):
#     pairs = []
#     paired_labels = ['TEST1', 'ERS', 'test332']
#     for i in range(len(sequences)):
#         for j in range(i+1, len(sequences)):
#             pairs.append((sequences[i], sequences[j]))
#             # paired_labels.append((labels[i], labels[j]))
#     return pairs, paired_labels




def create_pairs(sequences):
    """Create all unique pairs from a list of sequences.
    
    Parameters:
    - sequences (List[str]): List of protein sequences.
    
    Returns:
    - List of tuples, where each tuple contains a pair of sequences.
    """
    pairs = []
    for i in range(len(sequences)):
        for j in range(i+1, len(sequences)):
            pairs.append((sequences[i], sequences[j]))
    return pairs


# def removeoutliers (df):
#     df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
#     df.dropna(subset=['Kd'], inplace=True)
#     Q1 = df['Kd'].quantile(0.25)
#     Q3 = df['Kd'].quantile(0.75)
#     IQR = Q3 - Q1
#     lower_bound = Q1 - 1.5 * IQR
#     upper_bound = Q3 + 1.5 * IQR
#     df['protein_length'] = df['protein_sequence'].apply(len)
#     outliers = df[(df['Kd'] < lower_bound) | (df['Kd'] > upper_bound)]
#     outlier_combinations = outliers[['SMILES', 'protein_sequence']].drop_duplicates()
#     clean_df = pd.merge(df, outlier_combinations, on=['SMILES', 'protein_sequence'], how='outer', indicator=True).query('_merge=="left_only"').drop(columns=['_merge'])
#     return clean_df 



def removeoutliers (df):
    df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
    df.dropna(subset=['Kd'], inplace=True)
    Q1 = df['Kd'].quantile(0.45)
    Q3 = df['Kd'].quantile(0.55)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR
    df['protein_length'] = df['protein_sequence'].apply(len)
    outliers = df[(df['Kd'] < lower_bound) | (df['Kd'] > upper_bound)]
    outlier_combinations = outliers[['SMILES', 'protein_sequence']].drop_duplicates()
    clean_df = pd.merge(df, outlier_combinations, on=['SMILES', 'protein_sequence'], how='outer', indicator=True).query('_merge=="left_only"').drop(columns=['_merge'])
    return clean_df 


def read_fasta(file_path):
    """Read protein sequences and their headers from a FASTA file.
    Parameters:
    - file_path (str): Path to the FASTA file.
    Returns:
    - List of sequences (str).
    - List of headers (str) as labels.
    """
    sequences = []
    labels = []
    for record in SeqIO.parse(file_path, "fasta"):
        sequences.append(str(record.seq))
        labels.append(str(record.id))  # Using the sequence header as the label
    return sequences, labels




def encode_sequences(sequences):
    return np.array([to_categorical(np.random.randint(0, 20, size=100), num_classes=20) for _ in sequences])
aa_to_index = {aa: idx for idx, aa in enumerate(amino_acid_weights.keys())}


def encode_and_pad_sequences_with_weights(sequences, amino_acid_weights=amino_acid_weights, max_length=None):
    num_amino_acids = len(amino_acid_weights)
    encoded_array = np.zeros((len(sequences), max_length, num_amino_acids))
    for i, seq in enumerate(sequences):
        for j, aa in enumerate(seq):
            if aa in aa_to_index:
                index = aa_to_index[aa]
                encoded_array[i, j, index] = amino_acid_weights[aa]
    return encoded_array

def smiles_to_fingerprint(smiles, radius=2, nBits=1024):
    mol = Chem.MolFromSmiles(smiles)
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=nBits)
    return np.array(fp)

def encode_smiles_with_smarts(smiles_list, smarts_patterns, smarts_weights):
    # Convert SMARTS strings to RDKit Mol objects for substructure matching
    smarts_mols = {name: Chem.MolFromSmarts(pattern) for name, pattern in smarts_patterns.items()}
    
    # Initialize the encoded array
    encoded_array = np.zeros((len(smiles_list), len(smarts_weights)))
    
    for i, smiles in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smiles)
        if not mol:  # If RDKit couldn't parse the SMILES
            continue
        
        for j, (name, smarts_mol) in enumerate(smarts_mols.items()):
            if mol.HasSubstructMatch(smarts_mol):
                encoded_array[i, j] = smarts_weights[name]
                
    return encoded_array


def run_sequences():
    pd.set_option('display.max_rows', 10)  # None means unlimited
    pd.set_option('display.max_columns', None)  # Adjust as per your DataFrame's width
    pd.set_option('display.width', 1000)  # Adjust the width for better readability
    pd.set_option('display.max_colwidth', None)  # None means unlimited column width
    df = pd.read_csv('./../bt.csv')
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


    
    amino_acids = ['A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V']
    for i in range(1000):
        for aa in amino_acids:
            amino_acid_weights[aa] = random.uniform(0, 1)
        X_low_kd = encode_and_pad_sequences_with_weights(pdata, amino_acid_weights, max_length)
        X_high_kd = encode_and_pad_sequences_with_weights (hdata, amino_acid_weights, max_length)
        print ( '-------------------------- ' )
        X = np.concatenate([X_low_kd, X_high_kd], axis=0)
        y = np.concatenate([plabels, hlabels], axis=0)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        # Define the CNN model
        model = Sequential([
            Conv1D(filters=64, kernel_size=3, activation='relu', input_shape=(X_train.shape[1], X_train.shape[2])),
            MaxPooling1D(pool_size=2),
            Flatten(),
            Dense(64, activation='relu'),
            Dense(1, activation='sigmoid')
        ])

        model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
        import sys
        # Train the model
        model.fit(X_train, y_train, epochs=40, validation_split=0.2)
        # Adding Dropout and BatchNormalization
        loss, accuracy = model.evaluate(X_test, y_test)
        print ( '-------------------------- ' )
        print ( '-------------------------- ' )
        print(f'Test accuracy: {accuracy:.4f}')
        if accuracy > 0.80:
            print ( amino_acid_weights )
            model.save ( f'seq-low-{i}.h5')
            sys.exit ()            

def calculate_permutation_importance(model, X_test, y_test, feature_names):
    # Ensure X_test is 2D: (samples, features)
    if X_test.ndim == 3:
        X_test = X_test.reshape(X_test.shape[0], -1)  # Flatten if 3D
    
    baseline_accuracy = accuracy_score(y_test, model.predict(X_test).round())
    feature_importances = []
    
    for i in range(X_test.shape[1]):  # Iterate over each feature
        save_feature = X_test[:, i].copy()
        X_test[:, i] = shuffle(X_test[:, i])  # Shuffle individual feature
        shuffled_accuracy = accuracy_score(y_test, model.predict(X_test).round())
        X_test[:, i] = save_feature  # Restore original feature values
        
        importance = baseline_accuracy - shuffled_accuracy  # Decrease in accuracy
        feature_importances.append((feature_names[i], importance))
    
    # Sort by importance score
    feature_importances.sort(key=lambda x: x[1], reverse=True)
    return feature_importances
# Convert model predictions to the right shape and type if necessary
def model_predict(model, X):
    predictions = model.predict(X)
    # Add your model-specific adjustments if needed, such as reshaping or thresholding
    return predictions.round().flatten()
def permutation_feature_importance(X, y, model, metric=accuracy_score, n_repeats=10):
    baseline_score = metric(y, model.predict(X).round())
    scores = np.zeros((X.shape[2], n_repeats))  # Assuming X is 3D: samples, timesteps, features
    X_permuted = X.copy()
    
    for feature in range(X.shape[2]):
        for n in range(n_repeats):
            # Shuffle feature across all samples
            X_permuted[:, :, feature] = shuffle(X[:, :, feature])
            permuted_score = metric(y, model.predict(X_permuted).round())
            scores[feature, n] = baseline_score - permuted_score
            # Reset the permuted data for the next iteration
            X_permuted[:, :, feature] = X[:, :, feature]
    
    importance_scores = scores.mean(axis=1)
    return importance_scores

def compute_integrated_gradients(model, baseline, input_seq, target_class_idx, steps=50):
    # Ensure baseline and input_seq are converted to TensorFlow tensors
    baseline = tf.convert_to_tensor(baseline, dtype=tf.float32)
    input_seq = tf.convert_to_tensor(input_seq, dtype=tf.float32)
    print ( baseline )
    # Linear interpolation between the baseline and the input
    scaled_inputs = tf.stack([baseline + (float(i) / steps) * (input_seq - baseline) for i in range(0, steps + 1)])

    with tf.GradientTape() as tape:
        tape.watch(scaled_inputs)  # Ensuring scaled_inputs is being watched
        predictions = model(scaled_inputs)
    gradients = tape.gradient(predictions[:, target_class_idx], scaled_inputs)
    print ( gradients )
    
    # avg_gradients = tf.reduce_mean(gradients, axis=0)
    # Compute the integrated gradients
    integrated_gradients = (input_seq - baseline)# * avg_gradients
    return integrated_gradients.numpy()  # Convert back to NumPy array, if needed
                    
def run_smiles():
    smarts_weights = {name: 1 for name in smarts_patterns_filtered.keys()}
    pd.set_option('display.max_rows', 10)  # 
    pd.set_option('display.max_columns', None)  # 
    pd.set_option('display.width', 1000)  # 
    pd.set_option('display.max_colwidth', None)  #
    df = pd.read_csv('./../conjugates/bt-proteins2.csv')
    df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
    df = df.dropna(subset=['Kd'])
    df = df[df['Kd'].apply(lambda x: isinstance(x, float) and not pd.isnull(x))]
    df = df.groupby('SMILES')['Kd'].agg(['mean', 'std']).reset_index()
    pdata = create_low_kd_group (df, 'SMILES')
    hdata  = create_high_kd_group (df, 'SMILES')
    print(' Unique low>  ', len(pdata) == len(set(pdata)))
    print ( " Low count ", len(pdata))
    print(' Unique high>  ', len(hdata) == len(set(hdata)))
    print ( " High count " , len(hdata))
    X_low_kd = encode_smiles_with_smarts(pdata, smarts_patterns_filtered, smarts_weights)
    X_high_kd = encode_smiles_with_smarts(hdata, smarts_patterns_filtered, smarts_weights)
    plabels = np.zeros(len(pdata))
    hlabels = np.ones(len(hdata))
    X = np.concatenate([X_low_kd, X_high_kd], axis=0)
    y = np.concatenate([plabels, hlabels], axis=0)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    X_train = np.expand_dims(X_train, axis=-1)  
    X_test = np.expand_dims(X_test, axis=-1)  
    model = Sequential([
        Conv1D(filters=64, kernel_size=3, activation='relu', input_shape=(X_train.shape[1], X_train.shape[2])),
        MaxPooling1D(pool_size=2),
        Flatten(),
        Dense(64, activation='relu'),
        Dense(1, activation='sigmoid')
    ])
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    model.fit(X_train, y_train, epochs=120, validation_split=0.2)
    loss, accuracy = model.evaluate(X_test, y_test)
    print ( '-------------------------- ' )
    print ( '-------------------------- ' )
    print(f'Test accuracy: {accuracy:.4f}')
    if accuracy > 0.80:
        functional_groups = list(smarts_patterns_filtered.keys())
        feature_importance = calculate_permutation_importance (model, X_test, y_test, functional_groups )
        print ( feature_importance )        
        for feature, importance in zip(functional_groups, feature_importance):
            print(f"{feature}: {importance}")



def identify_R_groups(base_molecule_smiles, functional_group_smarts):
    base_molecule = Chem.MolFromSmiles(base_molecule_smiles)
    functional_groups = [Chem.MolFromSmarts(smarts) for smarts in functional_group_smarts]
    matched_atoms = set()
    for fg in functional_groups:
        matches = base_molecule.GetSubstructMatches(fg)
        # print ( matches )
        for match in matches:
            matched_atoms.update(match)
    
    print ( matched_atoms )
    # Identify R groups
    # We'll consider R groups as atoms not part of any matched functional group
    r_groups = [atom.GetIdx() for atom in base_molecule.GetAtoms() if atom.GetIdx() not in matched_atoms]
    
    # For simplicity, we're returning the atom indices of R groups here.
    # Further processing can be done depending on what exactly you need (e.g., extracting substructures).
    return r_groups

# # Example usage


# print("R groups atom indices:", r_groups)


base_molecule_smiles = "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O" # Aspirin, for example
# functional_group_smarts = ["[*]C(=O)O", "[*]CC"] # Example functional groups: carboxylic acid and alkyl chain
# r_groups = identify_R_groups(base_molecule_smiles, list(smarts_patterns_filtered.values()))
r_groups = identify_R_groups(base_molecule_smiles, smarts_patterns_filtered.values())
print ( r_groups )

# run_smiles()
run_sequences()

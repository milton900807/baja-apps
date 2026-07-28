import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
import re
import os 
import sys
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras import layers, models
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.preprocessing import MinMaxScaler
import tensorflow as tf
from tensorflow.keras import layers, models

from tensorflow.keras.layers import Input, Dense, Concatenate
from tensorflow.keras.models import Model

# Assuming TokenAndPositionEmbedding and TransformerBlock are defined as in the previous example
from tensorflow.keras import layers, models
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
import tensorflow as tf


class TokenAndPositionEmbedding(layers.Layer):
    def __init__(self, maxlen, vocab_size, embed_dim):
        super(TokenAndPositionEmbedding, self).__init__()
        self.token_emb = layers.Embedding(input_dim=vocab_size, output_dim=embed_dim)
        self.pos_emb = layers.Embedding(input_dim=maxlen, output_dim=embed_dim)

    def call(self, x):
        maxlen = tf.shape(x)[-1]
        positions = tf.range(start=0, limit=maxlen, delta=1)
        positions = self.pos_emb(positions)
        x = self.token_emb(x)
        return x + positions
class TransformerBlock(layers.Layer):
    def __init__(self, embed_dim, num_heads, ff_dim, rate=0.1):
        super(TransformerBlock, self).__init__()
        self.att = layers.MultiHeadAttention(num_heads=num_heads, key_dim=embed_dim)
        self.ffn = tf.keras.Sequential([
            layers.Dense(ff_dim, activation="relu"), 
            layers.Dense(embed_dim),
        ])
        self.layernorm1 = layers.LayerNormalization(epsilon=1e-6)
        self.layernorm2 = layers.LayerNormalization(epsilon=1e-6)
        self.dropout1 = layers.Dropout(rate)
        self.dropout2 = layers.Dropout(rate)

    def call(self, inputs, training=False):  # Added 'training' argument
        attn_output = self.att(inputs, inputs)
        attn_output = self.dropout1(attn_output, training=training)  # Use 'training' argument
        out1 = self.layernorm1(inputs + attn_output)
        ffn_output = self.ffn(out1)
        ffn_output = self.dropout2(ffn_output, training=training)  # Use 'training' argument
        return self.layernorm2(out1 + ffn_output)





smarts_patterns_filtered_all = {
    'hydroxyl': '[OH]',
    'carboxyl': 'C(=O)O',
    'amino': '[NX3;H2,H1;!$(NC=O)]',
    'aldehyde': '[CX3H1](=O)[#6]',
    'ketone': '[#6][CX3](=O)[#6]',
    'ester': '[#6]C(=O)O[#6]',
    'amide': '[NX3][CX3](=O)[#6]',
    'ether': '[#6]O[#6]',
    'nitrile': '[CX2]#[NX1]',
    'sulfone': '[SX4](=[OX1])(=[OX1])([#6])[#6]',
    'sulfoxide': '[SX3](=O)[#6]',
    'thiol': '[#16H]',
    'halide': '[F,Cl,Br,I]',
    'phenyl': 'c1ccccc1',
    'benzyl': '[#6]c1ccccc1',
    'alkene': 'C=C',
    'alkyne': 'C#C',
    'aromatic_nitrogen': '[nX2]',
    'hydrazone': '[#6]=[NX2]-[#6]',
    'imine': '[NX2]=[CX3]',
    'alkyl_halide': '[CX4][F,Cl,Br,I]',
    'aromatic': 'c1ccccc1',
    'alcohol': '[OH]',
    'epoxide': 'O1CC1',
    'alkane': 'C'
}


def calculate_features(smiles, smarts_patterns):
    mol = Chem.MolFromSmiles(smiles)
    features = [Descriptors.MolLogP(mol)]
    for pattern in smarts_patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        features.append(len(mol.GetSubstructMatches(smarts)))
    return features

# Assuming TokenAndPositionEmbedding and TransformerBlock from the previous examples are defined

# Parameters for the model
maxlen = 100  # Adjust based on your sequence length
vocab_size = 21  # 20 amino acids + padding
embed_dim = 64  # Embedding size for each token
num_heads = 2  # Number of attention heads
ff_dim = 64  # Hidden layer size in feed forward network inside transformer

# Define Transformer as Encoder
def build_transformer_encoder(input_dim, maxlen, vocab_size, embed_dim, num_heads, ff_dim):
    inputs = layers.Input(shape=(maxlen,))
    embedding_layer = TokenAndPositionEmbedding(maxlen, vocab_size, embed_dim)
    x = embedding_layer(inputs)
    transformer_block = TransformerBlock(embed_dim, num_heads, ff_dim)
    x = transformer_block(x)
    x = layers.GlobalAveragePooling1D()(x)
    encoder_output = layers.Dense(input_dim, activation="relu")(x)  # Adjusted to match the autoencoder's expected input dimension
    model = models.Model(inputs=inputs, outputs=encoder_output)
    return model

# Define Autoencoder
def build_autoencoder(input_dim, maxlen, vocab_size, embed_dim, num_heads, ff_dim):
    encoder = build_transformer_encoder(input_dim, maxlen, vocab_size, embed_dim, num_heads, ff_dim)
    
    encoder_input = layers.Input(shape=(maxlen,))
    encoded_seq = encoder(encoder_input)
    
    # Decoder
    decoder_input = layers.Dense(64, activation="relu")(encoded_seq)
    decoder_output = layers.Dense(maxlen, activation="sigmoid")(decoder_input)  # Assuming binary output; adjust as needed
    autoencoder_model = models.Model(inputs=encoder_input, outputs=decoder_output)
    
    return autoencoder_model
def build_autoencoder_for_regression(input_dim, maxlen, vocab_size, embed_dim, num_heads, ff_dim):
    encoder = build_transformer_encoder(input_dim, maxlen, vocab_size, embed_dim, num_heads, ff_dim)
    
    encoder_input = layers.Input(shape=(maxlen,))
    encoded_seq = encoder(encoder_input)
    
    # Adjust decoder for regression
    decoder_input = layers.Dense(64, activation="relu")(encoded_seq)
    kd_prediction = layers.Dense(1)(decoder_input)  # Single output unit for Kd prediction
    
    autoencoder_model = models.Model(inputs=encoder_input, outputs=kd_prediction)
    
    return autoencoder_model


def encode_protein_sequence(sequence):
    return [amino_acid_mapping.get(aminoacid, 0) for aminoacid in sequence]


def check_file_exists(name, index, directory="."):
    file_path = os.path.join(directory, f'model{name}{index}.png')
    return os.path.exists(file_path)
def is_dna_string(s):
    try:
        valid_nucleotides = {'A', 'C', 'G', 'T'}
        return ( all(char in valid_nucleotides for char in s.upper()) )
    except:
        return False

def one_hot_encode_dna(sequence):
    # Mapping of nucleotides to vectors
    mapping = {'A': [1, 0, 0, 0], 'C': [0, 1, 0, 0], 'G': [0, 0, 1, 0], 'T': [0, 0, 0, 1]}
    
    # Initialize an empty list to store the encoded sequence
    encoded_sequence = []
    
    # Iterate through each nucleotide in the sequence and encode it
    for nucleotide in sequence.upper():
        if nucleotide in mapping:
            encoded_sequence.append(mapping[nucleotide])
        else:
            # Handle unknown nucleotides (e.g., N) by a neutral vector, if needed
            encoded_sequence.append([0, 0, 0, 0]) # Optional: choose how to handle unknowns
    
    # Convert the list of vectors into a numpy array
    return np.array(encoded_sequence)



df = pd.read_csv('./../../data/bt-seq.csv')
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df[df['Kd'].apply(lambda x: isinstance(x, float) and not pd.isnull(x))]
df  = df[df['canonical_transcript_sequence'].apply(is_dna_string)]
print ( len ( df ))
kd_ranges = []
for dna_sequence, group_df in df.groupby('Unigene'):
    kd_range = group_df['Kd'].max() - group_df['Kd'].min()
    if group_df['Kd'].min() < 1 and group_df['Kd'].max() > 5:
        kd_ranges.append(group_df)
print ( ' number to run ', len(kd_ranges))
input_dim = 400 + 26 + len(smarts_patterns_filtered_all) + 1
# Instantiate and compile the model for regression
autoencoder = build_autoencoder_for_regression(input_dim=input_dim,  # Adjust based on your input dimension
                                               maxlen=400 + 26,
                                               vocab_size=2,
                                               embed_dim=embed_dim,
                                               num_heads=num_heads,
                                               ff_dim=ff_dim)
# autoencoder.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
autoencoder.compile(optimizer='adam', loss='mse')  # Use mean squared error for regression
amino_acid_mapping = {
    'A': 1, 'R': 2, 'N': 3, 'D': 4, 'C': 5, 'Q': 6, 'E': 7, 'G': 8, 'H': 9, 'I': 10,
    'L': 11, 'K': 12, 'M': 13, 'F': 14, 'P': 15, 'S': 16, 'T': 17, 'W': 18, 'Y': 19, 'V': 20,
    'X': 0,  # Unknown amino acids or padding
    '-': 0   # Padding symbol if needed
}



# g = kd_ranges[0]
index = 0
for g in kd_ranges:
    name = (g['Name'].iloc[0])    
    print ( name )
    index+=1
    
    name = re.sub(r'[\W\s]', '_', name)

    if check_file_exists ( name, index ):
        print ( 'Skipping', name )
    else:
        
        protein_sequences = g['canonical_transcript_sequence'].apply(one_hot_encode_dna)
        print ( protein_sequences )
        protein_sequences_padded = pad_sequences(protein_sequences, maxlen=maxlen, padding='post', value=0)
        g['smiles_features'] = g['SMILES'].apply(lambda x: calculate_features(x, smarts_patterns_filtered_all))
        X_smiles = np.array(g['smiles_features'].tolist())
        kd_scaler = MinMaxScaler()
        g['Kd_normalized'] = kd_scaler.fit_transform(g[['Kd']])
        Y = g['Kd_normalized'].values
        X_protein = np.array(protein_sequences_padded.tolist())
        # print (X_smiles)
        # print ( ' - - - - - - -  - --  - --  -')
        # print ( X_protein )
        
        X_protein_flattened = X_protein.reshape(X_protein.shape[0], -1)  # Flatten all but the first dimension
        print (' flattened',  X_smiles.shape[1] )
        concatenated = np.concatenate([X_protein_flattened, X_smiles], axis=1)

        # concatenated = np.concatenate([X_protein, X_smiles], axis=1)
        autoencoder.fit(concatenated, Y, epochs=50, batch_size=256)
        X_train, X_val, Y_train, Y_val = train_test_split(concatenated, Y, test_size=0.2, random_state=42)
        history = autoencoder.fit(X_train, Y_train, validation_data=(X_val, Y_val), epochs=50, batch_size=256)
        val_loss = autoencoder.evaluate(X_val, Y_val)
        print(f"Validation Loss: {val_loss}")
        # Assuming Y_train and Y_val are your training and validation target datasets respectively
        num_samples_train = Y_train.shape[0]
        num_samples_val = Y_val.shape[0]

        print(f"Number of samples in training dataset: {num_samples_train}")
        print(f"Number of samples in validation dataset: {num_samples_val}")

        # Plot training & validation loss values
        plt.plot(history.history['loss'])
        plt.plot(history.history['val_loss'])
        plt.title(f'{name}  loss val: {num_samples_val} and train on {num_samples_train} samples')
        plt.ylabel('Loss')
        plt.xlabel('Epoch')
        plt.legend(['Train', 'Validation'], loc='upper left')
        plt.savefig(f'{name}{index}.png')
        plt.clf()

        # If you tracked accuracy or other metrics, you can plot them in a similar way:
        if 'accuracy' in history.history:
            plt.plot(history.history['accuracy'])
            plt.plot(history.history['val_accuracy'])
            plt.title('Model accuracy')
            plt.ylabel('Accuracy')
            plt.xlabel('Epoch')
            # plt.title(f'Model Loss - {total_epochs} Epochs (Train: {num_samples_train} samples, Val: {num_samples_val} samples)')
            plt.legend(['Train', 'Validation'], loc='upper left')
            plt.savefig(f'accuracy{index}.png')
            plt.clf()


        # Assuming history is your training history object from autoencoder.fit
        threshold = 1.10  # Setting threshold to 10% higher than training loss
        good_fit = []  # List to store epochs that meet the non-overfitting criterion
        for index, (train_loss, val_loss) in enumerate(zip(history.history['loss'], history.history['val_loss'])):
            if val_loss <= train_loss * threshold:
                good_fit.append((index, train_loss, val_loss))

        if good_fit and len(good_fit)>0:
            # Print the good fit epochs and their losses
            for index, train_loss, val_loss in good_fit:
                print(f"good-fit{index}: Training Loss = {train_loss}, Validation Loss = {val_loss}")

                # Plotting
                plt.figure(figsize=(10, 6))
                plt.plot(history.history['loss'], label='Training Loss')
                plt.plot(history.history['val_loss'], label='Validation Loss')

                # Highlighting the good fit epochs on the plot
                for index, _, _ in good_fit:
                    plt.axvline(x=index, color='gray', linestyle='--', alpha=0.5)

                plt.title(f'{name}Model Loss')
                plt.xlabel('Epoch')
                plt.ylabel('Loss')
                plt.legend()
                plt.savefig(f"{name}-good-fit{index}.png")
                plt.clf()

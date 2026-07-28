from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
import tensorflow as tf



def load_molecules_and_labels(sdf_file, label, max_molecules=1000):
    sdf_supplier = Chem.SDMolSupplier(sdf_file)
    molecules = []
    labels = []
    for mol in sdf_supplier:
        if mol is not None and len(molecules) < max_molecules:
            molecules.append(mol)
            labels.append(label)
        if len(molecules) >= max_molecules:
            break
    return molecules, labels

toxic_molecules, toxic_labels = load_molecules_and_labels('../acute-effects.sdf', 1, 100000)
# toxic_molecules, toxic_labels = load_molecules_and_labels('toxic.sdf', 1, 100000)
safe_molecules, safe_labels = load_molecules_and_labels('../fda-approved.sdf', 0, 100000)


print ( ' Toxic ', len(toxic_molecules))
print ( ' FDA  ', len(safe_molecules))
# Combine the datasets
molecules = toxic_molecules + safe_molecules
labels = np.array(toxic_labels + safe_labels)

# Generate molecular fingerprints (features)
fingerprints = np.array([AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=2048) for mol in molecules])
fingerprints = np.array([list(fp) for fp in fingerprints])

# Split the dataset into training and test sets
X_train, X_test, y_train, y_test = train_test_split(fingerprints, labels, test_size=0.2, random_state=42)

model = tf.keras.Sequential([
    tf.keras.layers.Dense(512, activation='relu', input_shape=(X_train.shape[1],)),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(256, activation='relu'),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(1, activation='sigmoid')
])

model.compile(optimizer='adam',
              loss='binary_crossentropy',
              metrics=['accuracy'])

history = model.fit(X_train, y_train, epochs=10, batch_size=32, validation_split=0.1)

# Evaluate the model on the test set
test_loss, test_accuracy = model.evaluate(X_test, y_test, verbose=2)
print(f"Test accuracy: {test_accuracy}")
if test_accuracy > 0.9:
    model.save ( 'acute-toxic-score.keras')
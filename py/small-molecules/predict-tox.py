import argparse
from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
from tensorflow.keras.models import load_model

def smiles_to_fingerprint(smiles, nBits=2048):
    """Convert a SMILES string to a Morgan fingerprint"""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("Could not parse SMILES string.")
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=nBits)
    return np.array(list(fp))

def predict_smiles(smiles, model_path='my_model.h5'):
    """Load a model and predict the class of the given SMILES string"""
    model = load_model(model_path)
    fp = smiles_to_fingerprint(smiles)
    fp = np.expand_dims(fp, axis=0)  # Add batch dimension
    prediction = model.predict(fp)
    return prediction[0][0]

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict toxicity from a SMILES string")
    parser.add_argument("smiles", type=str, help="SMILES string of the molecule")
    parser.add_argument("--model_path", type=str, default="./toxic-score.keras", help="Path to the saved Keras model")

    args = parser.parse_args()

    try:
        score = predict_smiles(args.smiles, args.model_path)
        print(f"Predicted Score (Probability of being toxic): {score}")
    except Exception as e:
        print(f"Error: {e}")

from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
from tensorflow.keras.models import load_model
import argparse

class ToxicityPredictor:
    def __init__(self, model_path):
        self.model = load_model(model_path)

    @staticmethod
    def smiles_to_fingerprint(smiles, nBits=2048):
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError("Could not parse SMILES string.")
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=nBits)
        return np.array(list(fp))

    def predict_smiles(self, smiles):
        fp = self.smiles_to_fingerprint(smiles)
        fp = np.expand_dims(fp, axis=0)  # Adding batch dimension
        prediction = self.model.predict(fp)
        return prediction[0][0]

class ToxRun:
    def __init__(self, model_path1, model_path2):
        self.tox_predictor1 = ToxicityPredictor(model_path1)
        self.tox_predictor2 = ToxicityPredictor(model_path2)

    def predict(self, smiles, model_number):
        if model_number == 1:
            return self.tox_predictor1.predict_smiles(smiles)
        elif model_number == 2:
            return self.tox_predictor2.predict_smiles(smiles)
        else:
            raise ValueError("Invalid model number. Please specify 1 or 2.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict toxicity from a SMILES string using a specified model")
    parser.add_argument("smiles", type=str, help="SMILES string of the molecule")
    args = parser.parse_args()
    model1="./toxic-db-score.keras"
    model2="./toxic-db3-score.keras"
    tox_run = ToxRun(model1, model2)
    print ( args.smiles )
    try:
        score = tox_run.predict(args.smiles, 1)
        print(f"Predicted Score (Probability of being toxic) with model {1}: {score}")
        score = tox_run.predict(args.smiles, 2)
        print(f"Predicted Score (Probability of being toxic) with model {12}: {score}")
    except Exception as e:
        print(f"Error: {e}")

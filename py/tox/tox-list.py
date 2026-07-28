import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
from tensorflow.keras.models import load_model

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

# Assuming the CSV file with SMILES strings is named 'input.csv'
df = pd.read_csv('./data/purchase_target_10000.tsv', sep='\t')


model1="./models/toxic-db-score.keras"
model2="./models/toxic-db3-score.keras"
tox_run = ToxRun(model1, model2)

# Define function to apply predictions
def apply_predictions(row):
    smiles = row['smiles']
    model1_result = tox_run.predict(smiles, 1)
    model2_result = tox_run.predict(smiles, 2)
    return pd.Series([model1_result, model2_result, np.mean([model1_result, model2_result]), np.std([model1_result, model2_result])])

# Apply predictions to each row
df[['model1', 'model2', 'mean', 'standard_deviation']] = df.apply(apply_predictions, axis=1)

# Save the updated dataframe
df.to_csv('tox-values.csv', index=False)

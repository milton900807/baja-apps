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
print ( ' loading models... ')

model1="./models/toxic-db-score.keras"
model2="./models/toxic-db3-score.keras"
tox_run = ToxRun(model1, model2)
from tqdm import tqdm  # Optional, for progress bar

# Assuming tox_run is defined elsewhere and has a predict method
# Also assuming 'df' is your DataFrame and is already loaded

# Define function to apply predictions
def apply_predictions_and_save(df, chunk_size=1000, save_path='tox-values.csv'):
    results = []  # To store the intermediate results
    print('Updating...')

    for i in tqdm(range(0, len(df), chunk_size)):  # tqdm is optional, for displaying progress
        # Process in chunks
        chunk = df.iloc[i:i+chunk_size]
        chunk_result = chunk.apply(apply_predictions, axis=1)
        results.append(chunk_result)
        
        # Every 1000 rows, or end of the DataFrame, save to CSV
        if (i + chunk_size) % 1000 == 0 or (i + chunk_size) >= len(df):
            interim_df = pd.concat([df.iloc[:i+chunk_size], pd.concat(results)], axis=1)
            interim_df.to_csv(save_path, index=False)
            
    # Combine all results and return
    full_results = pd.concat(results, ignore_index=True)
    return full_results

def apply_predictions(row):
    smiles = row['smiles string']
    try:
        model1_result = tox_run.predict(smiles, 1)
        model2_result = tox_run.predict(smiles, 2)
        # Assuming your predict function returns a value that can be directly used
        return pd.Series([model1_result, model2_result, np.mean([model1_result, model2_result]), np.std([model1_result, model2_result])], 
                         index=['model1', 'model2', 'mean', 'standard_deviation'])
    except Exception as e:
        print(f"Error processing SMILES {smiles}: {e}")
        return pd.Series([-1, -1, -1, -1], index=['model1', 'model2', 'mean', 'standard_deviation'])

# Now apply the predictions and save every 1000 updates
df_updated = apply_predictions_and_save(df)

# If you want to append the results back to the original DataFrame (optional)
# Make sure the indices align correctly if you take this route
df[['model1', 'model2', 'mean', 'standard_deviation']] = df_updated
df.to_csv('final-tox-values.csv', index=False)

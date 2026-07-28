import pandas as pd
from rdkit import Chem
from rdkit.Chem import Crippen
import matplotlib.pyplot as plt
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, GraphDescriptors, rdMolDescriptors
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import matplotlib.pyplot as plt
import json
from itertools import cycle


# Step 1: Read the CSV file
# Replace 'your_data.csv' with the path to your CSV file
df = pd.read_csv('./group-table-with-distance.csv')  # Assuming columns are 'Unigene' and 'SMILES'


def calculate_properties(smiles):
    mol = Chem.MolFromSmiles(smiles)
    logp = Crippen.MolLogP(mol)
    kappa1 = rdMolDescriptors.CalcKappa1(mol)
    kappa2 = rdMolDescriptors.CalcKappa2(mol)
    kappa3 = rdMolDescriptors.CalcKappa3(mol)
    tpsa = Descriptors.TPSA(mol)
    rotatable_bonds = rdMolDescriptors.CalcNumRotatableBonds(mol)
    return logp, kappa1, kappa2, kappa3, tpsa, rotatable_bonds



# Filtering groups with more than 5 entries
groups = df.groupby('Unigene').filter(lambda x: len(x) > 5)
smpiles_groups = df.groupby('SMILES')


# for unigene, group in groups.groupby('Unigene'):
#     print(f"Processing {unigene}...")
    
#     properties = group['SMILES'].apply(calculate_properties)
#     group[['LogP', 'CalcKappa1', 'CalcKappa2', 'CalcKappa3', 'TPSA', 'RotatableBonds']] = pd.DataFrame(properties.tolist(), index=group.index)
    
#     # Prepare the dataset for this group
#     X = group[['LogP', 'CalcKappa1', 'CalcKappa2', 'CalcKappa3', 'TPSA', 'RotatableBonds']]
#     y = group['Kd']
    
#     # Split the data for this group
#     X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
#     # Train the model for this group
#     model = RandomForestRegressor(n_estimators=100, random_state=42)
#     model.fit(X_train, y_train)
    
#     # Evaluate the model for this group
#     y_pred = model.predict(X_test)
#     mse = mean_squared_error(y_test, y_pred)
#     print(f"{unigene} - Mean Squared Error: {mse}")
    
#     # Feature importances for this group
#     feature_importances = model.feature_importances_
#     contributors = pd.Series(feature_importances, index=X.columns).sort_values(ascending=False)
#     print(f"{unigene} - Feature importances:")
#     print(contributors)
    
#     # Plotting feature importances for this group
#     fig, ax1 = plt.subplots()
#     ax2 = ax1.twinx()
#     ax1.bar(contributors.index, contributors.values, color='g')
#     ax2.plot(contributors.index, [len(group)] * len(contributors), color='b', label='Group Size', marker='o')

#     ax1.set_xlabel('Features')
#     ax1.set_ylabel('Importance', color='g')
#     ax2.set_ylabel('Group Size', color='b')
#     plt.title(f'Feature Importances and Group Size for Kd Reduction ({unigene})')
#     ax1.tick_params(axis='y', labelcolor='g')
#     ax2.tick_params(axis='y', labelcolor='b')

#     fig.tight_layout()  # Adjust the layout to make room for the legend
#     ax2.legend(loc='upper right')
#     plt.savefig(f'{unigene}lp2.png')

import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures

# Define the general form of the sine wave
def sine_wave(x, A, B, C, D):
    return A * np.sin(B * x + C) + D

def generatePolynomial ( x_values, y_values ):
        
    # Reshaping the x_values to a 2D array for compatibility with the functions used later
    x_values_reshaped = x_values[:, np.newaxis]

    # Creating polynomial features (5th order)
    poly_features = PolynomialFeatures(degree=5, include_bias=False)
    x_poly = poly_features.fit_transform(x_values_reshaped)

    # Performing the regression
    model = LinearRegression()
    model.fit(x_poly, y_values)

    # Coefficients of the polynomial
    coefficients = model.coef_
    intercept = model.intercept_

    # Displaying the polynomial equation
    print("The polynomial equation is:")
    equation = f'y = {intercept:.2f}'
    for i, coef in enumerate(coefficients):
        equation += f' + {coef:.2f}x^{i + 1}'
    print(equation)
    return poly_features, model

def find_lowest_normalized_sum(arrays):
    # Initialize variables to track the lowest normalized sum and the corresponding array
    lowest_normalized_sum = float('inf')  # Start with infinity to ensure any real sum is lower
    lowest_array = None
    
    # Loop through each array
    for array in arrays:

        if len(array) == 0 or len(array) < 10 or not all(isinstance(x, int) for x in array):
            continue

        # Calculate the sum and length of the current array
        current_sum = sum(array)
        current_length = len(array)
        
        # Avoid division by zero for empty arrays
        if current_length == 0:
            continue
        
        # Calculate the normalized sum
        normalized_sum = current_sum / current_length
        
        # Check if this is the lowest normalized sum so far
        if normalized_sum < lowest_normalized_sum:
            lowest_normalized_sum = normalized_sum
            lowest_array = array
    
    return lowest_array

colors = cycle(['b', 'g', 'r', 'c', 'm', 'y', 'k'])

        # Plotting all wave functions for the group on one graph
plt.figure(figsize=(30, 10))
for unigene, group in groups.groupby('Unigene'):
    orf_distances = group['orf_distances'].values[0]
    orf_distances = json.loads(orf_distances)
    array = find_lowest_normalized_sum ( orf_distances )
    print ( array )




    if array:  # Check if array is not None (or empty)
            x_values = np.arange(len(array))

            poly_features, model = generatePolynomial ( x_values, array )

            x_predict = np.linspace(0, 10, 1000).reshape(-1, 1)
            print ( x_predict )
            x_predict_poly = poly_features.transform(x_predict)
            y_predict = model.predict(x_predict_poly)

            plt.plot(x_predict, y_predict, marker='o', linestyle='-', label=unigene, color=next(colors))


        
plt.title('All Wave Functions for Group on One Graph')
plt.xlabel('Array Index')
plt.ylabel('sin(x) Approximation')
plt.grid(True)
# plt.legend()
plt.savefig(f'_wave_function.png')
plt.close()
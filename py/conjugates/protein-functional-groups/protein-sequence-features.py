import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from ast import literal_eval
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from ast import literal_eval
import numpy as np
import matplotlib.pyplot as plt


import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt

# Define the wave function
def wave_function(x, A, B, C, D):
    return A * np.sin(B * x + C) + D

# Function to fit an array of numbers to a wave function
def fit_to_wave(data):
    # Assuming x values are the indices of the data
    x_data = np.arange(len(data))
    y_data = np.array(data)
    
    # Initial guess for the parameters [A, B, C, D]
    initial_guess = [1, 2*np.pi/len(data), 0, np.mean(data)]
    
    # Use curve_fit to fit the wave function to the data
    params, params_covariance = curve_fit(wave_function, x_data, y_data, p0=initial_guess)
    A, B, C, D = params

    # Calculate amplitude and frequency
    amplitude = A
    frequency = B / (2 * np.pi)
    print ( frequency )
    return frequency


    # # Plot the data and the fitted curve
    # plt.scatter(x_data, y_data, label='Data')
    # plt.plot(x_data, wave_function(x_data, *params), label='Fitted wave', color='red')
    # plt.legend()
    # plt.show()
    
    # return params

# Number,Name,Unigene,Ligand ID, Ligand Name,SMILES,CAS,NSC,Hotligand,species,source,ki Note,Kd,Reference,Link,valid_smiles,basic_in_acidic_conditions,acidic_in_acidic_conditions,hydrophobic_in_acidic_conditions,hydrophilic_in_acidic_conditions,polar_groups,Molecular_Weight,Polarity,Hydrophobicity,ensembl_gene_id,canonical_transcript,canonical_transcript_sequence,orf_distances

# Function to find the minimum sum of any contiguous set of 3 numbers in a list of lists
def min_contiguous_sum(list_of_lists):
    min_sum = float('inf')  # Initialize min_sum to infinity
    
    for lst in list_of_lists:  # Iterate through each sublist
        if len(lst) < 3:
            continue  # Skip sublists with fewer than 3 elements
        for i in range(len(lst)):  # Iterate through sublist for contiguous sets of 3 numbers
            current_sum = sum(lst[i:i+3])
            min_sum = min(min_sum, current_sum)
            
    return min_sum if min_sum != float('inf') else np.nan  # Return np.nan if no valid sets were found

# Load the dataset (repeating essential steps for clarity)
file_path = './modified_table_with_distances.csv'
df = pd.read_csv(file_path)
df['orf_distances'] = df['orf_distances'].apply(lambda x: literal_eval(x))
df['min_contiguous_orf_distance'] = df['orf_distances'].apply(fit_to_wave)

# Prepare feature and target variables
X = df[['min_contiguous_orf_distance']].dropna()  # Features
y = df.loc[X.index, 'Kd']  # Target

# Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a linear regression model
model = LinearRegression()
model.fit(X_train, y_train)

# Predict on the testing set
y_pred = model.predict(X_test)

# Evaluate the model
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f'RMSE: {rmse}')

# Plotting actual vs. predicted Kd values
plt.figure(figsize=(10, 6))
plt.scatter(X_test, y_test, color='blue', label='Actual Kd')
plt.scatter(X_test, y_pred, color='red', alpha=0.5, label='Predicted Kd')
plt.title('Actual vs Predicted Kd Values')
plt.xlabel('Min Contiguous ORF Distance')
plt.ylabel('Kd')
plt.legend()
plt.grid(True)

# Saving the plot to a PNG file
plot_file_path = 'kd_prediction_plot.png'
plt.savefig(plot_file_path)
plt.close()  # Close the plot to avoid displaying it inline if running in a notebook

print(f"Plot saved to {plot_file_path}")

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression


df = pd.read_csv('bt-proteins2.csv')
# Assuming 'df' is your DataFrame and it already includes amino acid composition
# Convert 'Kd' to numeric, removing non-numeric rows as previously discussed
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])

# Create a binary target variable: 1 for low Kd (< 1) and 0 for not low Kd (>= 1)
df['Low_Kd'] = (df['Kd'] < 1).astype(int)

# Focus on amino acid composition columns for this analysis
amino_acids_columns = ['Alanine', 'Arginine', 'Asparagine', 'Aspartic acid', 'Cysteine', 
                               'Glutamic acid', 'Glutamine', 'Glycine', 'Histidine', 'Isoleucine', 
                                                      'Leucine', 'Lysine', 'Methionine', 'Phenylalanine', 'Proline', 
                                                                             'Serine', 'Threonine', 'Tryptophan', 'Tyrosine', 'Valine']

X = df[amino_acids_columns]
y = df['Low_Kd']

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Initialize and train the logistic regression model
model = LogisticRegression()
model.fit(X_train_scaled, y_train)

# Predictions and Evaluation
y_pred = model.predict(X_test_scaled)
accuracy = accuracy_score(y_test, y_pred)
cm = confusion_matrix(y_test, y_pred)

print(f"Accuracy: {accuracy}")
print("Confusion Matrix:")
print(cm)

# Analyze coefficients
coefficients = pd.DataFrame(model.coef_[0], index=amino_acids_columns, columns=['Coefficient'])
print("Coefficient values for amino acids:")
print(coefficients.sort_values(by='Coefficient', ascending=False))
import os

# Assuming the rest of the script is unchanged up to this point...

# Ensure the directory exists
directory = './protein-structure'
if not os.path.exists(directory):
        os.makedirs(directory)

        # Path to the report file
report_path = os.path.join(directory, 'amino-acid-comp.report.txt')

with open(report_path, 'w') as report_file:
        report_file.write("Amino Acid Composition and Low Kd Relationship Report\n")
        report_file.write("====================================================\n\n")
                
        report_file.write(f"Model Accuracy: {accuracy}\n\n")
                        
        report_file.write("Confusion Matrix:\n")
        report_file.write(f"{cm}\n\n")
                                    
        report_file.write("Coefficient Values for Amino Acids (indicative of their importance in predicting low Kd):\n")


df = df[df['Kd'] < 1]


# Calculate the length of each protein sequence
df['Protein_Length'] = df['protein_sequence'].apply(len)

# Prepare the data for plotting
X = df[['Protein_Length']].values  # Predictor variable - mean length of the protein chain
y = df['Kd'].values  # Response variable

# Prepare the Linear Regression model and fit it
model = LinearRegression()
model.fit(X, y)

# Predict Kd values for the observed protein lengths
y_pred = model.predict(X)

# Plotting
plt.figure(figsize=(10, 6))
plt.scatter(X, y, color='blue', label='Actual Kd values')
plt.plot(X, y_pred, color='red', linewidth=2, label='Predicted Kd values (Regression Line)')
plt.title('Correlation between Mean Length of Protein Chain and Kd value (Kd < 1)')
plt.xlabel('Mean Length of Protein Chain')
plt.ylabel('Kd value')
plt.legend()
plt.grid(True)
plt.savefig('protein_length_vs_Kd_under_1.png')
plt.show()



model = LinearRegression()

most_significant_aa = ''
max_neg_coeff = np.inf  # Start with infinity because we are looking for the most negative value

# Columns representing amino acids
amino_acids = [
    "Alanine", "Arginine", "Asparagine", "Aspartic acid",
    "Cysteine", "Glutamic acid", "Glutamine", "Glycine",
    "Histidine", "Isoleucine", "Leucine", "Lysine",
    "Methionine", "Phenylalanine", "Proline", "Serine",
    "Threonine", "Tryptophan", "Tyrosine", "Valine"
]

for aa in amino_acids:
    X = df[[aa]]  # Predictor variable
    y = df['Kd']  # Response variable
    
    # Fit the model
    model.fit(X, y)
    
    # Check the coefficient (slope)
    coeff = model.coef_[0]
    if coeff < max_neg_coeff:
        max_neg_coeff = coeff
        most_significant_aa = aa

# Plotting the most significant amino acid vs Kd
plt.figure(figsize=(10, 6))
plt.scatter(df[most_significant_aa], df['Kd'], color='blue')
plt.title(f'Correlation between {most_significant_aa} content and Kd value')
plt.xlabel(f'{most_significant_aa} content')
plt.ylabel('Kd value')
plt.grid(True)
plt.savefig('amino_acid_vs_Kd.png')
plt.show()



# Filter the DataFrame for Kd values under 1
plt.figure(figsize=(20, 10))

for aa in amino_acids:
    X = df[[aa]].values  # Predictor variable
    y = df['Kd'].values  # Response variable

    # Fit the model
    model.fit(X, y)
    
    # Predict Kd values for the current amino acid content
    y_pred = model.predict(X)
    
    # Plot
    plt.scatter(X, y, label=f'{aa}')
    plt.plot(X, y_pred, linewidth=2)  # Add the regression line

plt.title('Correlation between Amino Acid content and Kd value (Kd < 1) for all AAs')
plt.xlabel('Amino Acid content')
plt.ylabel('Kd value')
plt.legend()
plt.grid(True)
plt.savefig('all_amino_acids_vs_Kd_under_1.png')
plt.show()


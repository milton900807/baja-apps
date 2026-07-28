import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import re

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression

import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv('bt-proteins2.csv')
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])
df['Low_Kd'] = (df['Kd'] < 1).astype(int)
amino_acids_columns = ['Alanine', 'Arginine', 'Asparagine', 'Aspartic acid', 'Cysteine',
                               'Glutamic acid', 'Glutamine', 'Glycine', 'Histidine', 'Isoleucine',
                                                      'Leucine', 'Lysine', 'Methionine', 'Phenylalanine', 'Proline',
                                                                             'Serine', 'Threonine', 'Tryptophan', 'Tyrosine', 'Valine']

# Convert 'Kd' to numeric, removing non-numeric rows as previously discussed
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])

import pandas as pd
import json
import re
from scipy.stats import spearmanr

# Load regular expressions from JSON
with open('regular_expressions.json', 'r') as file:
    regex_dict = json.load(file)['regular_expressions']

# Function to count hits for a single regex in a sequence
def count_hits(sequence, regex):
    v = len(re.findall(regex, sequence))
    return v/len(sequence)
print ( regex_dict )
xf = []
# Apply the regular expressions to each protein sequence and count hits
for regitem in regex_dict:
    name = regitem['name']
    regex = regitem['expression']
    df[name + '_hits'] = df['protein_sequence'].apply(count_hits, args=(regex,))
    xf.append ( df[name + '_hits'] )


correlations = {}
for d in regex_dict:
    name = d['name']
    corr, _ = spearmanr(df[name + '_hits'], df['Kd'])
    correlations[name] = corr

# Display the correlations
for name, corr in correlations.items():
    print ( name )
    print(f"Correlation of {name} hits with Kd values: {corr}")



# Plotting the correlations
names = list(correlations.keys())
values = list(correlations.values())

plt.figure(figsize=(10, 8))
plt.bar(names, values)
plt.xlabel('Regular Expression Name')
plt.ylabel('Spearman Correlation with Kd')
plt.xticks(rotation=45, ha='right')
plt.title('Correlation of Regex Hits with Kd Values')
plt.tight_layout()

# Save the plot as a PNG file
plt.savefig('regex_correlations.png')
plt.show()


# Features and target variable
X = df[xf]
y = df['Low_Kd']

# Splitting the dataset into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Initialize and train the model
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

# Predict on the test set
y_pred = model.predict(X_test)

# Evaluate the model
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy}")
print(classification_report(y_test, y_pred))

X_test['predicted_Is_Low_Kd'] = y_pred
X_test['actual_Is_Low_Kd'] = y_test.reset_index(drop=True)
X_test['Kd'] = df.loc[X_test.index, 'Kd']

results_file_path = 'model_predictions_with_features.csv'  # Specify your desired file path
X_test.to_csv(results_file_path, index=False)

top_hits = X_test[(X_test['predicted_Is_Low_Kd'] == 1) & (X_test['actual_Is_Low_Kd'] == 1)]

top_hits['Total_Repeats'] = top_hits.drop(['predicted_Is_Low_Kd', 'actual_Is_Low_Kd', 'Kd'], axis=1).sum(axis=1)

plt.figure(figsize=(10, 6))
sns.scatterplot(data=top_hits, x='Total_Repeats', y='Kd')
plt.title('Correlation between Total Repeat Sequences and Kd Values for Top Hits')
plt.xlabel('Total Number of Repeat Sequences')
plt.ylabel('Kd Value')
plt.grid(True)
plt.savefig('correlation_total_repeats_vs_Kd.png')
plt.show()


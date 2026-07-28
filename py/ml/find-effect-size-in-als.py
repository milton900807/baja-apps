import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

# Load dataset (update file path if necessary)
data = pd.read_excel("/mnt/c/Users/JeffMilton/Documents/als-genes1.xlsx")

# Extract relevant columns
gene_names = data['gene_name']
lfc_columns = [col for col in data.columns if 'lfc' in col]
padj_columns = [col for col in data.columns if 'padj' in col]
direction_columns = [col for col in data.columns if 'direction' in col]

# Handle missing values
data.fillna(0, inplace=True)

# Convert p-values to binary significance matrix
alpha = 0.05  # Significance threshold
significance_matrix = (data[padj_columns] < alpha).astype(int)

# Function to determine predominant effect direction
def determine_direction(row):
    up_count = (row == 'up').sum()
    down_count = (row == 'down').sum()
    return 'up' if up_count > down_count else 'down' if down_count > up_count else 'mixed/non-significant'

# Add predominant effect direction to dataset
data_filtered = data.copy()
data_filtered['effect_direction'] = data_filtered[direction_columns].apply(determine_direction, axis=1)

# Filter for statistically significant genes
data_filtered = data_filtered[(data[padj_columns] < alpha).any(axis=1)]

# Function to retain only significant LFC values in predominant direction
def filter_significant_lfc(row):
    predominant_direction = row['effect_direction']
    return [abs(row[lfc_col]) if row[padj_col] < alpha and row[dir_col] == predominant_direction else 0 
            for lfc_col, padj_col, dir_col in zip(lfc_columns, padj_columns, direction_columns)]

filtered_lfc_values = data_filtered.apply(filter_significant_lfc, axis=1, result_type='expand')
data_filtered[lfc_columns] = filtered_lfc_values

# Compute aggregate effect size
data_filtered['effect_size'] = data_filtered[lfc_columns].sum(axis=1)

# Prepare features and target variable
X = StandardScaler().fit_transform(data_filtered[lfc_columns])  # Normalize LFC values
y = data_filtered['effect_size']  # Target variable

# Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train RandomForest model
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Evaluate model performance
y_pred = model.predict(X_test)
mae = mean_absolute_error(y_test, y_pred)
print(f"Mean Absolute Error: {mae}")

# Feature importance analysis
feature_importances = pd.DataFrame({
    'LFC_Feature': lfc_columns,
    'Importance': model.feature_importances_
})

# Map LFC features to gene names
gene_mapping = dict(zip(lfc_columns, data['gene_name']))
feature_importances['Gene'] = feature_importances['LFC_Feature'].map(gene_mapping)

# Aggregate importance scores by gene
gene_importances = feature_importances.groupby('Gene')['Importance'].sum().reset_index()

# Merge with effect direction
gene_importances = gene_importances.merge(data_filtered[['gene_name', 'effect_direction']], 
                                          left_on='Gene', right_on='gene_name', how='left')

# Get top 10 influential genes
top_genes = gene_importances.sort_values(by='Importance', ascending=False).head(10)

# Display results
print("\n### Results Explanation ###")
print("Identified top 10 genes with the highest effect size across mutations.")
print("Effect size is derived from statistically significant LFCs in the predominant direction.")
print("Random Forest determines gene importance in effect size variation.")
print("Top ranked genes along with their effect direction:")
print(top_genes[['gene_name', 'Importance', 'effect_direction']])

# Export results including Gene Ontology annotations (to be added separately)
top_genes[['gene_name', 'Importance', 'effect_direction']].to_excel("top_genes.xlsx", index=False)

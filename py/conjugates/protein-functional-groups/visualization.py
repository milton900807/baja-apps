import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report
import matplotlib.pyplot as plt
import json
import ast


# Load the dataset
file_path = './bt-protein.csv'
data = pd.read_csv(file_path)

# Drop duplicates based on protein_info
data_unique_protein = data.drop_duplicates(subset=['protein_info'])

# Categorize Kd into classes (Low, Medium, High)
# Adjust thresholds as appropriate
bins = [0, 1e3, 1e6, float('inf')]  # Example thresholds
labels = ['Low', 'Medium', 'High']
data_unique_protein['Kd_class'] = pd.cut(data_unique_protein['Kd'], bins=bins, labels=labels)

# Ensure no missing categories
data_unique_protein.dropna(subset=['Kd_class'], inplace=True)
# Prepare features and labels
X = data_unique_protein['protein_info'].astype(str)
y = data_unique_protein['Kd_class']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Define a pipeline for vectorization and classification
pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(max_features=5000)),
    ('classifier', RandomForestClassifier(random_state=42))
])

# Train the classifier
pipeline.fit(X_train, y_train)

# Predict and evaluate
y_pred = pipeline.predict(X_test)
print(classification_report(y_test, y_pred))

# Load the dataset
# file_path = '/mnt/data/bt-protein.csv'
data = pd.read_csv(file_path)

# Define a function to safely parse JSON
def parse_json_or_return_empty_list(input_string):
    try:
        #  return input_string
         formatted_string = f"{input_string}"
         result = ast.literal_eval(formatted_string)
         return result
    except (ValueError, TypeError):
        print ( ' error ', input_string)
        return []

# Convert the 'protein_info' column from JSON string to list
data['protein_info'] = data['protein_info'].apply(parse_json_or_return_empty_list)

# Expand the list of features in 'protein_info' into separate rows
rows = []
_ = data.apply(lambda row: [rows.append([row['Kd'], feature]) 
                             for feature in row.protein_info], axis=1)
expanded_data = pd.DataFrame(rows, columns=['Kd', 'Feature'])
aggregated_data = expanded_data.groupby('Feature').agg({'Kd': 'mean'}).reset_index()
# Assuming expanded_data is prepared as before, including duplicates handling and feature extraction

# Recalculate aggregated_data to include mean Kd and standard deviation
aggregated_data_stats = expanded_data.groupby('Feature').agg(Mean_Kd=('Kd', 'mean'), Std_Kd=('Kd', 'std')).reset_index()

# Sort the aggregated data by Mean_Kd in ascending order for plotting
aggregated_data_sorted_stats = aggregated_data_stats.sort_values(by='Mean_Kd', ascending=True)


# plt.figure(figsize=(12, 8))
aggregated_data_sorted = aggregated_data_sorted_stats #aggregated_data.sort_values(by='Kd', ascending=True)




plt.figure(figsize=(160, 10))  # Adjusted figure size for a wide plot

# Plotting with error bars
plt.errorbar(aggregated_data_sorted_stats['Feature'], aggregated_data_sorted_stats['Mean_Kd'], 
             yerr=aggregated_data_sorted_stats['Std_Kd'], fmt='o', ecolor='r', capthick=2, capsize=5, linestyle='None', marker='s', markersize=5)

plt.xlabel('Feature', fontsize=14)
plt.ylabel('Mean Kd with Standard Deviation', fontsize=14)
plt.title('Mean Kd Values and Standard Deviation for Various Protein Features', fontsize=16)

# Rotate the labels for readability
plt.xticks(rotation=90, fontsize=10, ha="right")
plt.tight_layout()

# Adjusted aggregation to include count of observations
# Adjusted aggregation to include count of observations
# Adjusted aggregation to include count of observations
# Adjusted aggregation to include count of observations
# Adjusted aggregation to include count of observations
# Adjusted aggregation to include count of observations
aggregated_data_stats_n = expanded_data.groupby('Feature').agg(Mean_Kd=('Kd', 'mean'), 
                                                               Std_Kd=('Kd', 'std'), 
                                                               N=('Kd', 'count')).reset_index()

# Sort by Mean_Kd in ascending order for plotting
aggregated_data_sorted_stats_n = aggregated_data_stats_n.sort_values(by='Mean_Kd', ascending=True)

# Plotting with error bars and number of observations
fig, ax1 = plt.subplots(figsize=(160, 10))

# Mean Kd and standard deviation
error = ax1.errorbar(aggregated_data_sorted_stats_n['Feature'], aggregated_data_sorted_stats_n['Mean_Kd'], 
                     yerr=aggregated_data_sorted_stats_n['Std_Kd'], fmt='o', ecolor='r', capthick=2, 
                     capsize=5, linestyle='None', marker='s', markersize=5, label='Mean Kd ± Std Dev')

ax1.set_xlabel('Feature', fontsize=14)
ax1.set_ylabel('Mean Kd', fontsize=14)
ax1.tick_params(axis='x', rotation=90)

# Secondary axis for number of observations
ax2 = ax1.twinx()
ax2.plot(aggregated_data_sorted_stats_n['Feature'], aggregated_data_sorted_stats_n['N'], color='g', label='N (Count)')
ax2.set_ylabel('N (Count)', fontsize=14)

# Title and layout adjustments
plt.title('Mean Kd Values, Standard Deviation, and Count of Observations for Various Protein Features', fontsize=16)
fig.tight_layout()

# Legend
lines, labels = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax2.legend(lines + lines2, labels + labels2, loc='upper left')

# Save the plot with mean, error bars, and count of observations
output_file_path_with_n = './mean_kd_values_by_feature_sorted_with_std_and_n_6000px.png'
plt.savefig(output_file_path_with_n, dpi=100)  # dpi=100 for 6000 pixels width
plt.close()

output_file_path_with_n

import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Assuming expanded_data is prepared as before

# Calculate median Kd for each feature for plotting
median_data = expanded_data.groupby('Feature')['Kd'].median().reset_index()
# Adjusted aggregation to include standard deviation calculation
aggregated_data_std = expanded_data.groupby('Feature').agg(Median_Kd=('Kd', 'median'), 
                                                           Std_Kd=('Kd', 'std'), 
                                                           N=('Kd', 'count')).reset_index()
aggregated_data_sorted_by_std = aggregated_data_std.sort_values(by='Std_Kd', ascending=True)

# Sorting median_data by Median Kd values in ascending order (optional for visualization purposes)
median_data_sorted = median_data.sort_values(by='Kd', ascending=True)
# aggregated_data_sorted_stats = aggregated_data_stats.sort_values(by='Mean_Kd', ascending=True)

# Plotting
fig, ax = plt.subplots(figsize=(260, 10))

# Scatter plot for each point
for feature, group in expanded_data.groupby('Feature'):
    ax.scatter([feature] * len(group), group['Kd'], alpha=0.6)

# Plot median values
ax.scatter(median_data_sorted['Feature'], median_data_sorted['Kd'], color='red', label='Median', s=100, edgecolor='black')
# ax.scatter(aggregated_data_sorted_by_std['Feature'], median_data_sorted['Kd'], color='red', label='Median', s=100, edgecolor='black')

ax.set_xlabel('Feature', fontsize=14)
ax.set_ylabel('Kd Values', fontsize=14)
ax.set_title('Distribution of Kd Values and Median for Various Protein Features', fontsize=16)
ax.tick_params(axis='x', labelrotation=90)

# Legend
ax.legend()

# Adjust layout
plt.tight_layout()

# Define the output file path for the plot with all points and median
output_file_path_all_points_median = './kd_values_all_points_and_median.png'

# Saving the plot
plt.savefig(output_file_path_all_points_median, dpi=100)  # dpi=100 for 6000 pixels width
plt.close()

output_file_path_all_points_median


# Adjusted aggregation to include standard deviation calculation
aggregated_data_std = expanded_data.groupby('Feature').agg(Median_Kd=('Kd', 'median'), 
                                                           Std_Kd=('Kd', 'std'), 
                                                           N=('Kd', 'count')).reset_index()

# Sort by Std_Kd in ascending order for visualization
aggregated_data_sorted_by_std = aggregated_data_std.sort_values(by='Std_Kd', ascending=True)

# Plotting
fig, ax = plt.subplots(figsize=(260, 10))

# Scatter plot for each point, using sorted order by standard deviation
for feature in aggregated_data_sorted_by_std['Feature']:
    feature_data = expanded_data[expanded_data['Feature'] == feature]
    ax.scatter([feature] * len(feature_data), feature_data['Kd'], alpha=0.6)

# Plot median values on top of the scatter plot
for index, row in aggregated_data_sorted_by_std.iterrows():
    ax.scatter(row['Feature'], row['Median_Kd'], color='red', label='Median' if index == 0 else "", s=100, edgecolor='black')

ax.set_xlabel('Feature', fontsize=14)
ax.set_ylabel('Kd Values', fontsize=14)
ax.set_title('Distribution of Kd Values and Median for Various Protein Features, Sorted by Std Dev', fontsize=16)
ax.tick_params(axis='x', labelrotation=90)

# To avoid repeating legend entries
handles, labels = ax.get_legend_handles_labels()
by_label = dict(zip(labels, handles))
ax.legend(by_label.values(), by_label.keys())

plt.tight_layout()

# Define the output file path for the plot with sorting by standard deviation
output_file_path_sorted_by_std = './lskd_values_sorted_by_std.png'

# Saving the plot
plt.savefig(output_file_path_sorted_by_std, dpi=100)  # dpi=100 for 6000 pixels width
plt.close()

output_file_path_sorted_by_std




# plt.figure(figsize=(160, 10))  # Width of 60 inches, height of 10 inches

# plt.bar(aggregated_data_sorted['Feature'], aggregated_data_sorted['Kd'])
# plt.xlabel('Feature')
# plt.ylabel('Mean Kd')
# plt.xticks(rotation=45, ha="right")
# plt.title('Mean Kd Values for Various Protein Features')
# label_rotation = 90 if len(aggregated_data_sorted['Feature']) > 10 else 45

# plt.xticks(rotation=label_rotation, fontsize=12, ha="right")  # Adjust fontsize as needed
# plt.tight_layout()

# Save the plot to a PNG file
output_file_path = './mean_kd_values_by_feature.png'
plt.savefig(output_file_path)
plt.close()

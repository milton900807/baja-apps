import pandas as pd

# Load your dataset
file_path = 'bt-protein.csv'
data = pd.read_csv(file_path)

# Assuming the features in the 'protein_info' column are separated by a delimiter, e.g., a comma
delimiter = ','  # Change this based on your actual data format

# Initialize a set to store distinct features
distinct_features = set()

# Loop through each row to extract features
for index, row in data.iterrows():
    # Split the string into a list of features
    features = row['protein_info'].split(delimiter)
    # Update the set with new features from this row
    distinct_features.update(features)


# Convert the set to a list and sort it
sorted_features = sorted(list(distinct_features))

# Write the sorted list of features to a file
output_file_path = 'distinct_features.txt'
with open(output_file_path, 'w') as file:
    for feature in sorted_features:
        feature = feature.replace('[', '')
        feature = feature.replace(']', '')
        file.write(f"{feature},\n")

print(f"Distinct features have been written to {output_file_path}")

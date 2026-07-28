import pandas as pd

# Load the Excel file
file_path = './ppsets.xlsx'  # Update this to the path of your Excel file
df = pd.read_excel(file_path)
grouped = df.groupby(['forward_sequence', 'probe_sequence', 'reverse_sequence'])
df['new_id'] = grouped.ngroup() + 1  # ngroup() gives a unique integer to each group, starting from 0
output_path = 'ppsets2.xlsx'  # Update this to your desired output path
df.to_excel(output_path, index=False)

print("File has been processed and saved with new unique sequence-based IDs.")

import pandas as pd
import matplotlib.pyplot as plt
from rdkit.Chem.Descriptors import MolWt
from rdkit import Chem

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

df = pd.read_csv('./bt-group.csv')  

# Group by 'Target' and 'SMILES', filter groups
filtered_groups = df.groupby(['Unigene', 'SMILES']).filter(lambda x: len(x) > 4)

# Calculate median and std for the filtered groups
aggregated_data = filtered_groups.groupby(['Unigene'])['Kd'].agg(['median', 'std']).reset_index()
aggregated_data_sorted = aggregated_data.sort_values(by='std', ascending=True)

# Plotting
plt.figure(figsize=(10, 8))

for _, row in aggregated_data_sorted.iterrows():
    plt.errorbar(f"{row['Unigene']}", row['median'], yerr=row['std'], fmt='o', capsize=5, markersize=10, label=f"{row['Unigene']}")

plt.xlabel('Unigene')
plt.ylabel('Kd (Median ± STD)')
plt.title('Median Kd and STD for Target-SMILES Groups')
plt.xticks(rotation=45)
plt.tight_layout()

# Save the plot to a PNG file
plt.savefig('./target_smiles_median_std.png')
plt.close()

print("Plot saved to '/mnt/data/target_smiles_median_std.png'")

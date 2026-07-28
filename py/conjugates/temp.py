import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Simulating data

df = pd.read_csv('./bt-chem.csv')


print
# Calculate the equation's value for each row
# equation_value = 0.192 + (df['acidic_in_acidic_conditions'] * df['DUF2631'] * 0.026) + (df['CalcKappa1'] * df['DUF2631'] * 0.162) + (df['basic_in_acidic_conditions'] * df['DUF2631'] * 0.171) + (df['Hydrophobicity'] * df['DUF2631'] * -0.023) + (df['CalcKappa2'] * df['DUF2631'] * -0.309) + (df['Molecular_Weight'] * df['DUF2631'] * -0.003) + (df['TPSA'] * df['DUF2631'] * -0.002) + (df['hydrophobic_in_acidic_conditions'] * df['DUF2631'] * -0.120) + (df['CalcKappa3'] * df['DUF2631'] * 0.170)


# Define the coefficients and variables involved in the interactions
coefficients_variables = {
    'acidic_in_acidic_conditions': 0.026,
    'CalcKappa1': 0.162,
    'basic_in_acidic_conditions': 0.171,
    'Hydrophobicity': -0.023,
    'CalcKappa2': -0.309,
    'Molecular_Weight': -0.003,
    'TPSA': -0.002,
    'hydrophobic_in_acidic_conditions': -0.120,
    'CalcKappa3': 0.170,
}

# Initial constant term in the equation
constant = 0.192

# Compute the equation value for each row
df['EquationValue'] = constant + sum(df[var] * df['DUF2631'] * coef for var, coef in coefficients_variables.items())

print(df['EquationValue'])
# Printing all values for each variable
print("Values for each variable in the DataFrame:")
variables_in_equation = [
    'acidic_in_acidic_conditions',
    'CalcKappa1',
    'basic_in_acidic_conditions',
    'Hydrophobicity',
    'CalcKappa2',
    'Molecular_Weight',
    'TPSA',
    'hydrophobic_in_acidic_conditions',
    'CalcKappa3',
    'DUF2631'
]

# print("Values for each specified variable in the DataFrame:")
# for variable in variables_in_equation:
#     # Ensure the variable is actually in the DataFrame before trying to print its values
#     if variable in df.columns:
#         print(f"{variable}:")
#         print(df[variable].to_string(index=False))  # Print values without the index
#         print()  # Newline for readability
#     else:
#         print(f"Variable '{variable}' not found in the DataFrame.")
#         print()### Step 4: Plot the Results

# For visualization, we might plot the equation value against one of the variables or simply visualize the distribution of calculated values
# Here, we'll plot the distribution of equation values
plt.figure(figsize=(10, 6))
plt.hist(df['EquationValue'], bins=20, color='skyblue', edgecolor='black')
plt.title('Distribution of Calculated Equation Values')
plt.xlabel('Equation Value')
plt.ylabel('Frequency')
plt.savefig(f"./output/temp.png")
plt.show()

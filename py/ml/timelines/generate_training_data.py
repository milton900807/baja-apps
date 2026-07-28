import os
import pandas as pd
import numpy as np
import random

# === Setup output folder ===
os.makedirs("sample_tables", exist_ok=True)

YEARS = [str(year) for year in range(2000, 2030)]

METRICS = ["Metric A", "Metric B", "Profit", "Revenue", "EBITDA", "Cost", "Growth"]

def random_metric_name():
    return random.choice(METRICS)

# === Table Generators ===
def generate_column_table():
    n_metrics = random.randint(2, 5)
    n_years = random.randint(3, 10)
    years = random.sample(YEARS, n_years)
    metrics = [random_metric_name() for _ in range(n_metrics)]
    data = {year: [random.randint(100, 10000) for _ in range(n_metrics)] for year in years}
    df = pd.DataFrame(data, index=metrics)
    if random.random() < 0.3:
        df["Total"] = df.sum(axis=1)
    return df

def generate_row_table():
    n_metrics = random.randint(2, 5)
    n_years = random.randint(3, 10)
    years = random.sample(YEARS, n_years)
    metrics = [random_metric_name() for _ in range(n_metrics)]
    data = {metric: [random.randint(100, 10000) for _ in range(n_years)] for metric in metrics}
    df = pd.DataFrame(data, index=years)
    if random.random() < 0.3:
        df["Total"] = df.sum(axis=1)
    return df

# === Detection Helpers ===
def is_year(val):
    try:
        year = int(val)
        return 1900 <= year <= 2100
    except:
        return False

def is_time_series(values):
    if len(values) == 0:
        return False
    year_like = [is_year(v) for v in values]
    return sum(year_like) / len(values) >= 0.6

def detect_time_orientation(df):
    if is_time_series(df.columns):
        return "time_in_columns"
    elif is_time_series(df.index):
        return "time_in_rows"
    else:
        return "unknown"

# === Generate and Analyze Tables ===
results = []

for i in range(1000):
    if i % 2 == 0:
        df = generate_column_table()
        filename = f"sample_tables/table{i:04d}_columns.tsv"
    else:
        df = generate_row_table()
        filename = f"sample_tables/table{i:04d}_rows.tsv"
    
    df.to_csv(filename, sep='\t')
    
    # Detect orientation
    try:
        df_check = pd.read_csv(filename, sep='\t', index_col=0)
        orientation = detect_time_orientation(df_check)
    except Exception as e:
        orientation = f"error: {e}"
    
    results.append({"filename": filename, "orientation": orientation})

# === Save Detection Report ===
results_df = pd.DataFrame(results)
results_df.to_csv("table_orientations.csv", index=False)

print("✅ 1000 sample tables generated in 'sample_tables/'")
print("📄 Orientation report saved to 'table_orientations.csv'")

import pandas as pd
from sklearn.linear_model import LinearRegression
import matplotlib.pyplot as plt

def load_data(file_path):
    """Load the Excel file and extract necessary columns."""
    df = pd.read_excel(file_path)
    return df[['ct', 'amplicon_sequence']]

def prepare_data(df):
    """Prepare the data for regression by calculating amplicon sequence length and filtering outliers."""
    df['amplicon_length'] = df['amplicon_sequence'].apply(len)
    # Filter out sequences longer than 10,000 bases
    filtered_df = df[df['amplicon_length'] <= 1000]
    return filtered_df[['ct', 'amplicon_length']]

def perform_regression(X, y):
    """Perform linear regression and return the model."""
    model = LinearRegression()
    model.fit(X, y)
    return model

def plot_regression(X, y, model):
    """Plot the regression line and data points."""
    plt.scatter(X, y, color='blue', label='Data Points')
    plt.plot(X, model.predict(X), color='red', linewidth=2, label='Regression Line')
    plt.title('Linear Regression: Ct Value vs Amplicon Length')
    plt.xlabel('Amplicon Length')
    plt.ylabel('Ct Value')
    plt.legend()
    plt.savefig ('PLOT.PNg')
    plt.show()

def main(file_path):
    # Load and prepare data
    df = load_data(file_path)
    print ( ' loading the data ')
    df_prepared = prepare_data(df)
    
    # Extracting features and target for regression
    X = df_prepared[['amplicon_length']]  # Features (independent variable)
    y = df_prepared['ct']                 # Target (dependent variable)
    
    # Perform regression
    model = perform_regression(X, y)
    
    # Print coefficients
    print(f"Coefficient: {model.coef_[0]}, Intercept: {model.intercept_}")
    
    # Plot results
    plot_regression(X, y, model)

# Example usage
main("./updated_data_with_amplicon_sequences.xlsx")

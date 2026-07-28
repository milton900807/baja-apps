import joblib

# Load model and vectorizer
model = joblib.load("./py/memphis/model.joblib")
vectorizer = joblib.load("./py/memphis/vectorizer.joblib")

def predict_formula(expression):
    """Predict the symbolic formula from a natural language date expression."""
    X_input = vectorizer.transform([expression])
    return model.predict(X_input)[0]

# Example
user_input = input("Enter a natural date expression: ")
print("Predicted formula:", predict_formula(user_input))
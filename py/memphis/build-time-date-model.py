import pandas as pd
import numpy as np
import logging
from tqdm import tqdm
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from joblib import dump
from datetime import datetime

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
import logging
import pandas as pd
import numpy as np

def load_data(file_path):
    logging.info("Loading dataset from %s...", file_path)
    
    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        logging.error("Failed to read CSV: %s", e)
        raise
    
    required_columns = {"phrase", "datetime_iso"}
    if not required_columns.issubset(df.columns):
        missing = required_columns - set(df.columns)
        raise ValueError(f"Missing required columns: {missing}")
    
    df.dropna(subset=["phrase", "datetime_iso"], inplace=True)
    
    try:
        df['timestamp'] = pd.to_datetime(df['datetime_iso'], format='ISO8601', errors='raise') \
                             .astype(np.int64) // 10**9  # Convert to UNIX timestamp
    except Exception as e:
        logging.error("Datetime parsing failed: %s", e)
        raise
    
    return df


def preprocess(df):
    logging.info("Splitting dataset...")
    X_train, X_test, y_train, y_test = train_test_split(
        df['phrase'], df['timestamp'], test_size=0.2, random_state=42
    )

    logging.info("Vectorizing phrases with TF-IDF...")
    vectorizer = TfidfVectorizer(ngram_range=(1, 3), max_features=5000)
    X_train_tfidf = vectorizer.fit_transform(tqdm(X_train, desc="Vectorizing train"))
    X_test_tfidf = vectorizer.transform(tqdm(X_test, desc="Vectorizing test"))

    return X_train_tfidf, X_test_tfidf, y_train, y_test, vectorizer

def train_model(X_train, y_train):
    logging.info("Training RandomForest model...")
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1, verbose=1)
    model.fit(X_train, y_train)
    return model

def evaluate_model(model, X_test, y_test):
    logging.info("Evaluating model...")
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    logging.info(f"Mean Absolute Error (seconds): {mae:.2f}")
    logging.info(f"R² Score: {r2:.4f}")
    return mae, r2

def save_model(model, vectorizer):
    logging.info("Saving model and vectorizer...")
    dump(model, "datetime_model.joblib")
    dump(vectorizer, "tfidf_vectorizer.joblib")
    logging.info("Model saved as 'datetime_model.joblib' and vectorizer as 'tfidf_vectorizer.joblib'.")

def main():
    file_path = "huge_datetime_phrases_dataset.csv"
    df = load_data(file_path)
    X_train, X_test, y_train, y_test, vectorizer = preprocess(df)
    model = train_model(X_train, y_train)
    evaluate_model(model, X_test, y_test)
    save_model(model, vectorizer)

if __name__ == "__main__":
    main()

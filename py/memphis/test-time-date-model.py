import pandas as pd
from datetime import datetime
from joblib import load
import argparse
import os

# Load model and vectorizer
model = load("datetime_model.joblib")
vectorizer = load("tfidf_vectorizer.joblib")

def predict_phrase(phrase):
    vec = vectorizer.transform([phrase])
    ts = model.predict(vec)[0]
    return datetime.fromtimestamp(ts)

def test_single_phrase():
    print("Type a phrase like 'next Friday at 3 PM' (or type 'exit' to quit):")
    while True:
        phrase = input("> ")
        if phrase.lower() in ["exit", "quit"]:
            break
        dt = predict_phrase(phrase)
        print(f"Predicted datetime: {dt} ({dt.isoformat()})\n")

def test_batch(csv_path):
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return

    df = pd.read_csv(csv_path)
    if "phrase" not in df.columns:
        print("CSV must contain a column named 'phrase'")
        return

    print("Predicting datetimes...")
    df['predicted_datetime'] = df['phrase'].apply(lambda x: predict_phrase(x).isoformat())

    # Optional evaluation
    if "datetime_iso" in df.columns:
        df['actual_ts'] = pd.to_datetime(df['datetime_iso']).astype(int) // 10**9
        df['predicted_ts'] = df['predicted_datetime'].apply(lambda x: datetime.fromisoformat(x).timestamp())
        df['abs_error_sec'] = (df['actual_ts'] - df['predicted_ts']).abs()
        mae = df['abs_error_sec'].mean()
        print(f"\nMean Absolute Error (seconds): {mae:.2f}")

    out_path = "predictions_output.csv"
    df.to_csv(out_path, index=False)
    print(f"Predictions saved to: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=str, help="Path to CSV file with phrases")
    args = parser.parse_args()

    if args.file:
        test_batch(args.file)
    else:
        test_single_phrase()

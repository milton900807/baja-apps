import pandas as pd
import joblib
import time
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import psutil
print(f"Total RAM: {psutil.virtual_memory().total / 1e9:.2f} GB")

# Helper: resolve formula to date
def resolve_formula(formula: str, reference_date: datetime = None) -> str:
    if reference_date is None:
        reference_date = datetime.today()
    try:
        result = eval(formula, {"D": reference_date, "timedelta": timedelta, "relativedelta": relativedelta})
        return result.strftime("%Y-%m-%d %H:%M")
    except Exception as e:
        return f"[ERROR] {e}"

# Test expressions to show during progress feedback
test_expressions = [
    "remind me on in 3 days at 9am",
    "schedule for 2 weeks from now",
    "prepare by in 1 month",
    "deadline is 7 days later at 3pm",
    "targeting in 4 weeks",
    "make this milestone for 6 months from now"
]

# Load dataset
df = pd.read_csv("relative_date_with_time_training_set.csv")
df.dropna(subset=["expression", "formula"], inplace=True)
df = df[df["formula"].map(df["formula"].value_counts()) > 1]

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    df["expression"], df["formula"], test_size=0.2, random_state=42, stratify=df["formula"]
)

# Vectorize
vectorizer = TfidfVectorizer(ngram_range=(1, 3), lowercase=True)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

# Initialize model
classifier = LogisticRegression(max_iter=1, warm_start=True, solver="lbfgs", multi_class="multinomial")

# Train with feedback loop
print("[INFO] Training model with minute-by-minute feedback...")
start_time = last_log = time.time()
total_iters = 100

for i in range(1, total_iters + 1):
    classifier.fit(X_train_vec, y_train)

    if time.time() - last_log > 60 or i == total_iters:
        elapsed = int(time.time() - start_time)
        print(f"\n[PROGRESS] Iteration {i}/{total_iters} - Elapsed: {elapsed // 60}m {elapsed % 60}s")
        print("[TEST CASES]")
        for expr in test_expressions:
            vec = vectorizer.transform([expr])
            formula = classifier.predict(vec)[0]
            resolved_date = resolve_formula(formula)
            print(f"  {expr:50} → {formula:45} → {resolved_date}")
        print("-" * 80)
        last_log = time.time()

# Final evaluation
y_pred = classifier.predict(X_test_vec)
print("\n[INFO] Final Evaluation Results:")
print(classification_report(y_test, y_pred))
print(f"Accuracy: {accuracy_score(y_test, y_pred):.3f}")

# Save
joblib.dump(classifier, "model.joblib")
joblib.dump(vectorizer, "vectorizer.joblib")
print("[INFO] Model and vectorizer saved.")

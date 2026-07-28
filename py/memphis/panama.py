import re
import joblib
import pandas as pd
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from rapidfuzz import process
# from ion import works

# user_input = works.param(1)

# Load model & vectorizer
print("[INFO] Loading model and vectorizer...")
model = joblib.load("../ljlapps/py/memphis/model.joblib")
vectorizer = joblib.load("../ljlapps/py/memphis/vectorizer.joblib")
known_expressions = vectorizer.get_feature_names_out()
print("[INFO] Loaded successfully.")
# print(f"[DEBUG] Model is loaded: {user_input}")

# ⬇️ Load training set from CSV
try:
    training_df = pd.read_csv("relative_date_with_time_training_set.csv")
    print(f"[INFO] Training dataset loaded with {len(training_df)} rows")
except Exception as e:
    print(f"[WARNING] Could not load training data: {e}")
    training_df = None

# Synonym normalization
synonym_map = {
    "one week from now": "in one week",
    "couple of days": "two days",
    "tommorow": "tomorrow",
    "next thursday": "next Thursday",
    "in a week": "in one week",
    "3 months from now": "in three months",
    "a week from now": "in one week"
}

def normalize_expression(expression):
    expr = expression.lower().strip()
    context_phrases = [
        "make this milestone for",
        "schedule for",
        "set a reminder for",
        "remind me on",
        "plan for",
        "prepare by",
        "deadline is",
        "targeting",
        "due on"
    ]
    for phrase in context_phrases:
        if phrase in expr:
            expr = expr.replace(phrase, "").strip()
    for k, v in synonym_map.items():
        if k in expr:
            expr = expr.replace(k, v)
    print(f"[DEBUG] Normalized expression: {expr}")
    return expr

def resolve_formula_to_date(formula: str, reference_date: datetime = None) -> str:
    if reference_date is None:
        reference_date = datetime.today()
    print(f"[DEBUG] Resolving formula: {formula}")
    try:
        result = eval(formula, {"D": reference_date, "timedelta": timedelta, "relativedelta": relativedelta})
        return result.strftime("%Y-%m-%d")
    except Exception as e:
        return f"[ERROR] {str(e)}"

def resolve_expression_to_date(expression: str, reference_date: datetime = None) -> str:
    if reference_date is None:
        reference_date = datetime.today()
    print(f"[INFO] Resolving expression: '{expression}'")
    expr = normalize_expression(expression)

    numeric_match = re.search(r"\b(\d+)\s+(days?|weeks?|months?)\b", expr)
    if numeric_match:
        value, unit = int(numeric_match.group(1)), numeric_match.group(2)
        print(f"[DEBUG] Rule-based match: {value} {unit}")
        if "day" in unit:
            return (reference_date + timedelta(days=value)).strftime("%Y-%m-%d")
        elif "week" in unit:
            return (reference_date + timedelta(weeks=value)).strftime("%Y-%m-%d")
        elif "month" in unit:
            return (reference_date + relativedelta(months=value)).strftime("%Y-%m-%d")

    # ML-based prediction
    X_input = vectorizer.transform([expr])
    formula = model.predict(X_input)[0]
    print(f"[DEBUG] Predicted formula: {formula}")
    return resolve_formula_to_date(formula, reference_date)

# Main execution

# result = resolve_expression_to_date(user_input)
# print(f"{user_input:50} → {result}")
# print("-" * 60)
# works.resolve({"start_date": result})

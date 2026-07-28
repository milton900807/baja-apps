import joblib
import re
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# Load model and vectorizer
print("[INFO] Loading model and vectorizer...")
model = joblib.load("model.joblib")
vectorizer = joblib.load("vectorizer.joblib")
known_expressions = vectorizer.get_feature_names_out()
print("[INFO] Loaded successfully.")

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

    X_input = vectorizer.transform([expr])
    formula = model.predict(X_input)[0]
    print(f"[DEBUG] Predicted formula: {formula}")
    return resolve_formula_to_date(formula, reference_date)

# Sample test expressions
test_inputs = [
    "tomorrow",
    "in one week",
    "make this milestone for next Thursday",
    "remind me on two days from now",
    "set a reminder for three months from now",
    "plan for this Friday",
    "deadline is in four days",
    "prepare by next Monday",
    "due on the day after tomorrow",
    "targeting next Saturday"
]

print("\n[RESULTS]")
print("-" * 60)
today = datetime.today().strftime("%Y-%m-%d")
for expr in test_inputs:
    result = resolve_expression_to_date(expr)
    print(f"{expr:50} → {result}")
print("-" * 60)
print(f"Reference date used: {today}")

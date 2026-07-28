import random
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import pandas as pd

# Base counts
days = list(range(1, 31))
weeks = list(range(1, 5))
months = list(range(1, 13))
time_phrases = {
    # Standard clock times
    "at 1am": (1, 0), "at 2am": (2, 0), "at 3am": (3, 0), "at 4am": (4, 0),
    "at 5am": (5, 0), "at 6am": (6, 0), "at 7am": (7, 0), "at 8am": (8, 0),
    "at 9am": (9, 0), "at 10am": (10, 0), "at 11am": (11, 0), "at 12pm": (12, 0),
    "at 1pm": (13, 0), "at 2pm": (14, 0), "at 3pm": (15, 0), "at 4pm": (16, 0),
    "at 5pm": (17, 0), "at 6pm": (18, 0), "at 7pm": (19, 0), "at 8pm": (20, 0),
    "at 9pm": (21, 0), "at 10pm": (22, 0), "at 11pm": (23, 0), "at 12am": (0, 0),

    # Minutes included
    "at 6:30am": (6, 30), "at 8:45am": (8, 45), "at 1:15pm": (13, 15),
    "at 3:30pm": (15, 30), "at 4:45pm": (16, 45), "at 7:10pm": (19, 10),
    "at 11:59pm": (23, 59), "at 00:00": (0, 0), "at 23:59": (23, 59),

    # Human-friendly ranges
    "early morning": (6, 0), "mid-morning": (9, 30), "late morning": (11, 0),
    "noon": (12, 0), "early afternoon": (13, 30), "mid-afternoon": (15, 0),
    "late afternoon": (16, 30), "evening": (18, 0), "late evening": (21, 0),
    "midnight": (0, 0),

    # 24-hour formatted variants
    "at 08:00": (8, 0), "at 13:00": (13, 0), "at 15:45": (15, 45),
    "at 18:15": (18, 15), "at 20:30": (20, 30), "at 22:00": (22, 0)
}
day_phrases = [
    "in {n} day(s)", "in {n} number of days", "in about {n} days",
    "{n} days from now", "{n} days later", "{n} calendar days from now",
    "after {n} days", "after about {n} days", "next {n} day(s)",
    "wait {n} more days", "coming {n} days", "ahead by {n} days",
    "add {n} days", "within {n} days"
]
week_phrases = [
    "in {n} week(s)", "in {n} number of weeks", "in about {n} weeks",
    "{n} weeks from now", "{n} weeks later", "after {n} weeks",
    "after about {n} weeks", "next {n} week(s)", "wait {n} more weeks",
    "coming {n} weeks", "ahead by {n} weeks", "add {n} weeks", "within {n} weeks"
]
month_phrases = [
    "in {n} month(s)", "in {n} number of months", "in about {n} months",
    "{n} months from now", "{n} months later", "after {n} months",
    "after about {n} months", "next {n} month(s)", "wait {n} more months",
    "coming {n} months", "ahead by {n} months", "add {n} months", "within {n} months"
]



def make_expression(n, unit, phrase_templates, include_time=False):
    # Base time delta formula
    if unit == "days":
        formula = f"D + timedelta(days={n})"
    elif unit == "weeks":
        formula = f"D + timedelta(weeks={n})"
    elif unit == "months":
        formula = f"D + timedelta(months={n})"

    phrase = random.choice(phrase_templates).format(n=n)

    if include_time:
        time_text, (h, m) = random.choice(list(time_phrases.items()))
        formula += f".replace(hour={h}, minute={m})"
        phrase += f" {time_text}"
    return f"{phrase}", formula

def generate_dataset(num_samples=50000):
    data = []

    for _ in range(num_samples):
        unit_choice = random.choice(["days", "weeks", "months"])
        include_time = random.random() < 0.5  # 50% chance of time

        if unit_choice == "days":
            n = random.choice(days)
            expr, formula = make_expression(n, "days", day_phrases, include_time)
        elif unit_choice == "weeks":
            n = random.choice(weeks)
            expr, formula = make_expression(n, "weeks", week_phrases, include_time)
        elif unit_choice == "months":
            n = random.choice(months)
            expr, formula = make_expression(n, "months", month_phrases, include_time)

        data.append((expr, formula))

    return pd.DataFrame(data, columns=["expression", "formula"])

# Generate and save dataset
df = generate_dataset(1000000)
df.to_csv("relative_date_with_time_training_set.csv", index=False)
print(df.sample(10))

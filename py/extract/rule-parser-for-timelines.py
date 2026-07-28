import re
import json
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from dateutil import parser as dateutil_parser
from ion import works

# --------------------
# Helper Data
# --------------------

WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2,
    "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6
}

NUMBER_WORDS = {
    word: num for num, word in enumerate([
        "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
        "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four",
        "twenty-five", "twenty-six", "twenty-seven", "twenty-eight", "twenty-nine", "thirty",
        "thirty-one", "thirty-two", "thirty-three", "thirty-four", "thirty-five", "thirty-six",
        "thirty-seven", "thirty-eight", "thirty-nine", "forty", "forty-one", "forty-two",
        "forty-three", "forty-four", "forty-five", "forty-six", "forty-seven", "forty-eight",
        "forty-nine", "fifty", "fifty-one", "fifty-two", "fifty-three", "fifty-four", "fifty-five",
        "fifty-six", "fifty-seven", "fifty-eight", "fifty-nine", "sixty"
    ])
}

# --------------------
# Regex Patterns
# --------------------

time_expr_pattern = re.compile(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b', re.IGNORECASE)
tomorrow_pattern = re.compile(r'\btomorrow\b', re.IGNORECASE)
today_pattern = re.compile(r'\btoday\b', re.IGNORECASE)
tonight_pattern = re.compile(r'\btonight\b', re.IGNORECASE)
morning_pattern = re.compile(r'\bthis morning\b', re.IGNORECASE)
afternoon_pattern = re.compile(r'\bthis afternoon\b', re.IGNORECASE)

weekday_pattern = re.compile(r'\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', re.IGNORECASE)

weekday_with_modifier_pattern = re.compile(
    r'(?:\bthis\b|\bnext\b)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
    re.IGNORECASE
)

relative_pattern = re.compile(
    r'(?:\b(?:in|after|within)\s+)?(\d+|' + '|'.join(NUMBER_WORDS.keys()) + r')\s*'
    r'(hour|day|week|month|year|quarter)s?\b',
    re.IGNORECASE
)

# --------------------
# Main Parsing Function
# --------------------

def parse_relative_datetime(prompt: str, base_time: datetime = None):
    if base_time is None:
        base_time = datetime.now()

    original_prompt = prompt
    prompt = prompt.lower().strip()

    # Extract time expression first
    time_match = time_expr_pattern.search(prompt)
    hour = minute = None
    meridian = None
    if time_match:
        hour_str, minute_str, meridian = time_match.groups()
        hour = int(hour_str)
        minute = int(minute_str or 0)
        if meridian:
            meridian = meridian.lower()
            if meridian == "pm" and hour != 12:
                hour += 12
            elif meridian == "am" and hour == 12:
                hour = 0
        prompt = prompt[:time_match.start()] + prompt[time_match.end():]

    target_date = None
    parsed_type = None
    metadata = {}

    if today_pattern.search(prompt):
        target_date = base_time
        parsed_type = "today"
    elif tomorrow_pattern.search(prompt):
        target_date = base_time + timedelta(days=1)
        parsed_type = "tomorrow"
    elif tonight_pattern.search(prompt):
        target_date = base_time.replace(hour=20, minute=0)
        parsed_type = "tonight"
        hour = 20; minute = 0
    elif morning_pattern.search(prompt):
        target_date = base_time.replace(hour=9, minute=0)
        parsed_type = "morning"
        hour = 9; minute = 0
    elif afternoon_pattern.search(prompt):
        target_date = base_time.replace(hour=13, minute=0)
        parsed_type = "afternoon"
        hour = 13; minute = 0

    elif (mod_week_match := weekday_with_modifier_pattern.search(prompt)):
        weekday_str = mod_week_match.group(1)
        target_weekday = WEEKDAYS[weekday_str.lower()]
        today_weekday = base_time.weekday()
        days_ahead = (target_weekday - today_weekday + 7) % 7
        if days_ahead == 0:
            days_ahead = 7  # treat "this [weekday]" as next occurrence if today is same day
        target_date = base_time + timedelta(days=days_ahead)
        parsed_type = "relative_weekday"
        metadata["parsed_day"] = weekday_str

    elif (weekday_match := weekday_pattern.search(prompt)):
        weekday_str = weekday_match.group(1)
        target_weekday = WEEKDAYS[weekday_str]
        days_ahead = (target_weekday - base_time.weekday() + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        target_date = base_time + timedelta(days=days_ahead)
        parsed_type = "weekday"
        metadata["parsed_day"] = weekday_str

    elif (relative_match := relative_pattern.search(prompt)):
        amount_str, unit = relative_match.groups()
        amount_str = amount_str.lower()
        amount = int(amount_str) if amount_str.isdigit() else NUMBER_WORDS.get(amount_str, 0)

        if unit == "hour":
            delta = timedelta(hours=amount)
        elif unit == "day":
            delta = timedelta(days=amount)
        elif unit == "week":
            delta = timedelta(weeks=amount)
        elif unit == "month":
            delta = relativedelta(months=amount)
        elif unit == "year":
            delta = relativedelta(years=amount)
        elif unit == "quarter":
            delta = relativedelta(months=3 * amount)
        else:
            return {"datetime": None, "raw_prompt": original_prompt, "parsed": False, "error": "Invalid unit"}

        target_date = base_time + delta
        parsed_type = "relative"
        metadata["parsed_unit"] = unit
        metadata["parsed_amount"] = amount

    # Fallback to absolute parser only if no previous match succeeded
    if not target_date:
        try:
            parsed = dateutil_parser.parse(original_prompt, fuzzy=True, default=base_time)
            return {
                "datetime": parsed.replace(hour=hour or parsed.hour, minute=minute or parsed.minute, second=0, microsecond=0).isoformat(),
                "raw_prompt": original_prompt,
                "parsed": True,
                "parsed_type": "absolute",
                "has_time": hour is not None
            }
        except Exception:
            return {"datetime": None, "raw_prompt": original_prompt, "parsed": False, "error": "Could not determine date"}

    has_time = hour is not None
    if has_time:
        target_date = target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
    else:
        target_date = target_date.replace(hour=0, minute=0, second=0, microsecond=0)

    return {
        "datetime": target_date.isoformat(),
        "raw_prompt": original_prompt,
        "parsed": True,
        "parsed_type": parsed_type,
        "has_time": has_time,
        **metadata
    }

# --------------------
# Execution  (test)
# --------------------

doi = works.param(1)
result = parse_relative_datetime(doi)

class EnhancedJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

if result:
    works.resolve(json.loads(json.dumps(result, cls=EnhancedJSONEncoder)))

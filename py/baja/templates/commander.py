import re
from datetime import datetime, timedelta

from ion import works
sentence = works.param(1)

    return parse_imperative_sentence(sentence)



def parse_imperative_sentence(sentence):
    result = {
        "object": None,
        "date": None,
        "time": None
    }

    # Normalize and strip punctuation
    sentence = sentence.strip().rstrip(".!?")

    # Match patterns like "Report the results in 20 days"
    match = re.match(
        r'^\s*(\w+)\s+(the\s+\w+(?:\s+\w+)*?)\s+in\s+(\d+)\s+(days?|weeks?|hours?|minutes?)$',
        sentence, re.IGNORECASE
    )
    
    if match:
        verb, obj, amount, unit = match.groups()
        result["object"] = obj.strip()

        amount = int(amount)
        unit = unit.lower()

        now = datetime.now()

        if "day" in unit:
            target_date = now + timedelta(days=amount)
        elif "week" in unit:
            target_date = now + timedelta(weeks=amount)
        elif "hour" in unit:
            target_date = now + timedelta(hours=amount)
        elif "minute" in unit:
            target_date = now + timedelta(minutes=amount)
        else:
            target_date = now

        result["date"] = target_date.strftime("%Y-%m-%d")
        if "hour" in unit or "minute" in unit:
            result["time"] = target_date.strftime("%H:%M")

    return result

# Example call

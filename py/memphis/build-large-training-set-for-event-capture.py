import random
import pandas as pd
from datetime import datetime
import dateparser

# Expanded relative_days list
relative_days = [
    "today", "tomorrow", "yesterday", "in 2 days", "in 5 days", "2 days ago", "last week",
    "next week", "this weekend", "last weekend", "next Monday", "next Friday", "this Saturday",
    "last Sunday", "coming Tuesday", "this evening", "next month", "3 weeks from now",
    "in a fortnight", "this coming Thursday", "this time next week", "next Tuesday morning",
    "last Friday night", "this Sunday afternoon", "in 10 days", "in 1 week", "in 3 weeks",
    "4 weeks ago", "a week from today", "a week from tomorrow", "two weeks from now",
    "this coming weekend", "in the next few days", "next Wednesday at noon",
    "this Friday night", "yesterday morning", "tomorrow evening", "later today",
    "early next week", "mid next week", "end of next week", "this Thursday at dawn"
]

# Add "in {n} days" from 1 to 1000
relative_days += [f"in {n} days" for n in range(1, 1001)]

# Add "in {n} weeks" from 1 to 100
relative_days += [f"in {n} week" if n == 1 else f"in {n} weeks" for n in range(1, 101)]

# Add "in {n} months" from 1 to 60
relative_days += [f"in {n} month" if n == 1 else f"in {n} months" for n in range(1, 61)]


# Times of day
times_of_day = [
    "at noon", "at midnight", "in the morning", "in the afternoon", "in the evening",
    "early morning", "late evening", "before lunch", "after lunch", "around 5 PM",
    "just before dinner", "after midnight", "before dawn", "at dawn", "at dusk",
    "early afternoon", "just after 3", "right before sunset", "just before bed"
]

# Absolute dates
absolute_dates = [
    "January 1st", "January 15th", "February 2nd", "February 14th", "February 28th",
    "March 1st", "March 17th", "April 10th", "April 30th", "May 1st", "May 5th", "May 24th",
    "June 6th", "June 21st", "July 4th", "July 20th", "August 8th", "August 15th", 
    "September 1st", "September 9th", "October 3rd", "October 31st", "November 5th", 
    "November 11th", "November 30th", "December 10th", "December 25th", "December 31st",
    "the 1st of April", "the 15th of August", "the 30th of November", "March 3rd, 2023",
    "July 22, 2022", "5th September 2020", "25 December 2019"
]

# Absolute times
absolute_times = [
    # Standard times
    "at 12:00 AM", "at 1:00 AM", "at 2:00 AM", "at 3:00 AM", "at 4:00 AM", "at 5:00 AM",
    "at 6:00 AM", "at 7:00 AM", "at 8:00 AM", "at 9:00 AM", "at 10:00 AM", "at 11:00 AM",
    "at 12:00 PM", "at 1:00 PM", "at 2:00 PM", "at 3:00 PM", "at 4:00 PM", "at 5:00 PM",
    "at 6:00 PM", "at 7:00 PM", "at 8:00 PM", "at 9:00 PM", "at 10:00 PM", "at 11:00 PM",

    # With minutes
    "at 6:30 AM", "at 7:15 AM", "at 8:45 AM", "at 10:30 AM", "at 12:45 PM",
    "at 2:15 PM", "at 3:30 PM", "at 4:45 PM", "at 5:20 PM", "at 6:55 PM", "at 9:05 PM",
    "at 11:59 PM", "at 12:01 AM",

    # Colloquial times
    "at noon", "at midnight", "at dawn", "at dusk", "at sunrise", "at sunset",
    "at quarter past 6", "at quarter to 5", "at half past 9", "at five past 8",
    "at ten to seven", "at twenty past 10", "at ten after 3", "at ten before 2",

    # Informal phrasing
    "at 4 in the morning", "at 8 in the evening", "at 5 sharp", "at 9 on the dot",
    "around 7", "around 8:30", "a little after 10", "just before midnight", 
    "just after noon", "around lunchtime", "right before dinner", "after breakfast",
    "first thing in the morning", "last thing at night"
]

# Phrase generator
def generate_phrase():
    if random.random() < 0.5:
        return f"{random.choice(relative_days)} {random.choice(times_of_day)}"
    else:
        return f"{random.choice(absolute_dates)} {random.choice(absolute_times)}"

# Training set builder
def generate_training_set(n=1000, reference_time=None):
    reference_time = reference_time or datetime.now()
    data = []
    for _ in range(n):
        phrase = generate_phrase()
        dt = dateparser.parse(phrase, settings={'RELATIVE_BASE': reference_time})
        if dt:
            data.append({
                "phrase": phrase,
                "datetime_iso": dt.isoformat()
            })
    return pd.DataFrame(data)

# Generate and save
df = generate_training_set(n=500000)
df.to_csv("huge_datetime_phrases_dataset.csv", index=False)
print(df.sample(115))

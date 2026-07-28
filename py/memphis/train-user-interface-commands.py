from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder
import joblib

# Larger training dataset
training_data = [
    ("Open viewer", "Viewer mode"),
    ("Start viewer mode", "Viewer mode"),
    ("Switch to viewer", "Viewer mode"),
    ("Enable viewer mode", "Viewer mode"),

    ("Import calendar", "Import (Microsoft) Calendar"),
    ("Add my Microsoft calendar", "Import (Microsoft) Calendar"),
    ("Connect calendar", "Import (Microsoft) Calendar"),
    ("Bring in my work calendar", "Import (Microsoft) Calendar"),

    ("Load timeline file", "Timeline from file"),
    ("Open a timeline from file", "Timeline from file"),
    ("Import a timeline document", "Timeline from file"),
    ("Read timeline file", "Timeline from file"),

    ("Delete timeline", "Delete all timeline points"),
    ("Remove all time entries", "Delete all timeline points"),
    ("Clear the timeline", "Delete all timeline points"),
    ("Wipe all timeline points", "Delete all timeline points"),

    ("Add time point", "Time point"),
    ("Insert a time marker", "Time point"),
    ("Create timeline point", "Time point"),
    ("New time point", "Time point"),

    ("Lock background", "Lock in background"),
    ("Freeze the background", "Lock in background"),
    ("Pin the background layer", "Lock in background"),
    ("Prevent background edits", "Lock in background"),

    ("Change the title", "Title"),
    ("Edit the title", "Title"),
    ("Set a new title", "Title"),
    ("Rename timeline", "Title"),

    ("Draw an interval", "Draw Interval"),
    ("Create a duration", "Draw Interval"),
    ("Mark a time span", "Draw Interval"),
    ("Add interval section", "Draw Interval"),

    ("Update progress", "Set progress"),
    ("Set current progress", "Set progress"),
    ("Adjust progress bar", "Set progress"),

    ("Link PDF", "link PDF"),
    ("Attach PDF document", "link PDF"),
    ("Add a PDF", "link PDF"),
    ("Insert PDF link", "link PDF"),

    ("Set start time", "Set Start Time"),
    ("Define beginning time", "Set Start Time"),
    ("Start timeline at", "Set Start Time"),

    ("Adjust time range", "Set Time Range"),
    ("Modify timeline bounds", "Set Time Range"),
    ("Set visible time range", "Set Time Range"),

    ("Link table", "Link table..."),
    ("Connect to data table", "Link table..."),
    ("Attach spreadsheet", "Link table..."),

    ("Paste serial text", "Paste (txt|time-duration) Serial"),
    ("Paste in serial", "Paste (txt|time-duration) Serial"),
    ("Load serialized text", "Paste (txt|time-duration) Serial"),

    ("Paste concurrent text", "Paste (txt|time-duration) Concurrent"),
    ("Paste in parallel", "Paste (txt|time-duration) Concurrent"),
    ("Load overlapping text", "Paste (txt|time-duration) Concurrent"),
]

# Split into inputs and labels
X_texts, y_labels = zip(*training_data)

# Encode labels
label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y_labels)

# Build and train pipeline
model = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2), stop_words='english')),
    ('clf', LogisticRegression(max_iter=1000))
])
model.fit(X_texts, y_encoded)

# Prediction function
def predict_user_command(user_input):
    pred = model.predict([user_input])[0]
    label = label_encoder.inverse_transform([pred])[0]
    return f"Predicted command: '{label}'"

# CLI loop
if __name__ == "__main__":
    while True:
        user_input = input("Enter a command (or 'exit'): ")
        if user_input.lower() == 'exit':
            break
        print(predict_user_command(user_input))

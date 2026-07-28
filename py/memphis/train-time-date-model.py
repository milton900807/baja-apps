import dateparser
import json
import time
import threading
from datetime import datetime

# Load training set
def load_training_set(filepath):
    with open(filepath, "r") as f:
        return json.load(f)

# Parse date from a phrase
def parse_datetime(phrase, settings=None):
    dt = dateparser.parse(phrase, settings=settings or {
        'PREFER_DATES_FROM': 'future',
        'RELATIVE_BASE': datetime.now(),
        'RETURN_AS_TIMEZONE_AWARE': False
    })
    return dt

# Progress tracker (shared state)
progress = {
    "processed": 0,
    "successes": 0,
    "failures": 0,
    "examples": []
}

# Background thread to report progress every minute
def report_progress():
    while True:
        time.sleep(60)
        total = progress["processed"]
        if total == 0:
            print("No progress yet...")
            continue
        success_rate = 100 * progress["successes"] / total
        print(f"\n[Progress Report @ {datetime.now().isoformat()}]")
        print(f"Processed: {total}")
        print(f"Successes: {progress['successes']} | Failures: {progress['failures']}")
        print(f"Success rate: {success_rate:.2f}%")
        print("Sample successful parses:")
        for ex in progress["examples"][:3]:
            print(f"  - '{ex['phrase']}' → {ex['parsed']}")
        print("-" * 50)

# Main processing function
def process_dataset(dataset):
    results = []
    for entry in dataset:
        phrase = entry['phrase']
        parsed_time = parse_datetime(phrase)
        progress["processed"] += 1
        if parsed_time:
            progress["successes"] += 1
            progress["examples"].append({
                "phrase": phrase,
                "parsed": parsed_time.isoformat()
            })
        else:
            progress["failures"] += 1

        results.append({
            "phrase": phrase,
            "parsed_datetime": parsed_time.isoformat() if parsed_time else None
        })
    return results

# Save results
def save_results(results, filename):
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)

# Main
if __name__ == "__main__":
    training_set_file = "time_phrases_dataset.json"
    output_file = "parsed_time_results.json"

    dataset = load_training_set(training_set_file)

    # Start background reporter
    reporter = threading.Thread(target=report_progress, daemon=True)
    reporter.start()

    # Process dataset
    parsed = process_dataset(dataset)
    save_results(parsed, output_file)

    print("\n✅ Parsing complete.")

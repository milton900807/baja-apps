import os
import re

def find_group_assignments(base_dir):
    """
    Recursively scans all .js files under base_dir and finds lines
    where a member variable 'group' is assigned to an array.
    Example matches:
        this.group = [...]
        obj.group = [...]
        group = [...]
    """

    # Regex: matches any 'group' assignment to an array (e.g. group = [ ... ])
    pattern = re.compile(r'\b[\w.]*group\s*=\s*\[', re.MULTILINE)

    for root, _, files in os.walk(base_dir):
        for file in files:
            if file.endswith(".js"):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        for line_no, line in enumerate(f, 1):
                            if pattern.search(line):
                                print(f"{path}:{line_no}: {line.strip()}")
                except Exception as e:
                    print(f"⚠️ Could not read {path}: {e}")

if __name__ == "__main__":
    directory = input("Enter folder path to scan recursively: ").strip()
    if not os.path.isdir(directory):
        print("❌ Invalid folder path.")
    else:
        print(f"🔍 Scanning recursively in: {directory}\n")
        find_group_assignments(directory)


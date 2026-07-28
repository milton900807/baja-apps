import os
import re

def replace_urls_in_file(file_path, url_replacements, changes_log):
    # Regex to match URLs
    url_pattern = re.compile(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+')
    
    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    modified = False
    for i, line in enumerate(lines):
        urls = url_pattern.findall(line)
        for url in urls:
            if url in url_replacements:
                original_line = line
                line = line.replace(url, "window['env']['apiUrl']")
                lines[i] = line
                changes_log[f"{file_path}:{i+1}"] = {'original_url': url, 'original_line': original_line}
                modified = True

    if modified:
        with open(file_path, 'w', encoding='utf-8') as file:
            file.writelines(lines)

def search_and_replace_urls(root_directory):
    extensions = ['.js', '.txt']
    changes_log = {}
    url_replacements = {
        # "https://eln.lajollalabs.com": "window['env']['apiUrl']",
        # "https://levenshtein.lajollalabs.com": "window['env']['apiUrl']",
        # "https://ljlabs.lajollalabs.com": "window['env']['apiUrl']",
        # "window['env']['apiUrl']": "window['env']['apiUrl']",
        # "https://hts.bio": "window['env']['apiUrl']",
        # "http://localhost": "window['env']['apiUrl']",
        # "https://app.hts.bio": "window['env']['apiUrl']"
    }

    for root, dirs, files in os.walk(root_directory):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                full_path = os.path.join(root, file)
                replace_urls_in_file(full_path, url_replacements, changes_log)

    return changes_log

if __name__ == "__main__":
    root_dir = input("Enter the root directory to search and replace URLs: ")
    changes = search_and_replace_urls(root_dir)
    print("Changes made:", changes)

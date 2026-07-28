import os
import argparse

def replace_in_file(file_path, search_string, replace_string):
    """
    Replace occurrences of search_string with replace_string in a file.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
        
    # Replace the target string
    content_new = content.replace(search_string, replace_string)
    
    # Only write to the file if there are changes to avoid unnecessary writes
    if content != content_new:
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(content_new)
        print(f"Updated: {file_path}")

def traverse_and_replace(root_dir, search_string, replace_string):
    """
    Traverse directories starting from root_dir, and replace search_string with replace_string in all text files.
    """
    for root, dirs, files in os.walk(root_dir):
        for name in files:
            if name.endswith('.txt'):  # Target only text files
                file_path = os.path.join(root, name)
                replace_in_file(file_path, search_string, replace_string)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Replace a string in all text files within a directory tree.")
    parser.add_argument("root_dir", help="The root directory to start the search.")
    parser.add_argument("search_string", help="The string to search for.")
    parser.add_argument("replace_string", help="The string to replace the search string with.")
    
    args = parser.parse_args()
    
    traverse_and_replace(args.root_dir, args.search_string, args.replace_string)

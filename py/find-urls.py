import os
import re
import json

def find_urls_in_file(file_path):
    url_pattern = re.compile(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+')
    urls_found = {}
    with open(file_path, 'r', encoding='utf-8') as file:
        for line_num, line in enumerate(file, 1):
            urls = url_pattern.findall(line)
            if urls:
                urls_found[line_num] = urls
    return urls_found

def search_files_for_urls(root_directory):
    extensions = ['.js', '.txt', '.conf']
    urls_in_files = {}
    
    for root, dirs, files in os.walk(root_directory):
        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                full_path = os.path.join(root, file)
                file_urls = find_urls_in_file(full_path)
                if file_urls:
                    urls_in_files[full_path] = file_urls
    
    return urls_in_files

def save_urls_to_file(urls_dictionary, output_file='found_urls.json'):
    with open(output_file, 'w') as file:
        json.dump(urls_dictionary, file, indent=4)


def get_distinct_urls(urls_dictionary):
    distinct_urls = set()
    for file_urls in urls_dictionary.values():
        for urls in file_urls.values():
            distinct_urls.update(urls)
    return list(distinct_urls)

def save_distinct_urls_to_file(distinct_urls, output_file='distinct_urls.json'):
    with open(output_file, 'w') as file:
        json.dump(distinct_urls, file, indent=4)

# if __name__ == "__main__":
#     root_dir = input("Enter the root directory to search: ")
#     urls_found = search_files_for_urls(root_dir)
#     save_urls_to_file(urls_found)
#     print("URLs have been saved to 'found_urls.json'")




if __name__ == "__main__":
    root_dir = input("Enter the root directory to search: ")
    urls_found = search_files_for_urls(root_dir)
    save_urls_to_file(urls_found)
    print("URLs have been saved to 'found_urls.json'")

    # Extract distinct URLs and save them to a file
    distinct_urls = get_distinct_urls(urls_found)
    save_distinct_urls_to_file(distinct_urls)
    print("Distinct URLs have been saved to 'distinct_urls.json'")

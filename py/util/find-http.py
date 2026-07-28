import os
import re



# find_http_calls
def find_http_calls(directory, output_file):
    http_calls = []

    # Recursively traverse the directory
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    for i, line in enumerate(lines):
                        # Check for GETJSON calls
                        get_match = re.search(r'GETJSON\s*\(\s*["\']([^"\']+)["\']', line)
                        if get_match:
                            url = get_match.group(1)
                            http_calls.append((file, i + 1, url, 'GET'))

                        # Check for POSTJSON calls
                        post_match = re.search(r'POSTJSON\s*\(\s*["\']([^"\']+)["\']', line)
                        if post_match:
                            url = post_match.group(1)
                            http_calls.append((file, i + 1, url, 'POST'))

    # Write the results to the output file
    with open(output_file, 'w', encoding='utf-8') as f:
        for call in http_calls:
            f.write(f'{call[0]},{call[1]},{call[2]},{call[3]}\n')

if __name__ == "__main__":
    directory = 'path_to_your_js_files_directory'  # Replace with your directory
    output_file = 'http_calls_output.txt'
    find_http_calls(directory, output_file)

import os

# Define the license statement
license_statement = """/*
 * bajabio Precision Therapeutics License
 *
 * Copyright (c) 2024 bajabio, Inc.
 *
 * Permission is hereby granted to any person obtaining a copy of this software (the "Software") to use, copy, and modify the Software, subject to the following conditions:
 *
 * 1. Modifications:
 *    - Modifications to the Software are permitted.
 *    - Modified versions of the Software may be used only for personal or internal business purposes.
 *
 * 2. Redistribution:
 *    - Redistribution of the original or modified versions of the Software, in whole or in part, in any form, is not permitted without the prior written consent of bajabio, Inc.
 *
 * 3. Attribution:
 *    - The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * 4. Warranty Disclaimer:
 *    - THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * 5. Termination:
 *    - This License shall automatically terminate if you fail to comply with its terms.
 */
"""

def add_license_to_file(file_path):
    """Adds a license statement to a JavaScript file."""
    with open(file_path, 'r') as file:
        content = file.read()

    # Check if the license statement is already present
    if license_statement in content:
        print(f"License already present in {file_path}")
        return

    # Add the license statement at the top of the file
    new_content = license_statement + '\n' + content

    # Write the new content back to the file
    with open(file_path, 'w') as file:
        file.write(new_content)

    print(f"Added license to {file_path}")

def traverse_directory(directory):
    """Recursively traverses the directory and adds license to JavaScript files."""
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.js'):
                file_path = os.path.join(root, file)
                add_license_to_file(file_path)

if __name__ == "__main__":
    # Specify the directory to traverse
    directory_to_traverse = '.'

    traverse_directory(directory_to_traverse)

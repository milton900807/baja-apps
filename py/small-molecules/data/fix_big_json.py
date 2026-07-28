def process_file_with_newline(input_filename, output_filename):
    with open(input_filename, 'r') as file:
        lines = file.readlines()

    with open(output_filename, 'w') as file:
        i = 0
        while i < len(lines) - 1:
            current_line = lines[i].rstrip()  # Remove trailing newline and whitespace
            next_line = lines[i + 1].lstrip()  # Remove leading whitespace

            # Check if the current line ends with '}' and the next line starts with '{'
            if current_line.endswith('}') and next_line.startswith('{'):
                file.write(current_line + ',\n')  # Add a comma after the current line
                file.write(next_line)  # Write the next line as is
                i += 2  # Skip the next line as it's already processed
            else:
                file.write(lines[i])
                i += 1

        # Write the last line if not already written
        if i == len(lines) - 1:
            file.write(lines[i])

print("File processing with newline between brackets complete.")
input_filename = 'interactions-db.json'
output_filename = 'output_file.json'
process_file_with_newline(input_filename, output_filename)

print("File processing complete.")

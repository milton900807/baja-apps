#!/bin/bash

# Check if the user provided a filename as an argument
if [ $# -ne 1 ]; then
    echo "Usage: $0 <filename>"
    exit 1
fi

# Read the file line by line
while IFS= read -r line || [[ -n "$line" ]]; do
    # Remove any leading or trailing whitespace
    filename=$(echo "$line" | xargs)
    
    # Skip empty lines
    if [ -z "$filename" ]; then
        continue
    fi
    
    # Create the file
    touch "$filename"
    echo "Created file: $filename"
done < "$1"

echo "All files created."


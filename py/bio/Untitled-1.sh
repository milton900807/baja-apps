add to this script:   #!/bin/bash

# Define the key
key="SHA256:MkhbgjRbO+mg9JOYnRAyEywql9+bZad5ymOCsEps2v4"

# Perform git pull
git_pull() {
    git clone git@github.com:lajollalabs/ljlptx.git
}

# Install Docker and Docker Compose
install_docker() {
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker.io

    # Install Docker Compose
    sudo apt-get install -y docker-compose
}

# Log into Docker Hub
docker_login() {
    docker login -u ljlinstaller -p LYak900807
}

# Main function
main() {
    git_pull
    install_docker
    docker_login
}

# Execute the main function
main
  execute a function cd into ljlptx/ljconfig and then run this script: #!/bin/bash

# File to process
FILE="$1"

if [[ ! -f $FILE ]]; then
    echo "File not found!"
    exit 1
fi

# Function to process the file
process_file() {
    local file=$1

    # Use grep to find all instances of <<word>>
    local labels=$(grep -oP '<<\K[^>>]+(?=>>)' "$file" | sort | uniq)

    for label in $labels; do
        # Prompt the user for a replacement value
        echo "Enter a value for <<$label>>:"
        read -r value

        # Replace all occurrences of <<label>> with the user-provided value
        sed -i "s/<<$label>>/$value/g" "$file"
    done
}

# Process the single file
process_file "$FILE"

echo "The file has been processed."   on two files in this folder:  1)  env_config.js and nginx.conf  
import re
import nltk
from nltk.tokenize import word_tokenize
from collections import defaultdict

# Download required NLTK data
nltk.download('punkt')

# Initialize a dictionary to store learned patterns
mutation_patterns = defaultdict(list)

# Define a function to capture text and convert it into mutation nomenclature
def convert_to_mutation_nomenclature(text):
    # Tokenize the text
    words = word_tokenize(text)
    
    # Example regex patterns for common mutation nomenclature (expand as needed)
    patterns = {
        r'[A-Z]\d+[A-Z]': 'substitution',  # e.g., A123T
        r'del[A-Z]\d+': 'deletion',  # e.g., delA123
        r'ins[A-Z]\d+': 'insertion',  # e.g., insA123
        r'\d+[A-Z]fs': 'frameshift',  # e.g., 123Afs
    }
    
    # Try to match the text with known patterns
    nomenclature = []
    for word in words:
        matched = False
        for pattern, mutation_type in patterns.items():
            if re.match(pattern, word):
                nomenclature.append((word, mutation_type))
                matched = True
                break
        if not matched:
            # If not matched, check if the word has been learned before
            if word in mutation_patterns:
                nomenclature.append((word, mutation_patterns[word][0]))
            else:
                # Mark as unrecognized
                nomenclature.append((word, 'unrecognized'))
    
    # Allow user to correct unrecognized or incorrect nomenclature
    corrected_nomenclature = []
    for word, mutation_type in nomenclature:
        print(f"Detected '{word}' as '{mutation_type}'")
        if mutation_type == 'unrecognized':
            correct_type = input(f"Unrecognized pattern '{word}'. Please define the correct mutation type: ")
        else:
            correct_type = input(f"Is '{mutation_type}' correct for '{word}'? If not, enter the correct mutation type or press Enter to keep: ")
            if not correct_type:
                correct_type = mutation_type
        
        corrected_nomenclature.append((word, correct_type))
        # Save the corrected type for future use
        if correct_type != 'unrecognized':
            mutation_patterns[word].append(correct_type)
    
    return corrected_nomenclature

# Example usage of the function
text = "The mutation was A123T and later a deletion delG456 was noted."
mutation_nomenclature = convert_to_mutation_nomenclature(text)
print("Final Nomenclature:", mutation_nomenclature)

# Save learned patterns for future use
def save_patterns():
    with open('mutation_patterns.txt', 'w') as f:
        for key, values in mutation_patterns.items():
            f.write(f"{key}:{','.join(values)}\n")

# Load learned patterns
def load_patterns():
    try:
        with open('mutation_patterns.txt', 'r') as f:
            for line in f:
                key, values = line.strip().split(':')
                mutation_patterns[key] = values.split(',')
    except FileNotFoundError:
        pass

# Example: Load previously learned patterns
load_patterns()

# Example: Save current learned patterns
save_patterns()

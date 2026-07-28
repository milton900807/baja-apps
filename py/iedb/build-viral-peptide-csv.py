import random
import csv

class ViralPeptideDatabase:
    def __init__(self):
        self.peptides = []

    def add_peptide(self, virus_name, protein_name, sequence):
        """Add a viral peptide to the database."""
        self.peptides.append({
            "virus": virus_name,
            "protein": protein_name,
            "sequence": sequence,
            "length": len(sequence)
        })

    def filter_by_length(self, min_length, max_length):
        """Filter peptides by sequence length."""
        return [pep for pep in self.peptides if min_length <= pep["length"] <= max_length]

    def filter_by_virus(self, virus_name):
        """Filter peptides by virus name."""
        return [pep for pep in self.peptides if pep["virus"].lower() == virus_name.lower()]

    def filter_by_protein(self, protein_name):
        """Filter peptides by protein name."""
        return [pep for pep in self.peptides if protein_name.lower() in pep["protein"].lower()]

    def export_to_csv(self, filename):
        """Export peptide data to a CSV file."""
        with open(filename, 'w', newline='') as csvfile:
            fieldnames = ["virus", "protein", "sequence", "length"]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(self.peptides)
        print(f"Data exported to {filename}")

# Generate random peptide sequences
def generate_random_sequence(length):
    """Generate a random peptide sequence."""
    amino_acids = "ACDEFGHIKLMNPQRSTVWY"
    return ''.join(random.choice(amino_acids) for _ in range(length))

# Predefined list of viruses and proteins
viruses = ["SARS-CoV-2", "Influenza A", "HIV-1", "Hepatitis C", "Ebola", "Zika", "MERS-CoV", "Dengue", "Rabies", "Marburg"]
proteins = ["Spike Protein", "Hemagglutinin", "Nucleocapsid", "Envelope", "Membrane", "Polymerase", "Protease", "Capsid", "Glycoprotein"]

# Create database instance
db = ViralPeptideDatabase()

# Populate database with 100 random peptides
for _ in range(100):
    virus = random.choice(viruses)
    protein = random.choice(proteins)
    sequence_length = random.randint(8, 25)  # Random peptide length between 8 and 25 amino acids
    sequence = generate_random_sequence(sequence_length)
    db.add_peptide(virus, protein, sequence)

# Export data
csv_filename = "./data/viral_peptides.csv"
db.export_to_csv(csv_filename)

# Display the CSV file for user download
csv_filename

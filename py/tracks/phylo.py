import json
from Bio import Phylo, AlignIO
from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor
from io import StringIO


sequences = works.param( 1 )


def perform_phylogenetic_analysis(sequences):
    # Convert input sequences to a format compatible with Biopython
    fasta_data = "\n".join([f">{name}\n{seq}" for name, seq in sequences.items()])
    fasta_io = StringIO(fasta_data)
    
    # Read sequences into an alignment object
    alignment = AlignIO.read(fasta_io, "fasta")
    
    # Calculate distance matrix
    calculator = DistanceCalculator('identity')
    distance_matrix = calculator.get_distance(alignment)
    
    # Construct a tree using UPGMA (Unweighted Pair Group Method with Arithmetic Mean)
    constructor = DistanceTreeConstructor(calculator, 'upgma')
    tree = constructor.build_tree(alignment)
    
    # Convert the tree to a dictionary format
    tree_dict = convert_tree_to_dict(tree)
    
    return json.dumps(tree_dict, indent=4)

# Helper function to convert tree to dictionary format
def convert_tree_to_dict(clade):
    if clade.is_terminal():
        return clade.name
    else:
        return {
            "name": clade.name if clade.name else "Internal Node",
            "children": [convert_tree_to_dict(sub_clade) for sub_clade in clade.clades]
        }

phylogenetic_tree_json = perform_phylogenetic_analysis(sequences)
# print(phylogenetic_tree_json)
works.resolve ( phylogenetic_tree_json )
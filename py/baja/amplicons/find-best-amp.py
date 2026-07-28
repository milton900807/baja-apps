from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqUtils import GC
from Bio.SeqFeature import SeqFeature, FeatureLocation
from collections import defaultdict
from works import ion



def load_transcripts(file_path):
    """
    Load annotated primary transcripts from a file.
    """
    transcripts = list(SeqIO.parse(file_path, "genbank"))
    return transcripts

def find_common_regions(transcripts):
    """
    Identify common regions in at least two transcripts.
    """
    region_dict = defaultdict(int)
    for transcript in transcripts:
        for feature in transcript.features:
            if feature.type == "CDS" or feature.type == "exon":
                start, end = feature.location.start, feature.location.end
                region_dict[(start, end)] += 1
    
    # Filter regions that are present in at least two transcripts
    common_regions = [region for region, count in region_dict.items() if count >= 2]
    return common_regions

def generate_amplicons(common_regions, min_length=100, max_length=300):
    """
    Generate candidate amplicons from common regions.
    """
    amplicons = []
    for start, end in common_regions:
        region_length = end - start
        if min_length <= region_length <= max_length:
            amplicons.append((start, end))
        else:
            # Generate smaller amplicons within the region
            for i in range(start, end - min_length + 1):
                for j in range(i + min_length, min(end, i + max_length) + 1):
                    amplicons.append((i, j))
    return amplicons

def select_best_amplicon(amplicons, sequence, gc_content_range=(40, 60)):
    """
    Select the best amplicon based on criteria such as GC content.
    """
    best_amplicon = None
    best_gc_content = None
    
    for start, end in amplicons:
        amplicon_seq = sequence[start:end]
        gc_content = GC(amplicon_seq)
        
        if gc_content_range[0] <= gc_content <= gc_content_range[1]:
            if best_gc_content is None or abs(gc_content - 50) < abs(best_gc_content - 50):
                best_gc_content = gc_content
                best_amplicon = (start, end, amplicon_seq)
                
    return best_amplicon

# Load the annotated primary transcripts
file_path = "example_transcripts.gb"
transcripts = load_transcripts(file_path)

# Find common regions in at least two transcripts
common_regions = find_common_regions(transcripts)

# Generate candidate amplicons from common regions
amplicons = generate_amplicons(common_regions)

# Select the best amplicon
if transcripts:
    sequence = transcripts[0].seq
    best_amplicon = select_best_amplicon(amplicons, sequence)

    if best_amplicon:
        start, end, amplicon_seq = best_amplicon
        print(f"Best amplicon from {start} to {end}: {amplicon_seq}")
    else:
        print("No suitable amplicon found.")
else:
    print("No transcripts found in the file.")

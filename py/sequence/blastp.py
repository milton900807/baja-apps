from Bio.Blast.Applications import NcbiblastpCommandline
import os
#from ion import works
import tempfile
#seq = works.param(1)
#db = works.aram(2)


# Define the sample peptide sequence
seq = """\
>SamplePeptide
MKTAYIAKQRQISFVKSHFSRQDILDLICERAEGKATGRTYYNGAIDPN
"""
db = "human_protein"

# Create a temporary file for the sample peptide sequence
with tempfile.NamedTemporaryFile(delete=False, mode='w') as temp_query_file:
    temp_query_file.write(seq)
    query_file_path = temp_query_file.name
blastp_path = os.path.join("blastbin", "blastp")


# Create a temporary file for BLAST results
temp_file = tempfile.NamedTemporaryFile(delete=False)
temp_file.close()
blast_results_path = temp_file.name

# Define the BLASTP command line
blastp_cline = NcbiblastpCommandline(
    cmd=blastp_path,
    query=query_file_path,
    db=db,  # Replace with the path to your BLAST database
    evalue=0.001,
    outfmt=6,
    out=blast_results_path
)
stdout, stderr = blastp_cline()


# Print the results
with open(blast_results_path, "r") as f:
    results = f.read()

print(results)


# Clean up temporary files
os.remove(query_file_path)
os.remove(blast_results_path)


import pandas as pd
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio import SeqIO

df = pd.read_csv('../conjugates/bt-chem.csv')
df_unique = df.drop_duplicates(subset=['protein_sequence'])
seq_records = []
for _, row in df_unique.iterrows():
    seq_record = SeqRecord(Seq(row['protein_sequence']),
                           id=row['Unigene'],
                           description='')  # Description is optional
    seq_records.append(seq_record)

# Write the SeqRecord objects to a FASTA file
fasta_file_path = 'unique_proteins.fasta'
with open(fasta_file_path, 'w') as fasta_file:
    SeqIO.write(seq_records, fasta_file, 'fasta')

print(f"Written {len(seq_records)} unique protein sequences to {fasta_file_path}")




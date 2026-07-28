import pandas as pd
from rdkit import Chem
import json
import sys

def load_json_data(filename):
    """Load JSON data from a file."""
    with open(filename, 'r') as file:
        data = json.load(file)
    return data

def load_gene2ensembl(filename):
    """Load gene to Ensembl mapping from a file."""
    return pd.read_csv(filename, sep='\t')

def load_sdf_smiles(filename):
    """Load SMILES strings from an SDF file."""
    sdf_info = {}
    suppl = Chem.SDMolSupplier(filename)
    for mol in suppl:
        if mol is not None:
            cid = mol.GetProp('PUBCHEM_COMPOUND_CID')
            smiles = mol.GetProp('PUBCHEM_OPENEYE_CAN_SMILES')
            sdf_info[cid] = smiles
    return sdf_info

def main__():
    gene2ensembl_df = load_gene2ensembl('gene2ensembl')
    filtered_df = gene2ensembl_df[(gene2ensembl_df['GeneID'] == 3537) & (gene2ensembl_df['#tax_id'] == 9606)]
    # filtered_df = gene2ensembl_df[(gene2ensembl_df['GeneID'] == 3537 and gene2ensembl_df['#tax_id'] == 9606)]
    print ( filtered_df )
    sys.exit


def main():
    interactions = load_json_data('interactions-db.json')
    smiles_dict = load_sdf_smiles('all.sdf')
    gene2ensembl_df = load_gene2ensembl('gene2ensembl')

    # Prepare new dataframe
    columns = ['geneid', 'ensemblid', 'taxname', 'srctargetname', 'cmpdname', 'cid', 'smiles', 'action', 'actname', 'actvalue', 'Ensembl_rna_identifier', 'Ensembl_protein_identifier']
    new_df = pd.DataFrame(columns=columns)
    file_index = 0
    for i, interaction in enumerate(interactions, 1):
        if all(key in interaction for key in ['geneid', 'cmpdname', 'srctargetname', 'taxname', 'action', 'actname', 'actvalue', 'taxid']):
            geneid = interaction['geneid']
            
            cid = interaction['cid']
            taxid = interaction['taxid']  # Assuming each interaction contains 'taxid'
            # Filter gene2ensembl_df by 'GeneID' and '#tax_id'
            # filtered_df = gene2ensembl_df[(gene2ensembl_df['GeneID'] == geneid) & (gene2ensembl_df['#tax_id'] == taxid)]
            filtered_df = gene2ensembl_df[(gene2ensembl_df['GeneID'] == int(geneid)) & (gene2ensembl_df['#tax_id'] == int(taxid))]
            # print ( filtered_df )
            # Extract additional details with fallback to 'NA'
            details = {
                'ensemblid': filtered_df['Ensembl_gene_identifier'].values[0] if not filtered_df.empty else 'NA',
                # 'RNA_nucleotide_accession.version': filtered_df['RNA_nucleotide_accession.version'].values[0] if not filtered_df.empty else 'NA',
                'Ensembl_rna_identifier': filtered_df['Ensembl_rna_identifier'].values[0] if not filtered_df.empty else 'NA',
                # 'protein_accession.version': filtered_df['protein_accession.version'].values[0] if not filtered_df.empty else 'NA',
                'Ensembl_protein_identifier': filtered_df['Ensembl_protein_identifier'].values[0] if not filtered_df.empty else 'NA'
            }
            smiles = smiles_dict.get(cid, None)
            new_row = {
                'geneid': geneid,
                # 'ensemblid': details['Ensembl_gene_identifier'],  # Use Ensembl_gene_identifier as ensemblid
                'taxname': interaction['taxname'],
                'srctargetname': interaction['srctargetname'],
                'cmpdname': interaction['cmpdname'],
                'cid': cid,
                'smiles': smiles,
                'action': interaction['action'],
                'actname': interaction['actname'],
                'actvalue': interaction['actvalue'],
                **details
            }
            
            new_df = pd.concat([new_df, pd.DataFrame([new_row])], ignore_index=True)

            # Check if it's time to write to CSV
            file_index += 1
            if i % 100000 == 0: 
                if not new_df.empty:
                    new_df.to_csv(f'c-i_part{i}.csv', index=False)
                print(f'skp: {i}')

    # Handle remaining rows

    print("Saving...")
    new_df.to_csv('c-i.csv')



if __name__ == "__main__":
    main()

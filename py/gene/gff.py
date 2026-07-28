import gffutils
import os
import json
import csv
import io
from ion import works

# Load coordinates
coordss = str(works.param(1))
coords = json.loads(coordss)



def create_databases(data_dir, db_dir, chromosomes):
    for chrom in chromosomes:
        filename = f"Homo_sapiens.GRCh38.110.chromosome.{chrom}.gff3.gz"
        filepath = os.path.join(data_dir, filename)
        db_path = os.path.join(db_dir, f"{chrom}.db")

        if not os.path.exists(db_path):
            print(f"Creating database for chromosome {chrom}")
            gffutils.create_db(filepath, dbfn=db_path, force=True, keep_order=True, merge_strategy='merge', sort_attribute_values=True)

def query_annotations(chrom, start, end, db_dir):
    db_path = os.path.join(db_dir, f"{chrom}.db")
    annotations = []
    if os.path.exists(db_path):
        db = gffutils.FeatureDB(db_path)
        for annotation in db.region(region=(chrom, start, end), featuretype='gene'):
            annotations.append(annotation)
    return annotations


def parse_annotation(annotation):
    attributes = {k: v[0] if isinstance(v, list) else v for k, v in annotation.attributes.items()}
    
    # Ensure the required attributes are present and have values
    required_fields = ['ID', 'Name', 'description']
    if all(field in attributes and attributes[field] for field in required_fields):
        print(str(attributes['ID']))
        return attributes
    else:
        return None


# Directory for databases
db_dir = '/bd/annotations/gff_databases'

# Query annotations and build results tree
results_tree = {}
for coord in coords:
    key = f": {coord['chr']}:{coord['start']}-{coord['end']}"
    annotations = query_annotations(coord['chr'], coord['start'], coord['end'], db_dir)
    filtered_annotations = [parse_annotation(annotation) for annotation in annotations if parse_annotation(annotation)]
    results_tree[key] = filtered_annotations if filtered_annotations else [{"error": f"No valid annotations found for chromosome {coord['chr']}"}]

# Write results to TSV string
output = io.StringIO()
for query, attributes_list in results_tree.items():
    output.write(f"{query}\n")
    if 'error' in attributes_list[0]:
        output.write(f"{attributes_list[0]['error']}\n")
        continue

    # Write each row of attributes without headers
    for attributes in attributes_list:
        output.write('\t'.join([attributes.get(field, '') for field in ['ID', 'Name', 'biotype', 'description']]) + '\n')
    output.write("\n")  # Add a newline between different queries

# Get TSV string
tsv_string = output.getvalue()
output.close()


# Convert TSV string to HTML table without headers
def tsv_to_html_table(tsv_string, fields):
    rows = tsv_string.strip().split("\n")
    html_output = "<html><body>"

    for row in rows:
        if row.startswith(":"):
            if '</table>' in html_output:
                html_output += '</table><hr>'  # Add line separator between each query
            html_output += f"<h3>{row}</h3><table border='0' style='border-collapse:collapse;'>"
        elif row == "":
            html_output += '</table>'
        else:
            cells = row.split('\t')
            attributes = dict(zip(['ID', 'Name', 'biotype', 'description'], cells))
            html_output += "<tr>"
            for field in fields:
                value = attributes.get(field, '')
                style = "width:100px; padding:5px;"  # Fixed width and padding for all columns
                if field == 'Name':
                    style += "color:blue;"  # Blue font for Name column
                html_output += f"<td style='{style}'>{value}</td>"
            html_output += "</tr>"

    html_output += '</table></body></html>'
    return html_output


# Specified fields to include
fields = ['Name', 'description', 'ID']

html_table = tsv_to_html_table(tsv_string, fields)
works.resolve ( {'tsv': tsv_string, 'html':html_table} )

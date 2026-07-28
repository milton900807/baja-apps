import json
import re

def parse_text_to_json(input_text_file, output_json_file):
    pattern = re.compile(r'([\d\.]+)\t([^\t]+)\t([\d\.\-]+)\t([\d\.\-]*)\t([^\t]+)\t([^\t"]+)"\t"\s*([^\t]+)\t(\d+)\t(\d+)')
    with open(input_text_file, 'r') as file:
        text_content = file.read()
    lines = text_content.split('\n')
    pdarray = []
    for line in lines:
        match = pattern.match(line)
        if match:
            parsed_data = {
                'EC': match.group(1),
                'Name': match.group(2),
                'Ki': match.group(3),
                'MaxKi': match.group(4) if match.group(4) else None,
                'enzyme_alt': match.group(6).strip(),  # Remove any extra whitespace
                'ligand_id': match.group(8),
                'reference': match.group(9)
            }
            pdarray.append ( parsed_data )
        else:
            parsed_data = {}
        
    # print ( pdarray )        
    with open(output_json_file, 'w') as json_file:
        json.dump(pdarray, json_file, indent=4)
input_text_file = 'raw.txt'
output_json_file = 'raw.json'
parse_text_to_json(input_text_file, output_json_file)

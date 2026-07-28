import re
import pandas as pd
import json
import time

def load_json_file(file_path):
    """
    Load and return the JSON data from a file.
    """
    with open(file_path, 'r') as file:
        return json.load(file)


def parse_enzyme_data(data):
    """
    Parse the 'data' section of the JSON, extracting enzyme information.
    """
    # Compile the regex pattern for matching enzyme IDs or "spontaneous"
    pattern = re.compile(r"^(?:[1-7]\.[1-9][0-9]{0,2}\.[1-9][0-9]{0,2}\.B?[1-7][0-9]{0,2})|spontaneous$")
    
    records = []

    # Iterate over each item in the data to find keys that match the pattern
    for key, value in data.items():
        if pattern.match(key):
            # Assuming 'value' contains the enzyme information you're interested in.
            # You'll need to extract the relevant details (e.g., Ki values, inhibitor) here.
            # Placeholder for demonstration:
            enzyme_id = key
            # Example of processing 'value', which should align with enzyme.schema.json
            enzyme_name = value.get("name", "Unknown")  # Adjust based on actual structure
            reaction = value.keys()  # Adjust based on actual structure
            # print ( reaction ) 
            time.sleep ( 3 )
            

            if 'ki_value' in reaction or 'ic50' in reaction:
                inhib = value.get ( 'inhibitor')

                for inh in inhib:
                    print ( '--------------------------------------------------------------------' )
                    print ( inh['value'], inh['references'] )
                    print ( inh['comment'] )
                    print ( '--------------------------------------------------------------------' )


            
            # Placeholder for adding a record; adjust based on your needs
            records.append({
                "Enzyme ID": enzyme_id,
                "Enzyme Name": enzyme_name,
                # Include other fields like Ki values, inhibitor name, and ID as needed
            })
    
    return pd.DataFrame(records)

def main(json_file_path):
    # Load the JSON data from file
    json_data = load_json_file(json_file_path)
    
    # Assuming the 'data' key exists and contains the relevant entries
    if 'data' in json_data:
        df = parse_enzyme_data(json_data['data'])
        print(df)
    else:
        print("The 'data' section is missing in the JSON file.")

# Example usage
json_file_path = 'brenda.json'
main(json_file_path)

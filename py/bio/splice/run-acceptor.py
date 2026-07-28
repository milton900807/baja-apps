import requests
import os
import json
import time

def post_json(data, url):
    response = requests.post(url, json=data)
    return response.json()

def acceptor_attribution(strand, sequence, attribution_site, attr_window):
    acceptor_att_ht = '${server}:8502/v1/models/donor_attributor:predict'
    starti = attribution_site - attr_window
    endi = attribution_site + attr_window
    print ( [sequence[starti:starti+endi]] )
    data = {
        "signature_name": "serving_default",
        "inputs": {
            "sequence": [sequence[starti:starti+endi]],
            "xi": [starti],
            "xf": [endi],
            "strand": [str(strand)],
            "attribution_site": [attribution_site],
        }
    }
    # print ( json.dumps ( data ))
    # Make the POST request and get the response
    response = post_json(data, acceptor_att_ht)
    print ( response )
    return response['outputs']
    # attribution_scores = response['outputs']['log_odds_ratios']
    # attribution_indices = response['outputs']['out_indices']
    
    return attribution_scores, attribution_indices

import json

def read_json_file(file_path):
    """
    Reads a JSON file and returns its content.

    :param file_path: The path to the JSON file.
    :return: A Python dictionary containing the JSON file's content.
    """
    try:
        with open(file_path, 'r') as file:
            data = json.load(file)
            return data
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error decoding JSON from file: {file_path}")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None


def save_json_to_file(json_obj, file_path):
    """
    Saves a JSON object to a file.

    :param json_obj: The JSON object to save.
    :param file_path: The path of the file where the JSON object should be saved.
    """
    try:
        with open(file_path, 'w') as file:
            json.dump(json_obj, file, indent=4)  # 'indent=4' for pretty printing
        print(f"JSON object successfully saved to {file_path}")
    except Exception as e:
        print(f"Error occurred while saving JSON to file: {e}")

def find_splicing_acceptor_sites(rna_sequence, strand_direction):
    print ( rna_sequence )
    """
    Finds indices of splicing acceptor sites in an RNA sequence.

    :param rna_sequence: RNA sequence where Uracil is represented by 'T'.
    :param strand_direction: '+' for the positive strand, '-' for the negative strand.
    :return: List of indices where splicing acceptor sites are found.
    """
    acceptor_sites = []
    motif = 'AG'
    if strand_direction <= 0:
        motif = 'GA'
    index = rna_sequence.find(motif)
    while index != -1:
        if strand > 0:
            acceptor_sites.append(index)
        else: 
            acceptor_sites.append ( index+2)
        index = rna_sequence.find(motif, index + 1)

    return acceptor_sites


def find_max_out_indicies(json_str):
    # Load JSON data
    max_value = 0
    if json_str is None:
        return 0
    # Iterate through each item in the acceptor_attr list
    for item in json_str:
        out_indicies = item.get('scores', {}).get('out_indices', [])
        print ( out_indicies )
        if out_indicies:  # Check if the list is not empty
            current_max = max(out_indicies)
            if max_value is None or current_max > max_value:
                max_value = current_max

    return max_value
# # Example usage
# rna_sequence = "GTTACGTAGCTAGCTAGTTAG"  # Example RNA sequence
# strand_direction = '+'  # Change to '-' for negative strand
# print("Splicing acceptor sites at indices:", acceptor_sites)



# Define the Ensembl gene ID
# gene_id = "ENSG00000157764"
# gene_id = 'ENSG00000141510' # TP53 which is a reverse transcript
gene_id = 'ENSG00000169174'  # forward strand 
trans = 'ENST00000302118'



if trans:
    print ( trans )
    transcripts_url = f"https://rest.ensembl.org/lookup/id/{gene_id}/transcripts?content-type=application/json"
    response_info = requests.get(transcripts_url)
    if response_info.status_code == 200:
        transcripts_data = response_info.json()
        strand = transcripts_data['strand']
        specified_path = "/mnt/c/Users/lajollalabs/dev/splice"
        filename = trans + '.json'
        file_path = os.path.join(specified_path, filename)
        startsite = 720
        if os.path.exists(file_path):
            obj = read_json_file ( file_path )
            transcripts_data = obj['transcript']
            attribution_scores_track = obj['acceptor_attr']
            startsite = find_max_out_indicies ( attribution_scores_track )
            print (' Start site is : ', startsite )
            if startsite < 720:
                startsite = 720
            time.sleep(5)  # Pauses the script for 10 seconds
        try:
            ensembl_rest_url = f"http://rest.ensembl.org/sequence/id/{trans}"
            headers = {"Content-Type": "text/plain"}
            response = requests.get(ensembl_rest_url, headers=headers)
            response.raise_for_status()  # Raise an error for bad responses
            sequence = ''
            temp = response.text.split ('\n')
            for line in temp:
                if not line.startswith('>'):
                    sequence += line.strip()
            attribution_scores_track = []
            acceptor_sites = find_splicing_acceptor_sites(sequence, strand)
            print ( acceptor_sites )
            incr = 0
            for site in acceptor_sites:
                print ( ' incr ' + str(incr) + ' site ' + str(site) + ' styart ' + str(startsite))
                
                if int(site) > int(startsite):
                    try:
                        print ( ' - - - - - - ')
                        attribution_scores = acceptor_attribution ( strand, sequence, site, 720 )
                        if attribution_scores:
                            attribution_scores_track.append ( {'site': site, 'scores':attribution_scores} )
                        incr+=1
                        if incr % 10 == 0:
                            print ( '\n saving\n\n\n\n\n\n' )
                            jason_obj = { 'transcript': transcripts_data, 'acceptor_attr': attribution_scores_track }
                            save_json_to_file(jason_obj, file_path)
                    except Exception as ee:
                        print ( ee )

            

            jason_obj = { 'transcript': transcripts_data, 'acceptor_attr': attribution_scores_track }
            file_path = os.path.join(specified_path, filename)
            save_json_to_file(jason_obj, file_path)


        except requests.RequestException as e:
            print(f"Error occurred: {e}")


else:
    # Define the Ensembl REST API URL for gene information
    gene_info_url = f"https://rest.ensembl.org/lookup/id/{gene_id}?content-type=application/json"

    # Make an HTTP GET request to retrieve gene information
    response_gene_info = requests.get(gene_info_url)

    # Check if the request for gene information was successful (HTTP status code 200)
    if response_gene_info.status_code == 200:
        # Parse the JSON response for gene information
        gene_info = response_gene_info.json()
        
        # Extract and print the gene name
        gene_name = gene_info['display_name']
        print(f"Gene Name: {gene_name}")
        
        # Extract and print the gene description
        gene_description = gene_info['description']
        print(f"Gene Description: {gene_description}")
        
        # Extract and print the gene start and end positions
        gene_start = gene_info['start']
        gene_end = gene_info['end']
        print(f"Gene Start: {gene_start}, Gene End: {gene_end}")
        
        # Define the Ensembl REST API URL for transcripts associated with the gene
        transcripts_url = f"https://rest.ensembl.org/lookup/id/{gene_id}/transcripts?content-type=application/json"
        
        # Make an HTTP GET request to retrieve transcripts
        response_transcripts = requests.get(transcripts_url)
        
        # Check if the request for transcripts was successful (HTTP status code 200)
        if response_transcripts.status_code == 200:
            # Parse the JSON response for transcripts
            transcripts_data = response_transcripts.json()
            # Extract and print the transcripts
            print ( transcripts_data )
            if transcripts_data['canonical_transcript']:
                trans = transcripts_data['canonical_transcript']
                strand = transcripts_data['strand']
                trans = trans.split('.')[0]
                specified_path = "/mnt/c/Users/lajollalabs/dev/splice"
                filename = trans + '.json'
                file_path = os.path.join(specified_path, filename)
                startsite = 720
                if os.path.exists(file_path):
                    obj = read_json_file ( file_path )
                    transcripts_data = obj['transcript']
                    attribution_scores_track = obj['acceptor_attr']
                    startsite = find_max_out_indicies ( attribution_scores_track )
                    print (' Start site is : ', startsite )
                    time.sleep(10)  # Pauses the script for 10 seconds

                
                
                try:
                    ensembl_rest_url = f"http://rest.ensembl.org/sequence/id/{trans}"
                    headers = {"Content-Type": "text/plain"}
                    response = requests.get(ensembl_rest_url, headers=headers)
                    response.raise_for_status()  # Raise an error for bad responses
                    sequence = ''
                    temp = response.text.split ('\n')
                    for line in temp:
                        if not line.startswith('>'):
                            sequence += line.strip()
                    attribution_scores_track = []
                    acceptor_sites = find_splicing_acceptor_sites(sequence, strand)
                    print ( acceptor_sites )
                    incr = 0
                    for site in acceptor_sites:
                        if site > startsite:
                            try:
                                attribution_scores = acceptor_attribution ( strand, sequence, site, 720 )
                                if attribution_scores:
                                    attribution_scores_track.append ( {'site': site, 'scores':attribution_scores} )
                                incr+=1
                                if incr % 10 == 0:
                                    print ( '\n saving\n\n\n\n\n\n' )
                                    jason_obj = { 'transcript': transcripts_data, 'acceptor_attr': attribution_scores_track }
                                    save_json_to_file(jason_obj, file_path)
                            except Exception as ee:
                                print ( ee )

                    

                    jason_obj = { 'transcript': transcripts_data, 'acceptor_attr': attribution_scores_track }
                    file_path = os.path.join(specified_path, filename)
                    save_json_to_file(jason_obj, file_path)


                except requests.RequestException as e:
                    print(f"Error occurred: {e}")
            
            # for transcript in transcripts:
            #     print(f"Transcript ID: {transcript['id']}")
            #     print(f"Transcript Description: {transcript['description']}\n")
        else:
            print(f"Failed to retrieve transcripts. Status code: {response_transcripts.status_code}")
    else:
        print(f"Failed to retrieve gene information. Status code: {response_gene_info.status_code}")

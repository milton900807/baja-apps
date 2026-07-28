from Bio.SeqUtils.ProtParam import ProteinAnalysis

def analyze_protein_sequence(sequence):
    analysis = ProteinAnalysis(sequence)
    molecular_weight = analysis.molecular_weight()
    aromaticity = analysis.aromaticity()
    isoelectric_point = analysis.isoelectric_point()
    amino_acids_percent = analysis.get_amino_acids_percent()
    return {
        "Molecular Weight": molecular_weight,
        "Aromaticity": aromaticity,
        "Isoelectric Point": isoelectric_point,
        "Amino Acids Percent": amino_acids_percent
    }


import requests

def submit_sequence_to_jpred(sequence):
    """
    Submits a protein sequence to the JPred API for secondary structure prediction.

    Parameters:
    - sequence (str): Amino acid sequence of the protein.

    Returns:
    - str: URL to the results page if submission is successful, otherwise an error message.
    """

    # Define the JPred API submission URL
    jpred_url = 'www.compbio.dundee.ac.uk/jpred4/cgi-bin/rest/job'

    # Prepare the data payload for the POST request
    data = {
        'seq': sequence,  # The protein sequence
        'format': 'fasta',  # The format of the sequence
        'skipPDB': 'on'  # Skip the PDB search
    }

    # Send the request to JPred
    try:
        response = requests.post(jpred_url, data=data)
        response.raise_for_status()  # Raise an error for bad responses
    except requests.RequestException as e:
        return f"An error occurred while submitting the sequence to JPred: {e}"

    # Extract the job ID from the response
    job_id = response.text.strip()

    # Construct the URL to the results page
    results_url = f"www.compbio.dundee.ac.uk/jpred4/results/{job_id}/{job_id}.html"

    return results_url

# Example usage
protein_sequence = "MENDELQQKRGIVEQCCTSICSLYQLENYCN"
results_url = submit_sequence_to_jpred(protein_sequence)
print(f"Your JPred secondary structure prediction is available at: {results_url}")


# Example usage
protein_sequence = "MENDELQQKRGIVEQCCTSICSLYQLENYCN"
result = analyze_protein_sequence(protein_sequence)
for key, value in result.items():
    print(f"{key}: {value}")

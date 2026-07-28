import pyBigWig

def extract_data_from_bigbed(bigbed_file, chromosome, start, end):
    # Open the BigBed file
    bb = pyBigWig.open(bigbed_file)
    
    # Fetch data within the specified genomic range
    data = bb.entries(chromosome, start, end)
    N = 10  # Number of entries to print (adjust as needed)
    for i, entry in enumerate(bb.entries(chromosome, start, end)):
        if i >= N:
            break
        print(entry)
    # Close the BigBed file
    bb.close()
    
    return data

if __name__ == "__main__":
    # Specify the path to your BigBed file
    bigbed_file = "/bd/elements.bb"
     	# 8:26354376-26361100
    # Specify the genomic range you want to extract data from
    chromosome = "6"
    start = 17598001
    # end = 248956422-230
    end = 17614000
    
    # Extract data
    data = extract_data_from_bigbed(bigbed_file, chromosome, start, end)
    
    # Process and use the data as needed
    for entry in data:
        # Each entry contains information like chromosome, start, end, value, etc.
        print(entry)

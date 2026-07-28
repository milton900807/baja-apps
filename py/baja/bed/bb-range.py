import pyBigWig

def print_genomic_ranges_from_bigbed(bigbed_file):
    # Open the BigBed file
    bb = pyBigWig.open(bigbed_file)
    
    chromosome = 'test'
    # Iterate through all entries in the BigBed file
    # for ch in bb.chroms():
    #     print ( f"chroms ${ch}")
    for chr, end in bb.chroms().items():
        print(f" Genomic Range: {chr}-{end}")
    
    # Close the BigBed file
    bb.close()

if __name__ == "__main__":
    # Specify the path to your BigBed file
    bigbed_file = "/bd/elements.bb"
    
    # Print genomic ranges from the BigBed file
    print_genomic_ranges_from_bigbed(bigbed_file)

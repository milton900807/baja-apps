from Bio import SeqIO
from ion import works
import json
import base64
import struct



ab1_file = str(works.param (1))

def base64_to_binary(base64_string):
    try:
        binary_data = base64.b64decode(base64_string)
        return binary_data
    except Exception as e:
        print(f"Error decoding Base64: {str(e)}")
        return None


# print (' ++++++++++++++++++++----------- ', str(ab1_file) )


def parse_ab1_file(ab1_data):
    try:
        # Define the format of the AB1 file header
        header_format = '<4s4s2i2h4i'

        # Unpack the header data from the binary
        header = struct.unpack(header_format, ab1_data[:50])

        # Create a dictionary to store the header fields
        ab1_header = {
            'magic_number': header[0],
            'version': header[1],
            'sample_name': header[2].decode('utf-8').rstrip('\x00'),
            'sample_size': header[3],
            'format_code': header[4],
            'data_size': header[5],
            'data_offset': header[6],
            'num_records': header[7],
        }

        # Extract the sequence data
        sequence_data = ab1_data[ab1_header['data_offset']:]
        sequence = sequence_data.decode('utf-8')
   # Extract Phred quality scores
        quality_data = ab1_data[ab1_header['data_offset'] + len(sequence_data):]
        phred_quality = list(struct.unpack(f"{len(sequence)}B", quality_data))

        # Add the sequence and Phred quality to the header dictionary
        ab1_header['sequence'] = sequence
        ab1_header['phred_quality'] = phred_quality

        # Return the AB1 header with the sequence
        return ab1_header
    except Exception as e:
        print(f"Error parsing AB1 file: {str(e)}")
        return None



ab1_bfile = base64_to_binary ( str(ab1_file) )
record = parse_ab1_file(ab1_bfile)

works.resolve ( {'sequence': record.sequence, "Quality scores:": record.quality  } )

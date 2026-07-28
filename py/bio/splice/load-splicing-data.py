import base64
import requests
import os
import json
import time
import json
import zipfile
from ion import works
import gzip
import io


def compress_json(json_obj):
    """
    Compresses a JSON object and returns the compressed binary data.

    :param json_obj: The JSON object to compress.
    :return: Compressed binary data.
    """
    # Serialize the JSON object to a JSON-formatted string
    json_str = json.dumps(json_obj)

    # Use gzip to compress the JSON string
    with io.BytesIO() as byte_stream:
        with gzip.GzipFile(fileobj=byte_stream, mode='wb') as gzip_file:
            gzip_file.write(json_str.encode('utf-8'))
        compressed_data = byte_stream.getvalue()
    base64_encoded_data = base64.b64encode(compressed_data)
    return base64_encoded_data

def read_file_from_zip(zip_file_path, target_file_name):
    """
    Reads a specific file from a ZIP archive and returns its content.

    :param zip_file_path: Path to the ZIP file.
    :param target_file_name: Name of the file within the ZIP archive to be read.
    :return: Content of the specified file, or None if the file is not found.
    """
    print ( ' ziping the json file ' )

    try:
        with zipfile.ZipFile(zip_file_path, 'r') as zipf:
            with zipf.open(target_file_name, 'r') as file:
                return file.read()
    except zipfile.BadZipFile:
        print("Error: Bad ZIP file.")
    except FileNotFoundError:
        print("Error: File not found in ZIP archive.")
    except Exception as e:
        print(f"An error occurred: {e}")

    return None


def zip_json(input_json_path, output_zip_path):
    """
    Compresses a JSON file into a ZIP file.

    :param input_json_path: Path to the input JSON file.
    :param output_zip_path: Path to the output ZIP file.
    """
    with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(input_json_path, arcname=input_json_path.split('/')[-1])


def post_json(data, url):
    response = requests.post(url, json=data)
    return response.json()

import json

def load_json_file(file_path):
    """
    Loads a JSON file and returns its contents as a JSON object.

    :param file_path: The path to the JSON file.
    :return: A JSON object containing the file's contents.
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


def find_file(root_dir, target_file_name):
    """
    Searches for a file with the specified name in the given directory and its subdirectories.

    :param root_dir: The directory to start the search from.
    :param target_file_name: The name of the file to search for.
    :return: The full path to the file if found, otherwise None.
    """
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if target_file_name in filenames:
            return os.path.join(dirpath, target_file_name)
    return None



def main():


    root_path = works.param (1)
    file_name = works.param (2)

    if not file_name.endswith('.json'):
            file_name += '.json'

    # file_path = '/mnt/c/Users/lajollalabs/dev/splice/ENST00000269305.json'
    file_path = find_file ( root_path, file_name )
    print ( file_path )
    json_data = load_json_file(file_path)
    zipFile = compress_json ( json_data )
    works.resolve( {'results': str(zipFile.decode('utf-8'))})



if __name__ == '__main__':
    main()

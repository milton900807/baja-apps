import PyPDF2
import sys
import tabula
import pandas as pd
import re
import sys
import tabula
import pytesseract
from PIL import Image
from tabula import read_pdf
import jpype
from pdf2image import pdfinfo_from_path, convert_from_path
import pandas as pd
import json

def extract_dna_rna_sequences(pdf_path):
    try:
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            num_pages = len(reader.pages)
            sequences = []
            for page in range(num_pages):
                content = reader.pages[page].extract_text()
                # print ( content )
                pattern = r'\b[A,C,G,T,U]{10,200}\b'
                matches = re.findall(pattern, content.upper())
                if matches:
                    sequences.extend(matches)
            return sequences
    except Exception as e:
        return f"Error: {e}"

def extract_targets_(pdf_path, gene_db):
    try:
        content=''
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            num_pages = len(reader.pages)
            targets = []

            for page in range(num_pages):
                try:
                    print ( ' extracting text... ')
                    content = reader.pages[page].extract_text()

                    content = content.replace('(', '').replace(')', '')
                    tg = gene_db.search('HGNC symbol', content)
                    targets.extend(tg)
                    print ( ' length of targets ')
                    print ( len(targets ))
                except Exception as ee:
                    print ( ' failed this content ', content )
            return targets
    except Exception as e:
        print ( content )
        print (f" - - - - - - - Error: {e}")
        return []


def extract_table_to_dataframe(text):
    # Find the part of the text that corresponds to the table
    table_text = re.search(r'Table.*?(\n\n|\Z)', text, re.DOTALL)

    if not table_text:
        return None

    # Split the found text into lines
    lines = table_text.group().split('\n')

    # Assuming the first line is the header
    headers = lines[0].split()
    rows = [line.split() for line in lines[1:] if line.strip()]

    # Create a DataFrame
    df = pd.DataFrame(rows, columns=headers)
    return df



# Define a function to extract and parse the table into a DataFrame
def extract_table_to_dataframe(text):
    # Find the table using regex
    table_text = re.search(r"TABLE.*?(\n\n|\Z)", text, re.DOTALL)

    if table_text:
        # Split the found text into lines and clean empty lines
        lines = [line.strip() for line in table_text.group().split('\n') if line.strip()]

        # Assuming the headers are the line after "Sequence ID"
        header_index = lines.index('Sequence ID') + 1
        headers = lines[header_index].split()

        # Assuming the table data starts after the headers
        table_data = lines[header_index + 1:]

        # Split each line into columns (assuming space as a separator)
        data_rows = [re.split(r'\s+', row) for row in table_data]

        # Create a DataFrame
        df = pd.DataFrame(data_rows, columns=headers)
        return df
    else:
        return None



def extract_dna_rna_sequences_from_tables(pdf_path):
    try:
        # Using tabula to extract tables from the PDF
        tables = tabula.read_pdf(pdf_path, pages='all', multiple_tables=True)
        sequence_tables = []

        for table in tables:
            # Applying a regular expression to each cell to find DNA/RNA sequences
            for col in table.columns:
                table[col] = table[col].astype(str)  #.apply(lambda x: re.findall(r'\b[AUGC]{5,}\b', x, re.IGNORECASE))
            # Filtering out rows where no sequences were found
            table = table[table.apply(lambda row: any(row), axis=1)]
            if not table.empty:
                sequence_tables.append(table)
        dna_sequences = set()  # Using a set for uniqueness
        pattern = r'\b[A,C,G,T,U]{12,200}\b'

        for table in tables:
            for _, row in table.iterrows():
                for cell in row:
                    if isinstance(cell, str):  # Ensure cell is a string
                        matches = re.findall(pattern, cell.upper())
                        for sequence in matches:
                            # Convert RNA to DNA and add to the set
                            dna_sequences.add(sequence.replace('U', 'T'))

        return list(dna_sequences)
    except Exception as e:
            return f"Error: {e}"



def ocr_pdf_images(pdf_path):
    try:
        # Convert PDF pages to images
        print ( ' getting the images ')
        # images = convert_from_path(pdf_path)
        CHUNK_SIZE = 10 # depends on your RAM
        MAX_PAGES = pdfinfo_from_path(pdf_path)["Pages"]

        for page in range(1, MAX_PAGES, CHUNK_SIZE):
            images = convert_from_path(pdf_path, first_page=page, last_page=page + CHUNK_SIZE - 1)
            ocr_results = []
            for i, image in enumerate(images):
                # Perform OCR on the image
                text = pytesseract.image_to_string(image)
                ocr_results.append({'page': i+1, 'text': text})  
                print ( text )

        return ocr_results
    except Exception as e:
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )
        print ( '---------------------------------      - --  -- - - - -- - - - - -- -- --- - -- ' )

        return f"Error: {e}"


def extract_and_convert_oligonucleotides(text):
    # Regular expression for DNA/RNA sequences between 10 to 200 bases long
    pattern = r'\b[A,C,G,T,U]{12,200}\b'
    # Finding all matches
    matches = re.findall(pattern, text.upper())
    # Convert RNA to DNA and remove duplicates
    converted_sequences = {sequence.replace('U', 'T') for sequence in matches}
    return list(converted_sequences)



class GeneDatabase:
    def __init__(self, file_path):
        # Load the CSV file into a DataFrame
        self.data = pd.read_csv(file_path)

    def search(self, column, search_text):
            # Search for the text in the specified column and return indices
            l = []
            if column in self.data.columns:
                matched_indices = self.data.index[self.data[column].astype(str).str.contains(search_text, case=False, na=False)].tolist()
                for idx in matched_indices: 
                    s = str(self.data.loc[idx])
                    tem = re.sub(r'\s+', '', s)
                    l.append(tem)
                return l
            else:
                return []
# Example usage
            

def save_sequences_to_json(sequences, file_path):
    # Serialize the list of sequences into a JSON-formatted string
    json_data = json.dumps(sequences)

    # Write the JSON string to a file
    with open(file_path, 'w') as file:
        file.write(json_data)
import os


# Replace 'your_directory_path'


def is_series(obj):
    return isinstance(obj, pd.Series)


def main():
    directory = '/mnt/c/Users/lajollalabs/Downloads'
    output_directory = '/mnt/c/Users/lajollalabs/dev/patents'
    # Check if a file path argument is provided
    for filename in os.listdir(directory):
        if filename.endswith('.pdf'):
            file_path = os.path.join(directory, filename)
            pdf_path = file_path #'/mnt/c/Users/lajollalabs/Downloads/US20050159382A1.pdf'
            sequence_list = [] 
            targets = []
            file_path = './gene-transcript-ids.csv'  # Replace with the path to your CSV file
            gene_db = GeneDatabase(file_path)
            targets = extract_targets_ ( pdf_path,  gene_db )
            # Example search - replace 'HGNC symbol' and 'BRCA1' with your search criteria
            json_file_path = os.path.join(output_directory, filename.rsplit('.', 1)[0] + '.json')
            sequence_list = extract_dna_rna_sequences(pdf_path)
            print ( sequence_list )
            sequences_from_tables = extract_dna_rna_sequences_from_tables  ( pdf_path )
            sequence_list.extend ( sequences_from_tables )
            sequence_list = list(set(sequence_list))

            js = { 'status': 'tables-text-complete', 'sequence': sequence_list, 'targets': targets }
            save_sequences_to_json ( js, json_file_path )



            ocr_results = ocr_pdf_images(pdf_path)
            for result in ocr_results:
                    print(result['text'])
                    print("\n")
                    s = extract_and_convert_oligonucleotides ( result['text'])
                    sequence_list.extend ( s )
                    sequence_list = list(set(sequence_list))

                    try: 
                        content =  result['text']
                        t = gene_db.search('HGNC symbol', content)
                        targets.extend ( t )
                    except Exception as e:
                        print( f"Error: {e}" )
                        print( f"Error: {e}" )

                    # print(indices)
                    # print ( dff )
                    # print(f"Page {ocr_results} OCR Text:")

            sequence_list = list(set(sequence_list))
            targets = list(set(targets))
            js = { 'status': 'tables-text-complete', 'sequence': sequence_list, 'targets': targets }
            save_sequences_to_json ( js, json_file_path )
            exit()


if __name__ == "__main__":
    main()

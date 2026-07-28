import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import re
import io
import pandas as pd

# Configure pytesseract path if needed
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Function to extract tables from PDF and perform OCR
def extract_tables_from_pdf(pdf_path):
    pdf_document = fitz.open(pdf_path)
    extracted_text = ""
    
    for page_num in range(len(pdf_document)):
        page = pdf_document.load_page(page_num)
        images = page.get_images(full=True)
        
        for img_index, img in enumerate(images):
            xref = img[0]
            base_image = pdf_document.extract_image(xref)
            image_bytes = base_image["image"]
            image = Image.open(io.BytesIO(image_bytes))
            
            # Perform OCR on image
            text = pytesseract.image_to_string(image)
            extracted_text += text + "\n"
        
        # Extract text directly from the page
        page_text = page.get_text("dict")
        if "blocks" in page_text:
            for block in page_text["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            extracted_text += span["text"] + "\n"
        
    return extracted_text

# Function to extract tables with SEQ IDs and associated sequences
def extract_seq_table(text):
    table_pattern = r'(SEQ ID NO: \d+.*?)[\n\r]+'  # Match lines with SEQ ID and sequences
    tables = re.findall(table_pattern, text, re.DOTALL)
    seq_data = []
    
    for table in tables:
        seq_id_pattern = r'SEQ ID NO: \d+'
        dna_pattern = r'[ACGT]{10,}'
        
        seq_ids = re.findall(seq_id_pattern, table)
        dna_sequences = re.findall(dna_pattern, table)
        seq_data.extend(list(zip(seq_ids, dna_sequences)))
    
    return seq_data

if __name__ == "__main__":
    pdf_path = 'example.pdf'  # Path to your PDF file
    text = extract_tables_from_pdf(pdf_path)
    seq_data = extract_seq_table(text)
    
    # Create DataFrame for output
    df = pd.DataFrame(seq_data, columns=["SEQ ID", "Sequence"])
    
    # Save to CSV or Excel
    df.to_csv('extracted_seq_table.csv', index=False)
    
    print("Extracted SEQ ID and DNA Sequences from Tables:")
    print(df)

import fitz  # PyMuPDF
import re
import sys
import requests
from pathlib import Path

CROSSREF_API = "https://api.crossref.org/works/"

def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def find_doi(text):
    doi_pattern = r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+"
    match = re.search(doi_pattern, text, re.I)
    return match.group(0) if match else None

def get_date_from_crossref(doi):
    try:
        response = requests.get(CROSSREF_API + doi, timeout=10)
        if response.status_code == 200:
            data = response.json()
            date_parts = (
                data.get("message", {})
                    .get("issued", {})
                    .get("date-parts", [[]])[0]
            )
            if date_parts:
                # Return most complete date possible
                date_str = "-".join(map(str, date_parts))
                return date_str
    except Exception as e:
        print(f"⚠️ Crossref lookup failed for DOI {doi}: {e}")
    return None

import datetime

def extract_date_from_text(text):
    # Prefer structured date formats from citations (e.g., "2021 January 06")
    patterns = [
        # e.g., "2021 January 06"
        r"\b(\d{4})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b",
        # e.g., "January 06, 2021"
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b",
        # e.g., "2021-01-06"
        r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b",
        # fallback: "January 2021"
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b",
        # fallback: just year
        r"\b(19|20)\d{2}\b"
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            try:
                if len(match) == 3:
                    # e.g., (2021, "January", 6)
                    if isinstance(match[1], str) and match[1].isalpha():
                        dt = datetime.datetime.strptime(f"{match[0]} {match[1]} {match[2]}", "%Y %B %d")
                    else:  # e.g., (2021, 01, 06)
                        dt = datetime.datetime.strptime(f"{match[0]}-{match[1]}-{match[2]}", "%Y-%m-%d")
                elif len(match) == 2:  # e.g., ("January", 2021)
                    dt = datetime.datetime.strptime(f"{match[1]} {match[0]}", "%Y %B")
                elif len(match) == 1:
                    return match[0]
                return dt.strftime("%Y%m%d")
            except Exception:
                continue
    return None

def sanitize_date_string(date_str):
    return re.sub(r'[^\w]', '', date_str)

def find_citation(text):
    lines = text.splitlines()
    potential_citation = []
    for line in lines[:30]:
        if len(line.strip()) > 20:
            potential_citation.append(line.strip())
        if len(potential_citation) >= 3:
            break
    return " ".join(potential_citation) if potential_citation else "Unknown"

def rename_pdf(original_path, date_str):
    sanitized_date = sanitize_date_string(date_str)
    path = Path(original_path)
    new_name = f"{sanitized_date}{path.suffix}"
    new_path = path.with_name(new_name)

    # Avoid overwriting existing files
    counter = 1
    while new_path.exists():
        new_name = f"{sanitized_date}_{counter}{path.suffix}"
        new_path = path.with_name(new_name)
        counter += 1

    try:
        path.rename(new_path)
        return new_path
    except Exception as e:
        print(f"❌ Could not rename {original_path}: {e}")
        return path

def process_pdf_file(pdf_path):
    print(f"\n📄 Processing: {pdf_path}")
    try:
        text = extract_text_from_pdf(pdf_path)
        doi = find_doi(text)
        pub_date = None

        if doi:
            print(f"🔗 Found DOI: {doi}")
            pub_date = get_date_from_crossref(doi)
            if pub_date:
                print(f"📅 Date from Crossref: {pub_date}")

        if not pub_date:
            print("🔍 Trying to extract date from PDF text...")
            pub_date = extract_date_from_text(text)
            if pub_date:
                print(f"📅 Date from text: {pub_date}")

        if pub_date:
            new_path = rename_pdf(pdf_path, pub_date)
            print(f"✅ Renamed to: {new_path.name}")
        else:
            print("⚠️ No publication date found — skipping rename.")

    except Exception as e:
        print(f"❌ Failed to process {pdf_path}: {e}")

def process_directory(directory):
    pdf_files = list(Path(directory).rglob("*.pdf"))
    if not pdf_files:
        print("No PDF files found.")
        return
    for pdf_file in pdf_files:
        process_pdf_file(pdf_file)

def main(input_path):
    path = Path(input_path)
    if not path.exists():
        print(f"❌ Path does not exist: {input_path}")
        return
    if path.is_file() and path.suffix.lower() == ".pdf":
        process_pdf_file(path)
    elif path.is_dir():
        process_directory(path)
    else:
        print(f"⚠️ Unsupported input: {input_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python batch_extract_and_rename_with_doi.py <pdf_file_or_directory>")
    else:
        main(sys.argv[1])

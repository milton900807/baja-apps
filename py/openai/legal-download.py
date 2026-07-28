#!/usr/bin/env python3
"""
download_courtlistener.py

Downloads CourtListener opinions for a date range and writes a single CSV
with columns: Title, Date, Summary, Plaintiff, Defendant, Location, SourceURL

Adjust date_from/date_to as needed (YYYY-MM-DD). Courtesy delay included.
"""

import requests, time, csv, re, sys
from datetime import date, timedelta
import pandas as pd
import zipfile
import io

# === USER CONFIG ===
date_from = (date.today() - timedelta(days=365*10)).isoformat()  # last 10 years
date_to   = date.today().isoformat()
output_csv = "court_opinions_{}_to_{}.csv".format(date_from, date_to)
output_zip = output_csv.replace(".csv", ".zip")

# CourtListener opinions endpoint
BASE = "https://www.courtlistener.com/api/rest/v3/opinions/"

# Simple party parser
def split_parties(case_name):
    # common separators
    # Try " v. " or " v " or " vs. " or " vs "
    if not case_name:
        return "", ""
    # normalize whitespace
    s = case_name.strip()
    # typical separators
    for sep in [" v. ", " v ", " vs. ", " vs ", " v.  ", " v  "]:
        if sep in s:
            left, right = s.split(sep, 1)
            # sometimes "et al." occurs; we keep as-is
            return left.strip(), right.strip()
    # fallback: "In re" or "Ex parte" - put entire case_name into Title and leave parties blank
    return "", ""

def fetch_opinions(date_from, date_to, max_pages=None):
    params = {
        "date_filed_min": date_from,
        "date_filed_max": date_to,
        "page_size": 100  # max page size
    }
    url = BASE
    rows = []
    page = 1
    while url:
        print(f"Fetching page {page} -> {url}")
        r = requests.get(url, params=params if page==1 else None, timeout=30)
        if r.status_code != 200:
            print("HTTP error", r.status_code, r.text)
            break
        j = r.json()
        results = j.get("results", [])
        for item in results:
            title = item.get("case_name") or item.get("name") or ""
            date_filed = item.get("date_filed") or item.get("date_created") or ""
            # short summary: try to use 'plain_text' excerpt or 'excerpt' if available
            summary = item.get("absolute_url","")
            # attempt to fetch a short excerpt if available in metadata fields:
            excerpt = item.get("excerpt") or ""
            # party parsing
            plaintiff, defendant = split_parties(title)
            location = item.get("court") or item.get("parent_cluster") or ""
            source_url = "https://www.courtlistener.com" + item.get("absolute_url", "")
            rows.append({
                "Title": title,
                "Date": date_filed,
                "Summary": excerpt,
                "Plaintiff": plaintiff,
                "Defendant": defendant,
                "Location": location,
                "SourceURL": source_url
            })
        # pagination
        url = j.get("next")  # CourtListener returns full next URL or null
        page += 1
        # courtesy delay
        time.sleep(0.5)
        if max_pages and page > max_pages:
            break
    return rows

def save_csv(rows, filename):
    df = pd.DataFrame(rows, columns=["Title","Date","Summary","Plaintiff","Defendant","Location","SourceURL"])
    df.to_csv(filename, index=False)
    print("Saved", filename)

def zip_file(csv_path, zip_path):
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(csv_path)
    print("Zipped to", zip_path)

if __name__ == "__main__":
    print("Date range:", date_from, "to", date_to)
    rows = fetch_opinions(date_from, date_to, max_pages=None)
    print("Total records fetched:", len(rows))
    save_csv(rows, output_csv)
    zip_file(output_csv, output_zip)
    print("Done. CSV:", output_csv, "ZIP:", output_zip)

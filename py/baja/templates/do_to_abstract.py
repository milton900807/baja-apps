import requests
import re
import sys

from ion import works
doi = works.param(1)



def get_abstract_from_doi(doi):
    url = f"https://api.crossref.org/works/{doi}"

    try:
        response = requests.get(url, headers={'Accept': 'application/json'})
        response.raise_for_status()
        data = response.json()

        abstract = data['message'].get('abstract')
        if abstract:
            # Remove XML/HTML tags (CrossRef uses JATS XML for abstracts)
            plain_text = re.sub(r'</?[^>]+>', '', abstract)
            return plain_text.strip()
        else:
            return "No abstract available."

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return "Error fetching abstract."



abstract = get_abstract_from_doi(doi)

works.resolve(abstract)


import requests

def get_abstract_from_doi(doi: str) -> str:
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {
        "query": f"doi:{doi}",
        "format": "json",
        "resultType": "core"  # <--- key change
    }
    response = requests.get(url, params=params)
    if response.status_code != 200:
        return f"Error: HTTP {response.status_code} when searching for DOI {doi}"
    data = response.json()
    results = data.get("resultList", {}).get("result", [])
    if not results:
        return f"No results found for DOI {doi}"
    abstract = results[0].get("abstractText")
    return abstract or "Abstract -----not available."

# ✅ Try it
doi = "10.1038/mt.2008.141"
abstract = get_abstract_from_doi(doi)
print(f"Abstract for {doi}:\n\n{abstract}")

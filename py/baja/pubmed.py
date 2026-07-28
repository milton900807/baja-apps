import requests
from ion import works

pubmed_id = works.param (1)

def fetch_pubmed_article_details(pubmed_id):
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pubmed_id}&retmode=json"
    response = requests.get(url)
    if response.status_code == 200:
        summary = response.json()
        result = summary['result'][str(pubmed_id)]
        title = result.get('title', 'N/A')
        authors = ", ".join([author['name'] for author in result.get('authors', [])])
        abstract_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pubmed_id}&retmode=text&rettype=abstract"
        abstract_response = requests.get(abstract_url)
        abstract = abstract_response.text.strip()
        pubdate = result.get('pubdate', 'N/A')

        return {
            "Title": title,
            "Abstract": abstract,
            "Authors": authors,
            "Publication Date": pubdate
        }
    else:
        return None


res = fetch_pubmed_article_details ( pubmed_id )
works.progress ( 100 )
works.resolve (res)

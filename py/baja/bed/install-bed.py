import os
import requests
from msgraph import api
import msal
import json
import sys
from ion import works 
import tempfile


global accessToken
global requestHeaders
global tokenExpiry

accessToken = None
requestHeaders = None
tokenExpiry = None

def download_file(url, local_filename):
    # print ( ' downloading file ', url )
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(local_filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192): 
                print ( 'writing...' )
                # If you have chunk encoded response uncomment if
                # and set chunk_size parameter to None.
                #if chunk:
                f.write(chunk)
    return local_filename




lib_id = works.param (1)
file_id = works.param (2)
print ( ' lib id ', lib_id )
print ( ' file id ', file_id )

tenant_id = os.environ.get('LJL_TENTANT_ID')
client_id = os.environ.get('LJL_CLIENT_ID')
thumbprint = os.environ.get('THUMPRINT')
certfile = os.environ.get ('APP_CERT_PATH')

print ( ' TENANT ', tenant_id )
print ( ' CLIENT ', client_id )
print ( ' Tumb ', thumbprint )
print ( ' CERT ', certfile )



scope = ["Files.Read", "Files.ReadWrite", "Files.Read.All", "Files.ReadWrite.All", "Sites.Read.All", "Sites.ReadWrite.All"]
loc = os.getcwd()
authority = 'https://login.microsoftonline.com/' + tenant_id
scope = ["https://graph.microsoft.com/.default"]
app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential={"thumbprint": thumbprint, "private_key": open(certfile).read()})
result = app.acquire_token_for_client(scopes=scope)
graphURI = 'https://graph.microsoft.com'
accessToken = result['access_token']

if "access_token" in result:
    # Calling graph using the access token
    graph_data = requests.get(  # Use token to call downstream service
        #graphURI + f'/v1.0/drives/b!86hXQnbtE0-4i4JDby_65X8LojS21wBIvli_L0-ILWTNv-YsbSFDRYIqvjK1Zf6E/items/01NPPQVZGTHODZN2QAA5CJ7WQJE7SX6Q4L/content',
        graphURI + f'/v1.0/drives/{lib_id}/items/{file_id}',
        headers={'Authorization': 'Bearer ' + result['access_token']},)
    
    print (':::', graph_data.text )
    l = json.loads(graph_data.text)
    print ( ' nioame '+ l['name'])
    if l['@microsoft.graph.downloadUrl'] is not None:
        url = l['@microsoft.graph.downloadUrl']
        print ( 'downloading...' + url )
        # filename= download_file(url, "temp")        
        filename= download_file(url, '/tmp/' + l['name'])
        works.resolve ( {'pathob': '/tmp/'+ l['name']})
else:
    print(result.get("error"))
    print(result.get("error_description"))
    print(result.get("correlation_id"))  # You may need this w

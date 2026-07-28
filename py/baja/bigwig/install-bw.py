import os
import requests
from msgraph import api
import msal
import json
import sys
from ion import works 
import tempfile
import subprocess
import command
import random 


global accessToken
global requestHeaders
global tokenExpiry

accessToken = None
requestHeaders = None
tokenExpiry = None

def download_file(size, url, local_filename):
    print ( ' downloading file ', url )
    works.msg ( 'Downloading...' + str(size) )

    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        filesize = size
        works.msg ( ' File size ' + str(filesize) )
        totalsize = 0
        total_downloaded = 0
        with open(local_filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192): 
                # If you have chunk encoded response uncomment if
                # and set chunk_size parameter to None.
                #if chunk:
                f.write(chunk)
                totalsize += 8192
                total_downloaded = totalsize/filesize*100
                works.progress(total_downloaded)
    return local_filename

lib_id = works.param (1)
file_id = works.param (2)
print ( ' lib id ', lib_id )
print ( ' file id ', file_id )
print ( ' we are looking for the environment variables ')

tenant_id = os.environ.get('LJL_TENTANT_ID')
client_id = os.environ.get('LJL_CLIENT_ID')
thumbprint = os.environ.get('THUMPRINT')
certfile = os.environ.get ('APP_CERT_PATH')

print ( ' Looking for tenant id: ')
print ( ' tenant id ' + tenant_id )
print ( ' Looking for client id: ')
print ( ' client id ' + client_id )
print ( ' Looking for thumbprint: ')
print ( ' thumbprint ' + thumbprint )
print ( ' Looking for certfile: ')
print ( ' cert path ' + certfile )


scope = ["Files.Read", "Files.ReadWrite", "Files.Read.All", "Files.ReadWrite.All", "Sites.Read.All", "Sites.ReadWrite.All"]
loc = os.getcwd()


authority = 'https://login.microsoftonline.com/' + tenant_id

scope = ["https://graph.microsoft.com/.default"]

works.msg ( 'Connecting to onedrive...' )


app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential={"thumbprint": thumbprint, "private_key": open(certfile).read()})
result = app.acquire_token_for_client(scopes=scope)
graphURI = 'https://graph.microsoft.com'
accessToken = result['access_token']
#print ( ' access token ' + accessToken )

if "access_token" in result:
    # Calling graph using the access token
    graph_data = requests.get(  # Use token to call downstream service
        #graphURI + f'/v1.0/drivesq/b!86hXQnbtE0-4i4JDby_65X8LojS21wBIvli_L0-ILWTNv-YsbSFDRYIqvjK1Zf6E/items/01NPPQVZGTHODZN2QAA5CJ7WQJE7SX6Q4L/content',
        graphURI + f'/v1.0/drives/{lib_id}/items/{file_id}',
        headers={'Authorization': 'Bearer ' + result['access_token']},)
    print ( ' graph data ' + graph_data.text )
    l = json.loads(graph_data.text)
    print ( ' nioame '+ l['name'])
    if l['@microsoft.graph.downloadUrl'] is not None:
        url = l['@microsoft.graph.downloadUrl']
        size = l['size']
        # filename= download_file(url, "temp")        
        filename= download_file(size, url, '/tmp/' + l['name'])
        works.progress ( 100 )
        works.msg ( 'Index complete ')

        works.resolve ( {'pathob': '/tmp/'+ l['name']})
else:
    print(result.get("error"))
    print(result.get("error_description"))
    print(result.get("correlation_id"))  # You may need this w

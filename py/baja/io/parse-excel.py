import pandas as pd
import requests
import json
import os
import requests
from msgraph import api
import msal
import json
from ion import works 
import tempfile
import subprocess
import random 

global accessToken
global requestHeaders
global tokenExpiry
accessToken = None
requestHeaders = None
tokenExpiry = None
library_id = works.param (1)
file_id = works.param (2)
tenant_id = os.environ.get('LJL_TENTANT_ID')
client_id = os.environ.get('LJL_CLIENT_ID')
thumbprint = os.environ.get('THUMPRINT')
certfile = os.environ.get ('APP_CERT_PATH')

authority = 'https://login.microsoftonline.com/' + tenant_id
scope = ["https://graph.microsoft.com/.default"]
works.msg ( 'Connecting to onedrive...' )
app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential={"thumbprint": thumbprint, "private_key": open(certfile).read()})
result = app.acquire_token_for_client(scopes=scope)
graphURI = 'https://graph.microsoft.com'
accessToken = result['access_token']
url = f'https://graph.microsoft.com/v1.0/drives/{library_id}/items/{file_id}/workbook/worksheets/Specsheet/usedRange'
headers = {
    'Authorization': 'Bearer ' + accessToken
}
response = requests.get(url, headers=headers)
response_json = response.json()
# Parse the Excel data into a pandas DataFrame.
data = response_json['values']
df = pd.DataFrame(data[1:], columns=data[0])
well_positions = df[['Plate Name', 'Plate Barcode', 'Sequence Name', 'Well Position', 'Sequence', 'nmoles']]


works.resolve ( json.loads(well_positions.to_json()) )
# xl = pd.ExcelFile(file_path)
# # Load the 'Specsheet' sheet into a pandas DataFrame
# specsheet_df = xl.parse('Specsheet')
# Plate Name
# Payment Method
# Plate Barcode
# Sales Order #
# Reference #
# Well Position
# Sequence Name
# Sequence
# Manufacturing ID
# Measured Molecular Weight
# Calculated Molecular Weight
# OD260
# nmoles
# µg
# Measured Concentration µM
# Final Volume µL
# Extinction Coefficient L/(mole·cm)
# Tm
# Well Barcode
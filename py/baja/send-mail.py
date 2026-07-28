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

userid = works.param (1)
msg = works.param (2)

msg = json.loads ( msg )

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
#scope = ["Mail.Send"]


authority = 'https://login.microsoftonline.com/' + tenant_id

scope = ["https://graph.microsoft.com/.default"]
works.msg ( 'Connecting to onedrive...' )

app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential={"thumbprint": thumbprint, "private_key": open(certfile).read()})
result = app.acquire_token_for_client(scopes=scope)
print(json.dumps(msg, indent = 4))


graphURI = 'https://graph.microsoft.com'


accessToken = result['access_token']

# userid = "milton@lajollalabs.com"
endpoint = f'https://graph.microsoft.com/v1.0/users/{userid}/sendMail'
toUserEmail = "milton@lajollalabs.com"
email_msg = {'Message': {'Subject': "Test Sending Email from Python",
                            'Body': {'ContentType': 'Text', 'Content': "This is a test email."},
                            'ToRecipients': [{'EmailAddress': {'Address': toUserEmail}}]
                            },
                'SaveToSentItems': 'true'}





if "access_token" in result:
    print ( ' access token ' + accessToken )

    print ( 'userid', userid )
    try: 
        gur = graphURI + f'/v1.0/users/' + userid + '/sendMail'
        print ( gur )
        graph_data = requests.post(gur, headers={'Authorization': 'Bearer ' + result['access_token']},json=msg)
        print ( ' --- ')
    except:
        print("Failed: exception ")
    print ( graph_data )
    if graph_data.ok:
        works.msg('Sent email successfully')
    else:
        works.msg('failed ')




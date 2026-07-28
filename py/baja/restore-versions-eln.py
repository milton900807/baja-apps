import datetime
import os
import requests
from msgraph import api
import msal
import json
import sys

global accessToken
global requestHeaders
global tokenExpiry
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
accessToken = None
requestHeaders = None
tokenExpiry = None


def find_version_to_restore(access_token, file_id, target_datetime):
    """Find the version of the file closest to but not after the target datetime."""
    versions_url = f'https://graph.microsoft.com/v1.0/me/drive/items/{file_id}/versions'
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.get(versions_url, headers=headers)
    response.raise_for_status()  # This will raise an exception for HTTP error responses
    
    versions = response.json()['value']
    target_version = None
    min_time_difference = float('inf')
    
    for version in versions:
        version_datetime = version['lastModifiedDateTime']
        time_difference = (pd.to_datetime(target_datetime) - pd.to_datetime(version_datetime)).total_seconds()
        
        if 0 <= time_difference < min_time_difference:
            min_time_difference = time_difference
            target_version = version
    
    return target_version

def download_file(url, token):
    """Downloads file from Microsoft Graph and returns the content."""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"Failed to download file: {response.status_code} {response.text}")

def get_headers(access_token):
    """Return headers for the HTTP request including the authorization token."""
    return {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

def verify(drive_id, path, access_token):
    base_url = f'https://graph.microsoft.com/v1.0/drives/{drive_id}/root:/bajabio-xfiles/reg/{path}'
    headers = get_headers(access_token)
    response = requests.get(base_url, headers=headers)
    if response.status_code == 200:
        return response.json()
    elif response.status_code == 404:
            print ( base_url )
            raise Exception(f"Failed to create folder: {response.status_code} {response.text}")
    else:
        raise Exception(f"Error checking folder: {response.status_code} {response.text}")


def list_file_versions(drive_id, item_id, access_token):
    """ List all versions of a file. """
    versions_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions"
    response = requests.get(versions_url, headers=get_headers(access_token))
    if response.status_code == 200:
        return response.json().get('value', [])
    else:
        raise Exception(f"Failed to list file versions: {response.status_code} {response.text}")

def restore_file_version(drive_id, item_id, version_id, access_token):
    """ Restore a specific version of a file. """
    restore_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions/{version_id}/restoreVersion"
    response = requests.post(restore_url, headers=get_headers(access_token))
    if response.status_code in [200, 204]:
        print("Version restored successfully.")
    else:
        raise Exception(f"Failed to restore file version: {response.status_code} {response.text}")

def restore_file_to_date(drive_id, item_id, target_date_str, access_token):
    target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d")
    versions = list_file_versions(drive_id, item_id, access_token)

    closest_version = None
    min_time_diff = datetime.timedelta.max

    for version in versions:
        version_date = datetime.datetime.strptime(version['lastModifiedDateTime'], "%Y-%m-%dT%H:%M:%SZ")
        time_diff = target_date - version_date
        time_diff = abs ( time_diff )


        if time_diff >= datetime.timedelta(0) and time_diff < min_time_diff:
            closest_version = version
            min_time_diff = time_diff

    if closest_version:
        print(f"Restoring to version created on: {closest_version['lastModifiedDateTime']}")
        restore_file_version(drive_id, item_id, closest_version['id'], access_token)
    else:
        print("No suitable version found to restore.")

    
def extract_tracks(json_data, access_token, drive_id):
    if 'track' in json_data:
        tracks = json_data['track']
        for t in tracks:
            for o in t["oligos"]:
                libid = o.get('libID')
                if not o.get('libID'):
                    current_datetime = datetime.datetime.now().isoformat()
                    o['libID'] = f"{drive_id}lj{o['id']}T{current_datetime}"
                    structure = o['structure'].replace('[', '_').replace(']', '_').replace('{', '_')
                    filename = f"{structure}{o['id']}.json"
                    prefix = o['sequence'][:4]
                    folder_path = f"{o['type']}/{prefix}/{o['sequence']}"
                    folder = verify(drive_id, folder_path, access_token)
                    folderid = folder['id']
                    parentpath = f"/drives/{drive_id}/items/{folderid}"
                    f = f"{parentpath}:/{filename}"
                    fb = f"https://graph.microsoft.com/v1.0{f}"
# 3/31/2023
                    graph_data = requests.get(  # Use token to call downstream service
                                    fb,
                            headers={'Authorization': 'Bearer ' + access_token},)
                    l = json.loads(graph_data.text)
# 3/31/2023
                    restore_file_to_date ( drive_id, l['id'], '2023-03-31', access_token)

                    graph_data = requests.get(  # Use token to call downstream service
                                    fb,
                            headers={'Authorization': 'Bearer ' + access_token},)
                    l = json.loads(graph_data.text)
                    url = l['@microsoft.graph.downloadUrl']
                    file = download_file ( url, access_token)
                    print ( file )
                    
                    
                    

def main(json_response):
    try:
        
        tenant = 'b543ef7e-428b-4226-ad00-99b67b843915';
        client_id = 'c3e5ffbc-9b1c-44a5-93b6-7cb909b42481';
        driveID = "b!n_SZ5sO9vEWdFy6SfhhA30xjA4ZiOXJAsJN0raZO8Zq3lL0r4nmUTJ42OiFEo6YZ"
        scope = ["Files.Read", "Files.ReadWrite", "Files.Read.All", "Files.ReadWrite.All", "Sites.Read.All", "Sites.ReadWrite.All"]
        loc = os.getcwd()
        thumbprint = "63D5FE17A9A425A0CD34BA9365E5E8B775CF736A"#os.environ.get ('THUMBPRINT')
        certfile = './eln.pem'
        authority = 'https://login.microsoftonline.com/' + tenant
        scope = ["https://graph.microsoft.com/.default"]
        print ( thumbprint )
        app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential={"thumbprint": thumbprint, "private_key": open(certfile).read()})
        result = app.acquire_token_for_client(scopes=scope)
        print ( result )
        
        if "access_token" in result:
            accessToken = result['access_token']
            graph_data = requests.get(  # Use token to call downstream service
                f'https://graph.microsoft.com/v1.0/drives/{driveID}/items/01EKTSVC5AHSPDRXZ4DBHKVUUDIJBWZP7U',
                headers={'Authorization': 'Bearer ' + result['access_token']},)
            l = json.loads(graph_data.text)
            print ( ' nioame ', l)
            if '@microsoft.graph.downloadUrl' in l:
                url = l['@microsoft.graph.downloadUrl']
                print ( 'downloading...')
                file_content = download_file(url, accessToken)
                file_json = json.loads(file_content.decode('utf-8'))
                extract_tracks(file_json, accessToken, driveID)
        else:
            print(result.get("error"))
            print(result.get("error_description"))
            print(result.get("correlation_id"))  # You may need this w



        
        
        
        
        # Parse the JSON response
    except Exception as e:
        print(f"An error occurred: {e}")


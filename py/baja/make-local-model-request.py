import json
import sys
from ion import works
import glob
import requests

print ( sys.argv )

url = works.param(1)
sequence = works.param(2)
xi = works.param(3)
xf = works.param(4)
strand = works.param(5)
attribution_site = works.param(6)

body = {
        "signature_name": "serving_default", \
        "inputs": { \
            "sequence" : [sequence], \
            "xi" : [xi], \
            "xf" : [xf], \
            "strand" : [str(strand)], \
            "attribution_site" : [attribution_site], \
            },
    }

req = requests.post(url,data=json.dumps(body))


works.resolve ( {'values': json.dumps(json.loads(req.text)) } )





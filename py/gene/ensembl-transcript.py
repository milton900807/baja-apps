import os
import sys
import json
import platform
import requests
import importlib.metadata

from ion import works

symbol = works.param(1)
species = works.param(2)


def lookup_gene_symbol(species, symbol):
    url = f"http://rest.ensembl.org/lookup/symbol/{species}"

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    response = requests.post(
        url,
        headers=headers,
        data=json.dumps({"symbols": [symbol]})
    )

    if response.status_code == 200:
        return response.json()

    return {
        "error": f"Received status code {response.status_code}",
        "status_code": response.status_code,
        "text": response.text,
    }


def get_environment():
    try:
        installed_packages = {
            dist.metadata["Name"]: dist.version
            for dist in importlib.metadata.distributions()
        }
    except Exception:
        installed_packages = {}

    return {
        "python": {
            "version": sys.version,
            "version_info": list(sys.version_info),
            "executable": sys.executable,
            "prefix": sys.prefix,
            "path": sys.path,
        },
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "platform": platform.platform(),
            "python_implementation": platform.python_implementation(),
            "hostname": platform.node(),
        },
        "process": {
            "pid": os.getpid(),
            "cwd": os.getcwd(),
        },
        "environment_variables": dict(os.environ),
        "installed_packages": installed_packages,
    }


if not species:
    species = "homo_sapiens"

result = {} #lookup_gene_symbol(species, symbol)

works.resolve({
    "query": {
        "symbol": symbol,
        "species": species,
    },
    "ensembl_result": result,
    "environment": get_environment(),
})
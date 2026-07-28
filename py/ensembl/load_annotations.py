import re
import pandas as pd
import requests
from ion import works

# -----------------------------
# Optional: mapping table setup
# -----------------------------
# If df is injected externally, keep it.
# Otherwise load it here (if allowed).
# df = pd.DataFrame(data)
# df = pd.read_csv("/path/to/mapping.csv")


def map_ncbi_to_ensembl(ncbi_ids):
    if isinstance(ncbi_ids, list):
        ncbi_ids = ",".join(ncbi_ids)

    ncbi_ids_list = re.split(r"[,\s;]+|\n+", str(ncbi_ids).strip())
    ensembl_ids = []
    for ncbi_id in ncbi_ids_list:
        result = df.loc[df["NCBI"] == ncbi_id, "ETID"]
        if not result.empty:
            ensembl_ids.append(result.values[0])
    return ensembl_ids


# -----------------------------
# Ensembl helpers (server-side)
# -----------------------------
def strip_version(ensembl_id):
    if not ensembl_id:
        return ensembl_id
    ensembl_id = str(ensembl_id).strip()
    # ENST00000.5 -> ENST00000
    if "." in ensembl_id:
        ensembl_id = ensembl_id.split(".", 1)[0]
    return ensembl_id


def ensembl_bases(source):
    """
    Return bases in the order we want to try them (sequentially).
    Notes:
      - For GRCh37/HG19, Ensembl supports grch37.rest.ensembl.org
      - "Mirrors" for REST are not always consistently available, but these are
        commonly used / historically available endpoints.
      - We try main first, then fallbacks.
    """
    s = (source or "").upper()
    if s in ("HG19", "GRCH37", "HG_19"):
        # GRCh37 has a dedicated endpoint; add mirror candidates after it.
        return [
            "https://grch37.rest.ensembl.org",
            "https://rest.ensembl.org",
            "https://useast.rest.ensembl.org",
            "https://uswest.rest.ensembl.org",
            "https://asia.rest.ensembl.org",
            "https://europa.rest.ensembl.org",
        ]
    return [
        "https://rest.ensembl.org",
        "https://useast.rest.ensembl.org",
        "https://uswest.rest.ensembl.org",
        "https://asia.rest.ensembl.org",
        "https://europa.rest.ensembl.org",
    ]


def _is_retryable(status_code):
    # Retryable/transient errors
    return status_code in (429, 500, 502, 503, 504)


def http_get_json_with_mirrors(path_and_query, bases, timeout=20):
    """
    Tries each base sequentially until success or a non-retryable error occurs.
    Returns structured dict with which base worked (or last error).
    """
    headers = {
        "Accept": "application/json",
        # User-Agent can help with some infrastructures; safe to include
        "User-Agent": "ion-works-ensembl-client/1.0",
    }

    last_err = None
    for base in bases:
        url = f"{base}{path_and_query}"
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code < 400:
                return {"ok": True, "status": r.status_code, "url": url, "base": base, "data": r.json()}

            # If it's a definitive error (e.g., 400/404), stop immediately
            if not _is_retryable(r.status_code):
                return {
                    "ok": False,
                    "status": r.status_code,
                    "url": url,
                    "base": base,
                    "error": r.text[:1000],
                }

            # Else retry on next mirror
            last_err = {
                "ok": False,
                "status": r.status_code,
                "url": url,
                "base": base,
                "error": r.text[:1000],
            }

        except Exception as e:
            # Timeout / DNS / connection: try next mirror
            last_err = {"ok": False, "status": None, "url": url, "base": base, "error": str(e)}

    # All mirrors failed
    return last_err or {"ok": False, "status": None, "error": "All mirrors failed with no response"}


def http_get_text_with_mirrors(path_and_query, bases, timeout=20):
    headers = {
        "Accept": "text/plain",
        "User-Agent": "ion-works-ensembl-client/1.0",
    }

    last_err = None
    for base in bases:
        url = f"{base}{path_and_query}"
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code < 400:
                return {"ok": True, "status": r.status_code, "url": url, "base": base, "data": r.text}

            if not _is_retryable(r.status_code):
                return {
                    "ok": False,
                    "status": r.status_code,
                    "url": url,
                    "base": base,
                    "error": r.text[:1000],
                }

            last_err = {
                "ok": False,
                "status": r.status_code,
                "url": url,
                "base": base,
                "error": r.text[:1000],
            }

        except Exception as e:
            last_err = {"ok": False, "status": None, "url": url, "base": base, "error": str(e)}

    return last_err or {"ok": False, "status": None, "error": "All mirrors failed with no response"}


# -----------------------------
# Ion Works entrypoint
# -----------------------------
identifier = works.param(1)
mode = (works.param(2) or "lookup").lower()
source = works.param(3) or "GRCH38"
sequence_type = (works.param(4) or "genomic").lower()

if not identifier:
    works.resolve({"ok": False, "error": "Missing param(1): identifier"})
else:
    try:
        if mode == "map":
            mapped = map_ncbi_to_ensembl(identifier)
            works.resolve({"ok": True, "mode": "map", "input": identifier, "ensembl_ids": mapped})

        else:
            # If someone passes NCBI IDs in lookup/sequence mode, map first
            if re.match(r"^(NM_|NR_|XM_|XR_)", str(identifier).strip(), re.IGNORECASE):
                mapped = map_ncbi_to_ensembl(identifier)
                if not mapped:
                    works.resolve({
                        "ok": False,
                        "mode": mode,
                        "input": identifier,
                        "error": "NCBI ID not found in mapping table"
                    })
                identifier = mapped[0]

            ensembl_id = strip_version(identifier)
            bases = ensembl_bases(source)

            if mode == "lookup":
                # /lookup/id/:id?expand=1
                path = f"/lookup/id/{ensembl_id}?expand=1"
                resp = http_get_json_with_mirrors(path, bases=bases, timeout=20)
                works.resolve({"ok": resp.get("ok"), "mode": "lookup", **resp})

            elif mode == "sequence":
                # /sequence/id/:id?type=...
                path = f"/sequence/id/{ensembl_id}?type={sequence_type}"
                resp = http_get_text_with_mirrors(path, bases=bases, timeout=20)
                works.resolve({"ok": resp.get("ok"), "mode": "sequence", **resp})

            else:
                works.resolve({"ok": False, "error": f"Unknown mode '{mode}'. Use lookup|sequence|map."})

    except Exception as e:
        works.resolve({"ok": False, "error": str(e)})

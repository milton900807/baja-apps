# upsert_milestones_ion_main.py
# Ion Works script: read milestone JSON from param(2), upsert into MongoDB, return JSON summary.
# - Uses Ion Works only for params and result resolution.
# - No ChatGPT / no external calls.

import json
from datetime import datetime
from typing import Any, Dict, List, Tuple, Union

import pymongo

try:
    from ion import works  # Ion Works runtime
except Exception:  # local debug shim (optional for testing)
    class _Shim:
        _params: Dict[int, Any] = {}
        def param(self, i: int): return self._params.get(i)
        def resolve(self, obj: Any): print(json.dumps(obj, indent=2, default=str))
    works = _Shim()  # type: ignore


# ---------------- Utilities ---------------- #

def _parse_iso_date(s: str) -> datetime:
    """
    Parse a simple ISO-like datetime string into a Python datetime.
    Handles a trailing 'Z' (UTC) by stripping it.
    """
    if s is None:
        raise ValueError("Cannot parse None as date")

    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1]

    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue

    raise ValueError(f"Could not parse date string: {s}")


def _convert_dates_in_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert date strings in a milestone query doc to datetime objects for Mongo:
      - doc['date']
      - doc['window']['start'], doc['window']['end']
      - each milestone['date']
    Returns a shallow-cloned doc with converted fields.
    """
    out = dict(doc)  # shallow copy

    # Top-level date
    if "date" in out and isinstance(out["date"], str):
        out["date"] = _parse_iso_date(out["date"])

    # Window dates
    window = out.get("window")
    if isinstance(window, dict):
        w_copy = dict(window)
        if isinstance(w_copy.get("start"), str):
            w_copy["start"] = _parse_iso_date(w_copy["start"])
        if isinstance(w_copy.get("end"), str):
            w_copy["end"] = _parse_iso_date(w_copy["end"])
        out["window"] = w_copy

    # Milestone dates
    ms_list = out.get("milestones")
    if isinstance(ms_list, list):
        new_ms_list: List[Dict[str, Any]] = []
        for m in ms_list:
            if isinstance(m, dict):
                m_copy = dict(m)
                if isinstance(m_copy.get("date"), str):
                    m_copy["date"] = _parse_iso_date(m_copy["date"])
                new_ms_list.append(m_copy)
            else:
                new_ms_list.append(m)
        out["milestones"] = new_ms_list

    return out


def _upsert_milestone_doc(collection, doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert a single milestone query doc into MongoDB.

    Match key:
      - queryString
      - window.start
      - window.end

    Returns a small summary dict.
    """
    if "queryString" not in doc:
        raise ValueError("Document missing required field 'queryString'")
    if "window" not in doc or not isinstance(doc["window"], dict):
        raise ValueError("Document missing or invalid 'window'")
    if "start" not in doc["window"] or "end" not in doc["window"]:
        raise ValueError("window.start and window.end are required")

    query_string = doc["queryString"]
    window_start = doc["window"]["start"]
    window_end = doc["window"]["end"]

    # Upsert filter: treat each (queryString, window.start, window.end) as unique
    filter_doc = {
        "queryString": query_string,
        "window.start": window_start,
        "window.end": window_end,
    }

    update_doc = {"$set": doc}

    result = collection.update_one(filter_doc, update_doc, upsert=True)

    if result.upserted_id is not None:
        return {"action": "inserted", "id": str(result.upserted_id)}
    elif result.matched_count > 0:
        return {"action": "updated", "id": None}
    else:
        # Should not really happen with upsert=True, but handle gracefully.
        return {"action": "no-op", "id": None}


def _load_docs_from_param(p2: Any) -> List[Dict[str, Any]]:
    """
    Normalize param(2) into a list of documents.
    p2 is expected to be a JSON string or already a Python structure.
    """
    if p2 is None:
        raise ValueError("param(2) is required and must contain milestone JSON")

    # If Ion passes strings:
    if isinstance(p2, str):
        p2 = p2.strip()
        if not p2:
            raise ValueError("param(2) is empty")
        try:
            data = json.loads(p2)
        except json.JSONDecodeError as e:
            raise ValueError(f"param(2) is not valid JSON: {e}")
    else:
        # Already a parsed structure (less common, but support it)
        data = p2

    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        if not all(isinstance(x, (dict,)) for x in data):
            raise ValueError("param(2) JSON array must contain only objects")
        return data

    raise ValueError("param(2) must be a JSON object or array of objects")


def _load_config_from_param(p1: Any) -> Tuple[str, str, str]:
    """
    Load Mongo configuration from param(1), or fall back to defaults.
    p1 may be:
      - None
      - JSON string: {"mongoUri": "...", "dbName": "...", "collectionName": "..."}
      - Python dict with same keys
    """
    mongo_uri = "mongodb://localhost:27017/"
    db_name = "milestone_db"
    coll_name = "milestone_queries"

    if p1 is None:
        return mongo_uri, db_name, coll_name

    if isinstance(p1, str):
        p1 = p1.strip()
        if not p1:
            return mongo_uri, db_name, coll_name
        try:
            cfg = json.loads(p1)
        except json.JSONDecodeError as e:
            raise ValueError(f"param(1) config JSON is invalid: {e}")
    elif isinstance(p1, dict):
        cfg = p1
    else:
        raise ValueError("param(1) must be JSON or dict if provided")

    mongo_uri = cfg.get("mongoUri", mongo_uri)
    db_name = cfg.get("dbName", db_name)
    coll_name = cfg.get("collectionName", coll_name)

    return mongo_uri, db_name, coll_name


# --------------- Main (Ion) --------------- #

def main_ion() -> int:
    try:
        p1 = works.param(1)  # optional: config JSON
        p2 = works.param(2)  # required: milestone JSON (object or array)
    except Exception:
        works.resolve({
            "status": "❌ error",
            "error": "Missing required parameters: param(2) must contain milestone JSON"
        })
        return 1

    try:
        # Load config (Mongo URI, DB, collection)
        mongo_uri, db_name, coll_name = _load_config_from_param(p1)

        # Load documents from param(2)
        docs_raw = _load_docs_from_param(p2)

        # Connect to Mongo
        client = pymongo.MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[coll_name]

        results: List[Dict[str, Any]] = []
        for idx, doc in enumerate(docs_raw):
            try:
                converted = _convert_dates_in_doc(doc)
                summary = _upsert_milestone_doc(collection, converted)
                results.append({
                    "index": idx,
                    "status": "success",
                    **summary
                })
            except Exception as e:
                results.append({
                    "index": idx,
                    "status": "error",
                    "error": str(e)
                })

        works.resolve({
            "status": "✅ ok",
            "db": db_name,
            "collection": coll_name,
            "count": len(results),
            "results": results
        })
        return 0

    except Exception as e:
        works.resolve({
            "status": "❌ error",
            "error": f"Failed to upsert milestones: {e}"
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main_ion())

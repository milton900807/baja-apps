# query_milestones_ion_main.py
# Ion Works script: query milestones between a date range at a given resolution (scope).
# - Uses Ion Works to receive params and resolve results.
# - No ChatGPT / no external calls.

import json
from datetime import datetime
from typing import Any, Dict, List, Tuple, Optional

import pymongo

try:
    from ion import works  # Ion Works runtime
except Exception:  # local debug shim (optional)
    class _Shim:
        _params: Dict[int, Any] = {}
        def param(self, i: int): return self._params.get(i)
        def resolve(self, obj: Any): print(json.dumps(obj, indent=2, default=str))
    works = _Shim()  # type: ignore


# ---------------- Utilities ---------------- #

def _parse_iso_date(s: str) -> datetime:
    """
    Parse an ISO-like datetime string into a Python datetime.
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


def _load_query_from_param(p2: Any) -> Dict[str, Any]:
    """
    Load the query spec (start, end, resolution) from param(2).
    Expects JSON like:
      {
        "start": "...",
        "end":   "...",
        "resolution": {
          "pxPerHour":  0.5,
          "pxPerDay":   12,
          "pxPerMonth": 40
        }
      }
    """
    if p2 is None:
        raise ValueError("param(2) is required and must contain query JSON")

    if isinstance(p2, str):
        p2 = p2.strip()
        if not p2:
            raise ValueError("param(2) is empty")
        try:
            data = json.loads(p2)
        except json.JSONDecodeError as e:
            raise ValueError(f"param(2) is not valid JSON: {e}")
    elif isinstance(p2, dict):
        data = p2
    else:
        raise ValueError("param(2) must be JSON or dict")

    if "start" not in data or "end" not in data:
        raise ValueError("param(2) must include 'start' and 'end' fields")

    resolution = data.get("resolution") or {}
    if not isinstance(resolution, dict):
        raise ValueError("resolution must be an object if provided")

    # We allow resolution to be partially specified; missing values become None.
    px_hour = resolution.get("pxPerHour")
    px_day = resolution.get("pxPerDay")
    px_month = resolution.get("pxPerMonth")

    query_start = _parse_iso_date(str(data["start"]))
    query_end = _parse_iso_date(str(data["end"]))

    return {
        "start": query_start,
        "end": query_end,
        "pxPerHour": float(px_hour) if px_hour is not None else None,
        "pxPerDay": float(px_day) if px_day is not None else None,
        "pxPerMonth": float(px_month) if px_month is not None else None,
    }


def _scope_allows(
    scope: Optional[Dict[str, Any]],
    px_hour: Optional[float],
    px_day: Optional[float],
    px_month: Optional[float],
) -> bool:
    """
    Determine whether a milestone with the given 'scope' should be visible
    at the requested resolution (pxPerHour/Day/Month).

    Scope model (all fields optional, nullable):
      {
        "minPxPerMonth": ...,
        "maxPxPerMonth": ...,
        "minPxPerDay": ...,
        "maxPxPerDay": ...,
        "minPxPerHour": ...,
        "maxPxPerHour": ...
      }

    If a bound is missing / null, it does not constrain that side.
    If a resolution component is None, we simply skip checks that depend on it.
    """
    if not scope or not isinstance(scope, dict):
        # No scope -> visible at all resolutions
        return True

    def _bounds_ok(value: Optional[float], min_key: str, max_key: str) -> bool:
        if value is None:
            return True
        vmin = scope.get(min_key)
        vmax = scope.get(max_key)
        if vmin is not None and value < vmin:
            return False
        if vmax is not None and value > vmax:
            return False
        return True

    if not _bounds_ok(px_month, "minPxPerMonth", "maxPxPerMonth"):
        return False
    if not _bounds_ok(px_day, "minPxPerDay", "maxPxPerDay"):
        return False
    if not _bounds_ok(px_hour, "minPxPerHour", "maxPxPerHour"):
        return False

    return True


def _window_overlaps(
    win_start: datetime,
    win_end: datetime,
    q_start: datetime,
    q_end: datetime,
) -> bool:
    """
    Check whether [win_start, win_end] overlaps [q_start, q_end].
    """
    return not (win_end < q_start or win_start > q_end)


# --------------- Main (Ion) --------------- #

def main_ion() -> int:
    try:
        p1 = works.param(1)  # optional config JSON
        p2 = works.param(2)  # required: query spec JSON
    except Exception:
        works.resolve({
            "status": "❌ error",
            "error": "Missing required parameters: param(2) must contain query JSON"
        })
        return 1

    try:
        # Config and query
        mongo_uri, db_name, coll_name = _load_config_from_param(p1)
        q = _load_query_from_param(p2)

        q_start: datetime = q["start"]
        q_end: datetime = q["end"]
        px_hour: Optional[float] = q["pxPerHour"]
        px_day: Optional[float] = q["pxPerDay"]
        px_month: Optional[float] = q["pxPerMonth"]

        # Connect to Mongo
        client = pymongo.MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[coll_name]

        # Pre-filter documents whose window overlaps the query range
        cursor = collection.find({
            "window.end": {"$gte": q_start},
            "window.start": {"$lte": q_end},
        })

        out_milestones: List[Dict[str, Any]] = []

        for doc in cursor:
            win = doc.get("window") or {}
            win_start = win.get("start")
            win_end = win.get("end")
            if not isinstance(win_start, datetime) or not isinstance(win_end, datetime):
                # Skip malformed docs
                continue

            if not _window_overlaps(win_start, win_end, q_start, q_end):
                continue

            ms_list = doc.get("milestones") or []
            for m in ms_list:
                if not isinstance(m, dict):
                    continue

                m_date = m.get("date")
                if not isinstance(m_date, datetime):
                    continue

                if not (q_start <= m_date <= q_end):
                    continue

                scope = m.get("scope") if isinstance(m, dict) else None
                if not _scope_allows(scope, px_hour, px_day, px_month):
                    continue

                # Build a clean output milestone object
                out_item = {
                    "queryString": doc.get("queryString"),
                    "queryDate": doc.get("date"),
                    "windowStart": win_start,
                    "windowEnd": win_end,
                    "milestone": m,
                    "_id": str(doc.get("_id", "")),
                }
                out_milestones.append(out_item)

        works.resolve({
            "status": "✅ ok",
            "db": db_name,
            "collection": coll_name,
            "count": len(out_milestones),
            "start": q_start,
            "end": q_end,
            "resolution": {
                "pxPerHour": px_hour,
                "pxPerDay": px_day,
                "pxPerMonth": px_month,
            },
            "milestones": out_milestones,
        })
        return 0

    except Exception as e:
        works.resolve({
            "status": "❌ error",
            "error": f"Failed to query milestones: {e}"
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main_ion())

#!/usr/bin/env python3
"""
Report a user's Claude-search usage, accessible by email address.

  let r = await exec('/py/usage/claude-usage-report.py', em, 'user@example.com', '7')
  // r = { email, today, total_today, by_feature_today:{...}, daily:[{day,count}...] }

Params:
    param(1) : email address (optional — defaults to the signed-in caller's SENDER_USER_ID)
    param(2) : number of days of history to include (optional, default 7)

Counts are recorded by py/ion-lib/claude_usage.py whenever a Claude-powered tool runs.
"""
import os

from ion import works

try:
    import claude_usage
except Exception:
    claude_usage = None

email = str(works.param(1) or "").strip() or (os.environ.get("SENDER_USER_ID") or "")
try:
    days = int(float(works.param(2) or 7))
except Exception:
    days = 7

if not claude_usage:
    works.resolve({"email": email, "today": "", "total_today": 0,
                   "by_feature_today": {}, "daily": [], "error": "usage module unavailable"})
else:
    works.resolve(claude_usage.report(email, days))

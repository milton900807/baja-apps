#!/usr/bin/env python3
"""
Report a user's Claude-search usage, accessible by email address.

  let r = await exec('/py/usage/claude-usage-report.py', em, 'user@example.com', '30')
  // r = { email, today,
  //       total_today, by_feature_today:{...}, daily:[{day,count}...],      // actions
  //       credits_today, credits_month, credits_total, usd_month,           // credits
  //       by_feature:[{feature,calls,credits,tokens}], by_model:[...],
  //       daily_credits:[{day,credits}], unpriced_models:[...] }

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
                   "by_feature_today": {}, "daily": [], "credits_today": 0,
                   "error": "usage module unavailable"})
else:
    out = claude_usage.report(email, days)
    # CREDITS, alongside the action count. One credit is one US cent of model usage; the
    # action count says how often, the credits say how much, and the two answer different
    # questions about the same day.
    try:
        spend = claude_usage.spend_report(email, days)
        for k, v in spend.items():
            if k not in ("email", "today"):
                out[k] = v
        out["micro_usd_per_credit"] = claude_usage.MICRO_USD_PER_CREDIT
    except Exception as e:
        out["spend_error"] = str(e)
    works.resolve(out)

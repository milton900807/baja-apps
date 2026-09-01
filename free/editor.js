function (path, config) {

    // FREE-TIER editor.  /app/free/editor
    //
    // The same editor as manchester/editor.js — load, edit, save, design — for users without
    // a subscription. It is a thin wrapper, NOT a fork: forking would mean every future
    // editor change had to be made twice and would drift. It sets window.__bajaFreeTier and
    // runs the real editor, which skips its subscription gate when that flag is set.
    //
    // The two operations with a real per-call cost are capped at 5 uses PER CALENDAR MONTH:
    //   • Anthropic-backed python tools
    //   • off-target searches
    // The CAP ITSELF IS ENFORCED ON THE SERVER (freeGate in baja-server/src/index.ts), which
    // returns HTTP 402 once the allowance is spent. Everything here is presentation: the
    // remaining count and the upgrade prompt. A browser-side counter would be reset from
    // devtools in seconds, so the client is deliberately not the thing standing between a
    // free user and a paid call.

    return (async () => {
        try { window.__bajaFreeTier = true; } catch (e) { }

        // Fetch the allowance so the badge can be shown before anything is spent. A failure
        // here must not stop the editor opening — the server still enforces the cap.
        let quota = null;
        try {
            const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
            const user = (typeof getUser === 'function') ? (getUser() || '') : '';
            quota = await GETJSON(host + '/free-quota?user=' + encodeURIComponent(user));
        } catch (e) { quota = null; }

        try { window.__bajaFreeQuota = quota; } catch (e) { }

        // A subscriber who lands here gets the editor with no free-tier chrome — but the FLAG
        // STAYS SET. Clearing it handed them to the normal editor's paywall, and the two checks
        // do not agree on what "subscribed" means:
        //     /free-quota  -> determineLicenseStatus()  (the license file)
        //     enforce(true) -> checkSubscription()      (Stripe)
        // An account granted by licence but without an active Stripe subscription cleared the
        // flag here, failed the Stripe check there, and got the paywall carousel — on the FREE
        // url. The flag only skips gates; it never grants anything, and metering is enforced
        // server-side where subscribers are exempt anyway. So leaving it set is safe for a
        // subscriber and removes the disagreement entirely.
        const subscribed = !!(quota && quota.subscribed);
        if (subscribed) {
            return await exec('manchester/editor.js', path, config);
        }

        // Two pieces of UI, deliberately:
        //   1. a TOP NOTICE that explains the plan in words — what is unlimited and what is
        //      capped — shown once per month and dismissible, because a permanent banner
        //      eats editor space and users stop reading it;
        //   2. a small persistent BADGE with the live counts, which stays after dismissal so
        //      the remaining allowance is always visible without nagging.
        const lim = (quota && quota.limit) || 5;
        const aiLeft = (quota && quota.aiRemaining != null) ? quota.aiRemaining : lim;
        const otLeft = (quota && quota.offtargetRemaining != null) ? quota.offtargetRemaining : lim;
        const resetsOn = (quota && quota.resetsOn) || '';
        const period = (quota && quota.period) || '';

        try {
            // Remembered PER MONTH, so a new month's allowance announces itself again rather
            // than staying silent forever after one dismissal.
            let dismissed = '';
            try { dismissed = localStorage.getItem('baja.free.notice') || ''; } catch (e) { }
            if (dismissed !== period) {
                const old = document.getElementById('baja-free-notice');
                if (old && old.parentNode) old.parentNode.removeChild(old);
                const n = document.createElement('div');
                n.id = 'baja-free-notice';
                n.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483400;'
                    + 'background:linear-gradient(90deg,#0b2545,#123a63);color:#e8f0fb;'
                    + 'border-bottom:1px solid rgba(255,255,255,0.18);padding:9px 14px;'
                    + 'font:13px/1.45 Arial,Helvetica,sans-serif;display:flex;align-items:center;'
                    + 'gap:14px;box-shadow:0 4px 18px rgba(0,0,0,0.35);';
                n.innerHTML = ''
                    + '<span style="flex:0 0 auto;background:#22c55e;color:#04210f;border-radius:999px;'
                    + 'padding:3px 10px;font:700 11.5px Arial;">FREE PLAN</span>'
                    + '<span style="flex:1 1 auto;min-width:0;">'
                    + '<b>Editing is unlimited</b> — load, edit, save and design as much as you like. '
                    + 'Two features are metered: <b>AI requests</b> and <b>off-target searches</b>, '
                    + '<b>' + lim + ' each per month</b>'
                    + (resetsOn ? (' (resets ' + resetsOn + ')') : '') + '. '
                    + 'You have <b>' + aiLeft + '</b> AI and <b>' + otLeft + '</b> off-target left.'
                    + '</span>'
                    + '<a href="/subscribe" style="flex:0 0 auto;color:#04210f;background:#22c55e;'
                    + 'border-radius:8px;padding:7px 14px;font:700 12.5px Arial;text-decoration:none;">'
                    + 'Subscribe for unlimited</a>'
                    + '<button id="baja-free-x" title="Dismiss" style="flex:0 0 auto;cursor:pointer;'
                    + 'background:transparent;border:1px solid rgba(255,255,255,0.28);color:#e8f0fb;'
                    + 'border-radius:8px;padding:6px 10px;font:700 12px Arial;">\u2715</button>';
                document.body.appendChild(n);
                const x = n.querySelector('#baja-free-x');
                if (x) x.onclick = () => {
                    try { localStorage.setItem('baja.free.notice', period); } catch (e) { }
                    try { if (n.parentNode) n.parentNode.removeChild(n); } catch (e) { }
                };
            }
        } catch (e) { }

        try {
            const old = document.getElementById('baja-free-badge');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            const b = document.createElement('div');
            b.id = 'baja-free-badge';
            b.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147483000;'
                + 'background:rgba(11,37,69,0.94);color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
                + 'border-radius:10px;padding:9px 13px;font:600 12px Arial;'
                + 'box-shadow:0 8px 26px rgba(0,0,0,0.35);display:flex;align-items:center;gap:10px;';
            b.innerHTML = '<span>Free plan this month — AI ' + aiLeft + '/' + lim
                + ' \u00b7 off-targets ' + otLeft + '/' + lim + ' left'
                + (resetsOn ? (' \u00b7 resets ' + resetsOn) : '') + '</span>'
                + '<a href="/subscribe" style="color:#04210f;background:#22c55e;border-radius:7px;'
                + 'padding:5px 10px;font:700 12px Arial;text-decoration:none;">Subscribe</a>';
            document.body.appendChild(b);
        } catch (e) { }

        return await exec('manchester/editor.js', path, config);
    })();
}

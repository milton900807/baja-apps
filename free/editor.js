function (path, config) {

    // FREE-TIER editor.  /app/free/editor
    //
    // The same editor as manchester/editor.js — load, edit, save, design — for users without
    // a subscription. It is a thin wrapper, NOT a fork: forking would mean every future
    // editor change had to be made twice and would drift. It sets window.__bajaFreeTier and
    // runs the real editor, which skips its subscription gate when that flag is set.
    //
    // The two operations with a real per-call cost are capped at 5 uses:
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

        // A subscriber who lands here should just get the normal editor, unmetered — no
        // badge, no flag.
        if (quota && quota.subscribed) {
            try { window.__bajaFreeTier = false; } catch (e) { }
            return await exec('manchester/editor.js', path, config);
        }

        // Small persistent badge: what is left, and how to lift the cap.
        try {
            const lim = (quota && quota.limit) || 5;
            const ai = (quota && quota.aiRemaining != null) ? quota.aiRemaining : lim;
            const ot = (quota && quota.offtargetRemaining != null) ? quota.offtargetRemaining : lim;
            const old = document.getElementById('baja-free-badge');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            const b = document.createElement('div');
            b.id = 'baja-free-badge';
            b.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:2147483000;'
                + 'background:rgba(11,37,69,0.94);color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
                + 'border-radius:10px;padding:9px 13px;font:600 12px Arial;'
                + 'box-shadow:0 8px 26px rgba(0,0,0,0.35);display:flex;align-items:center;gap:10px;';
            b.innerHTML = '<span>Free plan — AI ' + ai + '/' + lim + ' · off-targets ' + ot + '/' + lim + ' left</span>'
                + '<a href="/subscribe" style="color:#04210f;background:#22c55e;border-radius:7px;'
                + 'padding:5px 10px;font:700 12px Arial;text-decoration:none;">Subscribe</a>';
            document.body.appendChild(b);
        } catch (e) { }

        return await exec('manchester/editor.js', path, config);
    })();
}

// Free-plan prompt, docked at the BOTTOM of the editor.
//   exec('baja/lib/free-tier-bar.js')
//
// Written as a BARE BODY, not a `function () {...}` expression. A function expression is
// INVOKED with whatever arguments exec is handed, and this one declares none -- so it was
// loaded, never called, and the prompt never appeared no matter how many places asked for
// it. A bare body runs when exec loads it, which is the semantics this needs.
//
// Lives here rather than in free/editor.js because a non-subscriber does not always arrive
// through /app/free/editor -- they open the normal editor url, a shared file link, or a
// saved bookmark, and on all of those the prompt used to be absent entirely. The editor
// itself now asks for it, so the prompt follows the USER's plan rather than the URL.
//
// It is safe to call unconditionally: a subscriber gets nothing. The check is display-only.
// /free-quota reports `subscribed` from determineLicenseStatus() (the licence file), while
// the paywall uses checkSubscription() (Stripe), and the two do not always agree -- so this
// decides only what is DRAWN. Nothing here grants or denies anything; the 5-per-month cap
// is enforced server-side in freeGate (baja-server/src/index.ts), where a browser cannot
// reach it.
//
// Bottom rather than top on purpose: the editor's menus, toolbar and track labels line the
// top edge, so a bar there covers the controls the user is reaching for. It is not a
// blocking overlay either -- the point of the free tier is that the editor works.

return (async () => {
    const ID_BAR = 'baja-free-bar';
    const ID_TAB = 'baja-free-tab';
    const drop = (id) => {
        try { const e = document.getElementById(id); if (e && e.parentNode) e.parentNode.removeChild(e); } catch (er) { }
    };

    // Reuse the quota free/editor.js already fetched, so the common path costs no second
    // request. Anything else fetches its own.
    let quota = null;
    try { quota = window.__bajaFreeQuota || null; } catch (e) { quota = null; }
    if (!quota) {
        try {
            const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
            const user = (typeof getUser === 'function') ? (getUser() || '') : '';
            quota = await GETJSON(host + '/free-quota?user=' + encodeURIComponent(user));
            try { window.__bajaFreeQuota = quota; } catch (e) { }
        } catch (e) { quota = null; }
    }

    // A failed quota call is not proof of anything, so guessing "not subscribed" from it
    // would put an upgrade bar in front of paying users whenever the endpoint hiccups --
    // EXCEPT when __bajaFreeTier is set, which free/editor.js sets before the editor
    // starts. There the plan is already known, so the prompt is drawn with the default
    // allowance rather than skipped, which is how a free user ended up with no prompt at
    // all whenever /free-quota failed.
    if (!quota) {
        let onFree = false;
        try { onFree = !!window.__bajaFreeTier; } catch (e) { }
        if (!onFree) {
            try { console.log('free-tier-bar: no quota and not flagged free-tier; staying quiet'); } catch (e) { }
            return false;
        }
        quota = { subscribed: false, limit: 5 };
    }
    if (quota.subscribed) {
        try { console.log('free-tier-bar: account reports subscribed; no free-plan bar'); } catch (e) { }
        drop(ID_BAR); drop(ID_TAB);
        return false;
    }

    // PER-METRIC limits. `limit` is the server's legacy single figure and equals the DESIGN
    // allowance, so using it for both showed off-targets out of 5 when the real cap is 100 --
    // "70 off-target left" against a limit of 5. designLimit / offtargetLimit are the real
    // ones; the legacy field is only a fallback for an older server.
    const readQuota = (q) => {
        q = q || {};
        const dLim = (q.designLimit != null) ? q.designLimit : (q.limit || 5);
        const oLim = (q.offtargetLimit != null) ? q.offtargetLimit : (q.limit || 5);
        const dLeft = (q.designRemaining != null) ? q.designRemaining
            : ((q.aiRemaining != null) ? q.aiRemaining : dLim);
        const oLeft = (q.offtargetRemaining != null) ? q.offtargetRemaining : oLim;
        return {
            dLim: dLim, oLim: oLim,
            // -1 is the server's "subscribed, unmetered" marker.
            dLeft: (dLeft < 0) ? dLim : dLeft,
            oLeft: (oLeft < 0) ? oLim : oLeft,
            resetsOn: q.resetsOn || '', period: q.period || ''
        };
    };
    let Q = readQuota(quota);
    const lim = Q.dLim;
    const aiLeft = Q.dLeft;
    const otLeft = Q.oLeft;
    const resetsOn = Q.resetsOn;
    // The collapse is remembered against the billing period, not a plain boolean, so a new
    // month's allowance announces itself again instead of staying hidden forever.
    const period = quota.period || '';

    try {
        drop(ID_BAR);
        drop(ID_TAB);

        const bar = document.createElement('div');
        bar.id = ID_BAR;
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483400;'
            + 'background:linear-gradient(90deg,#0b2545,#123a63);color:#e8f0fb;'
            + 'border-top:1px solid rgba(255,255,255,0.18);padding:9px 14px;'
            + 'font:13px/1.45 Arial,Helvetica,sans-serif;display:flex;align-items:center;'
            + 'gap:14px;box-shadow:0 -4px 18px rgba(0,0,0,0.35);';
        // The remaining COUNTS are stated, not just the allowance: "5 per month" does not
        // tell a user how much they have left, which is the number that decides whether
        // subscribing is worth it.
        bar.innerHTML = ''
            + '<span style="flex:0 0 auto;background:#22c55e;color:#04210f;border-radius:999px;'
            + 'padding:3px 10px;font:700 11.5px Arial;">FREE PLAN</span>'
            + '<span style="flex:1 1 auto;min-width:0;">'
            + '<b>Editing is unlimited</b> — load, edit, save and draw as much as you like. '
            + 'Two things are metered: <b>designs</b> and <b>off-target searches</b>'
            + (resetsOn ? (' (resets ' + resetsOn + ')') : '') + '. '
            + '<span id="baja-free-counts">You have <b>' + aiLeft + '</b> of ' + Q.dLim
            + ' designs and <b>' + otLeft + '</b> of ' + Q.oLim + ' off-target left.</span>'
            + '</span>'
            + '<a href="/subscribe" style="flex:0 0 auto;color:#04210f;background:#22c55e;'
            + 'border-radius:8px;padding:7px 14px;font:700 12.5px Arial;text-decoration:none;">'
            + 'Subscribe for unlimited</a>'
            + '<button id="baja-free-collapse" title="Collapse" style="flex:0 0 auto;cursor:pointer;'
            + 'background:transparent;border:1px solid rgba(255,255,255,0.28);color:#e8f0fb;'
            + 'border-radius:8px;padding:6px 10px;font:700 12px Arial;">▾</button>';
        document.body.appendChild(bar);

        // Collapsed form: a small corner tab that reopens the bar. It collapses rather than
        // dismissing, so the upgrade path stays one click away without a permanent strip.
        const tab = document.createElement('div');
        tab.id = ID_TAB;
        tab.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483400;'
            + 'display:none;align-items:center;gap:9px;cursor:pointer;'
            + 'background:rgba(11,37,69,0.94);color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:10px;padding:8px 12px;font:600 12px Arial;'
            + 'box-shadow:0 8px 26px rgba(0,0,0,0.35);';
        tab.innerHTML = '<span id="baja-free-tabcounts">Free plan · designs ' + aiLeft + '/' + Q.dLim
            + ' · off-targets ' + otLeft + '/' + Q.oLim + '</span>'
            + '<span style="color:#04210f;background:#22c55e;border-radius:7px;'
            + 'padding:4px 9px;font:700 11.5px Arial;">Subscribe</span>';
        document.body.appendChild(tab);

        const setCollapsed = (on) => {
            bar.style.display = on ? 'none' : 'flex';
            tab.style.display = on ? 'flex' : 'none';
            try { localStorage.setItem('baja.free.bar', on ? period : ''); } catch (e) { }
        };
        const c = bar.querySelector('#baja-free-collapse');
        if (c) c.onclick = () => setCollapsed(true);
        tab.onclick = () => setCollapsed(false);

        // KEY: deliberately not 'baja.free.notice'. That key belonged to the old
        // dismissible top banner, and reusing it meant a user who had dismissed that banner
        // this month opened the new bar already collapsed -- indistinguishable, to them,
        // from the plan status having silently disappeared.
        let collapsed = '';
        try { collapsed = localStorage.getItem('baja.free.bar') || ''; } catch (e) { }
        if (collapsed === period) setCollapsed(true);
    } catch (e) {
        // This used to swallow the reason and return quietly, which is why "the bar does not
        // appear" produced no signal anywhere -- console, network or DOM.
        try { console.error('free-tier-bar: could not render the free-plan bar', e); } catch (e2) { }
        return false;
    }

    // LIVE COUNTS.
    //
    // The bar read window.__bajaFreeQuota -- a snapshot free/editor.js had already fetched --
    // and rendered once. Nothing ever re-read it, so the numbers were whatever they had been
    // when the editor started and stayed there all session, however many designs were run.
    //
    // Refresh re-fetches with cache:'no-store' and rewrites the two count spans in place
    // rather than rebuilding the bar, so it cannot fight the collapse state or the watchdog.
    // The server caches /free-quota briefly for exactly this polling, so 20s is the interval
    // it expects.
    try {
        const host = () => (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const refresh = async () => {
            let q = null;
            try {
                const user = (typeof getUser === 'function') ? (getUser() || '') : '';
                q = await GETJSON(host() + '/free-quota?user=' + encodeURIComponent(user)
                    + '&t=' + Date.now());
            } catch (e) { return false; }
            if (!q || q.error) return false;
            try { window.__bajaFreeQuota = q; } catch (e) { }
            // Became a subscriber mid-session: take the bar away rather than show a stale one.
            if (q.subscribed) { drop(ID_BAR); drop(ID_TAB); return true; }
            const n = readQuota(q);
            try {
                const c = document.getElementById('baja-free-counts');
                if (c) {
                    c.innerHTML = 'You have <b>' + n.dLeft + '</b> of ' + n.dLim
                        + ' designs and <b>' + n.oLeft + '</b> of ' + n.oLim + ' off-target left.';
                }
                const t = document.getElementById('baja-free-tabcounts');
                if (t) {
                    t.textContent = 'Free plan · designs ' + n.dLeft + '/' + n.dLim
                        + ' · off-targets ' + n.oLeft + '/' + n.oLim;
                }
            } catch (e) { }
            return true;
        };
        // Anything that spends an allowance calls this for an immediate update, instead of
        // the user waiting out the poll to see a number they just changed.
        window.__bajaFreeBarRefresh = refresh;
        if (!window.__bajaFreeBarPoll) {
            window.__bajaFreeBarPoll = setInterval(() => {
                try {
                    // Stop once the bar is gone for good (subscribed, or the editor closed).
                    if (!document.getElementById(ID_BAR) && !document.getElementById(ID_TAB)) return;
                    refresh();
                } catch (e) { }
            }, 20000);
        }
    } catch (e) { }

    // Watchdog: put the bar back if something removes it.
    //
    // The editor calls clear() and re-mounts panels several times during startup, and this bar
    // is appended to document.body from OUTSIDE that lifecycle, so anything that rebuilds the
    // page can take it with it -- after which nothing would ever draw it again. Rather than
    // guess which step is responsible, re-assert it: cheap, and it cannot be defeated by
    // whatever ordering startup happens to use today. Stops once the page has settled.
    try {
        if (!window.__bajaFreeBarWatch) {
            let ticks = 0;
            window.__bajaFreeBarWatch = setInterval(() => {
                ticks++;
                try {
                    const gone = !document.getElementById(ID_BAR) && !document.getElementById(ID_TAB);
                    if (gone) {
                        try { console.warn('free-tier-bar: bar was removed from the DOM; restoring'); } catch (e) { }
                        try { window.__bajaFreeBarWatch = clearInterval(window.__bajaFreeBarWatch) || null; } catch (e) { }
                        exec('baja/lib/free-tier-bar.js');
                        return;
                    }
                } catch (e) { }
                if (ticks > 30) {   // ~60s: startup is long over by then
                    try { clearInterval(window.__bajaFreeBarWatch); } catch (e) { }
                    window.__bajaFreeBarWatch = null;
                }
            }, 2000);
        }
    } catch (e) { }

    return true;
})();

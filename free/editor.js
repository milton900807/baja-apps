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
        //
        // Which is why there is no branch on `subscribed` here any more. The prompt is drawn by
        // baja/lib/free-tier-bar.js, which shows nothing to a subscriber, so both cases run the
        // same lines from here on.
        //
        // It is asked for TWICE, deliberately:
        //   * here, BEFORE the editor starts, so the plan status appears immediately and does
        //     not depend on the editor reaching the end of its startup. Rendering it only from
        //     inside editor.js made the notice disappear whenever startup returned early --
        //     which is exactly what an access gate partway through that file does.
        //   * again from manchester/editor.js, so a non-subscriber who arrives by any OTHER
        //     route (the plain editor url, a shared link, a bookmark) still gets it.
        // The module removes any existing bar before drawing, so the second call re-renders
        // rather than stacking a duplicate.
        // The free-plan bar is drawn by the app shell (baja/src/app/app.component), not from
        // lionscript. It kept not appearing from here and every layer in between swallowed the
        // reason; the shell is provably running and its bar cannot be removed by a re-mount.

        return await exec('manchester/editor.js', path, config);
    })();
}

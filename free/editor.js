function (path, config) {

    // /app/free/editor — an ALIAS for manchester/editor.js.
    //
    // Everything this file used to do is now done elsewhere: the free-plan badge is drawn by
    // the Angular shell (baja/src/app/app.component), the quota is fetched by whoever draws
    // it, and the per-design cap is enforced server-side in freeGate. What is left is the
    // alias and the one flag below.
    //
    // The flag is not decoration and must not be removed. lib/subscription.js sends a
    // non-subscriber here — showSubscribeGate() calls exec('free/editor') — and
    // manchester/editor.js skips its subscription gate only when the flag is set. Drop it and
    // the two files call each other forever: editor -> gate -> free/editor -> editor -> gate.
    // Setting it means "this user has already been through the gate"; it grants nothing on its
    // own, and metering does not consult it.

    return (async () => {
        try { window.__bajaFreeTier = true; } catch (e) { }
        return await exec('manchester/editor.js', path, config);
    })();
}

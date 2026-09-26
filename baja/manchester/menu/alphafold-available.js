function (graph, opts) {

    // IS THE FOLDING SERVICE UP?
    //   const af = await exec('baja/manchester/menu/alphafold-available.js', graph, { waitMs: 1200 });
    //   if (af.up) { ...offer the Fold item... }
    //
    // The AlphaFold host is a separate machine that is routinely stopped. When it is down the
    // Fold entry is a button whose only possible outcome is an apology, so it is not drawn at
    // all -- but working that out costs a network round trip, and a menu that waits on one
    // before it opens is worse than a menu with a dead item in it.
    //
    // So the answer is CACHED ON THE GRAPH and refreshed in the background. A menu asks for
    // the cached verdict and gets it instantly; the probe that is running at the time updates
    // what the NEXT menu sees. `waitMs` is how long a caller will wait when there is no
    // verdict at all yet -- the first menu opened after the editor loads -- and is the only
    // case that ever blocks.
    //
    // NO-CORS ON PURPOSE. gpu.hts.bio sends no CORS headers, so an ordinary fetch cannot read
    // its response and fails even when the host is perfectly healthy. `mode: 'no-cors'` asks
    // the browser for an opaque response: unreadable, but it RESOLVES when the server answered
    // and rejects when nothing did -- which is exactly and only the question being asked.
    //
    // Cached on the graph rather than in a module variable because exec() re-runs the module.

    const HOST = 'https://gpu.hts.bio/alphafold/';
    const FRESH_MS = 60000;    // a verdict older than this is worth re-checking
    const PROBE_MS = 4000;     // a host that has not answered in 4s is not going to

    const o = opts || {};
    const waitMs = (o.waitMs != null) ? +o.waitMs : 0;

    return (async () => {
        const now = Date.now();
        let slot = null;
        try { slot = graph.__afService = graph.__afService || { up: null, at: 0, probe: null }; }
        catch (e) { slot = { up: null, at: 0, probe: null }; }

        const fresh = slot.at && (now - slot.at) < FRESH_MS;

        // A probe already running is the one to wait on; starting a second would just add
        // another request to a host that may be refusing to answer.
        if (!fresh && !slot.probe) {
            slot.probe = (async () => {
                let ok = false;
                const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
                let timer = null;
                try {
                    if (ctl) timer = setTimeout(() => { try { ctl.abort(); } catch (e) { } }, PROBE_MS);
                    await fetch(HOST, {
                        method: 'GET', mode: 'no-cors', cache: 'no-store',
                        signal: ctl ? ctl.signal : undefined
                    });
                    ok = true;          // it answered; opaque is fine, we cannot and need not read it
                } catch (e) {
                    ok = false;         // network error, DNS, refused, or our own abort
                }
                if (timer) { try { clearTimeout(timer); } catch (e) { } }
                slot.up = ok; slot.at = Date.now(); slot.probe = null;
                return ok;
            })();
        }

        // Wait only when there is nothing to report yet, and only for as long as the caller
        // said. Everything else reads the cache and returns at once.
        if (slot.up === null && slot.probe && waitMs > 0) {
            let timer = null;
            const capped = new Promise((res) => { timer = setTimeout(() => res(null), waitMs); });
            try { await Promise.race([slot.probe, capped]); } catch (e) { }
            if (timer) { try { clearTimeout(timer); } catch (e) { } }
        }

        return {
            // true up, false down, null not known yet. A caller deciding whether to DRAW
            // something treats null as down: an item that might not work is the thing this
            // exists to avoid.
            up: slot.up,
            host: HOST,
            checkedAt: slot.at || 0,
            checking: !!slot.probe
        };
    })();
}

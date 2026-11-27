function (graph, track, layer, opts) {

    // SHOWING A LAYER THAT HAS JUST ARRIVED.
    //   exec('baja/bio/layers/present-new-layer.js', graph, track, layer)
    //
    // Called from Track.addLayer, so everything that puts a layer on a track arrives here:
    // a dialog's OK, a model from the shelf, a prompt. A new layer used to appear silently
    // somewhere in a stack of four, on a canvas that looked exactly as it did a moment ago,
    // and the first thing anyone did was hunt for it.
    //
    // Two things, both temporary and neither touching any data: the OTHER layers go grey, so
    // the one that arrived is the only colour on the canvas; and its blocks GLOW for a few
    // seconds, so the eye lands on them rather than on the track. The glow wears off by
    // itself. The greying does not, because it is also useful after the arrival is over, and
    // the layer popup and the prompt both undo it.
    //
    // ARRIVALS ARE BATCHED. A single action often adds two layers (the CDD loader puts
    // domains and sites on together; the ratio shift marks both tracks), and presenting each
    // in turn would leave only the last one in colour with the rest of ITS OWN ACTION greyed
    // out. A short window collects them and they are presented as the set they are.
    //
    // A BIG BATCH IS NOT AN ARRIVAL. Opening a file, or a tool that lays down a dozen
    // layers, is not somebody pointing at one thing, and greying everything to highlight
    // twelve layers says nothing at all. Past the limit the arrival is left alone and the
    // canvas is simply redrawn.

    return (async () => {
        const o = opts || {};
        if (!graph || !layer) return false;
        const WINDOW_MS = (o.windowMs != null) ? +o.windowMs : 120;
        const GLOW_MS = (o.glowMs != null) ? +o.glowMs : 6000;
        const MAX = (o.max != null) ? +o.max : 6;

        // The batch lives on the graph rather than in this module: exec re-evaluates the
        // module per call, so anything kept here would be a fresh empty batch every time.
        const G = graph;
        if (!G.__layerArrival) G.__layerArrival = { layers: [], tracks: [], timer: null };
        const B = G.__layerArrival;
        if (B.layers.indexOf(layer) < 0) B.layers.push(layer);
        if (track && B.tracks.indexOf(track) < 0) B.tracks.push(track);

        if (B.timer) { try { clearTimeout(B.timer); } catch (e) { } }
        B.timer = setTimeout(() => {
            const arrived = B.layers.slice();
            G.__layerArrival = { layers: [], tracks: [], timer: null };
            if (!arrived.length) return;

            const wake = () => { try { if (G.wake) G.wake(); } catch (e) { } };
            if (arrived.length > MAX) { wake(); return; }

            // Grey everything that did not just arrive. focus-layer.js holds the rule for
            // what may be greyed -- hidden layers are left alone -- so this goes through it
            // rather than setting the flag itself, and then keeps the whole set in colour.
            try {
                exec('baja/bio/layers/focus-layer.js', G, arrived[0], { scope: 'canvas', quiet: true })
                    .then(() => {
                        for (const l of arrived) { try { l.muted = false; } catch (e) { } }
                        wake();
                    }).catch(() => { });
            } catch (e) { }

            const until = Date.now() + GLOW_MS;
            for (const l of arrived) { try { l.glowUntil = until; } catch (e) { } }
            wake();
            // One wake after it ends, so the last frame is drawn without the halo instead of
            // the glow being left mid-breath until something else happens to redraw.
            try { setTimeout(wake, GLOW_MS + 60); } catch (e) { }
        }, WINDOW_MS);

        return true;
    })();
}

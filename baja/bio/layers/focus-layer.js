function (graph, layer, opts) {

    // ONE LAYER IN FULL COLOUR, THE REST GREYED OUT.
    //   await exec('baja/bio/layers/focus-layer.js', graph, layer);        // focus, or unfocus it
    //   await exec('baja/bio/layers/focus-layer.js', graph, null);         // everything back
    //   await exec('baja/bio/layers/focus-layer.js', graph, null, { all: true });   // grey everything
    //   await exec('baja/bio/layers/focus-layer.js', graph, layer, { scope: 'track' });
    //
    // A track carrying a PSI layer, an acceptor layer and two domain layers is four pictures
    // drawn over each other. Reading one of them meant hiding or deleting the others, which
    // loses the thing that makes a layer worth reading: what it looks like against the rest.
    // Greying is the middle option -- the others stay where they are, drawn in grey at low
    // opacity, so the focused layer is the only colour on the canvas and its neighbours are
    // still there to compare it with.
    //
    // CANVAS-WIDE BY DEFAULT, because the comparison people make is usually between tracks:
    // the same model on two paralogues, or one track's measurement against another's. Pass
    // scope 'track' to grey only the other layers on the focused layer's own track.
    //
    // IT IS A TOGGLE on the same layer, so the same action in a menu both focuses and
    // releases, and nothing can end up focused with no way back from where it was done.
    //
    // Hidden layers are not touched: a layer that is not drawn cannot be greyed, and setting
    // the flag on it would leave it muted when it is shown again.

    return (async () => {
        const o = opts || {};
        // QUIET IS FOR THE AUTOMATIC CASE. When a tool adds a layer, the tool has already
        // said what it found -- often the only place its caveats are written down -- and
        // announcing the greying over the top of that would replace the result with a note
        // about how the canvas is drawn.
        const say = (m) => {
            if (o.quiet) return;
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const tracks = ((graph && graph.track) || []).filter(Boolean);
        const layersOf = (t) => ((t && t.track_layers) || []).filter(Boolean);
        const nameOf = (l) => ('' + ((l && (l.name || l.data_type || l.attribution_type)) || 'layer'));

        const clear = () => {
            let n = 0;
            for (const t of tracks) for (const l of layersOf(t)) {
                if (l.muted) { l.muted = false; n++; }
                // The raised look goes with the greying: a layer still standing proud of a
                // canvas where everything is in colour again is a leftover, not a cue.
                if (l.pop) l.pop = false;
            }
            try { if (graph.focusedLayer) graph.focusedLayer = null; } catch (e) { }
            return n;
        };

        // GREY EVERYTHING, WITH NOTHING IN COLOUR. Not the same request as focusing one
        // layer and not a way of saying "put them back", though both were reachable through
        // the word "all": the canvas is being cleared of layer colour so the track itself --
        // its exons, its sequence, its compounds -- can be read without four pictures
        // competing over it.
        if (!layer && o.all) {
            let n = 0;
            // One track or all of them. The layer menu on a track asks about ITS layers --
            // greying a neighbouring track from a menu that belongs to this one would be an
            // answer to a question nobody asked.
            const where = (o.track && tracks.indexOf(o.track) >= 0) ? [o.track] : tracks;
            // Clearing is scoped the same way, or greying a second track would un-grey the
            // first and the two menus would fight over one canvas.
            if (where.length === tracks.length) clear();
            else {
                for (const l of layersOf(where[0])) { l.muted = false; if (l.pop) l.pop = false; }
                try { if (graph.focusedLayer && layersOf(where[0]).indexOf(graph.focusedLayer) >= 0) graph.focusedLayer = null; } catch (e) { }
            }
            for (const t of where) {
                for (const l of layersOf(t)) {
                    if (l.visible === false) continue;
                    l.muted = true; n++;
                }
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(n ? (n + ' layer' + (n === 1 ? '' : 's') + ' greyed'
                    + ((where.length === 1) ? (' on ' + (where[0].name || 'this track')) : '')
                    + ', none in colour. They are still drawn and nothing has been removed: '
                    + 'ask for any one of them to be focused, or for the layers to be shown in '
                    + 'colour again.')
                : 'There are no visible layers to grey.');
            return { focused: null, muted: n, all: true, scope: (where.length === 1) ? 'track' : 'canvas' };
        }

        // Nothing to focus: put everything back. This is also what the menu's second press
        // and "show all layers" both come through. A track given with it clears only that
        // track, so the menu that greyed one track is the menu that un-greys it.
        if (!layer) {
            let n = 0;
            if (o.track && tracks.indexOf(o.track) >= 0) {
                for (const l of layersOf(o.track)) {
                    if (l.muted) { l.muted = false; n++; }
                    if (l.pop) l.pop = false;
                }
            } else { n = clear(); }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(n ? ('All layers are back in colour: ' + n + ' were greyed.')
                : 'No layers were greyed.');
            return { focused: null, muted: 0, cleared: n };
        }

        // Pressing focus on the layer that is already focused releases it, which is what
        // makes one menu row enough.
        let already = false;
        try { already = (graph.focusedLayer === layer); } catch (e) { already = false; }
        if (already) {
            const n = clear();
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(nameOf(layer) + ' is no longer the only one in colour: all ' + n
                + ' greyed layers are back.');
            return { focused: null, muted: 0, cleared: n };
        }

        const home = tracks.find((t) => layersOf(t).indexOf(layer) >= 0) || null;
        const scope = ('' + (o.scope || 'canvas')).toLowerCase();
        const inScope = (scope === 'track' && home) ? [home] : tracks;

        clear();
        let muted = 0, visibleOthers = 0;
        for (const t of inScope) {
            for (const l of layersOf(t)) {
                if (l === layer) continue;
                if (l.visible === false) continue;        // already not drawn
                visibleOthers++;
                l.muted = true; muted++;
            }
        }
        layer.muted = false;
        // RAISED AS WELL AS COLOURED. Grey neighbours say which layer to read; the shadow
        // says it sits on top of the track rather than in it, which is what makes a band
        // findable on a crowded one.
        try { layer.pop = true; } catch (e) { }
        try { graph.focusedLayer = layer; } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        // WHAT A GREY LAYER STILL IS, said once where the action happens: it is drawn, it is
        // not switched off, and nothing about the data changed. Somebody who reads "greyed"
        // as "excluded" will read the focused layer as the only thing present.
        say(muted
            ? (nameOf(layer) + ' is the only layer in colour; ' + muted + ' other'
                + (muted === 1 ? '' : 's') + (scope === 'track' ? ' on this track' : ' on the canvas')
                + ' are drawn in grey. They are still there and nothing has been removed or '
                + 'recomputed. Press it again to put the colour back.')
            : (nameOf(layer) + ' is the only layer drawn' + (visibleOthers ? '' : ' here')
                + ', so there was nothing to grey.'));
        return { focused: nameOf(layer), muted: muted, scope: scope };
    })();
}

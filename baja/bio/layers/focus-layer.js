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
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const tracks = ((graph && graph.track) || []).filter(Boolean);
        const layersOf = (t) => ((t && t.track_layers) || []).filter(Boolean);
        const nameOf = (l) => ('' + ((l && (l.name || l.data_type || l.attribution_type)) || 'layer'));

        const clear = () => {
            let n = 0;
            for (const t of tracks) for (const l of layersOf(t)) { if (l.muted) { l.muted = false; n++; } }
            try { if (graph.focusedLayer) graph.focusedLayer = null; } catch (e) { }
            return n;
        };

        // GREY EVERYTHING, WITH NOTHING IN COLOUR. Not the same request as focusing one
        // layer and not a way of saying "put them back", though both were reachable through
        // the word "all": the canvas is being cleared of layer colour so the track itself --
        // its exons, its sequence, its compounds -- can be read without four pictures
        // competing over it.
        if (!layer && o.all) {
            clear();
            let n = 0;
            for (const t of tracks) {
                for (const l of layersOf(t)) {
                    if (l.visible === false) continue;
                    l.muted = true; n++;
                }
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(n ? (n + ' layer' + (n === 1 ? '' : 's') + ' greyed, none in colour. They are '
                    + 'still drawn and nothing has been removed: ask for any one of them to be '
                    + 'focused, or for the layers to be shown in colour again.')
                : 'There are no visible layers to grey.');
            return { focused: null, muted: n, all: true };
        }

        // Nothing to focus: put everything back. This is also what the menu's second press
        // and "show all layers" both come through.
        if (!layer) {
            const n = clear();
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

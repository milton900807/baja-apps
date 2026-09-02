function (graph, genegraph_panel_layout, tracks) {

    // RNASeq Library — every RNASeq dataset under BIG_DATA/RNASeq, as nested libraries:
    // SPECIES, then TISSUE, then the datasets themselves. Only that last card loads, adding
    // the dataset as a coverage layer to every track in scope (not one picked track — that is
    // what the cascading side menu in rnaseq-hierarchy-menu.js is for).
    //   exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout, tracks)
    //
    // It used to be one flat grid of every dataset with species chips along the header. That
    // is a different idiom from the rest of the Data Resources tree, where a choice opens
    // another library; with a few hundred datasets it was also a wall to scroll rather than a
    // question to answer. A level with only one entry in it is skipped, since a library of one
    // is a click that asks nothing.
    //
    // Runs on baja/lib/shelf.js, which owns the overlay, the breadcrumb, Back and Escape.

    return (async () => {

        const restoreHover = () => {
            // Reset the mouse BEFORE re-arming the hover. Loading a dataset can leave a
            // click-a-track listener or a 'msg:' mouse mode behind, and re-arming on top of one
            // leaves the canvas in a mode the user never chose -- the next click goes somewhere
            // unexpected instead of just highlighting.
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        // Terminal outcomes go out as RESULT toasts: the canvas draws only error and result
        // messages, so anything said with setMessage alone is invisible to the user.
        const say = (m) => { try { graph.setResultMessage(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };

        // ---- Load the dataset manifest (recursive walk of the RNASeq tree) --------------
        let datasets = [], speciesList = [], loadErr = null, truncated = false;
        try {
            const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            const r = await exec('py/bio/list-rnaseq-library.py', em);
            try { datasets = JSON.parse(r.datasets) || []; } catch (e) { datasets = []; }
            try { speciesList = JSON.parse(r.species) || []; } catch (e) { speciesList = []; }
            truncated = !!(r && r.truncated);
            loadErr = (r && r.error) || null;
        } catch (e) { loadErr = '' + e; }

        // A one-line description of what a dataset actually is, from its species / tissue.
        const describe = (d) => {
            const sp = ('' + (d.species || '')).toLowerCase();
            const who = sp.indexOf('mouse') >= 0 || sp.indexOf('mus') >= 0 ? 'Mouse'
                : sp.indexOf('rat') >= 0 ? 'Rat'
                    : sp.indexOf('human') >= 0 || sp.indexOf('homo') >= 0 ? 'Human' : (d.species || 'Reference');
            const t = d.tissue || d.label || '';
            const src = /^GTEX-/i.test(d.name || '') ? 'GTEx' : '';
            return who + ' RNASeq coverage' + (t ? ' over ' + t : '')
                + (src ? ' (' + src + ')' : '') + ' — read depth per base, added to each track as a coverage layer.';
        };
        const sizeMB = (n) => { const m = (+n || 0) / (1024 * 1024); return m >= 1 ? (m.toFixed(m >= 10 ? 0 : 1) + ' MB') : ((((+n || 0) / 1024) | 0) + ' KB'); };

        // The tracks this library may load onto: the explicit list when one was handed down
        // (the Layers button passes every track on the canvas, a track menu passes its own),
        // and otherwise whatever is on the board. Selection narrows it further below.
        const universe = () => ((Array.isArray(tracks) && tracks.length) ? tracks.filter(Boolean) : (graph.track || []));

        const nTracks = universe().length;
        // Say up front where a click will land — a selection silently narrowing the load is
        // worse than no narrowing at all.
        let __scopeText = 'all ' + nTracks + ' track' + (nTracks === 1 ? '' : 's') + ' on the board';
        try {
            // Derived the same way loadTargets() derives it, by asking each track. When this
            // used graph.getMarkSelectedTracks() and loadTargets asked the tracks, the header
            // could say "all tracks" while the load correctly used the selection -- a line
            // that describes the work has to be computed from what the work will do.
            const __marked = universe().filter((t) => t && t.chr != null
                && t.selectedRange && t.selectedRange());
            const __sel = (graph.getSelectedTracks() || []).filter((t) => t && t.chr != null);
            if (__marked.length) __scopeText = 'the selected sequence on ' + __marked.length + ' track' + (__marked.length === 1 ? '' : 's');
            else if (__sel.length) __scopeText = __sel.length + ' selected track' + (__sel.length === 1 ? '' : 's');
        } catch (e) { }

        // ---- Which tracks, and over what span? ------------------------------------------
        // Selection narrows the load, in this order:
        //   1. a SEQUENCE selection (markstart/markend) — those tracks, over that span only
        //   2. SELECTED tracks — those tracks, full length
        //   3. nothing selected — every track, full length
        // Returns [{track, start, end}], plus a label describing what was chosen.
        const loadTargets = () => {
            const all = universe().filter((t) => t && t.chr !== undefined && t.chr !== null);

            // ASK EACH TRACK whether it has a selected sequence, rather than asking the graph
            // for the list of tracks that do.
            //
            // graph.getMarkSelectedTracks() was the gate, and every track it returned then had
            // to survive `all.indexOf(t) >= 0` as well. Either step could quietly produce an
            // empty list -- a graph without the helper, a track filtered out for want of a
            // chromosome, a copy rather than the same object reference -- and an empty list
            // does not report a problem here, it falls through to the branches below, which
            // load the FULL LENGTH of every track. A selection that was ignored looked
            // exactly like no selection at all.
            //
            // selectedRange() is the same answer the designers, the models and the other
            // loaders use, and it comes from the track itself, so there is nothing in between
            // to drop it.
            const marked = all.map((t) => {
                const r = (t.selectedRange && t.selectedRange()) || null;
                return r ? { track: t, start: r.start, end: r.end } : null;
            }).filter((r) => r && r.end > r.start);

            if (marked.length) {
                return { scope: 'the selected sequence', items: marked };
            }
            let sel = [];
            try { sel = (graph.getSelectedTracks() || []).filter((t) => all.indexOf(t) >= 0); } catch (e) { sel = []; }
            if (sel.length) {
                return { scope: 'the selected track' + (sel.length === 1 ? '' : 's'), items: sel.map((t) => ({ track: t, start: t.xi, end: t.xf })) };
            }
            return { scope: 'all tracks', items: all.map((t) => ({ track: t, start: t.xi, end: t.xf })) };
        };

        // ---- Load one dataset onto the chosen tracks/spans --------------------------------
        // The shelf has already closed itself by the time this runs, so every outcome here has
        // to reach the user as a toast. This used to write the "nothing to load onto" case into
        // the overlay's own status bar, which is gone by then.
        const loadOntoAllTracks = async (d) => {
            const chosen = loadTargets();
            const items = chosen.items;
            const skipped = universe().length - items.length;
            if (!items.length) {
                say(' Nothing to load ' + d.label + ' onto — no track with a chromosome is selected or on the board. ');
                restoreHover();
                return;
            }
            let TrackLayer;
            try { TrackLayer = await exec('baja/bio/track-layer.js'); }
            catch (e) { say(' Could not load the layer type: ' + e + ' '); return; }

            // One history entry for the whole load, so a single undo takes back the board.
            try { graph.pushOntoHistory(); } catch (e) { }

            let done = 0, failed = 0;
            for (const it of items) {
                const t = it.track, start = it.start, end = it.end;
                try { graph.setMessage(' ⠋ ' + d.label + ' → ' + (t.name || 'track') + ' (' + (done + 1) + '/' + items.length + ')… '); } catch (e) { }
                try {
                    const em = new EngineMonitor((msg) => { try { log(msg); } catch (e) { } });
                    // Only the selected span is read, so a narrow selection is a small query.
                    const res = await exec('py/baja/bigwig/view-bigwig.py', em, d.path, start, end, t.chr);
                    const rv = JSON.parse(res.values);
                    // Name the layer with the span when it is not the whole track, so several
                    // selections of the same dataset stay distinguishable.
                    const nm = (start > t.xi || end < t.xf) ? (d.label + ' [' + start + '-' + end + ']') : d.label;
                    // The layer spans the WHOLE TRACK; the data sits only where it was read.
                    //
                    // It used to be built over [start, end] -- the loaded region -- so a load
                    // scoped to a selection produced a layer whose own coordinate frame was
                    // the selection. Everything drawn in it was then measured against the wrong
                    // span, which is why a selected load did not line up with the track under
                    // it. Same frame the other loaders use (see baja/data/patents.js).
                    const __ax = t.tgraph || t.grid;
                    const __lo = Math.min(__ax.xmin, __ax.xmax);
                    const __hi = Math.max(__ax.xmin, __ax.xmax);
                    const layer = new TrackLayer(nm, __lo, 0, __hi, 1);
                    let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);
                    if (!max_exp || !isFinite(max_exp)) max_exp = 1.0;
                    // Flat at the track edges and at the edges of the read, so the polygon
                    // closes across the full width and reads as "no data here" outside the
                    // region rather than sloping in from the track's first base.
                    layer.addPolygonPoint(__lo, 0);
                    if (start > __lo) layer.addPolygonPoint(start, 0);
                    for (const v of rv) {
                        if (!v || !isFinite(v[1])) continue;
                        layer.addPolygonPoint(v[0], v[1] / max_exp);
                    }
                    if (end < __hi) layer.addPolygonPoint(end, 0);
                    layer.addPolygonPoint(__hi, 0);
                    layer.sortPolygonPoints();
                    t.addLayer(layer);
                    done++;
                    if (graph.wake) graph.wake();
                } catch (e) {
                    failed++;
                    try { log('[rnaseq-library] ' + (t.name || 'track') + ': ' + e); } catch (e2) { }
                }
            }
            // setResultMessage, not setMessage: the canvas only draws ERROR and RESULT messages
            // as a toast (see flexigraph/gene.js), so a plain setMessage on completion was set
            // and then never shown -- data appeared with no confirmation that anything happened.
            say(' Added ' + d.label + ' to ' + done + ' track' + (done === 1 ? '' : 's')
                + ' (' + chosen.scope + ')'
                + (failed ? (' — ' + failed + ' failed') : '')
                + (skipped > 0 ? (' — ' + skipped + ' not included') : '') + '. ');
            if (graph.wake) graph.wake();
            restoreHover();
        };

        // ---- The shelves: species → tissue → dataset --------------------------------------
        const groupBy = (list, key) => {
            const m = new Map();
            for (const d of list) {
                const k = ('' + (d[key] || '')).trim() || 'Other';
                if (!m.has(k)) m.set(k, []);
                m.get(k).push(d);
            }
            // Biggest group first: the species or tissue with the most datasets is the one most
            // likely to be wanted, and an alphabetical list buries it behind whatever starts
            // with an A.
            return [...m.entries()].sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]));
        };
        const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

        // The leaf. Nothing above this touches a track.
        const datasetBooks = (list) => list.map((d) => ({
            title: d.label,
            badge: d.species || 'RNASeq',
            blurb: describe(d) + ' (' + sizeMB(d.size) + ')',
            open: () => loadOntoAllTracks(d)
        }));

        const tissueBooks = (list) => {
            const groups = groupBy(list, 'tissue');
            // One tissue (or none named) is not a choice — go straight to the datasets rather
            // than making the user click through a library holding a single card.
            if (groups.length <= 1) return datasetBooks(list);
            return groups.map(([tissue, ds]) => ({
                title: tissue,
                badge: plural(ds.length, 'dataset'),
                blurb: 'RNASeq coverage over ' + tissue + ' — ' + plural(ds.length, 'dataset') + ' to choose from.',
                subtitle: 'Pick a ' + tissue + ' dataset to load onto ' + __scopeText,
                books: () => datasetBooks(ds)
            }));
        };

        const topBooks = () => {
            const groups = groupBy(datasets, 'species');
            if (groups.length <= 1) return tissueBooks(datasets);
            return groups.map(([species, ds]) => {
                const nTissues = groupBy(ds, 'tissue').length;
                return {
                    title: species,
                    badge: plural(ds.length, 'dataset'),
                    blurb: plural(ds.length, 'dataset') + ' for ' + species
                        + (nTissues > 1 ? ', across ' + plural(nTissues, 'tissue') + '.' : '.'),
                    subtitle: 'Pick a tissue',
                    books: () => tissueBooks(ds)
                };
            });
        };

        // A failed or empty manifest has to say WHY on the shelf itself. An empty grid with no
        // explanation was the old status bar's job, and the shared shelf has no status bar.
        const books = datasets.length ? topBooks() : [{
            title: loadErr ? 'RNASeq data could not be listed' : 'No RNASeq datasets found',
            badge: 'Unavailable',
            ready: false,
            blurb: loadErr ? ('' + loadErr) : 'Nothing was found under BIG_DATA/RNASeq on this deployment.'
        }];

        const note = loadErr ? (' — ' + loadErr)
            : (truncated ? ' — showing the first ' + datasets.length + ' found' : '');

        await exec('baja/lib/shelf.js', {
            id: 'baja-rnaseq-library',
            title: 'RNASeq Library',
            subtitle: plural(datasets.length, 'dataset') + ' — pick one to load onto ' + __scopeText + note,
            books: books,
            graph: graph,
            onClose: restoreHover
        });
    })();
}

function (graph, genegraph_panel_layout, tracks) {

    // RNASeq Library — a browsable shelf of every RNASeq dataset under BIG_DATA/RNASeq,
    // with species / tissue and a short description on each card. Clicking a dataset loads
    // it as a coverage layer onto EVERY track on the board (not one picked track — that is
    // what the cascading side menu in rnaseq-hierarchy-menu.js is for).
    //   exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout)
    //
    // Navy demo look-and-feel, matching manchester/clinical-library.js.

    return (async () => {
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const restoreHover = () => {
            // Reset the mouse BEFORE re-arming the hover. Loading a dataset can leave a
            // click-a-track listener or a 'msg:' mouse mode behind, and re-arming on top of one
            // leaves the canvas in a mode the user never chose -- the next click goes somewhere
            // unexpected instead of just highlighting.
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

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

        // ---- Overlay panel --------------------------------------------------------------
        try { const old = document.getElementById('baja-rnaseq-library'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const overlay = document.createElement('div');
        overlay.id = 'baja-rnaseq-library';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        // The tracks this library may load onto: the explicit list when one was handed down
        // (the Layers button passes every track on the canvas, a track menu passes its own),
        // and otherwise whatever is on the board. Selection narrows it further below.
        // Declared here, above its first use: a const is in the temporal dead zone until its
        // own line runs, so defining it further down would throw when the header is built.
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
        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
            + 'display:flex;align-items:center;gap:16px;box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:2px;">'
            + '<div style="font:700 19px Arial;">RNASeq Library</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;">' + datasets.length + ' dataset(s) — click one to load it onto '
            + esc(__scopeText) + '</div>'
            + '</div>'
            + '<input id="rl-search" placeholder="Search species, tissue, file…" style="flex:1;max-width:420px;margin-left:auto;'
            + 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:9px 16px;font:13px Arial;"/>'
            + '<div id="rl-filters" style="display:flex;gap:6px;flex-wrap:wrap;"></div>'
            + '<button id="rl-close" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const shelf = document.createElement('div');
        shelf.id = 'rl-shelf';
        shelf.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;align-content:start;';

        const status = document.createElement('div');
        status.style.cssText = 'flex:0 0 auto;padding:10px 22px;background:#0b2545;border-top:1px solid rgba(255,255,255,0.12);font:12.5px Arial;color:#9fb3c8;min-height:18px;';
        status.textContent = loadErr ? ('Could not list RNASeq data: ' + loadErr)
            : (truncated ? 'Showing the first ' + datasets.length + ' datasets found.' : '');

        overlay.appendChild(header); overlay.appendChild(shelf); overlay.appendChild(status);
        document.body.appendChild(overlay);

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
        };
        onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        header.querySelector('#rl-close').onclick = close;

        // ---- Species filter chips -------------------------------------------------------
        let activeSpecies = 'All';
        const filterWrap = header.querySelector('#rl-filters');
        const chipEls = {};
        const paintChips = () => {
            for (const k in chipEls) {
                const on = (k === activeSpecies);
                chipEls[k].style.background = on ? '#12c2e0' : 'transparent';
                chipEls[k].style.color = on ? '#04212a' : '#fff';
                chipEls[k].style.borderColor = on ? '#12c2e0' : 'rgba(255,255,255,0.2)';
            }
        };
        for (const s of ['All'].concat(speciesList)) {
            const b = document.createElement('button');
            b.textContent = s;
            b.style.cssText = 'cursor:pointer;border-radius:999px;padding:7px 12px;font:700 12px Arial;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;';
            b.onclick = () => { activeSpecies = s; paintChips(); render(); };
            chipEls[s] = b; filterWrap.appendChild(b);
        }
        paintChips();

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
        const loadOntoAllTracks = async (d) => {
            const chosen = loadTargets();
            const items = chosen.items;
            const skipped = universe().length - items.length;
            if (!items.length) {
                status.textContent = 'Nothing to load ' + d.label + ' onto — no track with a chromosome is selected or on the board.';
                return;
            }
            close();
            let TrackLayer;
            try { TrackLayer = await exec('baja/bio/track-layer.js'); }
            catch (e) { try { graph.setMessage(' Could not load the layer type: ' + e + ' '); } catch (e2) { } return; }

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
            try {
                // setResultMessage, not setMessage: the canvas only draws ERROR and RESULT messages as a
            // toast (see flexigraph/gene.js), so a plain setMessage on completion was set and
            // then never shown -- data appeared with no confirmation that anything had happened.
                graph.setResultMessage(' Added ' + d.label + ' to ' + done + ' track' + (done === 1 ? '' : 's')
                    + ' (' + chosen.scope + ')'
                    + (failed ? (' — ' + failed + ' failed') : '')
                    + (skipped > 0 ? (' — ' + skipped + ' not included') : '') + '. ');
            } catch (e) { }
            if (graph.wake) graph.wake();
            restoreHover();
        };

        // ---- Render the shelf -----------------------------------------------------------
        const searchEl = header.querySelector('#rl-search');
        const render = () => {
            const q = ('' + (searchEl.value || '')).trim().toLowerCase();
            shelf.innerHTML = '';
            const shown = datasets.filter((d) => {
                if (activeSpecies !== 'All' && d.species !== activeSpecies) return false;
                if (!q) return true;
                return (d.label + ' ' + d.species + ' ' + d.tissue + ' ' + d.name).toLowerCase().indexOf(q) >= 0;
            });
            if (!shown.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#9fb3c8;font:13px Arial;padding:24px;';
                empty.textContent = loadErr ? ('Could not list RNASeq data: ' + loadErr) : 'No RNASeq datasets match.';
                shelf.appendChild(empty);
                return;
            }
            for (const d of shown) {
                const card = document.createElement('div');
                card.style.cssText = 'background:#0b2545;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:14px 16px;'
                    + 'cursor:pointer;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 18px rgba(0,0,0,0.28);';
                card.onmouseenter = () => { card.style.borderColor = '#12c2e0'; card.style.transform = 'translateY(-2px)'; };
                card.onmouseleave = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; card.style.transform = ''; };
                card.innerHTML = ''
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                    + '<span style="flex:0 0 auto;border-radius:999px;padding:3px 9px;font:700 10.5px Arial;background:rgba(18,194,224,0.16);color:#4fd0e6;">'
                    + esc(d.species || 'RNASeq') + '</span>'
                    + '<span style="color:#8fb8c8;font:11.5px Arial;margin-left:auto;">' + esc(sizeMB(d.size)) + '</span>'
                    + '</div>'
                    + '<div style="font:700 14px Arial;color:#eaf6f9;line-height:1.3;">' + esc(d.label) + '</div>'
                    + '<div style="font:12px/1.5 Arial;color:#9fb3c8;">' + esc(describe(d)) + '</div>';
                card.onclick = () => loadOntoAllTracks(d);
                shelf.appendChild(card);
            }
        };
        searchEl.oninput = render;
        render();
        try { searchEl.focus(); } catch (e) { }
    })();
}

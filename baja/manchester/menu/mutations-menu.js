function (graph, genegraph_panel_layout) {
    // A drill-down side menu off Navigate -> Mutations:
    //   tracks (that have mutations)  ->  mutation types  ->  variants by g. location.
    // Any level with more than PAGE entries pages with a "More…" item and a "‹ Back" item
    // (Back = previous page while paging, else up to the parent level).
    return new Promise((resolve) => {
        const PAGE = 12;
        const hide = () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } };

        const rearmNavigate = () => {
            try {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
            } catch (e) { }
        };

        // Show one page of `items` ({label, onClick}); onParent (optional) is the level above.
        const showPaged = (items, page, onParent) => {
            const start = page * PAGE;
            const slice = items.slice(start, start + PAGE);
            const menu = [];
            if (page > 0) menu.push({ label: '‹ Back', move: () => { }, click: () => showPaged(items, page - 1, onParent) });
            else if (onParent) menu.push({ label: '‹ Back', move: () => { }, click: () => onParent() });
            for (const it of slice) menu.push({ label: it.label, move: () => { }, click: () => it.onClick() });
            if (start + PAGE < items.length) menu.push({ label: 'More… (' + (items.length - (start + PAGE)) + ' more)', move: () => { }, click: () => showPaged(items, page + 1, onParent) });
            graph.showMenu(menu);
        };

        // Zoom the view onto a single variant on its track.
        const zoomToSnp = async (t, s) => {
            try {
                const xi = s.xi, pad = 60;
                if (graph.goToTrackLocus && t.name) { await graph.goToTrackLocus(t.name, xi - pad, xi + pad); }
                else if (t.tgraph && graph.graph && t.tgraph.X) {
                    const a = graph.graph.X ? t.tgraph.X(xi - pad) : null;   // world->grid
                    if (a != null) { graph.graph.setxmin(t.tgraph.X(xi - pad)); graph.graph.setxmax(t.tgraph.X(xi + pad)); }
                }
                try { s.highlight = true; } catch (e) { }
                if (graph.wake) graph.wake();
            } catch (e) { }
        };

        // Level 3: variants of a given type on a track, sorted by genomic (g.) location.
        const showByLocation = (t, snps) => {
            const sorted = snps.slice().sort((a, b) => (a.xi || 0) - (b.xi || 0));
            const chr = (t.chr != null && ('' + t.chr).length) ? ('chr' + t.chr + ':') : '';
            const items = sorted.map((s) => {
                const ref = s.reference || s.reference0 || '';
                const alt = s.alternate || s.alternate0 || s.sequence || '';
                const nm = (s.name && s.name !== 'variant') ? ('  ' + s.name) : '';
                return {
                    label: chr + 'g.' + Math.round(s.xi) + (ref || alt ? ('  ' + ref + '>' + alt) : '') + nm,
                    onClick: async () => { hide(); await zoomToSnp(t, s); rearmNavigate(); }
                };
            });
            showPaged(items, 0, () => showTypes(t));
        };

        // Level 2: mutation types present on a track.
        const showTypes = (t) => {
            const byType = {};
            for (const s of (t.snpindels || [])) {
                const ty = ('' + (s.type || 'snp')).toLowerCase();
                (byType[ty] = byType[ty] || []).push(s);
            }
            const keys = Object.keys(byType).sort();
            const items = keys.map((ty) => ({
                label: ty.toUpperCase() + '  (' + byType[ty].length + ')',
                onClick: () => showByLocation(t, byType[ty])
            }));
            showPaged(items, 0, () => showTracks());
        };

        // Level 1: tracks that carry any mutations.
        const withMuts = (graph.track || []).filter((t) => t && ((t.snpindels || []).length > 0));
        const showTracks = () => {
            const items = withMuts.map((t) => ({
                label: (t.name || 'track') + '  (' + (t.snpindels || []).length + ')',
                onClick: () => showTypes(t)
            }));
            showPaged(items, 0, null);
        };

        if (!withMuts.length) { graph.setMessage(' No mutations on any track. '); resolve(null); return; }
        showTracks();
        resolve(null);
    });
}

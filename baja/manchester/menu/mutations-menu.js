function (graph, genegraph_panel_layout) {
    // A drill-down SIDE menu off Navigate -> Mutations:
    //   tracks (that have mutations)  ->  mutation types  ->  variants by g. location.
    // Any level with more than PAGE entries pages with a "More…" item and a "‹ Back" item
    // (Back = previous page while paging, else up to the parent level). The final leaf
    // (a variant) zooms the view onto that SNP.
    return new Promise((resolve) => {
        const PAGE = 12;

        const rearmNavigate = () => {
            try {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
            } catch (e) { }
        };
        const closeMenu = () => {
            try { if (graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
            rearmNavigate();
        };

        // Show one page of `items` ({label, onClick}) in the SIDE menu; onParent (optional)
        // is the level above. Root level (no parent) also gets a Close item.
        const showPaged = (items, page, onParent) => {
            const start = page * PAGE;
            const slice = items.slice(start, start + PAGE);
            const menu = [];
            if (page > 0) menu.push({ label: '‹ Back', move: () => { }, click: () => showPaged(items, page - 1, onParent) });
            else if (onParent) menu.push({ label: '‹ Back', move: () => { }, click: () => onParent() });
            for (const it of slice) menu.push({ label: it.label, move: () => { }, click: () => it.onClick() });
            if (start + PAGE < items.length) menu.push({ label: 'More… (' + (items.length - (start + PAGE)) + ' more)', move: () => { }, click: () => showPaged(items, page + 1, onParent) });
            if (!onParent) menu.push({ label: 'Close', move: () => { }, click: () => closeMenu() });
            try { graph.showSideMenu(menu); } catch (e) { }
        };

        // Leaf action: ANIMATE a zoom onto a single variant, centered, but backed off so the
        // marker's label + some buffer are visible (not zoomed all the way to the sequence).
        const zoomToSnp = async (t, s) => {
            try {
                const tg = t && t.tgraph;
                if (!tg || !tg.X) return;

                // Zoom just close enough to READ the base sequence, but no closer. Track
                // sequence letters only render above ~5 px/base (track.js), so target a
                // fixed px-per-base a little past that where the letters are cleanly
                // legible. The window width in bases = grid pixel width / target px-per-base,
                // centered on the SNP; zoomRect fits it to the same pixel width, landing the
                // final zoom at exactly TARGET px/base regardless of where we started.
                const TARGET_PXPB = 13;                // px per base: sequence readable, not over-zoomed
                let gridW = 800;
                try { gridW = (graph.grid && graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
                const worldPerBase = Math.abs((tg.screenWidth ? tg.screenWidth(1) : (tg.X(s.xi + 1) - tg.X(s.xi))) || 1) || 1;
                const halfWorld = (worldPerBase * gridW) / (2 * TARGET_PXPB);
                const centerW = tg.X(s.xi);
                const xMin = centerW - halfWorld, xMax = centerW + halfWorld;
                const yA = tg.yi, yB = tg.yi + (tg.height || 0);
                const cy = (yA + yB) / 2;
                const yhalf = (Math.abs(yB - yA) || 1) * 2.2;   // extra vertical room for the label
                try { s.highlight = true; } catch (e) { }
                if (graph.zoomRect) {
                    await graph.zoomRect(xMin, xMax, cy + yhalf, cy - yhalf, 500);   // smooth animated
                } else if (graph.graph && graph.graph.setxmin) {
                    graph.graph.setxmin(xMin); graph.graph.setxmax(xMax);
                    graph.graph.setymin(cy + yhalf); graph.graph.setymax(cy - yhalf);
                }
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
                    onClick: async () => { closeMenu(); await zoomToSnp(t, s); }
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

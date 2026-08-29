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

                // Zoom just close enough to SEE the base sequence, but no closer. Track
                // sequence letters only render above screencell > 5 px/base (track.js), so
                // target just past that threshold — the most zoomed-out view that still
                // shows the sequence (maximizing surrounding context). Window width in bases
                // = grid pixel width / target px-per-base, centered on the SNP; zoomRect fits
                // it to the same pixel width, landing the final zoom at exactly TARGET px/base.
                const TARGET_PXPB = 6;                 // px per base: just above the >5 sequence-visible threshold
                let gridW = 800;
                try { gridW = (graph.grid && graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
                const worldPerBase = Math.abs((tg.screenWidth ? tg.screenWidth(1) : (tg.X(s.xi + 1) - tg.X(s.xi))) || 1) || 1;
                const halfWorld = (worldPerBase * gridW) / (2 * TARGET_PXPB);
                const centerW = tg.X(s.xi);
                const xMin = centerW - halfWorld, xMax = centerW + halfWorld;
                const yA = tg.yi, yB = tg.yi + (tg.height || 0);
                const cy = (yA + yB) / 2;
                const span = (Math.abs(yB - yA) || 0.1);
                // The SNP lollipop pops a FIXED ~30–150px (stem + head + label) UP from the track
                // and can fan to either side. Reserve generous vertical room — biased toward the
                // top (lollipop side) so it never clips off-screen — while staying zoomed in enough
                // for the sequence. Keep room below too so a down-fanned marker also stays visible.
                const topExt = span * 3.6;   // toward screen top (the ymin side)
                const botExt = span * 2.2;   // toward screen bottom
                try { s.highlight = true; } catch (e) { }
                if (graph.zoomRect) {
                    await graph.zoomRect(xMin, xMax, cy + topExt, cy - botExt, 500);   // smooth animated
                } else if (graph.graph && graph.graph.setxmin) {
                    graph.graph.setxmin(xMin); graph.graph.setxmax(xMax);
                    graph.graph.setymin(cy + topExt); graph.graph.setymax(cy - botExt);
                }
                try { exec('baja/manchester/menu/focus-mutation.js', graph, s, 10000); } catch (e) { }
                if (graph.wake) graph.wake();
            } catch (e) { }
        };

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // "Tour mutations": animate a zoom to every variant on every track. At each stop it
        // dwells ~10s (auto-advancing) but also shows a side menu with Previous / Next / Done so
        // the user can step through at their own pace.
        const tourMutations = async () => {
            const stops = [];
            for (const t of withMuts) {
                const sorted = (t.snpindels || []).slice().sort((a, b) => (a.xi || 0) - (b.xi || 0));
                for (const s of sorted) stops.push({ t, s });
            }
            if (!stops.length) { closeMenu(); return; }

            let i = 0, cancelled = false, timer = null;
            const clearT = () => { if (timer) { clearTimeout(timer); timer = null; } };
            const finish = () => { cancelled = true; clearT(); closeMenu(); };
            const go = async () => {
                clearT();
                if (cancelled) return;
                if (i < 0) i = 0;
                if (i >= stops.length) { finish(); return; }
                const st = stops[i];
                try { await zoomToSnp(st.t, st.s); } catch (e) { }
                if (cancelled) return;
                const nm = (st.s && (st.s.name || st.s.comment)) || ('Variant ' + (i + 1));
                const menu = [
                    { label: 'Tour  ' + (i + 1) + ' / ' + stops.length + ':  ' + nm, move: () => { }, click: () => { clearT(); go(); } },
                    { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                    { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                    { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                ];
                try { graph.showSideMenu(menu); } catch (e) { }
                timer = setTimeout(() => { i++; go(); }, 10000);   // auto-advance after 10s
            };
            go();
        };

        // Level 3: variants of a given type on a track, sorted by genomic (g.) location.
        const showByLocation = (t, snps) => {
            const sorted = snps.slice().sort((a, b) => (a.xi || 0) - (b.xi || 0));
            const chr = (t.chr != null && ('' + t.chr).length) ? ('chr' + t.chr + ':') : '';
            const items = sorted.map((s) => {
                const ref = s.reference || s.reference0 || '';
                const alt = s.alternate || s.alternate0 || s.sequence || '';
                const nm = (s.name && s.name !== 'variant') ? ('  ' + s.name) : '';
                // Only show ref>alt when it is a REAL change ("N>N" / any X>X is impossible).
                const change = (ref && alt && ('' + ref).toUpperCase() !== ('' + alt).toUpperCase()) ? ('  ' + ref + '>' + alt) : '';
                return {
                    label: chr + 'g.' + Math.round(s.xi) + change + nm,
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
            const items = [
                { label: '▶ Tour mutations', onClick: () => { tourMutations(); } },
                ...withMuts.map((t) => ({
                    label: (t.name || 'track') + '  (' + (t.snpindels || []).length + ')',
                    onClick: () => showTypes(t)
                }))
            ];
            showPaged(items, 0, null);
        };

        if (!withMuts.length) { graph.setMessage(' No mutations on any track. '); resolve(null); return; }
        showTracks();
        resolve(null);
    });
}

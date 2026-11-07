function (graph, genegraph_panel_layout) {
    // MENUS AT THE POINTER, NOT IN THE CORNER. This module is entered from a menubar or a
    // toolbar, so there is no canvas press behind it and showSideMenu had nothing to anchor
    // to -- every question it asks came up as the top-left side panel, in a different place
    // and a different style from every menu reached by clicking the canvas.
    // graph.openMenuAtPointer (flexigraph/gene.js) draws the same list at the pointer, and
    // defers to an open floating session when this module is instead reached from a press,
    // so the mixed-entry callers keep their place. The || keeps older graphs working.
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
            try { (graph.openMenuAtPointer || graph.showSideMenu).call(graph, menu); } catch (e) { }
        };

        // Leaf action: ANIMATE a zoom onto a single variant, centered, but backed off so the
        // marker's label + some buffer are visible (not zoomed all the way to the sequence).
        // One implementation, shared with the ClinVar splice tool's results window: see
        // baja/manchester/menu/zoom-to-variant.js for what "correctly" means here (sequence
        // visible, vertical room for the lollipop, spotlight before the animation).
        const zoomToSnp = async (t, s, opts) => {
            try {
                const ZV = await exec('baja/manchester/menu/zoom-to-variant.js');
                return await ZV(graph, t, s, opts);
            } catch (e) { return false; }
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
                try { await zoomToSnp(st.t, st.s, { select: false }); } catch (e) { }
                if (cancelled) return;
                const nm = (st.s && (st.s.name || st.s.comment)) || ('Variant ' + (i + 1));
                const menu = [
                    { label: 'Tour  ' + (i + 1) + ' / ' + stops.length + ':  ' + nm, move: () => { }, click: () => { clearT(); go(); } },
                    { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                    { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                    { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                ];
                try { (graph.showTourMenu ? graph.showTourMenu(menu) : graph.showSideMenu(menu)); } catch (e) { }
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

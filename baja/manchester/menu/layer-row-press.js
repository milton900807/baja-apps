function (graph, genegraph_panel_layout) {
    // A PRESS ON A LAYER'S LABEL ROW OPENS ITS MENU, whatever else the graph is doing.
    //   exec('baja/manchester/menu/layer-row-press.js', graph, genegraph_panel_layout)
    //
    // The rows under a track's name (baja/bio/track.js, kept as rectangles on track.__layerTabs) used
    // to be hit-tested from a mouse-down LISTENER that mouse-over-highlight.js registers on the graph.
    // That chain only runs when: no side menu is open, no centre menu is up, the listeners have not
    // been cleared by a mode change, and nothing earlier in the press swallowed it. After a paste the
    // Tour's side menu and a run of mode changes are exactly what is going on, and the row would
    // react to the pointer (it highlights) while the press did nothing.
    //
    // So the press is caught here, on the canvas ELEMENT, in the capture phase, before the graph's own
    // handlers see it. If it lands on a row that press is consumed -- the canvas neither starts a pan
    // nor deselects from it -- and the row's menu opens. Anywhere else the event goes on untouched.
    //
    // Installed once per canvas element; calling this again (mouse-over-highlight.js re-runs whenever
    // the hover is restored) only refreshes which graph it talks to.
    return (async () => {
        let cv = null;
        try { const fg = graph.graph || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
        if (!cv) { try { const fg = graph.graph || graph; cv = fg.canvas.getCTX().canvas; } catch (e) { cv = null; } }
        if (!cv || !cv.addEventListener) return false;

        cv.__bajaLayerRow = { graph: graph, layout: genegraph_panel_layout };
        if (cv.__bajaLayerRowInstalled) return true;
        cv.__bajaLayerRowInstalled = true;

        // Pointer in CANVAS pixels -- the units the row rectangles are in -- from a page position.
        const toCanvas = (e) => {
            const r = cv.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) * (r.width ? cv.width / r.width : 1),
                y: (e.clientY - r.top) * (r.height ? cv.height / r.height : 1)
            };
        };
        const rowAt = (g, p) => {
            for (const t of ((g && g.track) || [])) {
                for (const r of ((t && t.__layerTabs) || [])) {
                    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { track: t, row: r };
                }
            }
            return null;
        };

        cv.addEventListener('mousedown', async (e) => {
            try {
                if (e.button !== 0) return;
                const ctx = cv.__bajaLayerRow;
                if (!ctx || !ctx.graph) return;
                const p = toCanvas(e);
                const hit = rowAt(ctx.graph, p);
                if (!hit) return;
                // Ours. Nothing else acts on this press, and the release that follows must not
                // open a context menu on the canvas either.
                e.stopImmediatePropagation();
                e.preventDefault();
                ctx.graph.__downMenuHandled = true;
                let opened = false;
                if (hit.row.layer) {
                    try {
                        await exec('baja/manchester/menu/track-layer-popup.js',
                            hit.track, hit.row.layer, ctx.graph, ctx.layout, p.x, p.y);
                        opened = true;
                    } catch (err) { console.warn('[layer row] popup failed', err); }
                }
                // The "+N more" row has no layer of its own: it lists them all.
                if (!opened) {
                    await exec('baja/manchester/menu/track-layers-side-menu.js',
                        hit.track, ctx.layout, ctx.graph, hit.row.layer || null);
                }
            } catch (err) { console.warn('[layer row] press', err); }
        }, true);
        return true;
    })();
}

function (graph, genegraph_panel_layout) {
    // A PRESS ON A LAYER'S LABEL ROW OPENS ITS MENU, whatever else the graph is doing.
    //   exec('baja/manchester/menu/layer-row-press.js', graph, genegraph_panel_layout)
    //
    // The rows under a track's name (baja/bio/track.js, kept as rectangles on track.__layerTabs) used
    // to be hit-tested from a mouse-down LISTENER that mouse-over-highlight.js registers on the graph.
    // That chain only runs when no side menu is open, no centre menu is up, the graph's listeners have
    // not been cleared by a mode change, and nothing earlier in the press swallowed it. After a paste
    // the Tour's side menu and a run of mode changes are exactly what is going on, and the row would
    // react to the pointer (it highlights) while the press did nothing.
    //
    // So the press is caught here instead, at the WINDOW, in the capture phase -- before the canvas, the
    // graph or the app's own handlers see it -- and not on the canvas element alone:
    //   * an element stacked over the canvas is then no obstacle: the press is tested against where
    //     the canvas IS, and the topmost element there only has to be the canvas or something in the
    //     same container (a menu, a modal or a popup over it is left to handle its own press);
    //   * both pointerdown and mousedown are listened for. If the app takes pointerdown and calls
    //     preventDefault, the browser never sends the mousedown at all, so a mousedown-only handler
    //     would never fire; one press is only ever acted on once.
    // If the press lands on a row it is consumed -- the canvas neither starts a pan nor deselects from
    // it -- and the row's menu opens. Anywhere else the event goes on untouched.
    //
    // Installed once per page; calling this again (mouse-over-highlight.js re-runs whenever the hover
    // is restored) only refreshes which graph it talks to.
    //
    // FOR DEBUGGING: window.__bajaLayerRowInfo() says where the canvas is, which rows exist, and what the
    // last press did (whether it was seen, where, what was under it, whether it hit a row).
    return (async () => {
        let cv = null;
        try { const fg = graph.graph || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
        if (!cv) { try { const fg = graph.graph || graph; cv = fg.canvas.getCTX().canvas; } catch (e) { cv = null; } }
        if (!cv || !cv.addEventListener) return false;

        const S = window.__bajaLayerRow = window.__bajaLayerRow || { installed: false, last: null, presses: 0 };
        S.cv = cv;                                   // the CURRENT canvas: a new editor page has a new one
        S.graph = graph; S.layout = genegraph_panel_layout;
        if (S.installed) return true;
        S.installed = true;

        const toCanvas = (e, el) => {
            const r = el.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) * (r.width ? el.width / r.width : 1),
                y: (e.clientY - r.top) * (r.height ? el.height / r.height : 1)
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
        const describe = (el) => el ? ((el.nodeName || '') + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : null;
        let lastHandledAt = 0;

        const onPress = async (e) => {
            const rec = { type: e.type, button: e.button, at: Date.now(), seen: true, inCanvas: false, hit: false, opened: null };
            S.last = rec;
            try {
                if (e.button !== 0) return;
                const el = S.cv, g = S.graph;
                if (!el || !g || !el.isConnected) return;
                const r = el.getBoundingClientRect();
                if (!(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) return;
                rec.inCanvas = true;
                // What is on top of the canvas at that point. The canvas, or anything in its own container,
                // is part of the canvas as far as a press goes; anything else (a menu, a dialog, our own
                // popup) owns the press.
                const top = document.elementFromPoint(e.clientX, e.clientY);
                rec.top = describe(top);
                const box = el.parentElement;
                if (!(top === el || (box && top && box.contains(top) && !top.closest('[role="menu"],[role="dialog"],#baja-layer-popup')))) return;
                const p = toCanvas(e, el);
                rec.at_canvas_px = { x: Math.round(p.x), y: Math.round(p.y) };
                const hit = rowAt(g, p);
                if (!hit) return;
                rec.hit = true;
                rec.row = (hit.row.layer && (hit.row.layer.name || hit.row.layer.data_type)) || '(more)';
                // The other event for this same physical press (pointerdown, then the mousedown the
                // browser sends after it) is consumed but not acted on twice.
                const dup = (rec.at - lastHandledAt) < 250;
                e.stopImmediatePropagation();
                e.preventDefault();
                if (dup) return;
                lastHandledAt = rec.at;
                S.presses++;
                g.__downMenuHandled = true;
                try { g.setMessage(' ' + (rec.row === '(more)' ? 'Track layers' : 'Layer: ' + rec.row) + ' '); } catch (err) { }
                let opened = false;
                if (hit.row.layer) {
                    try {
                        await exec('baja/manchester/menu/track-layer-popup.js', hit.track, hit.row.layer, g, S.layout, p.x, p.y);
                        opened = true; rec.opened = 'popup';
                    } catch (err) { rec.error = '' + (err && err.message || err); console.warn('[layer row] popup failed', err); }
                }
                // The "+N more" row has no layer of its own: it lists them all.
                if (!opened) {
                    await exec('baja/manchester/menu/track-layers-side-menu.js', hit.track, S.layout, g, hit.row.layer || null);
                    rec.opened = 'side-menu';
                }
            } catch (err) { rec.error = '' + (err && err.message || err); console.warn('[layer row] press', err); }
        };
        window.addEventListener('pointerdown', onPress, true);
        window.addEventListener('mousedown', onPress, true);

        window.__bajaLayerRowInfo = () => {
            const el = S.cv, g = S.graph;
            let rect = null; try { const r = el.getBoundingClientRect(); rect = { left: r.left, top: r.top, w: r.width, h: r.height, canvasW: el.width, canvasH: el.height }; } catch (e) { }
            const rows = [];
            try { for (const t of ((g && g.track) || [])) for (const r of ((t && t.__layerTabs) || [])) rows.push({ track: t.name, layer: (r.layer && (r.layer.name || r.layer.data_type)) || '(more)', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }); } catch (e) { }
            return { installed: S.installed, connected: !!(el && el.isConnected), canvas: rect, tracks: ((g && g.track) || []).length, rows: rows, presses: S.presses, last: S.last };
        };
        return true;
    })();
}

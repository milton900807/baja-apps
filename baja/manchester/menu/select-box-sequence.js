function (graph, genegraph_panel_layout) {
    // Box-drag sequence selection: drag a translucent rectangle; on release, select the
    // sequence range (the box's horizontal extent) on every track the box spans. Mirrors
    // the Xwc / track.highlight(start,end) mapping used by select-sequence.js.
    graph.clearMouseListeners();
    graph.setMouseMode('msg: Drag a box to select a sequence region');
    try { if (graph.selectOff) graph.selectOff(); } catch (e) { }

    let md = false, dnx = 0, dny = 0;

    graph.addMouseDownListener(async (x, y) => {
        let HighlightBox = await exec('flexigraph/shapes/highlight-box.js');
        md = true; dnx = x; dny = y;
        graph.currentShape = new HighlightBox('sel', x, y);
    });

    graph.addMouseMoveListener((x, y) => {
        if (!md) return;
        if (graph.currentShape) graph.currentShape.update(x, y);
    });

    graph.addMouseUpListener((x, y) => {
        md = false;
        graph.currentShape = null;
        try {
            const xLeft = Math.min(dnx, x), xRight = Math.max(dnx, x);
            const yTop = Math.min(dny, y), yBot = Math.max(dny, y);
            const xMid = xLeft + (xRight - xLeft) / 2;

            // Find every track the box vertically spans (sample down the box).
            const seen = {}, tracks = [];
            const steps = 14;
            for (let i = 0; i <= steps; i++) {
                const yy = yTop + (yBot - yTop) * (i / steps);
                const ti = graph.getTrack(xMid, yy);
                if (ti >= 0 && !seen[ti]) { seen[ti] = true; tracks.push(graph.track[ti]); }
            }

            graph.deselectAllTracks();
            let n = 0, firstTrack = null;
            for (const t of tracks) {
                if (!t || !t.tgraph) continue;
                const s = Math.ceil(t.tgraph.Xwc(xLeft) - t.tgraph.xi * 2);
                const e = Math.floor(t.tgraph.Xwc(xRight) - t.tgraph.xi * 2);
                if (e > s) {
                    t.select();
                    if (t.highlight) t.highlight(s, e);
                    if (graph.addTrackToSelection) graph.addTrackToSelection(t);
                    if (!firstTrack) firstTrack = t;
                    n++;
                }
            }
            graph.showDisplay = true;
            graph.setMessage(n ? (' Selected a sequence region on ' + n + ' track' + (n === 1 ? '' : 's') + '.')
                : ' No track under the box — drag over a track to select.');
            // Show annotation tools for the selection.
            if (n > 0) {
                setTimeout(() => {
                    try { exec('baja/manchester/menu/selected-sequence-tools.js', graph, genegraph_panel_layout, firstTrack); } catch (e) { }
                }, 80);
            }
        } catch (e) {
            console.warn('box sequence select failed', e);
        }
        // Return to navigate + mouse-over-highlight.
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (graph.graph) graph.graph.mode = 'navigate'; } catch (e) { }
        if (graph.wake) graph.wake();
    });
}

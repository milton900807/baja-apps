function (graph, selectedTrack, genegraph_panel_layout) {

    // "Selected Sequence" side menu — the counterpart to the selected-TRACK menu, opened by
    // clicking inside an existing selection. Same shape (Layers / Data / Models / Design /
    // Sequence / Export), but every operation is scoped to markstart..markend instead of the
    // whole track: layers cover only the selected span, models are run on the selected
    // sub-sequence, and oligo design uses the selected range as its target.
    //   exec('baja/manchester/menu/selected-sequence-menu.js', graph, selectedTrack, genegraph_panel_layout)

    return (async () => {
        const t = selectedTrack;
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        if (!t || !(t.markend > t.markstart) || t.markstart < 0) { say(' No sequence selected. '); return graph; }

        const start = Math.floor(t.markstart), end = Math.ceil(t.markend);
        const len = end - start;
        const range = { start: start, end: end };
        const dna = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
        const seqOf = () => { try { return dna(t.getSequenceRange(t.markstart, t.markend)); } catch (e) { return ''; } };
        const revComp = (x) => x.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
        const copy = async (txt, what) => {
            try {
                if (navigator.clipboard) await navigator.clipboard.writeText(txt);
                say(' Copied ' + what + ' (' + txt.length + ' nt). ');
            } catch (e) { say(' Could not copy: ' + e + ' '); }
        };

        // Every leaf closes the side menu first, then runs, and reports its own failure rather
        // than throwing out of the menu handler and leaving the canvas half-configured.
        const go = (label, fn) => ({
            label: label, move: () => { },
            click: async () => {
                try { graph.showSideMenu(null); } catch (e) { }
                try { await fn(); }
                catch (e) { say(' ' + label + ' failed: ' + (e && e.message ? e.message : e) + ' '); }
            }
        });
        const sub = (label, items) => ({
            label: label, move: () => { },
            click: async (sx, sy) => { try { graph.showSideMenu(items, sx, sy); } catch (e) { } }
        });

        // ---- Navigate -----------------------------------------------------------------
        // track-flexi exposes .grid, track.js exposes .tgraph. Both are MGrids with the same
        // X()/Y() track-world -> graph-world mapping, but a helper that reaches for only one of
        // them works on half the tracks in the app, so resolve whichever this track has.
        const axisOf = () => (t && (t.grid || t.tgraph)) || null;

        // animateTo takes GRAPH-world coordinates; start/end are TRACK-world (the same space
        // getSequenceRange uses), so both axes go through the grid's X()/Y().
        const zoomToSpan = (a, b, padFrac) => {
            const ax = axisOf();
            if (!ax) { say(' That track has no coordinate axis to navigate. '); return; }
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const span = Math.max(1, hi - lo);
            const pad = Math.max(2, span * (padFrac == null ? 0.25 : padFrac));
            try {
                // y spans the track band (grid ymin/ymax are -1.5..1.5) rather than a single
                // row, so the sequence and anything drawn above or below it stay in frame.
                graph.animateTo(ax.X(lo - pad), ax.X(hi + pad), ax.Y(-1.2), ax.Y(1.2));
                if (graph.wake) graph.wake();
            } catch (e) { say(' Could not navigate: ' + e + ' '); }
        };

        const navItems = [
            { label: (t.name || 'track') + '  ' + start + '–' + end, move: () => { }, click: () => { } },
            go('Zoom to selection', async () => zoomToSpan(start, end, 0.25)),
            go('Zoom to selection (tight)', async () => zoomToSpan(start, end, 0.02)),
            go('Zoom in to read the sequence', async () => {
                // Sequence letters only render above ~30 screen pixels per base, so framing a
                // long selection can never show them. Frame what the canvas can actually
                // resolve, centred on the selection, instead of pretending to zoom to it.
                let cw = 1200;
                try { cw = (graph.canvas && graph.canvas.width) || (graph.graph && graph.graph.canvas && graph.graph.canvas.width) || cw; } catch (e) { }
                const fits = Math.max(12, Math.floor(cw / 34));
                if (len <= fits) { zoomToSpan(start, end, 0.05); return; }
                const mid = Math.floor((start + end) / 2);
                const half = Math.floor(fits / 2);
                zoomToSpan(mid - half, mid + half, 0.02);
                say(' Showing ' + fits + ' nt of the ' + len + ' nt selection — the most the canvas can render as letters. ');
            }),
            go('Zoom to whole track', async () => {
                const ax = axisOf();
                if (!ax) { say(' That track has no coordinate axis to navigate. '); return; }
                zoomToSpan(ax.xmin, ax.xmax, 0.02);
            })
        ];

        const seqItems = [
            go('Details...', async () => exec('baja/manchester/menu/show-selected-sequence-details.js', t, graph, genegraph_panel_layout)),
            go('Selected-sequence tools...', async () => exec('baja/manchester/menu/selected-sequence-tools.js', graph, genegraph_panel_layout, t)),
            go('Find motif...', async () => exec('baja/manchester/menu/motif-tools.js', graph)),
            go('Mutate from sequence...', async () => exec('baja/manchester/menu/mutation-from-track-sequence.js', graph, genegraph_panel_layout, true)),
            go('Copy sequence', async () => copy(seqOf(), 'selection')),
            go('Copy reverse complement', async () => copy(revComp(seqOf()), 'reverse complement')),
            go('Composition (GC%)', async () => {
                const q = seqOf();
                if (!q.length) { say(' No sequence in the selection. '); return; }
                const gc = (q.match(/[GC]/g) || []).length;
                const n = (q.match(/N/g) || []).length;
                say(' Selection: ' + q.length + ' nt — GC ' + ((gc / q.length) * 100).toFixed(1) + '%' + (n ? (' — ' + n + ' N') : '') + '. ');
            }),
        ];

        // Deselect: drop the marked range and hand the canvas back. Lives at the TOP level —
        // it is the one action you reach for when the selection itself is what is in the way,
        // so burying it in a submenu was wrong. markstart/markend are set to -1, which is the
        // "no selection" value every renderer and hit-test already tests for.
        const deselect = () => {
            try {
                t.markstart = -1;
                t.markend = -1;
            } catch (e) { }
            // Clear it everywhere, not just on this track: a stale mark on another track would
            // keep the selection panel and the Sequence menu entry alive after a deselect.
            try {
                if (graph.deselectAllTracks) graph.deselectAllTracks();
            } catch (e) { }
            try { graph.showSideMenu(null); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            say(' Selection cleared. ');
        };

        // The design menu already REQUIRES a selection and designs against
        // getSequenceRange(markstart, markend), so it is correct as-is for this menu.
        const items = [
            { label: '  ' + start + '–' + end + '  (' + len + ' nt)', move: () => { }, click: () => { } },
            sub('Navigate ▸', navItems),
            go('Deselect sequence', async () => deselect()),
            // Layers ▸ Data | Models, matching the selected-TRACK menu: anything that puts a
            // new band under the track lives under Layers, whether it comes from a dataset or
            // from a model. Both branches are already scoped to THIS sequence on THIS track --
            // the data loaders honour markstart..markend, and the models are handed (t, range) --
            // so the layers land over the selected span rather than the whole track.
            sub('Layers ▸', [
                { label: 'Layers on ' + (t.name || 'track'), move: () => { }, click: () => { } },
                { label: '  ' + start + '–' + end + '  (' + len + ' nt)', move: () => { }, click: () => { } },
                // Data opens the Data Resources Library directly rather than expanding a short
                // list of shortcuts to it. The library is the catalogue -- RNASeq, public data,
                // your own uploads -- so a submenu naming three of its shelves was a second,
                // narrower index of the same thing. Labelled '...' not '▸': it opens a panel,
                // it is not a submenu.
                go('Data...', async () => exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout)),
                // Models opens the ML Models Library, the same way Data opens the Data Resources
                // Library. The library is the catalogue -- what each model predicts, what it was
                // measured against and what it cannot tell you -- and running it from there is
                // one click further but starts from the documentation rather than a bare name.
                // The runners resolve the track from the SELECTION when they are not handed one,
                // so a model launched from the library still lands on this track.
                go('Models...', async () => exec('baja/ml/models-library.js', graph, genegraph_panel_layout)),
                go('Remove layers over this range', async () => {
                    // Only layers that fall INSIDE the selection: a layer spanning the whole
                    // track is not "a layer over this range" and dropping it here would delete
                    // work the user did somewhere else on the same track.
                    const before = (t.track_layers || []).length;
                    t.track_layers = (t.track_layers || []).filter((l) => {
                        try {
                            const a = Math.min(+l.xi, +l.xf), b = Math.max(+l.xi, +l.xf);
                            if (!isFinite(a) || !isFinite(b)) return true;
                            return !(a >= start && b <= end);
                        } catch (e) { return true; }
                    });
                    const gone = before - t.track_layers.length;
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    say(' Removed ' + gone + ' layer' + (gone === 1 ? '' : 's') + ' over ' + start + '–' + end + '. ');
                })
            ]),
            sub('Sequence ▸', seqItems),
            go('Design ▸', async () => exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout)),
            go('Off-targets...', async () => exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout)),
            go('Export...', async () => exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout, t)),
            go('Synthesis cost', async () => exec('baja/manchester/menu/synthesis-cost.js', graph, t, genegraph_panel_layout))
        ];

        try { graph.showSideMenu(items, null, selectedTrack.name); } catch (e) { }
        return graph;
    })();
}

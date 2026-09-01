function (graph, genegraph_panel_layout, presetTrack, presetRange) {
    // Splicing profile — pick a magnitude mode, then click a track to send its
    // sequence to the local bajasplice-lib models (py/bio/splice/splicing-profile.py,
    // run via exec rather than the old POSTJSON TF-serving call) and draw the
    // predicted splice junctions as a sashimi-plot layer.
    //
    //   sites : magnitude = splice-site strength (SpliceNet)
    //   psi   : magnitude = cassette-exon inclusion across 54 GTEx tissues (PSINet)
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        // Re-dock the predictive-models toolbar once the run finishes.
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const runOnTrack = async (track, mode, range) => {
            try {
                // A range scopes the model to the SELECTED sequence: send that sub-sequence and
                // shift xi to the range start so the scores land at the right coordinates.
                // PSI is left on the whole track — it needs the transcript's exon structure,
                // which a cut-out range no longer describes (see exonsArg below).
                let seq = track && track.sequence;
                let xi = (track && track.xi != null) ? track.xi : 0;
                if (range && mode !== 'psi' && Number.isFinite(+range.start) && Number.isFinite(+range.end) && +range.end > +range.start) {
                    try {
                        const sub = track.getSequenceRange ? track.getSequenceRange(range.start, range.end) : null;
                        if (sub && sub.length) { seq = sub; xi = Math.floor(+range.start); }
                    } catch (e) { }
                }
                if (!seq || !seq.length) {
                    graph.setMessage(' That track has no sequence to profile. ');
                    restoreHover(); return;
                }
                const strand = '' + (track.strand != null ? track.strand : 1);

                // PSI mode needs real exon structure — send the track's annotated
                // exons (track-local [xi, xf], transcript order) if it has them.
                let exonsArg = '';
                if (mode === 'psi' && track.getExons) {
                    try {
                        const ex = (track.getExons() || [])
                            .map((e) => [+e.xi, +e.xf])
                            .filter((p) => isFinite(p[0]) && isFinite(p[1]))
                            .sort((a, b) => a[0] - b[0]);
                        if (ex.length) exonsArg = JSON.stringify(ex);
                    } catch (e) { }
                }

                // Context-specific status: which model output, on which track, over what span.
                // Cleared in the finally at the end of runOnTrack.
                const __what = (mode === 'psi') ? 'PSI inclusion' : 'donor/acceptor scores';
                const __where = (track.name || 'track')
                    + (range ? (' · ' + (Math.abs(+range.end - +range.start)) + ' nt selection') : ' · whole track');
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'BajaSplice · ' + __what + ' → ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring ' + ('' + seq.length).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' nt');

                graph.setMessage(' Running splicing model… ');
                const server = window['env']['apiUrl'];
                // Surface backend progress / messages (model load, scoring…). They double as
                // the status line, so the badge follows the phase the run is actually in.
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { } });
                const data = await exec(server + '/py/bio/splice/splicing-profile.py', em, '' + seq, '' + xi, strand, '' + mode, exonsArg);

                if (data && data.error) {
                    graph.setMessage(' Splicing error: ' + data.error + ' ');
                    restoreHover(); return;
                }
                let junc = [];
                try { junc = JSON.parse((data && data.junctions) || '[]'); } catch (e) { junc = []; }
                if (!junc.length) {
                    graph.setMessage(mode === 'psi'
                        ? ' No cassette-exon events detected in that sequence. '
                        : ' No splice junctions predicted for that sequence. ');
                    restoreHover(); return;
                }

                // Build a base TrackLayer carrying the sashimi arcs as plain
                // `junctions` data. Rendering lives in TrackLayer.drawSashimi
                // (gated on arc_type), so the layer serializes and reloads as an
                // ordinary TrackLayer — no custom subclass to lose on load.
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const label = (track.name || 'track') + (mode === 'psi' ? '_psi_sashimi' : '_sashimi');
                const layer = new TrackLayer(label, tg.xmin, 0, tg.xmax, 1);
                layer.data_type = 'splicing';
                layer.arc_type = 'SpliceSashimi';
                layer.magnitudeMode = mode;
                // Distinct color scheme per magnitude model so the two are easy to
                // tell apart: site strength = indigo->green, PSI = teal->orange.
                if (mode === 'psi') {
                    layer.donorColor = 'rgba(26,163,189,0.95)';    // teal (donor)
                    layer.acceptorColor = 'rgba(224,112,59,0.95)'; // orange (acceptor)
                } else {
                    layer.donorColor = 'rgba(94,84,199,0.95)';     // indigo (donor)
                    layer.acceptorColor = 'rgba(46,160,102,0.95)'; // green (acceptor)
                }
                // Site strength is a probability in [0,1]; present it on a 0–2
                // scale. PSI stays 0–1. magMax tells the renderer the top of the
                // scale so arc weight / crest stay normalized either way.
                const magMax = (mode === 'psi') ? 1 : 2;
                layer.magMax = magMax;
                // Junctions arrive as { d, a, dp, ap, mag, kind }.
                layer.junctions = junc.map((j) => {
                    let baseMag = (typeof j.mag === 'number') ? j.mag : Math.min(+j.dp || 0, +j.ap || 0);
                    return {
                        d: +j.d, a: +j.a,
                        dp: +j.dp || 0, ap: +j.ap || 0,
                        mag: (mode === 'psi') ? baseMag : baseMag * 2,   // sites: 0..1 -> 0..2
                        kind: j.kind || 'junction'
                    };
                });
                track.addLayer(layer);

                if (graph.wake) graph.wake();
                const magLabel = (mode === 'psi') ? 'PSI inclusion' : 'site strength';
                graph.setMessage(' Sashimi plot added to ' + (track.name || 'track') +
                    ' — ' + junc.length + ' junctions, magnitude = ' + magLabel + '. ');
                // Model finished and the layer is added — bring the Models toolbar back.
                resetModelsToolbar();
            } catch (e) {
                graph.setMessage(' Splicing error: ' + e + ' ');
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            restoreHover();
        };

        // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set.
        //
        // reset() remounts the layout manchester/editor.js stashed under 'mainPanel' -- the whole
        // editor. clear + setComponent(genegraph_panel_layout) mounts only the panel object this
        // tool was handed, which is not the same thing: the clear ran but the canvas never came
        // back. editor.js also PATCHES reset() so returning to mainPanel re-arms
        // mouse-over-highlight, which a hand-rolled restore skips entirely.
        //
        // The clear + set stays as a fallback for a host that stashed nothing.
        const restoreEditor = () => {
            try {
                if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                    CurrentLayout.reset('mainPanel');
                    return;
                }
            } catch (e) { }
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { if (genegraph_panel_layout) CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        // Arm a track click for the chosen magnitude mode.
        // What the user has already SELECTED, so a model launched from a selection menu runs
        // on it instead of asking for a click the user has effectively already made.
        //
        // Two selections count, and a range is optional:
        //   * a selected sequence RANGE on a track  -> run on that sub-sequence
        //   * a selected TRACK with no range        -> run on the whole track
        // The earlier bypass required BOTH a track and a range, so choosing the model with a
        // track selected but no range fell through to "click on a track".
        //
        // showResizeBar is the selected flag on both renderers (track.js and track-flexi.js);
        // marks are used raw, exactly as selected-sequence-menu.js passes them.
        const pickedTrack = () => {
            if (presetTrack) return presetTrack;
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                // Only an unambiguous selection. With several tracks selected there is no way
                // to know which one was meant, so fall back to asking.
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
        };
        const pickedRange = (t) => {
            if (presetRange) return presetRange;
            try {
                if (t && t.markstart != null && t.markend != null
                    && t.markstart >= 0 && t.markend > t.markstart) {
                    return { start: Math.floor(t.markstart), end: Math.ceil(t.markend) };
                }
            } catch (e) { }
            return null;   // whole track
        };

        // BOARD-LEVEL run: the Layers button on the canvas sets __bajaApplyAllTracks, meaning
        // "apply this to everything on the board" rather than to one track. Run the tracks in
        // SEQUENCE, not in parallel: each one is a python job, and firing a dozen at once would
        // queue behind the server's concurrency cap anyway while making the progress meaningless.
        //
        // The flag is consumed on entry so a later run from a track menu is a single-track run
        // again -- a mode that silently persisted would be worse than one that has to be asked
        // for each time.
        const runAllTracks = (mode) => {
            let all = [];
            try { all = (graph.track || []).filter((t) => t && (t.grid || t.tgraph)); } catch (e) { }
            if (!all.length) { graph.setMessage(' No tracks on the canvas to run on. '); return; }
            (async () => {
                for (let i = 0; i < all.length; i++) {
                    const t = all[i];
                    try {
                        window.__workStatus = 'Models · ' + ((t && t.name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    try { await runOnTrack(t, mode, null); } catch (e) { }
                }
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                graph.setMessage(' Applied to all ' + all.length + ' track' + (all.length === 1 ? '' : 's') + '. ');
            })();
        };

        const armTrackClick = (mode) => {
            graph.clearMouseListeners();
            let __all = false;
            try { __all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }
            if (__all) { try { graph.setMouseMode('navigate'); } catch (e) { } restoreEditor(); runAllTracks(mode); return; }
            graph.setMouseMode('msg: Click on a track to build a splicing sashimi plot.');
            restoreEditor();
            // Launched from the Selected Sequence menu — track and range already known.
            // Run on the existing selection when there is one -- see pickedTrack above.
            const pt = pickedTrack();
            if (pt) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                const pr = pickedRange(pt);
                try {
                    graph.setMessage(' Running splicing on ' + (pt.name || 'the selected track')
                        + (pr ? (' (' + (pr.end - pr.start) + ' nt selection)') : ' (whole track)') + '… ');
                } catch (e) { }
                runOnTrack(pt, mode, pr);
                return;
            }
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                await runOnTrack(track, mode);
            });
        };

        // Ask which magnitude to visualize, then arm the track click.
        graph.showMenu([
            {
                label: 'Baja:SiteStrength:v1.0', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('sites'); }
            },
            {
                label: 'Baja:PSI:v1.1', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('psi'); }
            }
        ]);

        resolve(true);
    });
}

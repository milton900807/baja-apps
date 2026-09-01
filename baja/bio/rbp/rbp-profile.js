function (graph, genegraph_panel_layout, presetTrack, presetRange) {
    // RBP binding profile — pick an RBP, click a track, send its sequence to the
    // local bajaclip-lib model (py/bio/rbp/rbp-profile.py) and draw the per-position
    // binding score as a coverage-style track layer (like the RNASeq coverage).
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set.
        //
        // reset() remounts the layout manchester/editor.js stashed under 'mainPanel' -- the whole
        // editor. clear + setComponent(genegraph_panel_layout) mounts only the panel object this
        // tool was handed, which is not the same thing: after the selection list was dismissed the
        // clear ran but the canvas never came back. editor.js also PATCHES reset() so returning to
        // mainPanel re-arms mouse-over-highlight, which a hand-rolled restore skips entirely.
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

        const PALETTE = [
            [26, 163, 189], [224, 112, 59], [94, 84, 199], [46, 160, 102],
            [201, 76, 140], [210, 160, 40], [70, 130, 180], [150, 90, 60]
        ];

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
            if (__presetList.length === 1) return __presetList[0];
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                // Only an unambiguous selection. With several tracks selected there is no way
                // to know which one was meant, so fall back to asking.
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
        };
        // A board run must read EACH track's own selection. pickedRange prefers presetRange,
        // which is one range from the launching context -- correct for a single track, wrong
        // when applied to every track on the canvas.
        const ownRange = (t) => {
            try {
                if (t && t.markstart != null && t.markend != null
                    && t.markstart >= 0 && t.markend > t.markstart) {
                    return { start: Math.floor(t.markstart), end: Math.ceil(t.markend) };
                }
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

        // presetRange {start,end} scopes the model to the SELECTED sequence instead of the
        // whole track: the sequence sent is that range and xi becomes the range start, so the
        // returned per-position scores land at the right coordinates.
        const runOnTrack = async (track, rbp, range) => {
            try {
                let seq = track && track.sequence;
                let xi = (track && track.xi != null) ? track.xi : 0;
                if (range && Number.isFinite(+range.start) && Number.isFinite(+range.end) && +range.end > +range.start) {
                    try {
                        const sub = track.getSequenceRange ? track.getSequenceRange(range.start, range.end) : null;
                        if (sub && sub.length) { seq = sub; xi = Math.floor(+range.start); }
                    } catch (e) { }
                }
                if (!seq || !seq.length) {
                    graph.setMessage(' ' + ((track && track.name) || 'That track') + ' has no sequence to profile. ');
                    restoreHover(); return false;
                }
                const strand = '' + (track.strand != null ? track.strand : 1);

                // Context-specific status: which model, on which track, over what span, and
                // what it will produce. Cleared in the finally at the end of runOnTrack.
                const __where = (track.name || 'track')
                    + (range ? (' · ' + (Math.abs(+range.end - +range.start)) + ' nt selection') : ' · whole track');
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'BajaCLIP · ' + rbp + ' binding sites → ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring ' + seq.length.toLocaleString() + ' nt');

                graph.setMessage(' Running RBP model (' + rbp + ')… ');
                const server = window['env']['apiUrl'];
                // The model's own progress lines become the status line, so the badge tracks
                // the phase the run is actually in rather than a single frozen message.
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { } });
                const data = await exec(server + '/py/bio/rbp/rbp-profile.py', em, '' + seq, '' + xi, strand, '' + rbp, '8');

                if (data && data.error) {
                    graph.setMessage(' RBP error: ' + data.error + ' ');
                    restoreHover(); return;
                }
                let sites = [];
                try { sites = JSON.parse((data && data.sites) || '[]'); } catch (e) { sites = []; }
                if (!sites.length) {
                    graph.setMessage(' No ' + rbp + ' binding sites predicted for that track. ');
                    restoreHover(); return false;
                }

                // Interval layer — one block per predicted binding site (start,end).
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const name = 'RBP:' + rbp;
                const layer = new TrackLayer((track.name || 'track') + '_' + name, tg.xmin, 0, tg.xmax, 1);
                layer.data_type = name;

                const idx = (track.track_layers || []).filter((l) => l && l.data_type === name).length;
                const rgb = PALETTE[idx % PALETTE.length];
                const alpha = +(0.2 + 0.5 * ((idx % 6) / 5)).toFixed(2);
                layer.color = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
                layer.fillstyle = layer.color;

                let added = 0;
                for (const s of sites) {
                    if (!s) continue;
                    const sc = Math.max(0, Math.min(1, +s[2] || 0));
                    // Only include high-confidence sites — those scoring ABOVE 0.95.
                    if (!(sc > 0.95)) continue;
                    // Block height == score (1.0 fills the track height), anchored at
                    // the baseline. Alpha also scales so stronger sites read darker.
                    const a = +(0.3 + 0.6 * sc).toFixed(2);
                    const col = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
                    layer.addInterval(+s[0], +s[1], sc, rbp + ' ' + sc.toFixed(2), col);
                    added++;
                }
                if (!added) {
                    graph.setMessage(' No ' + rbp + ' binding sites scoring above 0.95 for that track. ');
                    restoreHover(); return false;
                }
                track.addLayer(layer);

                // Highlight the sites for ~10s so they're easy to spot when zoomed out.
                if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

                if (graph.wake) graph.wake();
                graph.setMessage(' ' + name + ': ' + added + ' binding site' + (added === 1 ? '' : 's') + ' (score > 0.95) added to ' + (track.name || 'track') + '. ');
                resetModelsToolbar();
                try { exec('baja/lib/work-status.js', null); } catch (e) { }
                restoreHover();
                return true;
            } catch (e) {
                graph.setMessage(' RBP error: ' + e + ' ');
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            restoreHover();
            return false;
        };

        // BOARD-LEVEL run: the Layers button on the canvas sets __bajaApplyAllTracks, meaning
        // "apply this to everything on the board" rather than to one track. Run the tracks in
        // SEQUENCE, not in parallel: each one is a python job, and firing a dozen at once would
        // queue behind the server's concurrency cap anyway while making the progress meaningless.
        //
        // The flag is consumed on entry so a later run from a track menu is a single-track run
        // again -- a mode that silently persisted would be worse than one that has to be asked
        // for each time.
        // `list` is the tracks to run against. Passed in by the caller -- the library hands
        // down whatever it was given -- and only falls back to the whole canvas when nobody
        // said. That fallback is the old behaviour, kept so an older call site still works.
        const runAllTracks = (rbp, list) => {
            let all = [];
            try {
                all = (Array.isArray(list) && list.length ? list : (graph.track || []))
                    .filter((t) => t && (t.grid || t.tgraph));
            } catch (e) { }
            if (!all.length) { graph.setMessage(' No tracks on the canvas to run on. '); return; }
            // One history entry for the whole board run, so a single undo takes it all back.
            try { graph.pushOntoHistory(); } catch (e) { }
            (async () => {
                let done = 0;
                for (let i = 0; i < all.length; i++) {
                    const t = all[i];
                    try {
                        window.__workStatus = 'Models · ' + ((t && t.name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    // A track with a selected sequence is scored over that selection only:
                    // pickedRange reads the track's own markstart/markend, so a board run
                    // honours each track's selection instead of scoring all of every track.
                    try { if (await runOnTrack(t, rbp, ownRange(t))) done++; } catch (e) { }
                }
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                // setResultMessage, not setMessage: the canvas draws only error and result
                // toasts, so the plain message was never visible and a board run looked as
                // though it had finished without saying anything.
                const __msg = ' ' + rbp + ' applied to ' + done + ' of ' + all.length
                    + ' track' + (all.length === 1 ? '' : 's') + '. ';
                try { graph.setResultMessage(__msg); } catch (e) { graph.setMessage(__msg); }
            })();
        };

        // The TRACKS this run applies to, decided by whoever launched it.
        //
        // presetTrack takes a single track or an ARRAY of them, so one parameter carries both
        // cases: the track menu passes the track it belongs to, the board-level Layers button
        // passes every track on the canvas, and the library in between just hands along what it
        // was given. That is why there is no separate "apply to all" argument.
        //
        // The __bajaApplyAllTracks flag is still honoured for callers that have not been
        // updated, but an explicit list always wins over it.
        const __presetList = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);

        const armTrackClick = (rbp) => {
            graph.clearMouseListeners();
            if (__presetList.length > 1) {
                try { graph.setMouseMode('navigate'); } catch (e) { }
                restoreEditor();
                // An explicit list satisfies the board-level request: consume the flag so it does
                // not turn the next per-track action into a board-wide one.
                try { window.__bajaApplyAllTracks = false; } catch (e) { }
                runAllTracks(rbp, __presetList);
                return;
            }
            let __all = false;
            try { __all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }
            if (__all) { try { graph.setMouseMode('navigate'); } catch (e) { } restoreEditor(); runAllTracks(rbp); return; }
            graph.setMouseMode('msg: Click on a track to build an RBP binding profile.');
            restoreEditor();
            // Run on the existing selection when there is one -- see pickedTrack above.
            const pt = pickedTrack();
            if (pt) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                const pr = pickedRange(pt);
                try {
                    graph.setMessage(' Running ' + rbp + ' on ' + (pt.name || 'the selected track')
                        + (pr ? (' (' + (pr.end - pr.start) + ' nt selection)') : ' (whole track)') + '… ');
                } catch (e) { }
                runOnTrack(pt, rbp, pr);
                return;
            }
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                await runOnTrack(track, rbp, null);
            });
        };

        // Show a selection-list of the reliable RBPs (with confidence), then arm
        // the track click for the chosen one.
        (async () => {
            const server = window['env']['apiUrl'];
            let rbps = [];
            try {
                let em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                const res = await exec(server + '/py/bio/rbp/list-rbps.py', em);
                rbps = JSON.parse((res && res.rbps) || '[]');
            } catch (e) { rbps = []; }
            if (!rbps.length) {
                // Fallback: no list available — default to TARDBP.
                armTrackClick('TARDBP');
                resolve(true);
                return;
            }

            // Label carries name + confidence; map it back to the raw RBP name.
            // contentItems shows the functional annotation under each entry.
            const byLabel = {};
            const contentItems = {};
            const listItems = rbps.map((r) => {
                const label = r.name + '   —   AUROC ' + (+r.auroc).toFixed(2);
                byLabel[label] = r.name;
                if (r.note) contentItems[label] = r.note;
                return label;
            });

            const list = {
                wid: 'selection-list',
                data: {
                    single_selection: true,
                    show_button: false,
                    singleSelect: true,
                    listItems: listItems,
                    contentItems: contentItems,
                    button_function: createIonFunction((items) => {
                        const chosen = items && items[0];
                        const rbp = (chosen && byLabel[chosen]) || 'TARDBP';
                        // armTrackClick restores the editor itself. Doing it here too remounted
                        // the layout twice and scheduled the hover re-arm twice with it.
                        armTrackClick(rbp);
                    })
                }
            };

            const panel = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: '<div style="padding:8px 4px;font-weight:700;">RNA binding proteins (held-out AUROC &ge; 0.90)</div>'
                                }
                            },
                            { 'width': '100%', 'component': list },
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button',
                                    data: {
                                        buttons: [
                                            {
                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                    restoreEditor();
                                                    resetModelsToolbar();
                                                })
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    ]
                }
            };

            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', panel);
            resolve(true);
        })();
    });
}

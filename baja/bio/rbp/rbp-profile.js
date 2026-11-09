function (graph, genegraph_panel_layout, presetTrack, presetRange, presetRbp) {
    // RBP binding profile — pick an RBP, click a track, send its sequence to the
    // local bajaclip-lib model (py/bio/rbp/rbp-profile.py) and draw the per-position
    // binding score as a coverage-style track layer (like the RNASeq coverage).
    //
    // presetRbp: the protein was already chosen by whoever opened this -- the models
    // library asks on its own reference page -- so the selection list below is skipped
    // rather than asking the same question twice on two screens.
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
            // The track's own selectedRange(): it resolves world-coordinate marks and offset
            // marks to the same absolute span, where reading markstart raw was right for one
            // convention and silently wrong for the other.
            try { return (t && t.selectedRange && t.selectedRange()) || null; } catch (e) { return null; }
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
                // ONE SCAN, SEVERAL PROTEINS. The model emits all 170 heads per window, so
                // the backend returns sitesByRbp = {name: [[start,end,score],...]} for every
                // protein that was selected. Older servers only send `sites`, so fall back to
                // that under the requested name.
                let byRbp = {};
                try { byRbp = JSON.parse((data && data.sitesByRbp) || '{}') || {}; } catch (e) { byRbp = {}; }
                if (!Object.keys(byRbp).length) {
                    let one = [];
                    try { one = JSON.parse((data && data.sites) || '[]'); } catch (e) { one = []; }
                    byRbp[('' + rbp).split(',')[0].trim() || 'TARDBP'] = one;
                }
                const picked = Object.keys(byRbp).filter((k) => (byRbp[k] || []).length);
                if (!picked.length) {
                    graph.setMessage(' No binding sites predicted for ' + ('' + rbp).split(',').join(', ')
                        + ' on that track. ');
                    restoreHover(); return false;
                }

                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                let totalAdded = 0;
                const summary = [];
                for (const who of picked) {
                    const name = 'RBP:' + who;
                    const layer = new TrackLayer((track.name || 'track') + '_' + name, tg.xmin, 0, tg.xmax, 1);
                    layer.data_type = name;
                    // Colour by how many layers of THIS protein already exist, plus the
                    // protein's own position in the selection, so two proteins picked
                    // together never land on the same colour.
                    const seen = (track.track_layers || []).filter((l) => l && l.data_type === name).length;
                    const rgb = PALETTE[(seen + picked.indexOf(who)) % PALETTE.length];
                    const alpha = +(0.2 + 0.5 * (((seen + picked.indexOf(who)) % 6) / 5)).toFixed(2);
                    layer.color = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
                    layer.fillstyle = layer.color;
                    // Name + score written ON the block, turned a quarter turn (see the vertical
                    // branch in baja/bio/track-layer.js). Flat, 'TARDBP 0.98' is wider than most
                    // binding sites are on screen, so each label ran past its own block and into
                    // the next one. On its side a label is one line of text whatever it says.
                    layer.verticalLabels = true;

                    let added = 0;
                    for (const s of (byRbp[who] || [])) {
                        if (!s) continue;
                        const sc = Math.max(0, Math.min(1, +s[2] || 0));
                        // Only include high-confidence sites.
                        if (!(sc > 0.95)) continue;
                        const a2 = +(0.3 + 0.6 * sc).toFixed(2);
                        const col = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a2 + ')';
                        layer.addInterval(+s[0], +s[1], sc, who + ' ' + sc.toFixed(2), col);
                        added++;
                    }
                    if (!added) continue;
                    track.addLayer(layer);
                    if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
                    totalAdded += added;
                    summary.push(who + ' ' + added);
                }
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);
                if (!totalAdded) {
                    graph.setMessage(' No binding sites scoring above 0.95 for '
                        + ('' + rbp).split(',').join(', ') + ' on that track. ');
                    restoreHover(); return false;
                }

                if (graph.wake) graph.wake();
                graph.setMessage(' ' + summary.join(', ') + ' binding site'
                    + (totalAdded === 1 ? '' : 's') + ' (score > 0.95) added to '
                    + (track.name || 'track') + '. ');
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
        // said. That fallback is the old behavior, kept so an older call site still works.
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
                    // A track with a selected sequence is scored over that selection only.
                    // ownRange reads THAT track's markstart/markend -- not pickedRange, which
                    // prefers the launching context's presetRange and would stamp one range
                    // across every track on the canvas.
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
            graph.setMouseMode('msg: Click on a track to build an RBP binding profile');
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

        // Already chosen: arm the run directly. Nothing is unmounted and no list is
        // shown, so the layer lands over the editor the caller was already looking at.
        if (presetRbp) {
            armTrackClick('' + presetRbp);
            resolve(true);
            return;
        }

        // Show the reliable RBPs (with confidence) as a checkbox list, then arm the
        // track click for everything that was ticked.
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

            // OUR OWN CHECKBOX LIST. The selection-list widget is single-choice: it ignores
            // single_selection:false and every other multi flag, and it lives in the frontend
            // where it cannot be changed from here. So the list is plain HTML with real
            // checkboxes, and the selection is read back at Run time.
            //
            // showWidget is ASYNC and APPENDS, and the shell may replace these nodes again
            // after we hand them over, so nothing is bound to them directly: one
            // document-level listener keeps the picked set, installed once and keyed on
            // window so a second run of this module does not stack a second copy.
            window.__bajaRbpPicked = window.__bajaRbpPicked || {};
            for (const r of rbps) delete window.__bajaRbpPicked[r.name];
            const __count = () => {
                const n = Object.keys(window.__bajaRbpPicked || {}).length;
                const out = document.getElementById('__bajaRbpCount');
                if (out) out.textContent = n ? (n + ' selected') : 'none selected';
            };
            if (!window.__bajaRbpWired) {
                window.__bajaRbpWired = true;
                document.addEventListener('change', (e) => {
                    const el = e && e.target;
                    if (!el || !el.getAttribute) return;
                    const who = el.getAttribute('data-rbp');
                    if (!who) return;
                    if (el.checked) window.__bajaRbpPicked[who] = true;
                    else delete window.__bajaRbpPicked[who];
                    const n = Object.keys(window.__bajaRbpPicked).length;
                    const out = document.getElementById('__bajaRbpCount');
                    if (out) out.textContent = n ? (n + ' selected') : 'none selected';
                }, true);
                document.addEventListener('click', (e) => {
                    const el = e && e.target;
                    if (!el || !el.getAttribute) return;
                    const act = el.getAttribute('data-rbp-act');
                    if (!act) return;
                    const boxes = document.querySelectorAll('input[data-rbp]');
                    for (const bx of boxes) {
                        bx.checked = (act === 'all');
                        if (bx.checked) window.__bajaRbpPicked[bx.getAttribute('data-rbp')] = true;
                        else delete window.__bajaRbpPicked[bx.getAttribute('data-rbp')];
                    }
                    const n = Object.keys(window.__bajaRbpPicked).length;
                    const out = document.getElementById('__bajaRbpCount');
                    if (out) out.textContent = n ? (n + ' selected') : 'none selected';
                }, true);
            }

            const esc = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const rows = rbps.map((r) => ''
                + '<label style="display:flex;align-items:flex-start;gap:8px;padding:5px 6px;'
                + 'border-bottom:1px solid rgba(128,128,128,0.18);cursor:pointer;">'
                + '<input type="checkbox" data-rbp="' + esc(r.name) + '" style="margin-top:3px;">'
                + '<span style="flex:1;min-width:0;">'
                + '<span style="font-weight:600;">' + esc(r.name) + '</span>'
                + '<span style="opacity:0.7;"> &nbsp;AUROC ' + (+r.auroc).toFixed(2) + '</span>'
                + (r.note ? ('<div style="opacity:0.7;font-size:12px;">' + esc(r.note) + '</div>') : '')
                + '</span></label>').join('');

            const list = {
                wid: 'html',
                data: ''
                    + '<div style="display:flex;gap:10px;align-items:center;padding:4px 6px 8px;">'
                    + '<a href="javascript:void(0)" data-rbp-act="all" style="font-size:12px;">Select all</a>'
                    + '<a href="javascript:void(0)" data-rbp-act="none" style="font-size:12px;">Clear</a>'
                    + '<span id="__bajaRbpCount" style="font-size:12px;opacity:0.75;">none selected</span>'
                    + '</div>'
                    + '<div style="max-height:52vh;overflow:auto;-webkit-overflow-scrolling:touch;'
                    + 'border:1px solid rgba(128,128,128,0.25);border-radius:6px;">' + rows + '</div>'
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
                                        + '<div style="padding:0 4px 8px;opacity:0.75;font-size:12px;">Tick one, several or all, then Run selected. Each protein gets its own layer, from a single scan.</div>'
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
                                                label: 'Run selected', ionFunction: createIonFunction(() => {
                                                    const names = Object.keys(window.__bajaRbpPicked || {});
                                                    if (!names.length) {
                                                        try { graph.setMessage(' Pick at least one RNA binding protein. '); } catch (e) { }
                                                        return;
                                                    }
                                                    // The backend takes a comma-separated list and
                                                    // answers per protein. armTrackClick restores
                                                    // the editor itself.
                                                    armTrackClick(names.join(','));
                                                })
                                            },
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

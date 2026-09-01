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

        const PALETTE = [
            [26, 163, 189], [224, 112, 59], [94, 84, 199], [46, 160, 102],
            [201, 76, 140], [210, 160, 40], [70, 130, 180], [150, 90, 60]
        ];

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
                    graph.setMessage(' That track has no sequence to profile. ');
                    restoreHover(); return;
                }
                const strand = '' + (track.strand != null ? track.strand : 1);

                graph.setMessage(' Running RBP model (' + rbp + ')… ');
                const server = window['env']['apiUrl'];
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                const data = await exec(server + '/py/bio/rbp/rbp-profile.py', em, '' + seq, '' + xi, strand, '' + rbp, '8');

                if (data && data.error) {
                    graph.setMessage(' RBP error: ' + data.error + ' ');
                    restoreHover(); return;
                }
                let sites = [];
                try { sites = JSON.parse((data && data.sites) || '[]'); } catch (e) { sites = []; }
                if (!sites.length) {
                    graph.setMessage(' No ' + rbp + ' binding sites predicted for that track. ');
                    restoreHover(); return;
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
                    restoreHover(); return;
                }
                track.addLayer(layer);

                // Highlight the sites for ~10s so they're easy to spot when zoomed out.
                if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

                if (graph.wake) graph.wake();
                graph.setMessage(' ' + name + ': ' + added + ' binding site' + (added === 1 ? '' : 's') + ' (score > 0.95) added to ' + (track.name || 'track') + '. ');
                resetModelsToolbar();
            } catch (e) {
                graph.setMessage(' RBP error: ' + e + ' ');
            }
            restoreHover();
        };

        const armTrackClick = (rbp) => {
            graph.clearMouseListeners();
            graph.setMouseMode('msg: Click on a track to build an RBP binding profile.');
            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            // Launched from the Selected Sequence menu: the track and range are already known,
            // so run straight away rather than asking the user to click a track.
            if (presetTrack && presetRange) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                runOnTrack(presetTrack, rbp, presetRange);
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
                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
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
                                                    CurrentLayout.clearComponent('mainPanel');
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
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

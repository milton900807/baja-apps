function (graph, genegraph_panel_layout, presetTrack) {

    // Intron-retention propensity (BajaIR) as a track layer.
    //   exec('baja/bio/splicing/intron-retention.js', graph, genegraph_panel_layout [, track])
    //
    // Pick a tier, click a track, and every intron of that track's gene is scored for how
    // retention-prone it is FROM SEQUENCE ALONE. Each intron clearing the tier is drawn as an
    // interval block whose height is its score. Same shape as rbp-profile.js.
    //
    // Two things about this model shape the UI, both taken from py/bajair-lib's own docs:
    //
    //   * An EMPTY result is the normal, correct answer for most genes. hits() deliberately
    //     returns nothing when no intron clears the bar, because a retention track that draws
    //     something for every intron is just intron structure redrawn in another colour. An
    //     empty result is therefore reported as a finding, never as a failure.
    //
    //   * RANK is usable, the number is not: correlation with the actual retention level is
    //     about 0.2. Blocks are labelled with the rank and the tier word, and the closing
    //     message says so, rather than presenting the score as a probability of retention.
    //
    // It scores by GENE, not by sequence window, so unlike the RBP and splice-site profiles a
    // sequence selection does not narrow it -- introns come from the annotation, not the range.
    // That is why this takes presetTrack but no presetRange.

    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Cool -> hot as the tier rises, so a stronger intron reads at a glance. These are the
        // four tier names in the model's own calibration file, strongest last.
        const TIER_COLOR = {
            elevated: [110, 140, 160],
            notable: [26, 163, 189],
            strong: [224, 112, 59],
            exceptional: [201, 76, 140]
        };

        // track-flexi exposes .grid, track.js exposes .tgraph. Both set xmin/xmax to the
        // track's GENOMIC xi..xf, so an intron's genomic start/end needs no conversion --
        // but the axis has to be found under whichever name this renderer uses.
        const axisOf = (t) => (t && (t.grid || t.tgraph)) || null;

        // description is 'gene_name;transcript_name' (track-flexi builds it that way), so the
        // symbol is the first field. geneID is an Ensembl ID, which the model cannot resolve,
        // so it is only a last resort behind the track name.
        const geneOf = (t) => {
            const raw = '' + ((t && (t.description || t.name || t.geneID)) || '');
            const sym = raw.split(';')[0].split('(')[0].trim();
            return sym;
        };

        const runOnTrack = async (track, tier) => {
            try {
                const gene = geneOf(track);
                const axis = axisOf(track);
                if (!gene) {
                    graph.setMessage(' That track has no gene name to score. ');
                    restoreHover(); return;
                }
                if (!axis) {
                    graph.setMessage(' That track has no coordinate axis to draw on. ');
                    restoreHover(); return;
                }

                // Context-specific status: which model, which gene, at which tier. Cleared in
                // the finally at the end of runOnTrack.
                const __where = gene + ' · ' + (track.name || 'track') + ' · "' + tier + '" tier';
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'BajaIR · intron retention → ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring every intron');
                graph.setMessage(' Scoring introns of ' + gene + ' (BajaIR)... ');
                const server = window['env']['apiUrl'];
                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { } });
                // params: gene, tier, limit (0 = no cap), transcript (blank = whichever the
                // library picks). The track's own transcript is deliberately NOT forced: a
                // track may be loaded on an isoform the annotation does not treat as canonical.
                const data = await exec(server + '/py/bio/splice/intron-retention.py', em, '' + gene, '' + tier, '0', '');

                if (data && data.error) {
                    graph.setMessage(' Intron retention: ' + data.error + ' ');
                    restoreHover(); return;
                }
                let hits = [];
                try { hits = JSON.parse((data && data.hits) || '[]'); } catch (e) { hits = []; }

                // Not an error -- see the note at the top of this file.
                if (!hits.length) {
                    graph.setMessage(' No intron of ' + gene + ' reaches the "' + tier
                        + '" tier, which is the usual answer for most genes. ');
                    restoreHover(); return;
                }

                const TrackLayer = await exec('baja/bio/track-layer.js');
                const name = 'IR:' + gene;
                const layer = new TrackLayer((track.name || 'track') + '_' + name, axis.xmin, 0, axis.xmax, 1);
                layer.data_type = name;
                layer.color = 'rgba(26,163,189,0.55)';
                layer.fillstyle = layer.color;

                let added = 0, skipped = 0, best = 0;
                hits.forEach((h, i) => {
                    if (!h) return;
                    let a = Math.min(+h.start, +h.end), b = Math.max(+h.start, +h.end);
                    if (!isFinite(a) || !isFinite(b) || !(b > a)) { skipped++; return; }
                    // The library may report introns of a transcript that extends past this
                    // track's window. Clip to the axis, and drop anything wholly outside it.
                    a = Math.max(a, axis.xmin); b = Math.min(b, axis.xmax);
                    if (!(b > a)) { skipped++; return; }

                    const sc = Math.max(0, Math.min(1, +h.score || 0));
                    if (sc > best) best = sc;
                    const rgb = TIER_COLOR[('' + (h.tier || '')).toLowerCase()] || TIER_COLOR.notable;
                    const alpha = +(0.30 + 0.55 * sc).toFixed(2);
                    // The label leads with the RANK and the tier word rather than the number,
                    // because the number is not calibrated to a retention level. hits() also
                    // writes a one-line `headline` saying WHY the intron scored -- carry it,
                    // since a block labelled only with a rank says nothing about the reason.
                    const label = '#' + (i + 1) + ' ' + (h.tier || tier)
                        + (h.intron_number ? ('  intron ' + h.intron_number + '/' + (h.n_introns || '?')) : '')
                        + '  ' + Math.round(b - a) + ' nt'
                        + (h.headline ? ('  -  ' + h.headline) : '');
                    layer.addInterval(a, b, sc, label,
                        'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')');
                    added++;
                });

                if (!added) {
                    graph.setMessage(' ' + gene + ': ' + hits.length + ' intron'
                        + (hits.length === 1 ? '' : 's') + ' scored, but none fall inside this track\'s range. ');
                    restoreHover(); return;
                }

                track.addLayer(layer);

                // Highlight briefly so the blocks are findable when zoomed out, as rbp-profile does.
                if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);
                if (graph.wake) graph.wake();

                graph.setMessage(' ' + gene + ': ' + added + ' retention-prone intron'
                    + (added === 1 ? '' : 's') + ' at "' + tier + '" or above'
                    + (skipped ? (', ' + skipped + ' outside this track') : '')
                    + ', ranked (top score ' + best.toFixed(2) + '). Read the rank, not the score. ');
                resetModelsToolbar();
            } catch (e) {
                graph.setMessage(' Intron retention error: ' + ((e && e.message) ? e.message : e) + ' ');
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            restoreHover();
        };

        // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set.
        //
        // reset() remounts the layout manchester/editor.js stashed under 'mainPanel' -- the
        // whole editor -- whereas clear + setComponent(genegraph_panel_layout) mounts only the
        // panel object this tool happened to be handed, which is not the same thing and leaves
        // an empty panel when it is stale or absent. editor.js also PATCHES reset() so that
        // returning to mainPanel re-arms mouse-over-highlight; a tool that restores by hand
        // skips that and hands back an editor stuck in whatever mouse mode it was left in.
        //
        // The clear + set remains as a fallback for a host that stashed nothing.
        const restoreEditor = () => {
            try {
                if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                    CurrentLayout.reset('mainPanel');
                    return;
                }
            } catch (e) { }
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            if (!genegraph_panel_layout) {
                try { graph.setMessage(' Intron retention: nothing was stashed for mainPanel and no layout was passed, so the editor panel could not be restored. '); } catch (e) { }
                return;
            }
            try { CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        // The track this was launched against, when there is one.
        //
        // Reached from a selection-derived menu, the track is already known -- it is the one the
        // user selected to get the menu at all -- so asking them to click it again is asking a
        // question that has already been answered. presetTrack covers a caller that passes it
        // explicitly; the selected-track fallback covers the menus that do not, which is most of
        // them. Same rule as rbp-profile.js and splicing-profile.js.
        //
        // showResizeBar is the selected flag on both renderers. Only an UNAMBIGUOUS selection
        // counts: with several tracks selected there is no way to know which was meant, so that
        // falls back to asking.
        const pickedTrack = () => {
            if (__presetList.length === 1) return __presetList[0];
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
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
        const runAllTracks = (tier, list) => {
            let all = [];
            try {
                all = (Array.isArray(list) && list.length ? list : (graph.track || []))
                    .filter((t) => t && (t.grid || t.tgraph));
            } catch (e) { }
            if (!all.length) { graph.setMessage(' No tracks on the canvas to run on. '); return; }
            (async () => {
                for (let i = 0; i < all.length; i++) {
                    const t = all[i];
                    try {
                        window.__workStatus = 'Models · ' + ((t && t.name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    try { await runOnTrack(t, tier, null); } catch (e) { }
                }
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                graph.setMessage(' Applied to all ' + all.length + ' track' + (all.length === 1 ? '' : 's') + '. ');
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

        const armTrackClick = (tier) => {
            graph.clearMouseListeners();
            if (__presetList.length > 1) {
                try { graph.setMouseMode('navigate'); } catch (e) { }
                restoreEditor();
                // An explicit list satisfies the board-level request: consume the flag so it does
                // not turn the next per-track action into a board-wide one.
                try { window.__bajaApplyAllTracks = false; } catch (e) { }
                runAllTracks(tier, __presetList);
                return;
            }
            let __all = false;
            try { __all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }
            if (__all) { try { graph.setMouseMode('navigate'); } catch (e) { } restoreEditor(); runAllTracks(tier); return; }
            graph.setMouseMode('msg: Click on a track to score its introns for retention.');
            restoreEditor();
            const pt = pickedTrack();
            if (pt) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                // A gene-level model: no range is passed because introns come from the
                // annotation, so a sequence selection would not narrow it anyway.
                try { graph.setMessage(' Scoring introns of ' + (pt.name || 'the selected track') + '… '); } catch (e) { }
                runOnTrack(pt, tier);
                return;
            }
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                await runOnTrack(track, tier);
            });
        };

        // Tier picker. 'notable' is the library default; the higher tiers report fewer introns
        // and are the right choice on a long gene where 'notable' returns a crowd. Same
        // selection-list panel the RBP picker uses, so the two models feel like one tool.
        // The four names below are the tiers in the model's calibration file -- passing anything
        // else raises. Each note carries that tier's own measured precision and lift, held out
        // on test chromosomes 1/3/5/7/9 against a 3.3% base rate, so the bar is stated rather
        // than implied by the word.
        const TIERS = [
            { key: 'elevated', label: 'Elevated   (most introns)', note: '90th percentile. About 17% of reported introns have measurable retention -- 5.2x background. The widest net, and the noisiest.' },
            { key: 'notable', label: 'Notable   (default)', note: '95th percentile, the library default. About 23% have measurable retention -- 7.1x background.' },
            { key: 'strong', label: 'Strong', note: '99th percentile. About 36% have measurable retention -- 10.9x background. Fewer introns, each a better bet.' },
            { key: 'exceptional', label: 'Exceptional   (fewest)', note: '99.5th percentile, the highest bar. About 39% have measurable retention -- 11.8x background. Often returns nothing, which is a valid answer.' }
        ];
        const byLabel = {}, contentItems = {}, listItems = [];
        TIERS.forEach((t) => { byLabel[t.label] = t.key; contentItems[t.label] = t.note; listItems.push(t.label); });

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
                    const tier = (chosen && byLabel[chosen]) || 'notable';
                    // armTrackClick restores the editor itself; doing it here as well just
                    // mounted the same layout twice on the way out.
                    armTrackClick(tier);
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
                                data: '<div style="padding:8px 4px;font-weight:700;">Intron retention (BajaIR) &mdash; reporting tier</div>'
                                    + '<div style="padding:0 4px 8px 4px;font-size:12.5px;color:#5b6b7c;">'
                                    + 'Scores every intron of the gene from sequence alone. It is a shortlist, not a caller: '
                                    + 'use the ranking, not the score. Returning nothing is a normal result.</div>'
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

        // Mounting the picker takes over mainPanel, so refuse to start when there is no way
        // back at all -- neither a stash nor a passed layout -- rather than stranding the user
        // on a panel with no route home.
        let __canRestore = !!genegraph_panel_layout;
        try { __canRestore = __canRestore || !!(CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')); } catch (e) { }
        if (!__canRestore) {
            try { graph.setMessage(' Intron retention could not start: no editor layout was passed to it. '); } catch (e) { }
            resolve(false);
            return;
        }
        CurrentLayout.clearComponent('mainPanel');
        CurrentLayout.setComponent('mainPanel', panel);
        resolve(true);
    });
}

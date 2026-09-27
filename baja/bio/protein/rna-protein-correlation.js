function (graph, genegraph_panel_layout, presetTrack, presetRange) {
    // RNA–protein coupling — how MUCH, and how reliably, this protein follows its mRNA.
    //
    // Sends the track's protein to py/bio/protein/rna-protein-correlation.py, which returns
    //   transfer  the protein change per mRNA change (log-log slope across samples),
    //             normalized so the typical gene = 1.0: below 1 buffered, above 1 responsive
    //   rho       how reliably protein follows mRNA (Spearman)
    // for the protein, and the MEASURED values where any of 7 paired studies quantified it.
    // It is a whole-protein number, not a profile, so it is drawn as a flat bar over the
    // coding exons at the predicted transfer (0..2 frame: the typical gene sits at
    // mid-height, zero across introns), a line at the measured transfer, and one annotation
    // over the CDS carrying transfer, rho, the measurement and the mRNA half-life.
    //
    // The protein comes from the track's own ORF exactly as the secretion layer reads it
    // (this.orf.cdsi, the codons the editor draws; same selection rule as
    // track.getPeptideFromORF). No ORF, no score — raw bases are never translated on a
    // guessed frame. A selection scores the ORF inside it.
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
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
        // Progress through setMessage WITH an ellipsis; every outcome through
        // setResultMessage, which draws even while a toast is up (see secretion-profile.js).
        const say = (m) => {
            try { log('[rna-protein] ' + m); } catch (e) { }
            try { graph.setMessage(' ' + m + '… '); } catch (e) { }
        };
        const done = (m) => {
            try { log('[rna-protein] ' + m); } catch (e) { }
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const clearWork = () => { try { exec('baja/lib/work-status.js', null); } catch (e) { } };

        const MIN_RESIDUES = 30;
        const __presetList = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);
        const ownRange = (t) => {
            try { return (t && t.selectedRange && t.selectedRange()) || null; } catch (e) { return null; }
        };

        // ---- the track's peptide: identical rules to secretion-profile.js ----------------
        const codonsOf = (track) => {
            let cdsi = null;
            try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            if (!cdsi || !cdsi.length) {
                try { if (track && track.generateORF) track.generateORF(); } catch (e) { }
                try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            }
            if (!cdsi || !cdsi.length) return null;
            const first = {}, out = [];
            for (const c of cdsi) {
                if (!c) continue;
                if (c.ci === 0 && first[c.codon_index] == null) first[c.codon_index] = +c.index;
            }
            for (const c of cdsi) {
                if (!c || c.ci !== 2) continue;
                if (!c.aa || ('' + c.aa).length !== 1) continue;      // skips START / STOP
                const x = (first[c.codon_index] != null) ? first[c.codon_index] : +c.index;
                out.push({ aa: '' + c.aa, x: x, mark: +c.index });
            }
            return out.length ? out : null;
        };
        const proteinFor = (track, range) => {
            const codons = codonsOf(track);
            if (!codons) return { error: 'no-peptide' };
            let use = codons;
            if (range) {
                const lo = Math.min(+range.start, +range.end);
                const hi = Math.max(+range.start, +range.end);
                use = codons.filter((c) => c.mark >= lo && c.mark <= hi);
                if (!use.length) return { error: 'no-peptide-in-selection' };
            }
            if (use.length < MIN_RESIDUES) {
                return { error: range ? 'short-selection' : 'short-peptide', n: use.length };
            }
            return {
                protein: use.map((c) => c.aa).join(''),
                posMap: use.map((c) => c.x),
                source: range ? ('the peptide within the selection, ' + use.length + ' residues')
                              : ("the track's peptide, " + use.length + ' residues')
            };
        };
        // Coding exons as [lo, hi] base spans: consecutive codons sit 3 bases apart, so a
        // bigger jump is an intron the peptide skipped.
        const exonSpans = (pm) => {
            const spans = [];
            let a = +pm[0], prev = +pm[0];
            for (let i = 1; i < pm.length; i++) {
                const x = +pm[i];
                if (Math.abs(x - prev) > 3) { spans.push([Math.min(a, prev), Math.max(a, prev) + 2]); a = x; }
                prev = x;
            }
            spans.push([Math.min(a, prev), Math.max(a, prev) + 2]);
            return spans.sort((u, v) => u[0] - v[0]);
        };

        const runOnTrack = async (track, range, showPanel = true) => {
            const who = (track && track.name) || 'that track';
            try {
                const got = proteinFor(track, range);
                if (!got || got.error) {
                    done({
                        'no-peptide': 'There is no ORF on ' + who + ', so there is no protein to score.',
                        'short-peptide': 'The peptide on ' + who + ' is ' + (got && got.n)
                            + ' residues; the model describes whole proteins and needs ' + MIN_RESIDUES + '.',
                        'no-peptide-in-selection': 'That selection on ' + who + ' contains no peptide, so nothing was scored.',
                        'short-selection': 'That selection covers ' + (got && got.n)
                            + ' residues of peptide; the model needs ' + MIN_RESIDUES + '.'
                    }[(got && got.error) || 'no-peptide']);
                    clearWork(); restoreHover(); return false;
                }
                try { exec('baja/lib/work-status.js', 'RNA–protein coupling · ' + who); } catch (e) { }
                say('RNA–protein coupling on ' + who + ': scoring ' + got.posMap.length.toLocaleString() + ' residues');

                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                const data = await exec(window['env']['apiUrl'] + '/py/bio/protein/rna-protein-correlation.py', em,
                    '' + got.protein, '' + (track.name || ''));
                let transfer = null, rhoP = null, measured = null, notes = [], half = null;
                try { transfer = JSON.parse(data && data.transfer || 'null'); } catch (e) { }
                try { rhoP = JSON.parse(data && data.rho || 'null'); } catch (e) { }
                if (!data || data.error || !transfer || !rhoP) {
                    done('RNA–protein coupling: ' + ((data && data.error) || 'no result from the server'));
                    clearWork(); restoreHover(); return false;
                }
                try { measured = JSON.parse(data.measured || 'null'); } catch (e) { }
                try { half = JSON.parse(data.halflife || 'null'); } catch (e) { }
                try { notes = JSON.parse(data.notes || '[]'); } catch (e) { }
                // transfer: protein change per mRNA change, typical gene = 1.0. Drawn on a 0..2
                // frame so the typical gene sits at mid-height.
                const tv = +transfer.value;
                const mtv = (measured && measured.transfer != null) ? +measured.transfer : null;
                const FRAME_MAX = 2;
                const clamp = (v) => Math.max(0, Math.min(FRAME_MAX, v));

                // ---- layers: predicted transfer bar over the coding exons, measured line ---
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const lo = Math.min(tg.xmin, tg.xmax), hi = Math.max(tg.xmin, tg.xmax);
                const spans = exonSpans(got.posMap);
                // Re-running replaces the previous layers rather than stacking copies.
                try {
                    track.track_layers = (track.track_layers || []).filter((l) => !l || ('' + l.data_type).indexOf('rna-protein') !== 0);
                } catch (e) { }
                const plateau = (name, type, v, fill, stroke) => {
                    const L = new TrackLayer((track.name || 'track') + '_' + name, lo, 0, hi, FRAME_MAX);
                    L.data_type = type;
                    L.polygon_type = fill ? 'fill' : 'line';
                    L.color = stroke;
                    L.fillstyle = fill || stroke;
                    L.addPolygonPoint(lo, 0);
                    for (const s of spans) {
                        L.addPolygonPoint(s[0], 0); L.addPolygonPoint(s[0], v);
                        L.addPolygonPoint(s[1], v); L.addPolygonPoint(s[1], 0);
                    }
                    L.addPolygonPoint(hi, 0);
                    L.sortPolygonPoints();
                    track.addLayer(L);
                    return L;
                };
                const COL = { buffered: 'rgba(200,70,50,', typical: 'rgba(120,120,120,', responsive: 'rgba(40,120,200,' }[transfer.call]
                    || 'rgba(120,120,120,';
                const bar = plateau('rna_protein', 'rna-protein', clamp(tv), COL + '0.30)', COL + '0.9)');
                if (mtv != null) plateau('rna_protein_measured', 'rna-protein:measured', clamp(mtv), null, 'rgba(20,20,20,0.9)');

                // ---- one annotation over the CDS ------------------------------------------
                const ord = (p) => {
                    const n = Math.round(+p);
                    if (n < 1) return 'bottom 1%';
                    if (n > 99) return 'top 1%';
                    const suf = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
                    return n + suf + ' percentile';
                };
                const hlShort = half ? (half.hela_hours != null
                    ? ('mRNA t½ ' + (+half.hela_hours).toFixed(1) + ' h')
                    : ('mRNA t½ ' + ord(half.percentile))) : '';
                const label = 'mRNA→protein ' + tv.toFixed(2) + '× · ' + transfer.call + ' · ρ ' + (+rhoP.value).toFixed(2)
                    + (mtv != null ? (' (measured ' + mtv.toFixed(2) + '×, ' + measured.n_studies + ' stud'
                        + (measured.n_studies === 1 ? 'y' : 'ies') + ')') : '')
                    + (hlShort ? (' · ' + hlShort) : '');
                // The label goes ABOVE the track with an arrow down to the feature, and the bar
                // gets a y-axis (TrackLayer.__drawDecor), so nothing is drawn over the sequence.
                // Annotations left by earlier runs of this layer are removed.
                try { track.annotations = (track.annotations || []).filter((a) => !a || a.type !== 'RnaProteinCoupling'); } catch (e) { }
                const src = data.source === 'full'
                    ? 'full model (ESM-2 + protein + mRNA features), precomputed for this annotated protein'
                    : 'protein-feature fallback (this exact protein is not an annotated GENCODE protein)';
                // Behind the label's "?" (baja/bio/decor-help.js): what each part means, with this
                // protein's own numbers.
                const pctWord = (p) => ord(p) + ' of human proteins';
                const help = {
                    title: 'RNA–protein coupling: how far this protein follows its mRNA',
                    rows: [
                        ['mRNA→protein ' + tv.toFixed(2) + '×',
                            'Predicted TRANSFER: how much the protein changes when its mRNA changes, relative to a typical gene (= 1.0). '
                            + 'At ' + tv.toFixed(2) + '×, a change in this mRNA moves the protein about ' + Math.round(tv * 100)
                            + '% as much as it would for a typical gene (80% range ' + (+transfer.interval_80[0]).toFixed(2) + '–'
                            + (+transfer.interval_80[1]).toFixed(2) + '). The bar height and the right-hand axis show it.'],
                        [transfer.call,
                            'Buffered = moves less than typical, typical, or responsive = moves more; thirds of all human proteins. '
                            + 'This one is at the ' + pctWord(transfer.percentile) + '.'],
                        ['ρ ' + (+rhoP.value).toFixed(2),
                            'Predicted RELIABILITY: how consistently the protein follows its mRNA across samples (0 = unrelated, '
                            + '1 = lockstep); ' + pctWord(rhoP.percentile) + '. Transfer says how much, ρ how dependably.'],
                        ['measured', mtv != null
                            ? (measured.n_studies + ' of 7 paired mRNA/protein studies measured this gene: transfer ' + mtv.toFixed(2)
                                + '×' + (measured.rho != null ? (', ρ ' + (+measured.rho).toFixed(2)) : '')
                                + '. Where a measurement exists, trust it over the prediction. It is the black line on the track.')
                            : 'No study measured this protein, so only the prediction is available.'],
                        ['mRNA t½', half
                            ? ('mRNA half-life ' + (half.hela_hours != null ? ((+half.hela_hours).toFixed(1) + ' h in HeLa, ') : '')
                                + ord(half.percentile) + ' of genes. Longer-lived mRNAs make more protein per mRNA, but half-life '
                                + 'does not change how closely protein follows mRNA; it is context.')
                            : 'No measured mRNA half-life for this gene.']
                    ],
                    note: 'Source: ' + src + '. Transfer is relative to the typical gene, not an absolute fold change, and '
                        + 'it depends on the samples: flat mRNA cannot move protein, and cell lines can differ from tumours.'
                };
                bar.decor = {
                    axis: { ticks: [0, 1, 2], labels: ['0', '1', '2'], title: 'transfer (1 = typical)' },
                    callout: { text: label, x0: spans[0][0], x1: spans[spans.length - 1][1], color: COL + '0.95)' },
                    help: help
                };

                if (bar.setTimedHighlight) bar.setTimedHighlight(8000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 8100);
                if (graph.wake) graph.wake();

                const how = { buffered: 'changes LESS than', typical: 'changes about as much as', responsive: 'changes MORE than' }[transfer.call];
                const perStudy = (measured && measured.studies) ? Object.keys(measured.studies)
                    .map((k) => k + ' ' + (+measured.studies[k][0]).toFixed(2)).join(', ') : '';
                const msg = ' mRNA→protein transfer on ' + who + ' from ' + got.source + ': ' + tv.toFixed(2)
                    + '× the typical gene (80% ' + (+transfer.interval_80[0]).toFixed(2) + '–' + (+transfer.interval_80[1]).toFixed(2)
                    + ', ' + ord(transfer.percentile) + ') — when its mRNA changes, its protein ' + how + ' the typical protein. '
                    + 'Reliability ρ ' + (+rhoP.value).toFixed(2) + ' (' + ord(rhoP.percentile) + '). '
                    + (mtv != null
                        ? ('Measured in ' + measured.n_studies + ' stud' + (measured.n_studies === 1 ? 'y' : 'ies') + ': '
                            + mtv.toFixed(2) + '×, ρ ' + (measured.rho != null ? (+measured.rho).toFixed(2) : 'n/a') + '.')
                        : 'Not measured in any study, so this is a prediction only.')
                    + (half ? (' mRNA half-life: ' + ord(half.percentile)
                        + (half.hela_hours != null ? (' (' + (+half.hela_hours).toFixed(1) + ' h in HeLa)') : '') + '.') : '')
                    + ' Source: ' + src + '. ';
                // The result opens in the same panel as the label's "?" (baja/bio/decor-help.js) rather
                // than a canvas message that is gone in a few seconds. A sweep over many tracks
                // (runAllTracks) does not open one per track: each keeps its "?" to reopen it.
                if (showPanel && bar.decor && bar.decor.help) {
                    try { graph.setMessage(' '); } catch (e) { }
                    try { await exec('baja/bio/decor-help.js', bar, graph); }
                    catch (e) { try { graph.setResultMessage(msg); } catch (e2) { graph.setMessage(msg); } }
                } else {
                    try { graph.setMessage(msg); } catch (e) { }
                }
                try {
                    if (perStudy) log('[rna-protein] measured transfer by study: ' + perStudy);
                    if (notes.length) log('[rna-protein] ' + notes.join('  '));
                } catch (e) { }
                clearWork(); restoreHover();
                return true;
            } catch (e) {
                done('RNA–protein coupling error on ' + who + ': ' + e);
            }
            clearWork(); restoreHover();
            return false;
        };

        const runAllTracks = (list) => {
            const all = (list || []).filter((t) => t && (t.grid || t.tgraph));
            if (!all.length) { done('No tracks to run on.'); return; }
            try { graph.pushOntoHistory(); } catch (e) { }
            (async () => {
                let ok = 0;
                for (let i = 0; i < all.length; i++) {
                    try {
                        window.__workStatus = 'RNA–protein coupling · ' + ((all[i] && all[i].name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    try { if (await runOnTrack(all[i], ownRange(all[i]), false)) ok++; } catch (e) { }
                }
                try { window.__workStatus = ''; if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh(); } catch (e) { }
                if (all.length > 1) done('RNA–protein coupling added to ' + ok + ' of ' + all.length + ' tracks.');
            })();
        };

        const arm = () => {
            graph.clearMouseListeners();
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            restoreEditor();
            if (__presetList.length) {
                try { graph.setMouseMode('navigate'); } catch (e) { }
                if (__presetList.length === 1) runOnTrack(__presetList[0], presetRange || ownRange(__presetList[0]));
                else runAllTracks(__presetList);
                return;
            }
            // Nothing handed in: one selected track, else wait for a click.
            let sel = [];
            try { sel = (graph.track || []).filter((t) => t && t.showResizeBar); } catch (e) { }
            if (sel.length === 1) { runOnTrack(sel[0], presetRange || ownRange(sel[0])); return; }
            done('RNA–protein coupling: click a protein-coding track.');
            setTimeout(() => {
                try {
                    graph.clearMouseListeners();
                    graph.setMouseMode('msg: Click on a protein-coding track to score RNA–protein coupling');
                    graph.addMouseDownListener(async (x, y) => {
                        const ti = graph.getTrack(x, y);
                        if (ti < 0) return;
                        const t = graph.track[ti];
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate');
                        await runOnTrack(t, ownRange(t));
                    });
                } catch (e) { done('RNA–protein coupling could not arm: ' + e); }
            }, 150);
        };

        try { log('[rna-protein] module loaded, ' + __presetList.length + ' preset track(s)'); } catch (e) { }
        try { arm(); } catch (e) { done('RNA–protein coupling failed to start: ' + e); }
        resolve(true);
    });
}

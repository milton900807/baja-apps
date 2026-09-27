function (graph, genegraph_panel_layout, presetTrack, presetRange, tissueKey) {
    // RNA dynamic range — how widely this gene's mRNA varies between samples of a tissue.
    // MEASURED, not predicted (py/bio/RNA/rna-dynamic-range.py: the 5-95% spread of log2
    // expression across the tissue's own samples, 78 tissues from CPTAC, DepMap and GTEx).
    //
    // Drawn over the transcript's exons (UTRs included; any track with exon annotations,
    // coding or not): a bar at the mRNA range RANK among protein-coding genes in the chosen
    // tissue (0..100 frame, zero across introns), and a black line at the PROTEIN's predicted
    // range rank in the same tissue. Bar well above line = the protein is buffered against
    // its mRNA's swings; line at the bar = the protein follows them.
    //
    // The gene comes from the track's ORF (the exact GENCODE protein) or the track name, so a
    // non-coding track works by name.
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
        const say = (m) => {
            try { log('[rna-range] ' + m); } catch (e) { }
            try { graph.setMessage(' ' + m + '… '); } catch (e) { }
        };
        const done = (m) => {
            try { log('[rna-range] ' + m); } catch (e) { }
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const clearWork = () => { try { exec('baja/lib/work-status.js', null); } catch (e) { } };

        const MIN_RESIDUES = 30;
        const TISSUE = ('' + (tissueKey || 'tumour:brca')) || 'tumour:brca';
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

        // The transcript's exons, UTRs included: the RNA layer covers the whole mRNA, not just
        // the coding part. A track with no exon annotations is drawn across its full length.
        const transcriptSpans = (track, lo, hi) => {
            let ex = [];
            try { ex = (track.getExons ? track.getExons() : (track.annotations || []).filter((a) => a && a.type === 'Exon')); } catch (e) { }
            const spans = (ex || []).filter((a) => a && isFinite(+a.xi) && isFinite(+a.xf))
                .map((a) => [Math.min(+a.xi, +a.xf), Math.max(+a.xi, +a.xf)])
                .sort((u, v) => u[0] - v[0]);
            return spans.length ? spans : [[lo, hi]];
        };
        const ord = (p) => {
            const n = Math.round(+p);
            if (n < 1) return 'bottom 1%';
            if (n > 99) return 'top 1%';
            const suf = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
            return n + suf + ' percentile';
        };
        const fold = (x) => (+x >= 100 ? Math.round(+x).toLocaleString() : (+x).toFixed(1)) + '×';

        const runOnTrack = async (track, range) => {
            const who = (track && track.name) || 'that track';
            try {
                // The protein (if any) only identifies the gene; non-coding tracks go by name.
                const got = proteinFor(track, range);
                const protein = (got && got.protein) || '';
                try { exec('baja/lib/work-status.js', 'RNA dynamic range · ' + who); } catch (e) { }
                say('RNA dynamic range on ' + who);
                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                const data = await exec(window['env']['apiUrl'] + '/py/bio/RNA/rna-dynamic-range.py', em,
                    protein, '' + (track.name || ''), TISSUE);
                let rna = null, prot = null, notes = [];
                try { rna = JSON.parse(data && data.rna || 'null'); } catch (e) { }
                try { prot = JSON.parse(data && data.protein || 'null'); } catch (e) { }
                try { notes = JSON.parse(data && data.notes || '[]'); } catch (e) { }
                if (!data || data.error || !rna) {
                    done('RNA dynamic range: ' + ((data && data.error) || 'no result from the server'));
                    clearWork(); restoreHover(); return false;
                }
                const t = rna.tissue;
                const lowExpr = !t || t.rank_pct == null || t.low_expression;
                const rank = lowExpr ? 0 : +t.rank_pct;
                const pt = prot && prot.tissue;
                const prank = (pt && pt.rank_pct != null && !pt.low_expression) ? +pt.rank_pct : null;

                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const lo = Math.min(tg.xmin, tg.xmax), hi = Math.max(tg.xmin, tg.xmax);
                const spans = transcriptSpans(track, lo, hi);
                try {
                    track.track_layers = (track.track_layers || []).filter((l) => !l || ('' + l.data_type).indexOf('rna-range') !== 0);
                } catch (e) { }
                const plateau = (name, type, v, fill, stroke) => {
                    const L = new TrackLayer((track.name || 'track') + '_' + name, lo, 0, hi, 100);
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
                const kind = (t && t.kind) || 'tumour';
                const COL = { tumour: 'rgba(40,110,200,', cell_line: 'rgba(20,150,110,', normal: 'rgba(210,110,30,' }[kind]
                    || 'rgba(120,120,120,';
                const bar = plateau('rna_range', 'rna-range', Math.max(0, Math.min(100, rank)), COL + '0.28)', COL + '0.9)');
                if (prank != null) plateau('rna_range_protein', 'rna-range:protein', prank, null, 'rgba(20,20,20,0.9)');

                const tlabel = (t && t.label) || TISSUE;
                const widest = (rna.widest_in || []).slice(0, 3).map((c) => c.label + ' ' + fold(c.fold_5_95)).join(', ');
                const label = 'mRNA range · ' + tlabel + ': '
                    + (lowExpr ? 'barely expressed' : (fold(t.fold_5_95) + ' · ' + ord(rank)))
                    + (prank != null ? (' · protein ' + fold(pt.fold_5_95) + ' (' + ord(prank) + ')') : '')
                    + (widest ? (' · widest in ' + widest) : '');
                // The label goes ABOVE the track with an arrow down to the feature, and the bar
                // gets a y-axis (TrackLayer.__drawDecor), so nothing is drawn over the sequence.
                // Annotations left by earlier runs of this layer are removed.
                try { track.annotations = (track.annotations || []).filter((a) => !a || a.type !== 'RnaDynamicRange'); } catch (e) { }
                const help = {
                    title: 'RNA dynamic range: how widely this mRNA varies in ' + tlabel,
                    rows: [
                        [lowExpr ? 'barely expressed' : fold(t.fold_5_95),
                            lowExpr ? ('Even the highest-expressing samples of ' + tlabel + ' barely express this gene, so its spread is noise.')
                                : ('MEASURED 5–95% spread of this mRNA across ' + (t.samples || '') + ' samples of ' + tlabel
                                    + ': the top 5% of samples have about ' + fold(t.fold_5_95) + ' the mRNA of the bottom 5%.')],
                        [lowExpr ? 'rank' : ord(rank), 'Where that spread ranks among protein-coding genes in this tissue (100 = most variable); '
                            + 'the bar height and the right-hand axis show it.' + (!lowExpr ? (' Expression level: ' + ord(t.level_pct) + '.') : '')],
                        ['protein', prank != null
                            ? ('The protein\'s PREDICTED range here: ' + fold(pt.fold_5_95) + ', ' + ord(prank) + ' (black line). Bar well above '
                                + 'the line = the protein is buffered against its mRNA\'s swings; line near the bar = it follows them.')
                            : 'No protein range for this gene here (non-coding, or not expressed enough).'],
                        ['widest in', widest || 'n/a']
                    ],
                    note: 'mRNA spreads are measured, not modelled (CPTAC tumours, DepMap cell lines, GTEx healthy tissues). Tumour '
                        + 'ranges include the surrounding normal tissue, which varies from sample to sample.'
                };
                bar.decor = {
                    axis: { ticks: [0, 50, 100], labels: ['0', '50', '100'], title: 'mRNA range rank' },
                    callout: { text: label, x0: spans[0][0], x1: spans[spans.length - 1][1], color: COL + '0.95)' },
                    help: help
                };

                if (bar.setTimedHighlight) bar.setTimedHighlight(8000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 8100);
                if (graph.wake) graph.wake();

                const msg = ' RNA dynamic range of ' + (data.gene || who) + ' in ' + tlabel
                    + (t && t.samples ? (' (' + t.samples + ' samples)') : '') + ': '
                    + (lowExpr ? 'barely expressed there, so its spread is noise. '
                        : ('measured 5–95% mRNA spread ' + fold(t.fold_5_95) + ', ' + ord(rank)
                            + ' of protein-coding genes; expression level ' + ord(t.level_pct) + '. '))
                    + (prank != null ? ('Predicted protein range there: ' + fold(pt.fold_5_95) + ', ' + ord(prank)
                        + ' (black line) — '
                        + (rank - prank >= 20 ? 'the protein is buffered against its mRNA\'s swings. '
                            : (prank - rank >= 20 ? 'the protein varies more than its mRNA rank suggests. '
                                : 'the protein follows its mRNA\'s range. '))) : '')
                    + (widest ? ('mRNA varies most in ' + widest + '. ') : '')
                    + 'Gene matched by ' + (data.matched_by || 'name') + '. ';
                try { graph.setResultMessage(msg); } catch (e) { graph.setMessage(msg); }
                try { if (notes.length) log('[rna-range] ' + notes.join('  ')); } catch (e) { }
                clearWork(); restoreHover();
                return true;
            } catch (e) {
                done('RNA dynamic range error on ' + who + ': ' + e);
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
                    try { if (await runOnTrack(all[i], ownRange(all[i]))) ok++; } catch (e) { }
                }
                if (all.length > 1) done('RNA dynamic range added to ' + ok + ' of ' + all.length + ' tracks.');
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
            let sel = [];
            try { sel = (graph.track || []).filter((t) => t && t.showResizeBar); } catch (e) { }
            if (sel.length === 1) { runOnTrack(sel[0], presetRange || ownRange(sel[0])); return; }
            done('RNA dynamic range: click a track.');
            setTimeout(() => {
                try {
                    graph.clearMouseListeners();
                    graph.setMouseMode('msg: Click on a track to show its RNA dynamic range');
                    graph.addMouseDownListener(async (x, y) => {
                        const ti = graph.getTrack(x, y);
                        if (ti < 0) return;
                        const tk = graph.track[ti];
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate');
                        await runOnTrack(tk, ownRange(tk));
                    });
                } catch (e) { done('RNA dynamic range could not arm: ' + e); }
            }, 150);
        };

        try { log('[rna-range] module loaded, tissue ' + TISSUE + ', ' + __presetList.length + ' preset track(s)'); } catch (e) { }
        try { arm(); } catch (e) { done('RNA dynamic range failed to start: ' + e); }
        resolve(true);
    });
}

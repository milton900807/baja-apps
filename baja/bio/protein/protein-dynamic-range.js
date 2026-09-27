function (graph, genegraph_panel_layout, presetTrack, presetRange, tissueKey) {
    // Protein dynamic range — how widely this protein varies between samples of a tissue,
    // predicted from mRNA (py/bio/protein/protein-dynamic-range.py, a lookup in atlases built
    // by ~/ml/rna-to-protein-correlation's protein-dynamic-range tool).
    //
    // Drawn over the coding exons: a bar at the protein's range RANK among all proteins in
    // the chosen tissue (0..100 frame, zero across introns), a line at its measured rank
    // where one of 7 paired mRNA/protein studies quantified it, and one annotation giving
    // the fold spread there and the tissues where it varies most. Healthy (GTEx) tissues are
    // not validated and the result says so.
    //
    // The gene comes from the track's own ORF (the exact GENCODE protein) or, failing that,
    // the track name; the ORF is read with the same rules as the other protein layers.
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
            try { log('[protein-range] ' + m); } catch (e) { }
            try { graph.setMessage(' ' + m + '… '); } catch (e) { }
        };
        const done = (m) => {
            try { log('[protein-range] ' + m); } catch (e) { }
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

        const ord = (p) => {
            const n = Math.round(+p);
            if (n < 1) return 'bottom 1%';
            if (n > 99) return 'top 1%';
            const suf = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
            return n + suf + ' percentile';
        };

        const runOnTrack = async (track, range) => {
            const who = (track && track.name) || 'that track';
            try {
                // The protein only identifies the gene; a track with no usable ORF still gets
                // a result from its name, so no-ORF is not an error here.
                const got = proteinFor(track, range);
                const protein = (got && got.protein) || '';
                try { exec('baja/lib/work-status.js', 'Protein dynamic range · ' + who); } catch (e) { }
                say('Protein dynamic range on ' + who);
                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                const data = await exec(window['env']['apiUrl'] + '/py/bio/protein/protein-dynamic-range.py', em,
                    protein, '' + (track.name || ''), TISSUE);
                let rng = null, tis = null, notes = [];
                try { rng = JSON.parse(data && data.range || 'null'); } catch (e) { }
                try { tis = JSON.parse(data && data.tissue || 'null'); } catch (e) { }
                try { notes = JSON.parse(data && data.notes || '[]'); } catch (e) { }
                if (!data || data.error || !rng) {
                    done('Protein dynamic range: ' + ((data && data.error) || 'no result from the server'));
                    clearWork(); restoreHover(); return false;
                }
                const t = tis && tis.tissue;
                const lowExpr = !t || t.rank_pct == null || t.low_expression;
                const rank = lowExpr ? 0 : +t.rank_pct;
                const measured = rng.measured_rank || {};
                const mvals = Object.keys(measured).map((k) => +measured[k]);
                const mrank = mvals.length ? mvals.reduce((u, v) => u + v, 0) / mvals.length : null;

                // ---- layers over the coding exons (or the whole track if it has no ORF) ------
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const lo = Math.min(tg.xmin, tg.xmax), hi = Math.max(tg.xmin, tg.xmax);
                const spans = (got && got.posMap) ? exonSpans(got.posMap) : [[lo, hi]];
                try {
                    track.track_layers = (track.track_layers || []).filter((l) => !l || ('' + l.data_type).indexOf('protein-range') !== 0);
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
                // colour by the kind of tissue: tumour purple, cell line teal, healthy amber
                const kind = (t && t.kind) || 'tumour';
                const COL = { tumour: 'rgba(120,70,170,', cell_line: 'rgba(20,140,140,', normal: 'rgba(200,130,20,' }[kind]
                    || 'rgba(120,120,120,';
                const bar = plateau('protein_range', 'protein-range', Math.max(0, Math.min(100, rank)), COL + '0.30)', COL + '0.9)');
                if (mrank != null) plateau('protein_range_measured', 'protein-range:measured', mrank, null, 'rgba(20,20,20,0.9)');

                const tlabel = (t && t.label) || TISSUE;
                const most = ((tis && tis.most_variable_in) || []).slice(0, 3)
                    .map((c) => c.label + ' ' + (+c.fold_5_95).toFixed(1) + '×').join(', ');
                const label = 'Protein range · ' + tlabel + ': '
                    + (lowExpr ? 'barely expressed' : ((+t.fold_5_95).toFixed(1) + '× · ' + ord(rank)))
                    + (kind === 'normal' ? ' (healthy, not validated)' : '')
                    + (most ? (' · most variable in ' + most) : '');
                try {
                    const Annotation = await exec('flexigraph/annotation.js');
                    try { track.annotations = (track.annotations || []).filter((a) => !a || a.type !== 'ProteinDynamicRange'); } catch (e) { }
                    const an = new Annotation('ProteinDynamicRange', label, spans[0][0], spans[spans.length - 1][1]);
                    an.color = COL + '0.95)';
                    an.labelY = 3.2;
                    try { track.add(an); } catch (e) { (track.annotations || []).push(an); }
                    try { if (track.fitYAxis) track.fitYAxis(); } catch (e) { }
                } catch (e) { try { log('[protein-range] annotation failed: ' + e); } catch (e2) { } }

                if (bar.setTimedHighlight) bar.setTimedHighlight(8000);
                setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 8100);
                if (graph.wake) graph.wake();

                const msg = ' Protein dynamic range of ' + (data.gene || who) + ' in ' + tlabel
                    + (t && t.samples ? (' (' + t.samples + ' samples)') : '') + ': '
                    + (lowExpr ? 'its mRNA is barely expressed there, so there is no meaningful range. '
                        : ('predicted 5–95% protein spread ' + (+t.fold_5_95).toFixed(1) + '×, ' + ord(rank) + ' of all proteins. '))
                    + (kind === 'normal' ? 'Healthy tissue: not validated (no matched proteomics; the model was trained on tumours and cell lines). ' : '')
                    + (most ? ('Varies most in ' + most + '. ') : '')
                    + (mrank != null ? ('Measured variability rank across ' + mvals.length + ' stud' + (mvals.length === 1 ? 'y' : 'ies')
                        + ': ' + ord(mrank) + ' (black line). ') : '')
                    + 'Gene matched by ' + (data.matched_by || 'name') + '. ';
                try { graph.setResultMessage(msg); } catch (e) { graph.setMessage(msg); }
                try { if (notes.length) log('[protein-range] ' + notes.join('  ')); } catch (e) { }
                clearWork(); restoreHover();
                return true;
            } catch (e) {
                done('Protein dynamic range error on ' + who + ': ' + e);
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
                if (all.length > 1) done('Protein dynamic range added to ' + ok + ' of ' + all.length + ' tracks.');
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
            done('Protein dynamic range: click a track.');
            setTimeout(() => {
                try {
                    graph.clearMouseListeners();
                    graph.setMouseMode('msg: Click on a track to show its protein dynamic range');
                    graph.addMouseDownListener(async (x, y) => {
                        const ti = graph.getTrack(x, y);
                        if (ti < 0) return;
                        const tk = graph.track[ti];
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate');
                        await runOnTrack(tk, ownRange(tk));
                    });
                } catch (e) { done('Protein dynamic range could not arm: ' + e); }
            }, 150);
        };

        try { log('[protein-range] module loaded, tissue ' + TISSUE + ', ' + __presetList.length + ' preset track(s)'); } catch (e) { }
        try { arm(); } catch (e) { done('Protein dynamic range failed to start: ' + e); }
        resolve(true);
    });
}

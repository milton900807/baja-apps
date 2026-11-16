function (graph, genegraph_panel_layout, presetTrack) {

    // BajaNMD: what including or skipping a cassette exon does to the transcript,
    // and the steric-block ASOs that switch it.
    //   exec('baja/bio/splicing/bajanmd.js', graph, genegraph_panel_layout [, track])
    //
    // Two python entry points, both gene-level:
    //   py/bio/nmd/bajanmd-exons.py   gene -> every cassette exon + its NMD class
    //   py/bio/nmd/bajanmd-aso.py     one exon -> ranked oligos, specificity screened
    //
    // THE DIRECTION IS THE POINT, and it is the opposite for the two classes:
    //
    //   NMD_in  a poison exon. Including it sends the transcript to decay, so
    //           SKIPPING it RAISES protein. This is the TANGO-class strategy,
    //           as in STK-001 against SCN1A exon 20N.
    //   NMD_ex  an essential exon whose loss breaks frame. SKIPPING it LOWERS
    //           protein, by sending the transcript to decay.
    //
    // The oligo is the same kind of molecule either way; only the exon's class
    // decides which way the protein moves. That is why the exon list leads with
    // the class and says the consequence in words rather than leaving the reader
    // to work it out from an abbreviation.
    //
    // It scores by GENE, like intron-retention.js: exons come from the
    // annotation, so a sequence selection does not narrow it.

    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const esc = (s) => ('' + (s === null || s === undefined ? '' : s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // description is 'gene_name;transcript_name' (track-flexi builds it that way).
        const geneOf = (t) => {
            const raw = '' + ((t && (t.description || t.name || t.geneID)) || '');
            return raw.split(';')[0].split('(')[0].trim();
        };

        // Same restore rule as intron-retention.js: reset() remounts what editor.js
        // stashed and re-arms mouse-over-highlight; clear + set is only a fallback.
        const restoreEditor = () => {
            try {
                if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                    CurrentLayout.reset('mainPanel');
                    return;
                }
            } catch (e) { }
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            if (genegraph_panel_layout) {
                try { CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
            }
        };

        const CONSEQUENCE = {
            NMD_in: 'poison exon · skipping it RAISES protein',
            NMD_ex: 'essential exon · skipping it LOWERS protein'
        };

        const monitor = (prefix) => new EngineMonitor((m) => {
            try { graph.setMessage(' ' + m + ' '); } catch (e) { }
            try { exec('baja/lib/work-status.js', prefix + '  ·  ' + m); } catch (e) { }
        });

        // ---- step 2: oligos for one exon -------------------------------------
        const designFor = async (gene, ex) => {
            const server = window['env']['apiUrl'];
            const where = gene + ' · ' + ex.chrom + ':' + ex.a_start + '-' + ex.a_end;
            try { exec('baja/lib/work-status.js', 'BajaNMD · designing ASOs → ' + where); } catch (e) { }
            graph.setMessage(' Designing ASOs to skip ' + where + '… ');

            let data;
            try {
                data = await exec(server + '/py/bio/nmd/bajanmd-aso.py', monitor('BajaNMD · ' + where),
                    '' + ex.chrom, '' + ex.a_start, '' + ex.a_end, '' + ex.strand,
                    '' + gene, '18', '15', 'human_premrna');
            } catch (e) {
                graph.setMessage(' BajaNMD: ' + ((e && e.message) ? e.message : e) + ' ');
                try { exec('baja/lib/work-status.js', null); } catch (e2) { }
                return;
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }

            if (data && data.error) {
                graph.setMessage(' BajaNMD: ' + data.error + ' ');
                return;
            }
            let cands = [], ref = {};
            try { cands = JSON.parse((data && data.candidates) || '[]'); } catch (e) { cands = []; }
            try { ref = JSON.parse((data && data.reference) || '{}'); } catch (e) { ref = {}; }

            // The reference probabilities decide whether anything below is worth
            // reading, so they go ABOVE the table, not in a footnote.
            let html = '<div style="padding:8px 4px;font-weight:700;">BajaNMD · ASOs to skip '
                + esc(where) + '</div>'
                + '<div style="padding:0 4px 6px 4px;font-size:12.5px;color:#5b6b7c;">'
                + esc(CONSEQUENCE[ex.nmd_class] || ex.nmd_class)
                + ' &nbsp;|&nbsp; splice sites in place: acceptor <b>' + esc(ref.acceptor)
                + '</b>, donor <b>' + esc(ref.donor) + '</b></div>';

            if (data && data.warning) {
                html += '<div style="margin:4px;padding:8px;border-left:3px solid #c94c8c;'
                    + 'background:#fdf2f7;font-size:12.5px;">' + esc(data.warning) + '</div>';
            }
            if (!cands.length) {
                html += '<div style="padding:8px 4px;font-size:12.5px;">No candidate windows were returned.</div>';
            } else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
                    + '<tr style="text-align:left;border-bottom:1px solid #ccd;">'
                    + '<th>ASO 5\'&rarr;3\'</th><th>skip</th><th>GC</th><th>exonic</th>'
                    + '<th>off-target</th><th>notes</th></tr>';
                cands.forEach((c) => {
                    const off = (c.off_error ? 'index unavailable'
                        : (c.off_n ? (c.off_n + ': ' + (c.off_genes || []).slice(0, 4).join(', '))
                            : (c.self_hit ? 'none (self seen)' : 'none')));
                    const notes = [].concat(c.saturated ? ['capped'] : [], c.flags || []).join(', ');
                    html += '<tr style="border-bottom:1px solid #eef;">'
                        + '<td style="font-family:monospace;">' + esc(c.aso_5to3) + '</td>'
                        + '<td>' + esc((+c.skip_logit).toFixed(2)) + '</td>'
                        + '<td>' + esc(c.gc) + '</td>'
                        + '<td>' + esc(c.exonic_nt) + '/' + esc((c.end - c.start) + 1) + '</td>'
                        + '<td>' + esc(off) + '</td>'
                        + '<td style="color:#8a6d3b;">' + esc(notes) + '</td></tr>';
                });
                html += '</table>'
                    + '<div style="padding:8px 4px;font-size:12px;color:#5b6b7c;">'
                    + '"capped" means the score hit its ceiling, so those rows tie and their order is not a '
                    + 'potency ranking: choose among them on off-target and GC. "exonic" is how much of the '
                    + 'oligo lies in the exon; a mostly-intronic window is screened against the pre-mRNA '
                    + 'reference, and "self seen" confirms the screen found the oligo\'s own gene.</div>';
            }

            showModal({
                wid: 'card',
                data: {
                    cards: [[
                        { 'width': '100%', 'component': { wid: 'html', data: html } }
                    ]]
                }
            });
            graph.setMessage(' ' + cands.length + ' candidate ASO'
                + (cands.length === 1 ? '' : 's') + ' for ' + esc(where) + '. ');
        };

        // ---- step 1: the gene's exons ----------------------------------------
        const runOnTrack = async (track) => {
            const gene = geneOf(track);
            if (!gene) {
                graph.setMessage(' That track has no gene name to score. ');
                restoreHover();
                return false;
            }
            const server = window['env']['apiUrl'];
            try { exec('baja/lib/work-status.js', 'BajaNMD · NMD consequence → ' + gene); } catch (e) { }
            graph.setMessage(' Classifying cassette exons of ' + gene + ' (BajaNMD)… ');

            let data;
            try {
                data = await exec(server + '/py/bio/nmd/bajanmd-exons.py',
                    monitor('BajaNMD · ' + gene), '' + gene, 'switch', '50');
            } catch (e) {
                graph.setMessage(' BajaNMD: ' + ((e && e.message) ? e.message : e) + ' ');
                try { exec('baja/lib/work-status.js', null); } catch (e2) { }
                restoreHover();
                return false;
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }

            if (data && data.error) {
                graph.setMessage(' BajaNMD: ' + data.error + ' ');
                restoreHover();
                return false;
            }
            let exons = [];
            try { exons = JSON.parse((data && data.exons) || '[]'); } catch (e) { exons = []; }

            // Not an error: many genes have no frame-switching cassette exon.
            if (!exons.length) {
                graph.setMessage(' ' + gene + ' has no cassette exon whose inclusion or '
                    + 'skipping switches NMD status, which is a normal result. ');
                restoreHover();
                return false;
            }

            const byLabel = {}, contentItems = {}, listItems = [];
            exons.forEach((e) => {
                const label = (e.nmd_class === 'NMD_in' ? '▲ ' : '▼ ')
                    + e.chrom + ':' + e.a_start + '-' + e.a_end
                    + '   ' + e.exon_len + ' nt';
                const dis = (e.mane_class && e.mane_class !== e.nmd_class)
                    ? (' MANE Select calls it ' + e.mane_class + ' instead, so the consequence '
                        + 'depends on the isoform.') : '';
                byLabel[label] = e;
                contentItems[label] = (CONSEQUENCE[e.nmd_class] || e.nmd_class)
                    + '. Agreed by ' + Math.round(100 * e.frac) + '% of the '
                    + e.n_tx + ' transcript' + (e.n_tx === 1 ? '' : 's') + ' carrying it.'
                    + (e.frame_preserving ? ' Exon length is a multiple of 3, so skipping it keeps frame: unusual for this class.' : '')
                    + dis;
                listItems.push(label);
            });

            const list = {
                wid: 'selection-list',
                data: {
                    single_selection: true, show_button: false, singleSelect: true,
                    listItems: listItems, contentItems: contentItems,
                    button_function: createIonFunction((items) => {
                        const ex = items && items[0] && byLabel[items[0]];
                        restoreEditor();
                        resetModelsToolbar();
                        if (ex) designFor(gene, ex);
                    })
                }
            };

            const nIn = exons.filter((e) => e.nmd_class === 'NMD_in').length;
            const panel = {
                wid: 'card',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:8px 4px;font-weight:700;">BajaNMD · '
                                    + esc(gene) + ' — pick an exon to design against</div>'
                                    + '<div style="padding:0 4px 8px 4px;font-size:12.5px;color:#5b6b7c;">'
                                    + '▲ ' + nIn + ' poison exon' + (nIn === 1 ? '' : 's')
                                    + ' (skip to RAISE protein) &nbsp;·&nbsp; ▼ '
                                    + (exons.length - nIn) + ' essential exon'
                                    + ((exons.length - nIn) === 1 ? '' : 's')
                                    + ' (skip to LOWER protein). Classified from the annotation by the '
                                    + '50 nt rule, per transcript.</div>'
                            }
                        },
                        { 'width': '100%', 'component': list },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: [{
                                        label: 'Close', ionFunction: createIonFunction(() => {
                                            restoreEditor();
                                            resetModelsToolbar();
                                        })
                                    }]
                                }
                            }
                        }
                    ]]
                }
            };

            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', panel);
            graph.setMessage(' ' + gene + ': ' + exons.length + ' exon'
                + (exons.length === 1 ? '' : 's') + ' switch NMD status. ');
            return true;
        };

        // The track this was launched against, when there is one. Same rule as
        // intron-retention.js: only an UNAMBIGUOUS selection counts.
        const __presetList = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);
        const pickedTrack = () => {
            if (__presetList.length === 1) return __presetList[0];
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
        };

        let __canRestore = !!genegraph_panel_layout;
        try { __canRestore = __canRestore || !!(CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')); } catch (e) { }
        if (!__canRestore) {
            try { graph.setMessage(' BajaNMD could not start: no editor layout was passed to it. '); } catch (e) { }
            resolve(false);
            return;
        }

        const pt = pickedTrack();
        if (pt) {
            runOnTrack(pt).then(resolve);
            return;
        }
        graph.clearMouseListeners();
        graph.setMouseMode('msg: Click on a track to classify its cassette exons for NMD');
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            const track = graph.track[ti];
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            await runOnTrack(track);
        });
        resolve(true);
    });
}

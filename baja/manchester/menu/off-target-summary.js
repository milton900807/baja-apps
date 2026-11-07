function (graph, oligo, genegraph_panel_layout) {

    // The canonical off-target MAPPING panel for a single compound: query, hit count,
    // distinct genes, the dataset description, the off-target transcripts, and the
    // "Genes — load & map" chips. Each transcript / gene link loads that target and maps
    // the compound onto it (map-compound-to-offtarget.js) at the same edit distance the
    // off-target run used. Opened from the ASO menu ("View off-targets") AND from the
    // off-target report (run-off-targets.js) so the report always links to the mapper.
    //   exec('baja/manchester/menu/off-target-summary.js', graph, oligo, genegraph_panel_layout)
    //
    // Rendered as an OVERLAY sized to the gene-graph canvas — it sits ON TOP of the canvas
    // rather than replacing it (the mainPanel component is left alone), so closing it is just
    // removing a DOM node and the canvas underneath never re-mounts. The panel tracks the
    // canvas rect on resize. Its header (title + Close) is pinned and never scrolls, so the
    // Close button is always reachable no matter how long the hit list is.

    try {
        const o = oligo;
        const hits = Array.isArray(o.offtarget) ? o.offtarget : [];
        const isStr = (typeof o.offtarget === 'string');
        const count = isStr ? (parseInt(o.offtarget, 10) || 0) : hits.length;
        let genes = (Array.isArray(o.offtargetsymbols) && o.offtargetsymbols.length) ? o.offtargetsymbols.slice() : Array.from(new Set(hits.map((h) => h && h.symbol).filter(Boolean)));
        const distinct = (o.offtargetGeneCount != null) ? o.offtargetGeneCount : new Set(genes.map((g) => ('' + g).trim())).size;
        const nm = o.name || o.synthesisSequence || o.id || 'compound';
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const row = (k, v) => '<tr><td style="padding:4px 18px 4px 0;color:#8fb8c8;white-space:nowrap;">' + k + '</td><td style="padding:4px 0;font-weight:600;color:#fff;">' + v + '</td></tr>';
        // A one-paragraph description of the reference dataset that was searched.
        const __datasetDesc = (dn) => {
            const s = ('' + dn).toLowerCase();
            const sp = (s.includes('mouse') || s.includes('mus_')) ? 'Mouse'
                : (s.includes('rat') || s.includes('rattus')) ? 'Rat' : 'Human';
            if (s.includes('virus') || s.includes('viral')) return 'NCBI RefSeq viral reference genomes — complete genome sequences spanning human and non-human viruses (~19,600 genomes, ~580 Mbp). A hit flags unintended complementarity to a viral genome.';
            if (s.includes('3utr') || s.includes('3_utr')) return sp + ' 3′UTR sequences — the dominant site of miRNA-like, seed-mediated off-targeting; a guide whose seed matches many 3′UTRs can silence unintended genes.';
            if (s.includes('5utr') || s.includes('5_utr')) return sp + ' 5′UTR sequences — the 5′ untranslated regions of protein-coding transcripts.';
            if (s.includes('premrna') || s.includes('pre-mrna') || s.includes('pre_mrna')) return sp + ' pre-mRNA (Ensembl) — unspliced primary transcripts including introns; captures intronic / splice-junction off-targets.';
            if (s.includes('ncrna')) return sp + ' non-coding RNA (Ensembl) — lncRNAs, snRNAs, snoRNAs, miRNA precursors and other ncRNAs.';
            if (s.includes('all_transcripts')) return sp + ' transcriptome (Ensembl) — every annotated transcript (mRNAs + ncRNAs, all isoforms); the broadest ' + sp.toLowerCase() + ' off-target reference.';
            if (s.includes('cdna')) return sp + ' cDNA (Ensembl) — spliced, mature protein-coding transcripts (all isoforms).';
            return dn ? (sp + ' reference (Ensembl) — searched for complementary sites.') : '';
        };
        const __ds = o.offtargetDataset || '';
        const __dsName = Array.isArray(__ds) ? __ds.filter(Boolean).join(', ') : ('' + __ds);
        const __edd = (o.offtargetEditDistance != null) ? o.offtargetEditDistance : 0;
        const __dsPara = __dsName ? __dsName.split(/,\s*/).filter(Boolean).map(__datasetDesc).join(' ') : '';
        let body = '<table style="border-collapse:collapse;font-size:13px;">'
            + row('Query', '<span style="font-family:monospace;">' + esc(o.synthesisSequence || o.sequence || '') + '</span>')
            + row('Off-target hits', count.toLocaleString())
            + row('Distinct genes', (distinct || 0).toLocaleString())
            + (__dsName ? row('Dataset', esc(__dsName)) : '')
            + '</table>';
        if (__dsPara) {
            body += '<div style="margin-top:12px;padding:10px 12px;background:rgba(79,208,230,0.08);border-left:3px solid #4fd0e6;border-radius:6px;font-size:12.5px;line-height:1.55;color:#cfe6ee;">'
                + '<span style="color:#4fd0e6;font-weight:700;">Dataset.</span> ' + esc(__dsPara)
                + ' <span style="color:#8fb8c8;">Search: Levenshtein edit distance ≤ ' + esc('' + __edd) + ', both strands.</span></div>';
        }
        // Full-panel now, so show the transcript hits generously (capped at 500 rows for render cost).
        const CAP = 500;
        if (hits.length) {
            const shown = hits.slice(0, CAP);
            body += '<div style="margin-top:14px;font:700 12px Arial;color:#4fd0e6;">Off-target transcripts (' + hits.length.toLocaleString() + ')</div>'
                + '<div style="overflow:auto;margin-top:4px;">'
                + shown.map((h, hi) => {
                    const sym = (h && h.symbol) ? esc(h.symbol) : '—';
                    const tx = (h && (h.chr || h.transcript)) ? esc(h.chr || h.transcript) : '';
                    const loc = (h && h.start != null) ? esc('' + h.start + (h.end != null ? ('-' + h.end) : '')) : '';
                    const ed = (h && h.editdistance != null) ? ('edit ' + h.editdistance) : '';
                    return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;">'
                        + '<span style="color:#eaf6f9;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + sym + (tx ? (' <span style="color:#8fb8c8;">' + tx + '</span>') : '') + '</span>'
                        + '<span style="color:#8fb8c8;font-family:monospace;white-space:nowrap;">' + loc + ' ' + ed + '</span>'
                        + '<button class="aso-ot-map" data-hi="' + hi + '" title="Load this transcript and map the compound onto it" style="cursor:pointer;border-radius:6px;padding:4px 10px;font:700 11px Arial;border:1px solid #1aa3bd;background:transparent;color:#4fd0e6;white-space:nowrap;">↗ Map</button>'
                        + '</div>';
                }).join('')
                + (hits.length > CAP ? '<div style="color:#8fb8c8;font:12px Arial;padding:8px 0;">+' + (hits.length - CAP).toLocaleString() + ' more not shown</div>' : '')
                + '</div>';
        }
        // Genes — each is a button: load the gene by symbol and map the compound onto it
        // using the SAME edit distance the off-target run used.
        if (genes.length) {
            body += '<div style="margin-top:14px;font:700 12px Arial;color:#4fd0e6;">Genes — load &amp; map</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">'
                + genes.slice(0, 200).map((gsym) => '<button class="aso-ot-gene" data-gene="' + esc(gsym) + '" title="Load ' + esc(gsym) + ' and map the compound onto it (same edit distance)" style="cursor:pointer;border-radius:999px;padding:5px 12px;font:700 12px Arial;border:1px solid #1aa3bd;background:transparent;color:#4fd0e6;">↗ ' + esc(gsym) + '</button>').join('')
                + (genes.length > 200 ? '<span style="color:#8fb8c8;font:12px Arial;align-self:center;">+' + (genes.length - 200) + ' more</span>' : '')
                + '</div>';
        }

        // ---- Render as an overlay fitted to the canvas (does NOT replace it) -----------------
        // The shell -- navy ground, pinned header with the title and Close, one scrolling body,
        // fitted to the gene-graph canvas and tracking it -- is baja/lib/canvas-overlay-panel.js.
        // It used to be built by hand here; it is shared so every result window in the editor is
        // the same window (see that module's header).
        //
        // An async IIFE, not an async module body: every module in this tree is a plain
        // `function (...)` expression, and the shell has to be loaded with exec before the
        // window can be built. The module still returns `graph` synchronously, as its callers
        // expect -- the window simply appears a tick later.
        (async () => {
        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const __ov = OV.open({
            id: 'baja-aso-ot-summary',
            // Raw, not esc(): the shell sets the title with textContent, which escapes it.
            title: 'Off-targets — ' + nm,
            body: body
        });
        const panel = __ov.panel, close = __ov.close;

        try {
            panel.querySelectorAll('.aso-ot-map').forEach((btn) => {
                btn.onclick = () => {
                    const h = hits[+btn.getAttribute('data-hi')];
                    close();
                    try { exec('baja/manchester/menu/map-compound-to-offtarget.js', graph, oligo, h, __edd); }
                    catch (e) { try { graph.setMessage(' Map failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                };
            });
            panel.querySelectorAll('.aso-ot-gene').forEach((btn) => {
                btn.onclick = () => {
                    const gene = btn.getAttribute('data-gene');
                    close();
                    try { exec('baja/manchester/menu/map-compound-to-offtarget.js', graph, oligo, { symbol: gene }, __edd); }
                    catch (e) { try { graph.setMessage(' Map failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                };
            });
        } catch (e) { }
        })().catch((e) => { try { graph.setMessage(' Off-target mapper failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } });
    } catch (e) { try { graph.setMessage(' Off-target mapper failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }

    return graph;
}

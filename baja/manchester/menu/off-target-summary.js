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
        // The VISIBLE gene-graph canvas: largest by on-screen display area, so an off-screen or
        // buffer canvas can't be picked and the rect we fit to is the one the user is looking at.
        const biggestCanvas = () => {
            let best = null, area = -1;
            try {
                const vh = window.innerHeight || 1e9, vw = window.innerWidth || 1e9;
                for (const c of document.querySelectorAll('canvas')) {
                    const r = c.getBoundingClientRect();
                    if (!r || r.width <= 1 || r.height <= 1) continue;
                    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;   // off-screen
                    const a = r.width * r.height;
                    if (a > area) { area = a; best = c; }
                }
            } catch (e) { }
            return best;
        };

        const old = document.getElementById('baja-aso-ot-summary'); if (old && old.parentNode) old.parentNode.removeChild(old);
        const panel = document.createElement('div');
        panel.id = 'baja-aso-ot-summary';
        // Column layout: a fixed-height header that never scrolls + a scrolling body beneath it.
        panel.style.cssText = 'position:fixed;z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;'
            + 'background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);'
            + 'border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;';

        // Fit the panel to the canvas currently under it. Re-run on resize so it keeps matching.
        const fitToCanvas = () => {
            try {
                const cv = biggestCanvas();
                const r = cv ? cv.getBoundingClientRect() : null;
                if (r && r.width > 1 && r.height > 1) {
                    panel.style.left = Math.round(r.left) + 'px';
                    panel.style.top = Math.round(r.top) + 'px';
                    panel.style.width = Math.round(r.width) + 'px';
                    panel.style.height = Math.round(r.height) + 'px';
                } else {   // no canvas found — fall back to a centred sheet
                    panel.style.left = '50%'; panel.style.top = '60px'; panel.style.transform = 'translateX(-50%)';
                    panel.style.width = 'min(720px,94vw)'; panel.style.height = 'min(80vh,820px)';
                }
            } catch (e) { }
        };

        // Header: flex-none, so it holds its height and the Close button is on screen from the
        // start — the hit list scrolls underneath it, never past it.
        const head = document.createElement('div');
        head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:14px 18px;'
            + 'border-bottom:1px solid rgba(255,255,255,0.14);background:#0b2545;border-radius:12px 12px 0 0;';
        head.innerHTML = '<div style="font:700 16px Arial;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Off-targets — ' + esc(nm) + '</div>'
            + '<button id="aso-ot-close" data-rec="Off-targets close" title="Close (Esc)" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Close</button>';

        // Body: the only scrolling region.
        const bodyEl = document.createElement('div');
        bodyEl.style.cssText = 'flex:1 1 auto;min-height:0;overflow:auto;padding:16px 18px 18px;';
        bodyEl.innerHTML = body;

        panel.appendChild(head); panel.appendChild(bodyEl);
        fitToCanvas();
        document.body.appendChild(panel);

        let onKey = null, onResize = null, ro = null;
        const close = () => {
            try { if (onResize) window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (ro) ro.disconnect(); } catch (e) { }
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        };
        onResize = () => fitToCanvas();
        window.addEventListener('resize', onResize);
        onKey = (e) => { try { if (e.key === 'Escape') { close(); } } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        // Track the canvas itself changing size (panel splits, sidebar toggles), not just the window.
        try {
            const cv0 = biggestCanvas();
            if (cv0 && typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => fitToCanvas()); ro.observe(cv0); }
        } catch (e) { }

        const cb = panel.querySelector('#aso-ot-close'); if (cb) cb.onclick = () => close();
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
    } catch (e) { try { graph.setMessage(' Off-target mapper failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }

    return graph;
}

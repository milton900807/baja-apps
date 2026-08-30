function (graph, oligo, genegraph_panel_layout) {

    // The canonical off-target MAPPING panel for a single compound: query, hit count,
    // distinct genes, the dataset description, the off-target transcripts, and the
    // "Genes — load & map" chips. Each transcript / gene link loads that target and maps
    // the compound onto it (map-compound-to-offtarget.js) at the same edit distance the
    // off-target run used. Opened from the ASO menu ("View off-targets") AND from the
    // off-target report (run-off-targets.js) so the report always links to the mapper.
    //   exec('baja/manchester/menu/off-target-summary.js', graph, oligo, genegraph_panel_layout)

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
        if (count > 0 && count < 20 && hits.length) {
            body += '<div style="margin-top:12px;font:700 12px Arial;color:#4fd0e6;">Off-target transcripts</div><div style="max-height:300px;overflow:auto;margin-top:4px;">'
                + hits.map((h, hi) => {
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
                + '</div>';
        }
        // Genes — each is a button: load the gene by symbol and map the compound onto it
        // using the SAME edit distance the off-target run used.
        if (genes.length) {
            body += '<div style="margin-top:14px;font:700 12px Arial;color:#4fd0e6;">Genes — load &amp; map</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">'
                + genes.slice(0, 40).map((gsym) => '<button class="aso-ot-gene" data-gene="' + esc(gsym) + '" title="Load ' + esc(gsym) + ' and map the compound onto it (same edit distance)" style="cursor:pointer;border-radius:999px;padding:5px 12px;font:700 12px Arial;border:1px solid #1aa3bd;background:transparent;color:#4fd0e6;">↗ ' + esc(gsym) + '</button>').join('')
                + (genes.length > 40 ? '<span style="color:#8fb8c8;font:12px Arial;align-self:center;">+' + (genes.length - 40) + ' more</span>' : '')
                + '</div>';
        }
        const old = document.getElementById('baja-aso-ot-summary'); if (old && old.parentNode) old.parentNode.removeChild(old);
        const panel = document.createElement('div');
        panel.id = 'baja-aso-ot-summary';
        panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:82vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
        panel.innerHTML = '<div style="font:700 16px Arial;margin-bottom:8px;">Off-targets — ' + esc(nm) + '</div>' + body + '<div style="display:flex;justify-content:flex-end;margin-top:16px;"><button id="aso-ot-close" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Close</button></div>';
        document.body.appendChild(panel);
        const cb = panel.querySelector('#aso-ot-close'); if (cb) cb.onclick = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
        try {
            panel.querySelectorAll('.aso-ot-map').forEach((btn) => {
                btn.onclick = () => {
                    const h = hits[+btn.getAttribute('data-hi')];
                    try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
                    try { exec('baja/manchester/menu/map-compound-to-offtarget.js', graph, oligo, h, __edd); }
                    catch (e) { try { graph.setMessage(' Map failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                };
            });
            panel.querySelectorAll('.aso-ot-gene').forEach((btn) => {
                btn.onclick = () => {
                    const gene = btn.getAttribute('data-gene');
                    try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
                    try { exec('baja/manchester/menu/map-compound-to-offtarget.js', graph, oligo, { symbol: gene }, __edd); }
                    catch (e) { try { graph.setMessage(' Map failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                };
            });
        } catch (e) { }
    } catch (e) { try { graph.setMessage(' Off-target mapper failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }

    return graph;
}

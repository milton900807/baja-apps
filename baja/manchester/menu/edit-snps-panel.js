function (graph, genegraph_panel_layout, selectedTrack) {
    // Filter/manage the SNPs on a track by attribute (type, source, clinical significance,
    // consequence, allele frequency, free-text). Filtering is non-destructive — it toggles
    // each SNP's `hidden` flag (getVisibleSNPs skips hidden ones) — plus a Remove-hidden
    // action to delete the filtered-out set, and Reset to show them all again.
    return new Promise(async (resolve) => {
        const snps = (selectedTrack && selectedTrack.snpindels) || [];
        if (!snps.length) {
            graph.setMessage(' This track has no SNPs to edit. ');
            resolve(null); return;
        }

        const readAf = (s) => {
            if (s.af != null && isFinite(s.af)) return +s.af;
            const m = ('' + (s.quality || '')).match(/AF=([0-9.eE+-]+)/);
            return m ? parseFloat(m[1]) : null;
        };

        // Attribute tallies for the header, so the user can see what's there to filter on.
        const tally = (fn) => { const m = {}; for (const s of snps) { const k = fn(s); if (k == null || k === '') continue; m[k] = (m[k] || 0) + 1; } return m; };
        const CLIN_CATS = ['pathogenic', 'likely pathogenic', 'benign', 'likely benign', 'uncertain', 'conflicting', 'risk', 'drug response', 'protective'];
        const clinTally = {};
        for (const s of snps) { const c = ('' + (s.clinsig || '')).toLowerCase(); if (!c) continue; for (const cat of CLIN_CATS) if (c.indexOf(cat) >= 0) clinTally[cat] = (clinTally[cat] || 0) + 1; }
        const fmtT = (t) => Object.keys(t).sort((a, b) => t[b] - t[a]).map((k) => k + ' (' + t[k] + ')').join(', ') || '—';
        const typeT = fmtT(tally((s) => s.type));
        const srcT = fmtT(tally((s) => s.source));
        const consT = fmtT(tally((s) => s.structure || s.consequence));
        const clinT = fmtT(clinTally);

        let vSearch, vType, vClin, vSource, vMinAf;
        const val = (b) => { try { return (b && b.getWidgetValue ? b.getWidgetValue() : (b && b.value) || '') + ''; } catch (e) { return ''; } };

        const applyFilter = () => {
            const q = val(vSearch).trim().toLowerCase();
            const t = val(vType).trim().toLowerCase();
            const cl = val(vClin).trim().toLowerCase();
            const src = val(vSource).trim().toLowerCase();
            const minAf = parseFloat(val(vMinAf).trim());
            let shown = 0;
            for (const s of snps) {
                let ok = true;
                if (q) {
                    const hay = [s.name, s.id, s.clinsig, s.structure, s.consequence, s.reference, s.alternate, s.source].join(' ').toLowerCase();
                    if (hay.indexOf(q) < 0) ok = false;
                }
                if (ok && t && t !== 'all') { if (('' + s.type).toLowerCase() !== t) ok = false; }
                if (ok && cl) { if (('' + (s.clinsig || '')).toLowerCase().indexOf(cl) < 0) ok = false; }
                if (ok && src) { if (('' + (s.source || '')).toLowerCase().indexOf(src) < 0) ok = false; }
                if (ok && !isNaN(minAf)) { const af = readAf(s); if (af == null || af < minAf) ok = false; }
                s.hidden = !ok;
                if (ok) shown++;
            }
            selectedTrack.showSnpIndels = true;
            if (graph.wake) graph.wake();
            graph.setMessage(' Showing ' + shown + ' of ' + snps.length + ' SNPs. ');
        };
        const resetFilter = () => {
            for (const s of snps) s.hidden = false;
            if (graph.wake) graph.wake();
            graph.setMessage(' Filter cleared — showing all ' + snps.length + ' SNPs. ');
        };
        const removeHidden = () => {
            const before = selectedTrack.snpindels.length;
            selectedTrack.snpindels = selectedTrack.snpindels.filter((s) => !s.hidden);
            const removed = before - selectedTrack.snpindels.length;
            if (graph.wake) graph.wake();
            graph.setMessage(' Removed ' + removed + ' hidden SNP' + (removed === 1 ? '' : 's') + '; ' + selectedTrack.snpindels.length + ' remain. ');
        };
        const closePanel = () => { try { CurrentLayout.clearComponent('buttonMenuPanel|labelPanel'); } catch (e) { } resolve(null); };

        const field = (title, hint, hook) => ({
            'title': title, 'width': '100%',
            'component': { wid: 'input-textfield', data: { 'show-button': false, 'title': hint, 'text': '', 'ionHookFunction': createIonFunction(hook) } }
        });

        const panel = {
            wid: 'card',
            componentRef: 'buttonMenuPanel',
            data: {
                height: 'auto',
                card_padding: '16px',
                padding: '8px',
                cards: [[
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: `
                            <style>
                              .snpf-h { background:linear-gradient(120deg,#0c7c86 0%,#12a3ad 60%,#5b6b82 130%); color:#fff; border-radius:12px; padding:12px 16px; box-shadow:0 3px 10px rgba(8,77,84,.25); }
                              .snpf-h .t { font-size:15px; font-weight:700; }
                              .snpf-h .r { font-size:12px; opacity:.95; margin-top:4px; line-height:1.55; }
                              .snpf-h b { color:#ffe6c2; }
                            </style>
                            <div class="snpf-h">
                              <div class="t">🧬 Edit SNPs — <b>${snps.length}</b> on ${(selectedTrack.name || 'track')}</div>
                              <div class="r">
                                Type: ${typeT}<br>
                                Source: ${srcT}<br>
                                Clinical significance: ${clinT}<br>
                                Consequence: ${consT}
                              </div>
                            </div>`
                        }
                    },
                    field('Search', 'name / id / clinsig / consequence / allele', (b) => { vSearch = b; }),
                    field('Type', 'snp / ins / del (blank = all)', (b) => { vType = b; }),
                    field('Clinical significance contains', 'e.g. pathogenic', (b) => { vClin = b; }),
                    field('Source contains', 'e.g. dbSNP / ClinVar / gnomAD / COSMIC', (b) => { vSource = b; }),
                    field('Min allele frequency (AF)', 'e.g. 0.01', (b) => { vMinAf = b; }),
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    { label: 'Apply filter', ionFunction: createIonFunction(applyFilter) },
                                    { label: 'Reset', ionFunction: createIonFunction(resetFilter) },
                                    { label: 'Remove hidden', ionFunction: createIonFunction(removeHidden) },
                                    { label: 'Close', ionFunction: createIonFunction(closePanel) },
                                ]
                            }
                        }
                    }
                ]]
            }
        };

        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
        CurrentLayout.setComponent('buttonMenuPanel', panel);
    });
}

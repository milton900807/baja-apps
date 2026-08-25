function (graph, genegraph_panel_layout, track) {
    // Export features that live on a track, offered as a SIDE MENU:
    //   • BED file representing the track (one BED6 line per exon)
    //   • oligos as sequences (FASTA), as HELM, or as IDT coupling code
    //   • primers as CSV (opens in Excel) with forward / reverse in separate columns
    // Amplicons (primer sets) live in track.oligos as Amplicon objects (left+right
    // primers); plain oligos are everything else.
    return new Promise(async (resolve) => {

        const sel = track || (graph && graph.getSelectedTrack && graph.getSelectedTrack());
        if (!sel) {
            // No track chosen — prompt to click one, then re-enter with it.
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.setMouseMode('msg: Click on a track to export its features.');
            graph.setMessage(' Click on a track to export its features. ');
            graph.addMouseDownListener((x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const picked = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                exec('baja/manchester/menu/track-export-menu.js', graph, genegraph_panel_layout, picked);
            });
            resolve(); return;
        }

        // ---- client-side text download ----
        const download = (filename, text, mime) => {
            try {
                const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) { } }, 1500);
                graph.setMessage(' Exported ' + filename + ' ');
            } catch (e) {
                graph.setMessage(' Export failed: ' + e + ' ');
            }
        };

        const safeName = (('' + (sel.name || 'track')).replace(/[^A-Za-z0-9._-]+/g, '_')) || 'track';

        const isAmp = (o) => !!(o && (o.type === 'amplicon' || (o.left && o.right)));
        const plainOligos = () => (sel.oligos || []).filter((o) => o && !isAmp(o));
        const amplicons = () => (sel.oligos || []).filter((o) => isAmp(o));

        const restoreHover = () => {
            try { graph.showSideMenu(null); } catch (e) { }
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            // A read-only (viewer) screen must never arm the editing mouse-over-highlight
            // (which exposes edit/delete/design menus) — navigation only.
            if (graph.readonly) return;
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // ---- BED (one BED6 line per exon; falls back to a single track span) ----
        const exportBED = () => {
            const chrom = sel.chr != null && sel.chr !== '' ? ('' + sel.chr) : safeName;
            const strand = (sel.strand != null && sel.strand < 0) ? '-' : '+';
            let exons = [];
            try { exons = (sel.getExons && sel.getExons()) || []; } catch (e) { exons = []; }

            // A spliced child (cDNA / mRNA) track renders in LOCAL coordinates with
            // introns removed, so its exon xi/xf are not genomic. Lift each endpoint to
            // genomic via genomicAt() (linear within an exon, so both endpoints map
            // correctly) before writing the BED. Genomic tracks pass through unchanged.
            let liftOver = false;
            try { liftOver = !!(sel.isChildCDNATrack && sel.isChildCDNATrack() && sel.genomicAt); } catch (e) { liftOver = false; }
            const toGenomic = (v) => {
                if (!liftOver) return +v;
                try { const g = sel.genomicAt(+v); return (g == null ? +v : +g); } catch (e) { return +v; }
            };

            const lines = [];
            const push = (s, e) => {
                const a = Math.min(toGenomic(s), toGenomic(e)), b = Math.max(toGenomic(s), toGenomic(e));
                if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
                    lines.push([chrom, Math.floor(a), Math.ceil(b), safeName, 0, strand].join('\t'));
                }
            };
            if (exons.length) { for (const ex of exons) push(ex.xi, ex.xf); }
            else push(sel.xi, sel.xf);
            if (!lines.length) { graph.setMessage(' Track has no exportable coordinates. '); return; }
            download(safeName + '.bed', lines.join('\n') + '\n', 'text/plain');
            if (liftOver) graph.setMessage(' Exported ' + safeName + '.bed (cDNA exons lifted to genomic coordinates). ');
        };

        // ---- oligos as FASTA ----
        const exportOligoFasta = () => {
            const ol = plainOligos();
            if (!ol.length) { graph.setMessage(' No oligos on this track. '); return; }
            const out = ol.map((o, i) => {
                const nm = ('' + (o.name || ('oligo_' + (i + 1)))).replace(/\s+/g, '_');
                const seq = o.synthesisSequence || o.sequence || '';
                return '>' + nm + '\n' + seq;
            }).join('\n');
            download(safeName + '_oligos.fasta', out + '\n', 'text/plain');
        };

        // ---- oligos as IDT coupling code (HELM -> IDT) ----
        const exportOligoIDT = async () => {
            const ol = plainOligos();
            if (!ol.length) { graph.setMessage(' No oligos on this track. '); return; }
            let Helm = null;
            try { Helm = await exec('baja/chem/helm.js'); } catch (e) { }
            // convertHELMtoIDT returns an ARRAY of { chainID, idt } (one per HELM chain) —
            // flatten to the IDT strings (joined with ' + ' for multi-strand oligos).
            const toIDT = (helm) => {
                if (!helm || !Helm || !Helm.convertHELMtoIDT) return '';
                try {
                    const res = Helm.convertHELMtoIDT(helm);
                    if (typeof res === 'string') return res;
                    if (Array.isArray(res)) {
                        return res.map((c) => (c && c.idt != null) ? c.idt : (typeof c === 'string' ? c : '')).filter(Boolean).join(' + ');
                    }
                    if (res && typeof res === 'object' && res.idt != null) return res.idt;
                } catch (e) { }
                return '';
            };
            const rows = ['name\tIDT'];
            ol.forEach((o, i) => {
                const nm = ('' + (o.name || ('oligo_' + (i + 1)))).replace(/\s+/g, '_');
                let idt = toIDT(o.structure || o.helm);
                if (!idt) idt = o.synthesisSequence || o.sequence || '';
                rows.push(nm + '\t' + idt);
            });
            download(safeName + '_oligos_idt.tsv', rows.join('\n') + '\n', 'text/tab-separated-values');
        };

        // ---- primers as CSV (Excel), forward/reverse in separate columns ----
        const exportPrimersCSV = () => {
            const amps = amplicons();
            if (!amps.length) { graph.setMessage(' No primers/amplicons on this track. '); return; }
            const csvCell = (v) => {
                const s = (v == null ? '' : '' + v);
                return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const seqOf = (p) => (p ? (p.sequence || p.synthesisSequence || '') : '');
            const header = ['Name', 'Forward primer', 'Reverse primer', 'Probe', 'Fwd Tm', 'Rev Tm', 'Amplicon start', 'Amplicon end', 'Amplicon size'];
            const rows = [header.map(csvCell).join(',')];
            amps.forEach((a, i) => {
                const nm = a.name || ('amplicon_' + (i + 1));
                const fwd = seqOf(a.left);
                const rev = seqOf(a.right);
                const probe = seqOf(a.mid);
                const fTm = (a.left && a.left.tm != null) ? a.left.tm : '';
                const rTm = (a.right && a.right.tm != null) ? a.right.tm : '';
                const s = Number.isFinite(a.xi) ? a.xi : (a.left && a.left.xi);
                const e = (a.right && Number.isFinite(a.right.xf)) ? a.right.xf : a.xf;
                const size = (Number.isFinite(s) && Number.isFinite(e)) ? Math.abs(e - s) : (a.size || '');
                rows.push([nm, fwd, rev, probe, fTm, rTm, s, e, size].map(csvCell).join(','));
            });
            download(safeName + '_primers.csv', rows.join('\n') + '\n', 'text/csv');
        };

        const showMenu = () => {
            const nOl = plainOligos().length;
            const nAmp = amplicons().length;
            const items = [
                { label: 'Export BED (track exons)', move: () => { }, click: () => { exportBED(); } },
                { label: 'Export oligos — sequences (FASTA)' + (nOl ? ' (' + nOl + ')' : ''), move: () => { }, click: () => { exportOligoFasta(); } },
                { label: 'Export oligos — IDT code' + (nOl ? ' (' + nOl + ')' : ''), move: () => { }, click: () => { exportOligoIDT(); } },
                { label: 'Export primers — Excel (CSV)' + (nAmp ? ' (' + nAmp + ')' : ''), move: () => { }, click: () => { exportPrimersCSV(); } },
                { label: 'Close', move: () => { }, click: () => { restoreHover(); } },
            ];
            graph.setMessage(' Export from ' + (sel.name || 'track') + ' ');
            graph.showSideMenu(items);
        };

        showMenu();
        resolve();
    });
}

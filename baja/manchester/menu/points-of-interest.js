function (graph, genegraph_panel_layout, presetTrack, significance) {
    // Points-of-interest: load ClinVar variants (filtered by clinical significance) for the
    // selected track. The track's genomic region comes from its Ensembl id (the track was loaded
    // from it, so it already carries chr + coordinates); if that isn't available, the track's
    // metadata (name / description / species) is used to Claude-search the correct gene and
    // resolve its region. ClinVar is read from the reference VCF (read-vcf-variants.py), filtered
    // to pathogenic / likely-pathogenic, and each variant is dropped as a SnpIndel with its
    // clinical significance + disease in the annotation — then a Go-to / Tour side menu appears.
    return (async () => {
        const SnpIndel = await exec('flexigraph/snpindel.js');
        const server = window['env']['apiUrl'];

        // Resolve the target track: a caller-supplied track, else the selected one, else a single
        // loaded track.
        let t = (presetTrack && presetTrack.tgraph) ? presetTrack : null;
        try { if (!t) { const sel = (graph.getSelectedTracks && graph.getSelectedTracks()) || []; t = sel[0] || null; } } catch (e) { }
        if (!t) { try { t = graph.selectedTrack || (graph.tracks && graph.tracks.length === 1 ? graph.tracks[0] : null); } catch (e) { } }
        if (!t) { graph.setMessage(' Select a track first, then choose Variants. '); return; }

        // Clinical-significance filter (from the Variants menu) + a display label.
        const sig = ('' + (significance || 'pathogenic')).toLowerCase();
        const sigLabel = (sig === 'likely_pathogenic' || sig === 'likely-pathogenic') ? 'likely pathogenic'
            : (sig === 'likely_benign' || sig === 'likely-benign') ? 'likely benign'
                : (sig === 'benign' || sig === 'non-pathogenic' || sig === 'nonpathogenic') ? 'benign / likely-benign'
                    : (sig === 'uncertain' || sig === 'conflicting') ? 'uncertain / conflicting'
                        : sig === 'all' ? 'ClinVar' : 'pathogenic / likely-pathogenic';
        // Per-variant color by ClinVar significance (red pathogenic, green benign, amber uncertain).
        const colorForClinsig = (cs) => {
            const s = ('' + ((cs || []).join(' '))).toLowerCase();
            if (/pathogenic/.test(s) && !/conflicting|benign/.test(s)) return '#dc2626';
            if (/benign/.test(s) && !/pathogenic/.test(s)) return '#16a34a';
            if (/uncertain|conflicting/.test(s)) return '#e0a400';
            return '#dc2626';
        };

        // Species: explicit field, else derive from the Ensembl id prefix.
        let species = ('' + (t.species || '')).toLowerCase();
        if (!species) {
            const id = ('' + (t.transcriptID || t.name || '')).toUpperCase();
            if (/^ENSMUST/.test(id)) species = 'mouse';
            else if (/^ENSRNOT/.test(id)) species = 'rat';
            else if (/^ENSCAFT/.test(id)) species = 'dog';
            else species = 'human';
        }

        // ---- 1) Genomic region for the track ------------------------------------------------
        let chr = ('' + (t.chr || '')).replace(/^chr/, '');
        let gStart = null, gEnd = null;
        try {
            const tg = t.tgraph;
            const isChild = !!(t.isChildCDNATrack && t.isChildCDNATrack());
            if (isChild && t.gxi != null && t.gxf != null) { gStart = Math.min(t.gxi, t.gxf); gEnd = Math.max(t.gxi, t.gxf); }
            else if (tg && tg.xmin != null && tg.xmax != null) { gStart = Math.min(tg.xmin, tg.xmax); gEnd = Math.max(tg.xmin, tg.xmax); }
            else if (t.xi != null && t.xf != null) { gStart = Math.min(t.xi, t.xf); gEnd = Math.max(t.xi, t.xf); }
            if (gStart != null) { gStart = Math.floor(gStart); gEnd = Math.ceil(gEnd); }
        } catch (e) { }

        // No usable region from the track's Ensembl id -> resolve it (Ensembl id, else Claude).
        if (!(chr && gEnd != null && gEnd > gStart)) {
            graph.setMessage(' Resolving the gene for ' + (t.name || 'this track') + '… ');
            try {
                const em = new EngineMonitor(() => { });
                const eid = '' + (t.transcriptID || t.geneID || t.id || '');
                const rr = await exec('/py/sequence/track-to-region.py', em, eid, ('' + (t.name || '')), ('' + (t.description || '')), species);
                if (rr && rr.chr && rr.start && rr.end) { chr = ('' + rr.chr).replace(/^chr/, ''); gStart = Math.floor(+rr.start); gEnd = Math.ceil(+rr.end); }
            } catch (e) { }
        }
        if (!(chr && gEnd != null && gEnd > gStart)) {
            graph.setMessage(' Could not determine a genomic region for ' + (t.name || 'this track') + '. ');
            return;
        }

        // ---- 2) ClinVar over the region -----------------------------------------------------
        graph.setMessage(' Loading ' + sigLabel + ' ClinVar variants for ' + (t.name || 'the track') + '… ');
        let list = [];
        try {
            const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            const r = await exec(server + '/py/bio/read-vcf-variants.py', em, 'clinvar', '' + chr, '' + gStart, '' + gEnd, 'clinvar');
            try { list = JSON.parse(r.variants); } catch (e) { list = []; }
        } catch (e) { graph.setMessage(' ClinVar lookup failed: ' + (e && e.message ? e.message : e)); return; }

        // ---- 3) Keep only PATHOGENIC / LIKELY-PATHOGENIC ------------------------------------
        // Filter by clinical significance (the menu picks pathogenic / non-pathogenic / uncertain
        // / all). "risk_factor"/"drug_response" don't disqualify a pathogenic call.
        const passesFilter = (cs) => {
            const s = ('' + ((cs || []).join(' '))).toLowerCase();
            if (sig === 'all') return true;
            if (sig === 'likely_pathogenic' || sig === 'likely-pathogenic')
                return /likely[ _-]?pathogenic/.test(s) && !/conflicting|benign|uncertain/.test(s);
            if (sig === 'likely_benign' || sig === 'likely-benign')
                return /likely[ _-]?benign/.test(s) && !/pathogenic|conflicting/.test(s);
            if (sig === 'benign' || sig === 'non-pathogenic' || sig === 'nonpathogenic')
                return /benign/.test(s) && !/pathogenic|conflicting/.test(s);
            if (sig === 'uncertain' || sig === 'conflicting')
                return /uncertain|conflicting/.test(s);
            // default: pathogenic / likely-pathogenic
            return /pathogenic/.test(s) && !/conflicting|benign|uncertain|not provided|not specified/.test(s);
        };
        const patho = (list || []).filter((v) => v && v.start != null && passesFilter(v.clinsig));
        if (!patho.length) {
            graph.setMessage(' No ' + sigLabel + ' ClinVar variants found for ' + (t.name || 'this track') + '. ');
            return;
        }

        // ---- 4) Place each as a SnpIndel, clinical significance + disease in the annotation --
        const RED = '#dc2626';
        const MAX_ALLELE = 50;
        const mapped = [];
        for (const v of patho) {
            try {
                if (v.chr && ('' + v.chr).replace(/^chr/, '') !== chr) continue;
                let ref = ('' + (v.ref || 'N')).toUpperCase();
                let alt = ('' + (v.alt || 'N')).toUpperCase();
                if (ref.length > MAX_ALLELE || alt.length > MAX_ALLELE) continue;   // structural
                if (!/^[ACGTN]+$/.test(ref)) ref = 'N';
                if (!/^[ACGTN]+$/.test(alt)) alt = 'N';
                let type = 'snp';
                if (alt.length > ref.length) type = 'ins';
                else if (ref.length > alt.length) type = 'del';
                const wx = t.variantWorldX ? t.variantWorldX(v.chr || chr, Math.floor(+v.start)) : null;
                if (wx == null) continue;
                let placeXi = wx;
                if (type === 'del' && t.strand !== -1) placeXi = wx + 1;

                const dupe = (t.snpindels || []).find((x) => x && Math.round(x.xi) === Math.round(placeXi)
                    && ('' + (x.reference || '')).toUpperCase() === ref);
                let snp = dupe;
                if (!snp) {
                    const _vcol = colorForClinsig(v.clinsig);
                    snp = new SnpIndel(type, placeXi, ref, alt, 0, t.strand, (v.id || 'ClinVar'), null, _vcol);
                    try { snp.color = _vcol; } catch (e) { }
                    t.addsnpindel(snp);
                }
                const cs = (v.clinsig || []).join(', ');
                const dis = (v.disease && !/^not (provided|specified)$/i.test('' + v.disease)) ? ('' + v.disease) : '';
                const ann = [cs, dis].filter(Boolean).join(' — ');
                try { snp.name = v.id || 'variant'; } catch (e) { }
                try { if (cs) snp.clinsig = cs; } catch (e) { }
                try { if (ann) { snp.annotation = ann; snp.showAnnotation = true; } } catch (e) { }
                try { snp.comment = ann; } catch (e) { }
                try { snp.source = 'ClinVar'; snp.highlight = true; } catch (e) { }
                mapped.push({ snp: snp, label: (t.name || '') + (t.name ? ' — ' : '') + (snp.name || 'variant') + (cs ? ' (' + cs + ')' : '') });
            } catch (e) { }
        }
        t.showSnpIndels = true;
        try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const _showResult = (m) => { try { (graph.setResultMessage ? graph.setResultMessage : graph.setMessage).call(graph, m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
        _showResult(' Added ' + mapped.length + ' ' + sigLabel + ' ClinVar variant' + (mapped.length === 1 ? '' : 's') + ' to ' + (t.name || 'the track') + '. ');
        if (!mapped.length) return;

        // ---- 5) Go-to / Tour side menu (same as the file-load flow) -------------------------
        const goToLocus = async (a, b) => {
            try {
                const g = graph.graph; const tg = t && t.tgraph;
                if (!g || !tg || !tg.X) return;
                if (g.rescale) g.rescale();
                const gi = tg.X(a), gf = tg.X(b), wx = 5;
                const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2;
                const span = Math.abs(tg.height || 0) || 0.1;
                const topExt = span * 3.6, botExt = span * 2.2;
                if (graph.zoomRect) await graph.zoomRect(gi - wx, gf + wx, cy + topExt, cy - botExt, 500);
                else { g.setxmin(gi - wx); g.setxmax(gf + wx); g.setymin(cy + topExt); g.setymax(cy - botExt); }
                if (graph.wake) graph.wake();
            } catch (e) { }
        };
        const zoomTo = async (m) => { try { if (m && m.snp && m.snp.xi != null) { const w = 30; try { await exec('baja/manchester/menu/focus-mutation.js', graph, m.snp, 10000); } catch (e) { } await goToLocus(m.snp.xi - w, m.snp.xi + w); } } catch (e) { } };

        const runTour = () => {
            let i = 0, cancelled = false, timer = null;
            const clearT = () => { if (timer) { clearTimeout(timer); timer = null; } };
            const finish = () => { cancelled = true; clearT(); try { graph.showSideMenu(null); } catch (e) { } };
            const go = async () => {
                clearT();
                if (cancelled) return;
                if (i < 0) i = 0;
                if (i >= mapped.length) { finish(); return; }
                const m = mapped[i];
                try { await zoomTo(m); } catch (e) { }
                if (cancelled) return;
                const menu = [
                    { label: 'Tour  ' + (i + 1) + ' / ' + mapped.length + ':  ' + (m.label || ''), move: () => { }, click: () => { clearT(); go(); } },
                    { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                    { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                    { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                ];
                try { graph.showSideMenu(menu); } catch (e) { }
                timer = setTimeout(() => { i++; go(); }, 10000);
            };
            go();
        };
        const buildMenu = () => {
            const gotoItems = mapped.map((m) => ({ label: m.label, move: () => { }, click: () => { zoomTo(m); } }));
            return [
                { label: 'Go to  ▸', move: () => { }, click: () => { try { graph.showSideMenu(gotoItems); } catch (e) { } } },
                { label: 'Tour…', move: () => { }, click: () => { runTour(); } },
            ];
        };
        if (graph.showSideMenu) { try { graph.showSideMenu(buildMenu()); if (graph.wake) graph.wake(); } catch (e) { } }
    })();
}

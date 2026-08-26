function (graph, genegraph_panel_layout) {
    // Points-of-interest (mutation mode): take the selected track's gene symbol + species,
    // ask Claude for important known mutations/variants that carry a database id (rsID /
    // ClinVar / COSMIC / HGVS) from which a genomic location can be derived, then draw a
    // labelled annotation at each variant's location with a note on why it matters.
    return (async () => {
        // Resolve the target track: the selected one, else the single loaded track.
        let t = null;
        try {
            const sel = (graph.getSelectedTracks && graph.getSelectedTracks()) || [];
            t = sel[0] || null;
        } catch (e) { }
        if (!t) { try { t = graph.selectedTrack || (graph.tracks && graph.tracks.length === 1 ? graph.tracks[0] : null); } catch (e) { } }
        if (!t) { graph.setMessage(' Select a track first, then choose Points-of-interest. '); return; }

        const gene = '' + (t.geneName || t.gene || t.name || t.transcriptID || '');

        // Species: prefer an explicit field, else derive from the Ensembl id prefix.
        let species = '' + (t.species || '');
        if (!species) {
            const id = ('' + (t.transcriptID || t.name || '')).toUpperCase();
            if (/^ENSMUST/.test(id)) species = 'mouse';
            else if (/^ENSRNOT/.test(id)) species = 'rat';
            else if (/^ENSCAFT/.test(id)) species = 'dog';
            else if (/^ENST/.test(id)) species = 'human';
            else species = 'human';
        }

        // Assembly/coordinate context (NOT a constraint — just to keep coords comparable).
        const xi = Math.floor(Math.min(t.xi, t.xf));
        const xf = Math.floor(Math.max(t.xi, t.xf));
        let chr = '';
        try {
            chr = '' + (t.chr || t.chromosome ||
                (t.annotations && t.annotations[0] && (t.annotations[0].chr || t.annotations[0].chromosome)) || '');
        } catch (e) { }

        graph.setMessage(' Finding important mutations for ' + (gene || 'this gene') + ' with Claude… ');
        let em = new EngineMonitor((m) => { });
        let res = null;
        try {
            res = await exec('/py/sequence/points-of-interest.py', em, gene, species, chr,
                '' + (isFinite(xi) ? xi : 0), '' + (isFinite(xf) ? xf : 0));
        } catch (e) { graph.setMessage(' Points-of-interest failed: ' + (e && e.message ? e.message : e)); return; }

        const pts = (res && res.points) || [];
        if (!pts.length) {
            graph.setMessage(' No identifiable mutations found' + (res && res.error ? ' (' + res.error + ')' : '') + '. ');
            return;
        }

        const colors = ['rgba(220,38,38,0.9)', 'rgba(255,140,26,0.85)', 'rgba(156,51,80,0.85)',
            'rgba(18,163,173,0.85)', 'rgba(120,80,200,0.85)', 'rgba(10,120,200,0.85)'];
        let n = 0;
        for (const p of pts) {
            try {
                // Claude returns 1-based genomic coordinates; place at that location.
                let gi = Math.floor(+p.start);
                let gf = Math.floor(+p.end);
                if (!isFinite(gi) || gi <= 0) continue;
                if (!isFinite(gf) || gf <= gi) gf = gi + 1;
                const label = p.title || p.id || 'Mutation';
                const an = new Annotation('PointOfInterest', label, gi, gf, t.strand);
                an.color = colors[n % colors.length];
                an.variantId = p.id || '';
                an.resolved = !!p.resolved;   // true = exact Ensembl coordinate
                let note = (p.id ? (p.id + ' — ') : '') + (p.comment || '');
                if (!p.resolved) note += ' (position estimated)';
                an.description = note;
                an.comment = note;
                an.labelY = 0.45 + (n % 3) * 0.18;   // stagger labels so they don't collide
                t.add(an);
                n++;
            } catch (e) { }
        }
        try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        const resolved = (res && res.resolved) || 0;
        graph.setMessage(' Added ' + n + ' mutation(s) of interest to ' + (t.name || 'the track')
            + ' — ' + resolved + ' at exact Ensembl positions'
            + (n - resolved > 0 ? ', ' + (n - resolved) + ' estimated' : '') + '. ');
    })();
}

function (graph, genegraph_panel_layout) {
    // Points-of-interest: take the selected track's gene name + genomic range [xi,xf],
    // ask Claude to return the important genomic features/annotations that fall within
    // that range (as genomic coordinates), and draw rectangle+comment annotations that
    // highlight those regions with commentary on why they matter.
    return (async () => {
        // Resolve the target track: the selected one, else the single loaded track.
        let t = null;
        try {
            const sel = (graph.getSelectedTracks && graph.getSelectedTracks()) || [];
            t = sel[0] || null;
        } catch (e) { }
        if (!t) { try { t = graph.selectedTrack || (graph.tracks && graph.tracks.length === 1 ? graph.tracks[0] : null); } catch (e) { } }
        if (!t) { graph.setMessage(' Select a track first, then choose Points-of-interest. '); return; }

        // Genomic range of the track (annotations/tracks are indexed in genomic coords).
        const xi = Math.floor(Math.min(t.xi, t.xf));
        const xf = Math.floor(Math.max(t.xi, t.xf));
        if (!(xf > xi) || !isFinite(xi) || !isFinite(xf)) {
            graph.setMessage(' That track has no genomic range to analyze. '); return;
        }
        const gene = '' + (t.transcriptID || t.name || '');
        // Best-effort chromosome for the prompt (from the track or its annotations).
        let chr = '';
        try {
            chr = '' + (t.chr || t.chromosome ||
                (t.annotations && t.annotations[0] && (t.annotations[0].chr || t.annotations[0].chromosome)) || '');
        } catch (e) { }

        graph.setMessage(' Finding points of interest with Claude… ');
        let em = new EngineMonitor((m) => { });
        let res = null;
        try {
            // Prompt Claude with the gene + genomic range; it returns genomic coordinates.
            res = await exec('/py/sequence/points-of-interest.py', em, gene, '' + xi, '' + xf, chr);
        } catch (e) { graph.setMessage(' Points-of-interest failed: ' + (e && e.message ? e.message : e)); return; }

        const pts = (res && res.points) || [];
        if (!pts.length) {
            graph.setMessage(' No points of interest found' + (res && res.error ? ' (' + res.error + ')' : '') + '. ');
            return;
        }

        const colors = ['rgba(255,140,26,0.85)', 'rgba(18,163,173,0.85)', 'rgba(156,51,80,0.85)',
            'rgba(46,158,68,0.85)', 'rgba(120,80,200,0.85)', 'rgba(10,120,200,0.85)'];
        let n = 0;
        for (const p of pts) {
            try {
                // Claude returns genomic coordinates already — clamp into the track range.
                const gi = Math.max(xi, Math.floor(+p.start));
                const gf = Math.min(xf, Math.max(gi + 1, Math.floor(+p.end)));
                const an = new Annotation('PointOfInterest', p.title || 'Point of interest', gi, gf, t.strand);
                an.color = colors[n % colors.length];
                an.description = p.comment || '';
                an.comment = p.comment || '';
                an.labelY = 0.45 + (n % 3) * 0.18;   // stagger labels so they don't collide
                t.add(an);
                n++;
            } catch (e) { }
        }
        try { if (t.fitYAxis) t.fitYAxis(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        graph.setMessage(' Added ' + n + ' point(s) of interest to ' + (t.name || 'the track') + '. ');
    })();
}

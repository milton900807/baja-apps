function (graph, genegraph_panel_layout) {
    // Points-of-interest: take the selected track (sequence + annotations), ask Claude
    // to find biologically interesting regions, and draw rectangle+comment annotations
    // that highlight those regions with commentary on why they matter.
    return (async () => {
        // Resolve the target track: the selected one, else the single loaded track.
        let t = null;
        try {
            const sel = (graph.getSelectedTracks && graph.getSelectedTracks()) || [];
            t = sel[0] || null;
        } catch (e) { }
        if (!t) { try { t = graph.selectedTrack || (graph.tracks && graph.tracks.length === 1 ? graph.tracks[0] : null); } catch (e) { } }
        if (!t) { graph.setMessage(' Select a track first, then choose Points-of-interest. '); return; }

        const seq = '' + (t.sequence || '');
        if (seq.length < 10) { graph.setMessage(' That track has no sequence to analyze. '); return; }

        // Compact annotations for context (type + name + local coords).
        let anns = [];
        try {
            anns = (t.annotations || []).map(a => ({
                type: a.type, name: a.name,
                start: Math.floor(Math.min(a.xi, a.xf) - t.xi),
                end: Math.floor(Math.max(a.xi, a.xf) - t.xi)
            }));
        } catch (e) { }

        graph.setMessage(' Finding points of interest with Claude… ');
        let em = new EngineMonitor((m) => { });
        let res = null;
        try {
            res = await exec('/py/sequence/points-of-interest.py', em, seq, JSON.stringify(anns),
                '' + (t.transcriptID || t.name || ''));
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
                const gi = t.xi + Math.max(0, +p.start);
                const gf = t.xi + Math.max(+p.start + 1, +p.end);
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

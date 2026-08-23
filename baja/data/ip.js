function (graph, genegraph_panel_layout) {
    // IP — click a track, read the IP hits from patent_hg38_transcript_hits.bed.gz
    // in BIG_DATA over the track, and drop them in as an interval layer. The BED is
    // keyed by transcript id with transcript-relative coords, so hits are mapped to
    // genomic x through the track's exons (split at intron boundaries). No file
    // browser. Overlapping hits are stacked into lanes so they stay legible.
    const BED = '/bd/patent_hg38_transcript_hits.bed.gz';

    const restoreHover = () => {
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    graph.clearMouseListeners();
    graph.setMouseMode('msg: Click on a track to load IP data.');
    CurrentLayout.clearComponent('mainPanel');
    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    graph.addMouseDownListener(async (x, y) => {
        const ti = graph.getTrack(x, y);
        if (ti < 0) return;
        const track = graph.track[ti];
        graph.clearMouseListeners();
        graph.setMouseMode('navigate');
        try {
            // Query by this track's transcript, in transcript (sequence-index) space.
            const tid = track.transcriptID || track.geneID || track.name || '';
            if (!tid) {
                graph.setMessage(' That track has no transcript id for IP lookup. ');
                restoreHover(); return;
            }
            const seqLen = (track.sequence && track.sequence.length) || Math.abs(track.xf - track.xi);
            let t0 = 0, t1 = seqLen;
            if (track.markstart > 0 && track.markend > track.markstart) {
                t0 = Math.max(0, track.markstart - track.xi);
                t1 = Math.max(t0, track.markend - track.xi);
            }
            const strand = '' + (track.strand != null ? track.strand : 1);

            graph.setMessage(' Loading IP data for ' + tid + '… ');
            const server = window['env']['apiUrl'];
            let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            // Reads the region from BIG_DATA (auto-tabix-indexed on first use).
            const res = await exec(server + '/py/data/read-bed-region.py', em, BED, '' + tid, '' + t0, '' + t1, strand);

            let rv = [];
            try { rv = JSON.parse((res && res.values) || '[]'); } catch (e) { rv = []; }
            if (!rv.length) {
                graph.setMessage(' No IP hits found for ' + tid + '. ');
                restoreHover(); return;
            }

            const TrackLayer = await exec('baja/bio/track-layer.js');
            const tg = track.tgraph;
            const layer = new TrackLayer((track.name || 'track') + '_ip', tg.xmin, 0, tg.xmax, 1);
            layer.data_type = 'IP';
            layer.color = 'rgba(70,130,180,0.55)';
            layer.fillstyle = layer.color;

            // Transcript (cDNA) coordinate -> genomic x through the exons; split each
            // interval at intron boundaries into genomic segments.
            const exons = (track.getExons ? (track.getExons() || []) : []).slice();
            if (track.strand >= 0) exons.sort((a, b) => a.xi - b.xi);
            else exons.sort((a, b) => b.xi - a.xi);
            const hasExons = exons.length > 0;

            const segsFor = (s, e) => {
                if (!hasExons) return [[track.xi + s, track.xi + e]];   // fallback: no exons
                let cum = 0;
                const segs = [];
                for (const ex of exons) {
                    const len = Math.abs(ex.xf - ex.xi);
                    const exStart = cum, exEnd = cum + len;
                    const os = Math.max(s, exStart), oe = Math.min(e, exEnd);
                    if (os < oe) {
                        const o1 = os - exStart, o2 = oe - exStart;
                        const l1 = (track.strand >= 0) ? ex.xi + o1 : ex.xf - o1;
                        const l2 = (track.strand >= 0) ? ex.xi + o2 : ex.xf - o2;
                        segs.push([Math.min(l1, l2), Math.max(l1, l2)]);
                    }
                    cum = exEnd;
                }
                return segs;
            };

            const hits = [];
            for (const v of rv) {
                if (!v) continue;
                const segs = segsFor(+v[0], +v[1]);
                if (!segs.length) continue;
                let lo = Infinity, hi = -Infinity;
                for (const g of segs) { lo = Math.min(lo, g[0]); hi = Math.max(hi, g[1]); }
                const nm = ('' + (v[2] || '')).split('|')[0] || ('' + (v[2] || ''));
                hits.push({ lo: lo, hi: hi, name: nm, segs: segs });
            }
            hits.sort((a, b) => a.lo - b.lo);

            const laneEnd = [];
            const laneFor = (s, e) => {
                for (let i = 0; i < laneEnd.length; i++) {
                    if (s >= laneEnd[i]) { laneEnd[i] = e; return i; }
                }
                laneEnd.push(e);
                return laneEnd.length - 1;
            };
            for (const p of hits) {
                const lane = laneFor(p.lo, p.hi);
                const yv = 0.03125 + (0.03125 * lane);
                for (const g of p.segs) layer.addInterval(g[0], g[1], yv, p.name);
            }
            track.addLayer(layer);

            // Flash the intervals for ~10s so they're easy to spot when zoomed out.
            if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
            setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

            if (graph.wake) graph.wake();
            graph.setMessage(' ' + hits.length + ' IP hit' + (hits.length === 1 ? '' : 's') + ' loaded onto ' + (track.name || 'track') + '. ');
        } catch (e) {
            graph.setMessage(' IP load error: ' + e + ' ');
        }
        restoreHover();
    });
}

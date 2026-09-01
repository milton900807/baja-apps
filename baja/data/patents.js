function (graph, genegraph_panel_layout, tracks) {
    // Patents — click a track, read patent_hg38_transcript_hits.bed.gz from the
    // local BIG_DATA folder over the track's region (view-bed.py resolves the
    // /bd/ path against BIGDATA), and drop the patent hits in as an interval
    // layer. Overlapping patents are stacked into lanes so they stay legible.
    const BED = '/bd/patent_hg38_transcript_hits.bed.gz';

    const restoreHover = () => {
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    CurrentLayout.clearComponent('mainPanel');
    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    // `tracks`, when given, is the explicit set this run applies to -- the same contract the
    // rest of the libraries use. Falling back to for-each-track.js covers the two older
    // routes: the board-level Layers button (which sets __bajaApplyAllTracks) and a plain
    // call from a menu, which still asks for one click.
    const loadOne = async (track) => {
        try {
            // The BED is keyed by transcript id with TRANSCRIPT-relative coords, so
            // query by this track's transcript and in transcript (sequence-index)
            // space — position i maps to local x = track.xi + i.
            const tid = track.transcriptID || track.geneID || track.name || '';
            if (!tid) {
                // Skip, do not abort: an all-tracks run must get through the rest of the
                // canvas rather than stopping at the first track without an id.
                graph.setMessage(' ' + (track.name || 'That track') + ' has no transcript id for patent lookup. ');
                return;
            }
            const seqLen = (track.sequence && track.sequence.length) || Math.abs(track.xf - track.xi);
            let t0 = 0, t1 = seqLen;
            if (track.markstart > 0 && track.markend > track.markstart) {
                t0 = Math.max(0, track.markstart - track.xi);
                t1 = Math.max(t0, track.markend - track.xi);
            }
            const strand = '' + (track.strand != null ? track.strand : 1);

            graph.setMessage(' Loading patents for ' + tid + '… ');
            const server = window['env']['apiUrl'];
            let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            // Reads the region from BIG_DATA (auto-tabix-indexed on first use).
            const res = await exec(server + '/py/data/read-bed-region.py', em, BED, '' + tid, '' + t0, '' + t1, strand);

            let rv = [];
            try { rv = JSON.parse((res && res.values) || '[]'); } catch (e) { rv = []; }
            if (!rv.length) {
                graph.setMessage(' No patents found for ' + tid + '. ');
                return;
            }

            const TrackLayer = await exec('baja/bio/track-layer.js');
            const tg = track.tgraph;
            const layer = new TrackLayer((track.name || 'track') + '_patents', tg.xmin, 0, tg.xmax, 1);
            layer.data_type = 'Patents';
            layer.color = 'rgba(150,90,60,0.55)';
            layer.fillstyle = layer.color;

            // The x-axis is genomic and the track sequence is exon-collapsed, so a
            // transcript (cDNA) coordinate maps to genomic x through the exons.
            // Split each patent interval at intron boundaries into genomic segments.
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
                    const exStart = cum, exEnd = cum + len;   // transcript coords this exon covers
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

            // Build per-patent genomic segments, then greedily lane-pack by genomic span.
            const patents = [];
            for (const v of rv) {
                if (!v) continue;
                const segs = segsFor(+v[0], +v[1]);
                if (!segs.length) continue;
                let lo = Infinity, hi = -Infinity;
                for (const g of segs) { lo = Math.min(lo, g[0]); hi = Math.max(hi, g[1]); }
                // Column 4 is the patent id (N|N|) — use the id number as the label.
                const nm = ('' + (v[2] || '')).split('|')[0] || ('' + (v[2] || ''));
                patents.push({ lo: lo, hi: hi, name: nm, segs: segs });
            }
            patents.sort((a, b) => a.lo - b.lo);

            const laneEnd = [];
            const laneFor = (s, e) => {
                for (let i = 0; i < laneEnd.length; i++) {
                    if (s >= laneEnd[i]) { laneEnd[i] = e; return i; }
                }
                laneEnd.push(e);
                return laneEnd.length - 1;
            };
            for (const p of patents) {
                const lane = laneFor(p.lo, p.hi);
                const yv = 0.03125 + (0.03125 * lane);
                for (const g of p.segs) layer.addInterval(g[0], g[1], yv, p.name);
            }
            track.addLayer(layer);

            // Flash the intervals for ~10s so they're easy to spot when zoomed out.
            if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
            setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

            if (graph.wake) graph.wake();
            graph.setMessage(' ' + patents.length + ' patent' + (patents.length === 1 ? '' : 's') + ' loaded onto ' + (track.name || 'track') + '. ');
        } catch (e) {
            graph.setMessage(' Patent load error: ' + e + ' ');
        }
        restoreHover();
    };

    return (async () => {
        const list = (tracks && tracks.length) ? tracks.filter(Boolean) : null;
        if (!list) {
            return exec('baja/lib/for-each-track.js', graph,
                'Click on a track to load patents.', loadOne);
        }
        // An explicit list satisfies the board-level request, so consume the flag here too.
        // Left set, it would silently turn the NEXT per-track action into a board-wide one.
        try { window.__bajaApplyAllTracks = false; } catch (e) { }

        // Sequential: each track is a server read, and firing them together would queue
        // behind the server's own cap while making the progress line meaningless.
        try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
        const status = (m) => {
            try {
                window.__workStatus = m || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            status('Patents · ' + ((t && t.name) || ('track ' + (i + 1)))
                + ' · ' + (i + 1) + ' of ' + list.length + '…');
            await loadOne(t);
        }
        status('');
        try { graph.setResultMessage(' Patents loaded onto ' + list.length + ' track' + (list.length === 1 ? '' : 's') + '. '); } catch (e) { }
        return graph;
    })();
}


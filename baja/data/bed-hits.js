function (graph, genegraph_panel_layout, patentSet, targetTrack) {
    // Transcript-keyed BED hits — click a track, read one BED from BIG_DATA over that
    // track, and drop the hits in as an interval layer. Parameterised so a new dataset
    // (patents, miRNA target sites, …) is a config object, not another copy of this file.
    //
    // cfg = { bed, assignees|meta, label, color, noun, fields, idLabel }
    //   bed       '/bd/<file>.bed.gz', keyed by transcript id with transcript-relative
    //             coords (the app's native patent format)
    //   assignees optional '/bd/<file>.tsv' mapping id -> packed display label;
    //   (or meta) read-bed-region.py joins it so intervals show the metadata
    //   label     layer.data_type, shown in the layer editor
    //   color     rgba fill, so datasets stay distinguishable when stacked
    //   noun      singular noun for the status message
    //   fields    names for the packed metadata fields, in order — this is what makes the
    //             file reusable for non-patent datasets (the miRTarBase target-site layer
    //             passes miRNA / Target gene / Evidence / …). Defaults to the patent fields.
    //   idLabel   prefix for the bare id when no metadata TSV was joined
    //
    // targetTrack is optional: pass a track and the layer loads onto it straight away
    // (that is how baja/data/deep-link.js resolves ?layer=), otherwise the user is asked
    // to click the track they want.
    //
    // The BED is transcript-keyed, so hits map to genomic x through the track's exons
    // (split at intron boundaries). Overlapping hits are lane-packed.
    const cfg = (patentSet && typeof patentSet === 'object') ? patentSet : {};
    const BED = cfg.bed;
    const ASSIGNEES = cfg.assignees || cfg.meta || '';
    const LAYER_LABEL = cfg.label || 'Patents';
    const LAYER_COLOR = cfg.color || 'rgba(150,90,60,0.55)';
    const NOUN = cfg.noun || 'patent hit';
    const FIELDS = cfg.fields || ['Patent', 'Title', 'Filed', 'Assignee', 'Inventors', 'Abstract'];
    const ID_LABEL = cfg.idLabel || 'Patent';

    if (!BED) {
        graph.setMessage(' No dataset configured. ');
        return;
    }

    const restoreHover = () => {
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    // The whole load, given a track. Returns how many hits went on, so a caller that did
    // not ask for one (a deep link) can report it.
    const loadOnto = async (track) => {
        try {
            // Query by this track's transcript, in transcript (sequence-index) space.
            const tid = track.transcriptID || track.geneID || track.name || '';
            if (!tid) {
                graph.setMessage(' That track has no transcript id to look up. ');
                return 0;
            }
            const seqLen = (track.sequence && track.sequence.length) || Math.abs(track.xf - track.xi);
            let t0 = 0, t1 = seqLen;
            // Transcript-relative: the offset of the selection from the track origin, which
            // is what selectedOffset() is. Subtracting xi from the raw marks assumed they were
            // world coordinates; on a track whose marks are offsets it subtracted xi twice and
            // asked the BED for a window before the start of the transcript.
            {
                const __sel = (track.selectedRange && track.selectedRange()) || null;
                if (__sel) {
                    t0 = Math.max(0, Math.floor(__sel.start - track.xi));
                    t1 = Math.max(t0, Math.ceil(__sel.end - track.xi));
                }
            }
            const strand = '' + (track.strand != null ? track.strand : 1);

            graph.setMessage(' Loading ' + LAYER_LABEL + ' for ' + tid + '… ');
            const server = window['env']['apiUrl'];
            let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            // Reads the region from BIG_DATA (auto-tabix-indexed on first use).
            const res = await exec(server + '/py/data/read-bed-region.py', em, BED, '' + tid, '' + t0, '' + t1, strand, ASSIGNEES);

            let rv = [];
            try { rv = JSON.parse((res && res.values) || '[]'); } catch (e) { rv = []; }
            if (!rv.length) {
                graph.setMessage(' No ' + LAYER_LABEL + ' hits found for ' + tid + '. ');
                return 0;
            }

            const TrackLayer = await exec('baja/bio/track-layer.js');
            const tg = track.tgraph;
            const layer = new TrackLayer((track.name || 'track') + '_' + (cfg.key || 'patents'), tg.xmin, 0, tg.xmax, 1);
            layer.data_type = LAYER_LABEL;
            layer.color = LAYER_COLOR;
            layer.fillstyle = layer.color;

            // Transcript (cDNA) coordinate -> genomic x through the exons; split each
            // interval at intron boundaries into genomic segments.
            const exons = (track.getExons ? (track.getExons() || []) : []).slice();
            if (track.strand >= 0) exons.sort((a, b) => a.xi - b.xi);
            else exons.sort((a, b) => b.xi - a.xi);

            // WHICH MAPPING depends on what the track's sequence IS, not on whether it has
            // exons drawn on it -- a pre-mRNA track carries exon annotations too.
            //   mRNA      the BED's coordinates are transcript-relative, so map them back
            //             out through the exons and split at each intron boundary
            //   pre-mRNA  the coordinates are already linear along the track, so place them
            //             directly; splicing them would shift every hit by the intron length
            //             accumulated before it
            // Running exon mapping over a pre-mRNA track was the previous behaviour whenever
            // exons happened to be present.
            const spliced = (track.isSplicedTranscript ? track.isSplicedTranscript() : (exons.length > 0));
            const hasExons = spliced && exons.length > 0;

            const segsFor = (s, e) => {
                if (!hasExons) return [[track.xi + s, track.xi + e]];   // pre-mRNA: linear
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
                // Col 4 is either a patent number / assignee label (when an assignees TSV was
                // joined server-side) or the raw index id ("N|N|"); keep the human part.
                const nm = ('' + (v[2] || '')).split('|')[0] || ('' + (v[2] || ''));
                hits.push({ lo: lo, hi: hi, name: nm, segs: segs, ts: +v[0], te: +v[1] });
            }
            hits.sort((a, b) => a.lo - b.lo);

            // Rich metadata label for a hit — ALL the metadata the app has for this record:
            // its number/assignee, the gene/transcript it hits, the genomic locus, the
            // transcript-relative window + length, and the strand. Shown (multi-line) only when
            // zoomed in enough to see the sequence (layer.labelZoomThreshold below).
            const chrLabel = (track.chr != null && ('' + track.chr).length) ? ('chr' + track.chr) : ('' + tid);
            const strandLabel = (track.strand >= 0) ? '+' : '-';
            // A metadata TSV (read-bed-region.py join) can replace the id with a packed label
            // 'number‖title‖filing_date‖assignee‖inventors[‖abstract]' (built by the patent
            // pipeline in py/sequence/patent-pipeline). Expand it into labeled lines; otherwise
            // the name is just the patent id/number.
            const SEP = '‖';   // ‖
            // A row whose id was not in the metadata DB keeps the raw BED name, which for the
            // miRTarBase sets is 'MIRT732379|hsa-miR-135a-5p|' -- the join key first, the
            // readable name second. Show the readable half.
            const displayName = (raw) => {
                const v = '' + (raw || '');
                if (v.indexOf(SEP) >= 0) return v.split(SEP)[0];
                if (v.indexOf('|') >= 0) {
                    const parts = v.split('|').map((x) => x.trim()).filter(Boolean);
                    // Match the NAMING pattern (hsa-miR-135a-5p, mmu-let-7a-5p), not the bare
                    // letters: a loose /mir/i also matches the join key MIRT732379, which sits
                    // first and would win.
                    return parts.find((x) => /(^|-)(mir|let)-/i.test(x)) || parts[0] || v;
                }
                return v;
            };
            const buildLabel = (p) => {
                const txLen = Math.max(0, p.te - p.ts);
                const head = [];
                if (('' + p.name).indexOf(SEP) >= 0) {
                    const f = ('' + p.name).split(SEP);
                    for (let i = 0; i < f.length; i++) {
                        if (f[i]) head.push((FIELDS[i] || ('Field ' + (i + 1))) + ': ' + f[i]);
                    }
                } else {
                    head.push(ID_LABEL + ': ' + (displayName(p.name) || '—'));
                }
                // The vertical renderer draws only the first line, so the name has to be it.
                // buildLabel already leads with the id/first metadata field, which for the
                // miRTarBase sets is the miRNA itself.
                return head.concat([
                    LAYER_LABEL,
                    'Gene: ' + (track.name || tid),
                    chrLabel + ':' + Math.round(p.lo) + '-' + Math.round(p.hi),
                    'tx ' + p.ts + '-' + p.te + ' (' + txLen + ' nt)',
                    'strand ' + strandLabel
                ]).join('\n');
            };

            const laneEnd = [];
            const laneFor = (s, e) => {
                for (let i = 0; i < laneEnd.length; i++) {
                    if (s >= laneEnd[i]) { laneEnd[i] = e; return i; }
                }
                laneEnd.push(e);
                return laneEnd.length - 1;
            };
            // When only a handful of hits are loaded, make every interval tall
            // (≥50% of the track height) so they're easy to see; still offset by lane
            // so overlapping hits stay visually separable. With many hits, keep the
            // compact stacked lanes so they don't swamp the track.
            const boost = hits.length < 50;
            for (const p of hits) {
                const lane = laneFor(p.lo, p.hi);
                let yv = 0.03125 + (0.03125 * lane);
                if (boost) yv = Math.min(0.98, 0.5 + (0.03125 * lane));
                // Full metadata on the first (5'-most) segment; other exonic segments of the same
                // patent carry just the number so a multi-exon hit doesn't repeat the whole block.
                const full = buildLabel(p);
                // Later segments of a multi-exon hit carried p.name verbatim, which for a
                // record with joined metadata is the packed 'a‖b‖c' string -- separators and
                // all. Use the first field, which is the actual name (the miRNA id).
                const short = displayName(p.name);
                p.segs.forEach((g, i) => layer.addInterval(g[0], g[1], yv, i === 0 ? full : short));
            }
            // Only reveal the full metadata labels once the view is zoomed in enough to SEE THE
            // SEQUENCE (≈>5 px/base, the same threshold track.js uses to draw bases) — so at gene
            // scale you see colored patent bars, and up close each one shows all its metadata.
            // Vertical labels are compact enough to show at gene scale; the multi-line
            // horizontal block still waits until the sequence is visible.
            layer.verticalLabels = !!cfg.verticalLabels;
            layer.labelZoomThreshold = (cfg.labelZoomThreshold != null) ? cfg.labelZoomThreshold : 5;
            track.addLayer(layer);

            // Flash the intervals for ~10s so they're easy to spot when zoomed out.
            if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
            setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

            if (graph.wake) graph.wake();
            graph.setMessage(' ' + hits.length + ' ' + NOUN + (hits.length === 1 ? '' : 's') + ' loaded onto ' + (track.name || 'track') + '. ');
            return hits.length;
        } catch (e) {
            graph.setMessage(' Could not load ' + LAYER_LABEL + ': ' + e + ' (is ' + BED + ' present in BIG_DATA?) ');
        }
        return 0;
    };

    // targetTrack may be ONE track or an ARRAY, the same contract the model runners use:
    // deep-link.js passes the single track it resolved, the Layers button passes every track
    // on the canvas. Given a list, work through it sequentially -- each track is a server read,
    // and firing them together would queue behind the server's own cap anyway.
    if (Array.isArray(targetTrack) && targetTrack.length) {
        const list = targetTrack.filter(Boolean);
        return (async () => {
            // An explicit list satisfies the board-level request, so consume the flag: left
            // set it would turn the next per-track action into a board-wide one.
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            // One history entry for the whole load, so a single undo takes back the board.
            try { graph.pushOntoHistory(); } catch (e) { }
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            let done = 0, total = 0;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                try {
                    window.__workStatus = LAYER_LABEL + ' · ' + ((t && t.name) || ('track ' + (i + 1)))
                        + ' · ' + (i + 1) + ' of ' + list.length + '…';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                let n = 0;
                try { n = (await loadOnto(t)) || 0; } catch (e) { n = 0; }
                if (n > 0) done++;
                total += n;
            }
            try {
                window.__workStatus = '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
            restoreHover();
            // setResultMessage, not setMessage: the canvas draws only error and result toasts,
            // so a plain message at the end of a board run was never visible.
            const msg = ' ' + LAYER_LABEL + ': ' + total + ' ' + NOUN + (total === 1 ? '' : 's')
                + ' on ' + done + ' of ' + list.length + ' track' + (list.length === 1 ? '' : 's') + '. ';
            try { graph.setResultMessage(msg); } catch (e) { graph.setMessage(msg); }
            return total;
        })();
    }

    // Deep link: the track is already known, so skip the click entirely.
    if (targetTrack) return loadOnto(targetTrack);

    graph.clearMouseListeners();
    graph.setMouseMode('msg: Click on a track to load ' + LAYER_LABEL + '.');
    CurrentLayout.clearComponent('mainPanel');
    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    graph.addMouseDownListener(async (x, y) => {
        const ti = graph.getTrack(x, y);
        if (ti < 0) return;
        const track = graph.track[ti];
        graph.clearMouseListeners();
        graph.setMouseMode('navigate');
        await loadOnto(track);
        restoreHover();
    });
}

function (graph, genegraph_panel_layout, tracks) {
    // Patents — click a track, read patent_hg38_transcript_hits.bed.gz from the
    // local BIG_DATA folder over the track's region (view-bed.py resolves the
    // /bd/ path against BIGDATA), and drop the patent hits in as an interval
    // layer. Overlapping patents are stacked into lanes so they stay legible.
    const BED = '/bd/patent_hg38_transcript_hits.bed.gz';
    // No assignees TSV exists for THIS index. The ASO/siRNA and lipid patent sets each ship one
    // (aso_sirna_gt_assignees.tsv, lipid_patents_assignees.tsv) mapping a real patent number to
    // 'US<number> <ASSIGNEE>', and read-bed-region.py joins it when given the path. This BED's
    // column 4 is a small sequential integer -- '2|2|', '170|170|' -- an internal record id, not
    // a patent number, and nothing on disk maps it to one. So the richest label this layer can
    // build cannot name a patent; everything below it can, and does.
    //
    // Left wired: the moment a TSV for this index appears, set the path here and the packed
    // 'number‖title‖date‖assignee‖inventors' form is already expanded below.
    const ASSIGNEES = '';
    const SEP = '‖';

    const restoreHover = () => {
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set: the
    // editor stashes its own layout there, and mounting genegraph_panel_layout over it leaves
    // the canvas blank. Same rule as the model runners (baja/bio/rbp/rbp-profile.js).
    const restoreEditor = () => {
        try {
            if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                CurrentLayout.reset('mainPanel');
                return;
            }
        } catch (e) { }
        try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
        try { if (genegraph_panel_layout) CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
    };

    // `tracks`, when given, is the explicit set this run applies to -- the same contract the
    // rest of the libraries use. Falling back to for-each-track.js covers the two older
    // routes: the board-level Layers button (which sets __bajaApplyAllTracks) and a plain
    // call from a menu, which still asks for one click.
    // Returns the number of patent hits actually placed on `track`, and 0 for every way that
    // can come to nothing -- no transcript id, no hits over the region, a failed read. Callers
    // that report a total (the ?layer= deep link) need a real count: reporting one load per
    // track attempted would claim hits that were never drawn.
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

            graph.setMessage(' Loading patents for ' + tid + '… ');
            const server = window['env']['apiUrl'];
            let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            // Reads the region from BIG_DATA (auto-tabix-indexed on first use). The 6th
            // argument is the metadata TSV to join; empty means no join for this index.
            const res = await exec(server + '/py/data/read-bed-region.py', em, BED, '' + tid, '' + t0, '' + t1, strand, ASSIGNEES);

            let rv = [];
            try { rv = JSON.parse((res && res.values) || '[]'); } catch (e) { rv = []; }
            if (!rv.length) {
                graph.setMessage(' No patents found for ' + tid + '. ');
                return 0;
            }

            const TrackLayer = await exec('baja/bio/track-layer.js');
            const tg = track.tgraph;
            const layer = new TrackLayer((track.name || 'track') + '_patents', tg.xmin, 0, tg.xmax, 1);
            layer.data_type = 'Patents';
            // Lighter than the other interval layers on purpose. Patents stack into many lanes
            // and a locus can carry hundreds of overlapping claims, so at 0.55 the lanes summed
            // into a solid block that hid the track underneath; the bars are context for a
            // design, not the subject of it. Alpha also has to leave room for the label sitting
            // on top of it now.
            layer.color = 'rgba(150,90,60,0.26)';
            layer.fillstyle = layer.color;
            // HORIZONTAL, and placed only where it fits. A patent number reads left-to-right and
            // is what the eye is scanning for; turned on its side it was legible but slow. The
            // catch is that the label is wider than the hit it names, so avoidLabelOverlap drops
            // any that would land on one already drawn -- the bar stays either way, and the
            // hover panel still carries every field.
            layer.verticalLabels = false;
            layer.avoidLabelOverlap = true;
            layer.labelZoomThreshold = 0.4;

            // The x-axis is genomic and the track sequence is exon-collapsed, so a
            // transcript (cDNA) coordinate maps to genomic x through the exons.
            // Split each patent interval at intron boundaries into genomic segments.
            const exons = (track.getExons ? (track.getExons() || []) : []).slice();
            if (track.strand >= 0) exons.sort((a, b) => a.xi - b.xi);
            else exons.sort((a, b) => b.xi - a.xi);

            // Exon mapping applies to a SPLICED track only. A pre-mRNA track carries exon
            // annotations as well, and running its already-linear coordinates through them
            // shifts every hit by the introns accumulated before it.
            const spliced = (track.isSplicedTranscript ? track.isSplicedTranscript() : (exons.length > 0));
            const hasExons = spliced && exons.length > 0;

            const segsFor = (s, e) => {
                if (!hasExons) return [[track.xi + s, track.xi + e]];   // pre-mRNA: linear
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
                // Column 4 is either the packed metadata label (when a TSV was joined) or the
                // raw record id, 'N|N|'. Keep the human half of either.
                const raw = '' + (v[2] || '');
                const nm = (raw.indexOf(SEP) >= 0) ? raw : (raw.split('|')[0] || raw);
                patents.push({ lo: lo, hi: hi, name: nm, segs: segs, ts: +v[0], te: +v[1] });
            }
            patents.sort((a, b) => a.lo - b.lo);

            // Every piece of metadata the app holds for one hit: the record's own fields, the
            // gene and transcript it lands on, the genomic locus, the transcript-relative window
            // and its length, and the strand. Multi-line on purpose -- only the FIRST line is
            // drawn on the block (see the vertical branch in baja/bio/track-layer.js), and the
            // rest is what the hover panel is for.
            const FIELDS = ['Patent', 'Title', 'Filed', 'Assignee', 'Inventors', 'Abstract'];
            const chrLabel = (track.chr != null && ('' + track.chr).length) ? ('chr' + track.chr) : ('' + tid);
            const strandLabel = (track.strand >= 0) ? '+' : '-';
            const buildLabel = (p) => {
                const txLen = Math.max(0, p.te - p.ts);
                const head = [];
                if (('' + p.name).indexOf(SEP) >= 0) {
                    const f = ('' + p.name).split(SEP);
                    for (let i = 0; i < f.length; i++) {
                        if (f[i]) head.push((FIELDS[i] || ('Field ' + (i + 1))) + ': ' + f[i]);
                    }
                } else {
                    // Named for what it actually is. Calling this bare integer a patent number
                    // would be inventing a fact: it is this index's own record id, and the
                    // patent it points at is not in the file.
                    head.push('Record: ' + (p.name || '—'));
                }
                return head.concat([
                    'Patents 2020–2025',
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
            for (const p of patents) {
                const lane = laneFor(p.lo, p.hi);
                const yv = 0.03125 + (0.03125 * lane);
                const lbl = buildLabel(p);
              for (const g of p.segs) layer.addInterval(g[0], g[1], yv, lbl);
            }
            track.addLayer(layer);

            // Flash the intervals for ~10s so they're easy to spot when zoomed out.
            if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
            setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);

            if (graph.wake) graph.wake();
            graph.setMessage(' ' + patents.length + ' patent' + (patents.length === 1 ? '' : 's') + ' loaded onto ' + (track.name || 'track') + '. ');
            restoreHover();
            return patents.length;
        } catch (e) {
            graph.setMessage(' Patent load error: ' + e + ' ');
        }
        restoreHover();
        return 0;
    };

    // With an explicit `tracks` list this resolves to the TOTAL number of patent hits placed
    // across them. The click path cannot: the load happens after the user clicks, long after
    // this returns, so it resolves to whatever for-each-track gives. Anything counting hits
    // (deep-link.js) passes a list.
    return (async () => {
        let list = (tracks && tracks.length) ? tracks.filter(Boolean) : null;
        let scopeText = '';
        if (list) {
            // A SELECTION WINS over the list we were handed. The board-level Layers button
            // passes every track on the canvas, and this used to load patents onto all of them
            // even when the user had a sequence highlighted on one -- the highlight was then
            // applied only as a coordinate window per track, so it narrowed WHAT was read while
            // doing nothing about WHERE it landed. Same rule the RNASeq library follows.
            const __t = await exec('baja/lib/target-tracks.js', graph, list);
            list = __t.items;
            scopeText = __t.scope;
        }
        if (!list || !list.length) {
            // Only the CLICK path needs the panel mounted: it is what the user looks at while
            // choosing a track. Given an explicit list there is no choosing, and swapping
            // mainPanel there was blanking the editor behind the selection window.
            restoreEditor();
            return exec('baja/lib/for-each-track.js', graph,
                'Click on a track to load patents.', loadOne);
        }
        // An explicit list satisfies the board-level request, so consume the flag here too.
        // Left set, it would silently turn the NEXT per-track action into a board-wide one.
        try { window.__bajaApplyAllTracks = false; } catch (e) { }

        // One history entry for the whole load, so a single undo takes back the board.
        try { graph.pushOntoHistory(); } catch (e) { }

        // Sequential: each track is a server read, and firing them together would queue
        // behind the server's own cap while making the progress line meaningless.
        try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
        const status = (m) => {
            try {
                window.__workStatus = m || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };
        let placed = 0;
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            status('Patents · ' + ((t && t.name) || ('track ' + (i + 1)))
                + ' · ' + (i + 1) + ' of ' + list.length + '…');
            placed += (await loadOne(t)) || 0;
        }
        status('');
        try {
            // The count, not just the track total: "Patents loaded onto 4 tracks" read as
            // success even when every one of them came back empty. And the SCOPE, so a load
            // that a selection narrowed says so rather than looking like it missed tracks.
            graph.setResultMessage(' ' + placed + ' patent hit' + (placed === 1 ? '' : 's')
                + ' loaded onto ' + list.length + ' track' + (list.length === 1 ? '' : 's')
                + (scopeText ? ' (' + scopeText + ')' : '') + '. ');
        } catch (e) { }
        return placed;
    })();
}


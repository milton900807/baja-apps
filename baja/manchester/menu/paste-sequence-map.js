function (graph, genegraph_panel_layout, sequence) {

    // A pasted SEQUENCE, mapped onto whatever is on screen -- and if nothing on screen
    // carries it, offered a search of the full pre-mRNA reference to find the gene it
    // belongs to, load that gene's canonical transcript, and map it there instead.
    //   exec('baja/manchester/menu/paste-sequence-map.js', graph, genegraph_panel_layout, sequence)
    //
    // Three stages, and the point of splitting them is that they are different SCALES of
    // search over different things:
    //   1. Edit distance 1 against every track already on the canvas -- a handful of
    //      transcripts, brute-force compared base by base (py/bio/map/le-map-sequences.py,
    //      the same script the existing multi-sequence paste flow in editor.js already uses).
    //      Cheap, so it runs unconditionally on every paste.
    //   2. Only on a miss, and only after asking: edit distance 1 against the WHOLE
    //      pre-mRNA reference (human_premrna, ~2 Gbp, one record per gene including its
    //      introns) via the same 2-bit index search the off-target tool uses. Not run by
    //      default because it is a genuinely different scale of work, on every paste, for a
    //      case (nothing on screen matches) that is usually not what happened.
    //   3. Load the gene's canonical transcript and repeat step 1 against JUST that new
    //      track, so the compound lands with the same mapping logic either way.

    const restoreHover = () => {
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (typeof graph.__hoverRearm === 'function') graph.__hoverRearm(); } catch (e) { }
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    // Map `seq` onto ONE track at the given edit distance. Returns the placed Oligo, or
    // null on no hit. Shared by stage 1 (every displayed track) and stage 3 (the one
    // freshly-loaded transcript), so a compound lands the same way regardless of which
    // stage found its target -- one placement rule, not two copies of it.
    const mapOntoTrack = async (t, seq, ed) => {
        try {
            const trackSeq = ('' + (t.sequence || '')).trim();
            if (!trackSeq) return null;
            const Biopolymer = await exec('baja/chem/biopolymer.js');
            const res = await exec('py/bio/map/le-map-sequences.py', trackSeq, [seq], ed);
            const hits = (res && res[0]) || 0;
            if (!hits || !hits.length) return null;
            // Best (lowest edit distance) hit on this track, not just the first one found.
            let best = hits[0];
            for (const h of hits) { if (h[4] < best[4]) best = h; }
            const bioObject = {
                trackName: t.name,
                startIndex: t.xi + best[3],
                strand: t.strand,
                endIndex: t.xi + best[3] + best[2].length,
                y: (t.tgraph.ymax - 0.2)
            };
            const compound = Biopolymer.generateDNAOligo(seq, best[2], bioObject);
            compound.id = '' + Math.random();
            compound.sequence = t.getSequenceRange(compound.xi, compound.xf);
            compound.highlight(10000, 'purple');
            t.addOligo(compound);
            return compound;
        } catch (e) { return null; }
    };

    // Stage 1: every track already on the canvas.
    const mapOntoDisplayedTracks = async (seq, ed) => {
        const placed = [];
        for (const t of (graph.track || [])) {
            const c = await mapOntoTrack(t, seq, ed);
            if (c) placed.push({ track: t, compound: c });
        }
        return placed;
    };

    // Stage 3: load one gene's canonical transcript, then map onto just that.
    const loadAndMap = async (candidate, seq, ed) => {
        if (!candidate.canonical_transcript) {
            graph.setResultMessage(' ' + (candidate.symbol || candidate.gene_id)
                + ' contains this sequence, but its canonical transcript could not be'
                + ' resolved -- nothing was loaded. ');
            return;
        }
        graph.setMessage(' Loading ' + candidate.canonical_transcript
            + ' (' + (candidate.symbol || candidate.gene_id) + ')… ');
        let t;
        try { t = await graph.add(candidate.canonical_transcript); }
        catch (e) { t = null; }
        // An id Ensembl does not actually carry can come back as an EMPTY SHELL -- a real
        // track object with no sequence -- rather than null (same check text-extract.js uses
        // after this same call). Caught here so it reads as "could not load", not as a
        // mapping failure on a transcript that was never really there.
        const hasContent = t && (('' + (t.sequence || '')).length > 0);
        if (!hasContent) {
            try { if (t && graph.track) graph.track = graph.track.filter((x) => x !== t); } catch (e) { }
            graph.setError(' Could not load ' + candidate.canonical_transcript + '. ');
            restoreHover();
            return;
        }
        const compound = await mapOntoTrack(t, seq, ed);
        if (compound) {
            try {
                const len = t.sequence ? t.sequence.length : (t.xf - t.xi);
                graph.zoomToTrack(graph.track.length - 1, len * -0.2, len + len * 0.2);
            } catch (e) { }
            graph.setResultMessage(' Mapped onto ' + (candidate.symbol || candidate.gene_id)
                + ' (' + candidate.canonical_transcript + '), found via the pre-mRNA reference. ');
        } else {
            // The gene's PRIMARY transcript region contained it (the pre-mRNA search matched
            // the whole locus, introns included), but the loaded transcript is the SPLICED
            // canonical isoform -- if the hit sat in an intron, or in an exon this isoform
            // skips, the sequence is genuinely not on this particular transcript's sequence,
            // even though it is in the gene. Said plainly rather than looking like a second,
            // unrelated failure.
            graph.setResultMessage(' Loaded ' + candidate.canonical_transcript
                + ' (' + (candidate.symbol || candidate.gene_id) + '), but the sequence sits '
                + 'outside this transcript\'s spliced sequence (likely an intron the canonical '
                + 'isoform does not retain). The track is on screen if you want to look. ');
        }
        restoreHover();
    };

    // Stage 2 result handling: one candidate loads directly; more than one asks which;
    // none (or none with a resolvable transcript) says so plainly.
    const offerCandidates = (result, seq, ed) => {
        if (result && result.error) {
            graph.setResultMessage(' Could not search the pre-mRNA reference: ' + result.error + ' ');
            restoreHover();
            return;
        }
        const cands = (result && result.candidates) || [];
        const loadable = cands.filter((c) => c.canonical_transcript);
        if (!loadable.length) {
            graph.setResultMessage(cands.length
                ? (' Found ' + cands.length + ' gene' + (cands.length === 1 ? '' : 's')
                    + ' in the pre-mRNA reference, but could not resolve a canonical'
                    + ' transcript to load. ')
                : ' No match in the pre-mRNA reference either. ');
            restoreHover();
            return;
        }
        if (loadable.length === 1) {
            loadAndMap(loadable[0], seq, ed);
            return;
        }
        // More than one gene carries this sequence (short or low-complexity probes can do
        // this even at edit distance 1) -- ask rather than guessing which one was meant.
        const items = loadable.map((c) => ({
            label: (c.symbol || c.gene_id) + '  —  ' + c.canonical_transcript
                + '  (edit distance ' + c.editdistance + ')',
            move: () => { },
            click: () => { try { graph.showSideMenu(null); } catch (e) { } loadAndMap(c, seq, ed); }
        }));
        items.push({ label: '‹ Cancel', move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } restoreHover(); } });
        try { graph.showSideMenu(items, null, 'Found in ' + loadable.length + ' genes ▸'); }
        catch (e) { loadAndMap(loadable[0], seq, ed); }   // no menu available -- best guess rather than nothing
    };

    return (async () => {
        // U -> T: the tracks' own sequences, le-map-sequences.py's comparison, and the
        // pre-mRNA index are all DNA. The current caller only ever extracts ATCG, so this is
        // dead code today rather than a live bug -- kept so it stays that way if an RNA-letter
        // caller is ever added, instead of quietly comparing every U against a T and finding
        // nothing anywhere.
        const seq = ('' + (sequence || '')).trim().toUpperCase().replace(/U/g, 'T');
        if (!seq || !/^[ACGT]{6,}$/.test(seq)) {
            // Not this feature's job to say what a valid sequence looks like -- just decline
            // quietly rather than running a search that cannot mean anything.
            return;
        }
        const ED = 1;   // the whole point of this flow, per how it was asked for

        graph.setMessage(' Searching displayed tracks for a match… ');
        const placed = await mapOntoDisplayedTracks(seq, ED);
        if (placed.length) {
            const names = placed.map((p) => p.track.name || 'track');
            graph.setResultMessage(' Mapped onto ' + placed.length + ' track'
                + (placed.length === 1 ? '' : 's') + ': ' + names.join(', ') + '. ');
            restoreHover();
            return;
        }

        // No hit anywhere on screen. Ask before spending a whole-genome search on it --
        // fire-and-forget, matching every other confirm.js caller in this codebase: it has
        // no decline callback, only a Yes action, so the continuation lives inside it and
        // declining (Cancel, or dismissing any other way) just closes the prompt. That
        // dismissal re-arms the canvas hover itself (graph.showMenu's own mouse-up handling),
        // so there is nothing this function needs to clean up on a decline.
        graph.setResultMessage(' No match on the tracks currently on display. ');
        try {
            await exec('baja/lib/confirm.js',
                'No match on the tracks currently on display. Search the pre-mRNA'
                + ' reference for a gene that contains this sequence?',
                async () => {
                    graph.setMessage(' Searching the pre-mRNA reference (this covers introns,'
                        + ' so it can take a few seconds)… ');
                    let result;
                    try { result = await exec('py/sequence/offtarget/find-gene-in-premrna.py', seq, ED, 'human_premrna'); }
                    catch (e) { result = { error: '' + e }; }
                    offerCandidates(result, seq, ED);
                },
                'Search pre-mRNA');
        } catch (e) { }
    })();
}

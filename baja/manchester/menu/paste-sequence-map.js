function (graph, genegraph_panel_layout, sequence) {

    // A pasted SEQUENCE, mapped onto whatever is on screen -- and if nothing on screen
    // carries it, the full pre-mRNA reference is searched automatically for the gene it
    // belongs to, and every gene it finds is offered as a maximized library the user picks
    // from to load that gene's canonical transcript and map the sequence onto it.
    //   exec('baja/manchester/menu/paste-sequence-map.js', graph, genegraph_panel_layout, sequence)
    //
    // Three stages, over different SCALES of search:
    //   1. The CLIENT-SIDE stage: every track already on the canvas -- a handful of
    //      transcripts, brute-force compared base by base
    //      (py/bio/map/le-map-sequences.py, the same script the existing multi-sequence
    //      paste flow in editor.js already uses). That script already tries all FOUR
    //      orientations itself, per oligo -- Forward (as pasted), Reverse, Forward
    //      Complement, and Reverse Complement -- and tags each hit with which one matched
    //      (see mapOntoTrack below), since a pasted probe's orientation relative to what is
    //      on screen is not always known. Tries QUIETLY at edit distance 1 first -- no
    //      prompt, no server, on every paste, since most pastes are an exact or near-exact
    //      match to something already on screen. Only on a MISS does it ask how far to
    //      widen (0-3, via baja/manchester/menu/prompt-edit-distance.js) and try again --
    //      one extra client-side pass, still all four orientations, before anything
    //      server-side is even considered.
    //   2. Still no hit: automatically, edit distance 1 against the WHOLE pre-mRNA reference
    //      (human_premrna, ~2 Gbp, one record per gene including its introns) via the same
    //      2-bit index search the off-target tool uses. A SERVER-side, different algorithm
    //      (a seed-and-verify index, not a brute-force compare) -- fixed at edit distance 1
    //      regardless of what was chosen for stage 1, since widening a whole-genome search
    //      the same way would make it far less selective.
    //   3. Every gene it finds is shown as a card in a maximized library (baja/lib/shelf.js)
    //      -- not auto-loaded, even when there is exactly one, because loading a whole new
    //      transcript and dropping a compound onto it is not a step to take silently. Each
    //      card's action loads that gene's canonical transcript and places the compound at
    //      the GENOMIC SPAN stage 2 already found -- no client-side re-search, and no
    //      client-side re-search is even reliable here: edit distance 1 against the loaded
    //      transcript's SPLICED sequence can miss a site edit distance 1 against the
    //      unspliced locus already found for real. See genomicSpanOnTrack below.

    const restoreHover = () => {
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (typeof graph.__hoverRearm === 'function') graph.__hoverRearm(); } catch (e) { }
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    // Map `seq` onto ONE track at the given edit distance, by SEARCHING it -- there is no
    // prior known location to place it at. Returns the placed Oligo (tagged with which
    // orientation matched, in .orientation), or null on no hit. Stage 1 only: stage 3
    // places at a genomic span it already has (genomicSpanOnTrack), not by searching, since
    // a client-side search of a spliced transcript can miss a real hit the server already
    // found in the unspliced locus.
    //
    // le-map-sequences.py already searches all 4 orientations ITSELF, per oligo it is
    // given -- Forward (as pasted), Reverse (literally reversed, not complemented), Forward
    // Complement (base-for-base, not reversed), and Reverse Complement -- and tags each hit
    // with which one matched (h[5]). Passing pre-computed reverse/complement variants IN
    // ADDITION as separate oligos would make it redo that same work on each of them (e.g.
    // reverse-complementing an already-reverse-complemented variant back toward the
    // original), not add coverage -- so `seq` goes in once, exactly as pasted.
    const mapOntoTrack = async (t, seq, ed) => {
        try {
            const trackSeq = ('' + (t.sequence || '')).trim();
            if (!trackSeq) return null;
            const Biopolymer = await exec('baja/chem/biopolymer.js');
            const res = await exec('py/bio/map/le-map-sequences.py', trackSeq, [seq], ed);
            const hits = (res && res[0]) || 0;
            if (!hits || !hits.length) return null;
            // Best (lowest edit distance) hit on this track, across every orientation the
            // script tried, not just the first one found.
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
            compound.orientation = best[5];   // "Forward" | "Reverse" | "Forward Complement" | "Reverse Complement"
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

    // The genomic span of a hit, placed onto a LOADED track directly -- no second edit-
    // distance search. The server already found exactly where this sequence sits
    // (find-gene-in-premrna.py's genomic_start/genomic_end, computed from the hit's
    // position in the pre-mRNA record plus the gene's own genomic span and strand); a
    // client-side re-search at edit distance 1 against the SPLICED transcript is not just
    // redundant, it can fail on a real hit -- the loaded sequence has introns removed, a
    // different string, and edit distance 1 against it is not guaranteed to find a site
    // edit distance 1 against the unspliced locus already found for real.
    //
    // Track.variantWorldX (baja/bio/track.js) is the app's own genomic -> track-world
    // conversion, the same one variant loading uses -- exon-aware, so a genomic position
    // an isoform's exons do not cover returns null rather than a wrong guess.
    //
    // Both ends resolving is not enough on its own: each end can individually land inside
    // SOME exon while the two are not actually contiguous on the spliced transcript, if the
    // span crosses an intron the canonical isoform splices out in between. A local span
    // shorter than the genomic one is exactly that signature, so it is checked for and
    // rejected rather than silently placing a truncated or wrongly-spanning compound.
    const genomicSpanOnTrack = (t, candidate) => {
        try {
            if (!candidate.chr || candidate.genomic_start == null || candidate.genomic_end == null) return null;
            if (!t.variantWorldX) return null;
            const wx0 = t.variantWorldX(candidate.chr, candidate.genomic_start);
            const wx1 = t.variantWorldX(candidate.chr, candidate.genomic_end);
            if (wx0 == null || wx1 == null) return null;
            const xi = Math.min(wx0, wx1);
            const xf = Math.max(wx0, wx1) + 1;   // half-open, so the end base is included
            const genomicLen = candidate.genomic_end - candidate.genomic_start + 1;
            if ((xf - xi) !== genomicLen) return null;   // crossed an intron in between
            return { xi: xi, xf: xf };
        } catch (e) { return null; }
    };

    // Stage 3: load one gene's canonical transcript, then place the compound at the
    // genomic span the server already found. No `ed` parameter here on purpose -- there is
    // no edit-distance search left in this function to take one.
    const loadAndMap = async (candidate, seq) => {
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
        const span = genomicSpanOnTrack(t, candidate);
        if (span) {
            try {
                const Biopolymer = await exec('baja/chem/biopolymer.js');
                const matched = t.getSequenceRange(span.xi, span.xf);
                const bioObject = {
                    trackName: t.name,
                    startIndex: span.xi,
                    strand: t.strand,
                    endIndex: span.xf,
                    y: (t.tgraph.ymax - 0.2)
                };
                const compound = Biopolymer.generateDNAOligo(seq, matched, bioObject);
                compound.id = '' + Math.random();
                compound.sequence = matched;
                compound.highlight(10000, 'purple');
                t.addOligo(compound);
                try {
                    const len = t.sequence ? t.sequence.length : (t.xf - t.xi);
                    graph.zoomToTrack(graph.track.length - 1, len * -0.2, len + len * 0.2);
                } catch (e) { }
                graph.setResultMessage(' Mapped onto ' + (candidate.symbol || candidate.gene_id)
                    + ' (' + candidate.canonical_transcript + '), at the site the pre-mRNA'
                    + ' reference search found. ');
            } catch (e) {
                graph.setError(' Loaded ' + candidate.canonical_transcript
                    + ', but could not place the compound: ' + e + ' ');
            }
        } else if (!candidate.chr || candidate.genomic_start == null) {
            // The server-side lookup itself could not resolve genomic coordinates for this
            // gene (chrom/strand/start/end missing from genes.sqlite) -- a different, rarer
            // condition from a real intronic miss, said as what it actually is.
            graph.setResultMessage(' Loaded ' + candidate.canonical_transcript
                + ' (' + (candidate.symbol || candidate.gene_id) + '), but the search could not'
                + ' determine where on it the sequence sits. The track is on screen if you'
                + ' want to look. ');
        } else {
            // The gene's PRIMARY transcript region contained it (the pre-mRNA search matched
            // the whole locus, introns included), but the loaded transcript is the SPLICED
            // canonical isoform -- the hit sat in an intron, or spanned one, that this
            // isoform does not retain. Said plainly rather than looking like a second,
            // unrelated failure.
            graph.setResultMessage(' Loaded ' + candidate.canonical_transcript
                + ' (' + (candidate.symbol || candidate.gene_id) + '), but the sequence sits '
                + 'outside this transcript\'s spliced sequence (likely an intron the canonical '
                + 'isoform does not retain, or a span that crosses one). The track is on screen'
                + ' if you want to look. ');
        }
        restoreHover();
    };

    // Stage 2 result handling: every hit becomes a card in a maximized library
    // (baja/lib/shelf.js) -- the same full-screen, described-choice idiom the rest of the
    // app's data/model libraries use -- and "Load and map" is the explicit action on each
    // card. Not auto-loaded even when there is exactly one candidate: this step loads a
    // whole new transcript and drops a compound onto it, and that is a decision to show the
    // user, with what it is about to do described, rather than take silently on their behalf.
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

        // Short or low-complexity probes can hit more than one gene even at edit distance 1
        // -- the card orders by that, best match first, so the likeliest answer leads.
        const sorted = loadable.slice().sort((a, b) => a.editdistance - b.editdistance);
        const books = sorted.map((c) => ({
            title: (c.symbol || c.gene_id) + '  ▸  ' + c.canonical_transcript,
            badge: 'ED ' + c.editdistance + (c.gene_strand ? (' · ' + c.gene_strand + ' strand') : ''),
            blurb: 'Sequence found in the pre-mRNA (unspliced) reference for ' + (c.symbol || c.gene_id)
                + ' (' + c.gene_id + '). Loads its canonical transcript, ' + c.canonical_transcript
                + ', and maps this sequence onto it as a compound at the site where it matched'
                + ' (edit distance ' + c.editdistance + '). If the hit sits in an intron the'
                + ' canonical isoform does not retain, the transcript still loads but the'
                + ' sequence will not map onto it -- said plainly if that happens.',
            open: () => loadAndMap(c, seq)
        }));

        try {
            exec('baja/lib/shelf.js', {
                id: 'baja-paste-premrna-hits',
                title: 'Found in the pre-mRNA reference',
                subtitle: '"' + seq + '"  —  ' + loadable.length + ' gene'
                    + (loadable.length === 1 ? '' : 's') + ' — pick one to load and map',
                books: books,
                graph: graph,
                // 'open' means a card was clicked -- loadAndMap is already running and owns
                // its own hover restoration once that async work actually finishes; only a
                // real dismissal (the ✕ or Escape) re-arms the canvas here. Same convention
                // as the selection library's shelves elsewhere in this app.
                onClose: (reason) => { if (reason !== 'open') restoreHover(); }
            });
        } catch (e) { loadAndMap(sorted[0], seq); }   // no shelf available -- best guess rather than nothing
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
        // Try mapping onto the canvas FIRST, quietly, at the default tolerance -- before
        // asking anything or going anywhere near the server. Most pastes are an exact or
        // near-exact match to something already on screen; interrupting every single one of
        // those with a prompt would be worse than just trying.
        // Names each placed track, noting the orientation it matched in when that was not
        // simply the sequence as pasted ("Forward") -- worth surfacing (an oligo that only
        // matched as its reverse complement is a meaningfully different finding), not worth
        // cluttering the common as-pasted case with.
        const describePlaced = (p) => (p.track.name || 'track')
            + (p.compound && p.compound.orientation && p.compound.orientation !== 'Forward'
                ? (' (' + p.compound.orientation.toLowerCase() + ')') : '');

        const DEFAULT_ED = 1;
        graph.setMessage(' Searching displayed tracks for a match… ');
        let placed = await mapOntoDisplayedTracks(seq, DEFAULT_ED);
        if (placed.length) {
            graph.setResultMessage(' Mapped onto ' + placed.length + ' track'
                + (placed.length === 1 ? '' : 's') + ': ' + placed.map(describePlaced).join(', ') + '. ');
            restoreHover();
            return;
        }

        // Miss at the default tolerance: NOW ask how far to widen the CLIENT-SIDE search
        // before trying again -- 0-3, via the same quick center-menu choice every
        // client-side mapping path in this app uses. Only a picked value WIDER than the
        // default is worth a second pass; 0 or 1 again would just repeat the miss above.
        const ED = await exec('baja/manchester/menu/prompt-edit-distance.js', graph, DEFAULT_ED);
        if (ED > DEFAULT_ED) {
            graph.setMessage(' Trying again at edit distance ' + ED + '… ');
            placed = await mapOntoDisplayedTracks(seq, ED);
            if (placed.length) {
                graph.setResultMessage(' Mapped onto ' + placed.length + ' track'
                    + (placed.length === 1 ? '' : 's') + ' at edit distance ' + ED + ': '
                    + placed.map(describePlaced).join(', ') + '. ');
                restoreHover();
                return;
            }
        }

        // Still no hit anywhere on screen: search the pre-mRNA reference automatically. No
        // confirm here -- the result is a maximized library the user chooses from (see
        // offerCandidates), so the "are you sure" moment is that choice, at the point where
        // there is something concrete to decide about, rather than a blind yes/no before the
        // search has even run.
        //
        // Fixed at edit distance 1 -- NOT the client-side ED chosen above. This is a
        // different, server-side algorithm (a 2-bit seed-and-verify index over the whole
        // genome, not a brute-force compare), and widening a whole-genome search the same
        // way the user widened the on-screen one would make it far less selective (more
        // candidate sites, slower, noisier) rather than more useful.
        const PREMRNA_ED = 1;
        graph.setMessage(' No match on the tracks currently on display -- searching the'
            + ' pre-mRNA reference (this covers introns, so it can take a few seconds)… ');
        let result;
        try { result = await exec('py/sequence/offtarget/find-gene-in-premrna.py', seq, PREMRNA_ED, 'human_premrna'); }
        catch (e) { result = { error: '' + e }; }
        offerCandidates(result, seq, PREMRNA_ED);
    })();
}

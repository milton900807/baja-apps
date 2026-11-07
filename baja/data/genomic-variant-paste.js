function (server, graph, genegraph_panel_layout, text) {

    // PASTED GENOMIC VARIANTS: "chr16:1762843 C>T" and friends, placed on every track that covers them.
    //
    //   exec('baja/data/genomic-variant-paste.js', server, graph, genegraph_panel_layout, text)
    //
    // One variant per line, in any of the shapes people copy around:
    //     chr16:1762843 C>T      chr16:1762843C>T      16:1762843 C>T      chr16:g.1762843C>T
    //     chr16-1762843-C-T      chr16:1762843:C:T     chr16 1762843 C T   chr16_1762843_C_T
    // REF/ALT may be longer than one base (VCF style, e.g. CT>C, C>CAG). Positions are 1-based on the
    // genome build the server's annotation uses (GRCh38).
    //
    // Each variant goes on EVERY track on the canvas that can hold it -- track.variantWorldX(chr, pos), the
    // same mapping the VCF and ClinVar loaders use: a genomic track takes it at its position, a spliced
    // (cDNA) track takes it through its exons, and a track that does not cover it is left alone. A variant
    // that no track on the canvas covers is handed to the VCF-paste route, which finds the gene at that
    // position, offers to load its transcript, and places the variant there.
    //
    // Resolves { placed, tracks, unplaced } and says what happened on the canvas.

    const say = (m, secs) => { try { graph.setMessage(' ' + m + ' ', secs); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };
    const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };

    return (async () => {
        const parse = await exec('baja/data/parse-genomic-variants.js');
        const variants = parse(text);
        if (!variants.length) { say('No genomic variants found in the paste.', 3); return { placed: 0, tracks: 0, unplaced: [] }; }

        let SnpIndel = null;
        try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
        if (!SnpIndel) { say('Variant support unavailable.', 3); return { placed: 0, tracks: 0, unplaced: variants }; }

        const tracks = (graph.track || []).filter((t) => t && typeof t.variantWorldX === 'function');
        const touched = new Set();
        const unplaced = [];
        const mismatches = [];
        let placed = 0;
        let pushed = false;

        for (const v of variants) {
            let hits = 0;
            for (const track of tracks) {
                const wx = track.variantWorldX(v.chr, v.pos);
                if (wx == null) continue;

                let type = 'snp';
                if (v.alt.length > v.ref.length) type = 'ins';
                else if (v.ref.length > v.alt.length) type = 'del';
                // VCF-style deletions quote the base before the deleted run; anchor past it on the plus
                // strand, exactly as vcf-paste.js does.
                let placeXi = wx;
                if (type === 'del' && track.strand !== -1) placeXi = wx + 1;

                // A light sanity check: does the track's base at this spot match the pasted (plus-strand)
                // reference? A minus-strand track may hold its sequence in transcript orientation, so there
                // the complement counts too. A mismatch usually means a different genome build.
                try {
                    // Only where the track can say which base is at this genomic position (genomicAt);
                    // otherwise skip the check rather than guess an offset.
                    const seq = '' + (track.sequence || '');
                    const i0 = Math.round(wx - (+track.xi || 0));
                    let i = -1;
                    if (typeof track.genomicAt === 'function') {
                        for (let d = 0; d <= 2 && i < 0; d++) {
                            if (track.genomicAt(i0 + d) === v.pos) i = i0 + d;
                            else if (d && track.genomicAt(i0 - d) === v.pos) i = i0 - d;
                        }
                    }
                    const b = i >= 0 ? (seq[i] || '').toUpperCase() : '';
                    const r = v.ref.charAt(0);
                    if (b && /[ACGT]/.test(b) && b !== r && (track.strand !== -1 || COMP[b] !== r)) mismatches.push(v.label + ' on ' + (track.name || 'track'));
                } catch (e) { }

                if (!pushed) { try { graph.pushOntoHistory(); } catch (e) { } pushed = true; }
                try {
                    const snp = new SnpIndel(type, placeXi, v.ref, v.alt, 0, track.strand, v.label, null, null);
                    snp.name = v.label;
                    snp.source = 'Pasted';
                    try { snp.setAnnotation(['HGVSg=' + v.hgvs]); } catch (e) { }
                    track.addsnpindel(snp);
                    track.showSnpIndels = true;
                    touched.add(track);
                    hits++;
                    placed++;
                } catch (e) { }
            }
            if (!hits) unplaced.push(v);
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
        let msg = '';
        if (placed) msg = 'Placed ' + plural(variants.length - unplaced.length, 'pasted variant') + ' on ' + plural(touched.size, 'track') + '.';
        if (mismatches.length) msg += ' Check the genome build: the reference base does not match the track at ' + mismatches.slice(0, 3).join(', ') + (mismatches.length > 3 ? ', …' : '') + '.';

        // Nothing on the canvas covers these: find their genes and offer to load them, through the VCF route.
        if (unplaced.length) {
            if (msg) say(msg + ' ' + plural(unplaced.length, 'variant') + ' not on any track: finding their genes…', 4);
            else say('No track on the canvas covers ' + unplaced.map((v) => v.label).join(', ') + '. Finding the gene' + (unplaced.length === 1 ? '' : 's') + '…', 4);
            const vcf = unplaced.map((v) => [v.chrLabel, v.pos, v.label, v.ref, v.alt, '.', '.', '.'].join('\t')).join('\n');
            try { await exec('baja/data/vcf-paste.js', server, graph, genegraph_panel_layout, vcf); } catch (e) { }
        } else {
            say(msg, 3);
            restoreHover();
        }
        return { placed, tracks: touched.size, unplaced };
    })();
}

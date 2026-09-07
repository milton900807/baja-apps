function (server, graph, genegraph_panel_layout, ids, variants) {
    // Load these transcripts, and put these variants on whichever of them they land in.
    //
    // The variants come from somewhere that already knows where they are -- the chromosome
    // view, holding a pasted or uploaded VCF -- so nothing is looked up again here. What this
    // does is the part only a track can do: turn a genomic coordinate into a position on a
    // loaded transcript, which is what track.variantWorldX exists for.
    //
    // A variant lands on EVERY track it falls inside, not on the first. Transcripts overlap,
    // genes sit inside other genes' introns, and a variant in that overlap is genuinely on
    // both -- picking one would be inventing a precedence the data does not have.
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const wanted = (ids || []).filter(Boolean);
        if (!wanted.length) { say('No transcripts to load.'); return false; }
        const vs = variants || [];

        let SnpIndel = null;
        try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }

        const colorFor = (sig) => {
            const t = ('' + (sig || '')).toLowerCase();
            if (!t) return null;
            if (t.indexOf('conflict') >= 0) return '#94a3b8';
            if (t.indexOf('pathogenic') >= 0) return '#c0392b';
            if (t.indexOf('benign') >= 0) return '#22c55e';
            return '#94a3b8';
        };

        let loaded = 0, placed = 0;
        for (let i = 0; i < wanted.length; i++) {
            say('Loading ' + wanted[i] + ' — ' + (i + 1) + ' of ' + wanted.length + '…');
            const before = new Set((graph.track || []));
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, wanted[i]); }
            catch (e) { continue; }
            const fresh = (graph.track || []).filter((t) => t && !before.has(t));
            if (!fresh.length) continue;
            loaded += fresh.length;
            if (!vs.length || !SnpIndel) continue;
            try { graph.pushOntoHistory(); } catch (e) { }
            for (const track of fresh) {
                for (const v of vs) {
                    // variantWorldX answers "is this coordinate on this track, and where" in
                    // one call, and returns null when it is not -- which is also the test for
                    // whether the variant belongs here at all.
                    let wx = null;
                    try { wx = track.variantWorldX ? track.variantWorldX(v.chr, v.pos) : null; } catch (e) { wx = null; }
                    if (wx == null) continue;
                    const ref = ('' + (v.ref || 'N')).toUpperCase();
                    const alt = ('' + (v.alt || 'N')).toUpperCase();
                    let type = 'snp';
                    if (alt.length > ref.length) type = 'ins';
                    else if (ref.length > alt.length) type = 'del';
                    // A deletion is anchored one base past the record's position on the plus
                    // strand: VCF quotes the base before the deleted run.
                    let placeXi = wx;
                    if (type === 'del' && track.strand !== -1) placeXi = wx + 1;
                    try {
                        const snp = new SnpIndel(type, placeXi, ref, alt, 0, track.strand,
                            v.name || (v.chr + ':' + v.pos), null, colorFor(v.sig));
                        snp.name = v.name || (v.chr + ':' + v.pos);
                        snp.source = v.source || 'VCF';
                        if (Array.isArray(v.annotations) && v.annotations.length) {
                            try { snp.setAnnotation(v.annotations); } catch (e) { }
                        }
                        if (v.sig) snp.clinsig = v.sig;
                        track.addsnpindel(snp);
                        track.showSnpIndels = true;
                        placed++;
                    } catch (e) { }
                }
            }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        say('Loaded ' + loaded + ' transcript' + (loaded === 1 ? '' : 's')
            + (vs.length ? ' and placed ' + placed + ' variant' + (placed === 1 ? '' : 's')
                + ' of ' + vs.length + ' carried over' : '') + '.');
        restoreHover();
        return loaded > 0;
    })();
}

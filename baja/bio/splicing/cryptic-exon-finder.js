function (graph, track, region, opts) {

    // THE PHYLON CRYPTIC EXON FINDER, in one place.
    //   await exec('baja/bio/splicing/cryptic-exon-finder.js', graph, track,
    //              { xi: <world>, xf: <world> }, { species: 'mouse' });
    //
    // Candidate exons are cut from canonical motifs in the window (AG|exon|GT on the plus
    // strand, AC|exon|CT on the minus, with no reverse complement) and scored by a model
    // over GERP conservation read from a bigWig. Everything at or above the threshold is
    // kept, and overlapping hits collapse to the best one. What it is saying is that this
    // stretch of intron is as conserved as an exon: a pseudo-exon that evolution appears
    // to be holding onto.
    //
    // It ran from one place, the Exon -> AI Models side menu, where it needs an exon to
    // have been right-clicked. The models catalogue lists every other splicing model and
    // could not list this one, because the catalogue hands over a TRACK. So the work moved
    // here and both callers hand it a window: the menu passes the exon it was opened on,
    // the catalogue passes the selected sequence, and neither has its own copy of what to
    // do with the result.
    //
    // SPECIES PICKS THE SCRIPT, not a submenu. The two scripts differ in which genome's
    // conservation they read (GRCh38 against mm9), so running the human one over a mouse
    // track scores mouse sequence against human conservation and returns confident
    // nonsense. The track knows its species; asking the user to repeat it invites the
    // mismatch.

    return (async () => {
        const t = track;
        if (!t) { try { graph.setMessage(' No track selected '); } catch (e) { } return null; }
        const o = opts || {};
        const r0 = region || {};
        let xi = Math.round(Math.min(+r0.xi, +r0.xf));
        let xf = Math.round(Math.max(+r0.xi, +r0.xf));
        if (!isFinite(xi) || !isFinite(xf) || xf <= xi) {
            try { graph.setMessage(' Select an exon or a stretch of sequence to scan first '); } catch (e) { }
            return null;
        }

        // The bigWig is read window by window and every candidate is scored, so a whole
        // gene is minutes of work for a result nobody asked for. A ceiling, said out loud,
        // beats a scan that looks like a hang.
        const MAX_SPAN = (o.max_span != null) ? +o.max_span : 120000;
        if (xf - xi > MAX_SPAN) {
            try {
                graph.setMessage(' That is ' + Math.round((xf - xi) / 1000) + ' kb: select up to '
                    + Math.round(MAX_SPAN / 1000) + ' kb to scan for cryptic exons. ');
            } catch (e) { }
            return null;
        }

        const sp = ('' + (o.species || t.species || '')).toLowerCase();
        const mouse = /mouse|mus|mm9|mm10|mm39/.test(sp);
        const script = mouse ? 'py/splicing/cryptic-exon-finder-mm9.py'
            : 'py/splicing/cryptic-exon-finder.py';

        let W = null;
        try {
            W = await exec('baja/lib/working.js',
                'Cryptic exons in ' + (t.name || 'the track'),
                (mouse ? 'mm9' : 'GRCh38') + ' conservation over ' + (xf - xi) + ' nt.');
        } catch (e) { W = null; }

        try {
            const r = await exec(script, t.getSequenceRange(xi, xf), t.chr, xi, xf, t.strand);
            if (r && r.status === 'file_downloading') {
                try { if (W) W.done(); } catch (e) { }
                try {
                    graph.setMessage(' The conservation file is downloading. This happens once and '
                        + 'can take several minutes; run it again when it is done. ');
                } catch (e) { }
                return { downloading: true };
            }
            const CE = await exec('baja/bio/splicing/cryptic-exons');
            const found = CE.generateCrypticExons(r, { xiAnchor: xi }) || [];
            for (const cry of found) t.add(cry);
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { if (W) W.done(); } catch (e) { }
            // NONE IS A RESULT. The old path added nothing and said nothing, which reads
            // exactly like the model never ran.
            try {
                graph.setResultMessage(' Cryptic exons · ' + (t.name || 'track') + ' · '
                    + (found.length
                        ? (found.length + ' candidate' + (found.length === 1 ? '' : 's')
                            + ' added over ' + (xf - xi) + ' nt')
                        : ('nothing over the threshold in those ' + (xf - xi) + ' nt'))
                    + ' · ' + (mouse ? 'mm9' : 'GRCh38') + ' conservation ');
            } catch (e) { }
            return { added: found.length, xi: xi, xf: xf, species: mouse ? 'mouse' : 'human' };
        } catch (e) {
            try { if (W) W.fail('Cryptic exon finder: ' + ((e && e.message) ? e.message : e)); } catch (e2) { }
            throw e;
        }
    })();
}

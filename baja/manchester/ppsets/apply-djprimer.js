function (djresult, xoffset, track, graph) {
    // Place djPrimer hits on the track as AMPLICON objects only. djPrimer designs
    // with primer3 and ranks by assay-success; each hit carries a forward/reverse
    // primer + amplicon coords. We build a plain Amplicon (type 'amplicon') directly
    // from those coords — no primer-probe chemistry objects, no probe/mid — so the
    // track only gets amplicon-typed objects. Coordinates match what createPrimerProbe
    // would produce: local x = track.xi + xoffset + amp position.
    return new Promise(async (resolve) => {
        const hits = (djresult && djresult.hits) || [];
        if (!hits.length) { graph && graph.setMessage && graph.setMessage(' No djPrimer amplicons to place. '); resolve(0); return; }

        const Amplicon = await exec('flexigraph/amplicon.js');
        const Oligo = await exec('flexigraph/oligo.js');
        const base = (+track.xi || 0) + (+xoffset || 0);
        const strand = track.strand;


        // showModal({
        //     wid: 'json',
        //     data: JSON.stringify(hits)
        // })



        // ---- Duplicate suppression ------------------------------------------------------
        // An amplicon is identified by where its two primers actually sit plus their
        // sequences. track.addOligo()'s own guard can't do this: it compares
        // synthesisSequence / structure / id, which a composite Amplicon never sets (they
        // are undefined on every amplicon), so it falls back to matching on name alone.
        // Two sources of duplicates this closes:
        //   • re-running djPrimer on a track that already carries its amplicons — every
        //     run used to append a second full set on top of the first
        //   • the same amplicon appearing twice in one result set (the backend dedupes by
        //     default, but only when options.dedupe is left on)
        const ampKey = (lxi, rxf, f, r) => (Math.round(+lxi) + '|' + Math.round(+rxf) + '|' + f + '|' + r);
        const seen = new Set();
        try {
            for (const o of (track.oligos || [])) {
                if (!o || !o.left || !o.right) continue;   // only amplicon-shaped objects
                const k = ampKey(o.left.xi, o.right.xf, '' + (o.left.sequence || ''), '' + (o.right.sequence || ''));
                seen.add(k);
            }
        } catch (e) { }

        let placed = 0, skipped = 0;
        for (let i = 0; i < hits.length; i++) {
            const h = hits[i];
            const fwd = '' + (h.forward_primer || '');
            const rev = '' + (h.reverse_primer || '');
            const start = +h.amp_start || 0;
            const end = +h.amp_end || 0;
            if (!fwd.length || !rev.length || !(end > start)) continue;

            const key = ampKey(base + start, base + end, fwd, rev);
            if (seen.has(key)) { skipped++; continue; }
            seen.add(key);

            // left (forward) primer: [start .. start+len); right (reverse) primer: [end-len .. end)
            const lo = new Oligo('primer', fwd, fwd, base + start, base + start + fwd.length, 0.15);
            lo.sequence = fwd; lo.strand = strand;
            if (h.left_tm != null) lo.tm = +h.left_tm;
            const ro = new Oligo('primer', rev, rev, base + end - rev.length, base + end, 0.15);
            ro.sequence = rev; ro.strand = strand;
            if (h.right_tm != null) ro.tm = +h.right_tm;

            const amp = new Amplicon(lo, ro);          // no mid → bare amplicon, no probe object
            amp.strand = strand;
            // stagger vertically so overlapping amplicons stay individually visible/draggable
            amp.setY ? amp.setY(0.15 + (i % 7) * 0.1) : (amp.y = 0.15 + (i % 7) * 0.1);
            amp.size = +h.amp_len || (end - start);
            if (h.djprimer_probability != null) {
                const p = (+h.djprimer_probability).toFixed(2);
                amp.info = 'djPrimer p=' + p;
                amp.name = amp.name + ' p=' + p;
            }
            track.addOligo(amp);
            placed++;
        }

        if (graph && graph.wake) graph.wake();
        if (graph && graph.setMessage) graph.setMessage(' Placed ' + placed + ' djPrimer amplicon' + (placed === 1 ? '' : 's')
            + (skipped ? (' — ' + skipped + ' duplicate' + (skipped === 1 ? '' : 's') + ' skipped') : '')
            + ' on ' + (track.name || 'track') + '. ');
        resolve(placed);
    });
}

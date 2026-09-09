function (djresult, xoffset, track, graph) {
    // Place djPrimer hits on the track as AMPLICON objects. djPrimer designs with primer3
    // and ranks by assay-success; each hit carries a forward/reverse primer, amplicon
    // coords, and — when the design asked for one — a hydrolysis probe with its own span.
    // Coordinates match what createPrimerProbe would produce: local x = track.xi +
    // xoffset + amp position.
    //
    // THE PROBE IS PLACED, not just recorded. It used to be kept as amp.probeSequence and
    // nothing else, so a TaqMan set was drawn as two primers with an empty middle: the
    // third oligo of the assay, the one that carries the dye and decides whether the assay
    // reports at all, had no position on the canvas and no numbers beside it. It is built
    // as a real mid Oligo now, which is what every probe-aware surface downstream reads —
    // the off-target scan's [left, right, mid] loop, the export's probe column, the design
    // summary, and Amplicon.draw's maroon bar.
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
        // WHAT MAKES TWO AMPLICONS THE SAME ONE: where it sits and which primers it uses.
        //
        // The probe was briefly part of this key, on the reasoning that a pair with and
        // without a hydrolysis probe are different assays. In practice that broke re-running:
        // until probes were switched on, every amplicon on every track was designed WITHOUT
        // one, so its key component was empty while the same amplicon designed today carries
        // a probe. The keys stopped matching, the guard stopped firing, and a second copy
        // landed on the first -- same coordinates, pushed to a different row by addOligo's
        // stacking, which is what "duplicates at the same x" looked like.
        //
        // A probe does not move an amplicon or change its primers, so it does not make it a
        // different amplicon on the track. Where the existing one has no probe and the new
        // hit has one, the answer is to give the existing one its probe (below), not to place
        // a second amplicon beside it.
        const ampKey = (lxi, rxf, f, r) => (Math.round(+lxi) + '|' + Math.round(+rxf) + '|' + f + '|' + r);

        // Tm and GC as the DESIGNER computed them (primer3 nearest-neighbour), stamped with
        // the sequence they describe so Amplicon.draw keeps them instead of overwriting them
        // with its own Wallace/Marmur estimate — and still falls back to that estimate if
        // the oligo is later edited. See the designTmSeq note in flexigraph/amplicon.js.
        const stampDesign = (o, tm, gc, seq) => {
            const t = +tm, g = +gc;
            let any = false;
            if (isFinite(t) && t > 0) { o.tm = t; any = true; }
            if (isFinite(g) && g > 0) { o.gc = g; any = true; }
            if (any) o.designTmSeq = seq;
        };
        // Keyed to the OBJECT, not just remembered as present, so a repeat hit can reach the
        // amplicon already on the track and add the probe it was missing.
        const seen = new Map();
        try {
            for (const o of (track.oligos || [])) {
                if (!o || !o.left || !o.right) continue;   // only amplicon-shaped objects
                const k = ampKey(o.left.xi, o.right.xf, '' + (o.left.sequence || ''), '' + (o.right.sequence || ''));
                if (!seen.has(k)) seen.set(k, o);
            }
        } catch (e) { }

        let placed = 0, skipped = 0, upgraded = 0;
        for (let i = 0; i < hits.length; i++) {
            const h = hits[i];
            const fwd = '' + (h.forward_primer || '');
            const rev = '' + (h.reverse_primer || '');
            const start = +h.amp_start || 0;
            const end = +h.amp_end || 0;
            if (!fwd.length || !rev.length || !(end > start)) continue;

            // The probe. Its span comes from the designer (primer3's PRIMER_INTERNAL
            // interval, carried through as probe_start/probe_end on the same frame as
            // amp_start/amp_end). A hit from an older run predates those fields, so fall
            // back to locating the probe inside the amplicon — and if even that fails,
            // place no probe rather than guess a position for an oligo that gets ordered.
            const probe = '' + (h.probe || '');
            let mo = null;
            if (probe.length) {
                let ps = +h.probe_start, pe = +h.probe_end;
                if (!(isFinite(ps) && isFinite(pe) && pe > ps && ps >= 0)) {
                    const amplicon = '' + (h.amplicon || '');
                    const k = amplicon.indexOf(probe);
                    if (k >= 0) { ps = start + k; pe = ps + probe.length; }
                    else { ps = pe = NaN; }
                }
                if (isFinite(ps) && isFinite(pe) && pe > ps) {
                    mo = new Oligo('probe', probe, probe, base + ps, base + pe, 0.15);
                    mo.sequence = probe; mo.synthesisSequence = probe; mo.strand = strand;
                    stampDesign(mo, h.probe_tm, h.probe_gc, probe);
                }
            }

            const key = ampKey(base + start, base + end, fwd, rev);
            const already = seen.get(key);
            if (already) {
                // UPGRADE RATHER THAN DUPLICATE. The amplicon is already here; the only thing
                // this run can add is the probe, for the amplicons designed back when the
                // designer was not asked for one. Everything else about it is unchanged, so
                // nothing else is touched.
                if (mo && !already.mid) {
                    already.mid = mo;
                    already.probeSequence = probe;
                    upgraded++;
                } else {
                    skipped++;
                }
                continue;
            }
            seen.set(key, null);   // claimed by this run; the object is set once it is built

            // left (forward) primer: [start .. start+len); right (reverse) primer: [end-len .. end)
            const lo = new Oligo('primer', fwd, fwd, base + start, base + start + fwd.length, 0.15);
            lo.sequence = fwd; lo.strand = strand;
            stampDesign(lo, h.left_tm, h.left_gc, fwd);
            const ro = new Oligo('primer', rev, rev, base + end - rev.length, base + end, 0.15);
            ro.sequence = rev; ro.strand = strand;
            stampDesign(ro, h.right_tm, h.right_gc, rev);

            const amp = new Amplicon(lo, ro, mo);
            amp.strand = strand;
            // stagger vertically so overlapping amplicons stay individually visible/draggable
            amp.setY ? amp.setY(0.15 + (i % 7) * 0.1) : (amp.y = 0.15 + (i % 7) * 0.1);
            amp.size = +h.amp_len || (end - start);
            // Kept alongside the mid Oligo: the design report and the exports read
            // probeSequence, and a hit whose probe could not be given a position (see above)
            // still has a sequence worth reporting even though there is nothing to draw.
            if (probe.length) amp.probeSequence = probe;
            if (h.djprimer_probability != null) {
                const p = (+h.djprimer_probability).toFixed(2);
                amp.info = 'djPrimer p=' + p;
                amp.name = amp.name + ' p=' + p;
            }
            track.addOligo(amp);
            seen.set(key, amp);
            placed++;
        }

        if (graph && graph.wake) graph.wake();
        // setResultMessage, not setMessage: the canvas only paints error and result toasts,
        // so the line saying what a run produced was being written to a surface that is never
        // drawn -- the design finished and nothing said so.
        const withProbe = ((track.oligos || []).filter((o) => o && o.left && o.right && o.mid)).length;
        const msg = ' Placed ' + placed + ' djPrimer amplicon' + (placed === 1 ? '' : 's')
            + (upgraded ? (' — added the probe to ' + upgraded + ' already here') : '')
            + (skipped ? (' — ' + skipped + ' already here, unchanged') : '')
            + ' on ' + (track.name || 'track') + '. '
            + (withProbe ? (withProbe + ' of them carry a hydrolysis probe. ') : 'No probes (SYBR). ');
        if (graph) {
            try { graph.setResultMessage(msg); } catch (e) { try { graph.setMessage(msg); } catch (e2) { } }
        }
        resolve(placed);
    });
}

function (graph, oligo, genegraph_panel_layout) {

    // "Map to all tracks": take this compound's sequence, find its exact locus (0 mismatches — the
    // sequence itself and its reverse-complement, the ASO target site) on every NON-compound track,
    // create a copy of the compound at each locus, and view-all + zoom into each track in real time
    // as the copies are added.

    return (async () => {
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        const Oligo = await exec('flexigraph/oligo.js');
        const SIRNA = await exec('flexigraph/sirna.js');
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

        // The compound's search sequence (uppercased DNA alphabet; U→T so RNA/DNA tracks both match).
        const seq = ('' + (oligo.synthesisSequence || oligo.sequence || '')).toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
        if (seq.length < 6) { say(' This compound has no usable sequence to map. '); return graph; }
        const revComp = (s) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');
        const rc = revComp(seq);
        const findAll = (text, pat) => { const out = []; if (!pat || !text) return out; let i = text.indexOf(pat); while (i >= 0) { out.push(i); i = text.indexOf(pat, i + 1); } return out; };

        const isCompoundTrack = (t) => !!(t && (t.track_type === 'clincial_compound' || t.track_type === 'clinical_compound'));
        const isDuplex = (oligo.type === 'siRNA' || (oligo.sense && oligo.antisense));

        // Collect all loci first so we know the total (and can report), then place with animation.
        const jobs = [];
        for (const t of (graph.track || []).slice()) {
            if (!t || !t.sequence || isCompoundTrack(t)) continue;
            if (t.oligos && t.oligos.indexOf(oligo) >= 0) continue;   // skip the compound's own track
            const tseq = ('' + t.sequence).toUpperCase().replace(/U/g, 'T');
            const seen = {};
            const add = (idx, len) => { const k = idx + ':' + len; if (!seen[k]) { seen[k] = 1; jobs.push({ track: t, idx: idx, len: len }); } };
            for (const idx of findAll(tseq, seq)) add(idx, seq.length);
            if (rc !== seq) for (const idx of findAll(tseq, rc)) add(idx, rc.length);
        }

        if (!jobs.length) { say(' No exact locus found on any track. '); return graph; }
        say(' Mapping ' + jobs.length + ' locus/loci across tracks… ');

        let placed = 0;
        for (const job of jobs) {
            const t = job.track;
            const xi = t.xi + job.idx;
            const xf = xi + job.len;
            const yLane = (t.tgraph && t.tgraph.ymax != null) ? (t.tgraph.ymax - 0.2) : ((t.y || 0) + 0.5);
            let clone = null;
            try {
                if (isDuplex) {
                    clone = new SIRNA('siRNA', oligo.synthesisSequence, oligo.sense, oligo.antisense, xi, xf, yLane, t.strand || 1, oligo.structure);
                    clone.sense = oligo.sense; clone.antisense = oligo.antisense;
                    clone.synthesisSequence = oligo.synthesisSequence; clone.structure = oligo.structure;
                } else {
                    clone = new Oligo(oligo.type || 'aso', oligo.sequence || seq, oligo.structure, xi, xf, yLane);
                    clone.synthesisSequence = oligo.synthesisSequence || oligo.sequence || seq;
                    clone.strand = t.strand || 1; clone.structure = oligo.structure;
                }
                clone.name = oligo.name || 'compound';
                if (oligo.color) clone.color = oligo.color;
                t.addOligo(clone);
                clone.__track = t;   // so off-target framing zooms to the right track
                placed++;
            } catch (e) { continue; }

            // Real time: view all, then zoom into the track this copy just landed on.
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { if (graph.viewAllTracks) await graph.viewAllTracks(); } catch (e) { }
            await sleep(450);
            try { if (graph.zoomToTrack) await graph.zoomToTrack(t); } catch (e) { }
            // Magenta landing burst once the view settles on the copy — visible even zoomed out.
            try { if (clone && clone.landingBurst) clone.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { }
            await sleep(650);
        }

        try { if (graph.viewAllTracks) await graph.viewAllTracks(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        say(' Mapped ' + placed + ' copy/copies of ' + (oligo.name || 'the compound') + ' across tracks. ');
        return graph;
    })();
}

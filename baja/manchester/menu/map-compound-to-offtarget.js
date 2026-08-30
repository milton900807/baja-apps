function (graph, oligo, hit, editDistance) {

    // From the "View off-targets" summary: load an off-target transcript as a NEW track, map the
    // compound onto it at its binding site (allowing the SAME edit distance the off-target run used,
    // Hamming mismatches), then view-all and — after 1s — zoom into the new compound.

    return (async () => {
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        const Oligo = await exec('flexigraph/oligo.js');
        const SIRNA = await exec('flexigraph/sirna.js');
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
        const ed = Number.isFinite(+editDistance) ? Math.max(0, +editDistance) : 0;
        const toDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
        const revComp = (s) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');

        // 1) Load the off-target transcript / gene as a new track.
        const id = ('' + ((hit && (hit.chr || hit.transcript || hit.symbol || hit.gene)) || '')).trim();
        if (!id) { say(' No transcript id for this off-target. '); return graph; }
        const before = new Set((graph.track || []).map((t) => t));
        say(' Loading ' + id + ' …');
        let track = null;
        try { track = await graph.add(id, 10, 10); } catch (e) { }
        // graph.add may resolve a track, the graph, or nothing — locate the newly-added track.
        if (!track || !track.sequence) {
            const added = (graph.track || []).filter((t) => t && !before.has(t));
            track = added.length ? added[added.length - 1] : (graph.track || [])[(graph.track || []).length - 1];
        }
        if (!track || !track.sequence) { say(' Could not load ' + id + '. '); return graph; }

        // 2) Find the compound's binding site on the track, allowing `ed` mismatches (Hamming). The
        //    ASO binds the reverse-complement (target site) of its synthesis sequence.
        const tseq = toDNA(track.sequence);
        const aso = toDNA(oligo.synthesisSequence || oligo.sequence);
        const L = aso.length;
        let best = -1, bestMm = ed + 1;
        if (L >= 6 && tseq.length >= L) {
            for (const pat of [revComp(aso), aso]) {
                if (!pat || pat.length !== L) continue;
                for (let i = 0; i + L <= tseq.length; i++) {
                    let mm = 0;
                    for (let k = 0; k < L; k++) { if (tseq[i + k] !== pat[k]) { mm++; if (mm > ed) break; } }
                    if (mm <= ed && mm < bestMm) { best = i; bestMm = mm; if (mm === 0) break; }
                }
                if (best >= 0 && bestMm === 0) break;
            }
        }
        if (best < 0 && hit && Number.isFinite(+hit.start)) best = +hit.start;   // fall back to the reported locus
        if (best < 0) best = 0;

        // 3) Place a copy of the compound at the binding site.
        const xi = track.xi + best;
        const xf = xi + (L || 1);
        const yLane = (track.tgraph && track.tgraph.ymax != null) ? (track.tgraph.ymax - 0.2) : ((track.y || 0) + 0.5);
        let clone = null;
        try {
            if (oligo.type === 'siRNA' || (oligo.sense && oligo.antisense)) {
                clone = new SIRNA('siRNA', oligo.synthesisSequence, oligo.sense, oligo.antisense, xi, xf, yLane, track.strand || 1, oligo.structure);
                clone.sense = oligo.sense; clone.antisense = oligo.antisense;
                clone.synthesisSequence = oligo.synthesisSequence; clone.structure = oligo.structure;
            } else {
                clone = new Oligo(oligo.type || 'aso', oligo.sequence || aso, oligo.structure, xi, xf, yLane);
                clone.synthesisSequence = oligo.synthesisSequence || oligo.sequence || aso;
                clone.strand = track.strand || 1; clone.structure = oligo.structure;
            }
            clone.name = oligo.name || 'compound';
            if (oligo.color) clone.color = oligo.color;
            track.addOligo(clone);
            clone.__track = track;
        } catch (e) { say(' Could not place the compound: ' + (e && e.message ? e.message : e)); }

        // 4) Animate-zoom to view the new track; wait ~2s after mapping/adding; then animate-zoom
        //    into the only compound on the track.
        try { if (graph.wake) graph.wake(); } catch (e) { }
        try { if (graph.viewAllTracks) await graph.viewAllTracks(); } catch (e) { }
        await sleep(2000);
        try {
            const g = track.tgraph;
            const xpad = Math.max(4, (xf - xi) * 0.25);
            const yA = g.yi, yB = g.yi + (g.height || 0);
            const cy = (yA + yB) / 2, span = Math.abs(yB - yA) || 1, yhalf = span * 1.6;
            if (graph.zoomRect) await graph.zoomRect(xi - xpad, xf + xpad, cy + yhalf, cy - yhalf, 340);
            else if (graph.zoomToTrack) await graph.zoomToTrack(track);
        } catch (e) { try { if (graph.zoomToTrack) await graph.zoomToTrack(track); } catch (e2) { } }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        say(' Mapped ' + (oligo.name || 'compound') + ' onto ' + (track.name || id) + ' (' + bestMm + (bestMm === 1 ? ' mismatch' : ' mismatches') + '). ');
        return graph;
    })();
}

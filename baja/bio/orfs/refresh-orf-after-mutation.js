function (track, graph, before) {

    // RE-TRANSLATE AFTER A MUTATION. Every "Mutate" path calls this once the track's sequence has
    // changed, so the peptide drawn above the track is the peptide of the sequence now on it.
    //
    //   const before = track.orf && track.orf.sequence;      // capture first
    //   ... mutate ...
    //   await exec('baja/bio/orfs/refresh-orf-after-mutation.js', track, graph, before)
    //
    // Only a track that HAS a peptide is re-translated: one with an ORF already, or with CDS /
    // Translation annotations to build one from. track.updateCDS() (which the mutators call) skips
    // any track without both a TSS and a STOP annotation, and the Mutate menus did not all call
    // generateORF themselves, so a peptide could survive the edit unchanged.
    //
    // Resolves { changed, before, after, summary } and says what happened to the protein.
    return (async () => {
        const has = () => {
            if (track && track.orf && track.orf.sequence) return true;
            return (track && track.annotations || []).some((a) => {
                const t = ('' + (a && a.type)).toLowerCase();
                return t === 'cds' || t === 'translation';
            });
        };
        if (!track || typeof track.generateORF !== 'function' || !has()) return { changed: false };
        const was = (before != null) ? ('' + before) : '';
        try { track.generateORF(); } catch (e) { }
        const now = (track.orf && track.orf.sequence) ? ('' + track.orf.sequence) : '';
        try { if (graph && graph.wake) graph.wake(); } catch (e) { }

        // What changed, in protein terms: the first residue that differs.
        let summary = '';
        if (was && now && was !== now) {
            let i = 0;
            while (i < was.length && i < now.length && was[i] === now[i]) i++;
            const pos = i + 1;
            if (now.length < was.length && now.length === i) {
                summary = 'premature stop at residue ' + pos + ' (' + was[i] + pos + '*), protein ' + now.length + ' aa (was ' + was.length + ')';
            } else if (now.length !== was.length) {
                summary = 'protein changes from residue ' + pos + ' (' + was[i] + pos + (now[i] || '?') + '), protein ' + now.length + ' aa (was ' + was.length + ')';
            } else {
                let diffs = 0;
                for (let k = 0; k < now.length; k++) if (now[k] !== was[k]) diffs++;
                // Most residues after the first change differ: the frame moved.
                if (diffs >= 2 && diffs >= 0.6 * (now.length - i)) summary = 'frameshift from residue ' + pos + ' (' + was[i] + pos + now[i] + 'fs)';
                else summary = was[i] + pos + now[i] + (diffs > 1 ? ' and ' + (diffs - 1) + ' more' : '');
            }
        } else if (was && now && was === now) {
            summary = 'no change to the protein';
        }
        try {
            if (graph && graph.setMessage && summary) graph.setMessage(' Peptide re-translated: ' + summary + '. ', 6);
        } catch (e) { }
        return { changed: !!(was && now && was !== now), before: was, after: now, summary };
    })();
}

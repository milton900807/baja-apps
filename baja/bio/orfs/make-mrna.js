function (graph, track, annotation, panel) {

    // BUILD THE SPLICED TRANSCRIPT AS A TRACK OF ITS OWN.
    //
    // "Create mRNA from DNM1" came back as nothing the editor can do, while two menus have
    // carried a Create mRNA item all along -- the same twenty lines, written out twice. The
    // catalogue is what the typed command can reach, so a thing that exists only in a
    // right-click menu does not exist to anybody who asks for it in words.
    //
    // One copy, here: both menus call it, and so does the operation. A third copy would have
    // been the third place to fix the next thing found wrong with it.
    //
    // WHAT IT MAKES. The exons, in transcription order, as one continuous sequence: a mature
    // mRNA with no introns, carrying its parent's species, transcript and gene identifiers
    // so the transcript-keyed layers (patents, BED hits, miRNA sites) still find it. Without
    // those it falls back to the NAME, which is now "<track>_mRNA" and matches nothing --
    // silently, on exactly the track somebody builds to design against.
    //
    // CDNA here means the spliced transcript; any other annotation name builds that
    // annotation instead and names the track after it.

    return new Promise(async (resolve) => {
        try {
            const g = graph;
            const t = track;
            if (!g || !t) { resolve({ error: 'there is no track to build from' }); return; }

            const seq = ('' + (t.sequence || ''));
            if (!seq) {
                resolve({ error: ('' + (t.name || 'that track')) + ' has no sequence loaded, so '
                    + 'there is nothing to splice' });
                return;
            }
            const ann = ('' + (annotation == null ? '' : annotation)).trim() || 'CDNA';

            if (typeof t.createTrackFromAnnotation !== 'function') {
                resolve({ error: 'this track cannot be spliced' });
                return;
            }
            const made = t.createTrackFromAnnotation(ann);
            if (!made) {
                resolve({ error: 'nothing came back: ' + ('' + (t.name || 'that track'))
                    + ' may have no exons annotated on it' });
                return;
            }
            // An mRNA with no exons annotated is the whole genomic span under another name,
            // which looks like it worked and is not an mRNA.
            const exons = exonsOfTrack(t);
            if (/^(cdna|mrna)$/i.test(ann) && exons.length < 1) {
                resolve({ error: ('' + (t.name || 'that track')) + ' has no exons annotated, so a '
                    + 'spliced transcript cannot be built from it' });
                return;
            }

            made.targetPhase = t.targetPhase;
            g.track.push(g.ensureUniqueTrackName ? g.ensureUniqueTrackName(made) : made);
            // Data is mirrored from the parent by the per-draw diff sync.
            try { made.syncFromParent(); } catch (e) { }
            try { g.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js'); } catch (e) { }
            try { g.deselectAllTracks(); } catch (e) { }
            try { made.select(); } catch (e) { }
            try {
                g.animateTo(made.tgraph.xi - 100,
                    made.tgraph.xi + made.tgraph.width + 100,
                    made.tgraph.Y(-3), made.tgraph.Y(3));
            } catch (e) { }

            // On a phone the canvas is not what is on screen, so the new track would be built
            // out of sight.
            try {
                if (isMobile() && panel) {
                    CurrentLayout.clearComponent('mainPanel');
                    CurrentLayout.setComponent('mainPanel', panel);
                }
            } catch (e) { }

            const len = ('' + (made.sequence || '')).length;
            try {
                g.setMessage(made.name + ': ' + len.toLocaleString() + ' nt from '
                    + exons.length + ' exon' + (exons.length === 1 ? '' : 's'), 6);
            } catch (e) { }

            resolve({ track: made.name, length: len, exons: exons.length, from: t.name });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

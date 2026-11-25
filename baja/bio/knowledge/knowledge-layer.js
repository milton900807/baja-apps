function (graph, track, placed, meta) {

    // WHAT THE LITERATURE PUTS IN THIS STRETCH, DRAWN ON IT.
    //   await exec('baja/bio/knowledge/knowledge-layer.js', graph, track, placed, meta);
    //
    // One interval per feature, at coordinates worked out by finding the publication's own
    // sequence inside the selection, never at coordinates a model stated. The label on the
    // band says what it is; the "?" beside the layer's name opens the rest: what each
    // feature is, which paper it comes from, and how far that paper's stated position was
    // from where its sequence actually turned out to be.
    //
    // It is a LAYER, not annotations on the track. A track's annotations are what that
    // track is; these are claims from outside it, some of which will be wrong, and they
    // should be removable in one action and obviously separate from the exons. The layer
    // says so in its own name.

    return (async () => {
        const list = (placed || []).filter((p) => p && isFinite(+p.xi) && isFinite(+p.xf));
        if (!list.length) return null;
        const m = meta || {};
        const TrackLayer = await exec('baja/bio/track-layer.js');

        const lo = Math.min(...list.map((p) => +p.xi));
        const hi = Math.max(...list.map((p) => +p.xf));
        const name = 'Knowledge: ' + (m.label || 'literature');
        const L = new TrackLayer(name, lo, 0, hi, 1);
        L.type = 'KnowledgeLayer';
        L.color = 'rgba(167,139,250,0.55)';
        L.labelColor = '#eaf6f9';
        L.fixedIntervalDepth = 12;

        // COLOUR BY WHAT IT IS, so a reader can tell a cryptic exon from a binding site
        // without reading every label.
        const COLOR = {
            'cryptic exon': 'rgba(74,222,128,0.55)',
            'pseudo-exon': 'rgba(74,222,128,0.45)',
            'splice site': 'rgba(125,211,252,0.6)',
            'branch point': 'rgba(251,191,36,0.6)',
            'polypyrimidine tract': 'rgba(251,191,36,0.4)',
            'regulatory element': 'rgba(167,139,250,0.55)',
            'rbp site': 'rgba(244,114,182,0.55)',
            'mirna site': 'rgba(244,114,182,0.4)',
            'variant': 'rgba(248,113,113,0.6)',
            'repeat': 'rgba(159,196,212,0.4)'
        };

        const rows = [];
        for (const p of list) {
            L.addInterval(+p.xi, +p.xf, 0.5, ('' + (p.label || '')), COLOR[p.kind] || L.color);
            const cite = (p.evidence && (p.evidence.title || p.evidence.url))
                ? ((p.evidence.title || p.evidence.url)
                    + (p.evidence.year ? (', ' + p.evidence.year) : ''))
                : 'no citation given';
            // HOW FAR THE SOURCE WAS OUT, when it stated a position at all. A paper whose
            // coordinates are three kilobases from its own sequence is worth knowing about
            // before anything else it says is believed.
            const off = (p.stated_off_by != null && p.stated_off_by !== 0)
                ? (' · the source put it ' + Math.abs(p.stated_off_by) + ' bases '
                    + (p.stated_off_by > 0 ? 'earlier' : 'later'))
                : '';
            rows.push([('' + (p.label || 'feature')),
                ((p.what || p.kind || '') + ' · ' + cite + off).trim()]);
        }

        L.decor = {
            help: {
                title: name,
                rows: rows,
                // THE PROVENANCE OF THE WHOLE LAYER, said where the features are read. Every
                // band here was placed by finding the publication's sequence in this track,
                // so what is drawn is at least the same piece of DNA the paper was about.
                // That is not the same as the claim being right.
                note: 'Each band is a published claim, placed by finding the publication’s own '
                    + 'sequence in this stretch: the position is measured here, not taken from the '
                    + 'source. Nothing here is a finding about your data, and a claim can be '
                    + 'wrong while its sequence matches.'
                    + (m.unplaceable ? (' ' + m.unplaceable + ' further claim'
                        + (m.unplaceable === 1 ? ' was' : 's were') + ' left out: their sequence '
                        + 'could not be found here.') : '')
                    + (m.searched === false ? ' Web search was not available, so these come from '
                        + 'the model’s own knowledge and are uncited.' : '')
            }
        };
        // The placed features themselves, for anything that wants to read them back.
        L.knowledge = list;

        try { track.addLayer(L); } catch (e) { try { (track.track_layers || []).push(L); } catch (e2) { } }
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        return L;
    })();
}

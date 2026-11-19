function (graph, tracks, opts) {

    // TAKE LAYERS OFF A TRACK.
    //   exec('baja/bio/remove-layers.js', graph, [track], { match: 'rna seq' })
    //
    // "remove the rna seq layers from mapk8ip3_mrna" was answered by opening the shelf of
    // data that can be LOADED, which is the opposite of what was asked. Loading had an
    // operation and unloading did not.
    //
    // WHAT IS REMOVED IS NAMED BEFORE IT GOES, and the names come back in the result so the
    // card can say them. A removal that reports "3 layers removed" is one the user cannot
    // check: the only way to find out which three is to look for what is missing.
    //
    // MATCHED ON BOTH THE KIND AND THE NAME. A layer carries a data_type -- RNASeq, SLIM,
    // CDD -- which is what "the rna seq layers" means, and it carries a name, which is what
    // someone means when they point at one by what it is called. Matching only the name
    // misses a track whose RNA-seq layer is called GRCh38illuminabrain1, and there is no
    // reason for the user to know that is RNA-seq.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            const ts = (tracks || []).filter(Boolean);
            if (!ts.length) { resolve({ error: 'no track to take layers off' }); return; }

            const want = ('' + (o.match || '')).trim().toLowerCase();
            const all = !want || /^(all|every|everything)$/.test(want);

            // The kinds a request names in words, against the data_type a layer carries.
            const KINDS = [
                [/\b(rna.?seq|rnaseq|expression|coverage|reads)\b/, ['RNASEQ']],
                [/\b(motifs?|slims?|elm|linear motifs?)\b/, ['SLIM']],
                [/\b(domains?|cdd|sites?)\b/, ['CDD']],
                [/\b(similarity|similar regions?|map|homology)\b/, ['SEQSIM']],
                [/\b(splicing|splice|sashimi|junctions?)\b/, ['SPLICING']],
                [/\b(bed|intervals?)\b/, ['BED']],
                [/\b(patents?)\b/, ['PATENTS']],
                [/\b(secretion)\b/, ['SECRETION', 'SECRETION:POLY']],
                [/\b(ip|clip|binding)\b/, ['IP', 'IPEXONSPACE']]
            ];
            let kinds = [];
            for (const [re, ks] of KINDS) { if (re.test(want)) kinds = kinds.concat(ks); }

            const hit = (l) => {
                if (all) return true;
                const dt = ('' + ((l && l.data_type) || '')).toUpperCase();
                for (const k of kinds) { if (dt === k || dt.indexOf(k) === 0) return true; }
                const nm = ('' + ((l && l.name) || '')).toLowerCase();
                // The name, with and without its punctuation, so "rna seq" finds a layer
                // called rna_protein_measured and "rnaseq" finds one called RNA-seq.
                const flat = (x) => x.replace(/[^a-z0-9]+/g, '');
                return nm.indexOf(want) >= 0 || flat(nm).indexOf(flat(want)) >= 0;
            };

            const removed = [], kept = [];
            for (const t of ts) {
                const layers = Array.isArray(t.track_layers) ? t.track_layers.slice() : [];
                const go = layers.filter(hit);
                const stay = layers.filter((l) => go.indexOf(l) < 0);
                for (const l of go) {
                    removed.push({ track: '' + (t.name || 'a track'), name: '' + ((l && l.name) || '(unnamed)'),
                        kind: '' + ((l && l.data_type) || '') });
                }
                for (const l of stay) kept.push('' + ((l && l.name) || '(unnamed)'));
                if (go.length) {
                    // NOTHING IS DESTROYED THAT CANNOT BE PUT BACK. The layers are held on
                    // the track they came off, so an undo has something to restore and a
                    // mistaken "remove all" is not the end of an afternoon's loading.
                    try {
                        t.__removedLayers = (t.__removedLayers || []).concat(go);
                        if (t.__removedLayers.length > 60) t.__removedLayers = t.__removedLayers.slice(-60);
                    } catch (e) { }
                    t.track_layers = stay;
                }
            }

            try { if (graph.wake) graph.wake(); } catch (e) { }

            if (!removed.length) {
                const names = [];
                for (const t of ts) for (const l of (t.track_layers || [])) names.push('' + ((l && l.name) || '?'));
                resolve({
                    removed: [], error: 'Nothing matched "' + (o.match || 'that') + '" on '
                        + ts.map((t) => t.name || 'a track').join(' and ')
                        + (names.length ? ('. The layers there are: ' + names.join(', ') + '.')
                            : '. That track has no layers on it.')
                });
                return;
            }

            try {
                graph.setMessage('Removed ' + removed.length + ' layer' + (removed.length === 1 ? '' : 's')
                    + ': ' + removed.map((r) => r.name).join(', ')
                    + (kept.length ? ('. Still there: ' + kept.join(', ')) : '. Nothing left on it')
                    + '.');
            } catch (e) { }

            resolve({ removed: removed, kept: kept, count: removed.length });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

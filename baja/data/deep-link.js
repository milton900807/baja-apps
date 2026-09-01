function (graph, genegraph_panel_layout, params) {
    // URL deep links: open a gene and pre-load data layers onto it, so a link can carry a
    // whole view instead of a screenshot.
    //
    //   /app/manchester/editor?gene=PDCD4&layer=mirtarbase10_strong
    //   /app/manchester/editor?gene=ENST00000280154&layer=mirtarbase10_strong,patents_2020_2025
    //   /app/manchester/editor?gene=PTEN,PDCD4&layer=mirtarbase10_all&species=human
    //
    //   gene | genes | transcript   one or more symbols (PDCD4) or transcript ids
    //                               (ENST…/ENSMUST…/NM_…), comma separated
    //   layer | layers              one or more keys from baja/data/layer-sets.js
    //   species                     for symbol lookup only; defaults to human
    //
    // Every param is optional and unknown ones are ignored, so this is safe to call at the
    // end of any app's startup: with no recognised param it does nothing at all. The URL is
    // deliberately left alone here — it IS the shareable artifact.
    //
    // `params` ({gene, layer, species}) overrides the URL, for an app that rewrites its own
    // address before this runs (manchester/viewer.js cleans the share path out of the URL,
    // so it captures the deep-link params first and hands them over).
    return (async () => {
        const P = (params && typeof params === 'object') ? params : {};
        const qp = (name) => {
            if (P[name] != null && ('' + P[name]).trim()) return ('' + P[name]).trim();
            try { return (new URL(window.location.href).searchParams.get(name) || '').trim(); }
            catch (e) { return ''; }
        };
        const list = (s) => ('' + s).split(',').map((x) => x.trim()).filter(Boolean);

        const genes = list(qp('gene') || qp('genes') || qp('transcript'));
        const layers = list(qp('layer') || qp('layers'));
        const species = qp('species') || 'human';
        if (!genes.length && !layers.length) return null;

        // Ensembl transcript ids for any organism (ENS[species]T#####) and RefSeq ids load
        // directly; anything else is a name and goes through the transcript resolver.
        const isTranscriptId = (w) => /^(ENS[A-Z]*T\d+(\.\d+)?|[NX][MR]_\d+(\.\d+)?)$/i.test('' + w);
        const stripV = (s) => ('' + (s || '')).split('.')[0].toUpperCase();

        const findLoaded = (tid, symbol) => {
            const tt = stripV(tid), sym = ('' + (symbol || '')).toLowerCase();
            for (const t of (graph.track || [])) {
                if (!t) continue;
                if (tt && (stripV(t.transcriptID) === tt || stripV(t.id) === tt || stripV(t.geneID) === tt)) return t;
                if (sym && ('' + (t.name || '')).toLowerCase() === sym) return t;
            }
            return null;
        };

        const resolve = async (word) => {
            if (isTranscriptId(word)) return word;
            // Same resolver the text-extract tool uses, so a deep link accepts whatever a
            // user would type into the app.
            const q = 'canonical ' + word + (species && species !== 'human' ? ' in ' + species : '');
            let em = new EngineMonitor(() => { });
            let res = null;
            try { res = await exec('/py/sequence/prompt-to-transcript.py', em, q); } catch (e) { return null; }
            let hits = [];
            try { hits = JSON.parse(res.transcripts); } catch (e) { hits = []; }
            if (!hits.length) return null;
            const pick = hits.find((x) => x.canonical) || hits[0];
            return (pick && pick.id) || null;
        };

        const SETS = await exec('baja/data/layer-sets.js');
        const wanted = [];
        for (const key of layers) {
            if (SETS[key]) wanted.push(SETS[key]);
            else graph.setMessage(' No layer "' + key + '". Known: ' + Object.keys(SETS).join(', ') + ' ');
        }

        const tracks = [];
        for (const g of genes) {
            graph.setMessage(' Opening ' + g + '… ');
            const tid = await resolve(g);
            if (!tid) { graph.setMessage(' Could not resolve "' + g + '" to a transcript. '); continue; }
            let track = findLoaded(tid, g);
            if (!track) {
                try { track = await graph.add(tid, null, null, null); } catch (e) { track = null; }
                // A transcript the reference does not carry comes back as an empty shell.
                const hasContent = track && ((('' + (track.sequence || '')).length > 0)
                    || (Array.isArray(track.annotations) && track.annotations.length > 0));
                if (!hasContent) {
                    try { if (track && graph.track) graph.track = graph.track.filter((x) => x !== track); } catch (e) { }
                    graph.setMessage(' No track for "' + g + '" (' + tid + '). ');
                    continue;
                }
                try { if (graph._autoLoadDomains) graph._autoLoadDomains(track); } catch (e) { }
            }
            tracks.push(track);
        }

        // Layers go on the tracks this link opened; with no gene param, on whatever the
        // screen already has, so ?layer= alone still does something sensible.
        const onto = tracks.length ? tracks : (graph.track || []).filter(Boolean);
        let loaded = 0;
        for (const track of onto) {
            for (const cfg of wanted) {
                try { loaded += (await exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg, track)) || 0; }
                catch (e) { graph.setMessage(' Could not load ' + cfg.label + ': ' + e + ' '); }
            }
        }

        try { if (graph.wake) graph.wake(); } catch (e) { }
        if (wanted.length) {
            graph.setMessage(' ' + loaded + ' feature' + (loaded === 1 ? '' : 's') + ' from '
                + wanted.length + ' layer' + (wanted.length === 1 ? '' : 's') + ' on '
                + onto.length + ' track' + (onto.length === 1 ? '' : 's') + '. ');
        }
        return { tracks: tracks, layers: wanted.map((c) => c.key), features: loaded };
    })();
}

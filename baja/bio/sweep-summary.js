function (graph, o) {
    // The end of a model sweep over many tracks, shown in the same panel as a layer label's "?"
    // (baja/bio/decor-help.js) instead of a canvas message that is gone in a few seconds.
    //
    //   exec('baja/bio/sweep-summary.js', graph, {
    //     title:    'RNA–protein coupling: 4 of 5 tracks',
    //     results:  [{ name, r }],     r = what runOnTrack returned: { term, text, layer, ... } or falsy
    //     summary:  (ok) => '...',     one line over the scored results (ok = the r objects)
    //     about:    [[term, meaning]], rows after the per-track ones
    //     note:     '...',
    //     fallback: ' ... '            the message to show if nothing was scored
    //   })
    //
    // One track: that track's own panel, as a single-track run shows. None scored: the
    // fallback message, since an empty panel explains nothing.
    return (async () => {
        const results = (o && o.results) || [];
        const ok = results.filter((x) => x.r && typeof x.r === 'object').map((x) => x.r);
        const say = (m) => { try { graph.setResultMessage(m); } catch (e) { try { graph.setMessage(m); } catch (e2) { } } };
        if (!ok.length) { say(o.fallback || ' Nothing was scored. '); return false; }
        let layer = null;
        if (results.length === 1 && ok[0].layer && ok[0].layer.decor && ok[0].layer.decor.help) {
            layer = ok[0].layer;
        } else {
            let summary = '';
            try { summary = o.summary ? o.summary(ok) : ''; } catch (e) { summary = ''; }
            const rows = [];
            if (summary) rows.push(['summary', summary]);
            for (const x of results) {
                const r = x.r;
                if (!r || typeof r !== 'object') rows.push([x.name, 'Not scored: no protein-coding sequence or gene could be read from this track, or the lookup failed.']);
                else rows.push([r.term || x.name, r.text || '']);
            }
            for (const a of (o.about || [])) rows.push(a);
            rows.push(['on each track', 'The layer with its label above the track; press that label\'s "?" for the full explanation of one gene.']);
            layer = { decor: { help: { title: o.title || 'Results', rows: rows, note: o.note || '' } } };
        }
        try { graph.setMessage(' '); } catch (e) { }
        try { await exec('baja/bio/decor-help.js', layer, graph); return true; }
        catch (e) { say(o.fallback || ''); return false; }
    })();
}

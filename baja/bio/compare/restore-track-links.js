function (graph) {

    // THE LINES BETWEEN TRACKS, BACK AFTER A RELOAD.
    //   await exec('baja/bio/compare/restore-track-links.js', graph)
    //
    // A link painter is closures over live track objects, so it cannot be written to a
    // file; what is written is graph.__linkSets, a plain record of the same lines with
    // track NAMES in place of the tracks. This turns that back into painters once the
    // tracks are on the canvas again.
    //
    // A NAME THAT IS NOT HERE IS A LINK THAT IS DROPPED, and the drop is counted and
    // reported rather than passed over: a document saved with four links and reopened with
    // two says so, because the alternative is a reader believing they are looking at the
    // whole comparison. A set that loses every link is removed from the record, so a file
    // saved again does not keep carrying lines to tracks nobody has.

    return (async () => {
        if (!graph) return { ok: false, why: 'no graph' };
        const sets = (graph.__linkSets || []).filter(Boolean);
        if (!sets.length) return { ok: true, restored: 0, dropped: 0 };

        const byName = new Map();
        for (const t of (graph.track || [])) {
            const n = ('' + ((t && t.name) || ''));
            if (n && !byName.has(n)) byName.set(n, t);
        }

        let restored = 0, dropped = 0;
        const kept = [];
        for (const set of sets) {
            const links = [];
            for (const L of (set.links || [])) {
                const a = byName.get('' + ((L && L.from && L.from.track) || ''));
                const b = byName.get('' + ((L && L.to && L.to.track) || ''));
                if (!a || !b) { dropped++; continue; }
                links.push({
                    from: { track: a, start: +L.from.start, end: +L.from.end, y: L.from.y },
                    to: { track: b, start: +L.to.start, end: +L.to.end, y: L.to.y },
                    label: L.label, color: L.color || null
                });
            }
            if (!links.length) continue;
            try {
                await exec('baja/bio/compare/track-link-layer.js', graph, links,
                    { id: set.id, color: set.color, labelColor: set.labelColor });
                restored += links.length;
                kept.push(set.id);
            } catch (e) { }
        }

        // track-link-layer rewrites __linkSets for every set it draws, so what is left over
        // is exactly the sets nothing could be drawn for.
        try {
            graph.__linkSets = (graph.__linkSets || []).filter((x) => x && kept.indexOf(x.id) >= 0);
        } catch (e) { }

        if (dropped) {
            try {
                graph.setResultMessage(' ' + dropped + ' line' + (dropped === 1 ? '' : 's')
                    + ' between tracks could not be restored: the track'
                    + (dropped === 1 ? '' : 's') + ' they joined are not open. '
                    + restored + ' of them came back. ');
            } catch (e) { }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        return { ok: true, restored: restored, dropped: dropped };
    })();
}

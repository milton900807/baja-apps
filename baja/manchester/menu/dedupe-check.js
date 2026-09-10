function (graph, layout, opts) {

    // Enforce the invariant "no two compounds on a track share an id", and offer to clean up
    // when it has been broken. Same id on a track happens two ways:
    //   - a real duplicate: an identical compound (same synthesis sequence) added twice, e.g.
    //     the server's sequence+structure verify handing two identical designs the same id;
    //   - an id collision: two DIFFERENT compounds that happened to land on the same id.
    // The two are treated differently, because deleting a distinct compound would lose work:
    // real duplicates are offered up for deletion (keep one of each), while collisions are
    // simply given a fresh id, which restores the invariant without touching the design.
    //
    //   exec('baja/manchester/menu/dedupe-check.js', graph, layout, { silentIfNone: true })
    //
    // silentIfNone: say nothing when there is nothing to do (for the automatic run after a
    // batch design). Omit it for a manual check, which then reports "none found".

    return (async () => {
        const o = opts || {};
        const tracks = (graph.track || []).filter(Boolean);
        const seqOf = (c) => ('' + ((c && (c.synthesisSequence || c.sequence)) || '')).toUpperCase();

        const redundant = [];        // exact copies to delete (keep the first of each id)
        const collisions = [];       // same id, different compound -> reassign a fresh id
        for (const t of tracks) {
            const byId = {};
            for (const c of (t.oligos || [])) {
                if (!c || c.id == null) continue;
                const key = '' + c.id;
                if (!byId[key]) { byId[key] = c; continue; }
                // A later compound shares an id already on this track.
                if (seqOf(c) === seqOf(byId[key])) redundant.push({ track: t, oligo: c });
                else collisions.push(c);
            }
        }

        // Collisions never need a decision: a distinct compound with a clashing id just gets a
        // new one. Do it whether or not there are duplicates to delete.
        const fixCollisions = () => {
            let n = 0;
            for (const c of collisions) {
                try {
                    c.id = (typeof uniqueInt === 'function') ? uniqueInt() : ('' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
                    n++;
                } catch (e) { }
            }
            return n;
        };

        if (!redundant.length && !collisions.length) {
            if (!o.silentIfNone) { try { graph.setMessage(' No compounds share an id on a track. '); } catch (e) { } }
            return { redundant: 0, collisions: 0 };
        }

        if (!redundant.length) {
            // Only collisions: repair quietly and note it.
            const n = fixCollisions();
            try { graph.setMessage(' Gave ' + n + ' compound' + (n === 1 ? '' : 's') + ' a fresh id so none clash on a track. '); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return { redundant: 0, collisions: n };
        }

        // There are real duplicates. Ask before deleting anything.
        const byTrack = {};
        for (const r of redundant) { const nm = (r.track && r.track.name) || 'a track'; byTrack[nm] = (byTrack[nm] || 0) + 1; }
        const where = Object.keys(byTrack).map((nm) => byTrack[nm] + ' on "' + nm + '"').join(', ');
        const N = redundant.length;
        const msg = 'Found ' + N + ' redundant compound' + (N === 1 ? '' : 's') + ' — an identical copy is already on the same track (' + where + '). '
            + 'Delete the extra cop' + (N === 1 ? 'y' : 'ies') + ', keeping one of each?';

        const doDelete = () => {
            try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
            const remove = new Set(redundant.map((r) => r.oligo));
            let n = 0;
            for (const t of tracks) {
                const before = (t.oligos || []).length;
                t.oligos = (t.oligos || []).filter((c) => !remove.has(c));
                n += before - t.oligos.length;
            }
            const c = fixCollisions();
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { if (graph.rescale) graph.rescale(); } catch (e) { }
            try {
                graph.setMessage(' Deleted ' + n + ' redundant compound' + (n === 1 ? '' : 's')
                    + (c ? (' and re-id\'d ' + c + ' more') : '') + '. Undo restores them. ');
            } catch (e) { }
        };

        try {
            const confirm = await exec('baja/lib/confirm.js', msg, () => { doDelete(); }, 'Delete redundant');
            showModal(confirm);
        } catch (e) {
            // No confirm dialog available: fix the invariant at least, without deleting.
            fixCollisions();
            try { if (graph.wake) graph.wake(); } catch (e2) { }
        }
        return { redundant: N, collisions: collisions.length };
    })();
}

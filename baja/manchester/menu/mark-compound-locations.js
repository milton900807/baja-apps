function (graph, opts) {

    // SHOW WHERE THE COMPOUNDS ARE, as down arrows over the track.
    //   exec('baja/manchester/menu/mark-compound-locations.js', graph, { scope: 'all' })
    //
    // A compound is drawn at its own coordinates, so at a wide view it is a fraction of a
    // pixel: a track with 47 oligos on it looks empty at 571 kb, which is exactly when
    // someone asks where they are. These arrows are drawn in screen units, so they are the
    // same size however far out the view is.
    //
    // They are ANNOTATIONS of type CompoundMark, not a layer of their own, because an
    // annotation already scrolls and zooms with the track and is already removable. Calling
    // it again clears the previous set rather than stacking a second one on top: the answer
    // to "where are they" is one set of arrows, not a darker and darker band.
    return (async () => {
        const F = await exec('baja/bio/compound-filter.js');
        const o = opts || {};
        const tracks = (graph.track || []).filter(Boolean);
        const MARK = 'CompoundMark';

        const selectedSet = () => {
            const s = new Set();
            for (const e of (graph.__lassoSelection || [])) { if (e && e.kind === 'oligo' && e.ref) s.add(e.ref); }
            for (const e of (graph.selectedCompounds || [])) { if (e && e.o) s.add(e.o); }
            return s;
        };
        const sel = selectedSet();
        const useSel = (o.scope === 'selected') || (o.scope !== 'all' && sel.size > 0);

        // Clear any previous marks first, on every track, including tracks this run will not
        // put marks on. Otherwise a second call with a narrower scope leaves the first call's
        // arrows behind and the picture is the union of two different questions.
        let cleared = 0;
        for (const t of tracks) {
            if (!Array.isArray(t.annotations)) continue;
            const before = t.annotations.length;
            t.annotations = t.annotations.filter((a) => !(a && a.type === MARK));
            cleared += before - t.annotations.length;
        }
        if (o.clear) {
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return { marked: 0, cleared: cleared, tracks: 0 };
        }

        let marked = 0, used = 0, noPosition = 0;
        for (const t of tracks) {
            const list = (t.oligos || []).filter((c) => !useSel || sel.has(c));
            if (!list.length) continue;
            let n = 0;
            for (const c of list) {
                // A compound's span on the track. xi/xf are what every other drawing path
                // uses; a compound without them cannot be placed and is counted, not guessed.
                const xi = +(c.xi != null ? c.xi : (c.start != null ? c.start : NaN));
                let xf = +(c.xf != null ? c.xf : (c.end != null ? c.end : NaN));
                if (!isFinite(xi)) { noPosition++; continue; }
                if (!isFinite(xf)) xf = xi + (F.lenOf(c) || 20);
                const a = new Annotation(MARK, ('' + (c.name || 'compound')), xi, xf, c.strand);
                // Flagged compounds in red, the rest amber: the same question the colours on
                // the compounds themselves answer, so the overview agrees with the detail.
                a.color = F.isRed(c) ? '#ef4444' : '#f59e0b';
                a.description = ('' + (c.name || 'compound'))
                    + (F.lenOf(c) ? (' · ' + F.lenOf(c) + ' nt') : '')
                    + (F.isRed(c) ? ' · flagged' : '');
                try { t.add(a); } catch (e) { try { t.annotations.push(a); } catch (e2) { continue; } }
                n++; marked++;
            }
            if (n) used++;
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        return { marked: marked, cleared: cleared, tracks: used,
            noPosition: noPosition, scope: useSel ? 'selected' : 'all' };
    })();
}

function (graph, opts) {

    // SHOW WHERE THE COMPOUNDS ARE, as down arrows over the track.
    //   exec('baja/manchester/menu/mark-compound-locations.js', graph, { scope: 'all' })
    //
    // A compound is drawn at its own coordinates, so at a wide view it is a fraction of a
    // pixel: a track with 47 oligos on it looks empty at 571 kb, which is exactly when
    // someone asks where they are. These arrows are drawn in screen units, so they are the
    // same size however far out the view is.
    //
    // It also FRAMES the track afterwards. The arrows were drawn at the user's current
    // window, which is the window that hid the compounds and prompted the question; marking
    // without moving the view answers nothing.
    //
    // They are ANNOTATIONS of type CompoundMark, not a layer of their own, because an
    // annotation already scrolls and zooms with the track and is already removable. Calling
    // it again clears the previous set rather than stacking a second one on top: the answer
    // to "where are they" is one set of arrows, not a darker and darker band.
    return (async () => {
        const F = await exec('baja/bio/compound-filter.js');
        // ANNOTATION HAS TO BE ASKED FOR. Every module that builds one does this first
        // (baja/manchester/menu/sequence.js, flexigraph/gene.js); a module is compiled as its
        // own function, so nothing another module declared is in scope here and there is no
        // global of this name. Without it `new Annotation(...)` threw ReferenceError on the
        // first compound, the whole call rejected, and the operation reported "Could not mark
        // them" -- which is why the arrows never appeared.
        const Annotation = await exec('flexigraph/annotation.js');
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

        let marked = 0, used = 0, noPosition = 0, markedTrack = null;
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
                // THE ARROW IS THE WHOLE MESSAGE. flexigraph/annotation.js draws an
                // annotation's NAME above the track on a dashed leader, and these marks are
                // named after the compound -- which for a designed oligo is usually its
                // sequence. So asking where the compounds are answered with a row of arrows
                // AND a stack of twenty-mers printed across the track, each one leadered back
                // to a different arrow: the clutter buried the very thing being pointed at.
                // The name stays on the annotation for the hover text and the description; it
                // is simply not drawn, because the arrow already says everything the question
                // asked.
                a.hideLabel = true;
                try { t.add(a); } catch (e) { try { t.annotations.push(a); } catch (e2) { continue; } }
                n++; marked++;
            }
            if (n) { used++; markedTrack = t; }
        }
        // FRAME THE TRANSCRIPT, because "where are they" is a question about a view.
        //
        // Marking without moving the view answers nothing: the arrows land wherever the user
        // already was, which is the window that made the compounds invisible in the first
        // place and prompted the question. The whole track is the right frame -- it is the
        // span the positions are relative to, and it is what "show me where" means when the
        // answer is "all in one spot near the 5' end".
        //
        // Only when the marks went on ONE track. With marks on several, any choice of frame
        // is wrong for the others, so the view is left alone rather than jumping somewhere
        // that answers for one track and hides the rest.
        let framed = null;
        if (!o.noZoom && used === 1 && markedTrack) {
            try { await graph.zoomToTrack(markedTrack, 0.05); framed = markedTrack.name || true; }
            catch (e) { framed = null; }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        return { marked: marked, cleared: cleared, tracks: used, framed: framed,
            noPosition: noPosition, scope: useSel ? 'selected' : 'all' };
    })();
}

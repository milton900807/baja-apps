function (graph, snp, ms) {
    // Focus a single mutation: for `ms` (default 10s) — or until another is focused / deselected —
    // snpindel.js grays out every OTHER mutation and hides their annotations, while this one stays
    // in full color with its text annotation shown. Passing snp = null clears the focus.
    try {
        ms = ms || 10000;
        if (graph.__focusTimer) { try { clearTimeout(graph.__focusTimer); } catch (e) { } graph.__focusTimer = null; }
        // Deselect EVERY mutation first so only the toured one is selected/lit. Also turn off the
        // lasso spotlight (graph.__snpSelectionActive) so the focus alone governs the spotlight —
        // otherwise any still-highlighted lasso selection would stay lit alongside the tour snp.
        try {
            for (let t of (graph.track || [])) {
                for (let s of (t.snpindels || [])) {
                    if (s && s !== snp) { s.highlight = false; if (s.deselect) { try { s.deselect(); } catch (e) { } } }
                }
            }
            graph.__snpSelectionActive = false;
        } catch (e) { }
        graph.__focusSnp = snp || null;
        graph.__focusUntil = snp ? (Date.now() + ms) : 0;
        if (snp) {
            // Select the current mutation (highlight) BEFORE the caller zooms into it.
            try { snp.showAnnotation = true; snp.highlight = true; if (snp.select) snp.select(); } catch (e) { }
            graph.__focusTimer = setTimeout(function () {
                try { graph.__focusSnp = null; graph.__focusUntil = 0; if (graph.wake) graph.wake(); } catch (e) { }
            }, ms);
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
    } catch (e) { }
}

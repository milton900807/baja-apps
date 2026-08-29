function (graph, snp, ms) {
    // Focus a single mutation: for `ms` (default 10s) — or until another is focused / deselected —
    // snpindel.js grays out every OTHER mutation and hides their annotations, while this one stays
    // in full color with its text annotation shown. Passing snp = null clears the focus.
    try {
        ms = ms || 10000;
        if (graph.__focusTimer) { try { clearTimeout(graph.__focusTimer); } catch (e) { } graph.__focusTimer = null; }
        graph.__focusSnp = snp || null;
        graph.__focusUntil = snp ? (Date.now() + ms) : 0;
        if (snp) {
            try { snp.showAnnotation = true; snp.highlight = true; } catch (e) { }
            graph.__focusTimer = setTimeout(function () {
                try { graph.__focusSnp = null; graph.__focusUntil = 0; if (graph.wake) graph.wake(); } catch (e) { }
            }, ms);
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }
    } catch (e) { }
}

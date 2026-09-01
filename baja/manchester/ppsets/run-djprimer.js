function (graph, genegraph_panel_layout, presetTrack) {

    // djPrimer over ONE track or MANY.
    //   exec('baja/manchester/ppsets/run-djprimer.js', graph, genegraph_panel_layout, tracks)
    //
    // The models library used to open the whole Design menu on graph.track[0], which meant
    // "djPrimer" from the board-level Layers button designed against the first track on the
    // canvas and silently ignored the rest -- the one model in the library that did not honour
    // the track list it was handed.
    //
    // presetTrack takes a single track or an ARRAY, the same contract the other model runners
    // use (see baja/bio/rbp/rbp-profile.js), so one parameter carries both cases: a track menu
    // passes its track, the Layers button passes every track on the canvas.
    //
    // Runs are SEQUENTIAL. Each track is a python call, and firing a dozen at once would queue
    // behind the server's own concurrency cap while making the progress line meaningless.

    return (async () => {
        const list = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);

        const status = (m) => {
            try {
                window.__workStatus = m || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };
        const restoreHover = () => {
            try {
                graph.setMouseMode('navigate');
                graph.clearMouseListeners();
                exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
            } catch (e) { }
        };

        // A track with a SELECTED SEQUENCE is designed over that selection only; a track
        // without one is designed over its whole length. Returns the sequence and the offset
        // its first base sits at, since results are placed relative to where the design began.
        const designTarget = (t) => {
            if (!t) return { seq: '', offset: 0 };
            const xi = (t.xi != null) ? t.xi : 0;
            try {
                if (t.markstart != null && t.markend != null
                    && t.markstart >= 0 && t.markend > t.markstart && t.getSequenceRange) {
                    const sub = t.getSequenceRange(t.markstart, t.markend);
                    if (sub && sub.length) {
                        // Offset is measured from the track origin, the same space
                        // apply-djprimer.js places amplicons in.
                        return { seq: sub, offset: Math.max(0, Math.floor(t.markstart - xi)) };
                    }
                }
            } catch (e) { }
            if (t.sequence) return { seq: t.sequence, offset: 0 };
            try {
                const g = t.grid || t.tgraph;      // track-flexi exposes .grid, track.js .tgraph
                if (g && t.getSequenceRange) return { seq: t.getSequenceRange(g.xmin, g.xmax) || '', offset: 0 };
            } catch (e) { }
            return { seq: '', offset: 0 };
        };

        // Returns true when the track was actually designed against.
        const runOne = async (t) => {
            const { seq: sequence, offset } = designTarget(t);
            if (!sequence) {
                // Skip, do not abort: one track without a sequence must not end a board run.
                try { graph.setMessage(' ' + ((t && t.name) || 'That track') + ' has no sequence to design against. '); } catch (e) { }
                return false;
            }
            try {
                const gene = t.geneID || t.name || '';
                const opts = JSON.stringify({ scorer: 'djprimer', gene: '' + gene });
                const r = await exec('py/ppsets/models/find-primer-amplicons.py', '' + sequence, '', '', opts);
                t.ampliconResults = r;
                // Placed from where the design actually began: 0 for a whole track, the
                // selection's start for a selected one.
                await exec('baja/manchester/ppsets/apply-djprimer.js', r, offset, t, graph);
                if (graph.wake) graph.wake();
                return true;
            } catch (e) {
                try { graph.setMessage(' djPrimer failed on ' + ((t && t.name) || 'track') + ': ' + e + ' '); } catch (e2) { }
                return false;
            }
        };

        // Nothing explicit: fall back to the shared helper, which honours the all-tracks flag
        // set by the Layers button and otherwise asks for a single click.
        if (!list.length) {
            return exec('baja/lib/for-each-track.js', graph,
                'Click a track to design primers (djPrimer).',
                async (t) => { graph.pushOntoHistory(); await runOne(t); restoreHover(); });
        }

        // An explicit list satisfies the board-level request, so consume the flag here too.
        // Left set, it would silently turn the NEXT per-track action into a board-wide one.
        try { window.__bajaApplyAllTracks = false; } catch (e) { }

        // One history entry for the whole run, so a single undo takes back the board.
        try { graph.pushOntoHistory(); } catch (e) { }
        try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }

        let done = 0;
        for (let i = 0; i < list.length; i++) {
            const t = list[i];
            status('djPrimer · ' + ((t && t.name) || ('track ' + (i + 1)))
                + ' · ' + (i + 1) + ' of ' + list.length + '…');
            if (await runOne(t)) done++;
        }
        status('');
        restoreHover();
        try {
            graph.setResultMessage(' djPrimer designed on ' + done + ' of ' + list.length
                + ' track' + (list.length === 1 ? '' : 's') + '. ');
        } catch (e) { }
        return graph;
    })();
}

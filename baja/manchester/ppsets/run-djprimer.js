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

        // Same rule as the Design menu: design against the WHOLE track, and read the sequence
        // through the range accessor when the track does not carry one directly.
        const sequenceOf = (t) => {
            if (!t) return '';
            if (t.sequence) return t.sequence;
            try {
                const g = t.grid || t.tgraph;      // track-flexi exposes .grid, track.js .tgraph
                if (g && t.getSequenceRange) return t.getSequenceRange(g.xmin, g.xmax) || '';
            } catch (e) { }
            return '';
        };

        // Returns true when the track was actually designed against.
        const runOne = async (t) => {
            const sequence = sequenceOf(t);
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
                // xoffset 0: the design spans the whole track, so results are placed from its origin.
                await exec('baja/manchester/ppsets/apply-djprimer.js', r, 0, t, graph);
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

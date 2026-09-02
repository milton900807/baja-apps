function (graph, prompt, fn) {

    // Run `fn(track, index, total)` on ONE clicked track, or on EVERY track on the canvas.
    //   await exec('baja/lib/for-each-track.js', graph, 'Click a track to add X.', async (t) => {...})
    //
    // Which one depends on window.__bajaApplyAllTracks, set by the board-level Layers button.
    // From there the user has chosen "apply this to the board", so asking them to then click a
    // single track contradicts the button they just pressed; from a track menu the click is the
    // whole point. One helper so the two data loaders and anything added later behave the same
    // way rather than each inventing it.
    //
    // All-tracks runs are SEQUENTIAL. Each track is typically a server call, and firing a dozen
    // at once would queue behind the server's own cap while making the progress meaningless.
    //
    // The flag is CONSUMED here. A mode that silently persisted would turn the next per-track
    // action into a board-wide one long after the user had forgotten they set it.

    return (async () => {
        let all = false;
        try { all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }

        const status = (m) => {
            try {
                window.__workStatus = m || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };

        if (all) {
            // "Apply to the board" still yields to a SELECTION. A highlighted sequence, or a
            // selected track, is the user pointing at one place; running over everything anyway
            // put data on tracks they were not looking at. baja/lib/target-tracks.js owns that
            // precedence so every loader answers it the same way.
            const __t = await exec('baja/lib/target-tracks.js', graph, null);
            const tracks = __t.items;
            if (!tracks.length) { try { graph.setMessage(' No tracks on the canvas. '); } catch (e) { } return 0; }
            try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
            let done = 0;
            for (let i = 0; i < tracks.length; i++) {
                const t = tracks[i];
                status(((t && t.name) || ('track ' + (i + 1))) + ' · ' + (i + 1) + ' of ' + tracks.length + '…');
                try { await fn(t, i, tracks.length); done++; } catch (e) { }
            }
            status('');
            try {
                graph.setResultMessage(' Applied to ' + done + ' of ' + tracks.length + ' track'
                    + (tracks.length === 1 ? '' : 's')
                    + (__t.narrowed ? ' (' + __t.scope + ')' : '') + '. ');
            } catch (e) { }
            return done;
        }

        // Normal path: ask for one track.
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('msg: ' + (prompt || 'Click a track.')); } catch (e) { }
        try {
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const t = graph.track[ti];
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                try { await fn(t, 0, 1); } catch (e) { }
            });
        } catch (e) { }
        return 1;
    })();
}

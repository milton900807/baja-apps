function (graph, track, newName, panel) {

    // COPY A TRACK, AS ITS OWN TRACK ON THE CANVAS.
    //   exec('baja/bio/copy-track.js', graph, track, 'pathogenic', panel)
    //
    // "copy this track to a new track called pathogenic" was answered with "not something
    // the editor can do: copying or duplicating a track". It is an ordinary thing to want:
    // keep the original whole and cut the copy down to the part being worked on. The copy
    // itself is Track.copyTrack, which rebuilds every collection rather than sharing it; this
    // is the half that puts the result on the canvas, next to the original and selected, the
    // same way a built mRNA arrives.

    return new Promise(async (resolve) => {
        try {
            const g = graph;
            const t = track;
            if (!g || !t) { resolve({ error: 'there is no track to copy' }); return; }
            if (typeof t.copyTrack !== 'function') {
                resolve({ error: ('' + (t.name || 'that track')) + ' cannot be copied' });
                return;
            }

            const asked = ('' + (newName == null ? '' : newName)).trim();
            const made = t.copyTrack(asked);
            if (!made) { resolve({ error: 'the copy could not be made' }); return; }

            // A NAME ALREADY IN USE IS RENAMED, NOT REFUSED. Two tracks with one name is the
            // worse outcome: every operation that resolves a track by name then picks
            // whichever comes first, and the user cannot tell which they are acting on.
            const before = made.name;
            g.track.push(g.ensureUniqueTrackName ? g.ensureUniqueTrackName(made) : made);
            const renamed = (made.name !== before);

            try { g.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js'); } catch (e) { }
            try { g.deselectAllTracks(); } catch (e) { }
            try { made.select(); } catch (e) { }
            try {
                g.animateTo(made.tgraph.xi - 100,
                    made.tgraph.xi + made.tgraph.width + 100,
                    made.tgraph.Y(-3), made.tgraph.Y(3));
            } catch (e) { }

            // On a phone the canvas is not what is on screen, so the copy would be made out
            // of sight.
            try {
                if (isMobile() && panel) {
                    CurrentLayout.clearComponent('mainPanel');
                    CurrentLayout.setComponent('mainPanel', panel);
                }
            } catch (e) { }

            const counts = [];
            const n = (a) => (Array.isArray(a) ? a.length : 0);
            if (n(made.snpindels)) counts.push(n(made.snpindels).toLocaleString() + ' variants');
            if (n(made.annotations)) counts.push(n(made.annotations).toLocaleString() + ' annotations');
            if (n(made.oligos)) counts.push(n(made.oligos).toLocaleString() + ' compounds');
            if (n(made.track_layers)) counts.push(n(made.track_layers) + ' layers');

            try {
                g.setMessage(made.name + ': a copy of ' + (t.name || 'that track')
                    + (counts.length ? ' with ' + counts.join(', ') : '')
                    + (renamed ? '. The name you asked for was taken, so it has a number on it' : ''));
            } catch (e) { }
            try { g.wake(); } catch (e) { }

            resolve({ track: made, name: made.name, from: t.name, renamed: renamed,
                variants: n(made.snpindels), annotations: n(made.annotations),
                compounds: n(made.oligos), layers: n(made.track_layers) });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

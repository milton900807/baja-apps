function () {

    // ONE WAY TO DRAW A SET OF MATCHING REGIONS ON A TRACK.
    //   const ML = await exec('baja/bio/match-layer.js');
    //   ML.draw(track, blocks, { suffix: '_similarity', dataType: 'SEQSIM' });
    //
    // Two things draw matching regions now -- the map between two tracks, and the search for
    // one region in a track -- and a third will. They have to agree about what a match looks
    // like, because a user who has seen one and then sees the other has to recognise it: the
    // same numbering, the same colour per block, the same mark on an inverted one. Written
    // twice, they drift apart in exactly the places that matter and nobody notices, because
    // each on its own looks fine.
    //
    // Handed back as functions rather than run, so a caller can draw on two tracks from the
    // one set of blocks and know the colours will line up.

    return (async () => {
        const TrackLayer = await exec('baja/bio/track-layer.js');

        // One hue per block, walked around the wheel so neighbours are told apart. The SAME
        // hue for the same block index on every track is the whole mechanism: it is what
        // pairs a region with its match.
        const color = (i, inverted) => 'hsla(' + ((i * 47) % 360) + ', 70%, '
            + (inverted ? '42%' : '55%') + ', ' + (inverted ? 0.5 : 0.42) + ')';

        const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';

        // The label a block carries: its number, an arrow if it is inverted, and its
        // identity. The number is what pairs it with the same block on the other track; the
        // arrow is on the bar rather than in a panel, because a block drawn like the others
        // reads as "this region is conserved" when it says "conserved, backwards".
        const label = (i, inverted, identity) => '' + (i + 1) + (inverted ? '⇄' : '')
            + (identity != null ? (' ' + pct(identity)) : '');

        const make = (track, suffix, dataType) => {
            const len = (track.sequence && track.sequence.length)
                ? track.sequence.length : Math.abs((+track.xf) - (+track.xi));
            const layer = new TrackLayer((track.name || 'track') + suffix, +track.xi, 0, +track.xi + len, 1);
            layer.type = 'TrackLayer';
            layer.data_type = dataType;
            layer.drawStyle = 'interval';
            layer.color = 'rgba(120,130,150,0.3)';
            layer.fillstyle = layer.color;
            try { layer.setLabelFont('10px Arial'); } catch (e) { }
            // The labels ARE the content: a block with no number on it cannot be paired with
            // its partner on the other track.
            layer.labelZoomThreshold = 0;
            layer.avoidLabelOverlap = true;
            layer.barHeightPx = 11;
            layer.allowStackedIntervals = true;
            return layer;
        };

        // Any earlier layer of this kind goes first, or a second run draws on top of the
        // first and the colours stop meaning anything.
        const clear = (track, dataType) => {
            try {
                track.track_layers = (track.track_layers || []).filter((l) => !(l && l.data_type === dataType));
            } catch (e) { }
        };

        // LINK TWO DRAWN SETS TOGETHER, block n to block n.
        //
        // Both layers already carry the same colours and the same numbers; this adds the
        // arrow that saves the reader holding a number in their head while they look for
        // its partner. Hung on ONE of the two layers, because a pair linked from both ends
        // draws every arrow twice, the second exactly over the first.
        //
        // The far end is kept in the OTHER track's coordinates and resolved against that
        // track's own grid when it is drawn. Converting it here, into this track's
        // coordinates, is the bug that looks like it works: the two tracks have different
        // grids and the arrow lands where neither block is.
        const link = (fromLayer, fromTrack, toTrack, blocks, o) => {
            const opt = o || {};
            if (!fromLayer || !toTrack) return 0;
            const list = (blocks || []).filter((b) => b && isFinite(b.x1) && isFinite(b.x2)
                && isFinite(b.ox1) && isFinite(b.ox2));
            fromLayer.links = list.map((b, i) => {
                const n = (b.n != null) ? (b.n - 1) : i;
                return {
                    x1: b.x1, x2: b.x2, y: (opt.y == null ? 0.5 : opt.y),
                    track: toTrack, ox1: b.ox1, ox2: b.ox2, oy: (opt.oy == null ? 0.5 : opt.oy),
                    color: b.color || color(n, !!b.inverted),
                    // An inverted pair is dashed as well as marked on the bars: the arrow is
                    // the thing being read at a glance, and a glance does not take in a small
                    // symbol on a label.
                    dashed: !!b.inverted,
                    width: 1.6, head: 6
                };
            });
            return fromLayer.links.length;
        };

        // blocks: [{ x1, x2, inverted, identity }] in the TRACK's own coordinates.
        const draw = (track, blocks, o) => {
            const opt = o || {};
            const dataType = opt.dataType || 'SEQSIM';
            clear(track, dataType);
            const list = (blocks || []).filter((b) => b && isFinite(b.x1) && isFinite(b.x2) && b.x2 > b.x1);
            if (!list.length) return null;
            const layer = make(track, opt.suffix || '_matches', dataType);
            list.forEach((b, i) => {
                const n = (b.n != null) ? (b.n - 1) : i;
                try {
                    layer.addInterval(b.x1, b.x2, (opt.y == null ? 0.5 : opt.y),
                        (b.label != null ? b.label : label(n, !!b.inverted, b.identity)),
                        (b.color || color(n, !!b.inverted)));
                } catch (e) { }
            });
            try { track.addLayer(layer); } catch (e) { }
            return layer;
        };

        return { draw: draw, link: link, clear: clear, color: color, label: label, pct: pct };
    })();
}

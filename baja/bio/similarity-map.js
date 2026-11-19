function (graph, a, b, opts) {

    // A MAP OF WHERE TWO TRACKS ARE THE SAME, DRAWN ON BOTH OF THEM.
    //   exec('baja/bio/similarity-map.js', graph, trackA, trackB, { max_blocks: 10 })
    //
    // Not a panel of numbers: a layer on each track, one bar per block of similarity, the
    // SAME COLOUR on both tracks for the same block and numbered to match. Laid one above
    // the other the pairs line up and the eye reads the correspondence without being told;
    // which is the thing a table of coordinates cannot do.
    //
    // The blocks come from py/bio/search-region-in-track.py with mask_query set: each block
    // is masked out on BOTH sides before the next is looked for, so the result is a set of
    // distinct corresponding regions rather than the same stretch found again and again.
    //
    // ORIENTATION MATTERS TWICE OVER. A block can be inverted between the two transcripts,
    // and the backend converts a minus-strand hit's coordinates back to the query's forward
    // frame -- otherwise an inverted block is reported at its mirror-image position, which
    // looks entirely plausible. And a track's own sequence is indexed from ITS xi, so a block
    // is placed with that track's arithmetic rather than the other one's.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            if (!a || !b) { resolve({ error: 'two tracks are needed to map' }); return; }
            if (a === b) { resolve({ error: 'those are the same track' }); return; }

            // The whole of each track, indexed the way getSequenceRange indexes it: from the
            // track's own xi, not from min(xi, xf). They are the same for an ordinary track
            // and not for one laid down backwards, and this is the one that is always right.
            const whole = (t) => {
                const len = (t.sequence && t.sequence.length)
                    ? t.sequence.length : Math.abs((+t.xf) - (+t.xi));
                const seq = (() => {
                    try { return ('' + (t.getSequenceRange(t.xi, t.xi + len) || '')).toUpperCase().replace(/[^ACGTUN]/g, ''); }
                    catch (e) { return ''; }
                })();
                return { name: '' + (t.name || 'a track'), seq: seq, offset: +t.xi };
            };
            const A = whole(a), B = whole(b);
            if (A.seq.length < 40 || B.seq.length < 40) {
                resolve({ error: ((A.seq.length < 40 ? A.name : B.name)) + ' has no sequence to map' });
                return;
            }

            const maxBlocks = Math.max(1, Math.min(+o.max_blocks || 10, 30));
            let res = null;
            try {
                res = await exec('py/bio/search-region-in-track.py', A, B,
                    { max_hits: maxBlocks, strands: 'both', mask_query: true });
            } catch (e) { res = null; }
            if (!res) { resolve({ error: 'the comparison could not be run on the server' }); return; }
            if (res.status === 'ERROR') { resolve({ error: ('' + (res.error || 'the comparison failed')) }); return; }

            const blocks = (res.hits || []);
            if (!blocks.length) {
                try {
                    graph.setMessage(A.name + ' and ' + B.name + ': no blocks of similarity above '
                        + 'the noise floor (score ' + Math.round(res.floor || 0) + '). Nothing drawn, '
                        + 'because an empty map and a map of nothing look the same.');
                } catch (e) { }
                resolve({ blocks: [], floor: res.floor });
                return;
            }

            // ---- the layers ---------------------------------------------------------------
            const TrackLayer = await exec('baja/bio/track-layer.js');
            const DATA_TYPE = 'SEQSIM';
            const SUFFIX = '_similarity';

            // One hue per block, walked around the wheel so neighbours are told apart. The
            // SAME hue on both tracks is the whole mechanism: it is what pairs them.
            const hue = (i) => (i * 47) % 360;
            const fill = (i, inverted) => 'hsla(' + hue(i) + ', 70%, '
                + (inverted ? '42%' : '55%') + ', ' + (inverted ? 0.5 : 0.42) + ')';

            const mk = (t) => {
                const len = (t.sequence && t.sequence.length) ? t.sequence.length : Math.abs(t.xf - t.xi);
                const layer = new TrackLayer((t.name || 'track') + SUFFIX, +t.xi, 0, +t.xi + len, 1);
                layer.type = 'TrackLayer';
                layer.data_type = DATA_TYPE;
                layer.drawStyle = 'interval';
                layer.color = 'rgba(120,130,150,0.3)';
                layer.fillstyle = layer.color;
                try { layer.setLabelFont('10px Arial'); } catch (e) { }
                // The labels ARE the content here: a block with no number on it cannot be
                // paired with its partner on the other track.
                layer.labelZoomThreshold = 0;
                layer.avoidLabelOverlap = true;
                layer.barHeightPx = 11;
                layer.allowStackedIntervals = true;
                return layer;
            };

            // Any earlier map of this pair goes first, or the second run draws on top of the
            // first and the colours stop meaning anything.
            const dropOld = (t) => {
                try {
                    t.track_layers = (t.track_layers || []).filter((l) => !(l && l.data_type === DATA_TYPE));
                } catch (e) { }
            };
            dropOld(a); dropOld(b);

            const la = mk(a), lb = mk(b);
            const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';
            const drawn = [];
            blocks.forEach((h, i) => {
                const inverted = (h.strand === '-');
                const c = fill(i, inverted);
                // An inverted block is marked on the face of it, not left to the panel: a
                // block drawn the same as the rest reads as "this region is conserved" when
                // what it says is "this region is conserved, backwards".
                const tag = '' + (i + 1) + (inverted ? '⇄' : '') + ' ' + pct(h.identity);
                try { la.addInterval(h.query_start, h.query_end, 0.5, tag, c); } catch (e) { }
                try { lb.addInterval(h.start, h.end, 0.5, tag, c); } catch (e) { }
                drawn.push({
                    n: i + 1, inverted: inverted, identity: h.identity, score: h.score,
                    a: { start: h.query_start, end: h.query_end },
                    b: { start: h.start, end: h.end }
                });
            });

            try { a.addLayer(la); } catch (e) { }
            try { b.addLayer(lb); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }

            const inv = drawn.filter((d) => d.inverted).length;
            const best = drawn.slice().sort((x, y) => y.identity - x.identity)[0];
            try {
                graph.setMessage(A.name + ' and ' + B.name + ': ' + drawn.length + ' block'
                    + (drawn.length === 1 ? '' : 's') + ' of similarity drawn on both tracks'
                    + (best ? (', best ' + pct(best.identity) + ' identical') : '')
                    + (inv ? (' · ' + inv + ' inverted') : '')
                    + '. Matching numbers and colours are the same block.');
            } catch (e) { }

            resolve({ blocks: drawn, inverted: inv, floor: res.floor, engine: res.engine });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

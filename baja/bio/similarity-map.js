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
            // Drawn by match-layer.js, which is the one description of what a matching
            // region looks like: the colour per block, the number that pairs it with its
            // partner on the other track, the arrow on an inverted one. The search for a
            // single region draws through the same module, so the two look alike because
            // they ARE alike and not because someone kept them that way.
            const ML = await exec('baja/bio/match-layer.js');
            const DATA_TYPE = 'SEQSIM';
            const SUFFIX = '_similarity';
            const pct = ML.pct;

            const drawn = [];
            const aBlocks = [], bBlocks = [];
            blocks.forEach((h, i) => {
                const inverted = (h.strand === '-');
                aBlocks.push({ n: i + 1, x1: h.query_start, x2: h.query_end, inverted: inverted, identity: h.identity });
                bBlocks.push({ n: i + 1, x1: h.start, x2: h.end, inverted: inverted, identity: h.identity });
                drawn.push({
                    n: i + 1, inverted: inverted, identity: h.identity, score: h.score,
                    a: { start: h.query_start, end: h.query_end },
                    b: { start: h.start, end: h.end }
                });
            });
            const layerA = ML.draw(a, aBlocks, { suffix: SUFFIX, dataType: DATA_TYPE });
            ML.draw(b, bBlocks, { suffix: SUFFIX, dataType: DATA_TYPE });

            // The arrows, hung on one of the two layers so each pair is drawn once. Which
            // one does not matter to the picture: an arrow from A's block to B's and one
            // from B's to A's are the same arrow.
            ML.link(layerA, a, b, aBlocks.map((bl, i) => ({
                n: bl.n, x1: bl.x1, x2: bl.x2, inverted: bl.inverted,
                ox1: bBlocks[i].x1, ox2: bBlocks[i].x2
            })), {});

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

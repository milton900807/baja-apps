function (graph, genegraph_panel_layout, presetTrack) {

    // CANDIDATE ACCEPTOR SITES, RANKED, AS A TRACK LAYER.
    //   exec('baja/bio/splicing/acceptor-candidates-view.js', graph, genegraph_panel_layout, track)
    //
    // The ranking itself is baja/bio/splicing/acceptor-candidates.js; this draws it. Every
    // sentence of the wording here is load-bearing, because the easy misreading of this layer
    // is the one the model does not support: that a high score means a site is used.
    //
    //   * The LABEL LEADS WITH THE RANK, never the probability. BajaSplice's own report puts
    //     only 26% of confirmed cryptic acceptors above 0.5, against 0.69% of decoys, so a
    //     number near zero is the normal reading for a real site and would be read as "no"
    //     by anyone shown it first.
    //   * The PERCENTILE is against this gene's own intronic positions, which is the only
    //     frame the score has. Absolute 0.4 means nothing; best of 5,000 means something.
    //   * ANNOTATED ACCEPTORS ARE ABSENT, and the closing message says so, because their
    //     absence is the layer's main blind spot rather than a detail: a cryptic site sitting
    //     on an annotated edge cannot appear here at all.
    //
    // EACH CANDIDATE IS AN ARC, not a spike. It was drawn as a peak over the intron first,
    // which showed where a score was high and nothing about what it would mean: an acceptor
    // alone is one end of a splice event. The arc runs from the canonical donor of the intron
    // the candidate sits in to the candidate itself, so it shows the junction that would exist
    // if the site were used, on the same renderer the site-strength layer uses.

    return (async () => {
        const L = genegraph_panel_layout;
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };

        // presetTrack takes a single track or an ARRAY of them, as the models menu passes.
        const list = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);
        if (!list.length) { say('Candidate acceptor sites runs against one track; select a track first.'); return false; }
        const track = list[0];

        const TOP = 25;
        say('Scoring intronic acceptor positions on ' + (track.name || 'the track') + '…');

        let res = null;
        try {
            res = await exec('baja/bio/splicing/acceptor-candidates.js', track, { top: TOP });
        } catch (e) {
            say('Candidate acceptor sites failed: ' + (e && e.message ? e.message : e));
            return false;
        }
        // THE RANKER SAYS WHICH FAILURE IT WAS; this just shows it. Collapsing seven causes
        // into one sentence is what made a five-exon STMN2 track report "fewer than two
        // exons", which sent a real debugging session after the wrong thing entirely.
        if (!res || !res.ok) {
            say((res && res.reason) ? res.reason
                : ((track.name || 'This track') + ': the acceptor ranking returned nothing and gave no reason.'));
            return false;
        }
        const rows = res.rows || [];
        if (!rows.length) { say((track.name || 'This track') + ': the ranking succeeded but returned no rows.'); return false; }

        // EACH CANDIDATE IS DRAWN AS THE JUNCTION IT WOULD MAKE, not as a spike. An
        // acceptor on its own is one end of a splice event, and a bare peak over an intron
        // says nothing about what would be joined to what. The arc runs from the DONOR OF
        // THE INTRON THE CANDIDATE SITS IN -- the canonical donor the spliceosome would
        // already be using -- to the candidate acceptor, which is the junction that would
        // exist if this site were used. Same renderer as the site-strength layer, so the
        // two can be read together and compared on the same track.
        const TrackLayer = await exec('baja/bio/track-layer.js');
        const introns = res.introns || [];
        const plus = (res.plus !== false);
        const axis = { xmin: (track.xi != null) ? +track.xi : 0, xmax: (track.xf != null) ? +track.xf : 0 };
        if (!(axis.xmax > axis.xmin)) {
            axis.xmin = Math.min.apply(null, rows.map((r) => r.x)) - 50;
            axis.xmax = Math.max.apply(null, rows.map((r) => r.x)) + 50;
        }

        // The donor is the first intronic base after the upstream exon, which is the LOW
        // end of the intron on a plus-strand track and the HIGH end on a minus-strand one,
        // because transcript order runs the other way. Falling back to the start of the
        // sequence keeps an arc drawable if an intron ever cannot be identified.
        const donorFor = (r) => {
            const iv = introns[r.intron];
            if (iv && isFinite(iv.lo) && isFinite(iv.hi)) return plus ? iv.lo : iv.hi;
            return plus ? axis.xmin : axis.xmax;
        };

        const name = 'ACC:' + rows.length + 'of' + (res.outOf || '?');
        const layer = new TrackLayer((track.name || 'track') + '_' + name, axis.xmin, 0, axis.xmax, 1);
        layer.data_type = 'splicing';
        layer.arc_type = 'SpliceSashimi';
        layer.magnitudeMode = 'sites';
        layer.donorColor = 'rgba(94,84,199,0.95)';     // indigo, as the site-strength layer uses
        layer.acceptorColor = 'rgba(46,160,102,0.95)'; // green
        layer.acceptorCandidates = rows;               // kept for a later comparison

        // mag follows the sites convention (a 0..1 score presented on a 0..2 scale) so an
        // arc here means what an arc means on the site-strength layer. magMax is THIS
        // GENE'S best candidate rather than a flat 2, because that is the only comparison
        // the score supports: real cryptic acceptors mostly score below 0.5, so a fixed
        // scale would draw every arc in a typical gene as the same hairline.
        let magMax = 0;
        layer.junctions = rows.map((r) => {
            const mag = Math.max(0, +r.score) * 2;
            if (mag > magMax) magMax = mag;
            return {
                d: donorFor(r), a: r.x,
                dp: 1, ap: +r.score,
                mag: mag,
                kind: 'junction',
                // NOT annotated: this topology is proposed by the model and is not in the
                // transcript. The renderer uses this to tell the two apart, and claiming
                // otherwise would draw every candidate as though it were canonical.
                annotated: false,
                exon: null, exons: null, shift: null, share: null
            };
        });
        layer.magMax = (magMax > 0) ? magMax : 2;

        track.addLayer(layer);
        if (layer.setTimedHighlight) layer.setTimedHighlight(10000);
        setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 10100);
        if (graph.wake) graph.wake();

        const top3 = rows.slice(0, 3).map((r) => '#' + r.rank + ' at ' + r.x).join(', ');
        say((track.name || 'Track') + ': the ' + rows.length + ' strongest intronic acceptor '
            + 'positions of ' + (rows[0].outOf || '?') + ' ranked (' + top3 + '). RANK is the '
            + 'usable quantity and the score is not calibrated, so read the order and not the '
            + 'number. Measured against catalogued TDP-43 cryptic acceptors, the true site is '
            + 'in the top 25 for about half of genes and the top 10 for about 29%. Annotated '
            + 'acceptors are excluded, so a cryptic site that sits on an annotated edge, which '
            + 'is a quarter to a third of the catalogued ones, cannot appear here. Nothing '
            + 'here says the spliceosome WILL use a site: it says the sequence supports one. '
            + 'Each arc runs from the canonical donor of the intron the candidate sits in to '
            + 'the candidate, which is the junction that site would make. Arc weight is scaled '
            + 'to THIS gene\u2019s best candidate, not to an absolute probability, because a '
            + 'fixed scale draws every arc in a typical gene as the same hairline. Click an '
            + 'arc to see the exon, the message and the protein that site would make.');

        // CLICKING AN ARC ASKS WHAT IT WOULD MAKE. The arc is already the junction that
        // would exist; the question it raises is what the message would say, and until now
        // that could only be answered by reading a rank off a table.
        //
        // The listener is deliberately narrow. It acts only on a press inside THIS track,
        // within a few pixels of one of these candidates, while this layer is still on the
        // track; anything else falls through untouched, because a layer that eats clicks
        // takes selection and panning with it.
        try {
            const near = (xWorld) => {
                let best = null, bestD = Infinity;
                for (const r of rows) {
                    const d = Math.abs(xWorld - r.x);
                    if (d < bestD) { bestD = d; best = r; }
                }
                // Tolerance in BASES scaled from the pixels on screen, so the target is the
                // same size to the hand at every zoom.
                let perPx = 1;
                try {
                    const tg = track.tgraph;
                    perPx = Math.abs(tg.Xwc(10) - tg.Xwc(0)) / 10 || 1;
                } catch (e) { perPx = 1; }
                return (bestD <= Math.max(2, perPx * 6)) ? best : null;
            };
            graph.addMouseDownListener(async (x, y) => {
                try {
                    if (!track.track_layers || track.track_layers.indexOf(layer) < 0) return;
                    const ti = graph.getTrack(x, y);
                    if (ti < 0 || graph.track[ti] !== track) return;
                    // The idiom for turning a press into a track coordinate, from
                    // annotation-layer-editor-sketch-exon.js.
                    const xv = track.tgraph.Xwc(graph.X(x) - track.tgraph.xi * 2);
                    const hit = near(xv);
                    if (!hit) return;
                    say('Working out what the acceptor at ' + hit.x + ' would make\u2026');
                    const made = await exec('baja/bio/splicing/alternative-exon.js', track, hit.x, {});
                    if (!made || !made.ok) {
                        say('Rank ' + hit.rank + ' at ' + hit.x + ': ' + ((made && made.reason)
                            || 'nothing could be worked out for that site') + '.');
                        return;
                    }
                    await exec('baja/bio/splicing/alternative-peptide-view.js', made);
                } catch (e) {
                    say('That site could not be worked out: ' + ((e && e.message) ? e.message : e));
                }
            });
        } catch (e) { }

        return true;
    })();
}

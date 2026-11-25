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
    // Blocks are drawn a few bases wide so they can be seen and clicked at gene zoom. The
    // acceptor is the single position named in the label, not the width of the block.

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

        const TrackLayer = await exec('baja/bio/track-layer.js');
        const axis = { xmin: (track.xi != null) ? +track.xi : 0, xmax: (track.xf != null) ? +track.xf : 0 };
        if (!(axis.xmax > axis.xmin)) {
            axis.xmin = Math.min.apply(null, rows.map((r) => r.x)) - 50;
            axis.xmax = Math.max.apply(null, rows.map((r) => r.x)) + 50;
        }
        const name = 'ACC:' + (rows.length) + 'of' + (rows[0].outOf || '?');
        const layer = new TrackLayer((track.name || 'track') + '_' + name, axis.xmin, 0, axis.xmax, 1);
        layer.data_type = name;
        layer.color = 'rgba(46,160,102,0.55)';       // green, as site-strength uses for acceptors
        layer.fillstyle = layer.color;
        layer.verticalLabels = true;
        layer.acceptorCandidates = rows;             // kept with the layer for a later comparison

        const HALF = 3;
        let added = 0;
        rows.forEach((r) => {
            const a = r.x - HALF, b = r.x + HALF;
            // Alpha carries the RANK, not the score: the best candidate is the most solid
            // block whatever its probability, which is the ordering the model supports.
            const frac = 1 - ((r.rank - 1) / Math.max(1, rows.length));
            const alpha = +(0.30 + 0.55 * frac).toFixed(2);
            const label = '#' + r.rank + ' of ' + r.outOf + '\n'
                + 'top ' + (100 - r.percentile).toFixed(2) + '%\n'
                + 'pos ' + r.x + '\n'
                + ((r.distToExon != null) ? (r.distToExon + ' nt from an exon edge\n') : '')
                + 'score ' + r.score.toFixed(4) + ' (uncalibrated; rank is the usable quantity)';
            layer.addInterval(a, b, frac, label, 'rgba(46,160,102,' + alpha + ')');
            added++;
        });
        if (!added) { say('No candidate fell inside this track\'s range.'); return false; }

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
            + 'here says the spliceosome WILL use a site: it says the sequence supports one.');
        return true;
    })();
}

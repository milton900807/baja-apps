function (graph, genegraph_panel_layout, presetTrack, opts) {

    // WHAT THE CANDIDATE ACCEPTORS WOULD ACTUALLY ADD, DRAWN ON THE TRACK.
    //   exec('baja/bio/splicing/potential-exons-layer.js', graph, layout, track, { top: 10 })
    //
    // The acceptor layer draws each candidate as the junction it would make, and clicking an
    // arc opens the exon, the message and the protein that site would give. That answers one
    // site at a time, which is the wrong shape for the question people actually ask of the
    // layer: of these ten, which ones matter. So this closes every candidate into an exon and
    // puts them all on the track at once, as a layer that can be removed in one action.
    //
    // AN EXON NEEDS A DONOR, AND THE DONOR IS A CHOICE. alternative-exon.js scores every donor
    // the model puts within cassette-exon distance after the acceptor and returns them all;
    // the band here is the BEST-SCORING one, and the help rows name the runners-up with the
    // exon each would make, because "68 nt, in frame" and "71 nt, frameshift" are different
    // answers from the same acceptor.
    //
    // COLOUR IS THE CONSEQUENCE, not the site score. The acceptor layer already ranks by
    // strength; what this adds is what the message would say, and a strong site that
    // frameshifts to a premature stop is a different proposition from a weak one that inserts
    // a few residues in frame. Green is in frame, amber is in frame but brings a stop NMD
    // would find, red is a frameshift.
    //
    // NOTHING HERE IS A MEASUREMENT. Every band is a proposal: a position the sequence
    // supports, closed with a donor the same model scores, translated through the same
    // machinery the exon screens use. No reads say any of it happens.

    return (async () => {
        const o = opts || {};
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };

        const list = Array.isArray(presetTrack) ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);
        if (!list.length) { say('Potential exons runs against one track; select a track first.'); return false; }
        const track = list[0];
        const TOP = (o.top != null) ? Math.max(1, Math.min(25, +o.top)) : 10;

        // THE CANDIDATES COME FROM THE LAYER THAT IS ALREADY UP, when there is one. Running
        // the ranking again would be a second answer to a question already on screen, and the
        // two could differ if the track moved between them.
        let rows = null, outOf = null, plus = null, introns = null;
        try {
            for (const lay of (track.track_layers || [])) {
                if (lay && Array.isArray(lay.acceptorCandidates) && lay.acceptorCandidates.length) {
                    rows = lay.acceptorCandidates; break;
                }
            }
        } catch (e) { rows = null; }

        if (!rows) {
            say('Ranking the intronic acceptor positions of ' + (track.name || 'the track') + '…');
            let res = null;
            try { res = await exec('baja/bio/splicing/acceptor-candidates.js', track, { top: Math.max(TOP, 25) }); }
            catch (e) {
                say('Potential exons: the acceptor ranking failed: ' + ((e && e.message) ? e.message : e));
                return false;
            }
            // The ranker says which failure it was; repeating its own sentence is the whole
            // point of it having one.
            if (!res || !res.ok) {
                say((res && res.reason) || ((track.name || 'This track')
                    + ': the acceptor ranking returned nothing and gave no reason.'));
                return false;
            }
            rows = res.rows || [];
            outOf = res.outOf; plus = res.plus; introns = res.introns;
            if (!rows.length) { say((track.name || 'This track') + ': the ranking returned no candidates.'); return false; }
        }

        const want = rows.slice(0, TOP);

        // THE SITE PROFILE IS FETCHED ONCE AND HANDED DOWN. alternative-exon.js asks for it
        // per call, and ten calls is ten runs of the site model over the same sequence: a
        // minute of waiting for an answer that cannot have changed in between.
        say('Closing ' + want.length + ' candidate acceptor' + (want.length === 1 ? '' : 's')
            + ' into exons…');
        const P = await exec('baja/bio/splicing/sites-profile.js', track, o);
        if (!P.ok) { say('Potential exons: ' + P.reason); return false; }
        const shared = { profile: { acceptor: P.acceptor, donor: P.donor }, pairings: 3 };

        const made = [];
        const refused = [];
        for (const r of want) {
            let m = null;
            try { m = await exec('baja/bio/splicing/alternative-exon.js', track, r.x, shared); }
            catch (e) { m = { ok: false, reason: (e && e.message) ? e.message : ('' + e) }; }
            if (!m || !m.ok || !m.pairings || !m.pairings.length) {
                refused.push({ rank: r.rank, x: r.x, reason: (m && m.reason) || 'no exon could be closed' });
                continue;
            }
            made.push({ rank: r.rank, score: +r.score, percentile: r.percentile, acceptorX: r.x, r: m });
        }

        if (!made.length) {
            // EVERY REFUSAL, NOT A COUNT. "None could be closed" sent a real session looking
            // for a bug in the ranking when the answer was that the donors all sat outside
            // cassette-exon distance, which is a fact about the gene.
            const why = refused.slice(0, 4).map((f) => '#' + f.rank + ' at ' + f.x + ': ' + f.reason).join('; ');
            say((track.name || 'This track') + ': none of the top ' + want.length + ' candidate '
                + 'acceptors could be closed into an exon. ' + why
                + (refused.length > 4 ? (' (and ' + (refused.length - 4) + ' more)') : ''));
            return false;
        }

        const TrackLayer = await exec('baja/bio/track-layer.js');
        const axis = {
            xmin: (track.xi != null) ? +track.xi : Math.min.apply(null, made.map((m) => m.r.pairings[0].exon.xi)),
            xmax: (track.xf != null) ? +track.xf : Math.max.apply(null, made.map((m) => m.r.pairings[0].exon.xf))
        };
        const span = Math.max(1, Math.abs(axis.xmax - axis.xmin));
        // A CASSETTE EXON IS A HAIRLINE ON A WHOLE GENE. Forty kilobases across a canvas puts
        // a 68-base exon inside one pixel, so the layer drew bands nobody could see and read
        // as empty. Anything thinner than this is widened symmetrically to it; the label and
        // the help rows carry the TRUE span, and the note says that is what happened, because
        // a band drawn wider than its exon is a lie about coordinates unless it is declared.
        const MINDRAW = Math.max(1, Math.round(span / 400));

        const name = 'POTEX:' + made.length;
        const L = new TrackLayer((track.name || 'track') + '_' + name,
            Math.min(axis.xmin, axis.xmax), 0, Math.max(axis.xmin, axis.xmax), 1);
        L.type = 'PotentialExons';
        L.color = 'rgba(159,196,212,0.5)';
        L.labelColor = '#eaf6f9';
        L.fixedIntervalDepth = 12;
        L.allowStackedIntervals = true;

        const COLOR = {
            inframe: 'rgba(74,222,128,0.60)',     // in frame, no premature stop
            silent:  'rgba(159,196,212,0.45)',    // in frame and the protein is unchanged
            nmd:     'rgba(251,191,36,0.60)',     // in frame but it brings a stop NMD would find
            shift:   'rgba(248,113,113,0.60)'     // frameshift
        };
        const kindOf = (p) => {
            const c = '' + (p.consequence || '');
            if (/^frameshift/.test(c)) return 'shift';
            if (/silent/.test(c)) return 'silent';
            if (/NMD would find/.test(c)) return 'nmd';
            if (/^in frame/.test(c)) return 'inframe';
            return 'shift';
        };

        // LANES, SO TWO PROPOSALS IN ONE INTRON DO NOT SIT ON TOP OF EACH OTHER. Candidates
        // cluster: the top ten of a gene are often five sites in the same intron, and drawn on
        // one line the strongest hides the rest.
        const LANES = [0.72, 0.5, 0.28];
        const laneEnd = [-Infinity, -Infinity, -Infinity];

        made.sort((a, b) => Math.min(a.r.pairings[0].exon.xi, a.r.pairings[0].exon.xf)
            - Math.min(b.r.pairings[0].exon.xi, b.r.pairings[0].exon.xf));

        const helpRows = [];
        let inFrame = 0;
        for (const m of made) {
            const best = m.r.pairings[0];
            const lo = Math.min(+best.exon.xi, +best.exon.xf);
            const hi = Math.max(+best.exon.xi, +best.exon.xf);
            const trueLen = best.exon.length;
            let dLo = lo, dHi = hi;
            if ((hi - lo + 1) < MINDRAW) {
                const pad = Math.floor((MINDRAW - (hi - lo + 1)) / 2);
                dLo = lo - pad; dHi = hi + pad;
            }
            let lane = 0;
            while (lane < LANES.length - 1 && dLo <= laneEnd[lane]) lane++;
            laneEnd[lane] = dHi + MINDRAW * 0.25;

            const kind = kindOf(best);
            if (kind === 'inframe' || kind === 'silent') inFrame++;
            const label = '#' + m.rank + ' · ' + trueLen + ' nt · '
                + (kind === 'shift' ? 'frameshift' : kind === 'nmd' ? 'in frame, PTC'
                    : kind === 'silent' ? 'in frame, silent' : 'in frame');
            L.addInterval(dLo, dHi, LANES[lane], label, COLOR[kind]);

            // The runners-up: the same acceptor closed by the other donors the model scores.
            const alts = m.r.pairings.slice(1).map((p) => p.exon.length + ' nt ' + p.consequence).join('; ');
            helpRows.push([
                '#' + m.rank + ' acceptor ' + m.acceptorX,
                'exon ' + lo + '–' + hi + ' (' + trueLen + ' nt) with the donor at '
                + best.donorX + ' · ' + best.consequence
                + (best.identity != null ? (' · ' + Math.round(best.identity * 100)
                    + '% identical to the protein as it stands') : '')
                + (alts ? (' · other donors: ' + alts) : '')
            ]);
        }

        for (const f of refused) {
            helpRows.push(['#' + f.rank + ' acceptor ' + f.x, 'no exon drawn — ' + f.reason]);
        }

        L.decor = {
            help: {
                title: 'Potential exons from candidate acceptors',
                rows: helpRows,
                note: 'Each band is the exon a candidate acceptor would make if the spliceosome '
                    + 'used it, closed with the best-scoring donor the same model puts within '
                    + 'cassette-exon distance after it, and translated through the machinery the '
                    + 'exon screens use. Colour is the consequence to the message, not the site '
                    + 'score: green in frame, amber in frame but carrying a stop NMD would find, '
                    + 'red a frameshift. Nothing here is a measurement — no reads say any of '
                    + 'these exons is used, and the acceptor ranking it starts from puts the true '
                    + 'cryptic site in the top 25 for about half of genes. Bands narrower than '
                    + MINDRAW + ' bases at this zoom are drawn at that width so they stay '
                    + 'visible; the length in every label and row is the real one.'
            }
        };
        L.potentialExons = made;

        try { track.addLayer(L); } catch (e) { try { (track.track_layers || []).push(L); } catch (e2) { } }
        try { if (L.setTimedHighlight) L.setTimedHighlight(10000); } catch (e) { }
        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        say((track.name || 'Track') + ': ' + made.length + ' potential exon'
            + (made.length === 1 ? '' : 's') + ' drawn from the top ' + want.length
            + ' candidate acceptors, ' + (inFrame || 'none') + ' of them in frame'
            + (refused.length ? (' (' + refused.length + ' candidate'
                + (refused.length === 1 ? '' : 's') + ' had no donor within cassette-exon '
                + 'distance and are listed under the "?" rather than drawn)') : '')
            + '. Colour is the consequence to the message, not the strength of the site: green '
            + 'in frame, amber in frame with a stop NMD would find, red a frameshift. Each band '
            + 'uses the best-scoring donor; the "?" names the other donors and the exon each '
            + 'would make. These are proposals, not measurements.');
        return true;
    })();
}

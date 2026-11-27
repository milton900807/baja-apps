function (graph, track, range, opts) {

    // WHERE ELSE DOES THE SELECTED STRETCH OCCUR?
    //   exec('baja/bio/compare/selection-similarity.js', graph, track, {start, end},
    //        { min: 0.5, against: otherTrack })
    //
    // The selection is compared with every stretch of the same length on a track -- one
    // comparison per offset, both strands -- and the places that match it better than the
    // threshold are drawn as a layer there, each labelled with its identity. That is the
    // question behind "is this repeated", "is there a paralogous copy here", "did my ASO
    // site just move", and it had no answer short of exporting the sequence and running
    // something else.
    //
    // THE TRACK SCANNED IS NOT NECESSARILY THE TRACK SELECTED ON. Against another track it
    // answers the question people actually have with two genes on the canvas: does my site
    // exist over there. The layer lands on the track that was SCANNED, because that is
    // whose coordinates the hits are in, and the selection is only excluded from its own
    // track, where it would otherwise head every list at 100%.
    //
    // UNGAPPED, DELIBERATELY. Every hit is the selection laid over the track at one offset
    // and counted base by base: no gaps, no alignment. That is what makes the number mean
    // one thing -- the percentage of positions that agree -- and it is also the limitation:
    // a copy carrying a single-base insertion reads as two half-length matches rather than
    // one good one. An aligner would find that copy and would also return a score nobody
    // can read off a label.
    //
    // BOTH STRANDS, because an inverted copy is a copy. A hit found on the reverse
    // complement is marked as such rather than quietly listed beside the forward ones.
    //
    // THE SELECTION ITSELF IS NOT A HIT. It matches itself at 100% and would head every
    // list; it is reported as the anchor instead, and anything overlapping it by more than
    // half is dropped with it.

    return (async () => {
        const o = opts || {};
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const fail = (why) => { say(why); return { ok: false, reason: why }; };

        if (!track) return fail('There is no track to compare against.');
        const lo = Math.floor(Math.min(+range.start, +range.end));
        const hi = Math.ceil(Math.max(+range.start, +range.end));
        const MIN = Math.max(0.2, Math.min(1, (o.min != null) ? +o.min : 0.5));
        const TOP = Math.max(1, Math.min(300, (o.top != null) ? +o.top : 60));

        const clean = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
        // The track the SELECTION is on, and the track being SCANNED. They are the same
        // track unless a caller says otherwise.
        const src = track;
        const tgt = o.against || track;
        const sameTrack = (tgt === src);
        const srcSeq = clean(src.sequence);
        const srcBase = Math.floor(+src.xi);
        const whole = sameTrack ? srcSeq : clean(tgt.sequence);
        const base = sameTrack ? srcBase : Math.floor(+tgt.xi);
        if (srcSeq.length < 20) return fail((src.name || 'That track') + ' has no sequence loaded to compare.');
        if (whole.length < 20) return fail((tgt.name || 'That track') + ' has no sequence loaded to compare against.');

        const qi = lo - srcBase, qj = hi - srcBase;
        const q = srcSeq.slice(Math.max(0, qi), Math.max(0, qj));
        const L = q.length;
        if (L < 8) return fail('The selection is ' + L + ' nt. Select at least 8 to compare it across the track.');
        if (sameTrack && L > whole.length / 2) {
            return fail('The selection is ' + L.toLocaleString() + ' nt, more than half of '
                + (src.name || 'the track') + '. There is not enough left to compare it with.');
        }
        if (!sameTrack && L > whole.length) {
            return fail('The selection is ' + L.toLocaleString() + ' nt and ' + (tgt.name || 'that track')
                + ' is ' + whole.length.toLocaleString() + ' nt. There is nowhere on it long enough to lay the selection over.');
        }

        const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const qrc = q.split('').reverse().map((b) => RC[b] || 'N').join('');

        // ONE PASS PER OFFSET, WITH EARLY ABANDON: counting stops as soon as enough
        // mismatches have piled up that the threshold cannot be reached. That is what makes
        // a whole-gene scan bearable, since almost every offset fails within a few bases.
        //
        // Past a few hundred million base comparisons even that is a wait with nothing on
        // screen, so the scan steps instead, and the step is reported: a result that looked
        // at every third position is not the same answer as one that looked at all of them,
        // and the difference must not be silent.
        const n = whole.length;
        const need = Math.ceil(MIN * L);
        const maxMiss = L - need;
        const work = (n - L) * L * 2;
        const step = (work > 2e8) ? Math.ceil(work / 2e8) : 1;

        // The selection is excluded only on its OWN track. On another one there is nothing
        // to exclude, and excluding the same offsets there would blank out a stretch of a
        // different gene for no reason.
        const selfLo = qi, selfHi = qj;
        const overlapsSelf = (s) => sameTrack && ((Math.min(s + L, selfHi) - Math.max(s, selfLo)) > (L / 2));

        const scan = (pat, strandMark) => {
            const out = [];
            for (let s = 0; s + L <= n; s += step) {
                if (overlapsSelf(s)) continue;
                let miss = 0, k = 0;
                for (; k < L; k++) {
                    if (whole.charCodeAt(s + k) !== pat.charCodeAt(k)) {
                        if (++miss > maxMiss) break;
                    }
                }
                if (k < L) continue;                    // abandoned
                out.push({ s: s, id: (L - miss) / L, rc: strandMark });
            }
            return out;
        };

        let hits = scan(q, false);
        if (o.bothStrands !== false) hits = hits.concat(scan(qrc, true));
        if (!hits.length) {
            say('Nothing on ' + (tgt.name || 'the track') + ' matches the selected '
                + L.toLocaleString() + ' nt at ' + Math.round(MIN * 100) + '% or better, on either '
                + 'strand. The comparison is ungapped, so a copy carrying an insertion or a '
                + 'deletion would not be found as one piece.');
            return { ok: true, hits: [], anchor: { start: lo, end: hi }, length: L, step: step,
                on: (tgt.name || ''), from: (src.name || ''), sameTrack: sameTrack };
        }

        // NON-MAXIMUM SUPPRESSION. A good match is a good match at the offsets either side
        // of it too, so without this a single copy arrives as a run of fifty bands one base
        // apart and the layer is unreadable.
        hits.sort((a, b) => (b.id - a.id) || (a.s - b.s));
        const kept = [];
        for (const h of hits) {
            let clash = false;
            for (const k of kept) {
                if (Math.min(h.s + L, k.s + L) - Math.max(h.s, k.s) > L / 2) { clash = true; break; }
            }
            if (clash) continue;
            kept.push(h);
            if (kept.length >= TOP) break;
        }

        // What each hit lands in, by the track's own annotations: a percentage is a number
        // until it has "inside exon 7" beside it.
        const annAt = (a, b) => {
            const names = [];
            try {
                for (const an of (tgt.annotations || [])) {
                    if (!an || !isFinite(an.xi) || !isFinite(an.xf)) continue;
                    const alo = Math.min(+an.xi, +an.xf), ahi = Math.max(+an.xi, +an.xf);
                    if (ahi < a || alo > b) continue;
                    const nm = ('' + (an.name || an.type || '')).trim();
                    if (nm && names.indexOf(nm) < 0) names.push(nm);
                    if (names.length >= 3) break;
                }
            } catch (e) { }
            return names;
        };

        const TrackLayer = await exec('baja/bio/track-layer.js');
        const axis = { lo: base, hi: base + n - 1 };
        const name = (tgt.name || 'track') + '_SIM' + Math.round(MIN * 100) + '_' + kept.length
            + (sameTrack ? '' : ('_vs_' + (src.name || 'sel')));
        const L2 = new TrackLayer(name, axis.lo, 0, axis.hi, 1);
        L2.type = 'SelectionSimilarity';
        L2.labelColor = '#eaf6f9';
        L2.fixedIntervalDepth = 12;
        L2.allowStackedIntervals = true;
        L2.pop = true;

        // Colour runs with identity, so the eye sorts the layer before the labels are read.
        const colorFor = (id) => {
            const f = Math.max(0, Math.min(1, (id - MIN) / Math.max(0.0001, 1 - MIN)));
            const r = Math.round(250 - 180 * f), g = Math.round(120 + 100 * f), b = Math.round(90 + 60 * f);
            return 'rgba(' + r + ',' + g + ',' + b + ',0.65)';
        };
        const lanes = [0.72, 0.5, 0.28];
        const rows = [];
        kept.sort((a, b) => a.s - b.s);
        let i = 0;
        for (const h of kept) {
            const a = base + h.s, b = base + h.s + L - 1;
            const pct = Math.round(h.id * 100);
            const where = annAt(a, b);
            L2.addInterval(a, b, lanes[i % lanes.length],
                pct + '%' + (h.rc ? ' rc' : '') + (where.length ? (' · ' + where[0]) : ''),
                colorFor(h.id));
            i++;
            rows.push([pct + '%' + (h.rc ? ' (reverse complement)' : '') + ' at ' + a + '–' + b,
                (L - Math.round(h.id * L)) + ' mismatches over ' + L + ' nt'
                + (where.length ? (' · inside ' + where.join(', ')) : '')]);
        }

        L2.decor = {
            help: {
                title: 'Matches to ' + (sameTrack ? '' : ((src.name || 'another track') + ' '))
                    + lo + '–' + hi + ' (' + L + ' nt)',
                rows: rows,
                note: 'Each band is a stretch of this track laid base against base with the '
                    + (sameTrack ? 'selection'
                        : ('selected ' + L + ' nt of ' + (src.name || 'another track')))
                    + ', kept when at least ' + Math.round(MIN * 100) + '% of the positions '
                    + 'agree. The comparison is UNGAPPED: a copy carrying an insertion or a '
                    + 'deletion reads as two shorter matches rather than one, and would be found '
                    + 'by an aligner that this is not. Bands marked rc match the reverse '
                    + 'complement. Overlapping matches are collapsed to the best one, so a band is '
                    + 'a place rather than every offset that passed.'
                    + ((step > 1) ? (' This scan stepped ' + step + ' bases at a time because the '
                        + 'track is long: a match offset from the ones looked at may have been '
                        + 'missed.') : '')
                    + (sameTrack ? ' The selection itself is not drawn.' : '')
            }
        };
        L2.similarityHits = kept.map((h) => ({ start: base + h.s, end: base + h.s + L - 1, identity: h.id, rc: h.rc }));

        // ONTO THE TRACK THAT WAS SCANNED, because that is whose coordinates these are.
        try { tgt.addLayer(L2); } catch (e) { try { (tgt.track_layers || []).push(L2); } catch (e2) { } }

        // THE OTHER END, ON THE TRACK THE SELECTION CAME FROM. The selection mark is cleared
        // the moment the user clicks anywhere, and then the layer on the other track is a
        // set of percentages with nothing to be percentages OF. One band, named for what was
        // compared and how many places took it.
        if (!sameTrack) {
            const A = new TrackLayer((src.name || 'track') + '_SIMFROM_' + kept.length,
                Math.min(lo, hi), 0, Math.max(lo, hi), 1);
            A.type = 'SelectionSimilaritySource';
            A.labelColor = '#eaf6f9';
            A.fixedIntervalDepth = 12;
            A.pop = true;
            A.addInterval(lo, hi, 0.5,
                'compared \u00b7 ' + L.toLocaleString() + ' nt \u00b7 ' + kept.length + ' match'
                + (kept.length === 1 ? '' : 'es') + ' on ' + (tgt.name || 'the other track'),
                'rgba(79,208,230,0.55)');
            A.decor = {
                help: {
                    title: 'Compared against ' + (tgt.name || 'another track'),
                    rows: rows,
                    note: 'This is the stretch that was compared, and the matches themselves are '
                        + 'drawn on ' + (tgt.name || 'the other track') + ', joined to it by a line. '
                        + 'The comparison is ungapped and at ' + Math.round(MIN * 100) + '% or better.'
                }
            };
            try { src.addLayer(A); } catch (e) { try { (src.track_layers || []).push(A); } catch (e2) { } }
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        // ---- THE LINE BETWEEN THE TWO TRACKS -------------------------------------------
        // A match on another track is a statement about a PAIR of places, and a layer can
        // only draw one of them. Said in a sentence it reads as a fact with no location;
        // drawn as a line from the selection to each match it is the answer itself. Only
        // across tracks: on one track the selection and its matches are already in the
        // same picture, and a line looping back would be noise.
        if (!sameTrack) {
            try {
                await exec('baja/bio/compare/track-link-layer.js', graph,
                    kept.slice(0, Math.min(kept.length, 12)).map((h) => ({
                        from: { track: src, start: lo, end: hi },
                        to: { track: tgt, start: base + h.s, end: base + h.s + L - 1 },
                        label: Math.round(h.id * 100) + '%' + (h.rc ? ' rc' : '')
                    })),
                    { id: 'selection-similarity', color: 'rgba(79,208,230,0.95)' });
            } catch (e) { }
        }

        const best = kept.slice().sort((a, b) => b.id - a.id)[0];
        say((tgt.name || 'Track') + ': ' + kept.length + ' place'
            + (kept.length === 1 ? '' : 's') + ' match the selected ' + L.toLocaleString()
            + ' nt of ' + (sameTrack ? 'it' : (src.name || 'the other track'))
            + ' at ' + Math.round(MIN * 100) + '% or better, best ' + Math.round(best.id * 100)
            + '% at ' + (base + best.s) + (best.rc ? ' on the reverse complement' : '')
            + '. The comparison is ungapped, so a copy with an insertion or deletion would show '
            + 'as two shorter matches rather than one'
            + ((step > 1) ? (', and this scan stepped ' + step + ' bases at a time because the track is long')
                : '') + '.');
        return { ok: true, hits: L2.similarityHits, layer: L2, length: L, step: step,
            anchor: { start: lo, end: hi }, on: (tgt.name || ''), from: (src.name || ''),
            sameTrack: sameTrack };
    })();
}

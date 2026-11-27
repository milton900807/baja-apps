function (graph, track, range, opts) {

    // WHERE ELSE ON THIS TRACK DOES THE SELECTED STRETCH OCCUR?
    //   exec('baja/bio/compare/selection-similarity.js', graph, track, {start, end}, { min: 0.5 })
    //
    // The selection is compared with every other stretch of the same length on the track --
    // one comparison per offset, both strands -- and the places that match it better than
    // the threshold are drawn as a layer, each labelled with its identity. That is the
    // question behind "is this repeated", "is there a paralogous copy here", "did my ASO
    // site just move", and it had no answer short of exporting the sequence and running
    // something else.
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
        const whole = clean(track.sequence);
        const base = Math.floor(+track.xi);
        if (whole.length < 20) return fail((track.name || 'That track') + ' has no sequence loaded to compare against.');

        const qi = lo - base, qj = hi - base;
        const q = whole.slice(Math.max(0, qi), Math.max(0, qj));
        const L = q.length;
        if (L < 8) return fail('The selection is ' + L + ' nt. Select at least 8 to compare it across the track.');
        if (L > whole.length / 2) {
            return fail('The selection is ' + L.toLocaleString() + ' nt, more than half of '
                + (track.name || 'the track') + '. There is not enough left to compare it with.');
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

        const selfLo = qi, selfHi = qj;
        const overlapsSelf = (s) => (Math.min(s + L, selfHi) - Math.max(s, selfLo)) > (L / 2);

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
            say('Nothing on ' + (track.name || 'the track') + ' matches the selected '
                + L.toLocaleString() + ' nt at ' + Math.round(MIN * 100) + '% or better, on either '
                + 'strand. The comparison is ungapped, so a copy carrying an insertion or a '
                + 'deletion would not be found as one piece.');
            return { ok: true, hits: [], anchor: { start: lo, end: hi }, length: L, step: step };
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
                for (const an of (track.annotations || [])) {
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
        const name = (track.name || 'track') + '_SIM' + Math.round(MIN * 100) + '_' + kept.length;
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
                title: 'Matches to ' + lo + '–' + hi + ' (' + L + ' nt)',
                rows: rows,
                note: 'Each band is a stretch of this track laid base against base with the '
                    + 'selection, kept when at least ' + Math.round(MIN * 100) + '% of the positions '
                    + 'agree. The comparison is UNGAPPED: a copy carrying an insertion or a '
                    + 'deletion reads as two shorter matches rather than one, and would be found '
                    + 'by an aligner that this is not. Bands marked rc match the reverse '
                    + 'complement. Overlapping matches are collapsed to the best one, so a band is '
                    + 'a place rather than every offset that passed.'
                    + ((step > 1) ? (' This scan stepped ' + step + ' bases at a time because the '
                        + 'track is long: a match offset from the ones looked at may have been '
                        + 'missed.') : '')
                    + ' The selection itself is not drawn.'
            }
        };
        L2.similarityHits = kept.map((h) => ({ start: base + h.s, end: base + h.s + L - 1, identity: h.id, rc: h.rc }));

        try { track.addLayer(L2); } catch (e) { try { (track.track_layers || []).push(L2); } catch (e2) { } }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const best = kept.slice().sort((a, b) => b.id - a.id)[0];
        say((track.name || 'Track') + ': ' + kept.length + ' place'
            + (kept.length === 1 ? '' : 's') + ' match the selected ' + L.toLocaleString()
            + ' nt at ' + Math.round(MIN * 100) + '% or better, best ' + Math.round(best.id * 100)
            + '% at ' + (base + best.s) + (best.rc ? ' on the reverse complement' : '')
            + '. The comparison is ungapped, so a copy with an insertion or deletion would show '
            + 'as two shorter matches rather than one'
            + ((step > 1) ? (', and this scan stepped ' + step + ' bases at a time because the track is long')
                : '') + '.');
        return { ok: true, hits: L2.similarityHits, layer: L2, length: L, step: step,
            anchor: { start: lo, end: hi } };
    })();
}

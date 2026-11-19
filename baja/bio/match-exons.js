function (graph, qtrack, ttrack, opts) {

    // EVERY EXON OF ONE TRACK, MATCHED TO ITS CLOSEST BLOCK ON ANOTHER.
    //   exec('baja/bio/match-exons.js', graph, spag9, mapk8ip3, { max_exons: 60 })
    //
    // "iterate over all exons in A and find the closest sequence block that matches it on B"
    // was refused with "the editor cannot loop through exons automatically; you would need
    // to search each exon individually". Doing it by hand thirty times is exactly the work
    // the editor should be doing, and nothing about the loop is hard: it is the SAME search
    // that answers it for one exon, run for each, with the best hit kept.
    //
    // ONE SEARCH PER EXON, not one alignment of the whole transcript. A single alignment of
    // two transcripts finds the one best path through both and says nothing about where exon
    // 7 went; it can only put exon 7 somewhere consistent with exon 6. Searching each exon
    // against the whole of the other track lets each one land wherever it actually belongs,
    // including out of order and on the other strand, which is what a question about exons
    // as blocks is asking.
    //
    // THE BEST HIT ONLY, per exon. The underlying search ranks every place a region turns
    // up; "the closest block that matches it" is the first of those, and the rest would
    // bury the picture in bars.
    //
    // Drawn through baja/bio/match-layer.js like every other match on the canvas: the same
    // numbering, the same colour per pair, the same two-headed arrow between the two.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            if (!qtrack || !ttrack) { resolve({ error: 'two tracks are needed' }); return; }
            if (qtrack === ttrack) { resolve({ error: 'the two tracks are the same track' }); return; }

            const MAX_EXONS = Math.max(1, Math.min(+(o.max_exons || 60), 200));
            const nameQ = '' + (qtrack.name || 'the first track');
            const nameT = '' + (ttrack.name || 'the other track');

            const seqIn = (t, a, b) => {
                try {
                    if (!t.getSequenceRange) return '';
                    return ('' + (t.getSequenceRange(a, b) || '')).toUpperCase().replace(/[^ACGTUN]/g, '');
                } catch (e) { return ''; }
            };

            let R = null;
            try { R = await exec('baja/bio/track-regions.js', qtrack); } catch (e) { R = null; }
            const exons = (R && R.exons) ? R.exons() : [];
            if (!exons.length) {
                resolve({ error: nameQ + ' has no annotated exons to iterate over' });
                return;
            }

            // The whole of the other track once, not once per exon: it is the same target
            // every time and re-reading it thirty times is thirty times the work.
            const lo = +ttrack.xi;
            const tlen = (ttrack.sequence && ttrack.sequence.length)
                ? ttrack.sequence.length : Math.abs((+ttrack.xf) - (+ttrack.xi));
            const tseq = seqIn(ttrack, lo, lo + tlen);
            if (!tseq || tseq.length < 12) {
                resolve({ error: nameT + ' has no sequence to search' });
                return;
            }

            const list = exons.slice(0, MAX_EXONS);
            const rows = [], found = [], missed = [];
            let n = 0;
            for (const ex of list) {
                n++;
                const a = Math.min(+ex.xi, +ex.xf), b = Math.max(+ex.xi, +ex.xf);
                const qseq = seqIn(qtrack, a, b);
                // SAID, NOT SKIPPED. An exon too short to search is a real answer about that
                // exon; dropping it silently leaves a gap in the numbering and no reason for it.
                if (!qseq || qseq.length < 12) {
                    missed.push({ exon: n, why: 'too short to search (' + ((qseq || '').length) + ' nt)' });
                    continue;
                }
                try {
                    graph.setMessage('Matching exon ' + n + ' of ' + list.length + ' …');
                } catch (e) { }

                let res = null;
                try {
                    res = await exec('py/bio/search-region-in-track.py',
                        { name: 'exon ' + n, seq: qseq, offset: a },
                        { name: nameT, seq: tseq, offset: lo },
                        { max_hits: 1, strands: (o.strands || 'both') });
                } catch (e) { res = null; }
                if (!res || res.status === 'ERROR' || !(res.hits || []).length) {
                    missed.push({ exon: n, len: qseq.length,
                        why: (res && res.status === 'ERROR')
                            ? ('' + (res.error || 'the search failed'))
                            : 'nothing above the noise floor' });
                    continue;
                }
                // THE FIELDS THE SEARCHER ACTUALLY RETURNS. start/end are the hit on the
                // target in that track's coordinates, query_start/query_end are the part of
                // the exon that matched in this track's, strand is '+' or '-' and NOT a
                // number, and the coverage is query_coverage. Reading t0/t1/coverage instead
                // produced NaN-NaN positions and 0.0% coverage on every row: undefined
                // arithmetic says nothing, so nothing looked wrong until it was on screen.
                const h = res.hits[0];
                const qa = isFinite(+h.query_start) ? +h.query_start : a;
                const qb = isFinite(+h.query_end) ? +h.query_end : b;
                found.push({
                    exon: n, exx1: a, exx2: b,
                    // The part of the exon that matched, which is what the bar should cover:
                    // drawing the whole exon for a 40 nt match inside a 170 nt one claims
                    // more than the alignment found.
                    qx1: Math.min(qa, qb), qx2: Math.max(qa, qb),
                    tx1: Math.min(+h.start, +h.end), tx2: Math.max(+h.start, +h.end),
                    identity: +h.identity, score: +h.score,
                    strand: (('' + h.strand) === '-' || +h.strand < 0) ? -1 : 1,
                    covers: +h.query_coverage, len: qseq.length,
                    matched: Math.abs(qb - qa) + 1
                });
            }

            if (!found.length) {
                resolve({
                    error: 'None of the ' + list.length + ' exons of ' + nameQ + ' matches anything on '
                        + nameT + ' above the noise floor.'
                        + (missed.length ? (' (' + missed.slice(0, 4).map((m) => 'exon ' + m.exon + ': ' + m.why).join('; ') + ')') : '')
                });
                return;
            }

            // ---- drawn, and linked ------------------------------------------------------
            let drawn = null;
            try {
                const ML = await exec('baja/bio/match-layer.js');
                const opt = { suffix: '_exon_matches', dataType: 'SEQSIM' };
                // Numbered by EXON, not by rank: the number on the bar has to be the number
                // the user already uses for that exon, or the picture needs a key.
                const qB = found.map((f) => ({ n: f.exon, x1: f.qx1, x2: f.qx2, identity: f.identity,
                    inverted: f.strand < 0, label: 'e' + f.exon + (f.strand < 0 ? '⇄' : '')
                        + ' ' + ML.pct(f.identity) }));
                const tB = found.map((f) => ({ n: f.exon, x1: f.tx1, x2: f.tx2, identity: f.identity,
                    inverted: f.strand < 0, label: 'e' + f.exon + (f.strand < 0 ? '⇄' : '')
                        + ' ' + ML.pct(f.identity) }));
                const layQ = ML.draw(qtrack, qB, opt);
                ML.draw(ttrack, tB, opt);
                let links = 0;
                if (layQ) {
                    links = ML.link(layQ, qtrack, ttrack, found.map((f) => ({
                        n: f.exon, x1: f.qx1, x2: f.qx2, ox1: f.tx1, ox2: f.tx2, inverted: f.strand < 0
                    })));
                }
                drawn = { blocks: found.length, links: links };
                try { if (graph.wake) graph.wake(); } catch (e) { }
            } catch (e) { drawn = { error: ('' + (e && e.message ? e.message : e)) }; }

            // ---- the panel ----------------------------------------------------------------
            const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';
            const best = found.slice().sort((x, y) => y.score - x.score)[0];
            const strong = found.filter((f) => f.identity >= 0.8);
            rows.push(['answer', found.length + ' of ' + list.length + ' exons of ' + nameQ
                + ' match a block on ' + nameT + '. '
                + (strong.length
                    ? (strong.length + ' of them at 80% identity or better (exon'
                        + (strong.length === 1 ? ' ' : 's ') + strong.map((f) => f.exon).join(', ') + '). ')
                    : 'None reaches 80% identity. ')
                + 'The closest is exon ' + best.exon + ' at ' + pct(best.identity)
                + ' over ' + best.matched.toLocaleString() + ' nt.']);
            for (const f of found) {
                rows.push(['exon ' + f.exon + ' · ' + pct(f.identity),
                    f.len.toLocaleString() + ' nt at ' + f.qx1.toLocaleString() + '-' + f.qx2.toLocaleString()
                    + ' matches ' + nameT + ' ' + f.tx1.toLocaleString() + '-' + f.tx2.toLocaleString()
                    + (f.strand < 0 ? ' (reverse strand)' : '')
                    + ', score ' + Math.round(f.score)
                    + ', covering ' + pct(f.covers) + ' of the exon.']);
            }
            if (missed.length) {
                rows.push(['no match', missed.map((m) => 'exon ' + m.exon + ' (' + m.why + ')').join(', ') + '.']);
            }
            if (exons.length > list.length) {
                rows.push(['not searched', (exons.length - list.length) + ' further exons: '
                    + 'this stops at ' + MAX_EXONS + ' to keep one request from becoming hundreds of searches.']);
            }
            rows.push(['how', 'Each exon was searched against the whole of ' + nameT + ' on both '
                + 'strands, scored like blastn, and its best hit kept. A single alignment of the '
                + 'two transcripts could not answer this: it finds one path through both, so an '
                + 'exon can only land somewhere consistent with its neighbours, never out of '
                + 'order and never reversed.']);

            // ---- the answer as a PICTURE ---------------------------------------------------
            // Thirty rows of "148 nt at 4,827-4,975 matches ... 1,100-1,280" is the right
            // information in the wrong shape: where each exon went, whether the order held
            // and which ones flipped are all shapes, and a list cannot show any of them.
            // The rows are still there, under the Numbers button.
            const extentOf = (t) => {
                const len = (t.sequence && t.sequence.length)
                    ? t.sequence.length : Math.abs((+t.xf) - (+t.xi));
                return { x1: +t.xi, x2: (+t.xi) + len };
            };
            let shown = null;
            try {
                shown = await exec('baja/bio/compare-view.js', {
                    title: 'Exons of ' + nameQ + ' matched on ' + nameT,
                    summary: rows[0][1],
                    a: { name: nameQ, x1: extentOf(qtrack).x1, x2: extentOf(qtrack).x2 },
                    b: { name: nameT, x1: extentOf(ttrack).x1, x2: extentOf(ttrack).x2 },
                    blocks: found.map((f) => ({
                        n: f.exon, label: 'e' + f.exon, identity: f.identity, inverted: f.strand < 0,
                        a: { x1: f.qx1, x2: f.qx2 }, b: { x1: f.tx1, x2: f.tx2 },
                        note: Math.round(f.covers * 100) + '% of the exon, score ' + Math.round(f.score)
                    })),
                    // The exons that matched nothing, in their place on the lane: twenty-two
                    // lines of "nothing above the noise floor" say less than twenty-two gaps.
                    unmatched: missed.map((x) => {
                        const ex = list[x.exon - 1];
                        if (!ex) return null;
                        return { label: 'exon ' + x.exon, why: x.why,
                            a: { x1: Math.min(+ex.xi, +ex.xf), x2: Math.max(+ex.xi, +ex.xf) } };
                    }).filter(Boolean),
                    rows: rows
                });
            } catch (e) { shown = null; }

            const help = {
                title: 'Exons of ' + nameQ + ' matched on ' + nameT,
                rows: rows,
                note: 'Identity is over the matched block, and coverage says how much of the exon '
                    + 'that block accounts for: a short perfect match inside a long exon reads as '
                    + '100% identical and covers very little of it.'
            };
            // Only when the picture could not be drawn: two panels over each other is one
            // panel too many, and the rows are in the picture already.
            if (!shown) {
                try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
                catch (e) { try { graph.setResultMessage(rows[0][1]); } catch (e2) { } }
            }
            try { window.__bajaExonMatches = { found: found, missed: missed }; } catch (e) { }
            try {
                graph.setMessage(found.length + ' of ' + list.length + ' exons matched'
                    + ((drawn && drawn.blocks) ? (' · drawn and linked on both tracks') : ''));
            } catch (e) { }

            resolve({ found: found, missed: missed, drawn: drawn, count: found.length, of: list.length });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

function (graph, qtrack, ttrack, opts) {

    // EVERY REGION OF ONE KIND ON ONE TRACK, MATCHED TO ITS CLOSEST BLOCK ON ANOTHER.
    //   exec('baja/bio/match-regions.js', graph, spag9, mapk8ip3, { features: 'exons' })
    //
    // EXONS ARE ONE KIND OF REGION, NOT THE ONLY ONE. The same question is worth asking of
    // introns, of either UTR, of the CDS: "compare the introns", "does the 3' UTR match
    // anything over there". Written for exons alone it would have been copied twice and the
    // copies would have drifted, so the thing being iterated over is a parameter and the
    // regions come from baja/bio/track-regions.js, which already knows what each one is --
    // including that an intron is the gap between exons rather than an annotation a track
    // carries, and that both are numbered along the transcript rather than along the
    // coordinate line, so intron 1 follows exon 1 on a minus-strand track too.
    //
    // "iterate over all exons in A and find the closest sequence block that matches it on B"
    // was refused with "the editor cannot loop through exons automatically; you would need
    // to search each exon individually". Doing it by hand thirty times is exactly the work
    // the editor should be doing, and nothing about the loop is hard: it is the SAME search
    // that answers it for one region, run for each, with the best hit kept.
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

            const MAX_EXONS = Math.max(1, Math.min(+(o.max_exons || o.max_regions || 60), 200));

            // What is being iterated over. A list of regions for exons and introns; a single
            // region for the CDS, either UTR or the whole transcript, where the loop runs
            // once -- which is the same operation, not a special case.
            const KIND = {
                exons: { word: 'exon', plural: 'exons', list: (R) => R.exons() },
                introns: { word: 'intron', plural: 'introns', list: (R) => R.introns() },
                five_prime_utr: { word: '5\u2032 UTR', plural: '5\u2032 UTR', one: (R) => R.utr5() },
                three_prime_utr: { word: '3\u2032 UTR', plural: '3\u2032 UTR', one: (R) => R.utr3() },
                cds: { word: 'CDS', plural: 'CDS', one: (R) => R.cds() },
                transcript: { word: 'transcript', plural: 'transcript', one: (R) => R.whole() }
            };
            const wantKey = ('' + (o.features || 'exons')).trim().toLowerCase()
                .replace(/[\s-]+/g, '_').replace(/^(the_)/, '');
            const KEYMAP = { exon: 'exons', intron: 'introns', utr5: 'five_prime_utr',
                five_prime: 'five_prime_utr', '5_utr': 'five_prime_utr', utr3: 'three_prime_utr',
                three_prime: 'three_prime_utr', '3_utr': 'three_prime_utr', coding: 'cds',
                whole: 'transcript', gene: 'transcript' };
            const key = KIND[wantKey] ? wantKey : (KIND[KEYMAP[wantKey]] ? KEYMAP[wantKey] : 'exons');
            const K = KIND[key];
            // "3' UTR 1" reads as though there were a second one. Only the kinds a track has
            // several of are numbered.
            const NAMED = (i) => K.list ? (K.word + ' ' + i) : K.word;
            const CAPW = (t) => ('' + t).charAt(0).toUpperCase() + ('' + t).slice(1);
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
            if (!R) { resolve({ error: 'the regions of ' + nameQ + ' could not be read' }); return; }

            // ONE SHAPE FOR EVERY KIND OF REGION. An exon comes back as the annotation that
            // carries it, with xi/xf; an intron is derived rather than annotated and comes
            // back as the span {start, end} it is; and the UTRs and the CDS come back as
            // spans too. Reading xi off a span gives undefined, and the length of the
            // sequence between undefined and undefined is nothing at all, which is how
            // three introns became "too short to search (0 nt)".
            const asRegion = (r) => {
                if (!r) return null;
                const a = isFinite(+r.xi) ? +r.xi : (isFinite(+r.start) ? +r.start : NaN);
                const b = isFinite(+r.xf) ? +r.xf : (isFinite(+r.end) ? +r.end : NaN);
                if (!isFinite(a) || !isFinite(b)) return null;
                return { xi: Math.min(a, b), xf: Math.max(a, b) };
            };

            let exons = [];
            if (K.list) exons = (K.list(R) || []).map(asRegion).filter(Boolean);
            else {
                const one = K.one(R);
                // A region the track does not have is the answer, not a crash: a non-coding
                // transcript has no CDS and no UTRs, and saying so is better than an empty
                // picture.
                if (!one || one.error || !isFinite(one.start)) {
                    resolve({ error: (one && one.error) ? one.error
                        : (nameQ + ' has no ' + K.word + ' to compare') });
                    return;
                }
                const r1 = asRegion(one);
                if (!r1) { resolve({ error: nameQ + ' has no ' + K.word + ' to compare' }); return; }
                exons = [r1];
            }
            if (!exons.length) {
                resolve({ error: nameQ + ' has no ' + K.plural + ' to iterate over'
                    + (key === 'introns' ? ' (a single-exon transcript has none)' : '') });
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
            let W = null;
            try {
                W = await exec('baja/lib/working.js',
                    (K.list ? (CAPW(K.plural) + ' of ' + nameQ) : (CAPW(K.word) + ' of ' + nameQ))
                        + ' against ' + nameT,
                    'One search per ' + K.word + ', ' + list.length + ' in all.');
            } catch (e) { W = null; }
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
                // COUNTED OUT LOUD. One search per region means a thirty-exon transcript
                // is thirty round trips, and a corner message on a timer is not enough to
                // tell a long job from a dead one.
                try {
                    if (W) W.step('Searching ' + K.word + ' ' + n + ' of ' + list.length
                        + ' against ' + nameT + ' \u2026 ' + found.length + ' matched so far');
                    else graph.setMessage('Matching ' + K.word + ' ' + n + ' of ' + list.length + ' \u2026');
                } catch (e) { }

                let res = null;
                try {
                    res = await exec('py/bio/search-region-in-track.py',
                        { name: K.word + ' ' + n, seq: qseq, offset: a },
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
                // A FAILURE IS NOT A NEGATIVE RESULT. DNM3's genomic track is 571 kb and the
                // searcher refused anything over 400 kb, so all 22 searches returned the same
                // error -- and this reported it as "none of the 22 exons of DNM1 matches
                // anything on DNM3 above the noise floor", which about two paralogues is
                // false. Nothing was searched. When the searches did not run, say why they
                // did not run; "no match" is a claim about the sequences and has to be
                // earned by actually comparing them.
                const errs = missed.filter((m) => m && m.why && !/noise floor|too short/.test(m.why));
                if (errs.length >= Math.max(1, Math.ceil(missed.length * 0.5))) {
                    const why = errs[0].why;
                    const same = errs.every((m) => m.why === why);
                    const msg = (same
                        ? ('The search could not run against ' + nameT + ': ' + why)
                        : ('The searches against ' + nameT + ' failed: ' + why))
                        + (errs.length < list.length
                            ? (' (' + errs.length + ' of ' + list.length + ' ' + K.plural + ')') : '');
                    try { if (W) W.fail(msg); } catch (e) { }
                    resolve({ error: msg });
                    return;
                }
                try { if (W) W.fail((K.list
                    ? ('None of the ' + list.length + ' ' + K.plural)
                    : ('The ' + K.word)) + ' of ' + nameQ + ' matches anything on ' + nameT
                    + ' above the noise floor.'); } catch (e) { }
                resolve({
                    error: (K.list
                        ? ('None of the ' + list.length + ' ' + K.plural + ' of ' + nameQ)
                        : ('The ' + K.word + ' of ' + nameQ))
                        + ' matches anything on ' + nameT + ' above the noise floor.'
                        + (missed.length ? (' (' + missed.slice(0, 4).map((m) => NAMED(m.exon) + ': ' + m.why).join('; ') + ')') : '')
                });
                return;
            }

            try { if (W) W.step('Drawing ' + found.length + ' match'
                + (found.length === 1 ? '' : 'es') + ' \u2026'); } catch (e) { }

            // ---- drawn, and linked ------------------------------------------------------
            let drawn = null;
            try {
                const ML = await exec('baja/bio/match-layer.js');
                // A short tag on the bar: e7 for an exon, i7 for an intron, the name itself
                // for a one-off region, since "5' UTR 1" reads as though there were a second.
                const LBL = (i) => K.list ? ((key === 'introns' ? 'i' : 'e') + i) : K.word;
                const opt = { suffix: '_' + key + '_matches', dataType: 'SEQSIM' };
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
            const CAP = (t) => ('' + t).charAt(0).toUpperCase() + ('' + t).slice(1);
            const TITLE = CAP(K.plural) + ' of ' + nameQ + ' matched on ' + nameT;
            const best = found.slice().sort((x, y) => y.score - x.score)[0];
            const strong = found.filter((f) => f.identity >= 0.8);
            rows.push(['answer', (K.list
                ? (found.length + ' of ' + list.length + ' ' + K.plural + ' of ' + nameQ
                    + ' match a block on ' + nameT + '. '
                    + (strong.length
                        ? (strong.length + ' of them at 80% identity or better (' + K.word
                            + (strong.length === 1 ? ' ' : 's ') + strong.map((f) => f.exon).join(', ') + '). ')
                        : 'None reaches 80% identity. ')
                    + 'The closest is ' + K.word + ' ' + best.exon + ' at ' + pct(best.identity)
                    + ' over ' + best.matched.toLocaleString() + ' nt.')
                // One region is one sentence: "1 of 1 3' UTR match a block" is a count of
                // something there is only one of.
                : ('The ' + K.word + ' of ' + nameQ + ' matches a block on ' + nameT + ' at '
                    + pct(best.identity) + ' over ' + best.matched.toLocaleString() + ' nt, '
                    + pct(best.covers) + ' of it.'))]);
            for (const f of found) {
                rows.push(['exon ' + f.exon + ' · ' + pct(f.identity),
                    f.len.toLocaleString() + ' nt at ' + f.qx1.toLocaleString() + '-' + f.qx2.toLocaleString()
                    + ' matches ' + nameT + ' ' + f.tx1.toLocaleString() + '-' + f.tx2.toLocaleString()
                    + (f.strand < 0 ? ' (reverse strand)' : '')
                    + ', score ' + Math.round(f.score)
                    + ', covering ' + pct(f.covers) + ' of the ' + K.word + '.']);
            }
            if (missed.length) {
                rows.push(['no match', missed.map((m) => NAMED(m.exon) + ' (' + m.why + ')').join(', ') + '.']);
            }
            if (exons.length > list.length) {
                rows.push(['not searched', (exons.length - list.length) + ' further ' + K.plural + ': '
                    + 'this stops at ' + MAX_EXONS + ' to keep one request from becoming hundreds of searches.']);
            }
            rows.push(['how', 'Each ' + K.word + ' was searched against the whole of ' + nameT + ' on both '
                + 'strands, scored like blastn, and its best hit kept. A single alignment of the '
                + 'two transcripts could not answer this: it finds one path through both, so a '
                + 'region can only land somewhere consistent with its neighbours, never out of '
                + 'order and never reversed.']);

            // ---- the answer as a PICTURE ---------------------------------------------------
            // Thirty rows of "148 nt at 4,827-4,975 matches ... 1,100-1,280" is the right
            // information in the wrong shape: where each exon went, whether the order held
            // and which ones flipped are all shapes, and a list cannot show any of them.
            // The rows are still there, under the Numbers button.
            // HOW STABLY EACH EXON SPLICES, CARRIED INTO THE PICTURE.
            //
            // The comparison says which exons correspond and how alike they are. Whether an
            // exon is reliably in the message is a different question, and the one that
            // decides whether a conserved block is worth anything: a 90% identical exon
            // that is skipped in half the transcripts is not the same find as a 90%
            // identical constitutive one.
            //
            // Read off the PSI layer's own exonStability rows, which is where the number on
            // the canvas comes from (baja/bio/track-layer.js draws the same rows). Not
            // recomputed here: two numbers for one thing drift apart, and the one on the
            // picture would end up disagreeing with the one on the track behind it. Without
            // a PSI run there is nothing to carry, and the view says so rather than
            // printing a blank where a number belongs.
            const stabilityOf = (t) => {
                let rowsPsi = null;
                try {
                    rowsPsi = (t.track_layers || []).filter((x) => x && x.magnitudeMode === 'psi'
                        && Array.isArray(x.exonStability) && x.exonStability.length).pop();
                } catch (e) { rowsPsi = null; }
                if (!rowsPsi) return null;
                const list2 = rowsPsi.exonStability;
                // Matched by overlap, not by exon number: the hit on the OTHER track is a
                // stretch of sequence and carries no exon number of its own, and the two
                // tracks number their exons independently anyway.
                return (x1, x2) => {
                    const a2 = Math.min(+x1, +x2), b2 = Math.max(+x1, +x2);
                    let best = null, bestOv = 0;
                    for (const r of list2) {
                        const lo2 = Math.min(+r.lo, +r.hi), hi2 = Math.max(+r.lo, +r.hi);
                        const ov = Math.min(b2, hi2) - Math.max(a2, lo2);
                        if (ov > 0 && ov > bestOv) { bestOv = ov; best = r; }
                    }
                    if (!best) return null;
                    if (best.untrusted) return { untrusted: true, why: best.untrustedWhy || '' };
                    const psi = +best.psi;
                    if (!isFinite(psi)) return null;
                    return {
                        pct: (psi >= 0.995) ? 100 : Math.round(psi * 100),
                        word: best.word || '',
                        measured: !!best.measured,
                        exon: best.exon
                    };
                };
            };
            const stabA = stabilityOf(qtrack), stabB = stabilityOf(ttrack);
            const stabAt = (f, x1, x2) => { try { return f ? f(x1, x2) : null; } catch (e) { return null; } };

            const extentOf = (t) => {
                const len = (t.sequence && t.sequence.length)
                    ? t.sequence.length : Math.abs((+t.xf) - (+t.xi));
                return { x1: +t.xi, x2: (+t.xi) + len };
            };
            let shown = null;
            try {
                shown = await exec('baja/bio/compare-view.js', {
                    title: TITLE,
                    summary: rows[0][1],
                    a: { name: nameQ, x1: extentOf(qtrack).x1, x2: extentOf(qtrack).x2 },
                    b: { name: nameT, x1: extentOf(ttrack).x1, x2: extentOf(ttrack).x2 },
                    blocks: found.map((f) => ({
                        n: f.exon, label: 'e' + f.exon, identity: f.identity, inverted: f.strand < 0,
                        a: { x1: f.qx1, x2: f.qx2, stab: stabAt(stabA, f.exx1, f.exx2) },
                        b: { x1: f.tx1, x2: f.tx2, stab: stabAt(stabB, f.tx1, f.tx2) },
                        note: Math.round(f.covers * 100) + '% of the exon, score ' + Math.round(f.score)
                    })),
                    // The exons that matched nothing, in their place on the lane: twenty-two
                    // lines of "nothing above the noise floor" say less than twenty-two gaps.
                    unmatched: missed.map((x) => {
                        const ex = list[x.exon - 1];
                        if (!ex) return null;
                        const ea = Math.min(+ex.xi, +ex.xf), eb = Math.max(+ex.xi, +ex.xf);
                        return { label: NAMED(x.exon), why: x.why,
                            a: { x1: ea, x2: eb, stab: stabAt(stabA, ea, eb) } };
                    }).filter(Boolean),
                    rows: rows,
                    // Which tracks have been scored at all, so an empty row reads as "not
                    // run here" rather than as an exon nobody could measure.
                    stability: { a: !!stabA, b: !!stabB }
                });
            } catch (e) { shown = null; }

            const help = {
                title: TITLE,
                rows: rows,
                note: 'Identity is over the matched block, and coverage says how much of the exon '
                    + 'that block accounts for: a short perfect match inside a long ' + K.word + ' reads as '
                    + '100% identical and covers very little of it.'
            };
            // Only when the picture could not be drawn: two panels over each other is one
            // panel too many, and the rows are in the picture already.
            if (!shown) {
                try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
                catch (e) { try { graph.setResultMessage(rows[0][1]); } catch (e2) { } }
            }
            try { if (W) W.done(); } catch (e) { }
            try { window.__bajaExonMatches = { found: found, missed: missed }; } catch (e) { }
            try {
                graph.setMessage((K.list ? (found.length + ' of ' + list.length + ' ' + K.plural)
                    : ('the ' + K.word)) + ' matched'
                    + ((drawn && drawn.blocks) ? (' · drawn and linked on both tracks') : ''));
            } catch (e) { }

            resolve({ found: found, missed: missed, drawn: drawn, count: found.length,
                of: list.length, features: key, word: K.word, plural: K.plural });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

function (track, opts) {

    // CANDIDATE ACCEPTOR SITES IN A TRANSCRIPT'S OWN INTRONS, RANKED BY SPLICE STRENGTH.
    //   const r = await exec('baja/bio/splicing/acceptor-candidates.js', track, { top: 25 });
    //   // { ok: true,  rows: [{ rank, x, score, percentile, outOf, intron, distToExon }] }
    //   // { ok: false, reason: '<why, in a sentence the caller can show>', rows: [] }
    //
    // RANK IS THE ANSWER HERE, AND THE SCORE IS NOT. The site model's own report is explicit
    // about this: only 26% of confirmed cryptic acceptors exceed a score of 0.5, against
    // 0.69% of decoys, so a threshold either throws away three quarters of the real sites or
    // admits a flood of intronic AGs. Ranking a gene's own intronic positions and reading the
    // top is what the numbers support, so this applies NO score cutoff at all.
    //
    // EVERY FAILURE SAYS WHICH FAILURE IT IS. The first version of this returned a bare []
    // from seven different places -- no exons, no introns, no sequence, a spliced sequence, an
    // unreachable model, a model error, nothing intronic -- and the caller had one sentence
    // for all of them. On STMN2, the gene this was built for, it reported "fewer than two
    // exons" about a five-exon transcript. An empty answer that cannot say why is worse than
    // no answer, because it looks like a result. Each path below returns its own reason.
    //
    // WHAT THE RANKING IS WORTH, measured rather than asserted. Against 489 catalogued
    // TDP-43 cryptic acceptors in 436 genes: the true acceptor has a median rank of 35 out of
    // a median 5,263 intronic candidates per gene (the top 0.7%), the top 25 contains it for
    // about half of genes and the top 10 for about 29%.
    //
    // IT CANNOT SEE A SITE THAT SITS ON AN ANNOTATED EDGE. Annotated acceptors are excluded,
    // because they score near 1.0 and would fill every top-10 with sites the transcript
    // already uses. Roughly a quarter to a third of catalogued cryptic acceptors lie within a
    // base or two of an annotated boundary, and for those genes this returns nothing useful.
    //
    // Acceptor positions only. Pairing an acceptor with a downstream donor to propose a whole
    // pseudo-exon is a stronger claim and lives in cryptic-exon-candidates.js.
    //
    // opts.profile    a { acceptor } already in hand ([[x, score], ...] in track coordinates)
    // opts.top        25     how many to return, best first; 0 returns all
    // opts.edge       3      bases around an annotated acceptor treated as that site
    // opts.min_intron 20     ignore gaps shorter than this

    return (async () => {
        const t = track || {};
        const o = opts || {};
        const TOP = (o.top != null) ? +o.top : 25;
        const EDGE = (o.edge != null) ? +o.edge : 3;
        const MIN_INTRON = (o.min_intron != null) ? +o.min_intron : 20;
        const who = t.name || 'This track';
        const comma = (v) => ('' + v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const fail = (reason) => ({ ok: false, reason: reason, rows: [] });

        const exons = ((t.getExons ? t.getExons() : (t.annotations || [])
            .filter((a) => a && ('' + a.type).toLowerCase() === 'exon')) || [])
            .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }))
            .filter((e) => isFinite(e.lo) && isFinite(e.hi))
            .sort((a, b) => a.lo - b.lo);
        if (exons.length < 2) {
            return fail(who + ' has ' + exons.length + ' readable annotated exon'
                + (exons.length === 1 ? '' : 's') + ', so it has no introns of its own to '
                + 'search. A transcript track with its exons drawn should report more than '
                + 'this; if it does, the exon annotations are not reaching this tool.');
        }

        const introns = [];
        for (let i = 0; i + 1 < exons.length; i++) {
            const lo = exons[i].hi + 1, hi = exons[i + 1].lo - 1;
            if (hi - lo + 1 >= MIN_INTRON) introns.push({ lo: lo, hi: hi });
        }
        if (!introns.length) {
            return fail(who + ' has ' + exons.length + ' exons but no gap between them of at '
                + 'least ' + MIN_INTRON + ' nt, so there is no intron to search.');
        }

        // The annotated acceptor of an exon is the last INTRONIC base before it. Both edges of
        // every exon are held out: a donor on one strand is an acceptor's neighbour on the
        // other, and the few extra positions cost nothing next to admitting a site the
        // transcript already uses.
        const annotated = [];
        for (const e of exons) { annotated.push(e.lo - 1, e.hi + 1); }

        let prof = o.profile || null;
        if (!prof) {
            const seq = '' + (t.sequence || '');
            if (!seq) {
                return fail(who + ' has no sequence loaded, so the site model has nothing to '
                    + 'score. Load the transcript as pre-mRNA and run again.');
            }
            // A SPLICED SEQUENCE IN A GENOMIC FRAME CANNOT BE SCORED, and is the one failure
            // that otherwise looks exactly like a working run with no hits: the model scores
            // intronic bases with 1,000 nt of context, and a cDNA has had those removed at
            // every boundary. The signature is a sequence shorter than the span it claims.
            // Taken from splicing-profile.js, which has refused it this way for a while.
            if (isFinite(+t.xi) && isFinite(+t.xf)) {
                const span = Math.abs(Math.floor(+t.xf) - Math.floor(+t.xi)) + 1;
                if (seq.length < span * 0.99) {
                    return fail(who + ' holds a spliced sequence (' + comma(seq.length)
                        + ' nt) in a ' + comma(span) + ' nt genomic frame, so it has no '
                        + 'intronic sequence to score. Load the transcript as pre-mRNA (a '
                        + 'primary-assembly Ensembl id) and run again.');
                }
            }
            const xi = (t.xi != null) ? t.xi : 0;
            let orientation = 'plus';
            try { orientation = await exec('baja/bio/splicing/strand-orientation.js', t, seq); }
            catch (e) { orientation = 'plus'; }
            let data = null, reached = false;
            try {
                data = await exec(window['env']['apiUrl'] + '/py/bio/splice/splicing-profile.py',
                    null, '' + seq, '' + xi, '' + (t.strand != null ? t.strand : 1), 'sites',
                    '', orientation, '', '', '');
                reached = true;
            } catch (e) {
                return fail('The site model could not be reached: '
                    + (e && e.message ? e.message : e));
            }
            if (reached && !data) return fail('The site model returned nothing for ' + who + '.');
            if (data.error) return fail('The site model refused ' + who + ': ' + data.error);
            let acc = [];
            try { acc = JSON.parse(data.acceptor || '[]'); }
            catch (e) { return fail('The site model returned acceptor scores this tool could not read: ' + (e && e.message ? e.message : e)); }
            if (!acc.length) {
                return fail('The site model ran on ' + who + ' but returned no acceptor '
                    + 'positions at all, which usually means the sequence it was given was '
                    + 'not the genomic one.');
            }
            prof = { acceptor: acc };
        }

        const inIntron = (x) => {
            for (let i = 0; i < introns.length; i++) {
                if (x >= introns[i].lo && x <= introns[i].hi) return i;
            }
            return -1;
        };
        const nearAnnotated = (x) => {
            for (let i = 0; i < annotated.length; i++) {
                if (Math.abs(x - annotated[i]) <= EDGE) return true;
            }
            return false;
        };
        const distToExon = (x) => {
            let best = Infinity;
            for (const e of exons) {
                best = Math.min(best, Math.abs(x - e.lo), Math.abs(x - e.hi));
            }
            return isFinite(best) ? best : null;
        };

        const scored = (prof.acceptor || []).length;
        const rows = [];
        for (const p of (prof.acceptor || [])) {
            if (!p) continue;
            // null and undefined coerce to 0, which is a LEGITIMATE score, so a malformed
            // payload would otherwise be ranked last instead of reported as malformed.
            // Checked before coercion for that reason.
            if (p[0] == null || p[1] == null) continue;
            const x = +p[0], s = +p[1];
            if (!isFinite(x) || !isFinite(s)) continue;
            const ii = inIntron(x);
            if (ii < 0) continue;
            if (nearAnnotated(x)) continue;
            rows.push({ x: x, score: s, intron: ii, distToExon: distToExon(x) });
        }
        if (!rows.length) {
            return fail(comma(scored) + ' acceptor position' + (scored === 1 ? '' : 's')
                + ' were scored on ' + who + ', but none of them fall inside one of its '
                + introns.length + ' introns away from an annotated edge.');
        }

        rows.sort((a, b) => b.score - a.score);
        // The percentile is against this gene's OWN intronic positions, which is the only
        // comparison the score supports: an absolute 0.4 means nothing, being the best of
        // 5,000 in this intron means something.
        const n = rows.length;
        for (let i = 0; i < n; i++) {
            rows[i].rank = i + 1;
            rows[i].percentile = +(100 * (1 - i / n)).toFixed(2);
            rows[i].outOf = n;
            rows[i].score = +rows[i].score.toFixed(4);
        }
        return { ok: true, outOf: n, scored: scored, rows: (TOP > 0) ? rows.slice(0, TOP) : rows };
    })();
}

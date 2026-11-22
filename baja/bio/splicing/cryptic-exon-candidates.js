function (track, opts) {

    // EXONS THE TRANSCRIPT COULD USE BUT DOES NOT, found in its own introns.
    //   const c = await exec('baja/bio/splicing/cryptic-exon-candidates.js', track, { per_intron: 6 });
    //   // [{ xi, xf, len, intron, acceptorScore, donorScore, score, frame }]
    //
    // An intron is not empty. It carries splice sites the spliceosome can be made to use:
    // an ASO that blocks a competing site, a variant that strengthens one, or simply a
    // better acceptor further in, and a stretch of intronic sequence becomes an exon. That
    // is what a pseudo-exon inclusion event IS, and it is the only way to ADD peptide to a
    // transcript -- skipping and trimming can only take it away.
    //
    // A candidate here is an acceptor and a donor, both scored by the same model the
    // sashimi arcs come from, in the same intron, the right way round, far enough apart to
    // be an exon and near enough to be a plausible one. Nothing about it says the
    // spliceosome WILL use it: it says the sequence supports it, which is the question an
    // ASO design starts from.
    //
    // The model positions follow its training labels: an acceptor sits on the last
    // intronic base BEFORE the exon, a donor on the first intronic base AFTER it. So the
    // exon a pair would make runs from one past the acceptor to one before the donor.
    //
    // opts.profile       a { acceptor, donor } already in hand (both [[x, score], ...] in
    //                    track coordinates), instead of asking the model again
    // opts.min_site      0.15   the score a site must reach to be worth pairing
    // opts.min_len       30     shorter than this is not a cassette exon
    // opts.max_len       350    longer than this is a retained intron, which is its own edit
    // opts.per_intron    6      candidates kept per intron, best first
    // opts.max_total     60     candidates in all

    return (async () => {
        const t = track || {};
        const o = opts || {};
        const MIN_SITE = (o.min_site != null) ? +o.min_site : 0.15;
        const MIN_LEN = (o.min_len != null) ? +o.min_len : 30;
        const MAX_LEN = (o.max_len != null) ? +o.max_len : 350;
        const PER_INTRON = (o.per_intron != null) ? +o.per_intron : 6;
        const MAX_TOTAL = (o.max_total != null) ? +o.max_total : 60;
        const plus = +(t.strand != null ? t.strand : 1) >= 0;

        const exons = ((t.getExons ? t.getExons() : (t.annotations || [])
            .filter((a) => a && ('' + a.type).toLowerCase() === 'exon')) || [])
            .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }))
            .filter((e) => isFinite(e.lo) && isFinite(e.hi))
            .sort((a, b) => a.lo - b.lo);
        if (exons.length < 2) return [];

        // The gaps between the annotated exons, in coordinate order; transcript order is
        // applied below so the acceptor and donor of a candidate are the right way round
        // on either strand.
        const introns = [];
        for (let i = 0; i + 1 < exons.length; i++) {
            const lo = exons[i].hi + 1, hi = exons[i + 1].lo - 1;
            if (hi - lo + 1 >= MIN_LEN + 4) introns.push({ lo: lo, hi: hi });
        }
        if (!introns.length) return [];

        let prof = o.profile || null;
        if (!prof) {
            const seq = '' + (t.sequence || '');
            if (!seq) return [];
            const xi = (t.xi != null) ? t.xi : 0;
            let orientation = 'plus';
            try { orientation = await exec('baja/bio/splicing/strand-orientation.js', t, seq); }
            catch (e) { orientation = 'plus'; }
            let data = null;
            try {
                data = await exec(window['env']['apiUrl'] + '/py/bio/splice/splicing-profile.py',
                    null, '' + seq, '' + xi, '' + (t.strand != null ? t.strand : 1), 'sites',
                    '', orientation, '', '', '');
            } catch (e) { data = null; }
            if (!data || data.error) return [];
            let acc = [], don = [];
            try { acc = JSON.parse(data.acceptor || '[]'); } catch (e) { acc = []; }
            try { don = JSON.parse(data.donor || '[]'); } catch (e) { don = []; }
            prof = { acceptor: acc, donor: don };
        }
        const acc = (prof.acceptor || []).filter((p) => p && +p[1] >= MIN_SITE);
        const don = (prof.donor || []).filter((p) => p && +p[1] >= MIN_SITE);
        if (!acc.length || !don.length) return [];

        const out = [];
        introns.forEach((iv, k) => {
            const inIv = (p) => +p[0] >= iv.lo && +p[0] <= iv.hi;
            const A = acc.filter(inIv), D = don.filter(inIv);
            if (!A.length || !D.length) return;
            const here = [];
            for (const a of A) {
                for (const d of D) {
                    // Transcript order: on a plus-strand track the acceptor comes first in
                    // ascending x, on a minus-strand track it comes last. Getting this
                    // backwards would propose every exon in reverse and score them as
                    // though they were real.
                    const exLo = plus ? (+a[0] + 1) : (+d[0] + 1);
                    const exHi = plus ? (+d[0] - 1) : (+a[0] - 1);
                    const len = exHi - exLo + 1;
                    if (len < MIN_LEN || len > MAX_LEN) continue;
                    if (exLo < iv.lo || exHi > iv.hi) continue;
                    here.push({
                        xi: exLo, xf: exHi, len: len, intron: k + 1,
                        acceptorScore: +a[1], donorScore: +d[1],
                        // The weaker end is what decides whether a pair is usable: a
                        // perfect donor with no acceptor in front of it splices nothing.
                        score: Math.min(+a[1], +d[1]),
                        frame: len % 3
                    });
                }
            }
            here.sort((p, q) => (q.score - p.score) || (p.len - q.len));
            // A candidate that overlaps a better one in the same intron is the same
            // proposal with one end moved, not a second option worth carrying.
            const kept = [];
            for (const c of here) {
                if (kept.some((x) => Math.min(x.xf, c.xf) - Math.max(x.xi, c.xi) > 0)) continue;
                kept.push(c);
                if (kept.length >= PER_INTRON) break;
            }
            out.push(...kept);
        });
        out.sort((p, q) => q.score - p.score);
        return out.slice(0, MAX_TOTAL);
    })();
}

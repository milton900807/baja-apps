function (haystack, origin, features, opts) {

    // NOTHING IS DRAWN THAT CANNOT BE FOUND IN THE SEQUENCE.
    //   const P = await exec('baja/bio/knowledge/place-by-sequence.js', seq, xi, features, {});
    //   // { placed: [...], unplaceable: [...] }
    //
    // A model asked about a region will return coordinates, and they will look right. They
    // are the one part of its answer that cannot be checked by reading it: chr8:79,611,117
    // and chr8:79,614,117 are equally plausible on the page and three kilobases apart on
    // the track. Drawing them would put invented features on a canvas where everything else
    // was measured, and nothing on screen would say which was which.
    //
    // So a feature earns its place by its SEQUENCE. The model is asked for the stretch it
    // means -- the published exon, the motif, the flank either side of a site -- and that
    // string is searched for in the selection the user actually made. Found once: it is
    // drawn there, at coordinates this code worked out. Not found: it is reported as
    // unplaceable, with its name, so the answer is visibly incomplete rather than quietly
    // wrong. Found several times: it is reported as ambiguous, because "the fourth of the
    // seven matches" is not something the model said.
    //
    // The stated coordinates still travel with a placed feature, as a note. Where they
    // disagree with where the sequence actually is, that disagreement is worth seeing.

    const hay = ('' + (haystack || '')).toUpperCase().replace(/[^ACGTN]/g, '');
    const x0 = Math.round(+origin) || 0;
    const o = opts || {};
    const MIN = (o.min_anchor != null) ? +o.min_anchor : 12;
    // TWO COORDINATE SYSTEMS, AND SUBTRACTING ACROSS THEM IS NONSENSE. A source states a
    // GENOMIC position; the track counts from its own start. opts.genomic_start is the
    // genomic coordinate of `origin`, and without it a stated position is kept as stated
    // and no distance is claimed, rather than reporting a difference of 79 million bases.
    const g0 = (o.genomic_start != null && isFinite(+o.genomic_start)) ? Math.round(+o.genomic_start) : null;
    const toTrack = (stated) => (g0 == null) ? null : (x0 + (stated - g0));

    const rc = (s) => {
        const M = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' };
        let out = '';
        for (let i = s.length - 1; i >= 0; i--) out += (M[s[i]] || 'N');
        return out;
    };
    const allIndexes = (h, n) => {
        const at = [];
        let i = h.indexOf(n);
        while (i >= 0 && at.length < 50) { at.push(i); i = h.indexOf(n, i + 1); }
        return at;
    };

    const placed = [], unplaceable = [];
    for (const f of (features || [])) {
        if (!f) continue;
        const label = ('' + (f.label || f.name || 'unnamed')).trim();
        const anchor = ('' + (f.anchor || f.sequence || '')).toUpperCase().replace(/[^ACGTN]/g, '');

        if (anchor.length < MIN) {
            // A SHORT ANCHOR IS NOT AN ANCHOR. "GTAAGT" occurs every few hundred bases, so
            // a match would say nothing about whether this is the site meant.
            unplaceable.push({ label: label, why: anchor.length
                ? ('its sequence is only ' + anchor.length + ' bases, too short to identify a '
                    + 'position: ' + MIN + ' or more are needed')
                : 'no sequence was given for it, so there is nothing to find', feature: f });
            continue;
        }

        let at = allIndexes(hay, anchor), strand = 1;
        if (!at.length) {
            // The paper may quote the coding strand of a minus-strand gene.
            const back = rc(anchor);
            const atR = allIndexes(hay, back);
            if (atR.length) { at = atR; strand = -1; }
        }
        if (!at.length) {
            unplaceable.push({ label: label,
                why: 'its sequence is not in the selected stretch, on either strand', feature: f });
            continue;
        }
        if (at.length > 1) {
            unplaceable.push({ label: label,
                why: 'its sequence occurs ' + at.length + ' times here, so which one is meant '
                    + 'is not something the source said', feature: f });
            continue;
        }

        const xi = x0 + at[0];
        const xf = xi + anchor.length - 1;
        const said = (f.stated_start != null && isFinite(+f.stated_start)) ? Math.round(+f.stated_start) : null;
        const saidX = (said != null) ? toTrack(said) : null;
        placed.push({
            label: label,
            kind: ('' + (f.kind || 'feature')),
            what: ('' + (f.what || f.description || '')).trim(),
            evidence: f.evidence || null,
            xi: xi, xf: xf, length: anchor.length,
            anchor: anchor, anchor_strand: strand,
            // Kept, not used: where the source said it was, and how far that is from where
            // its own sequence turned out to be.
            stated_start: said,
            stated_off_by: (saidX != null) ? (xi - saidX) : null
        });
    }

    placed.sort((a, b) => a.xi - b.xi);
    return { placed: placed, unplaceable: unplaceable,
        counts: { placed: placed.length, unplaceable: unplaceable.length } };
}

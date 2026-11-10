function (m) {

    // The description window for one linear motif, in the same shape as the SNP
    // window: model-panel.js, cards of uppercase heading over paragraph. Everything
    // shown comes from the backend record; nothing is recomputed here.

    const r = m || {};
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : null;
    const cards = [];

    if (r.score_is_upper_bound) {
        cards.push({
            title: 'This score is an upper bound',
            sections: [{
                heading: 'WHY',
                text: 'This motif does not exist in the wild-type protein. Conservation is a '
                    + 'property of the residue that was there before, and the substitution '
                    + 'inherits it. The score can therefore only be too high, never too low.'
            }]
        });
    }

    cards.push({
        title: r.elm || 'Motif',
        meta: r.site || '',
        sections: [{ heading: 'WHAT IT IS', text: r.blurb || 'No description in the ELM catalogue.' }]
    });

    const where = [];
    where.push({ heading: 'RESIDUES', text: r.start + ' to ' + r.end + ' (' + ((r.end - r.start) + 1) + ' aa)' });
    where.push({ heading: 'SEQUENCE', text: r.peptide || '' });
    if (r.variant) where.push({ heading: 'VARIANT', text: r.variant });
    cards.push({ title: 'Where', sections: where });

    const rank = [];
    if (num(r.score, 4) != null) {
        rank.push({
            heading: 'SCORE', text: num(r.score, 4)
                + (r.rank ? ('  (rank ' + r.rank + (r.n_total ? ' of ' + r.n_total : '') + ')') : '')
                + (r.below_cutoff ? '  — below the display cutoff' : '')
        });
    }
    if (num(r.prior, 8) != null) rank.push({ heading: 'ELM CLASS PRIOR', text: num(r.prior, 8) });
    rank.push({
        heading: 'WHAT THE SCORE IS',
        text: 'An ORDERING of this protein\u2019s candidates against each other, from a model '
            + 'trained on conservation contrast, the class prior, class popularity and position. '
            + 'It is not a probability that the motif is real.'
    });
    cards.push({ title: 'How it ranked', sections: rank });

    const caveats = Array.isArray(r.caveats) ? r.caveats : [];
    if (caveats.length) {
        cards.push({
            title: 'Caveats',
            sections: caveats.map((c, i) => ({ heading: 'NOTE ' + (i + 1), text: c }))
        });
    }

    return exec('baja/lib/model-panel.js', {
        id: 'baja-slim-motif-panel',
        title: r.elm || 'Linear motif',
        subtitle: (r.site ? r.site + ' \u00b7 ' : '') + 'residues ' + r.start + '-' + r.end,
        cards: cards,
        buttons: r.elm ? [{
            label: 'ELM class page',
            onClick: () => { try { window.open('http://elm.eu.org/elms/' + r.elm, '_blank'); } catch (e) { } }
        }] : []
    });
}

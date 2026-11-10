function (m) {
    // The description window for one linear motif, in the same shape as the SNP
    // window: model-panel.js, cards of uppercase heading over paragraph.
    const r = m || {};
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(d) : null;
    const cards = [];
    if (r.score_is_upper_bound) {
        cards.push({ title: 'This score is an upper bound', sections: [{ heading: 'WHY',
            text: 'This motif does not exist in the wild-type protein. Conservation is a property '
                + 'of the residue that was there before, and the substitution inherits it. The '
                + 'score can therefore only be too high, never too low.' }] });
    }
    // WHAT IT IS. The catalogue's own description when there is one. When there is not,
    // a dead sentence used to be the end of the road on a bar the user had just gone to
    // the trouble of clicking, so a Look it up button asks a model instead.
    //
    // A LOOKED-UP DESCRIPTION IS NOT A CATALOGUE DESCRIPTION, and this panel never lets
    // the two look alike: the heading says where the text came from, the card carries the
    // model's own confidence, and a class the model does not recognise is reported as not
    // recognised rather than dressed up. The backend refuses to pass through a blurb
    // written with low confidence for exactly that reason.
    const lookedUp = !r.blurb && !!r.ai_blurb;
    const whatItIs = (r.blurb)
        ? [{ heading: 'WHAT IT IS', text: r.blurb }]
        : (lookedUp
            ? [{ heading: 'WHAT IT IS \u2014 LOOKED UP, NOT FROM ELM', text: r.ai_blurb },
               ...(r.ai_binds ? [{ heading: 'RECOGNISED BY', text: r.ai_binds }] : []),
               { heading: 'WHERE THIS CAME FROM', text: 'Written by a language model asked about '
                   + 'this class, at ' + (r.ai_confidence || 'unknown') + ' confidence. It is not from '
                   + 'the ELM catalogue, nobody has checked it, and it may be wrong. The ELM class '
                   + 'page below is the authority.' }]
            : [{ heading: 'WHAT IT IS', text: r.ai_unknown
                   ? 'No description in the ELM catalogue, and the lookup did not recognise this '
                     + 'class either. That is a real answer rather than a failure: these identifiers '
                     + 'decompose into plausible-sounding parts, and a description reconstructed from '
                     + 'the name would read exactly like a real one and be worth nothing.'
                   : 'No description in the ELM catalogue.' }]);
    cards.push({ title: r.elm || 'Motif', meta: r.site || '', sections: whatItIs });
    const where = [{ heading: 'RESIDUES', text: r.start + ' to ' + r.end + ' (' + ((r.end - r.start) + 1) + ' aa)' },
                   { heading: 'SEQUENCE', text: r.peptide || '' }];
    if (r.variant) where.push({ heading: 'VARIANT', text: r.variant });
    cards.push({ title: 'Where', sections: where });
    const rank = [];
    if (num(r.score, 4) != null) rank.push({ heading: 'SCORE', text: num(r.score, 4)
        + (r.rank ? ('  (rank ' + r.rank + (r.n_total ? ' of ' + r.n_total : '') + ')') : '')
        + (r.below_cutoff ? '  \u2014 below the display cutoff' : '') });
    if (num(r.prior, 8) != null) rank.push({ heading: 'ELM CLASS PRIOR', text: num(r.prior, 8) });
    rank.push({ heading: 'WHAT THE SCORE IS', text: 'An ORDERING of this protein\u2019s candidates '
        + 'against each other, from a model trained on conservation contrast, the class prior, class '
        + 'popularity and position. It is not a probability that the motif is real.' });
    cards.push({ title: 'How it ranked', sections: rank });
    const cav = Array.isArray(r.caveats) ? r.caveats : [];
    if (cav.length) cards.push({ title: 'Caveats',
        sections: cav.map((c, i) => ({ heading: 'NOTE ' + (i + 1), text: c })) });
    return exec('baja/lib/model-panel.js', {
        id: 'baja-slim-motif-panel',
        title: r.elm || 'Linear motif',
        subtitle: (r.site ? r.site + ' \u00b7 ' : '') + 'residues ' + r.start + '-' + r.end,
        cards: cards,
        buttons: [
            // Offered only when there is nothing to show and nothing has been tried yet,
            // so the button is never a way to overwrite the catalogue's own text.
            ...((r.elm && !r.blurb && !r.ai_blurb && !r.ai_unknown) ? [{
                label: 'Look it up',
                onClick: async () => {
                    const cache = (window.__slimBlurbCache = window.__slimBlurbCache || {});
                    let a = cache[r.elm];
                    if (!a) {
                        try {
                            a = await exec('py/bio/protein/motif-lookup.py',
                                '' + r.elm, '' + (r.peptide || ''), '' + (r.site || ''));
                            if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { } }
                        } catch (e) { a = { status: 'ERROR', error: (e && e.message) || ('' + e) }; }
                        if (a && a.status === 'OK') cache[r.elm] = a;
                    }
                    // The answer is written onto the record, so the same bar clicked again
                    // shows it without asking twice.
                    if (a && a.status === 'OK' && a.known && a.blurb) {
                        r.ai_blurb = a.blurb; r.ai_binds = a.binds || ''; r.ai_confidence = a.confidence || '';
                    } else if (a && a.status === 'OK') {
                        r.ai_unknown = true;
                    } else {
                        r.ai_unknown = true;
                        try { console.warn('[motif-lookup]', a && a.error); } catch (e) { }
                    }
                    // model-panel.js removes a panel of the same id before drawing, so
                    // re-opening replaces this one rather than stacking a second.
                    try { await exec('baja/bio/protein/slim-motif-panel.js', r); } catch (e) { }
                }
            }] : []),
            ...(r.elm ? [{ label: 'ELM class page', onClick: () => {
                try { window.open('http://elm.eu.org/elms/' + r.elm, '_blank'); } catch (e) { } } }] : [])
        ]
    });
}

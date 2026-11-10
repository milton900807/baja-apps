function (m) {

    // The description window for one CDD domain or functional site, in the same shape as
    // the motif window: cards of uppercase heading over paragraph, from model-panel.js.
    //   exec('baja/bio/protein/cdd-domain-panel.js', rec)
    //
    // The record is what cdd-domain-layer.js registered for the bar that was pressed:
    // CDD's own row -- name, accession, span, E-value, hit type -- plus __kind.
    //
    // CDD GIVES NO PROSE. The hit table says what matched and how well, and nothing about
    // what the domain does, so WHAT IT IS starts empty and offers a lookup. Exactly as in
    // the motif panel, a looked-up description is never allowed to pass as source data:
    // the heading says where it came from, the card carries the model's confidence, and
    // the backend refuses to hand over a description written at low confidence.

    const r = m || {};
    const isSite = ('' + (r.__kind || '')) === 'site';
    const name = '' + (r.name || (isSite ? 'site' : 'domain'));
    const acc = '' + (r.id || '');
    const cards = [];

    // ---- what it is ---------------------------------------------------------------------
    const lookedUp = !!r.ai_blurb;
    const what = lookedUp
        ? [{ heading: 'WHAT IT IS — LOOKED UP, NOT FROM CDD', text: r.ai_blurb },
           ...(r.ai_role ? [{ heading: 'WHAT IT DOES', text: r.ai_role }] : []),
           { heading: 'WHERE THIS CAME FROM', text: 'Written by a language model asked about this '
               + (isSite ? 'site' : 'domain') + ', at ' + (r.ai_confidence || 'unknown') + ' confidence. '
               + 'It is not from CDD, nobody has checked it, and it may be wrong. The CDD entry '
               + 'below is the authority.' }]
        : [{ heading: 'WHAT IT IS', text: r.ai_unknown
                ? 'CDD carries no description for this one, and the lookup did not recognise it '
                  + 'either. That is a real answer rather than a failure: these names are built from '
                  + 'abbreviations, and a description reconstructed from the parts would read exactly '
                  + 'like a real one and be worth nothing.'
                : 'CDD’s hit table says what matched and how well, not what it does. '
                  + 'Use Look it up for a description, or open the CDD entry.' }];
    cards.push({ title: name, meta: (isSite ? 'functional site' : ('' + (r.type || 'domain'))), sections: what });

    // ---- where ----------------------------------------------------------------------------
    if (isSite) {
        cards.push({ title: 'Where', sections: [
            { heading: 'RESIDUE', text: '' + (r.residue || '(not given)') },
            { heading: 'ALL RESIDUES IN THIS SITE', text: '' + (r.sites || '(not given)') }
        ] });
    } else {
        const a = +r.start, b = +r.end;
        const span = (isFinite(a) && isFinite(b))
            ? (a + ' to ' + b + '  (' + ((b - a) + 1) + ' aa)') : '(not given)';
        cards.push({ title: 'Where', sections: [{ heading: 'RESIDUES', text: span }] });
    }

    // ---- how good the match is -------------------------------------------------------------
    if (!isSite) {
        const ev = ('' + (r.evalue || '')).trim();
        cards.push({ title: 'The match', sections: [
            { heading: 'E-VALUE', text: ev || '(not given)' },
            { heading: 'HIT TYPE', text: '' + (r.type || '(not given)') },
            { heading: 'ACCESSION', text: acc || '(not given)' },
            { heading: 'WHAT AN E-VALUE IS', text: 'The number of hits this good expected by chance '
                + 'in a database this size. Smaller is better; CDD is queried here at 0.01, so '
                + 'everything drawn has passed that bar. It says the ALIGNMENT is unlikely to be '
                + 'chance. It does not say the domain is functional in this protein.' }
        ] });
    }

    if (r.faint) {
        cards.push({ title: 'Drawn faint on purpose', sections: [{ heading: 'WHY',
            text: 'This is a broad superfamily-level match spanning most of the protein. At full '
                + 'strength it drowns the specific domains inside it, so it is drawn very faint and '
                + 'without a label. It is still a real hit and this window still names it.' }] });
    }

    return exec('baja/lib/model-panel.js', {
        id: 'baja-cdd-domain-panel',
        title: name,
        subtitle: (isSite ? 'functional site' : 'conserved domain') + (acc ? ('  ·  ' + acc) : ''),
        cards: cards,
        buttons: [
            // Offered only while there is nothing to show and nothing has been tried, so it
            // can never overwrite a description that came from somewhere better.
            ...((!r.ai_blurb && !r.ai_unknown) ? [{
                label: 'Look it up',
                onClick: async () => {
                    const cache = (window.__cddBlurbCache = window.__cddBlurbCache || {});
                    const key = (acc || name) + '|' + (isSite ? 'site' : 'domain');
                    let a = cache[key];
                    if (!a) {
                        try {
                            a = await exec('py/bio/protein/domain-lookup.py',
                                name, acc, '' + (r.__protein || ''), isSite ? 'site' : 'domain');
                            if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { } }
                        } catch (e) { a = { status: 'ERROR', error: (e && e.message) || ('' + e) }; }
                        if (a && a.status === 'OK') cache[key] = a;
                    }
                    if (a && a.status === 'OK' && a.known && a.blurb) {
                        r.ai_blurb = a.blurb; r.ai_role = a.role || ''; r.ai_confidence = a.confidence || '';
                    } else {
                        r.ai_unknown = true;
                        if (!a || a.status !== 'OK') { try { console.warn('[domain-lookup]', a && a.error); } catch (e) { } }
                    }
                    // model-panel.js removes a panel of the same id before drawing, so
                    // re-opening replaces this one rather than stacking a second.
                    try { await exec('baja/bio/protein/cdd-domain-panel.js', r); } catch (e) { }
                }
            }] : []),
            ...(acc ? [{ label: 'CDD entry', onClick: () => {
                try { window.open('https://www.ncbi.nlm.nih.gov/Structure/cdd/cddsrv.cgi?uid='
                    + encodeURIComponent(acc), '_blank'); } catch (e) { } } }] : [])
        ]
    });
}

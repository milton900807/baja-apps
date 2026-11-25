function (graph, track, region, opts) {

    // ASK WHAT IS KNOWN TO BE IN THIS STRETCH, AND DRAW ONLY WHAT CHECKS OUT.
    //   await exec('baja/bio/knowledge/region-knowledge.js', graph, track, { xi, xf }, {});
    //
    // Four steps, each of which can be looked at on its own:
    //   selection-json.js    what this stretch contains, as data, and as a file
    //   region-knowledge.py  the literature on that region, each claim with the
    //                        publication's own sequence for the feature
    //   place-by-sequence.js that sequence found in the stretch, or the claim dropped
    //   knowledge-layer.js   what survived, drawn where it was found
    //
    // THE SEQUENCE IS NOT SENT TO THE MODEL. The obvious design hands it over and asks it
    // to point inside; that destroys the only check there is, because a model holding the
    // sequence can copy any substring into its answer and every claim then "verifies"
    // wherever it came from. Withheld, the anchor has to come from the literature, and a
    // match means the paper's feature and this stretch are the same DNA.

    return (async () => {
        const t = track;
        const o = opts || {};
        const r = region || {};
        const lo = Math.round(Math.min(+r.xi, +r.xf));
        const hi = Math.round(Math.max(+r.xi, +r.xf));

        const say = async (msg) => {
            try { graph.setMessage(' ' + msg + ' '); } catch (e) { }
            try { const P = await exec('baja/lib/working.js', 'Knowledge layer', ''); P.fail(msg); }
            catch (e) { }
            return null;
        };
        if (!t) return await say('No track selected.');
        if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
            return await say('Select the stretch of sequence to look up first.');
        }
        // The model is asked about a locus, and the answer is placed by sequence. A whole
        // chromosome's worth of selection is neither a locus nor a thing to search.
        const MAX = (o.max_span != null) ? +o.max_span : 300000;
        if (hi - lo > MAX) {
            return await say('That stretch is ' + Math.round((hi - lo) / 1000) + ' kb. Select up to '
                + Math.round(MAX / 1000) + ' kb: this asks about a locus, not a chromosome.');
        }

        let W = null;
        try {
            W = await exec('baja/lib/working.js', 'What is known about this stretch',
                (t.name || 'track') + ' · ' + (hi - lo + 1) + ' nt');
        } catch (e) { W = null; }
        const step = (m2) => { try { if (W) W.step(m2); } catch (e) { } };

        try {
            step('Writing down what is in the selection');
            const J = await exec('baja/bio/knowledge/selection-json.js', t, { xi: lo, xf: hi }, {});
            if (!J || J.error) {
                try { if (W) W.done(); } catch (e) { }
                return await say(J && J.error ? J.error : 'The selection could not be read.');
            }

            // The file, which is the half of this that is useful even when the lookup finds
            // nothing: the same selection can be asked about again, or elsewhere.
            const forModel = Object.assign({}, J);
            delete forModel.sequence;              // deliberately withheld; see above
            delete forModel.json;

            step('Reading the literature on ' + (J.gene || 'this region'));
            let K = null;
            try {
                K = await exec('py/bio/knowledge/region-knowledge.py',
                    JSON.stringify(forModel), '' + (o.max_features || 12));
            } catch (e) {
                try { if (W) W.done(); } catch (e2) { }
                return await say('The literature lookup failed: ' + ((e && e.message) || e));
            }
            if (!K || K.error) {
                try { if (W) W.done(); } catch (e) { }
                return await say('The literature lookup did not run: '
                    + ((K && K.error) || 'no answer came back'));
            }
            const claims = K.features || [];
            if (!claims.length) {
                try { if (W) W.done(); } catch (e) { }
                // NOTHING PUBLISHED IS AN ANSWER, and it is the answer for most of the
                // genome. It is reported as what it is rather than as a failure.
                try {
                    graph.setResultMessage(' Knowledge · ' + (J.gene || 'this stretch') + ' · '
                        + 'nothing published was found in those ' + (hi - lo + 1) + ' nt'
                        + (K.notes ? (' · ' + K.notes.slice(0, 160)) : '') + ' ');
                } catch (e) { }
                return { placed: [], unplaceable: [], notes: K.notes || '', json: J };
            }

            step('Checking ' + claims.length + ' claim' + (claims.length === 1 ? '' : 's')
                + ' against the sequence');
            const P = await exec('baja/bio/knowledge/place-by-sequence.js',
                J.sequence || '', lo, claims,
                // So a stated GENOMIC position can be compared with where the sequence
                // actually is, which is a track coordinate.
                { genomic_start: (J.genomic && J.genomic.start != null) ? J.genomic.start : null });

            if (!P.placed.length) {
                try { if (W) W.done(); } catch (e) { }
                // EVERY CLAIM FAILING ITS CHECK IS A RESULT TOO, and a pointed one: it
                // usually means the answer was about a different part of the gene, or a
                // different assembly, rather than that the region is empty.
                return await say('None of the ' + claims.length + ' published claim'
                    + (claims.length === 1 ? '' : 's') + ' could be found in the selected sequence, '
                    + 'so nothing was drawn. ' + (P.unplaceable[0]
                        ? ('For instance, ' + P.unplaceable[0].label + ': ' + P.unplaceable[0].why + '.')
                        : ''));
            }

            step('Drawing ' + P.placed.length + ' feature' + (P.placed.length === 1 ? '' : 's'));
            await exec('baja/bio/knowledge/knowledge-layer.js', graph, t, P.placed, {
                label: (J.gene || 'literature'),
                unplaceable: P.unplaceable.length,
                searched: K.searched
            });
            try { if (W) W.done(); } catch (e) { }
            try {
                graph.setResultMessage(' Knowledge · ' + (J.gene || 'stretch') + ' · '
                    + P.placed.length + ' of ' + claims.length + ' published claim'
                    + (claims.length === 1 ? '' : 's') + ' found in the sequence and drawn'
                    + (P.unplaceable.length ? ('; ' + P.unplaceable.length + ' could not be placed') : '')
                    + (K.searched === false ? ' · uncited: web search was unavailable' : '')
                    + ' ');
            } catch (e) { }
            return { placed: P.placed, unplaceable: P.unplaceable, notes: K.notes || '',
                json: J, searched: K.searched, queries: K.queries || [] };
        } catch (e) {
            try { if (W) W.fail('The knowledge layer failed: ' + ((e && e.message) || e)); } catch (e2) { }
            throw e;
        }
    })();
}

function (graph, track, snp) {

    // MOTIF IMPACT OF ONE MISSENSE VARIANT.
    //
    // Reads the substitution from the track's OWN reading frame (track.orf.cdsi), not from
    // UniProt and not from snp.annotation: cdsi is what the motif layer translates, so the
    // residue number here is the residue number the scan will check against. A number taken
    // from anywhere else can be off by one against this track, which is how the same allele
    // ends up called both R578C and R579C.
    //
    // Refuses, loudly, for anything that is not a single missense change. A scan that draws
    // nothing must never be mistaken for a scan that found nothing.

    // The codon table lives in baja/bio/protein/variants-to-residues.js now, with the
    // one reading of the frame that uses it.

    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

    return (async () => {
        try {
            // ONE READING OF THE FRAME, shared with the report over all the variants:
            // baja/bio/protein/variants-to-residues.js. Two readings is how the same
            // track answered this question from a click and reported no coding variants
            // at all from the command bar.
            const V = await exec('baja/bio/protein/variants-to-residues.js', track, [snp]);
            if (!V || !V.ok) {
                say('This track has no reading frame, so there is no codon to change.');
                return null;
            }
            const one = V.list[0];
            if (!one) {
                const left = (V.skipped || [])[0];
                say('No residue changes here: ' + ((left && left.why) || 'this variant is '
                    + 'not a single-base substitution inside a codon') + '.');
                return null;
            }
            const codon = one.codon, mutCodon = one.mutCodon;
            const wt = one.wt, mu = one.mu, pos = one.pos;

            const spec = wt + pos + mu;
            say('Motif impact: ' + codon + '>' + mutCodon + '  (' + spec + ') \u2026');

            // One scan, variant supplied. minScore 0 so nothing is withheld by the cutoff:
            // this view is about three motifs, not about a readable gene-wide track.
            await exec('baja/bio/protein/slim-motif-layer.js', graph, null, [track],
                { redo: true, variants: [spec], minScore: 0 });

            const reg = (graph.__slimIntervals || []).filter((e) => e && e.track === track);
            const pick = (kind) => reg.filter((e) => e.kind === kind).map((e) => e.rec);
            const gained = pick('gained'), lost = pick('lost');

            const fmt = (h) => (h.elm || '?') + '  ' + h.start + '-' + h.end +
                '  score ' + ((typeof h.score === 'number') ? h.score.toFixed(4) : '?') +
                '  ' + (h.peptide || '');

            const cards = [];
            cards.push({
                title: spec,
                meta: codon + '>' + mutCodon + ' at codon ' + pos,
                sections: [{
                    heading: 'NUMBERING',
                    text: 'Residue ' + pos + ' in THIS track\u2019s reading frame. A UniProt '
                        + 'entry for the same protein may number it differently.'
                }]
            });
            cards.push({
                title: 'Motifs created  (' + gained.length + ')',
                sections: gained.length
                    ? gained.map((h) => ({ heading: h.elm || 'MOTIF', text: fmt(h) +
                        (h.blurb ? ('\n\n' + h.blurb) : '') }))
                    : [{ heading: 'NONE', text: 'The substitution creates no new ELM match.' }]
            });
            cards.push({
                title: 'Motifs destroyed  (' + lost.length + ')',
                sections: lost.length
                    ? lost.map((h) => ({ heading: h.elm || 'MOTIF', text: fmt(h) +
                        (h.blurb ? ('\n\n' + h.blurb) : '') }))
                    : [{ heading: 'NONE', text: 'The substitution destroys no existing ELM match.' }]
            });
            if (gained.length) {
                cards.push({
                    title: 'Read the created motifs carefully',
                    sections: [{
                        heading: 'THE SCORE IS AN UPPER BOUND',
                        text: 'A created motif did not exist before, so its conservation features '
                            + 'belong to the residue it replaced and are inherited. Its score can '
                            + 'only be too high. A motif is also just a regex match: a protein of '
                            + 'this length carries hundreds, and most are not functional.'
                    }]
                });
            }

            return exec('baja/lib/model-panel.js', {
                id: 'baja-motif-impact',
                title: 'Motif impact \u00b7 ' + spec,
                subtitle: (track.name || 'track') + ' \u00b7 ' + ref + '>' + alt +
                    ' \u00b7 ' + gained.length + ' created, ' + lost.length + ' destroyed',
                cards: cards
            });
        } catch (e) {
            say('Motif impact failed: ' + (e && e.message ? e.message : e));
            return null;
        }
    })();
}

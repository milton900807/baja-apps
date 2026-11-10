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

    const AA = {
        TTT:'F',TTC:'F',TTA:'L',TTG:'L',CTT:'L',CTC:'L',CTA:'L',CTG:'L',
        ATT:'I',ATC:'I',ATA:'I',ATG:'M',GTT:'V',GTC:'V',GTA:'V',GTG:'V',
        TCT:'S',TCC:'S',TCA:'S',TCG:'S',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
        ACT:'T',ACC:'T',ACA:'T',ACG:'T',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
        TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',
        AAT:'N',AAC:'N',AAA:'K',AAG:'K',GAT:'D',GAC:'D',GAA:'E',GAG:'E',
        TGT:'C',TGC:'C',TGA:'*',TGG:'W',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
        AGT:'S',AGC:'S',AGA:'R',AGG:'R',GGT:'G',GGC:'G',GGA:'G',GGG:'G'
    };

    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

    return (async () => {
        try {
            const alt = ('' + (snp.alternate || snp.alt || '')).toUpperCase();
            const ref = ('' + (snp.reference || snp.ref || '')).toUpperCase();
            if (alt.length !== 1 || ref.length !== 1) {
                say('Motif impact needs a single-nucleotide substitution; this one is ' +
                    (ref || '?') + '>' + (alt || '?') + '.');
                return null;
            }

            let cdsi = null;
            try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            if (!cdsi || !cdsi.length) {
                try { if (track && track.generateORF) track.generateORF(); } catch (e) { }
                try { cdsi = track && track.orf && track.orf.cdsi; } catch (e) { cdsi = null; }
            }
            if (!cdsi || !cdsi.length) {
                say('This track has no reading frame, so there is no codon to change.');
                return null;
            }

            const xi = Math.round(snp.xi);
            const hit = cdsi.find((e) => e && Math.round(+e.index) === xi);
            if (!hit) {
                say('This variant is not inside a codon of this track\u2019s reading frame ' +
                    '(intronic, UTR, or outside the ORF), so it changes no residue.');
                return null;
            }

            // The codon as the track has it, and the residue it codes for. ci is which of the
            // three bases this variant sits on.
            const ciIdx = +hit.ci;
            const codon = ('' + (hit.codon || '')).toUpperCase();
            if (codon.length !== 3 || !(ciIdx >= 0 && ciIdx <= 2)) {
                say('Could not read this variant\u2019s codon from the track.');
                return null;
            }
            const wt = AA[codon];
            const mutCodon = codon.slice(0, ciIdx) + alt + codon.slice(ciIdx + 1);
            const mu = AA[mutCodon];
            if (!wt || !mu) {
                say('Could not translate ' + codon + ' \u2192 ' + mutCodon + '.');
                return null;
            }
            const pos = (+hit.codon_index || 0) + 1;

            if (wt === mu) {
                say(codon + '>' + mutCodon + ' is synonymous (' + wt + pos +
                    ' unchanged), so no motif can change.');
                return null;
            }
            if (mu === '*') {
                say(wt + pos + ' \u2192 stop. A truncation is not a motif substitution; ' +
                    'scan the shortened protein instead.');
                return null;
            }
            if (wt === '*') {
                say('This changes a stop codon, not a residue.');
                return null;
            }

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

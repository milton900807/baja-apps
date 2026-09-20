function () {

    // EVERY SEQUENCE A COMPOUND CARRIES, under one set of names.
    //
    //   const S = await exec('baja/bio/compound-sequences.js');
    //   const s = S.of(oligo, track);
    //   s.sequence  s.target  s.synthesis  s.sense  s.antisense  s.duplex  s.chemistry
    //   S.COLUMNS   the column headings, in the order S.row() writes them
    //   S.row(s)    those values, for a CSV or a sheet
    //
    // A download of "the sequences" used to write one column, filled from whichever of half
    // a dozen fields the compound happened to have. That is the ordering strand and nothing
    // else, and it leaves out the two things the sheet is usually FOR: what the compound
    // binds, and what you would send to be made.
    //
    //   target       the site on the transcript -- what it hybridises to. Stored on a
    //                designed compound; read off the track underneath one that was placed
    //                by hand, which is the only place it exists for those.
    //   synthesis    the strand you order, in the alphabet it was designed in.
    //   sense /      both strands of a duplex. An siRNA is two oligos and a sheet with one
    //   antisense    column cannot say which of them it is holding.
    //   duplex       the annotated duplex, where the designer wrote one.
    //   chemistry    HELM: the modifications and the backbone, which is what actually makes
    //                the order unambiguous.
    //
    // Empty strings rather than nulls: these go into CSVs and spreadsheets, and a compound
    // that has no duplex should leave a blank cell, not the word "null".
    return (async () => {
        const clean = (v) => ('' + (v == null ? '' : v)).trim();
        const first = (...vals) => { for (const v of vals) { const s = clean(v); if (s) return s; } return ''; };

        // What the compound binds. A designed one was told; a hand-placed one has to be read
        // off the track it sits on, at its own coordinates.
        const targetOf = (o, track) => {
            const stored = first(o.targetSequence, o.targetSite, o.target_site, o.target_site_input_alphabet, o.targetSiteRna);
            if (stored) return stored;
            try {
                const a = +o.xi, b = +o.xf;
                if (!isFinite(a) || !isFinite(b)) return '';
                const lo = Math.floor(Math.min(a, b)), hi = Math.ceil(Math.max(a, b));
                if (hi <= lo) return '';
                if (track && typeof track.getSequenceRange === 'function') {
                    const s = clean(track.getSequenceRange(lo, hi));
                    if (s) return s;
                }
                if (track && typeof track.sequence === 'string' && track.sequence.length >= hi) {
                    return clean(track.sequence.slice(lo, hi));
                }
            } catch (e) { }
            return '';
        };

        const of = (o, track) => {
            if (!o) return { sequence: '', target: '', synthesis: '', sense: '', antisense: '', duplex: '', chemistry: '' };
            const antisense = first(o.antisense, o.guide);
            const sense = first(o.sense, o.passenger);
            // The ordering strand: what the designer wrote for synthesis, else the antisense
            // (which is the compound for a gapmer or a guide), else whatever it calls its
            // sequence.
            const synthesis = first(o.synthesisSequence, antisense, o.sequence, sense);
            return {
                sequence: first(o.sequence, synthesis, sense, antisense, o.seq),
                target: targetOf(o, track),
                synthesis: synthesis,
                sense: sense,
                antisense: antisense,
                duplex: first(o.synthesisSequenceDuplex, o.duplex),
                chemistry: first(o.structure, o.helm),
            };
        };

        const COLUMNS = ['sequence', 'target_sequence', 'synthesis_sequence', 'sense_strand',
            'antisense_strand', 'synthesis_duplex', 'chemistry_helm'];
        const row = (s) => [s.sequence, s.target, s.synthesis, s.sense, s.antisense, s.duplex, s.chemistry];

        // For FASTA, where one compound becomes several records: the ones it actually has,
        // each saying which strand it is. A record with no sequence is not written at all.
        const records = (o, track, name) => {
            const s = of(o, track);
            const nm = ('' + (name || o.name || o.id || 'compound')).replace(/\s+/g, '_');
            const out = [];
            const add = (suffix, seq) => { if (seq) out.push({ name: suffix ? (nm + '|' + suffix) : nm, sequence: seq }); };
            add('', s.synthesis || s.sequence);
            if (s.target && s.target !== s.synthesis) add('target', s.target);
            if (s.sense && s.sense !== s.synthesis) add('sense', s.sense);
            if (s.antisense && s.antisense !== s.synthesis) add('antisense', s.antisense);
            return out;
        };

        return { of, row, records, COLUMNS };
    })();
}

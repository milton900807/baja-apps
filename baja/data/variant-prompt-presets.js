function () {
    // Instruction sets for the variant resolver (baja/data/variant-from-prompt.js), kept in
    // the repo so a prompt that turns out to work is version-controlled like any other code.
    //
    // These steer how a description is READ. They cannot change what the tool will accept:
    // py/bio/variant-from-prompt.py checks the answer base by base against the track's own
    // coding sequence afterwards, so an instruction that asks for a residue the sequence does
    // not have is refused rather than obeyed.
    //
    // TO ADD ONE: run the design with the instructions you want, and when the result is right,
    // use "Save…" in the form. It stores the preset in this browser and hands you the entry to
    // paste here — pasting it and committing is what makes it everyone's.
    return {
        presets: [
            {
                name: 'Histone numbering (omits Met1)',
                text: 'This is histone numbering, which counts the mature protein and omits the '
                    + 'initiator methionine. Convert to HGVS numbering (Met = 1) and say so.'
            },
            {
                name: 'Strict HGVS numbering',
                text: 'Take the position exactly as written, in HGVS numbering with the initiator '
                    + 'methionine as residue 1. Do not apply any off-by-one convention.'
            },
            {
                name: 'Legacy numbering from the literature',
                text: 'The position may come from an older paper using the mature protein or a '
                    + 'different isoform. Reconcile it against the supplied protein sequence and '
                    + 'explain which convention the description used.'
            },
            {
                name: 'Prefer the canonical transcript',
                text: 'Resolve against the canonical / MANE Select transcript for this gene. If '
                    + 'the description only makes sense on a different isoform, say which.'
            },
            {
                name: 'Be strict: refuse if uncertain',
                text: 'If the description cannot be resolved unambiguously against the supplied '
                    + 'protein sequence, return level "unknown" with the reason rather than '
                    + 'choosing the closest match.'
            }
        ]
    };
}

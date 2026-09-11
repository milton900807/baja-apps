function () {

    // REPLICON ARCHITECTURES, and the rules that say when one will not work.
    //
    // A self-amplifying RNA is an alphavirus genome with the structural proteins taken out
    // and a payload put in their place. The replicase it still encodes copies the whole
    // molecule and transcribes the payload from an internal subgenomic promoter, so one
    // delivered molecule becomes many payload transcripts. That is the entire appeal: dose
    // falls by one to two orders of magnitude.
    //
    // It also brings constraints that do not exist for a conventional mRNA, and most of them
    // are the kind that are invisible until the construct does not work:
    //
    //   THE PROMOTER IS INSIDE THE PAYLOAD. The subgenomic promoter is not a block of
    //   sequence sitting tidily upstream. It spans the transcription start, running from
    //   roughly -19 to +5, so its last bases ARE the first bases of the payload transcript.
    //   Recode those while codon-optimising and the promoter is damaged. This module computes
    //   that window and hands it to the optimiser as a frozen range.
    //
    //   MODIFIED NUCLEOSIDES DO NOT WORK HERE. N1-methylpseudouridine is the single most
    //   effective thing you can do to a conventional mRNA, and it is close to unusable in a
    //   replicon: the replicase has to read the RNA as a template and copy it, and the copies
    //   it makes are unmodified anyway. Choosing both is not a trade-off to be tuned, it is a
    //   contradiction, and this module reports it as one.
    //
    //   AMPLIFICATION IS SENSED. Replication makes double-stranded intermediates. MDA5 and
    //   PKR read them, and the interferon that follows shuts down translation. It cannot be
    //   designed away with sequence, only managed.
    //
    // SEQUENCES ARE SLOTS, NOT PRESETS. This file does NOT ship replicase or conserved-element
    // sequences. Those are thousands of bases of virus-derived sequence that a group either
    // has validated in-house or takes from a specific published record, and a plausible-looking
    // approximation of one would be the most dangerous thing in this editor. Every such part
    // is an empty slot with a description of what belongs in it and where to get it, and the
    // architecture is validated around whatever is pasted in.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');

        // ---- architectures --------------------------------------------------------------------
        //
        // Each is a list of slots in 5ʹ->3ʹ order. `provide: 'user'` means the designer must
        // paste it; `provide: 'built'` means this editor generates it.
        const ARCHITECTURES = [
            {
                id: 'conventional',
                name: 'Conventional mRNA',
                molecules: 1,
                blurb: 'Cap, 5ʹ UTR, coding sequence, 3ʹ UTR, poly(A). One molecule makes one '
                    + 'transcript’s worth of protein, for as long as it survives. Everything in the '
                    + 'half-life tab applies directly, and modified nucleosides are available.',
                slots: [
                    { id: 'utr5', name: '5ʹ UTR', provide: 'built', required: false },
                    { id: 'cds', name: 'Coding sequence', provide: 'built', required: true },
                    { id: 'utr3', name: '3ʹ UTR', provide: 'built', required: false },
                    { id: 'polya', name: 'Poly(A) tail', provide: 'built', required: true }
                ]
            },
            {
                id: 'sam-cis',
                name: 'Self-amplifying (cis, one molecule)',
                molecules: 1,
                blurb: 'The replicase and the payload ride in the same RNA. One molecule, roughly '
                    + '9 to 12 kb. Simplest to formulate and to dose; the whole construct has to be '
                    + 'transcribed intact, which is the hard part of making it.',
                slots: [
                    { id: 'cse5', name: '5ʹ conserved sequence element', provide: 'user', required: true,
                        about: 'The 5ʹ end of the alphavirus genome, including the conserved element that the '
                            + 'replicase needs to initiate minus-strand synthesis. It overlaps the start of the '
                            + 'replicase ORF, so it is taken from the backbone rather than designed. '
                            + 'Typically around 50-60 nt.' },
                    { id: 'replicase', name: 'Replicase ORF (nsP1-nsP4)', provide: 'user', required: true,
                        about: 'The non-structural polyprotein. About 7.5 kb. Take it from your validated '
                            + 'backbone (VEEV TC-83, SFV4 and Sindbis are the usual ones) — it is virus-derived '
                            + 'coding sequence and must not be recoded by this editor.' },
                    { id: 'sgp', name: 'Subgenomic promoter (26S)', provide: 'user', required: true,
                        about: 'The internal promoter that drives the payload. It spans the transcription start, '
                            + 'so its 3ʹ end overlaps the first bases of the payload transcript. Usually quoted as '
                            + 'the -19 to +5 core, often with more upstream sequence included.' },
                    { id: 'cds', name: 'Payload coding sequence', provide: 'built', required: true },
                    { id: 'cse3', name: '3ʹ conserved sequence element', provide: 'user', required: true,
                        about: 'The 19-nt conserved element the replicase needs at the 3ʹ end. It must sit '
                            + 'immediately before the poly(A) — nothing may be inserted between them.' },
                    { id: 'polya', name: 'Poly(A) tail', provide: 'built', required: true }
                ]
            },
            {
                id: 'tam-trans',
                name: 'Trans-amplifying (two molecules)',
                molecules: 2,
                blurb: 'The replicase is split onto its own RNA and the payload rides a short '
                    + '"transreplicon" carrying only the conserved elements and the subgenomic '
                    + 'promoter. The payload molecule drops to one or two kilobases, which is far '
                    + 'easier to make well, and the replicase RNA can be modified independently. '
                    + 'The cost is a second component and a molar ratio to get right.',
                molecules_detail: [
                    { id: 'rna1', name: 'RNA 1 — replicase', slots: ['utr5', 'replicase', 'utr3', 'polya'] },
                    { id: 'rna2', name: 'RNA 2 — transreplicon (payload)', slots: ['cse5', 'sgp', 'cds', 'cse3', 'polya'] }
                ],
                slots: [
                    { id: 'utr5', name: '5ʹ UTR (replicase RNA)', provide: 'built', required: false },
                    { id: 'replicase', name: 'Replicase ORF (nsP1-nsP4)', provide: 'user', required: true,
                        about: 'As above, but on its own molecule, so it can carry a conventional cap and even '
                            + 'a modified nucleoside — it is translated, not replicated.' },
                    { id: 'utr3', name: '3ʹ UTR (replicase RNA)', provide: 'built', required: false },
                    { id: 'cse5', name: '5ʹ conserved sequence element (transreplicon)', provide: 'user', required: true,
                        about: 'On the transreplicon this is the whole 5ʹ end: there is no replicase ORF for it to '
                            + 'overlap, so it is shorter and cleaner than in the cis design.' },
                    { id: 'sgp', name: 'Subgenomic promoter (transreplicon)', provide: 'user', required: true,
                        about: 'As in the cis design, and with the same overlap into the payload.' },
                    { id: 'cds', name: 'Payload coding sequence', provide: 'built', required: true },
                    { id: 'cse3', name: '3ʹ conserved sequence element (transreplicon)', provide: 'user', required: true, about: 'As in the cis design.' },
                    { id: 'polya', name: 'Poly(A) tail', provide: 'built', required: true }
                ]
            }
        ];
        const byId = (id) => ARCHITECTURES.filter((a) => a.id === id)[0] || ARCHITECTURES[0];
        const isReplicon = (id) => id === 'sam-cis' || id === 'tam-trans';

        // Named backbones. These carry NO sequence. They record what a designer has chosen so
        // the report says which lineage the parts came from, and they set the expected sizes
        // the validator checks against.
        const BACKBONES = [
            { id: 'none', name: 'Not specified', replicaseNt: null, note: '' },
            { id: 'veev-tc83', name: 'VEEV TC-83', replicaseNt: 7500, note: 'The commonest choice in current self-amplifying vaccine work.' },
            { id: 'sfv4', name: 'Semliki Forest virus 4', replicaseNt: 7400, note: 'Long-established laboratory replicon.' },
            { id: 'sinv', name: 'Sindbis virus', replicaseNt: 7500, note: 'The original alphavirus replicon system.' },
            { id: 'other', name: 'Other / in-house', replicaseNt: null, note: 'Sizes are not checked against an expected value.' }
        ];

        // ---- the promoter overlap ----------------------------------------------------------------
        //
        // The bases of the payload that are also promoter. Default 5, which is the +1 to +5 of
        // the -19/+5 core description. Some constructs are reported to need more of the
        // downstream sequence, so it is adjustable and the report always states what was used.
        const DEFAULT_SGP_OVERLAP = 5;

        // Ranges of the PAYLOAD coding sequence that the optimiser must not touch, in CDS
        // coordinates. For a conventional construct there are none.
        const frozenRanges = (spec) => {
            const s = spec || {};
            if (!isReplicon(s.architecture)) return [];
            const n = (typeof s.sgpOverlap === 'number') ? s.sgpOverlap : DEFAULT_SGP_OVERLAP;
            if (n <= 0) return [];
            return [{ from: 0, to: n, why: 'the subgenomic promoter runs ' + n + ' bases into the payload transcript' }];
        };

        // ---- compatibility -------------------------------------------------------------------------
        //
        // The rules that decide whether a set of choices can work together. Severity is
        // 'stop' (this combination is contradictory), 'warn' (a real cost, decide knowingly)
        // or 'note'.
        const check = (spec) => {
            const s = spec || {};
            const out = [];
            const add = (severity, what, detail) => out.push({ severity: severity, what: what, detail: detail });
            const arch = byId(s.architecture);
            const rep = isReplicon(s.architecture);
            const cdsLen = GC.cleanNt(s.cds || '').length;
            const replLen = GC.cleanNt(s.replicase || '').length;

            if (rep && s.nucleoside && s.nucleoside !== 'unmodified') {
                if (s.architecture === 'sam-cis') {
                    add('stop', 'A modified nucleoside cannot be used with a cis self-amplifying RNA',
                        'The replicase has to read this molecule as a template and copy it, and '
                        + s.nucleoside + ' interferes with that. The copies it makes would be unmodified in any '
                        + 'case, so the modification protects only the first round. Choose unmodified uridine, '
                        + 'or move to a conventional mRNA.');
                } else {
                    add('warn', 'A modified nucleoside is only usable on the replicase RNA',
                        'In a trans-amplifying design the replicase RNA is translated and never copied, so it '
                        + 'can carry ' + s.nucleoside + '. The transreplicon IS copied and must be unmodified. '
                        + 'Make sure the two components are being made under different conditions.');
                }
            }

            if (rep && s.capType === 'cap0') {
                add('warn', 'Cap 0 on a replicon', 'IFIT1 binds Cap 0 and blocks its translation, and a replicon '
                    + 'already has an interferon problem from its double-stranded intermediates. Use Cap 1.');
            }

            if (rep) {
                add('note', 'Amplification is sensed and that cannot be designed away',
                    'Copying makes double-stranded intermediates; MDA5 and PKR read them and the interferon '
                    + 'response that follows shuts down translation. It is managed with dose, formulation and '
                    + 'sometimes an encoded innate antagonist — not with codon choice.');
            }

            if (s.architecture === 'sam-cis') {
                const total = replLen + cdsLen + GC.cleanNt(s.cse5 || '').length + GC.cleanNt(s.sgp || '').length
                    + GC.cleanNt(s.cse3 || '').length + (s.polyA || 0);
                if (cdsLen > 3000) {
                    add('warn', 'Payload of ' + cdsLen + ' nt is large for a cis replicon',
                        'Replication efficiency falls as the insert grows, and above roughly 3 kb it falls '
                        + 'noticeably. A trans-amplifying design keeps the replicating molecule short.');
                }
                if (total > 11000) {
                    add('warn', 'Total construct ' + total.toLocaleString() + ' nt',
                        'Full-length yield and integrity from an in-vitro transcription run drop off above about '
                        + '11 kb, and truncated species compete for delivery.');
                }
                if (replLen && cdsLen) {
                    add('note', 'Molar payload fraction',
                        'The payload is ' + ((cdsLen / Math.max(1, total)) * 100).toFixed(1) + '% of the molecule. '
                        + 'The rest is the machinery that copies it.');
                }
            }

            if (s.architecture === 'tam-trans') {
                add('note', 'Two components, one ratio',
                    'The replicase RNA and the transreplicon are dosed together and the molar ratio matters. '
                    + 'It is an experimental parameter, not something this editor can compute.');
                if (cdsLen && replLen) {
                    add('note', 'Component sizes',
                        'Replicase RNA about ' + replLen.toLocaleString() + ' nt; transreplicon about '
                        + (cdsLen + GC.cleanNt(s.cse5 || '').length + GC.cleanNt(s.sgp || '').length
                            + GC.cleanNt(s.cse3 || '').length + (s.polyA || 0)).toLocaleString() + ' nt. '
                        + 'The short one is the one being copied, which is the point of the split.');
                }
            }

            // Backbone size sanity: a replicase far off the expected length is usually a
            // paste that picked up too much or too little.
            const bb = BACKBONES.filter((b) => b.id === s.backbone)[0];
            if (rep && bb && bb.replicaseNt && replLen) {
                const ratio = replLen / bb.replicaseNt;
                if (ratio < 0.85 || ratio > 1.15) {
                    add('warn', 'Replicase length does not match ' + bb.name,
                        'Pasted ' + replLen.toLocaleString() + ' nt against about ' + bb.replicaseNt.toLocaleString()
                        + ' expected. Check the paste picked up the whole ORF and nothing extra.');
                }
                if (replLen % 3 !== 0) {
                    add('warn', 'Replicase length is not a multiple of three',
                        replLen + ' nt. If this is meant to be the complete ORF it should be in frame.');
                }
            }

            if (rep) {
                if (!s.polyA || s.polyA < 40) {
                    add('stop', 'A replicon needs a poly(A) tail of at least about 40 nt',
                        'The replicase initiates minus-strand synthesis at the 3ʹ end and needs the tail to do it. '
                        + (s.polyA ? ('This design has ' + s.polyA + ' nt.') : 'This design has none.'));
                }
                if (GC.cleanNt(s.utr3 || '').length && s.architecture === 'sam-cis') {
                    add('stop', 'Nothing may sit between the 3ʹ conserved element and the poly(A)',
                        'A 3ʹ UTR has been supplied as well. In a replicon the conserved element must be the last '
                        + 'thing before the tail; anything inserted there stops minus-strand synthesis. Move any '
                        + 'regulatory element you want — a miRNA site, for instance — upstream of the conserved '
                        + 'element, or accept that the construct will not replicate.');
                }
                if (s.optimisePreset && ['quiet', 'stability'].indexOf(s.optimisePreset) >= 0) {
                    add('note', 'CpG depletion buys less in a replicon',
                        'The replicase ORF in the same molecule is virus-derived and CpG-rich, and it is frozen. '
                        + 'Depleting only the payload changes a small fraction of the construct. The '
                        + '"Replicon payload" preset weights codon usage instead, which is what the subgenomic '
                        + 'transcript actually benefits from.');
                }
            }

            // Missing slots.
            for (const slot of arch.slots) {
                if (slot.provide !== 'user' || !slot.required) continue;
                if (!GC.cleanNt(s[slot.id] || '').length) {
                    add('stop', 'Missing: ' + slot.name,
                        (slot.about || '') + ' This editor does not supply it — paste it from your backbone.');
                }
            }

            // The payload should start at a start codon.
            if (cdsLen && !GC.cleanNt(s.cds).startsWith('ATG')) {
                add('warn', 'The payload does not begin with AUG', 'The subgenomic transcript starts near here; the first start codon it presents is what gets translated.');
            }

            return out;
        };

        // ---- assembly --------------------------------------------------------------------------------
        //
        // Returns one or two molecules, each with its segment map, so the editor can color
        // the sequence by part and point at positions.
        const assemble = (spec) => {
            const s = spec || {};
            const arch = byId(s.architecture);
            const polyA = 'A'.repeat(Math.max(0, s.polyA || 0));
            const nt = (v) => GC.cleanNt(v || '');

            const build = (name, pieces) => {
                const segments = [];
                let seq = '';
                for (const p of pieces) {
                    const v = nt(p.seq);
                    if (!v.length) continue;
                    segments.push({ id: p.id, name: p.name, from: seq.length, to: seq.length + v.length, kind: p.kind || p.id });
                    seq += v;
                }
                return { id: name.id, name: name.name, sequence: seq, rna: GC.toRna(seq), segments: segments, length: seq.length };
            };

            if (s.architecture === 'sam-cis') {
                return {
                    architecture: arch.id,
                    molecules: [build({ id: 'sam', name: 'Self-amplifying RNA' }, [
                        { id: 'cse5', name: '5ʹ conserved element', seq: s.cse5 },
                        { id: 'replicase', name: 'Replicase nsP1-4', seq: s.replicase },
                        { id: 'sgp', name: 'Subgenomic promoter', seq: s.sgp },
                        { id: 'cds', name: 'Payload', seq: s.cds },
                        { id: 'cse3', name: '3ʹ conserved element', seq: s.cse3 },
                        { id: 'polya', name: 'Poly(A)', seq: polyA }
                    ])]
                };
            }
            if (s.architecture === 'tam-trans') {
                return {
                    architecture: arch.id,
                    molecules: [
                        build({ id: 'rna1', name: 'RNA 1 — replicase' }, [
                            { id: 'utr5', name: '5ʹ UTR', seq: s.utr5 },
                            { id: 'kozak', name: 'Kozak', seq: s.kozak },
                            { id: 'replicase', name: 'Replicase nsP1-4', seq: s.replicase },
                            { id: 'utr3', name: '3ʹ UTR', seq: s.utr3 },
                            { id: 'polya', name: 'Poly(A)', seq: polyA }
                        ]),
                        build({ id: 'rna2', name: 'RNA 2 — transreplicon' }, [
                            { id: 'cse5', name: '5ʹ conserved element', seq: s.cse5 },
                            { id: 'sgp', name: 'Subgenomic promoter', seq: s.sgp },
                            { id: 'cds', name: 'Payload', seq: s.cds },
                            { id: 'cse3', name: '3ʹ conserved element', seq: s.cse3 },
                            { id: 'polya', name: 'Poly(A)', seq: polyA }
                        ])
                    ]
                };
            }
            return {
                architecture: 'conventional',
                molecules: [build({ id: 'mrna', name: 'mRNA' }, [
                    { id: 'utr5', name: '5ʹ UTR', seq: s.utr5 },
                    { id: 'kozak', name: 'Kozak', seq: s.kozak },
                    { id: 'cds', name: 'Coding sequence', seq: s.cds },
                    { id: 'stops', name: 'Stop codons', seq: s.stops },
                    { id: 'utr3', name: '3ʹ UTR', seq: s.utr3 },
                    { id: 'polya', name: 'Poly(A)', seq: polyA }
                ])]
            };
        };

        return {
            ARCHITECTURES: ARCHITECTURES, BACKBONES: BACKBONES,
            DEFAULT_SGP_OVERLAP: DEFAULT_SGP_OVERLAP,
            byId: byId, isReplicon: isReplicon,
            frozenRanges: frozenRanges, check: check, assemble: assemble
        };
    })();
}

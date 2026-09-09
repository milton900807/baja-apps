function () {

    // THE PARTS BIN. Caps, nucleosides, untranslated regions, tails.
    //
    // Same rule as everywhere else in this application: a part that is a reference sequence
    // carries `verify: true` and the record it came from, and the editor holds the export
    // until a designer has confirmed it. A 3ʹ UTR one base wrong still looks like a 3ʹ UTR.
    //
    // The caps and the nucleosides carry no sequence at all — they are chemistry and process
    // choices, not bases — but they change what the construct does more than most of the
    // sequence choices do, so they are first-class parts here rather than a footnote.

    return (async () => {

        // ---- 5ʹ cap ------------------------------------------------------------------------------
        const CAPS = [
            {
                id: 'cap1', name: 'Cap 1 (2ʹ-O-methylated)', recommended: true,
                blurb: 'The 2ʹ-O-methyl on the first transcribed nucleotide is what marks an RNA as '
                    + 'self. Without it IFIT1 binds the cap and blocks translation outright. Cap 1 is '
                    + 'the default for anything going into a person, whether it is made co-transcriptionally '
                    + 'with a trinucleotide analogue or enzymatically after transcription.'
            },
            {
                id: 'cap0', name: 'Cap 0', recommended: false,
                blurb: 'Capped but not 2ʹ-O-methylated. Cheaper and adequate in cells that do not '
                    + 'express much IFIT1, and a poor choice for anything else.'
            },
            {
                id: 'arca', name: 'ARCA (anti-reverse cap analogue)', recommended: false,
                blurb: 'A co-transcriptional cap analogue that can only go in the right way round, '
                    + 'so it avoids the reverse-capped fraction of an ordinary analogue. It gives Cap 0, '
                    + 'and it caps only a fraction of the transcripts.'
            },
            {
                id: 'uncapped', name: 'Uncapped', recommended: false,
                blurb: 'Only for an IRES-driven construct or an in-vitro control. An uncapped '
                    + 'transcript with a 5ʹ triphosphate is what RIG-I exists to detect.'
            }
        ];

        // ---- nucleoside chemistry ------------------------------------------------------------------
        const NUCLEOSIDES = [
            {
                id: 'm1psi', name: 'N1-methylpseudouridine (m1Ψ)', recommended: true, repliconSafe: false,
                blurb: 'Every uridine replaced. Reduces TLR7/8 and RIG-I activation sharply and raises '
                    + 'protein output several-fold, mostly by not triggering the response that would have '
                    + 'shut translation down. The default for a conventional therapeutic mRNA, and the '
                    + 'reason uridine content is worth minimising: fewer uridines is less modified base to buy.'
            },
            {
                id: 'psi', name: 'Pseudouridine (Ψ)', recommended: false, repliconSafe: false,
                blurb: 'The predecessor to m1Ψ. Same idea, generally less effective.'
            },
            {
                id: '5moU', name: '5-methoxyuridine', recommended: false, repliconSafe: false,
                blurb: 'An alternative uridine substitution. Less widely used and less well characterised.'
            },
            {
                id: 'unmodified', name: 'Unmodified uridine', recommended: false, repliconSafe: true,
                blurb: 'Required for anything that has to be copied by a replicase, and used deliberately '
                    + 'where the innate response IS the adjuvant. Expect interferon, and expect it to cost '
                    + 'you translation.'
            }
        ];

        // ---- 5ʹ untranslated regions ------------------------------------------------------------------
        const UTR5 = [
            { id: 'none', name: 'None / paste your own', rna: '', verify: false, blurb: 'Leave empty and paste what your process uses.' },
            {
                id: 'hbb', name: 'Human beta-globin (HBB)',
                rna: 'ACAUUUGCUUCUGACACAACUGUGUUCACUAGCAACCUCAAACAGACACC', verify: true,
                source: 'Human HBB mRNA, NM_000518 — confirm against the record',
                blurb: 'Short, unstructured, no upstream AUG. The classic high-expression leader.'
            },
            {
                id: 'minimal', name: 'Minimal synthetic (A/G-rich)',
                rna: 'GGGAAAUAAGAGAGAAAAGAAGAGUAAGAAG', verify: false,
                blurb: 'No structure, no upstream AUG, nothing to unwind. Designed rather than borrowed, '
                    + 'so there is no record to check it against.'
            },
            {
                id: 'ultra-short', name: 'Ultra-short synthetic',
                rna: 'GGGAAAUAAGAGAGAAAAGAAG', verify: false,
                blurb: 'When length itself is the constraint. Below about 20 nt the 43S has little room '
                    + 'to load, which the initiation model will tell you about.'
            }
        ];

        // ---- 3ʹ untranslated regions ---------------------------------------------------------------------
        const UTR3 = [
            { id: 'none', name: 'None / paste your own', rna: '', verify: false, blurb: 'Leave empty and paste what your process uses.' },
            {
                id: 'hba', name: 'Human alpha-globin (HBA1)',
                rna: 'GCUGGAGCCUCGGUGGCCAUGCUUCUUGCCCCUUGGGCCUCCCCCCAGCCCCUCCUCCCCUUCCUGCACCCGUACCCCCGUGGUCUUUGAAUAAAGUCUGAGUGGGCGGC',
                verify: true, source: 'Human HBA1 mRNA, NM_000558 — confirm against the record',
                blurb: 'The stabilising UTR: its C-rich tract binds the alpha-complex (PCBP1/2), which '
                    + 'protects the poly(A) tail from deadenylation. This is why alpha-globin UTRs are in '
                    + 'so many mRNA therapeutics.'
            },
            {
                id: 'hbb', name: 'Human beta-globin (HBB)',
                rna: 'GCUCGCUUUCUUGCUGUCCAAUUUCUAUUAAAGGUUCCUUUGUUCCCUAAGUCCAACUACUAAACUGGGGGAUAUUAUGAAGGGCCUUGAGCAUCUGGAUUCUGCCUAAUAAAAAACAUUUAUUUUCAUUGC',
                verify: true, source: 'Human HBB mRNA, NM_000518 — confirm against the record',
                blurb: 'The other globin UTR, often used as a tandem repeat. It contains its own poly(A) '
                    + 'signal near the 3ʹ end, which is expected in a natural UTR and is why the checks do '
                    + 'not flag AAUAAA here.'
            },
            {
                id: 'hbb-tandem', name: 'Human beta-globin, tandem repeat',
                rna: '', verify: true, source: 'Two copies of the HBB 3ʹ UTR in series; build it from the HBB entry above once verified',
                blurb: 'Two copies in series is a long-standing trick for additional stability. Left empty '
                    + 'rather than pre-built, so the copy you duplicate is one you have checked.'
            }
        ];

        // ---- poly(A) --------------------------------------------------------------------------------------
        const POLYA_STYLES = [
            {
                id: 'plain', name: 'Continuous',
                blurb: 'One uninterrupted run. Simplest, and the run is unstable during plasmid propagation '
                    + 'in E. coli — a template that has lost half its tail gives transcripts that have too.'
            },
            {
                id: 'segmented', name: 'Segmented, with a linker',
                blurb: 'Two runs separated by a short spacer, typically about 30 then 70 bases. The spacer '
                    + 'breaks up the repeat so the template survives propagation, and PABP does not appear '
                    + 'to mind. Worth it for any plasmid-derived template.'
            }
        ];
        const SEGMENT_LINKER = 'GCATATGACTAA';        // a short non-repetitive spacer

        const buildPolyA = (style, length, linker) => {
            const n = Math.max(0, length | 0);
            if (style !== 'segmented' || n < 60) return 'A'.repeat(n);
            const lk = (linker || SEGMENT_LINKER).toUpperCase().replace(/[^ACGT]/g, '');
            const first = 30;
            const second = Math.max(0, n - first);
            return 'A'.repeat(first) + lk + 'A'.repeat(second);
        };

        const OTHER = {
            kozak: { name: 'Kozak consensus', dna: 'GCCACC', blurb: 'Immediately before the start codon. GCCACC-AUG-G is the strong context; position -3 and +4 carry nearly all of the effect.' },
            stops: { name: 'Tandem stop codons', dna: 'TGATAA', blurb: 'Two stops in frame. Cheap insurance against readthrough.' },
            t7: { name: 'T7 promoter', dna: 'TAATACGACTCACTATAG', blurb: 'For the DNA template. The final G is the transcription start, which is why so many transcripts begin with G.' }
        };

        const byId = (list, id) => list.filter((x) => x.id === id)[0] || list[0];

        return {
            CAPS: CAPS, NUCLEOSIDES: NUCLEOSIDES, UTR5: UTR5, UTR3: UTR3,
            POLYA_STYLES: POLYA_STYLES, SEGMENT_LINKER: SEGMENT_LINKER,
            buildPolyA: buildPolyA, OTHER: OTHER, byId: byId
        };
    })();
}

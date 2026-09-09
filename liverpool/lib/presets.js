function () {

    // THE PARTS BIN: linkers, leaders, untranslated regions and tails.
    //
    // PROVENANCE IS PART OF THE PART. Every entry carries where it came from, and any entry
    // whose exact residues or bases must be confirmed against a primary record before
    // anything is ordered carries `verify: true` and the record to check it against. The
    // editor shows those in red and will not export a construct containing one until the
    // designer has ticked to say they checked it.
    //
    // That flag is not defensive paperwork. A signal peptide transcribed one residue wrong
    // still looks exactly like a signal peptide on screen, and the first time anyone finds
    // out is after the synthesis run.

    // ---- linkers ---------------------------------------------------------------------------
    //
    // What sits between two epitopes decides three things: whether the proteasome releases
    // the epitope with the right C-terminus, whether a NEW epitope is created across the
    // seam, and whether the string folds into something that behaves like a protein instead
    // of a string of beads.
    const LINKERS = [
        {
            id: 'aay', name: 'AAY', aa: 'AAY', use: 'class I',
            blurb: 'Alanine-alanine-tyrosine. The tyrosine gives the proteasome a favourable '
                + 'residue to cut after, so the epitope in front of it is released with its own '
                + 'C-terminus intact. The usual default for a class I string.'
        },
        {
            id: 'gpgpg', name: 'GPGPG', aa: 'GPGPG', use: 'class II',
            blurb: 'Glycine-proline repeat. Prolines break secondary structure and are poor '
                + 'cleavage sites, which is the point: it discourages junctional epitopes from '
                + 'forming across the seam. Standard between class II epitopes.'
        },
        {
            id: 'gs', name: 'GGSGGS', aa: 'GGSGGS', use: 'flexible',
            blurb: 'A plain flexible spacer. Neutral, well behaved, and creates no cleavage '
                + 'preference of its own -- which also means it does nothing to help release.'
        },
        {
            id: 'rr', name: 'RR', aa: 'RR', use: 'class I',
            blurb: 'A dibasic pair. Cathepsins and the proteasome both cut readily after basic '
                + 'residues. Short, but the arginines are themselves good C-terminal anchors for '
                + 'the A3 supertype, so check the junction scan carefully with this one.'
        },
        {
            id: 'k', name: 'K', aa: 'K', use: 'class I',
            blurb: 'A single lysine. The most compact option; a construct that would otherwise '
                + 'be too long for the run. Same caveat as RR.'
        },
        {
            id: 'none', name: 'none', aa: '', use: 'any',
            blurb: 'Epitopes butted straight together. Only sensible when the epitopes were '
                + 'chosen as a contiguous stretch of the source protein in the first place. '
                + 'Every seam is a junctional-epitope risk.'
        }
    ];

    // ---- leaders and trafficking ------------------------------------------------------------
    const LEADERS = [
        {
            id: 'none', name: 'No leader', aa: '', verify: false,
            blurb: 'The cassette is translated in the cytosol and its peptides enter the class I '
                + 'pathway by the ordinary route. Nothing routes them to class II.'
        },
        {
            id: 'sec-hla', name: 'HLA class I signal peptide (sec)', aa: 'MAVMAPRTLLLLLSGALALTQTWA',
            verify: true, source: 'UniProt P04439 (HLA class I histocompatibility antigen, A alpha chain), signal peptide, residues 1-24',
            blurb: 'The HLA-A leader. Sends the translated cassette into the secretory pathway, '
                + 'which routes peptides through the endosomal/lysosomal compartment and into '
                + 'class II presentation as well as class I. Paired with MITD below in the '
                + 'design that is now conventional for an mRNA neoantigen vaccine.'
        },
        {
            id: 'igk', name: 'Ig kappa leader', aa: 'METDTLLLWVLLLWVPGSTGD',
            verify: true, source: 'Murine Ig kappa light chain V-region signal peptide, as used in many expression vectors',
            blurb: 'A strong generic secretion leader. Use when the goal is secretion rather '
                + 'than a particular presentation route.'
        }
    ];

    const TRAILERS = [
        {
            id: 'none', name: 'No trailer', aa: '', verify: false,
            blurb: 'The cassette ends at the last epitope.'
        },
        {
            id: 'mitd', name: 'MHC trafficking domain (MITD)',
            aa: 'IVGIVAGLAVLAVVVIGAVVATVMCRRKSSGGKGGSYSQAACSDSAQGSDVSLTACKV',
            verify: true, source: 'UniProt P04439 (HLA-A alpha chain), transmembrane and cytoplasmic domains, approximately residues 309-365. CONFIRM THE EXACT RESIDUES against the record before ordering.',
            blurb: 'The transmembrane and cytoplasmic tail of an MHC class I molecule. Appended '
                + 'after the epitope string it routes the product through the endosomal '
                + 'compartment, which improves presentation on class II as well as class I. '
                + 'This is the trailer half of the sec/MITD pair.'
        }
    ];

    // ---- untranslated regions and tail ------------------------------------------------------
    //
    // Given as RNA because that is how they are read and quoted; the construct module works
    // in DNA and converts.
    const UTR5 = [
        {
            id: 'none', name: 'None (paste your own)', rna: '', verify: false,
            blurb: 'Leave empty and paste the 5ʹ UTR your process uses.'
        },
        {
            id: 'hbb', name: 'Human beta-globin (HBB) 5ʹ UTR',
            rna: 'ACAUUUGCUUCUGACACAACUGUGUUCACUAGCAACCUCAAACAGACACC',
            verify: true, source: 'Human HBB mRNA, NM_000518 -- confirm against the record',
            blurb: 'Short, unstructured, no upstream AUG. The classic high-expression 5ʹ UTR '
                + 'and a reasonable default.'
        },
        {
            id: 'minimal', name: 'Minimal synthetic', rna: 'GGGAAAUAAGAGAGAAAAGAAGAGUAAGAAG', verify: false,
            blurb: 'A short A/G-rich synthetic leader with no structure and no upstream AUG. '
                + 'Useful when the only requirement is that the ribosome reaches the start codon.'
        }
    ];

    const UTR3 = [
        {
            id: 'none', name: 'None (paste your own)', rna: '', verify: false,
            blurb: 'Leave empty and paste the 3ʹ UTR your process uses.'
        },
        {
            id: 'hbb', name: 'Human beta-globin (HBB) 3ʹ UTR',
            rna: 'GCUCGCUUUCUUGCUGUCCAAUUUCUAUUAAAGGUUCCUUUGUUCCCUAAGUCCAACUACUAAACUGGGGGAUAUUAUGAAGGGCCUUGAGCAUCUGGAUUCUGCCUAAUAAAAAACAUUUAUUUUCAUUGC',
            verify: true, source: 'Human HBB mRNA, NM_000518 -- confirm against the record',
            blurb: 'Stabilises the transcript. Note it CONTAINS its own poly(A) signal near the '
                + '3ʹ end, which is why the construct QC does not flag AAUAAA inside a 3ʹ UTR '
                + 'the way it does inside the coding sequence.'
        }
    ];

    const OTHER = {
        kozak: { name: 'Kozak consensus', dna: 'GCCACC', blurb: 'Placed immediately before the start codon. GCCACC-AUG-G is the strong consensus.' },
        t7: { name: 'T7 promoter', dna: 'TAATACGACTCACTATAG', blurb: 'For the DNA template. The final G is the transcription start.' },
        stops: { name: 'Tandem stop codons', dna: 'TGATAA', blurb: 'Two stops in frame. Cheap insurance against readthrough.' }
    };

    const byId = (list, id) => list.filter((x) => x.id === id)[0] || list[0];

    return {
        LINKERS: LINKERS, LEADERS: LEADERS, TRAILERS: TRAILERS,
        UTR5: UTR5, UTR3: UTR3, OTHER: OTHER, byId: byId
    };
}

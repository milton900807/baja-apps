function () {
    // MIRNA SEEDS, AND THE SITE CLASSES THEY MAKE.
    //   const M = await exec('baja/bio/mirna/mirna-seeds.js');
    //
    // A miRNA site is the reverse complement of the miRNA's seed, nucleotides 2-8 of the
    // mature strand, read on the mRNA. `site7` below is that 7-mer, stored as DNA.
    //
    // WHERE THESE CAME FROM. The same eight are already in tottenham/lib/elements.js, where
    // they carry a warning that they were written from the mature sequences and must be
    // confirmed against miRBase. They were re-derived here from the mature sequences
    // independently and all eight agree with that table, which makes a transcription slip
    // unlikely but is still not the same as having read miRBase: nothing in this session
    // fetched it. `verify: true` stays on every row for that reason, and the scanner says so
    // in its result rather than leaving the caveat in a source comment nobody opens.
    //
    // This is a SHORT, CURATED list, not a catalogue. It is the de-targeting set: the
    // miRNAs whose sites are deliberately added or deliberately removed. Finding none of
    // them says nothing about the other ~2,600 human miRNAs.
    const MIRNA = [
        { id: 'mir-122-5p', name: 'miR-122-5p', site7: 'ACACTCC', verify: true, tissue: 'hepatocytes', use: 'the standard liver de-targeting site' },
        { id: 'mir-142-3p', name: 'miR-142-3p', site7: 'ACACTAC', verify: true, tissue: 'haematopoietic cells', use: 'silences a construct in immune cells' },
        { id: 'mir-1-3p', name: 'miR-1-3p', site7: 'ACATTCC', verify: true, tissue: 'cardiac and skeletal muscle', use: 'muscle de-targeting' },
        { id: 'mir-133a-3p', name: 'miR-133a-3p', site7: 'GGACCAA', verify: true, tissue: 'muscle', use: 'muscle de-targeting' },
        { id: 'mir-126-3p', name: 'miR-126-3p', site7: 'CGGTACG', verify: true, tissue: 'endothelium', use: 'endothelial de-targeting' },
        { id: 'let-7a-5p', name: 'let-7a-5p', site7: 'CTACCTC', verify: true, tissue: 'broad, high in differentiated tissue', use: 'rarely added on purpose; worth knowing about' },
        { id: 'mir-21-5p', name: 'miR-21-5p', site7: 'ATAAGCT', verify: true, tissue: 'broad, raised in many tumours', use: 'worth removing from a construct meant to work in tumour tissue' },
        { id: 'mir-155-5p', name: 'miR-155-5p', site7: 'AGCATTA', verify: true, tissue: 'activated immune cells', use: 'immune de-targeting' }
    ];

    // THE FOUR CANONICAL CLASSES, in the order they repress. Given site7 = revcomp(m2..m8):
    //
    //   6mer      revcomp(m2..m7)              = site7 without its first base
    //   7mer-A1   6mer, then an A opposite m1  = site7.slice(1) + A
    //   7mer-m8   revcomp(m2..m8)              = site7
    //   8mer-1a   7mer-m8, then that same A    = site7 + A
    //
    // The A is a property of the TARGET, not of the miRNA: nothing pairs with m1, and an A
    // there is read by the Argonaute pocket. That is why 7mer-A1 and 7mer-m8 are the same
    // length and not the same site.
    const CLASSES = {
        '8mer-1a': { rank: 4, label: '8mer-1a', note: 'the strongest canonical site' },
        '7mer-m8': { rank: 3, label: '7mer-m8', note: 'seed match through position 8' },
        '7mer-A1': { rank: 2, label: '7mer-A1', note: 'seed match plus the A opposite position 1' },
        '6mer': { rank: 1, label: '6mer', note: 'marginal on its own' }
    };

    const sixmerOf = (site7) => ('' + site7).toUpperCase().slice(1);

    // Every canonical site of one miRNA in one mRNA sequence, 5'->3'.
    //
    // OVERLAPPING MATCHES ARE ALL REPORTED. A plain global regex resumes after each match and
    // would miss a second site starting one base in, which is exactly what happens in the
    // AU-rich stretches where these sites cluster.
    const sitesIn = (mrna, mi) => {
        const s = ('' + (mrna || '')).toUpperCase().replace(/U/g, 'T');
        const site7 = ('' + mi.site7).toUpperCase();
        const six = sixmerOf(site7);
        const out = [];
        if (!s || six.length !== 6) return out;
        for (let i = 0; (i = s.indexOf(six, i)) >= 0; i++) {
            const m8 = (i > 0 && s[i - 1] === site7[0]);
            const a1 = (s[i + 6] === 'A');
            const cls = (m8 && a1) ? '8mer-1a' : (m8 ? '7mer-m8' : (a1 ? '7mer-A1' : '6mer'));
            const start = m8 ? (i - 1) : i;
            const end = i + 6 + (a1 ? 1 : 0);
            out.push({
                id: mi.id, name: mi.name, tissue: mi.tissue, use: mi.use, verify: !!mi.verify,
                cls: cls, rank: CLASSES[cls].rank, start: start, end: end,
                match: s.slice(start, end)
            });
        }
        return out;
    };

    const scan = (mrna, which) => {
        const set = (which && which.length)
            ? MIRNA.filter((m) => which.indexOf(m.id) >= 0)
            : MIRNA;
        const out = [];
        for (const mi of set) for (const h of sitesIn(mrna, mi)) out.push(h);
        return out.sort((a, b) => (a.start - b.start) || (b.rank - a.rank));
    };

    return { MIRNA: MIRNA, CLASSES: CLASSES, sixmerOf: sixmerOf, sitesIn: sitesIn, scan: scan };
}

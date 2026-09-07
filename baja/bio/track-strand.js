function () {
    // Which strand does a MINUS-strand track's string hold?
    //
    // Two loaders disagree. The server's pre-mRNA payload is the plus-strand genomic slice
    // stored as is ('plus'); the older Ensembl path stored the transcript sequence reversed,
    // i.e. the coding strand laid out by ascending x ('coding'). Anything that has to read the
    // transcript off a minus-strand track -- the splicing models, a coding-sequence lookup --
    // needs to know which reverse to apply.
    //
    // Decided from the annotated exon boundaries: at each intron the plus-strand text reads AC
    // just before the exon's low edge (the donor GT, read backwards) and CT just after its high
    // edge (the acceptor AG), while the coding-strand text reads their complements TG and GA.
    // Majority wins; with no exons it is 'plus', which is what the current loader produces.
    // Plus-strand tracks are always 'plus'.
    const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' };

    // WHICH STRAND IS THE GENE ON? NOT NECESSARILY track.strand.
    //
    // On a pre-mRNA track -- which is what the current loader produces -- this.strand is the
    // strand of the GENOMIC SLICE, always '+', not the strand of the gene sitting in it.
    // track.js's generateORF() says so in its own comment and works around it by reading the
    // strand off the annotations; everything here used to trust track.strand and so treated
    // every minus-strand gene as a plus-strand one.
    //
    // What that cost: H3C2 is histone H3.1 on the minus strand of chr6. Its coding sequence
    // read as the plus-strand text translates to MDGAKVCVLKEPYQVG..., which is not a protein,
    // and K28M -- the change that defines H3.1 K27M glioma -- was refused because residue 28
    // read A. Complemented, the same CDS reads MARTKQTARKSTGGKAPRKQLATKAARKSAP..., histone H3,
    // with K where K belongs. The gene was never mismapped; it was read backwards.
    //
    // The annotations carry the real answer, as GENCODE wrote it. track.strand is the
    // fallback, for a track that has no annotations to ask.
    const geneStrand = (track) => {
        try {
            for (const a of ((track && track.annotations) || [])) {
                const v = a && a.strand;
                if (v === '-' || v === -1 || v === '-1') return -1;
                if (v === '+' || v === 1 || v === '1') return 1;
            }
        } catch (e) { }
        return (+((track && track.strand) || 0) < 0) ? -1 : 1;
    };

    const orientation = (track) => {
        try {
            if (!track || geneStrand(track) >= 0) return 'plus';
            const seq = track.sequence;
            if (typeof seq !== 'string' || !Number.isFinite(+track.xi) || !track.getExons) return 'plus';
            const at = (x) => { const i = Math.floor(x) - Math.floor(+track.xi); return (i >= 0 && i < seq.length) ? seq[i].toUpperCase() : ''; };
            let plusHits = 0, codingHits = 0;
            for (const e of (track.getExons() || [])) {
                const lo = Math.min(+e.xi, +e.xf), hi = Math.max(+e.xi, +e.xf);
                const donor = at(lo - 2) + at(lo - 1);
                const acceptor = at(hi + 1) + at(hi + 2);
                if (donor === 'AC') plusHits++; else if (donor === 'TG') codingHits++;
                if (acceptor === 'CT') plusHits++; else if (acceptor === 'GA') codingHits++;
            }
            return codingHits > plusHits ? 'coding' : 'plus';
        } catch (e) { return 'plus'; }
    };
    // The CODING-strand base at track x, whatever the track's storage orientation.
    const codingBaseAt = (track, x, orient) => {
        const i = Math.floor(x) - Math.floor(+track.xi);
        const seq = track.sequence || '';
        if (i < 0 || i >= seq.length) return '';
        const b = seq[i].toUpperCase();
        if (geneStrand(track) < 0 && (orient || orientation(track)) === 'plus') return COMP[b] || 'N';
        return b;
    };
    const complement = (s) => ('' + s).toUpperCase().split('').map((b) => COMP[b] || 'N').join('');
    const reverseComplement = (s) => complement(s).split('').reverse().join('');
    return { orientation, codingBaseAt, complement, reverseComplement, geneStrand };
}

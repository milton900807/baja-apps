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
    const orientation = (track) => {
        try {
            if (!track || !(+track.strand < 0)) return 'plus';
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
        if (+track.strand < 0 && (orient || orientation(track)) === 'plus') return COMP[b] || 'N';
        return b;
    };
    const complement = (s) => ('' + s).toUpperCase().split('').map((b) => COMP[b] || 'N').join('');
    const reverseComplement = (s) => complement(s).split('').reverse().join('');
    return { orientation, codingBaseAt, complement, reverseComplement };
}

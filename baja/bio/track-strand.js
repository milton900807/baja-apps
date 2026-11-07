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

    // THE VARIANT'S ALLELES IN THE FRAME THE TRACK IS STORED IN.
    //
    // A variant record carries its change twice over: `reference`/`alternate` are the PLUS
    // strand's bases and `reference0`/`alternate0` the CODING strand's. Which pair a track
    // wants depends on what its string actually holds, and for a minus-strand gene the two
    // are complements of one another. (They are complemented WITHOUT being reversed, which
    // is SnpIndel's convention and what lets a multi-base substitution be written straight
    // across its span.)
    //
    // Reading the wrong pair is almost invisible. The flanks come from the track and are
    // right; only the variant base is the complement of what it should be. An oligo built
    // on that matches NEITHER allele at the single position the whole design rests on, and
    // nothing about the sequence looks wrong. That is worth being careful about once:
    // these sequences get synthesised.
    //
    // Choosing by which field happens to be filled in is what fails, because a variant that
    // arrived by genomic coordinate -- from a VCF, from ClinVar, from a coordinate somebody
    // typed -- has only the plus-strand pair, and a coding-orientation track would then take
    // it raw. So the TRACK decides. Both readings of the reference allele are compared with
    // what the track actually reads at the variant, and the reading that agrees is the one
    // the alternate is taken from as well.
    //
    // Returns { ref, alt, source, checked }. checked is false when the track could not
    // settle it, and the caller should say so rather than quietly design.
    const allelesInFrame = (v, track, orient, readAt) => {
        const up = (s) => ('' + (s == null ? '' : s)).toUpperCase();
        const usable = (s) => /^[ACGT]+$/.test(s);
        const minus = geneStrand(track) < 0;
        const wantsPlus = !minus || (orient || orientation(track)) === 'plus';

        const plus = { ref: up(v && v.reference), alt: up(v && v.alternate) };
        const coding = { ref: up(v && v.reference0), alt: up(v && v.alternate0) };
        const flip = (p, name) => ({ ref: complement(p.ref), alt: complement(p.alt), source: name });

        // Every reading of the same change, best guess first: the pair written for this
        // frame, then the other pair complemented into it, then the remaining two.
        const order = wantsPlus
            ? [[plus, 'plus'], [coding, 'coding complemented'], [coding, 'coding'], [plus, 'plus complemented']]
            : [[coding, 'coding'], [plus, 'plus complemented'], [plus, 'plus'], [coding, 'coding complemented']];
        const tries = [];
        for (const [pair, name] of order) {
            if (!usable(pair.alt)) continue;
            const c = / complemented$/.test(name) ? flip(pair, name) : { ref: pair.ref, alt: pair.alt, source: name };
            if (!tries.some((x) => x.ref === c.ref && x.alt === c.alt)) tries.push(c);
        }
        if (!tries.length) return { ref: '', alt: '', source: 'none', checked: false };

        // What the track itself reads across the span the allele covers.
        let have = '';
        if (typeof readAt === 'function') {
            for (let k = 0; k < tries[0].alt.length; k++) have += up(readAt(k));
        }
        if (usable(have)) {
            for (const c of tries) {
                if (usable(c.ref) && c.ref.length === have.length && c.ref === have) {
                    return { ref: c.ref, alt: c.alt, source: c.source, checked: true };
                }
            }
        }
        // Nothing agreed with the track: hand back the frame's own reading and say it is
        // unverified, so the caller can warn instead of pretending.
        return { ref: tries[0].ref, alt: tries[0].alt, source: tries[0].source, checked: false, track_reads: have };
    };

    return { orientation, codingBaseAt, complement, reverseComplement, geneStrand, allelesInFrame };
}

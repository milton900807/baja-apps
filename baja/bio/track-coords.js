function () {

    // TRACK COORDINATES <-> GENOMIC COORDINATES.
    //
    //   const C = await exec('baja/bio/track-coords.js');
    //   C.genomicOf(track, x)           where a track position sits in the genome
    //   C.localOf(track, chr, genomic)  where a genomic position sits on a track
    //   C.sameChromosome(a, b)          can these two tracks overlap at all
    //
    // A track's own x runs 0..width from ITS origin, and a variant's `xi` is in that space,
    // not in the genome's. Two tracks of the same gene therefore disagree about the number
    // for the same base whenever their origins differ -- which is the usual case: a gene
    // track begins at the gene, its mRNA track begins at 0, and a second sample may have
    // been loaded over a different span. Anything that compares positions ACROSS tracks has
    // to go through the genome to do it, and anything that does that arithmetic itself will
    // eventually get it wrong in its own way, which is why it lives here.
    //
    // The forward direction is the track's own variantWorldX -- the mapping the VCF loader
    // uses to place a record -- so exon structure and strand are respected. The inverse is
    // the same linear interpolation over the same exon spans, and for a track with no exon
    // map (a plain window onto the genome) the two differ by the track's origin.
    return (async () => {
        const num = (v) => { const n = +v; return isFinite(n) ? n : null; };
        const bare = (v) => ('' + (v == null ? '' : v)).trim().toLowerCase().replace(/^chr/, '');

        const exonsOf = (t) => {
            try { return (t && t.getExons) ? (t.getExons() || []) : []; } catch (e) { return []; }
        };

        // Track x -> genomic. Null when the track cannot say.
        const genomicOf = (t, localX) => {
            const x = num(localX);
            if (!t || x == null) return null;
            for (const a of exonsOf(t)) {
                const gi = num(a.gxi), gf = num(a.gxf), xi = num(a.xi), xf = num(a.xf);
                if (gi == null || gf == null || xi == null || xf == null) continue;
                const lo = Math.min(xi, xf), hi = Math.max(xi, xf);
                if (x < lo || x > hi) continue;
                const span = (xf - xi);
                if (!span) return gi;
                return gi + ((x - xi) / span) * (gf - gi);
            }
            const base = num(t.xi);
            return (base == null) ? null : base + x;
        };

        // Genomic -> track x. Null when that position is not on this track.
        const localOf = (t, chr, genomicPos) => {
            const g = num(genomicPos);
            if (!t || g == null) return null;
            let v = null;
            try { v = t.variantWorldX ? t.variantWorldX(chr == null ? t.chr : chr, g) : null; } catch (e) { v = null; }
            if (v != null && isFinite(+v)) return +v;
            const a = bare(chr), b = bare(t.chr);
            if (a && b && a !== b) return null;
            const base = num(t.xi);
            if (base == null) return null;
            const x = g - base;
            // A track with an exon map has already had its say above; falling through to the
            // origin for one would put an intronic or off-transcript position on it anyway.
            if (exonsOf(t).length) return null;
            const end = num(t.xf);
            if (x < 0) return null;
            if (end != null && g > end) return null;
            return x;
        };

        // A blank chromosome on either side is not a mismatch: some tracks never learn one.
        const sameChromosome = (a, b) => {
            const x = bare(a && a.chr), y = bare(b && b.chr);
            return !(x && y && x !== y);
        };

        return { genomicOf, localOf, sameChromosome };
    })();
}

function (track, seq) {

    // WHICH STRAND DOES A MINUS-STRAND TRACK'S STRING HOLD?
    //   const o = await exec('baja/bio/splicing/strand-orientation.js', track, seq);  // 'plus' | 'coding'
    //
    // Two loaders disagree. The server's pre-mRNA payload is the plus-strand genomic slice
    // stored as is ('plus'), while the older Ensembl path stored the transcript sequence
    // reversed, i.e. the coding strand by ascending x ('coding'). A model that is handed
    // the wrong one scores the complement of the sequence it was asked about and returns
    // confident nonsense, so this cannot be guessed from the loader.
    //
    // It is decided from the annotated exon boundaries instead: at each intron the
    // plus-strand text reads AC before the exon (the donor, read backwards) and CT after
    // it (the acceptor), while the coding-strand text reads their complements TG and GA.
    // Majority wins; with no exons to go on, 'plus', which is what the current loader
    // produces.
    //
    // Shared because two callers now ask the same question of the same track: the splicing
    // profile and the cryptic-exon scan. Two copies would be two answers, and the one that
    // was wrong would be wrong silently.

    const t = track || {};
    const strand = '' + (t.strand != null ? t.strand : 1);
    if (+strand >= 0) return 'plus';
    const s = (typeof seq === 'string' && seq) ? seq : ('' + (t.sequence || ''));
    if (!s || !t.getExons || !Number.isFinite(+t.xi)) return 'plus';
    try {
        let plusHits = 0, codingHits = 0;
        const at = (x) => {
            const i = Math.floor(x) - Math.floor(+t.xi);
            return (i >= 0 && i < s.length) ? s[i].toUpperCase() : '';
        };
        for (const e of exonsOfTrack(t)) {
            const lo = Math.min(+e.xi, +e.xf), hi = Math.max(+e.xi, +e.xf);
            const donor = at(lo - 2) + at(lo - 1);       // intron side of the exon's 3' end
            const acceptor = at(hi + 1) + at(hi + 2);    // intron side of the exon's 5' end
            if (donor === 'AC') plusHits++; else if (donor === 'TG') codingHits++;
            if (acceptor === 'CT') plusHits++; else if (acceptor === 'GA') codingHits++;
        }
        return (codingHits > plusHits) ? 'coding' : 'plus';
    } catch (e) { return 'plus'; }
}

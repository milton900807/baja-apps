function (track, snps) {

    // THE VARIANTS ON A TRACK, READ AS RESIDUE SUBSTITUTIONS.
    //   const V = await exec('baja/bio/protein/variants-to-residues.js', track);
    //   V.list     [{ spec: 'A315T', pos, wt, mu, codon, mutCodon, snp, label }]
    //   V.skipped  [{ snp, why, label }]   synonymous, not in a codon, an indel, a stop
    //
    // ONE READING, because there were two and they disagreed. The per-variant window reads
    // the substitution off track.orf.cdsi -- the track's OWN reading frame, which is what
    // the motif scan translates -- and found A315T on TARDBP from a click. The report over
    // all the variants read the protein field of the track's ANNOTATIONS instead, which
    // ClinVar rows loaded onto a track do not carry, so the same track with forty variants
    // on it reported that it had no coding variants at all. One window said A315T creates
    // two motifs; the other said there was nothing to look at.
    //
    // cdsi IS THE AUTHORITY HERE and not UniProt: it is what the scan translates, so the
    // residue number from it is the number the scan will check against. A number taken
    // from anywhere else can be off by one against this track, which is how one allele
    // ends up called both R578C and R579C.
    //
    // WHAT IS LEFT OUT IS SAID, per variant, rather than silently dropped: a report that
    // lists eleven of forty variants has to be able to say what happened to the other
    // twenty-nine, or its emptiness reads as a broken screen.

    const AA = {
        TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
        ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
        TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
        ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
        TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
        AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
        TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
        AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G'
    };

    return (async () => {
        const t = track || {};
        const list = [], skipped = [];
        const all = (snps && snps.length ? snps : ((t.snpindels) || [])).filter(Boolean);

        const label = (v) => {
            const r = ('' + (v.reference || v.ref || '')).toUpperCase();
            const a = ('' + (v.alternate || v.alt || '')).toUpperCase();
            return (v.id ? (v.id + ' ') : '') + 'g.' + Math.round(+v.xi)
                + ((r && a) ? (' ' + r + '>' + a) : '');
        };

        let cdsi = null;
        try { cdsi = t.orf && t.orf.cdsi; } catch (e) { cdsi = null; }
        if (!cdsi || !cdsi.length) {
            try { if (t.generateORF) t.generateORF(); } catch (e) { }
            try { cdsi = t.orf && t.orf.cdsi; } catch (e) { cdsi = null; }
        }
        if (!cdsi || !cdsi.length) {
            return { ok: false, why: 'no reading frame', list: [],
                skipped: all.map((v) => ({ snp: v, label: label(v), why: 'the track has no reading frame' })) };
        }

        // One pass over the frame rather than a search per variant: a ClinVar load is
        // dozens of variants and a coding sequence is thousands of positions.
        const byPos = new Map();
        for (const e of cdsi) {
            if (!e) continue;
            const k = Math.round(+e.index);
            if (!byPos.has(k)) byPos.set(k, e);
        }

        for (const v of all) {
            const L = label(v);
            const ref = ('' + (v.reference || v.ref || '')).toUpperCase();
            const alt = ('' + (v.alternate || v.alt || '')).toUpperCase();
            if (ref.length !== 1 || alt.length !== 1) {
                skipped.push({ snp: v, label: L, why: 'not a single-base substitution' });
                continue;
            }
            const hit = byPos.get(Math.round(+v.xi));
            if (!hit) {
                skipped.push({ snp: v, label: L, why: 'not inside a codon (UTR, intron, or outside the ORF)' });
                continue;
            }
            const ci = +hit.ci;
            const codon = ('' + (hit.codon || '')).toUpperCase();
            if (codon.length !== 3 || !(ci >= 0 && ci <= 2)) {
                skipped.push({ snp: v, label: L, why: 'its codon could not be read from the track' });
                continue;
            }
            const mutCodon = codon.slice(0, ci) + alt + codon.slice(ci + 1);
            const wt = AA[codon], mu = AA[mutCodon];
            if (!wt || !mu) {
                skipped.push({ snp: v, label: L, why: 'could not translate ' + codon + ' to ' + mutCodon });
                continue;
            }
            const pos = (+hit.codon_index || 0) + 1;
            if (wt === mu) {
                skipped.push({ snp: v, label: L, why: 'synonymous (' + wt + pos + ' unchanged)' });
                continue;
            }
            if (mu === '*') {
                skipped.push({ snp: v, label: L, why: wt + pos + ' to a stop: a truncation, not a substitution' });
                continue;
            }
            if (wt === '*') {
                skipped.push({ snp: v, label: L, why: 'it changes a stop codon, not a residue' });
                continue;
            }
            list.push({ spec: wt + pos + mu, pos: pos, wt: wt, mu: mu, codon: codon,
                mutCodon: mutCodon, snp: v, label: L });
        }

        return { ok: true, list: list, skipped: skipped, AA: AA };
    })();
}

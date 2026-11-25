function (track, acceptorX, opts) {

    // WHAT WOULD THIS SITE ACTUALLY MAKE?
    //   const r = await exec('baja/bio/splicing/alternative-exon.js', track, x, {});
    //   // { ok, pairings: [{ donorX, exon, peptide, consequence, ... }], normal, acceptor }
    //
    // A ranked acceptor is half a splice event, and half an event has no consequence: an
    // acceptor with no donor is not an exon, an exon with no reading frame is not a
    // protein, and the thing anyone wants to know about a cryptic site is what the message
    // would say if it were used. So this closes the exon, splices it in, and translates.
    //
    // THE DONOR IS A CHOICE, AND IT IS SHOWN AS ONE. Every donor the site model scores
    // within cassette-exon distance after the acceptor makes a different exon with a
    // different frame, and nothing about the acceptor picks one. The best-scoring is first
    // and the rest are returned beside it, because "68 nt, in frame" and "71 nt, frameshift
    // to a premature stop" are different answers from the same site and choosing silently
    // would hide that.
    //
    // Every consequence comes from exon-removal-impact's own machinery, so a frameshift
    // here means what a frameshift means on the exon screens.

    return (async () => {
        const t = track || {};
        const o = opts || {};
        const ax = Math.round(+acceptorX);
        if (!isFinite(ax)) return { ok: false, reason: 'no acceptor position given' };

        const MIN_LEN = (o.min_len != null) ? +o.min_len : 25;
        const MAX_LEN = (o.max_len != null) ? +o.max_len : 400;
        const WANT = (o.pairings != null) ? +o.pairings : 5;

        let M = null;
        try { M = await exec('baja/bio/orfs/exon-removal-impact.js', t, null, { raw: true }); }
        catch (e) { M = null; }
        if (!M || !M.ok) {
            return { ok: false, reason: (t.name || 'This track') + ': '
                + ((M && M.reason) || 'no reading frame, so there is no peptide to compare') };
        }
        const plus = !!M.plus;
        const exons = (M.exons || []).slice()
            .filter((e) => e && isFinite(+e.xi) && isFinite(+e.xf))
            .sort((a, b) => Math.min(+a.xi, +a.xf) - Math.min(+b.xi, +b.xf));

        // The intron the site sits in: the proposed exon has to fit inside it, since the
        // bases either side already belong to exons.
        let iv = null;
        for (let i = 0; i + 1 < exons.length; i++) {
            const lo = Math.max(+exons[i].xi, +exons[i].xf) + 1;
            const hi = Math.min(+exons[i + 1].xi, +exons[i + 1].xf) - 1;
            if (ax >= lo && ax <= hi) { iv = { lo: lo, hi: hi, after: i }; break; }
        }
        if (!iv) return { ok: false, reason: 'that position is not inside an intron of '
            + (t.name || 'this track') };

        const P = await exec('baja/bio/splicing/sites-profile.js', t, o);
        if (!P.ok) return { ok: false, reason: P.reason };

        // The model puts an acceptor on the last intronic base BEFORE the exon and a donor
        // on the first intronic base AFTER it, so the exon a pair makes runs between them.
        // On a minus-strand track the two swap sides in track coordinates.
        const donors = (P.donor || []).filter((d) => {
            const x = +d[0];
            if (!isFinite(x) || x < iv.lo || x > iv.hi) return false;
            const len = plus ? (x - ax - 1) : (ax - x - 1);
            return len >= MIN_LEN && len <= MAX_LEN;
        }).sort((a, b) => (+b[1]) - (+a[1])).slice(0, Math.max(1, WANT));

        if (!donors.length) {
            return { ok: false, reason: 'no donor the model scores lies ' + MIN_LEN + ' to '
                + MAX_LEN + ' bases after that acceptor inside the same intron, so there is no '
                + 'exon it could close' };
        }

        const normal = M.before;
        const normalPep = (normal && normal.protein) ? normal.protein : '';
        const AL = await exec('baja/bio/protein/align-local.js');

        const pairings = [];
        for (const d of donors) {
            const dx = +d[0];
            const exLo = plus ? (ax + 1) : (dx + 1);
            const exHi = plus ? (dx - 1) : (ax - 1);
            const len = exHi - exLo + 1;
            const extra = { xi: exLo, xf: exHi, type: 'Exon', __proposed: true };
            const made = M.translate(exons.concat([extra]));
            let consequence = 'no reading frame', nmd = '', pep = '';
            if (!made) consequence = 'the start codon is not in this transcript';
            else {
                pep = made.protein || '';
                const n = made.stop ? M.nmdOf(made) : { call: 'nonstop' };
                nmd = n.call;
                // WHAT THE EXON DOES TO THE MESSAGE, in the words the exon screens use.
                consequence = (len % 3 === 0)
                    ? ((n.call === 'nmd' || n.call === 'nmd-maybe-escape')
                        ? 'in frame, but it brings a stop codon that NMD would find'
                        : (pep === normalPep ? 'in frame and silent'
                            : 'in frame: ' + Math.round(len / 3) + ' residues inserted'))
                    : ((n.call === 'nmd' || n.call === 'nmd-maybe-escape')
                        ? 'frameshift to a premature stop that NMD would find'
                        : (n.call === 'nonstop' ? 'frameshift with no stop codon left'
                            : 'frameshift, and the protein runs to a new stop'));
            }

            // WHERE THE TWO PROTEINS PART COMPANY, AND WHERE THEY MEET AGAIN.
            //
            // The head is easy: everything before the first difference is the protein
            // already known. The tail is the part that matters for an IN-FRAME exon, and
            // leaving it out misdraws the whole picture. An insertion shifts every residue
            // after it by the length of the insert, so comparing position by position says
            // the protein differs from there to the end, when in truth it resumes exactly
            // and only the inserted stretch is new. Matching backwards from the end finds
            // where it resumes; after a frameshift nothing matches and the tail is zero,
            // which is the right answer there.
            let divergeAt = null, sameTail = 0;
            if (pep && normalPep) {
                const n2 = Math.min(pep.length, normalPep.length);
                let i = 0;
                while (i < n2 && pep[i] === normalPep[i]) i++;
                divergeAt = (i < Math.max(pep.length, normalPep.length)) ? i : null;
                if (divergeAt != null) {
                    let j = 0;
                    while (j < (n2 - i) && pep[pep.length - 1 - j] === normalPep[normalPep.length - 1 - j]) j++;
                    sameTail = j;
                }
            }
            let identity = null;
            try {
                if (pep && normalPep) {
                    const r2 = AL.align(pep, normalPep, AL.KIND.aa);
                    identity = r2.len ? (r2.id / r2.len) : null;
                }
            } catch (e) { identity = null; }

            pairings.push({
                donorX: dx, donorScore: +d[1],
                exon: { xi: exLo, xf: exHi, length: len, frame: len % 3 },
                peptide: pep, length: pep.length, nmd: nmd,
                consequence: consequence, divergeAt: divergeAt, sameTail: sameTail,
                identity: identity
            });
        }

        return {
            ok: true,
            track: t.name || 'track',
            acceptor: { x: ax, intron: iv.after + 1, lo: iv.lo, hi: iv.hi },
            normal: { peptide: normalPep, length: normalPep.length,
                exons: exons.map((e) => ({ xi: Math.min(+e.xi, +e.xf), xf: Math.max(+e.xi, +e.xf) })) },
            plus: plus,
            pairings: pairings
        };
    })();
}

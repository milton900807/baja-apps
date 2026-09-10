function (server, track) {
    // A TRACK ON AN ALT CONTIG, AND THE PRIMARY-ASSEMBLY TRANSCRIPT THAT MATCHES IT.
    //
    // Alt contigs (HSCHR5_1_CTG1_1 and friends) carry their own coordinate system. Every
    // variant database -- ClinVar, dbSNP, gnomAD, COSMIC -- is built on the primary assembly
    // only, so a position on an alt contig is a real number that means nothing to them: the
    // query runs, matches an empty stretch of the primary chromosome, and reports no variants
    // rather than reporting that the question could not be asked.
    //
    // The way across is the transcript. SMN1-231 on HSCHR5_1_CTG1_1 and SMN1-202 on chr5 are
    // the same nine exons of the same gene, so a variant at a given offset INTO AN EXON of one
    // is at that offset into the corresponding exon of the other.
    //
    // WHY PER EXON AND NOT ONE OFFSET. The tempting shortcut is to subtract a constant. For
    // SMN1 that is wrong, and quietly:
    //
    //     exon 1      primary - alt = +70,451,595      lengths 128 / 98
    //     exons 2-7   primary - alt = +70,451,567      lengths identical
    //     exons 8-9   primary - alt = +70,451,568      lengths identical
    //
    // Three offsets, because the alt contig carries small indels against chr5. One shift puts
    // everything from exon 8 onward a base off -- including exon 7/8, which is where the SMN
    // variants that matter are. A base off, silently, is worse than not loading at all.
    //
    // So each exon is mapped on its own, and only where the two exons are the SAME LENGTH. An
    // exon whose lengths differ (SMN1's exon 1, 128 against 98) cannot be transferred without
    // guessing which end the extra bases are on, so its variants are counted and reported
    // rather than placed. The same goes for introns: an intron is transferable only when both
    // its flanking exons matched AND the intron itself is the same length on both.
    //
    // Returns null when there is nothing to map to, or:
    //   { id, name, chr, lo, hi, pairs, exact, differing, toTrackX(primaryPos) }
    // toTrackX returns a track x, or null when the position is in a region that cannot be
    // transferred -- never a guess.

    const bare = (v) => ('' + (v == null ? '' : v)).trim();
    const isPrimary = (c) => /^(chr)?([0-9]{1,2}|X|Y|MT?)$/i.test(bare(c));

    // The gene this track is a transcript of. Tracks are named "SMN1-231", "TARDBP-201" --
    // Ensembl's own display name -- so the symbol is what precedes the -NNN. geneID is tried
    // first because it is the field meant for this, and the name is the fallback for tracks
    // that never carried one.
    const symbolOf = () => {
        const cands = [track.geneSymbol, track.gene, track.geneID, track.name];
        for (const c of cands) {
            let t = bare(c);
            if (!t) continue;
            t = t.replace(/^gene:/i, '').replace(/\.\d+$/, '');
            if (/^ENS[A-Z]*[GT]\d+$/i.test(t)) continue;      // an id is not a symbol
            const m = t.match(/^([A-Za-z0-9._-]+?)-\d{3}$/);  // SMN1-231 -> SMN1
            if (m) return m[1];
            if (/^[A-Za-z][A-Za-z0-9._-]{0,20}$/.test(t)) return t;
        }
        return '';
    };

    // The alt track's own exons, in ascending genomic order, each with the track coordinates
    // that variantWorldX would use.
    const altExons = () => {
        const out = [];
        try {
            for (const a of (track.getExons() || [])) {
                const gi = +a.gxi, gf = +a.gxf, xi = +a.xi, xf = +a.xf;
                if (!isFinite(gi) || !isFinite(gf) || !isFinite(xi) || !isFinite(xf)) continue;
                out.push({
                    gs: Math.min(gi, gf), ge: Math.max(gi, gf),
                    xs: Math.min(xi, xf), xe: Math.max(xi, xf),
                    // Which way the track runs across this exon: a minus-strand transcript's
                    // lower genomic base is its HIGHER track x, and a mapping that ignored
                    // that would reverse every variant within the exon.
                    rev: (gi > gf) !== (xi > xf)
                });
            }
        } catch (e) { return []; }
        out.sort((p, q) => p.gs - q.gs);
        return out;
    };

    return (async () => {
        const alt = altExons();
        if (alt.length < 2) return null;                  // nothing to align against
        const sym = symbolOf();
        if (!sym) return null;

        // Candidate transcripts of the same symbol. /gene-lookup carries both gene ids for a
        // gene that exists on an alt contig as well as the primary one, which is what makes
        // the crossing possible at all -- the alt transcript's own gene id knows nothing
        // about the primary copy.
        let rows = [];
        try {
            rows = await GETJSON(window['env']['apiUrl'] + '/gene-lookup?key='
                + encodeURIComponent(sym));
        } catch (e) { rows = []; }
        if (!Array.isArray(rows)) rows = [];
        const ids = [];
        for (const q of rows) {
            if (bare(q['Gene name']).toUpperCase() !== sym.toUpperCase()) continue;
            const t = bare(q['Transcript stable ID']);
            if (t && ids.indexOf(t) < 0) ids.push(t);
        }
        if (!ids.length) return null;

        // Score each candidate by how much of the alt track's exon structure it reproduces.
        // Exon COUNT must match -- a transcript with a different number of exons is a
        // different isoform, and pairing them in order would align exon 3 with exon 4 all the
        // way down. Among those, the one with the most same-length exons wins.
        let best = null;
        for (const id of ids.slice(0, 12)) {
            let d = null;
            try { d = await GETJSON(server + '/ensembl/lookup/' + encodeURIComponent(id)); }
            catch (e) { continue; }
            if (!d || d.notFound || !Array.isArray(d.Exon)) continue;
            if (!isPrimary(d.seq_region_name)) continue;
            const pex = d.Exon.map((e) => ({ gs: Math.min(+e.start, +e.end), ge: Math.max(+e.start, +e.end) }))
                .sort((p, q) => p.gs - q.gs);
            if (pex.length !== alt.length) continue;
            let same = 0;
            for (let i = 0; i < pex.length; i++) {
                if ((pex[i].ge - pex[i].gs) === (alt[i].ge - alt[i].gs)) same++;
            }
            if (!best || same > best.same) {
                best = { same: same, id: id, name: bare(d.display_name) || id, chr: bare(d.seq_region_name), pex: pex };
            }
        }
        // Half the exons matching is not a corresponding transcript, it is a coincidence of
        // exon counts. Refusing here is what keeps this from inventing a mapping.
        if (!best || best.same < Math.max(2, Math.ceil(alt.length * 0.6))) return null;

        const pairs = [];
        for (let i = 0; i < alt.length; i++) {
            const a = alt[i], p = best.pex[i];
            pairs.push({ a: a, p: p, sameLen: (p.ge - p.gs) === (a.ge - a.gs) });
        }
        const exact = pairs.filter((q) => q.sameLen).length;

        // An intron is transferable only when both its flanking exons are, and it is itself
        // the same length on both -- otherwise a position inside it has no defined counterpart
        // and the shift either side of it disagrees.
        const introns = [];
        for (let i = 0; i + 1 < pairs.length; i++) {
            const A = pairs[i], B = pairs[i + 1];
            const aLen = B.a.gs - A.a.ge - 1, pLen = B.p.gs - A.p.ge - 1;
            introns.push({
                ps: A.p.ge + 1, pe: B.p.gs - 1,
                as: A.a.ge + 1, ae: B.a.gs - 1,
                ok: A.sameLen && B.sameLen && aLen === pLen && aLen >= 0
            });
        }

        const toTrackX = (pos) => {
            const g = Math.floor(+pos);
            if (!isFinite(g)) return null;
            for (const q of pairs) {
                if (g < q.p.gs || g > q.p.ge) continue;
                if (!q.sameLen) return null;               // cannot transfer; do not guess
                const off = g - q.p.gs;                    // offset into the primary exon
                const gAlt = q.a.gs + off;                 // the same offset into the alt exon
                return q.a.rev ? (q.a.xe - (gAlt - q.a.gs)) : (q.a.xs + (gAlt - q.a.gs));
            }
            for (const iv of introns) {
                if (g < iv.ps || g > iv.pe) continue;
                if (!iv.ok) return null;
                const gAlt = iv.as + (g - iv.ps);
                // Position it against the exon that starts just after this intron, so the
                // track coordinate comes from a pair that was verified rather than from an
                // extrapolation off the end of the transcript.
                for (const q of pairs) {
                    if (gAlt >= q.a.gs && gAlt <= q.a.ge) {
                        return q.a.rev ? (q.a.xe - (gAlt - q.a.gs)) : (q.a.xs + (gAlt - q.a.gs));
                    }
                }
                // Between exons on the track too: place it by offset from the preceding exon's
                // end, in whichever direction the track runs.
                const prev = pairs.filter((q) => q.a.ge < gAlt).pop();
                if (!prev) return null;
                const d = gAlt - prev.a.ge;
                return prev.a.rev ? (prev.a.xs - d) : (prev.a.xe + d);
            }
            return null;
        };

        return {
            id: best.id, name: best.name, chr: best.chr.replace(/^chr/, ''),
            lo: best.pex[0].gs, hi: best.pex[best.pex.length - 1].ge,
            pairs: pairs, exact: exact, differing: pairs.length - exact,
            toTrackX: toTrackX
        };
    })();
}

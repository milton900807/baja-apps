function (track) {

    // HGVS c. COORDINATES for a track, both ways.
    //
    //   const C = await exec('baja/bio/coords/cds-coords.js', track);
    //   C.ok            false when the track carries no coding annotation to count from
    //   C.toX({ pos: 709, offset: 0, region: 'cds' })   -> track x, or null
    //   C.toC(x)        -> { pos, offset, region, text } or null
    //   C.plus, C.cdsLength, C.startG, C.stopEndG
    //
    // WHAT c. ACTUALLY COUNTS. c.1 is the A of the start codon and the numbering runs along the
    // SPLICED transcript, so it skips introns: c.709 is the 709th coding base, not the 709th
    // base of the gene. Positions outside the CDS are written differently again -- c.-12 is 12
    // exonic bases 5' of the A, c.*12 is 12 exonic bases 3' of the stop codon's last base -- and
    // an intronic position hangs off the nearest exonic one, c.709+3 being 3 bases into the
    // intron after c.709 and c.710-2 two bases before c.710.
    //
    // All of which is why a c. coordinate cannot be turned into a position by arithmetic on the
    // track's own index: it needs the exons and the start codon, which is what this reads.
    //
    // The track is not changed.
    return (async () => {
        const out = { ok: false, reason: '', plus: true, cdsLength: 0, startG: null, stopEndG: null };
        try {
            if (!track) { out.reason = 'No track.'; return out; }
            const A = track.annotations || [];
            const ty = (a) => ('' + (a && a.type)).toLowerCase();
            const sSrc = A.find((a) => {
                const s = a && a.strand;
                return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
            });
            const plus = sSrc ? !(String(sSrc.strand) === '-' || String(sSrc.strand) === '-1') : (+track.strand >= 0);
            out.plus = plus;

            // Exonic positions in transcript order. A track with no exon annotation is treated as
            // one continuous exon over its own span, which is what a cDNA track is.
            let exons = (track.getExons ? track.getExons() : A.filter((a) => a && ty(a) === 'exon'))
                .filter((e) => e && isFinite(+e.xi) && isFinite(+e.xf))
                .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }));
            if (!exons.length) {
                const lo = Math.min(+track.xi, +track.xf), hi = Math.max(+track.xi, +track.xf);
                if (!isFinite(lo) || !isFinite(hi)) { out.reason = 'That track has no exons and no span.'; return out; }
                exons = [{ lo: lo, hi: hi }];
            }
            exons.sort((a, b) => plus ? a.lo - b.lo : b.lo - a.lo);
            const tx = [];                       // tx[i] = genomic position of transcript base i
            for (const e of exons) {
                if (plus) { for (let p = e.lo; p <= e.hi; p++) tx.push(p); }
                else { for (let p = e.hi; p >= e.lo; p--) tx.push(p); }
            }
            const idxOf = new Map();
            for (let i = 0; i < tx.length; i++) if (!idxOf.has(tx[i])) idxOf.set(tx[i], i);

            // The CDS: its first base is c.1 and its last base is the end of the stop codon.
            const tr = A.find((a) => ty(a) === 'translation');
            const cds = A.filter((a) => a && a.type === 'CDS');
            let startG = null, stopEndG = null;
            if (tr && tr.xi != null && tr.xf != null) {
                const lo = Math.min(+tr.xi, +tr.xf), hi = Math.max(+tr.xi, +tr.xf);
                startG = plus ? lo : hi; stopEndG = plus ? hi : lo;
            } else if (cds.length) {
                let lo = Infinity, hi = -Infinity;
                for (const c of cds) { lo = Math.min(lo, +c.xi, +c.xf); hi = Math.max(hi, +c.xi, +c.xf); }
                startG = plus ? lo : hi; stopEndG = plus ? hi : lo;
            } else {
                const tss = A.find((a) => ty(a) === 'tss');
                if (tss && tss.xi != null) startG = plus ? Math.min(+tss.xi, +tss.xf) : Math.max(+tss.xi, +tss.xf);
            }
            if (startG == null || !isFinite(startG) || !idxOf.has(startG)) {
                out.reason = 'That track has no annotated start codon, so c. positions cannot be counted on it.';
                return out;
            }
            const s0 = idxOf.get(startG);                                  // transcript index of c.1
            const sEnd = (stopEndG != null && idxOf.has(stopEndG)) ? idxOf.get(stopEndG) : null;
            out.ok = true; out.startG = startG; out.stopEndG = stopEndG;
            out.cdsLength = (sEnd != null) ? (sEnd - s0 + 1) : (tx.length - s0);

            // transcript index for a c. position, before any intronic offset
            const indexFor = (pos, region) => {
                if (region === 'utr5') return s0 - Math.abs(pos);          // c.-n
                if (region === 'utr3') return (sEnd == null ? null : sEnd + Math.abs(pos));   // c.*n
                return s0 + (pos - 1);                                      // c.n
            };
            const inTrack = (p) => {
                const lo = Math.min(+track.xi, +track.xf), hi = Math.max(+track.xi, +track.xf);
                return isFinite(p) && p >= lo && p <= hi;
            };

            out.toX = (c) => {
                try {
                    if (!c || c.pos == null) return null;
                    const region = c.region || 'cds';
                    const i = indexFor(+c.pos, region);
                    if (i == null || i < 0 || i >= tx.length) return null;
                    const x = tx[i];
                    const off = Math.round(+c.offset || 0);
                    if (!off) return x;
                    // An intronic offset walks the GENOME from that exonic base, in transcript
                    // direction, which is how +n and -n are defined.
                    const p = plus ? (x + off) : (x - off);
                    return inTrack(p) ? p : null;
                } catch (e) { return null; }
            };

            out.toC = (x) => {
                try {
                    const p = Math.round(+x);
                    if (idxOf.has(p)) {
                        const i = idxOf.get(p);
                        if (sEnd != null && i > sEnd) return { pos: i - sEnd, offset: 0, region: 'utr3', text: 'c.*' + (i - sEnd) };
                        if (i < s0) return { pos: -(s0 - i), offset: 0, region: 'utr5', text: 'c.' + (i - s0) };
                        return { pos: i - s0 + 1, offset: 0, region: 'cds', text: 'c.' + (i - s0 + 1) };
                    }
                    // Intronic: hang it off the nearer exonic neighbour, the way HGVS writes it.
                    let best = null;
                    for (let k = 1; k <= 50000; k++) {
                        const up = plus ? p - k : p + k, dn = plus ? p + k : p - k;
                        if (idxOf.has(up)) { best = { base: up, off: k }; break; }
                        if (idxOf.has(dn)) { best = { base: dn, off: -k }; break; }
                        if (!inTrack(up) && !inTrack(dn)) break;
                    }
                    if (!best) return null;
                    const b = out.toC(best.base);
                    if (!b) return null;
                    const sign = best.off > 0 ? '+' : '-';
                    return { pos: b.pos, offset: best.off, region: b.region,
                        text: b.text + sign + Math.abs(best.off) };
                } catch (e) { return null; }
            };
            return out;
        } catch (e) {
            out.reason = 'Could not read c. coordinates: ' + (e && e.message ? e.message : e);
            return out;
        }
    })();
}

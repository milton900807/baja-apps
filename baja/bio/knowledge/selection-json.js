function (track, region, opts) {

    // WHAT IS IN THIS STRETCH, AS DATA.
    //   const J = await exec('baja/bio/knowledge/selection-json.js', track, { xi, xf }, {});
    //   // { gene, assembly, genomic, c, annotations, introns, sequence, counts, json }
    //
    // The selection a person makes is a pair of pixels until something writes down what it
    // contains. This is that: the genomic range, the c. range when the track has a reading
    // frame to count from, every annotation that falls inside it, and the sequence itself.
    //
    // It exists to be handed to something that was not there when the selection was made --
    // a model, a file, another session -- so it carries what cannot be inferred from
    // coordinates alone: which assembly, which strand, which transcript, and the sequence,
    // which is the only part that can later be used to CHECK a claim about this region
    // rather than take it on trust.
    //
    // c. coordinates come from cds-coords.js, which counts along the spliced transcript and
    // knows that c.709+3 is intronic. A track with no coding annotation gets c: null rather
    // than a number from arithmetic that would be wrong.

    return (async () => {
        const t = track || {};
        const o = opts || {};
        const r = region || {};
        const lo = Math.round(Math.min(+r.xi, +r.xf));
        const hi = Math.round(Math.max(+r.xi, +r.xf));
        if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
            return { error: 'No range selected.' };
        }

        const name = '' + (t.name || 'track');
        const strand = (+(t.strand != null ? t.strand : 1) >= 0) ? '+' : '-';
        const gLo = (t.chrstart != null && isFinite(+t.chrstart))
            ? (+t.chrstart + (lo - (+t.xi || 0))) : null;
        const gHi = (gLo != null) ? (gLo + (hi - lo)) : null;

        // EVERY ANNOTATION THAT OVERLAPS, not only the ones wholly inside: an exon the
        // selection clips is still the exon this stretch is part of, and saying otherwise
        // would describe an intron selection as containing nothing at all.
        const anns = [];
        for (const a of (t.annotations || [])) {
            if (!a) continue;
            const alo = Math.min(+a.xi, +a.xf), ahi = Math.max(+a.xi, +a.xf);
            if (!isFinite(alo) || !isFinite(ahi)) continue;
            if (ahi < lo || alo > hi) continue;
            const one = {
                type: '' + (a.type || ''), name: ('' + (a.name || '')) || null,
                index: (a.index != null) ? a.index : null,
                xi: alo, xf: ahi, length: ahi - alo + 1
            };
            if (alo < lo || ahi > hi) one.clipped = true;
            anns.push(one);
        }
        anns.sort((p, q) => p.xi - q.xi);

        // THE GAPS BETWEEN THE EXONS ARE WHERE THE INTERESTING THINGS ARE, and a gap is not
        // an annotation, so nothing above would mention it. A selection of "the first
        // intron" would otherwise arrive describing itself as empty.
        const exons = exonsOfTrack(t)
            .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }))
            .filter((e) => isFinite(e.lo) && isFinite(e.hi))
            .sort((a, b) => a.lo - b.lo);
        const introns = [];
        for (let i = 0; i + 1 < exons.length; i++) {
            const ilo = exons[i].hi + 1, ihi = exons[i + 1].lo - 1;
            if (ihi <= ilo || ihi < lo || ilo > hi) continue;
            introns.push({
                number: (strand === '+') ? (i + 1) : (exons.length - 1 - i),
                xi: ilo, xf: ihi, length: ihi - ilo + 1,
                covered: (ilo >= lo && ihi <= hi) ? 'all' : 'part'
            });
        }

        let c = null;
        try {
            const C = await exec('baja/bio/coords/cds-coords.js', t);
            if (C && C.ok) {
                const a = C.toC(lo), b = C.toC(hi);
                if (a || b) {
                    c = { from: a ? a.text : null, to: b ? b.text : null,
                        cds_length: C.cdsLength || null };
                }
            }
        } catch (e) { c = null; }

        let seq = '';
        try { seq = ('' + (t.getSequenceRange ? t.getSequenceRange(lo, hi) : '')).toUpperCase(); }
        catch (e) { seq = ''; }

        const out = {
            gene: name,
            species: ('' + (t.species || '')) || null,
            assembly: ('' + (t.assembly || t.genome || '')) || null,
            transcript: ('' + (t.transcript || t.enst || '')) || null,
            strand: strand,
            genomic: {
                chr: ('' + (t.chr || '')) || null, start: gLo, end: gHi,
                track_xi: lo, track_xf: hi, length: hi - lo + 1
            },
            c: c,
            annotations: anns,
            introns: introns,
            counts: { annotations: anns.length, introns: introns.length, bases: hi - lo + 1 },
            sequence: (o.sequence === false) ? null : seq
        };

        // The same object as a file, because a selection worth asking about is one worth
        // being able to ask about again, or somewhere else.
        try {
            out.file = (name + (t.chr ? ('-chr' + t.chr) : '') + '-'
                + (gLo != null ? gLo : lo) + '-' + (gHi != null ? gHi : hi) + '.json')
                .replace(/[^\w.\-]+/g, '-');
        } catch (e) { out.file = 'selection.json'; }
        return out;
    })();
}

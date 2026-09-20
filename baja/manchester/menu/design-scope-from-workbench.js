function (graph, track, sequence, opts) {

    // WHAT TO DESIGN AGAINST, AND WHAT TO DESIGN AROUND.
    //
    //   const scope = await exec('baja/manchester/menu/design-scope-from-workbench.js',
    //                            graph, track, sequence,
    //                            { alleles: true, avoidOthers: true, offset: startIndex });
    //   scope.sequence        the sequence to design on
    //   scope.exclude_regions [[from, to], …] half-open, as indexes into that sequence
    //   scope.note            one line saying what was done, for the run's message
    //
    // A workbench usually holds more than one track of the same region: a reference and a
    // sample, a germline and a tumour, several patients. Two things follow from that, and
    // both of them are about sequence rather than chemistry, which is why they live here
    // and not in the designer.
    //
    // ALLELES. The track's sequence is the reference it was built from. The sample it
    // represents carries its own substitutions, and an oligo designed on the reference is
    // an oligo designed against a sequence that sample does not have. Applying the track's
    // own SNVs first fixes that. Indels are deliberately NOT applied: an insertion or a
    // deletion shifts every coordinate after it, and every variant, annotation and oligo
    // already on the track is indexed by those coordinates. They are excluded instead --
    // the design simply does not cross them.
    //
    // OTHER TRACKS' VARIANTS. A position that is a variant on another track is a position
    // whose sequence differs between the samples on this workbench. An oligo covering one
    // binds a different target in each of them, which is the opposite of what a designed
    // oligo is for. Every variant on every other track is mapped onto this track and the
    // sites covering them are withheld from the designer.
    //
    // THE MAPPING between tracks is genomic, through each track's own exon map -- the same
    // one variantWorldX uses to place a VCF record -- so a spliced transcript and a genomic
    // track of the same gene agree, and a minus-strand track needs no special case. Tracks
    // of a different chromosome cannot overlap and are skipped rather than mis-mapped.
    return (async () => {
        const o = opts || {};
        const offset = Math.max(0, Math.round(+o.offset || 0));   // where `sequence` starts in the track
        const seq0 = '' + (sequence || '');
        const out = {
            sequence: seq0, exclude_regions: [], note: '',
            appliedAlleles: 0, skippedIndels: 0, excludedVariants: 0, otherTracks: 0,
        };
        if (!track || !seq0.length) return out;

        const bare = (v) => ('' + (v == null ? '' : v)).trim().toLowerCase().replace(/^chr/, '');
        const num = (v) => { const n = +v; return isFinite(n) ? n : null; };

        // ---- track coordinates <-> genomic -------------------------------------------------
        // variantWorldX(chr, pos) is the forward direction and the track already owns it.
        // This is the inverse, over the same exon spans: linear within an exon between its
        // genomic span (gxi..gxf) and its track span (xi..xf). A track with no exon map is
        // a plain window onto the genome, where the two differ by the track's origin.
        const genomicOf = (t, localX) => {
            const x = num(localX);
            if (x == null) return null;
            let exons = [];
            try { exons = t.getExons ? (t.getExons() || []) : []; } catch (e) { exons = []; }
            for (const a of exons) {
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
        // Genomic -> this track, preferring the track's own exon-aware mapping.
        const localOf = (t, chr, genomicPos) => {
            let v = null;
            try { v = t.variantWorldX ? t.variantWorldX(chr, genomicPos) : null; } catch (e) { v = null; }
            if (v != null && isFinite(+v)) return +v;
            const a = bare(chr), b = bare(t.chr);
            if (a && b && a !== b) return null;
            const base = num(t.xi);
            if (base == null) return null;
            const x = genomicPos - base;
            return (x >= 0) ? x : null;
        };

        // A variant's footprint in track coordinates: where it sits, and how many bases of
        // the track it covers (a deletion covers the bases it removes).
        const footprint = (s) => {
            const x = num(s.xi);
            if (x == null) return null;
            const ref = ('' + (s.reference0 != null ? s.reference0 : (s.reference || ''))).replace(/[^A-Za-z]/g, '');
            const alt = ('' + (s.alternate0 != null ? s.alternate0 : (s.alternate || ''))).replace(/[^A-Za-z]/g, '');
            const len = Math.max(1, ref.length || 1);
            return { x: x, len: len, ref: ref.toUpperCase(), alt: alt.toUpperCase() };
        };
        const isSub = (f) => f && f.ref && f.alt && f.ref.length === f.alt.length
            && /^[ACGT]+$/.test(f.ref) && /^[ACGT]+$/.test(f.alt);

        // ---- 1. this track's own alleles ---------------------------------------------------
        let seq = seq0;
        if (o.alleles) {
            const chars = seq.split('');
            for (const s of (track.snpindels || [])) {
                const f = footprint(s);
                if (!f) continue;
                const i = Math.round(f.x) - offset;
                if (i < 0 || i >= chars.length) continue;
                if (!isSub(f)) {
                    // An indel is not applied; the design is kept off it instead.
                    out.exclude_regions.push([Math.max(0, i - 1), Math.min(chars.length, i + f.len + 1)]);
                    out.skippedIndels++;
                    continue;
                }
                // Only where the track really does read the reference base: a mismatch here
                // means the sequence and the variant disagree about the frame, and writing
                // the alternate in anyway would quietly corrupt the design target.
                let agrees = true;
                for (let k = 0; k < f.ref.length; k++) {
                    const c = (chars[i + k] || '').toUpperCase();
                    const r = f.ref[k];
                    if (!c || (c !== r && !(c === 'U' && r === 'T') && !(c === 'T' && r === 'U'))) { agrees = false; break; }
                }
                if (!agrees) continue;
                const rna = /U/i.test(seq0);
                for (let k = 0; k < f.alt.length && (i + k) < chars.length; k++) {
                    const b = f.alt[k];
                    chars[i + k] = (rna && b === 'T') ? 'U' : b;
                }
                out.appliedAlleles++;
            }
            seq = chars.join('');
        }
        out.sequence = seq;

        // ---- 2. every other track's variants ------------------------------------------------
        if (o.avoidOthers) {
            const all = (graph && graph.track) || [];
            // One base of margin each side. The designer masks in 0-based sequence space
            // while a candidate reports itself 1-based, and the editor adds the design offset
            // again when it places the compound; a single base of slack means no oligo can end
            // up touching a variant through any of that arithmetic, and it costs one base.
            const pad = Math.max(0, Math.round(o.pad != null ? +o.pad : 1));
            for (const u of all) {
                if (!u || u === track) continue;
                const uchr = bare(u.chr), tchr = bare(track.chr);
                if (uchr && tchr && uchr !== tchr) continue;     // cannot overlap
                let used = 0;
                for (const s of (u.snpindels || [])) {
                    const f = footprint(s);
                    if (!f) continue;
                    const gp = genomicOf(u, f.x);
                    if (gp == null) continue;
                    const lx = localOf(track, u.chr || track.chr, gp);
                    if (lx == null) continue;
                    const i = Math.round(lx) - offset;
                    const from = i - pad, to = i + f.len + pad;
                    if (to <= 0 || from >= seq.length) continue;   // outside what is designed
                    out.exclude_regions.push([Math.max(0, from), Math.min(seq.length, to)]);
                    out.excludedVariants++;
                    used++;
                }
                if (used) out.otherTracks++;
            }
        }

        // Merge the regions so the designer is handed a tidy list rather than one entry per
        // variant, which on a dense VCF is thousands of overlapping pairs.
        if (out.exclude_regions.length > 1) {
            out.exclude_regions.sort((a, b) => a[0] - b[0]);
            const merged = [out.exclude_regions[0].slice()];
            for (const r of out.exclude_regions.slice(1)) {
                const last = merged[merged.length - 1];
                if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
                else merged.push(r.slice());
            }
            out.exclude_regions = merged;
        }
        const blocked = out.exclude_regions.reduce((n, r) => n + (r[1] - r[0]), 0);
        out.blockedBases = blocked;

        const bits = [];
        if (o.alleles) bits.push(out.appliedAlleles + ' of this track’s alleles applied'
            + (out.skippedIndels ? (', ' + out.skippedIndels + ' indel' + (out.skippedIndels === 1 ? '' : 's') + ' left out and designed around') : ''));
        if (o.avoidOthers) bits.push(out.excludedVariants
            ? (out.excludedVariants + ' variant' + (out.excludedVariants === 1 ? '' : 's') + ' on ' + out.otherTracks
                + ' other track' + (out.otherTracks === 1 ? '' : 's') + ' avoided')
            : 'no variants on the other tracks fall in this range');
        if (blocked) bits.push(blocked + ' of ' + seq.length + ' bases withheld');
        out.note = bits.join(' · ');
        return out;
    })();
}

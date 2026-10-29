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
        // A variant's xi is in the track's own x, which starts at TRACK.XI, while `offset` is
        // relative to that (selectedOffset() = start - xi). Both have to come off to land in
        // `sequence`. Without track.xi, every variant on a genomic track -- whose xi is the
        // gene's start, not zero -- mapped past the end of the sequence and was skipped, so
        // neither option did anything there: no allele was applied and no site was avoided.
        const baseOf = (t) => Math.round(+(t && t.xi) || 0) + offset;
        const seq0 = '' + (sequence || '');
        const out = {
            sequence: seq0, exclude_regions: [], note: '',
            appliedAlleles: 0, appliedIndels: 0, skippedIndels: 0, mismatched: 0,
            excludedVariants: 0, otherTracks: 0,
            // This track's own variants, as the designed sequence sees them: pos, the span a
            // candidate must cover whole to discriminate, type, and the label to report it by.
            mutations: [], shifts: [],
        };
        if (!track || !seq0.length) return out;

        const bare = (v) => ('' + (v == null ? '' : v)).trim().toLowerCase().replace(/^chr/, '');
        const num = (v) => { const n = +v; return isFinite(n) ? n : null; };

        // Track x <-> genomic, shared with everything else that compares positions across
        // tracks (baja/bio/track-coords.js), so the conversion cannot drift between them.
        const C = await exec('baja/bio/track-coords.js');
        const genomicOf = C.genomicOf, localOf = C.localOf;

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
        // WHICH WRITING OF THE ALLELE THIS TRACK USES. A variant carries its alleles twice:
        // reference / alternate as they were loaded, and reference0 / alternate0 complemented
        // for a minus-strand transcript. Which of the two matches the track's own string
        // depends on how that track stores its sequence -- a genomic slice holds the plus
        // strand, an mRNA track holds the transcript -- and guessing one of them is how an
        // insertion on ACVR1 (a minus-strand gene, loaded as A>AT and labelled T>TA) came to
        // disagree with the base under it and be dropped. So all the forms are offered and the
        // one that matches the sequence at that position wins.
        const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', N: 'N' };
        const rc = (t) => ('' + t).toUpperCase().split('').reverse().map((c) => COMP[c] || c).join('');
        const cmp = (t) => ('' + t).toUpperCase().split('').map((c) => COMP[c] || c).join('');
        const alleleForms = (sv) => {
            const clean = (v) => ('' + (v == null ? '' : v)).replace(/[^A-Za-z]/g, '').toUpperCase();
            const r0 = clean(sv.reference0 != null ? sv.reference0 : sv.reference);
            const a0 = clean(sv.alternate0 != null ? sv.alternate0 : sv.alternate);
            const r1 = clean(sv.reference), a1 = clean(sv.alternate);
            const forms = [[r0, a0], [r1, a1], [cmp(r1), cmp(a1)], [rc(r1), rc(a1)]];
            const seen = {}, out2 = [];
            for (const [r, a] of forms) {
                if (!r || !a) continue;
                const k = r + '>' + a;
                if (seen[k]) continue;
                seen[k] = 1; out2.push({ ref: r, alt: a });
            }
            return out2;
        };
        const isSub = (f) => f && f.ref && f.alt && f.ref.length === f.alt.length
            && /^[ACGT]+$/.test(f.ref) && /^[ACGT]+$/.test(f.alt);

        // ---- 1. this track's own alleles ---------------------------------------------------
        //
        // INDELS. By default they are not applied: an insertion or a deletion shifts every
        // coordinate after it, and every variant, annotation and compound already on the track
        // is indexed by those coordinates, so the design is kept off them instead.
        //
        // `indels: 'apply'` is the allele-selective case, where that trade goes the other way.
        // An ASO that discriminates a deletion is one that spans the join, and the join does
        // not exist in the reference: there is nothing to design against unless the deletion is
        // actually made. Only the SEQUENCE handed to the designer is rebuilt -- the track is not
        // touched -- and every position that moves is reported in `out.mutations`, in the
        // coordinates of that rebuilt sequence, so the caller never has to redo this arithmetic.
        const applyIndels = ('' + (o.indels || '')).toLowerCase() === 'apply';
        const rna = /U/i.test(seq0);
        const asSeq = (b) => (rna && b === 'T') ? 'U' : b;
        let seq = seq0;
        // Every variant of this track that lands inside `sequence`, in order, with the one
        // reading of its coordinates. Both branches below work from this list.
        const own = [];
        for (const s of (track.snpindels || [])) {
            const f = footprint(s);
            if (!f) continue;
            const i = Math.round(f.x) - baseOf(track);
            if (i < 0 || i >= seq0.length) continue;
            own.push({ v: s, f: f, i: i });
        }
        own.sort((a, b) => a.i - b.i);
        if (o.alleles) {
            const chars = seq.split('');
            // Only where the track really does read the reference base: a mismatch here means
            // the sequence and the variant disagree about the frame, and writing the alternate
            // in anyway would quietly corrupt the design target.
            const agreesAt = (i, ref) => {
                for (let k = 0; k < ref.length; k++) {
                    const c = (chars[i + k] || '').toUpperCase();
                    const r = ref[k];
                    if (!c || (c !== r && !(c === 'U' && r === 'T') && !(c === 'T' && r === 'U'))) return false;
                }
                return true;
            };
            // RIGHT TO LEFT, so an indel cannot move the ground under the variants still to be
            // applied; each one's final position is then its own index plus the net length
            // change of everything to its LEFT, which is one pass the other way (below).
            const applied = [];
            for (let n = own.length - 1; n >= 0; n--) {
                const { f, i } = own[n];
                const sub = isSub(f);
                if (!sub && !applyIndels) {
                    // Not applied: the design is kept off it instead.
                    out.exclude_regions.push([Math.max(0, i - 1), Math.min(chars.length, i + f.len + 1)]);
                    out.skippedIndels++;
                    continue;
                }
                // The first writing of this variant whose reference reads the way the track
                // does at that position (see alleleForms).
                let use = null;
                for (const cand of alleleForms(own[n].v)) {
                    if (!/^[ACGT]+$/.test(cand.ref) || !/^[ACGT]+$/.test(cand.alt)) continue;
                    if (i + cand.ref.length > chars.length) continue;
                    if (agreesAt(i, cand.ref)) { use = cand; break; }
                }
                if (!use) { out.mismatched = (out.mismatched || 0) + 1; continue; }
                const isSubNow = use.ref.length === use.alt.length;
                chars.splice(i, use.ref.length, ...use.alt.split('').map(asSeq));
                applied.push({ i: i, ref: use.ref, alt: use.alt, sub: isSubNow, v: own[n].v });
                if (isSubNow) out.appliedAlleles++; else out.appliedIndels = (out.appliedIndels || 0) + 1;
            }
            seq = chars.join('');
            // Left to right now, accumulating the shift each earlier indel caused, to give each
            // applied variant its position in the sequence that came out -- and the SPAN a
            // candidate has to cover whole to tell the two alleles apart:
            //   substitution  the changed base(s)
            //   insertion     every inserted base
            //   deletion      the two bases that now sit either side of the join
            applied.sort((a, b) => a.i - b.i);
            let shift = 0;
            for (const a of applied) {
                const at = a.i + shift;
                let span;
                if (a.alt.length > a.ref.length) span = [at + a.ref.length, at + a.alt.length];
                else if (a.alt.length < a.ref.length) span = [at + a.alt.length - 1, at + a.alt.length + 1];
                else span = [at, at + a.ref.length];
                span[0] = Math.max(0, Math.min(seq.length - 1, span[0]));
                span[1] = Math.max(span[0] + 1, Math.min(seq.length, span[1]));
                out.mutations.push({
                    pos: at, span: span, type: (a.sub ? 'snp' : (a.alt.length > a.ref.length ? 'ins' : 'del')),
                    ref: a.ref, alt: a.alt,
                    label: ('' + (a.v.name || a.v.id || (a.ref + '>' + a.alt))),
                    selected: !!(a.v.highlight || (a.v.isSelected && a.v.isSelected())),
                });
                shift += a.alt.length - a.ref.length;
            }
            // What the other half of this module has to know: every reference index at or after
            // `from` moved by `by`. Used to carry the other tracks' exclusions across.
            out.shifts = applied.map((a) => ({ from: a.i, by: a.alt.length - a.ref.length }))
                .filter((x) => x.by !== 0);
        } else {
            // No alleles applied, so reference coordinates ARE the designed coordinates.
            for (const { v, f, i } of own) {
                const sub = isSub(f);
                let span;
                if (f.alt.length > f.ref.length) span = [i, i + Math.max(1, f.ref.length)];
                else if (f.alt.length < f.ref.length) span = [i, i + f.ref.length];
                else span = [i, i + Math.max(1, f.ref.length)];
                span[1] = Math.max(span[0] + 1, Math.min(seq0.length, span[1]));
                out.mutations.push({
                    pos: i, span: span, type: (sub ? 'snp' : (f.alt.length > f.ref.length ? 'ins' : 'del')),
                    ref: f.ref, alt: f.alt, label: ('' + (v.name || v.id || (f.ref + '>' + f.alt))),
                    selected: !!(v.highlight || (v.isSelected && v.isSelected())),
                });
            }
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
                if (!C.sameChromosome(u, track)) continue;     // cannot overlap
                let used = 0;
                for (const s of (u.snpindels || [])) {
                    const f = footprint(s);
                    if (!f) continue;
                    const gp = genomicOf(u, f.x);
                    if (gp == null) continue;
                    const lx = localOf(track, u.chr || track.chr, gp);
                    if (lx == null) continue;
                    const i = Math.round(lx) - baseOf(track);
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
            + (out.appliedIndels ? (', ' + out.appliedIndels + ' indel' + (out.appliedIndels === 1 ? '' : 's') + ' applied') : '')
            + (out.skippedIndels ? (', ' + out.skippedIndels + ' indel' + (out.skippedIndels === 1 ? '' : 's') + ' left out and designed around') : '')
            // Silence here is what made a dropped variant hard to explain: say it.
            + (out.mismatched ? (', ' + out.mismatched + ' variant' + (out.mismatched === 1 ? '' : 's')
                + ' skipped — their reference allele does not match the track sequence there') : ''));
        if (o.avoidOthers) bits.push(out.excludedVariants
            ? (out.excludedVariants + ' variant' + (out.excludedVariants === 1 ? '' : 's') + ' on ' + out.otherTracks
                + ' other track' + (out.otherTracks === 1 ? '' : 's') + ' avoided')
            : 'no variants on the other tracks fall in this range');
        if (blocked) bits.push(blocked + ' of ' + seq.length + ' bases withheld');
        out.note = bits.join(' · ');
        return out;
    })();
}

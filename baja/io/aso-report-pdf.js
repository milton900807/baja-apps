return (async () => {

    // THE DETAILED ASO REPORT, drawn rather than tabulated.
    //
    //   const R = await exec('baja/io/aso-report-pdf.js');
    //   await R.download({ graph, entries: [{ track, oligo, row }, …],
    //                      filename: 'design_ASO_report.pdf', title: '…', subtitle: '…' });
    //
    // `row` is the flat field set the download hub already builds for the table formats
    // (id, sequences, chemistry, off-target summary, mismatches, annotations, coordinates),
    // so the PDF and the CSV of the same design say the same things in the same words.
    //
    // What the table could not show, and the reason this exists: WHERE on the transcript
    // each compound sits. Every section carries a map of the track, broken into rows so a
    // 100 kb pre-mRNA fits on a page, with the oligos drawn in place along it.
    //
    // THE ENDS OF THAT MAP ARE LABELLED 5' AND 3' -- the TRANSCRIPT's ends, not the page's.
    // A minus-strand gene reads right to left across a map laid out in ascending genomic
    // coordinate, so the left end of the picture is its 3' end. Getting that backwards
    // would silently mirror every position in the report, so the orientation is worked out
    // from the track (its annotations' strand, by way of baja/bio/track-strand.js) and from
    // which way the genomic coordinate actually runs, and both ends say which is which
    // along with the genomic coordinate they stand at.

    const P = await exec('baja/io/pdf-writer.js');
    let COORD = null, STRAND = null;
    try { COORD = await exec('baja/bio/track-coords.js'); } catch (e) { }
    try { STRAND = await exec('baja/bio/track-strand.js'); } catch (e) { }

    // ---- palette (print-safe: mid greys and one accent, no light-on-light) -------------
    const INK = [0.07, 0.09, 0.12];
    const MUTED = [0.42, 0.47, 0.53];
    const RULE = [0.78, 0.81, 0.85];
    const BAR = [0.87, 0.89, 0.92];      // the track body
    const EXON = [0.55, 0.60, 0.66];     // exons on it
    const OLIGO = [0.11, 0.42, 0.62];    // every compound on the overview map
    const THIS_ONE = [0.80, 0.35, 0.05];  // the compound a detail page is about
    const OTHER = [0.62, 0.66, 0.71];     // its neighbours, there for context only
    const VAR = [0.72, 0.13, 0.13];       // a variant, and the base of a compound over it

    const str = (v) => ('' + (v == null ? '' : v));
    const nOf = (v) => { const n = +v; return isFinite(n) ? n : null; };
    const commas = (v) => { const n = nOf(v); return n == null ? '' : Math.round(n).toLocaleString(); };

    // The gene's strand, and therefore which end of the drawing is the transcript's 5'.
    const geneStrandOf = (t) => {
        try { if (STRAND && STRAND.geneStrand) return STRAND.geneStrand(t); } catch (e) { }
        return (+((t && t.strand) || 0) < 0) ? -1 : 1;
    };
    // TRACK X -> GENOMIC COORDINATE, for the whole track and not only inside an exon.
    //
    // baja/bio/track-coords.js answers for a position that falls IN an exon and otherwise
    // falls back to the track's own origin, which on a spliced track is a different number
    // in a different space. A map labels its row boundaries and its two ends, and those
    // land wherever the rows happen to divide -- in an intron, past the last exon -- so
    // taking that fallback mixed two coordinate systems in one picture and, at the ends,
    // reversed which way the track appeared to run. (That is what decides whether 5' is
    // drawn at the left, so it was not a cosmetic error.)
    //
    // Instead the exon boundaries are used as ANCHORS (track x <-> genomic, as the loader
    // recorded them): between two anchors interpolate, past the outermost ones extend the
    // nearest segment's slope. A track with no exons but a chromosome is a plain genomic
    // window, where the origin IS the mapping. A track with neither cannot say, and says so
    // rather than printing its own x as though it were a genomic coordinate.
    const mapperFor = (t) => {
        const anchors = [];
        try {
            for (const a of ((t && t.getExons) ? (t.getExons() || []) : [])) {
                const xi = nOf(a.xi), xf = nOf(a.xf), gi = nOf(a.gxi), gf = nOf(a.gxf);
                if (xi == null || xf == null || gi == null || gf == null) continue;
                anchors.push({ x: xi, g: gi }, { x: xf, g: gf });
            }
        } catch (e) { }
        anchors.sort((a, b) => a.x - b.x);
        // Drop anchors that repeat an x (a zero-length exon) -- they carry no slope.
        const pts = [];
        for (const a of anchors) { if (!pts.length || a.x > pts[pts.length - 1].x) pts.push(a); }
        if (pts.length >= 2) {
            return (x) => {
                const v = nOf(x); if (v == null) return null;
                if (v <= pts[0].x) {
                    const p = pts[0], q = pts[1];
                    return p.g + (v - p.x) * (q.g - p.g) / (q.x - p.x);
                }
                for (let i = 1; i < pts.length; i++) {
                    if (v <= pts[i].x) {
                        const p = pts[i - 1], q = pts[i];
                        return p.g + (v - p.x) * (q.g - p.g) / (q.x - p.x);
                    }
                }
                const p = pts[pts.length - 2], q = pts[pts.length - 1];
                return q.g + (v - q.x) * (q.g - p.g) / (q.x - p.x);
            };
        }
        const base = nOf(t && t.xi);
        const hasChrom = !!(t && t.chr != null && str(t.chr) !== '');
        if (pts.length === 1) { const p = pts[0]; return (x) => { const v = nOf(x); return v == null ? null : p.g + (v - p.x); }; }
        if (hasChrom && base != null) return (x) => { const v = nOf(x); return v == null ? null : base + v; };
        return () => null;   // nothing to say: the map falls back to track positions
    };
    // Kept for callers that only want one position; builds the mapper each time.
    const genomicAt = (t, x) => mapperFor(t)(x);
    const chromOf = (t) => {
        const c = t && t.chr;
        return (c == null || c === '') ? '' : ('chr' + str(c).replace(/^chr/i, ''));
    };
    // The track's own extent, and the compounds on it in left-to-right order.
    const spanOf = (t) => {
        let lo = nOf(t && t.xi), hi = nOf(t && t.xf);
        if (lo == null || hi == null || lo === hi) {
            // No usable extent on the track itself: take the compounds' own span, padded.
            const xs = [];
            for (const o of ((t && t.oligos) || [])) { const a = nOf(o.xi), b = nOf(o.xf); if (a != null) xs.push(a); if (b != null) xs.push(b); }
            if (!xs.length) return null;
            lo = Math.min.apply(null, xs); hi = Math.max.apply(null, xs);
            const pad = Math.max(10, (hi - lo) * 0.05);
            lo -= pad; hi += pad;
        }
        const a = Math.min(lo, hi), b = Math.max(lo, hi);
        return (b > a) ? { lo: a, hi: b } : { lo: a, hi: a + 1 };
    };
    const oligoSpan = (o) => {
        const a = nOf(o && o.xi), b = nOf(o && o.xf);
        if (a == null && b == null) return null;
        const lo = Math.min(a == null ? b : a, b == null ? a : b);
        const hi = Math.max(a == null ? b : a, b == null ? a : b);
        return { lo: lo, hi: hi + 1 };   // xf is inclusive; a map wants a half-open span
    };
    const labelOf = (o) => str((o && (o.name != null && o.name !== '' ? o.name : o.id)) || '');

    // Break a string into lines that fit a width: on spaces, and on width alone for a run
    // with no spaces in it (a sequence). Shared so a wrapped field, a paragraph and a note
    // under a panel all break the same way.
    const wrapLines = (d, text, size, width, maxLines) => {
        const lines = [];
        let rest = str(text);
        const cap = maxLines || 16;
        while (rest.length) {
            if (d.width(rest, size) <= width) { lines.push(rest); break; }
            let cut = rest.length;
            while (cut > 1 && d.width(rest.slice(0, cut), size) > width) cut--;
            let brk = rest.lastIndexOf(' ', cut);
            if (brk < cut * 0.6) brk = cut;          // no sensible space: break on width
            lines.push(rest.slice(0, brk));
            rest = rest.slice(brk).replace(/^ /, '');
            if (lines.length >= cap) { lines.push('\u2026'); break; }
        }
        return lines;
    };

    // WHICH WAY THE TRACK RUNS, in one place: the genomic mapper, whether the genomic
    // coordinate ascends left to right, and therefore which end of a drawing is the
    // transcript's 5'. Everything that labels an end or counts a position within a compound
    // asks this, so a map, a zoom panel and a position in a field can never disagree.
    const orientOf = (t) => {
        const gOf = mapperFor(t);
        const sp = spanOf(t) || { lo: 0, hi: 1 };
        const gLo = gOf(sp.lo), gHi = gOf(sp.hi);
        const known = (gLo != null && gHi != null);
        const ascending = !(known && gHi < gLo);
        const strand = geneStrandOf(t);
        return {
            gOf: gOf, sp: sp, gLo: gLo, gHi: gHi, known: known, ascending: ascending,
            strand: strand, leftIs5: (strand > 0) === ascending, chrom: chromOf(t)
        };
    };

    // ---- variants, and where compounds pile up on them --------------------------------
    //
    // A track carries its variants in `snpindels` (flexigraph/snpindel.js), in the same
    // coordinate space as the oligos. Some tracks instead carry them as annotations typed
    // SNP, so both are read. Spans are half-open, as oligoSpan's are: a SNP is one base.
    const variantsOf = (t) => {
        const out = [];
        for (const v of ((t && t.snpindels) || [])) {
            const lo = nOf(v && v.xi); if (lo == null) continue;
            const hi = nOf(v && v.xf);
            out.push({ lo: lo, hi: (hi != null && hi > lo) ? hi : lo + 1, v: v });
        }
        for (const a of ((t && t.annotations) || [])) {
            const ty = str(a && a.type).toLowerCase();
            if (!/^(snp|snv|variant|mutation)s?$/.test(ty)) continue;
            const lo = nOf(a && a.xi); if (lo == null) continue;
            const hi = nOf(a && a.xf);
            out.push({ lo: lo, hi: (hi != null && hi > lo) ? hi : lo + 1, v: a });
        }
        out.sort((p, q) => p.lo - q.lo);
        return out;
    };
    const alleleOf = (v) => {
        const r = str(v && (v.reference != null ? v.reference : v.reference0));
        const a = str(v && (v.alternate != null ? v.alternate : v.alternate0));
        return (r || a) ? ((r || '?') + '>' + (a || '?')) : '';
    };
    // SnpIndel invents an id from a timestamp when it has none; that is not a name to print.
    const variantName = (v) => {
        const n = str(v && v.name);
        if (n) return n;
        const id = str(v && v.id);
        return /^\d{9,}_/.test(id) ? '' : id;
    };
    const variantLabel = (v) => [variantName(v), alleleOf(v), str(v && v.clinsig)].filter(Boolean).join('  ');

    // WHERE A VARIANT FALLS INSIDE A COMPOUND.
    //
    // Counted 5'->3' along the TRANSCRIPT for the target site, which is right to left on the
    // page for a minus-strand gene -- the same orientation the maps are labelled with.
    //
    // An antisense compound runs the other way again, so position 7 of 20 in the target site
    // is position 14 of 20 in the ASO, and that is the number that says whether a mismatch
    // sits in the gap or a wing. The ASO position is only reported when the synthesis
    // sequence really is the reverse complement of the target site, rather than assumed from
    // the compound's type: a sense strand, a duplex entered the other way round, or a
    // sequence that does not match would otherwise be reported backwards.
    const BASES = (x) => str(x).toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
    const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
    const revComp = (x) => BASES(x).split('').reverse().map((c) => COMP[c] || 'N').join('');
    const isAntisenseTo = (target, synth) => {
        const a = BASES(target), b = BASES(synth);
        return (a.length >= 8 && a.length === b.length && revComp(a) === b);
    };
    // '5-10-5' and friends, but only when the three parts add up to the compound's length.
    const gapmerRegion = (structure, len, asoPos) => {
        const m = /(\d+)\s*[^\d]+\s*(\d+)\s*[^\d]+\s*(\d+)/.exec(str(structure));
        if (!m) return '';
        const a = +m[1], b = +m[2], c = +m[3];
        if (!(a > 0 && b > 0 && c > 0) || (a + b + c) !== len) return '';
        if (asoPos <= a) return "5' wing";
        if (asoPos <= a + b) return 'gap';
        return "3' wing";
    };
    const siteFacts = (o, row, vr, or) => {
        const sp = oligoSpan(o);
        if (!sp) return null;
        const len = sp.hi - sp.lo;
        let pos = or.leftIs5 ? (vr.lo - sp.lo + 1) : (sp.hi - vr.hi + 1);
        pos = Math.max(1, Math.min(len, Math.round(pos)));
        const anti = isAntisenseTo((row && row.target_sequence) || o.sequence, (row && row.synthesis_sequence) || o.synthesisSequence);
        const asoPos = anti ? (len - pos + 1) : null;
        const region = (asoPos != null) ? gapmerRegion((row && row.chemistry) || o.structure, len, asoPos) : '';
        return { len: len, pos: pos, asoPos: asoPos, region: region };
    };
    const siteText = (f) => {
        if (!f) return '';
        let out = 'target position ' + f.pos + ' of ' + f.len;
        if (f.asoPos != null) out += ', ASO position ' + f.asoPos + (f.region ? (' (' + f.region + ')') : '');
        return out;
    };
    const siteShort = (f) => {
        if (!f) return '';
        return 't' + f.pos + '/' + f.len + (f.asoPos != null ? (' \u00b7 ASO ' + f.asoPos + (f.region ? (' ' + f.region) : '')) : '');
    };

    // Variants that two or more compounds sit over, gathered into windows: neighbouring
    // variants whose covering compounds overlap belong in one picture, not three nearly
    // identical ones.
    const pileupsOf = (t, entries, minCount) => {
        const want = minCount || 2;
        const vars = variantsOf(t);
        const singles = [];
        if (!vars.length) return { groups: [], singles: singles, variants: 0 };
        const spans = entries.map((e) => ({ e: e, s: oligoSpan(e.oligo) })).filter((x) => x.s);
        const groups = [];
        for (const vr of vars) {
            const cover = spans.filter((x) => vr.lo < x.s.hi && vr.hi > x.s.lo);
            if (cover.length < want) { if (cover.length) singles.push(vr); continue; }
            let lo = vr.lo, hi = vr.hi;
            for (const c of cover) { lo = Math.min(lo, c.s.lo); hi = Math.max(hi, c.s.hi); }
            const last = groups[groups.length - 1];
            if (last && lo <= last.hi) {
                last.lo = Math.min(last.lo, lo); last.hi = Math.max(last.hi, hi);
                last.hits.push({ vr: vr, cover: cover });
            } else groups.push({ lo: lo, hi: hi, hits: [{ vr: vr, cover: cover }] });
        }
        return { groups: groups, singles: singles, variants: vars.length };
    };

    // ---- the map ---------------------------------------------------------------------
    //
    // The track span broken into equal rows, each row a bar across the text width with the
    // compounds that fall in it drawn above. Returns the y it finished at.
    //
    //   d        the page builder
    //   t        the track
    //   marks    [{ lo, hi, label, rgb }] in TRACK coordinates
    //   y        the top of the map
    //   opts     { rows, title, compact }
    const drawMap = (d, t, marks, y, opts) => {
        const o = opts || {};
        const X0 = d.M, X1 = d.W - d.M, WIDTH = X1 - X0;
        const sp = spanOf(t);
        if (!sp) { d.text(X0, y, 'This track carries no coordinates, so it cannot be mapped.', { size: 8.5, rgb: MUTED }); return y - 14; }
        const span = sp.hi - sp.lo;

        // How many rows to break it into: enough that a row covers a readable slice, and
        // never so many that one map runs for pages. A long pre-mRNA gets coarser rows
        // rather than more of them.
        const rows = Math.max(1, Math.min(o.rows || 12, Math.max(1, Math.ceil(span / 600))));
        const perRow = span / rows;
        const BAR_H = 7, LANE_H = 7.5, COORD_H = 9, GAP = 5;
        const LANES = o.compact ? 1 : 3;         // how many levels compounds may stack into

        // Which end of the picture is the transcript's 5' end.
        const or = orientOf(t);
        const gOf = or.gOf, known = or.known, ascending = or.ascending, leftIs5 = or.leftIs5, chrom = or.chrom;
        const gLo = gOf(sp.lo), gHi = gOf(sp.hi);
        // Genomic where the track knows it, the track's own position where it does not --
        // never one labelled as the other.
        const atEnd = (g, x) => known ? ((chrom ? (chrom + ':') : '') + commas(g))
            : ('track position ' + commas(x));

        const heading = (cont) => {
            if (o.title) { d.text(X0, y, o.title + (cont ? ' (continued)' : ''), { size: 9.5, bold: true, rgb: INK, max: WIDTH }); y -= 12; }
            if (!o.compact && !cont) {
                d.text(X0, y, (!known ? 'Laid out left to right along the track (it carries no genomic coordinates)'
                    : ascending ? 'Laid out left to right in ascending genomic coordinate'
                        : 'Laid out left to right in descending genomic coordinate')
                    + ', ' + Math.round(perRow).toLocaleString() + ' nt per row'
                    + ' \u00b7 ' + (leftIs5 ? "transcript 5' is at the left" : "transcript 5' is at the right")
                    + ' (' + (or.strand < 0 ? 'minus' : 'plus') + '-strand gene)',
                    { size: 7.5, rgb: MUTED, max: WIDTH });
                y -= 12;
            }
        };
        // A map longer than the page continues on the next one, under its own heading, so a
        // row is never half drawn at the bottom edge.
        const ensure = (h) => { if (y - h < d.M + 26) { d.page(); y = d.H - d.M; heading(true); } };

        // Exons, to give the bar some structure to read positions against.
        let exons = [];
        try {
            exons = (t.getExons ? (t.getExons() || []) : []).map((a) => {
                const lo = Math.min(nOf(a.xi), nOf(a.xf)), hi = Math.max(nOf(a.xi), nOf(a.xf));
                return (isFinite(lo) && isFinite(hi)) ? { lo: lo, hi: hi } : null;
            }).filter(Boolean);
        } catch (e) { exons = []; }

        heading(false);
        for (let r = 0; r < rows; r++) {
            const rLo = sp.lo + r * perRow, rHi = (r === rows - 1) ? sp.hi : (sp.lo + (r + 1) * perRow);
            const toX = (v) => X0 + ((Math.min(Math.max(v, rLo), rHi) - rLo) / (rHi - rLo)) * WIDTH;

            // Place this row's compounds into lanes FIRST: the row is only as tall as the
            // lanes it actually uses, which is one of them on nearly every row.
            const placed = [];
            const laneEnd = new Array(LANES).fill(-Infinity);
            let lanesUsed = 0;
            for (const m of marks.filter((m2) => m2.hi >= rLo && m2.lo <= rHi)) {
                const a = toX(m.lo), b = toX(m.hi);
                const w = Math.max(1.6, b - a);   // a 20mer on a 7 kb row is still a visible tick
                // The first lane with room; if every lane is taken -- a tiling design, where
                // the compounds genuinely do overlap -- the emptiest one, and no label. Two
                // names written over each other are worse than none: the detail pages carry
                // the full list either way, so a crowded row loses labels, never compounds.
                let lane = -1;
                for (let i = 0; i < LANES; i++) { if (a > laneEnd[i] + 2) { lane = i; break; } }
                const crowded = (lane < 0);
                if (crowded) { lane = 0; for (let i = 1; i < LANES; i++) { if (laneEnd[i] < laneEnd[lane]) lane = i; } }
                let end = a + w;
                let label = '';
                if (m.label && !o.compact && !crowded) {
                    const tw = d.width(m.label, 5.5);
                    if (a + w + 2 + tw < X1) { label = m.label; end = a + w + 2 + tw; }
                }
                laneEnd[lane] = end;
                lanesUsed = Math.max(lanesUsed, lane + 1);
                placed.push({ x: a, w: w, lane: lane, label: label, crowded: crowded, rgb: m.rgb || OLIGO });
            }
            // One compound without room is enough to drop the names for the WHOLE row: a
            // later bar in the same lane is drawn over an earlier one's label, so a row that
            // keeps some names ends up showing half-covered ones. Bars only is honest.
            if (placed.some((m) => m.crowded)) { for (const m of placed) m.label = ''; }

            ensure(COORD_H + BAR_H + lanesUsed * LANE_H + GAP);
            const barY = y - (lanesUsed * LANE_H) - BAR_H;

            d.rect(X0, barY, WIDTH, BAR_H, { fill: BAR });
            for (const e of exons) {
                if (e.hi < rLo || e.lo > rHi) continue;
                const a = toX(e.lo), b = toX(e.hi);
                d.rect(a, barY, Math.max(0.8, b - a), BAR_H, { fill: EXON });
            }
            d.rect(X0, barY, WIDTH, BAR_H, { stroke: RULE, lw: 0.4 });

            for (const m of placed) {
                const ly = barY + BAR_H + 2 + m.lane * LANE_H;
                d.rect(m.x, ly, m.w, 5, { fill: m.rgb });
                if (m.label) d.text(m.x + m.w + 2, ly + 0.6, m.label, { size: 5.5, rgb: MUTED });
            }

            // Where this row starts and ends: in the genome when the track knows, else on
            // the track itself.
            const gA = gOf(rLo), gB = gOf(rHi);
            d.text(X0, barY - 8, commas(gA == null ? rLo : gA), { size: 6.5, rgb: MUTED });
            d.text(X1, barY - 8, commas(gB == null ? rHi : gB), { size: 6.5, rgb: MUTED, align: 'right' });

            // 5' and 3', on the outer ends of the whole map.
            if (r === 0) d.text(X0 - 4, barY + 1, leftIs5 ? "5'" : "3'", { size: 9, bold: true, rgb: INK, align: 'right' });
            if (r === rows - 1) d.text(X1 + 4, barY + 1, leftIs5 ? "3'" : "5'", { size: 9, bold: true, rgb: INK });

            y = barY - COORD_H - GAP;
        }

        // The two ends spelled out underneath, with their genomic coordinates, so the report
        // reads correctly in black and white and when the marks are small. Clear of the last
        // row's own coordinate line, which sits just above this.
        y -= 7;
        ensure(16);
        d.text(X0, y, (leftIs5 ? "5' end " : "3' end ") + atEnd(gLo, sp.lo)
            + '      ' + (leftIs5 ? "3' end " : "5' end ") + atEnd(gHi, sp.hi),
            { size: 7.5, rgb: MUTED, max: WIDTH });
        return y - 10;
    };

    // ---- a zoomed snapshot of one pileup ----------------------------------------------
    //
    // The design map is drawn at thousands of bases to the inch, where a 20mer is a tick and
    // a SNP is nothing at all. Where compounds pile up on a variant, that window is drawn
    // again at base resolution: the compounds one per row with the variant marked inside
    // each of them, the reference sequence when the window is short enough to letter, and
    // the same 5'/3' labelling as the maps.
    //
    // Returns the y it finished at. The caller breaks the page; a panel is never split.
    const drawZoom = (d, t, g, y, or) => {
        const X0 = d.M, X1 = d.W - d.M;
        const GUT = 118;                        // the compound names live to the left of the panel
        const PX0 = X0 + GUT, PW = X1 - PX0 - 10;
        const pad = Math.max(3, Math.round((g.hi - g.lo) * 0.08));
        const lo = g.lo - pad, hi = g.hi + pad, span = Math.max(1, hi - lo);
        const toX = (v) => PX0 + ((v - lo) / span) * PW;
        const ROW_H = 10, MAX_ROWS = 14;

        // Everything that covers any variant in this window, once each, left to right.
        const cover = [];
        for (const h of g.hits) for (const c of h.cover) { if (!cover.some((x) => x.e === c.e)) cover.push(c); }
        cover.sort((a, b) => (a.s.lo - b.s.lo) || (a.s.hi - b.s.hi));
        const shown = cover.slice(0, MAX_ROWS);

        // Title: the variants themselves, which is what the panel is about.
        const coordOf = (x) => { const gx = or.gOf(x); return (gx == null) ? ('track ' + commas(x)) : ((or.chrom ? or.chrom + ':' : '') + commas(gx)); };
        const first = g.hits[0].vr;
        const title = (g.hits.length === 1)
            ? (coordOf(first.lo) + '   ' + (variantLabel(first.v) || 'variant'))
            : (g.hits.length + ' variants   ' + coordOf(g.lo) + ' – ' + coordOf(g.hi));
        d.text(X0, y, title, { size: 9.5, bold: true, rgb: INK, max: X1 - X0 - 90 });
        d.text(X1, y, cover.length + ' compound' + (cover.length === 1 ? '' : 's'), { size: 8.5, rgb: VAR, align: 'right' });
        y -= 12;
        if (g.hits.length > 1) {
            for (const h of g.hits) {
                d.text(X0, y, '· ' + coordOf(h.vr.lo) + '  ' + (variantLabel(h.vr.v) || 'variant')
                    + '  ·  ' + h.cover.length + ' compound' + (h.cover.length === 1 ? '' : 's'),
                    { size: 7.5, rgb: MUTED, max: X1 - X0 });
                y -= 9.5;
            }
            y -= 2;
        }

        // The reference sequence, when the window is short enough for the letters to be read.
        const seq = str(t && t.sequence);
        const base0 = nOf(t && t.xi);
        const perBase = PW / span;
        const lettered = (seq && base0 != null && span <= 80 && perBase >= 4.6);
        if (lettered) {
            for (let x = Math.ceil(lo); x < hi; x++) {
                const i = Math.floor(x - base0);
                if (i < 0 || i >= seq.length) continue;
                const onVar = g.hits.some((h) => x >= h.vr.lo && x < h.vr.hi);
                const cx = toX(x + 0.5);
                if (onVar) d.rect(toX(x), y - 1.5, Math.max(1, perBase), 9, { fill: [0.97, 0.88, 0.88] });
                d.text(cx, y, seq[i], { size: Math.min(7.5, perBase * 1.25), rgb: onVar ? VAR : MUTED, align: 'center' });
            }
            y -= 12;
        }

        // The variants: a line down through every row, so a compound's own mark lines up
        // with the variant it belongs to even when the rows are tight.
        const topY = y + 2;
        const botY = y - shown.length * ROW_H - 2;
        for (const h of g.hits) {
            const cx = toX((h.vr.lo + h.vr.hi) / 2);
            d.line(cx, topY, cx, botY, { lw: 0.5, rgb: [0.85, 0.65, 0.65] });
        }

        // One row per compound: its bar, the variant base picked out inside it, its name and
        // where the variant falls within it.
        for (const c of shown) {
            const ry = y - ROW_H + 2;
            const a = toX(c.s.lo), b = toX(c.s.hi);
            d.rect(a, ry, Math.max(1.5, b - a), 6, { fill: OLIGO });
            for (const h of g.hits) {
                if (!(h.vr.lo < c.s.hi && h.vr.hi > c.s.lo)) continue;
                const va = toX(Math.max(h.vr.lo, c.s.lo)), vb = toX(Math.min(h.vr.hi, c.s.hi));
                d.rect(va, ry, Math.max(1.5, vb - va), 6, { fill: VAR });
            }
            d.text(X0, ry + 1, labelOf(c.e.oligo), { size: 7, rgb: INK, max: GUT - 46 });
            // The covering variant nearest the start of the compound decides the position
            // shown here; a compound over two of them is spelled out under the panel.
            const mine = g.hits.filter((h) => h.vr.lo < c.s.hi && h.vr.hi > c.s.lo);
            if (mine.length === 1) {
                const f = siteFacts(c.e.oligo, c.e.row, mine[0].vr, or);
                d.text(PX0 - 6, ry + 1, siteShort(f), { size: 6, rgb: MUTED, align: 'right' });
            } else if (mine.length > 1) {
                d.text(PX0 - 6, ry + 1, mine.length + ' variants', { size: 6, rgb: MUTED, align: 'right' });
            }
            y -= ROW_H;
        }
        if (cover.length > shown.length) {
            d.text(PX0, y, '+ ' + (cover.length - shown.length) + ' more compound(s) over this window', { size: 6.5, rgb: MUTED });
            y -= 9;
        }

        // The axis, with the window's ends in genomic coordinates and the transcript's
        // direction marked the same way the maps mark it.
        y -= 2;
        d.line(PX0, y, PX0 + PW, y, { lw: 0.5, rgb: RULE });
        d.text(PX0, y - 8, coordOf(lo), { size: 6.5, rgb: MUTED });
        d.text(PX0 + PW, y - 8, coordOf(hi), { size: 6.5, rgb: MUTED, align: 'right' });
        d.text(PX0 - 4, y - 8, or.leftIs5 ? "5'" : "3'", { size: 7.5, bold: true, rgb: INK, align: 'right' });
        d.text(PX0 + PW + 4, y - 8, or.leftIs5 ? "3'" : "5'", { size: 7.5, bold: true, rgb: INK });
        y -= 18;

        // A compound over more than one variant in the window gets its positions in words:
        // the row above it has no space for them, and this is the detail the panel is for.
        for (const c of shown) {
            const mine = g.hits.filter((h) => h.vr.lo < c.s.hi && h.vr.hi > c.s.lo);
            if (mine.length < 2) continue;
            // Named, not re-described: the allele and significance are in the list above.
            const parts = mine.map((h) => (variantName(h.vr.v) || coordOf(h.vr.lo)) + ' ' + siteText(siteFacts(c.e.oligo, c.e.row, h.vr, or)));
            const txt = labelOf(c.e.oligo) + ': ' + parts.join('; ');
            for (const ln of wrapLines(d, txt, 6.5, X1 - X0, 3)) { d.text(X0, y, ln, { size: 6.5, rgb: MUTED }); y -= 8.5; }
        }
        return y;
    };
    // How tall that panel will be, so the caller can keep it off a page edge.
    const zoomHeight = (d, t, g) => {
        const cover = [];
        for (const h of g.hits) for (const c of h.cover) { if (!cover.some((x) => x.e === c.e)) cover.push(c); }
        const rows = Math.min(cover.length, 14);
        const multi = cover.filter((c) => g.hits.filter((h) => h.vr.lo < c.s.hi && h.vr.hi > c.s.lo).length > 1).length;
        return 12 + (g.hits.length > 1 ? (g.hits.length * 9.5 + 2) : 0) + 12 + rows * 10
            + (cover.length > rows ? 9 : 0) + 20 + Math.min(multi, rows) * 9 + 10;
    };

    // ---- the report ------------------------------------------------------------------
    const build = (spec) => {
        const o = spec || {};
        const entries = (o.entries || []).filter((e) => e && e.oligo);
        const d = P.doc();
        const X0 = d.M, X1 = d.W - d.M, WIDTH = X1 - X0;
        let y = d.H - d.M;

        const rule = (yy, g) => d.line(X0, yy, X1, yy, { lw: 0.6, rgb: g || RULE });
        const need = (h) => { if (y - h < d.M + 20) { d.page(); y = d.H - d.M; return true; } return false; };
        // Wrapped running text, rather than a single clipped line.
        const para = (text, size, rgb) => {
            const sz = size || 8.5;
            for (const ln of wrapLines(d, text, sz, WIDTH, 8)) { need(sz + 4); d.text(X0, y, ln, { size: sz, rgb: rgb || MUTED }); y -= sz + 3; }
        };
        // A key and its value, wrapped onto further lines when the value is long.
        const field = (k, v, opts) => {
            const s = opts || {};
            const KEY_W = 112, valX = X0 + KEY_W, valW = WIDTH - KEY_W;
            const size = s.size || 8.5;
            const text = str(v);
            if (text === '') return;
            const lines = wrapLines(d, text, size, valW, 14);
            need(lines.length * (size + 2.5) + 2);
            d.text(X0, y, k, { size: size, rgb: MUTED });
            for (const ln of lines) {
                d.text(valX, y, ln, { size: size, bold: !!s.bold, rgb: s.rgb || INK, max: valW });
                y -= size + 2.5;
            }
            y -= 1.5;
        };

        // ---- cover: what this is, and every compound on every track it came from --------
        d.text(X0, y, o.title || 'ASO report', { size: 17, bold: true, rgb: INK }); y -= 18;
        if (o.subtitle) { d.text(X0, y, o.subtitle, { size: 9, rgb: MUTED, max: WIDTH }); y -= 13; }
        rule(y, [0.2, 0.2, 0.2]); y -= 16;

        // The tracks that actually carry the reported compounds, in the order they appear.
        const byTrack = [];
        for (const e of entries) {
            let g = byTrack.find((x) => x.track === e.track);
            if (!g) { g = { track: e.track, entries: [] }; byTrack.push(g); }
            g.entries.push(e);
        }

        d.text(X0, y, 'Design map', { size: 11, bold: true, rgb: INK }); y -= 13;
        para(entries.length + ' compound' + (entries.length === 1 ? '' : 's') + ' on '
            + byTrack.length + ' track' + (byTrack.length === 1 ? '' : 's')
            + ". Each map is broken into rows to fit the page; the transcript's 5' and 3' ends are marked.");
        y -= 8;

        for (const g of byTrack) {
            const t = g.track;
            const marks = g.entries.map((e) => {
                const s = oligoSpan(e.oligo);
                return s ? { lo: s.lo, hi: s.hi, label: labelOf(e.oligo), rgb: OLIGO } : null;
            }).filter(Boolean);
            need(150);
            const title = str(t && t.name) || 'track';
            const sub = [str(t && (t.geneID || t.geneSymbol || '')), chromOf(t), g.entries.length + ' compound' + (g.entries.length === 1 ? '' : 's')].filter(Boolean).join('  ·  ');
            y = drawMap(d, t, marks, y, { title: title + (sub ? ('   ' + sub) : '') });
            y -= 14;
        }

        // ---- where compounds pile up on a variant ---------------------------------------
        //
        // Only drawn when the tracks actually carry variants. A design over a track with no
        // variants loaded says nothing here rather than printing an empty heading.
        const piles = [];
        let variantsSeen = 0, singlesSeen = 0;
        for (const grp of byTrack) {
            const pu = pileupsOf(grp.track, grp.entries, 2);
            variantsSeen += pu.variants;
            singlesSeen += pu.singles.length;
            for (const gg of pu.groups) piles.push({ track: grp.track, g: gg });
        }
        if (variantsSeen) {
            need(70);
            y -= 6;
            d.text(X0, y, 'Variant pileups', { size: 11, bold: true, rgb: INK }); y -= 13;
            if (piles.length) {
                para(piles.length + ' window' + (piles.length === 1 ? '' : 's')
                    + ' where two or more compounds cover the same variant, each drawn at base resolution'
                    + (singlesSeen ? ('. A further ' + singlesSeen + ' variant' + (singlesSeen === 1 ? ' is' : 's are') + ' covered by one compound only, listed on that compound’s page.') : '.'));
            } else {
                para('No variant on these tracks is covered by more than one compound'
                    + (singlesSeen ? ('; ' + singlesSeen + ' ' + (singlesSeen === 1 ? 'is covered by one' : 'are covered by a single') + ' compound, listed on that compound’s page.') : '.'));
            }
            y -= 8;
            let lastTrack = null;
            for (const pl of piles) {
                const h = zoomHeight(d, pl.track, pl.g) + (pl.track !== lastTrack && byTrack.length > 1 ? 12 : 0);
                if (y - h < d.M + 20) { d.page(); y = d.H - d.M; lastTrack = null; }
                if (byTrack.length > 1 && pl.track !== lastTrack) {
                    d.text(X0, y, str(pl.track && pl.track.name) || 'track', { size: 8.5, bold: true, rgb: MUTED });
                    y -= 12;
                }
                lastTrack = pl.track;
                y = drawZoom(d, pl.track, pl.g, y, orientOf(pl.track)) - 12;
            }
        }

        // ---- one section per compound ---------------------------------------------------
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const o2 = e.oligo, t = e.track, row = e.row || {};
            d.page(); y = d.H - d.M;

            d.text(X0, y, labelOf(o2) || ('compound ' + (i + 1)), { size: 14, bold: true, rgb: INK });
            d.text(X1, y, (i + 1) + ' of ' + entries.length, { size: 8.5, rgb: MUTED, align: 'right' });
            y -= 15;
            rule(y, [0.2, 0.2, 0.2]); y -= 15;

            const sp = oligoSpan(o2);
            const or2 = orientOf(t);
            const gOf2 = or2.gOf;
            const gA = sp ? gOf2(sp.lo) : null, gB = sp ? gOf2(sp.hi - 1) : null;
            const coord = (gA == null || gB == null) ? ''
                : (chromOf(t) ? chromOf(t) + ':' : '') + commas(Math.min(gA, gB)) + '-' + commas(Math.max(gA, gB));

            field('ID', row.id);
            field('Name', row.name);
            field('Type', row.type);
            field('Track', str(t && t.name) + (row.strand ? ('   (' + row.strand + ' strand)') : ''));
            field('Genomic coordinates', coord);
            field('Track coordinates', sp ? (commas(sp.lo) + '-' + commas(sp.hi - 1)) : '');
            field('Length', row.length !== '' && row.length != null ? (row.length + ' nt') : '');
            field('Target sequence', row.target_sequence, { bold: true });
            field('Synthesis sequence', row.synthesis_sequence, { bold: true });
            field('Chemistry', row.chemistry);
            field('Off-targets', row.off_target);
            field('Mismatches', row.mismatches);
            field('Annotations', row.annotations);
            // The variants under this compound, and where they fall within it -- the same
            // positions the pileup panels show, for a compound that has one to itself too.
            if (sp) {
                const mine = variantsOf(t).filter((vr) => vr.lo < sp.hi && vr.hi > sp.lo);
                if (mine.length) {
                    field('Variants covered', mine.map((vr) => {
                        const gx = or2.gOf(vr.lo);
                        const where = (variantLabel(vr.v) || ((or2.chrom ? or2.chrom + ':' : '') + commas(gx == null ? vr.lo : gx)));
                        return where + ': ' + siteText(siteFacts(o2, row, vr, or2));
                    }).join('; '), { rgb: VAR });
                }
            }

            y -= 8;
            need(120);
            // The same track again, with THIS compound picked out in orange and the rest of
            // the design left in place around it -- where it sits is a fact about its
            // neighbours as much as about the transcript.
            const others = ((t && t.oligos) || []).filter((x) => x && x !== o2).map((x) => {
                const s = oligoSpan(x); return s ? { lo: s.lo, hi: s.hi, label: '', rgb: OTHER } : null;
            }).filter(Boolean);
            const mine = sp ? [{ lo: sp.lo, hi: sp.hi, label: labelOf(o2), rgb: THIS_ONE }] : [];
            y = drawMap(d, t, others.concat(mine), y, { title: 'Position on ' + (str(t && t.name) || 'the track'), rows: 8 });
        }

        return d;
    };

    const download = async (spec) => {
        const d = build(spec);
        d.download((spec && spec.filename) || 'ASO_report.pdf');
        return true;
    };

    return { build, download, drawMap };
})();

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
        const gOf = mapperFor(t);
        const gLo = gOf(sp.lo), gHi = gOf(sp.hi);
        const known = (gLo != null && gHi != null);
        const ascending = !(known && gHi < gLo);
        const leftIs5 = (geneStrandOf(t) > 0) === ascending;
        const chrom = chromOf(t);
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
                    + ' (' + (geneStrandOf(t) < 0 ? 'minus' : 'plus') + '-strand gene)',
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

    // ---- the report ------------------------------------------------------------------
    const build = (spec) => {
        const o = spec || {};
        const entries = (o.entries || []).filter((e) => e && e.oligo);
        const d = P.doc();
        const X0 = d.M, X1 = d.W - d.M, WIDTH = X1 - X0;
        let y = d.H - d.M;

        const rule = (yy, g) => d.line(X0, yy, X1, yy, { lw: 0.6, rgb: g || RULE });
        const need = (h) => { if (y - h < d.M + 20) { d.page(); y = d.H - d.M; return true; } return false; };
        // A key and its value, wrapped onto further lines when the value is long.
        const field = (k, v, opts) => {
            const s = opts || {};
            const KEY_W = 112, valX = X0 + KEY_W, valW = WIDTH - KEY_W;
            const size = s.size || 8.5;
            const text = str(v);
            if (text === '') return;
            // Break a long value on spaces, and a long unbroken run (a sequence) on width.
            const lines = [];
            let rest = text;
            while (rest.length) {
                if (d.width(rest, size) <= valW) { lines.push(rest); break; }
                let cut = rest.length;
                while (cut > 1 && d.width(rest.slice(0, cut), size) > valW) cut--;
                let brk = rest.lastIndexOf(' ', cut);
                if (brk < cut * 0.6) brk = cut;          // no sensible space: break on width
                lines.push(rest.slice(0, brk));
                rest = rest.slice(brk).replace(/^ /, '');
                if (lines.length > 14) { lines.push('…'); break; }
            }
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
        d.text(X0, y, entries.length + ' compound' + (entries.length === 1 ? '' : 's') + ' on '
            + byTrack.length + ' track' + (byTrack.length === 1 ? '' : 's')
            + ". Each map is broken into rows to fit the page; the transcript's 5' and 3' ends are marked.",
            { size: 8.5, rgb: MUTED, max: WIDTH });
        y -= 18;

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
            const gOf2 = mapperFor(t);
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

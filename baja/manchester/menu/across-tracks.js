function (graph, genegraph_panel_layout) {

    // ACROSS THE TRACKS — the tools that only mean something with two or more tracks loaded.
    //   exec('baja/manchester/menu/across-tracks.js', graph, genegraph_panel_layout)
    //
    // One track is a sequence with things on it. Two tracks are a COMPARISON, and the question
    // stops being "what is here" and becomes "what is the same, and what is not": a germline
    // track beside its tumour, sample A beside sample B. These draw that comparison onto the
    // board rather than describing it in a panel.
    //
    // The same variant on two tracks is matched on where it sits and what it changes -- the
    // GENOMIC coordinate rounded to the base, with the reference and alternate alleles. It used
    // to match on the track coordinate, on the reasoning that two tracks of one transcript
    // share their coordinate system. They only do when they start at the same place: a track's
    // x runs from ITS origin, so the same base is one number on a gene track and another on its
    // mRNA track, or on a second sample loaded over a different span, and nothing matched.
    // baja/bio/track-coords.js does the conversion, exon map and strand included.
    //
    // A variant that only one track carries is the interesting one, and it is counted and can
    // be marked.

    return (async () => {
        const Line = await exec('flexigraph/shapes/line.js');
        const C = await exec('baja/bio/track-coords.js');
        const LINE_TAG = 'across-tracks';          // every line this draws is named with it
        const SHARED_COLOR = '#22c55e';
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const tracksOf = () => ((graph && graph.track) || []).filter((t) => t && (t.tgraph || t.grid));
        const boxOf = (t) => (t && (t.tgraph || t.grid)) || null;
        // A track's box, as the two world y values that are its upper and lower edge ON SCREEN.
        // Its height can be negative and the views do not agree on which way y runs, so which
        // edge is the top is asked of the grid rather than assumed.
        const edgesOf = (t) => {
            const b = boxOf(t);
            if (!b) return null;
            const a = +b.yi, c = a + (isFinite(+b.height) ? +b.height : 0);
            if (!isFinite(a) || !isFinite(c)) return null;
            let sa = a, sc = c;
            try { sa = graph.graph.Y(a); sc = graph.graph.Y(c); } catch (e) { }
            // Smaller screen y is higher up.
            return (sa <= sc) ? { top: a, bot: c, screenTop: sa } : { top: c, bot: a, screenTop: sc };
        };
        const topOf = (t) => { const e = edgesOf(t); return e ? e.top : 0; };
        const bottomOf = (t) => { const e = edgesOf(t); return e ? e.bot : 0; };
        const screenTopOf = (t) => { const e = edgesOf(t); return e ? e.screenTop : 0; };
        const label = (t, i) => ('' + (t.description || t.name || ('track ' + (i + 1)))).trim();
        const variantsOf = (t) => ((t && t.snpindels) || []).filter((s) => s && s.xi != null && isFinite(s.xi));
        // What makes two marks the same change: the GENOMIC base it sits on and the
        // substitution. Null when the track cannot say where it is in the genome, and a
        // variant with no answer is not matched to anything rather than matched wrongly.
        const keyOf = (t, s) => {
            const g = C.genomicOf(t, +s.xi);
            if (g == null) return null;
            const chr = ('' + (s.chr || t.chr || '')).toLowerCase().replace(/^chr/, '');
            return chr + ':' + Math.round(g) + ':' + ('' + (s.reference0 || s.reference || '')).toUpperCase()
                + '>' + ('' + (s.alternate0 || s.alternate || '')).toUpperCase();
        };
        const nameOf = (s) => ('' + (s.name || '')).trim() || (('' + (s.reference0 || '?')) + '>' + ('' + (s.alternate0 || '?')));

        // Every variant, by key, with the tracks carrying it.
        const index = () => {
            const ts = tracksOf(), by = new Map();
            ts.forEach((t, i) => {
                for (const s of variantsOf(t)) {
                    const k = keyOf(t, s);
                    if (!k) continue;
                    let e = by.get(k);
                    if (!e) { e = { key: k, name: nameOf(s), on: [] }; by.set(k, e); }
                    if (!e.on.some((o) => o.i === i)) e.on.push({ i: i, track: t, snp: s });
                }
            });
            return { tracks: ts, by: by };
        };

        const clearLines = () => {
            let n = 0;
            try {
                const keep = (graph.shapes || []).filter((s) => {
                    const hit = s && ('' + (s.name || '')).indexOf(LINE_TAG) === 0;
                    if (hit) n++;
                    return !hit;
                });
                graph.shapes = keep;
            } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return n;
        };

        // A line per pair of neighbouring tracks that both carry the variant: the eye follows a
        // ladder down the stack, and a variant missing from the middle track leaves a visible gap.
        const drawShared = (onlyHighlighted) => {
            const { tracks, by } = index();
            if (tracks.length < 2) return { drawn: 0, shared: 0 };
            clearLines();
            let drawn = 0, shared = 0;
            for (const e of by.values()) {
                if (e.on.length < 2) continue;
                if (onlyHighlighted && !e.on.some((o) => o.snp && o.snp.highlight)) continue;
                shared++;
                // IN THE ORDER THEY ARE DRAWN, not the order they were loaded. The ladder is
                // meant to run down the stack; sorting by the track's index in the array drew
                // it in whatever order the tracks happened to be added, so the lines crossed
                // each other and skipped tracks that sit between the two they joined.
                const on = e.on.slice().sort((p, q) => screenTopOf(p.track) - screenTopOf(q.track));
                for (let k = 0; k + 1 < on.length; k++) {
                    const a = on[k], b = on[k + 1];
                    const ba = boxOf(a.track), bb = boxOf(b.track);
                    if (!ba || !bb) continue;
                    // THROUGH THE TRACK'S OWN GRID. A shape lives in the graph's coordinates
                    // and a variant's xi is in its track's, which start at different places and
                    // need not even share a scale: handing the raw xi to a Line put it wherever
                    // that number happened to land on the board. Every other thing that draws a
                    // graph shape from a track position goes through tgraph.X (see
                    // baja/bio/splicing/acceptor-sites.js), and so does this now.
                    let x0, x1;
                    try { x0 = ba.X(+a.snp.xi); x1 = bb.X(+b.snp.xi); } catch (e2) { continue; }
                    // Join the edge of the upper box to the edge of the lower one, so the line
                    // spans the gap between the tracks instead of starting inside one of them.
                    const ya = bottomOf(a.track), yb = topOf(b.track);
                    if (!isFinite(x0) || !isFinite(x1) || !isFinite(ya) || !isFinite(yb)) continue;
                    const line = new Line(LINE_TAG + ':' + e.key, x0, ya);
                    line.xf = x1;
                    line.yf = yb;
                    line.w = x1 - x0;
                    line.h = yb - ya;
                    line.setColor(SHARED_COLOR);
                    line.linewidth = 1.5;
                    line.arrowDirect = 'none';
                    line.comment = e.name + ' — on ' + on.length + ' tracks';
                    try { graph.shapes.push(line); drawn++; } catch (e2) { }
                }
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return { drawn: drawn, shared: shared };
        };

        // Mark what only one track has: those are the differences a design is aimed at.
        const markPrivate = (on) => {
            const { tracks, by } = index();
            let n = 0;
            for (const e of by.values()) {
                if (e.on.length !== 1) continue;
                const s = e.on[0].snp;
                try { s.highlight = !!on; n++; } catch (e2) { }
            }
            try { if (graph.wake) graph.wake(); } catch (e2) { }
            return { n: n, tracks: tracks.length };
        };

        // ---- THE SEQUENCE ITSELF ---------------------------------------------------------
        // Everything above compares what is MARKED on the tracks. This compares what the
        // tracks are made of. Two tracks over the span they share are walked together in
        // blocks -- contigs -- and each block is scored for how much of it is identical;
        // a block that matches is drawn as a labelled band between the two tracks, so
        // "where are these two the same, and how same" is answered on the board.
        //
        // Ungapped, column by column, because the blocks are matched on GENOMIC coordinate
        // first: two tracks at the same base are already aligned, and an aligner would only
        // be re-deriving that. It is also why this runs in the browser instead of through
        // py/bio/compare-sequences-ld.py -- that returns a Levenshtein percent for one pair
        // of strings, and one python job per block would saturate the bridge, which runs six
        // jobs for the whole site. Edit distance also answers a different question: over
        // already-aligned columns it charges for shifts that the coordinates have ruled out.
        const LAYER_TAG = 'across-tracks-seq';
        const MAX_BLOCKS = 4000;          // a whole-chromosome track widens the block instead
        const num = (v) => { const n = +v; return isFinite(n) ? n : null; };

        // The genomic span a track covers: its exon map when it has one, its origin and end
        // otherwise. Same two cases baja/bio/track-coords.js maps positions through.
        const genomicSpanOf = (t) => {
            let lo = null, hi = null;
            try {
                for (const a of ((t.getExons && t.getExons()) || [])) {
                    const gi = num(a.gxi), gf = num(a.gxf);
                    if (gi == null || gf == null) continue;
                    lo = (lo == null) ? Math.min(gi, gf) : Math.min(lo, gi, gf);
                    hi = (hi == null) ? Math.max(gi, gf) : Math.max(hi, gi, gf);
                }
            } catch (e) { }
            if (lo != null && hi != null && hi > lo) return { lo: lo, hi: hi };
            const a = num(t.xi), b = num(t.xf);
            return (a != null && b != null && b > a) ? { lo: a, hi: b } : null;
        };
        // GENOMIC <-> WORLD, for reading bases. Deliberately NOT C.localOf/C.genomicOf.
        //
        // getSequenceRange(x) indexes sequence[x - this.xi] (baja/bio/track-flexi.js), so the
        // only coordinate it accepts is the track's WORLD x, whose origin is t.xi -- the
        // constructor sets the grid to xi..xf, so sequence[0] sits at world xi.
        // track-coords.js agrees on the exon path (variantWorldX returns a world x) but its
        // exon-less FALLBACK returns g - xi, a 0-based offset, which is one xi short of what
        // getSequenceRange wants. The two conventions coincide whenever xi is 0, which is the
        // usual exon-less track (new Track(name, 0, len, ...) for a pasted FASTA or an
        // alignment), so the disagreement never shows -- until a track with no exon map and a
        // genomic origin is compared, and then every base read is off by the track's origin
        // and the identity is noise. So the pair below is used for sequence, and C stays
        // where it already works, on the variant tools above.
        const exonsOf = (t) => { try { return (t.getExons && t.getExons()) || []; } catch (e) { return []; } };
        const worldOf = (t, g) => {
            try {
                const v = t.variantWorldX ? t.variantWorldX(t.chr, g) : null;
                if (v != null && isFinite(+v)) return +v;
            } catch (e) { }
            // No exon map: world IS genomic here, because genomicSpanOf read this track's
            // span from the same t.xi/t.xf that getSequenceRange offsets by.
            const a = num(t.xi), b = num(t.xf);
            if (a == null || b == null) return null;
            return (g < Math.min(a, b) || g > Math.max(a, b)) ? null : g;
        };
        const genomicOfWorld = (t, w) => {
            for (const a of exonsOf(t)) {
                const gi = num(a.gxi), gf = num(a.gxf), xi = num(a.xi), xf = num(a.xf);
                if (gi == null || gf == null || xi == null || xf == null) continue;
                if (w < Math.min(xi, xf) || w > Math.max(xi, xf)) continue;
                return (xf === xi) ? gi : gi + ((w - xi) / (xf - xi)) * (gf - gi);
            }
            return w;
        };
        // A selection narrows the comparison, the way it narrows every designer in
        // track-design-menu.js: someone who has highlighted a region is asking for it.
        // markstart/markend are world x, the space getHighlightedSequence reads them in.
        const selectedGenomicSpan = (t) => {
            const a = num(t.markstart), b = num(t.markend);
            if (a == null || b == null || !(b > a)) return null;
            const g0 = genomicOfWorld(t, Math.min(a, b)), g1 = genomicOfWorld(t, Math.max(a, b));
            return (g0 == null || g1 == null) ? null : { lo: Math.min(g0, g1), hi: Math.max(g0, g1) };
        };
        const seqRange = (t, lo, hi) => {
            try { return t.getSequenceRange ? ('' + (t.getSequenceRange(lo, hi) || '')).toUpperCase() : ''; }
            catch (e) { return ''; }
        };
        // Does this track actually carry bases? getSequenceRange exists on tracks whose
        // sequence was never loaded and answers '' — worth knowing before offering the tool
        // rather than after running it over nothing.
        const hasSequence = (t) => {
            const s = genomicSpanOf(t);
            if (!s || typeof t.getSequenceRange !== 'function') return false;
            const mid = s.lo + Math.min(50, (s.hi - s.lo) / 2);
            const w = worldOf(t, mid);
            if (w == null) return false;
            return /[ACGT]/.test(seqRange(t, w, w + 12));
        };

        // One pair of tracks, walked in blocks. Every block it could read is returned, the
        // ones that match and the ones that do not, because "how much is similar" is a ratio
        // and needs the denominator.
        const comparePair = (ta, tb, windowBp) => {
            if (!C.sameChromosome(ta, tb)) return null;
            const sa = genomicSpanOf(ta), sb = genomicSpanOf(tb);
            if (!sa || !sb) return null;
            let lo = Math.max(sa.lo, sb.lo), hi = Math.min(sa.hi, sb.hi);
            for (const s of [selectedGenomicSpan(ta), selectedGenomicSpan(tb)]) {
                if (s) { lo = Math.max(lo, s.lo); hi = Math.min(hi, s.hi); }
            }
            if (!(hi > lo)) return null;
            let step = Math.max(1, Math.round(windowBp));
            if ((hi - lo) / step > MAX_BLOCKS) step = Math.ceil((hi - lo) / MAX_BLOCKS);
            const blocks = [];
            let same = 0, compared = 0;
            for (let g = lo; g < hi; g += step) {
                const gEnd = Math.min(g + step, hi);
                const a0 = worldOf(ta, g), a1 = worldOf(ta, gEnd);
                const b0 = worldOf(tb, g), b1 = worldOf(tb, gEnd);
                if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
                const ax0 = Math.min(a0, a1), ax1 = Math.max(a0, a1);
                const bx0 = Math.min(b0, b1), bx1 = Math.max(b0, b1);
                const A = seqRange(ta, ax0, ax1), B = seqRange(tb, bx0, bx1);
                if (!A || !B) continue;
                const n = Math.min(A.length, B.length);
                let m = 0, c = 0;
                for (let i = 0; i < n; i++) {
                    const x = A[i], y = B[i];
                    // An unread base is not a difference. N is "not sequenced here", and
                    // counting it as a mismatch would report low-coverage stretches as
                    // divergence, which is the opposite of what happened.
                    if (x === 'N' || y === 'N' || x === '-' || y === '-') continue;
                    c++;
                    if (x === y) m++;
                }
                if (!c) continue;
                blocks.push({ g0: g, g1: gEnd, ax0: ax0, ax1: ax1, bx0: bx0, bx1: bx1, pct: (m / c) * 100, bases: c });
                same += m; compared += c;
            }
            if (!blocks.length) return null;
            return { a: ta, b: tb, blocks: blocks, identity: compared ? (same / compared) * 100 : 0, compared: compared, step: step };
        };

        const clearBands = () => {
            let n = 0;
            try {
                const keep = (graph.layers || []).filter((l) => {
                    const hit = l && ('' + (l.name || '')).indexOf(LAYER_TAG) === 0;
                    if (hit) n++;
                    return !hit;
                });
                graph.layers = keep;
            } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return n;
        };

        // Neighbouring tracks IN THE ORDER THEY ARE DRAWN, the same stack the variant ladder
        // runs down, so the bands sit in the gap between the two tracks they are about.
        const compareSequence = async (windowBp, minPct) => {
            const stack = tracksOf().slice().sort((p, q) => screenTopOf(p) - screenTopOf(q));
            if (stack.length < 2) return null;
            const TrackLink = await exec('baja/bio/track-link');
            clearBands();
            const pairs = [], bands = [];
            for (let i = 0; i + 1 < stack.length; i++) {
                const r = comparePair(stack[i], stack[i + 1], windowBp);
                if (!r) continue;
                r.ai = i;
                pairs.push(r);
                // TrackLink.draw reaches straight through to track.tgraph.X, and
                // drawGraphLayers awaits every layer with no try/catch around it: one band on
                // a track without a usable tgraph would throw there and take the editor's
                // whole render loop with it. The numbers are still reported for such a pair.
                const drawable = (t) => { const g = t && t.tgraph; return !!(g && typeof g.X === 'function' && typeof g.Y === 'function'); };
                if (!drawable(r.a) || !drawable(r.b)) { r.undrawable = true; continue; }
                for (const bl of r.blocks) {
                    if (bl.pct < minPct) continue;
                    const link = new TrackLink({ track: r.a, xi: bl.ax0, xf: bl.ax1, y: 0 },
                        { track: r.b, xi: bl.bx0, xf: bl.bx1, y: 0 });
                    link.name = LAYER_TAG + ':' + i + ':' + Math.round(bl.g0);
                    link.mode = 'rect';
                    link.setValue(Math.round(bl.pct));
                    link.label = (bl.pct >= 99.95 ? '100' : bl.pct.toFixed(1)) + '%';
                    // Solidity carries the identity across the band's own range, so a wall of
                    // 95-100% blocks still shows which of them are the exact ones. Green is
                    // the colour the shared-variant ladder already uses for "the same here".
                    const f = (bl.pct - minPct) / Math.max(1e-6, 100 - minPct);
                    link.alpha = 0.16 + 0.44 * Math.max(0, Math.min(1, f));
                    link.color = 'rgba(34,197,94,' + link.alpha.toFixed(3) + ')';
                    bands.push(link);
                }
            }
            if (bands.length) { try { graph.appendLayers(bands); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            let sameAll = 0, cmpAll = 0, blocksAll = 0, similarAll = 0;
            for (const p of pairs) {
                for (const b of p.blocks) { cmpAll += b.bases; sameAll += b.bases * b.pct / 100; blocksAll++; if (b.pct >= minPct) similarAll++; }
            }
            const run = {
                pairs: pairs, bands: bands.length, minPct: minPct,
                blocks: blocksAll, similar: similarAll,
                identity: cmpAll ? (sameAll / cmpAll) * 100 : 0, bases: cmpAll,
            };
            try { graph.__acrossTracksSeq = run; } catch (e) { }
            return run;
        };

        const pc = (v) => (v >= 99.95 ? '100' : v.toFixed(1)) + '%';

        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };

        const ts = tracksOf();
        if (ts.length < 2) {
            say('Two tracks or more are needed: these tools compare one track against another.');
            return false;
        }

        const { by } = index();
        const shared = Array.from(by.values()).filter((e) => e.on.length > 1);
        const priv = Array.from(by.values()).filter((e) => e.on.length === 1);
        const drawnNow = (graph.shapes || []).filter((s) => s && ('' + (s.name || '')).indexOf(LINE_TAG) === 0).length;

        const books = [];
        books.push({ section: 'Across the tracks', note: true,
            title: ts.length + ' tracks: ' + ts.map(label).join(', ') + '. '
                + shared.length.toLocaleString() + ' change' + (shared.length === 1 ? '' : 's') + ' on more than one of them, '
                + priv.length.toLocaleString() + ' on one alone.'
                + (ts.filter(hasSequence).length >= 2 ? ' The sequence itself can be compared too.' : '') });
        books.push({ section: 'Across the tracks', accent: 'run', icon: 'timeline', ready: shared.length > 0,
            readyNote: 'nothing is shared between these tracks',
            title: 'Draw a line between the mutations that are the same',
            badge: shared.length ? shared.length + ' shared' : 'none',
            blurb: 'A line joins each change to the same change on the next track that carries it. A gap in the ladder is a track that does not have it.',
            open: () => { const r = drawShared(false); say(r.drawn ? ('Drew ' + r.drawn + ' line' + (r.drawn === 1 ? '' : 's') + ' over ' + r.shared + ' shared change' + (r.shared === 1 ? '' : 's') + '.') : 'Nothing is shared between these tracks.'); } });
        books.push({ section: 'Across the tracks', icon: 'star', ready: shared.some((e) => e.on.some((o) => o.snp && o.snp.highlight)),
            readyNote: 'no shared change is highlighted',
            title: 'Only the highlighted ones',
            blurb: 'The same lines, but only for changes you have highlighted.',
            open: () => { const r = drawShared(true); say(r.drawn ? ('Drew ' + r.drawn + ' line' + (r.drawn === 1 ? '' : 's') + '.') : 'No highlighted change is shared.'); } });
        books.push({ section: 'Across the tracks', icon: 'clear', ready: drawnNow > 0, readyNote: 'no lines are drawn',
            title: 'Take the lines off', badge: drawnNow ? String(drawnNow) : '',
            blurb: 'Removes every line this drew. Your own annotations are left alone.',
            open: () => { const n = clearLines(); say(n ? ('Removed ' + n + ' line' + (n === 1 ? '' : 's') + '.') : 'There were none.'); } });
        books.push({ section: 'What differs', icon: 'gps_fixed', ready: priv.length > 0, readyNote: 'every change is on every track',
            title: 'Highlight the changes only one track has', badge: priv.length ? priv.length + ' private' : 'none',
            blurb: 'The differences between these tracks — for an allele-selective design, these are the targets.',
            open: () => { const r = markPrivate(true); say('Highlighted ' + r.n + ' change' + (r.n === 1 ? '' : 's') + ' carried by one track alone.'); } });
        books.push({ section: 'What differs', icon: 'clear', ready: priv.length > 0,
            title: 'Take those highlights off',
            blurb: 'Clears the highlight this put on.',
            open: () => { const r = markPrivate(false); say('Cleared ' + r.n + ' highlight' + (r.n === 1 ? '' : 's') + '.'); } });

        // ---- the sequence, on the shelf ---------------------------------------------------
        const seqTracks = ts.filter(hasSequence);
        const seqReady = seqTracks.length >= 2;
        const selectedNow = ts.filter((t) => selectedGenomicSpan(t)).length > 0;
        const bandsNow = (graph.layers || []).filter((l) => l && ('' + (l.name || '')).indexOf(LAYER_TAG) === 0).length;
        const lastRun = (graph.__acrossTracksSeq && graph.__acrossTracksSeq.pairs) ? graph.__acrossTracksSeq : null;
        // block size : the identity a block must reach to count as similar
        const PRESETS = [
            { value: '500:95', label: '500 bp blocks, 95% or better', note: 'A good first look at two samples of the same region.' },
            { value: '100:95', label: '100 bp blocks, 95% or better', note: 'Finer: shows short divergent stretches the 500 bp blocks average away.' },
            { value: '1000:95', label: '1 kb blocks, 95% or better', note: 'Coarser, for a long region where the question is which arms match.' },
            { value: '5000:90', label: '5 kb blocks, 90% or better', note: 'Whole-chromosome scale, and tolerant of scattered differences.' },
            { value: '500:99', label: '500 bp blocks, 99% or better', note: 'Near-exact only: a block with one difference in a hundred bases fails.' },
        ];
        const parsePreset = (v) => {
            const m = ('' + (v || '500:95')).split(':');
            const w = num(m[0]), p = num(m[1]);
            return { w: (w && w > 0) ? w : 500, p: (p != null && p >= 0 && p <= 100) ? p : 95 };
        };

        books.push({ section: 'The sequence', accent: 'run', icon: 'compare_arrows',
            ready: seqReady, readyNote: seqTracks.length ? 'only one of these tracks carries sequence' : 'these tracks carry no sequence to compare',
            title: 'Compare the sequence and band what matches',
            badge: selectedNow ? 'over the selection' : (seqReady ? seqTracks.length + ' with sequence' : 'none'),
            blurb: 'Walks neighbouring tracks together in blocks over the span they share, scores each block for how much of it is identical, and draws the matching ones as a labelled band between the tracks.',
            docs: {
                summary: 'Two tracks over one region are the same sequence until they are not, and the '
                    + 'question is how much and where. Each block of the shared span is scored for percent '
                    + 'identity; blocks at or above the threshold are banded on the board and labelled with '
                    + 'their percent, and the headline is what share of the blocks matched.',
                provenance: 'Computed in the browser from the bases the tracks already hold '
                    + '(getSequenceRange), compared column by column after the blocks are matched on genomic '
                    + 'coordinate. No aligner and no server call: the coordinates have already aligned the '
                    + 'two, so an edit distance would charge for shifts that cannot be there, and one python '
                    + 'job per block would saturate a bridge that runs six for the whole site.',
                usage: 'A band per matching block, sitting in the gap between the two tracks it is about, '
                    + 'greener and more solid the closer to identical. Neighbouring tracks are paired in the '
                    + 'order they are drawn, so a stack of three gives two rows of bands. Highlight a region '
                    + 'on either track first and only that region is compared.',
                choice: {
                    label: 'Block size and the bar for a match',
                    note: PRESETS[0].note,
                    value: PRESETS[0].value,
                    options: PRESETS,
                },
            },
            open: async (v) => {
                const { w, p } = parsePreset(v);
                say('Comparing the sequence…');
                let r = null;
                try { r = await compareSequence(w, p); }
                catch (e) { say('The comparison failed: ' + (e && e.message ? e.message : e)); return; }
                if (!r || !r.blocks) { say('These tracks share no span that both of them carry sequence for.'); return; }
                const share = r.blocks ? (r.similar / r.blocks) * 100 : 0;
                const mute = r.pairs.filter((x) => x.undrawable).length;
                say(pc(share) + ' of the blocks match — ' + r.similar.toLocaleString() + ' of '
                    + r.blocks.toLocaleString() + ' at ' + p + '% or better, over '
                    + r.bases.toLocaleString() + ' bases compared. Identity overall is ' + pc(r.identity) + '.'
                    + (mute ? (' ' + mute + ' pair' + (mute === 1 ? ' could' : 's could') + ' not be banded on the board.') : ''));
            } });

        books.push({ section: 'The sequence', icon: 'clear', ready: bandsNow > 0, readyNote: 'no bands are drawn',
            title: 'Take the sequence bands off', badge: bandsNow ? String(bandsNow) : '',
            blurb: 'Removes every band this drew. The variant lines and your own layers are left alone.',
            open: () => { const n = clearBands(); say(n ? ('Removed ' + n + ' band' + (n === 1 ? '' : 's') + '.') : 'There were none.'); } });

        // The blocks as a list, from the last run: the board shows where, this says which.
        // Worst first, because the question a matching wall of green raises is where it broke.
        if (lastRun) {
            const rows = [];
            for (const pr of lastRun.pairs) {
                for (const b of pr.blocks) rows.push({ pr: pr, b: b });
            }
            rows.sort((x, y) => x.b.pct - y.b.pct);
            books.push({ section: 'The sequence', icon: 'list', ready: rows.length > 0,
                title: 'How similar each block is',
                badge: pc(lastRun.identity) + ' overall',
                blurb: 'Every block the last comparison read, least similar first — the ones that did not match are the differences between these tracks.',
                books: () => rows.slice(0, 300).map((r) => ({
                    section: r.b.pct >= lastRun.minPct ? 'Matched' : 'Did not match',
                    title: label(r.pr.a, 0) + ' / ' + label(r.pr.b, 0) + ' — ' + Math.round(r.b.g0).toLocaleString() + '–' + Math.round(r.b.g1).toLocaleString(),
                    badge: pc(r.b.pct),
                    blurb: r.b.bases.toLocaleString() + ' bases compared.',
                    ready: true,
                    // Frame the block on both tracks, so a low-scoring one can be read.
                    open: async () => {
                        // Both tracks of the pair in view, not just the upper one: the block is
                        // a statement about the two of them together. Same call shape as
                        // track-design-menu.js's __zoomToDesignScope.
                        try {
                            const ga = boxOf(r.pr.a), gb = boxOf(r.pr.b);
                            if (graph.zoomRect && ga && ga.X) {
                                // THROUGH tgraph.X, for the same reason the ladder's lines go
                                // through it: ax0/ax1 are the track's own x, and zoomRect sets
                                // the GRAPH's grid. Handing it the raw numbers would frame
                                // wherever they happen to land on the board.
                                const x0 = ga.X(r.b.ax0), x1 = ga.X(r.b.ax1);
                                const xpad = Math.max(2, Math.abs(x1 - x0) * 0.25);
                                const ys = [ga.yi, ga.yi + (ga.height || 0)];
                                if (gb) ys.push(gb.yi, gb.yi + (gb.height || 0));
                                const yA = Math.min.apply(null, ys), yB = Math.max.apply(null, ys);
                                const cy = (yA + yB) / 2, yhalf = (Math.abs(yB - yA) || 1) * 0.85;
                                await graph.zoomRect(Math.min(x0, x1) - xpad, Math.max(x0, x1) + xpad, cy + yhalf, cy - yhalf, 150);
                            }
                            if (graph.wake) graph.wake();
                        } catch (e) { }
                        say(pc(r.b.pct) + ' over ' + r.b.bases.toLocaleString() + ' bases.');
                    },
                })),
            });
        }

        // What is on which track, read as a list: the same numbers the lines draw.
        books.push({ section: 'The list', icon: 'list', ready: true, title: 'What each change sits on',
            badge: by.size + ' in all',
            blurb: 'Every change on these tracks and which of them carry it.',
            books: () => Array.from(by.values())
                .sort((a, b) => b.on.length - a.on.length || a.key.localeCompare(b.key))
                .slice(0, 300)
                .map((e) => ({
                    section: e.on.length > 1 ? 'On more than one track' : 'On one track alone',
                    title: e.name,
                    badge: e.on.length > 1 ? e.on.length + ' tracks' : label(e.on[0].track, e.on[0].i),
                    blurb: 'On: ' + e.on.map((o) => label(o.track, o.i)).join(', ') + '.',
                    ready: true,
                    open: () => { try { for (const o of e.on) o.snp.highlight = true; if (graph.wake) graph.wake(); } catch (e2) { } say('Highlighted ' + e.name + '.'); },
                })),
        });

        return exec('baja/lib/shelf.js', {
            id: 'baja-across-tracks', title: 'Across the tracks',
            subtitle: ts.length + ' tracks on the board — what they share, and what they do not',
            graph: graph, books: books,
        });
    })();
}

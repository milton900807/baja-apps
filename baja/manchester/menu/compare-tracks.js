function (graph, tracks, opts) {

    // COMPARE THE SELECTED TRACKS — draw a line between the things they have in common.
    //
    //   await exec('baja/manchester/menu/compare-tracks.js', graph, tracks,
    //              { kind: 'variants', match: 'position' })
    //   await exec('baja/manchester/menu/compare-tracks.js', graph, null, { clear: true })
    //
    // Two tracks of the same region -- a germline and a tumour sample, two transcripts, a
    // patient and a reference -- carry a lot of the same mutations and a few that matter
    // because they are NOT the same. Reading that off two rows of lollipops means holding
    // one row in your head while your eye travels to the other. This joins them instead:
    // every item that appears on more than one selected track gets a line drawn from the
    // one to the other, so what is shared is what is tied together, and what is unique is
    // what is left hanging.
    //
    // HOW THINGS ARE MATCHED (`match`):
    //   position   the same place and the same change -- chr:pos ref>alt. What you want
    //              when the tracks are the same region: it answers "does this sample carry
    //              that variant too".
    //   change     the variant's IDENTIFIER -- an rs number, or the protein change (G93A).
    //              Coordinates differ between genes and between assemblies; these do not, so
    //              this ties an E746K on one track to an E746K on another. Deliberately NOT
    //              the bare nucleotide change: "G>A" is one of twelve substitutions and would
    //              tie every track to every other one.
    //   name       for annotations and oligos, the name they were given.
    //
    // Positions are always reduced to GENOMIC coordinates first (baja/bio/track-coords.js):
    // a track's own x is measured from its own origin, so the same base has a different
    // number on a gene track and on its mRNA track.
    //
    // A line drawn in full colour joins something present on EVERY selected track; a
    // dashed, warmer line joins one that is on some of them but not all. The two together
    // read as "shared by all" against "shared by some", which is the distinction a
    // comparison exists to make.
    //
    // The overlay draws through graph.post_graphics_modifications, the same per-frame hook
    // the lasso paints its loop with, and is kept on graph.__compareDraw so a later lasso
    // can put it back when it clears its own.
    return (async () => {
        const o = opts || {};
        // WHICH OF THESE IS ACTUALLY DRAWN. The editor's canvas does not paint setMessage --
        // only setError (orange) and setResultMessage (cyan) become toasts, as the note at the
        // top of allele-selective-design.js says. Every line this file wrote went through
        // setMessage, so a comparison that found nothing said nothing, and one that found
        // something never reported it either: it looked exactly like a feature doing nothing.
        const tell = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const warn = (m) => { try { graph.setError(' ' + m + ' '); } catch (e) { tell(m); } };
        // Positions are compared ACROSS tracks, and a track's own x is measured from its own
        // origin -- see baja/bio/track-coords.js. Keying on the raw xi, which is what this
        // did, meant two tracks of the same gene never agreed about the same base unless
        // their origins happened to match, so "same position" found nothing and no line was
        // ever drawn between two mutations.
        const C = await exec('baja/bio/track-coords.js');

        // ---- clearing -------------------------------------------------------------------
        if (o.clear) {
            try { graph.__compareDraw = null; } catch (e) { }
            try { graph.post_graphics_modifications = null; } catch (e) { }
            try { graph.__compareSummary = null; } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return { cleared: true };
        }

        const ts = (tracks || []).filter((t) => t && t.tgraph);
        if (ts.length < 2) {
            warn('Select two or more tracks to compare.');
            return { shared: 0, tracks: ts.length };
        }
        const kind = o.kind || 'variants';
        const match = o.match || (kind === 'variants' ? 'position' : 'name');
        const MAX_LINKS = 600;          // a comparison, not a hairball

        const up = (v) => ('' + (v == null ? '' : v)).toUpperCase().trim();
        const clean = (v) => ('' + (v == null ? '' : v)).replace(/\s+/g, ' ').trim();

        // ---- what to compare ------------------------------------------------------------
        // Each entry: { x (genomic), keys, label }. x is where the line is anchored on that
        // track, in the track's own coordinates. KEYS, plural: a variant can be known by more
        // than one identifier, and two tracks need only agree on ONE of them -- a track that
        // records rs555 and one that records G719S are talking about the same variant, and
        // keying on whichever identifier came first would have missed it.
        const itemsOf = (t) => {
            const out = [];
            if (kind === 'variants') {
                for (const s of (t.snpindels || [])) {
                    if (!s || !isFinite(+s.xi)) continue;
                    const ref = up(s.reference || s.reference0);
                    const alt = up(s.alternate || s.alternate0);
                    const change = (ref && alt && ref !== alt) ? (ref + '>' + alt) : '';
                    // A protein variant carries its substitution in its name (G93A), which is
                    // the only form of it that survives a change of coordinates.
                    const named = clean(s.name || s.id);
                    const keys = [];
                    if (match === 'position') {
                        // THE GENOME'S NUMBER FOR THIS BASE, not the track's.
                        const chr = up(s.chr || t.chr || '').replace(/^CHR/, '');
                        const gp = C.genomicOf(t, +s.xi);
                        if (gp == null) continue;
                        keys.push(chr + ':' + Math.round(gp) + (change ? (':' + change) : ''));
                    } else {
                        // NOT the bare nucleotide change. Almost every SNV is one of twelve
                        // substitutions, so keying on "G>A" ties a variant in BRCA2 to an
                        // unrelated one in EGFR and calls it a finding. What travels between
                        // genes, samples and assemblies is an IDENTIFIER: an rs number, or the
                        // protein change, which names the residue as well as the substitution.
                        const N = up(named);
                        const rs = /\bRS\d{3,}\b/.exec(N);
                        const prot = /\b([A-Z]\d{1,5}[A-Z*])\b/.exec(N);
                        if (rs) keys.push(rs[0]);
                        if (prot) keys.push(prot[1]);
                    }
                    if (!keys.length) continue;
                    out.push({ x: +s.xi, keys: keys, label: named || change || ('' + Math.round(+s.xi)), ref: s });
                }
            } else if (kind === 'annotations') {
                for (const a of (t.annotations || [])) {
                    if (!a || !isFinite(+a.xi)) continue;
                    const nm = clean(a.name || a.type);
                    if (!nm) continue;
                    out.push({ x: (+a.xi + (isFinite(+a.xf) ? +a.xf : +a.xi)) / 2, keys: [up(nm)], label: nm, ref: a });
                }
            } else {
                for (const g of (t.oligos || [])) {
                    if (!g || !isFinite(+g.xi)) continue;
                    const nm = clean(g.name || g.id);
                    const seq = up(g.sequence || g.seq || '');
                    const key = (match === 'name' ? up(nm) : seq) || up(nm) || seq;
                    if (!key) continue;
                    out.push({ x: (+g.xi + (isFinite(+g.xf) ? +g.xf : +g.xi)) / 2, keys: [key], label: nm || 'oligo', ref: g });
                }
            }
            return out;
        };

        // ---- matching -------------------------------------------------------------------
        // Per track: its items, and an index from every identifier to the items carrying it.
        const perTrack = ts.map((t) => {
            const items = itemsOf(t);
            const index = new Map();
            items.forEach((it, i) => {
                for (const k of it.keys) {
                    if (!index.has(k)) index.set(k, []);
                    index.get(k).push(i);
                }
            });
            return { t: t, items: items, index: index };
        });
        const counts = perTrack.map((p) => p.items.length);

        // Tracks are joined in the order they appear ON SCREEN, so the lines run down the
        // stack instead of criss-crossing it.
        const screenY = (t) => {
            try {
                const a = graph.graph.Y(t.tgraph.yi);
                const b = a + (-1 * graph.graph.screenHeight(t.tgraph.height));
                return { top: Math.min(a, b), bot: Math.max(a, b) };
            } catch (e) { return null; }
        };
        const order = perTrack
            .map((p, i) => ({ i: i, y: (screenY(p.t) || { top: i }).top }))
            .sort((a, b) => a.y - b.y)
            .map((e) => e.i);

        // One item to one item: the first partner not already spoken for. Without that a
        // variant present three times on one track would fan out into three lines saying
        // the same thing.
        const pairUp = (upper, lower) => {
            const used = new Set();
            const out = [];
            for (const it of upper.items) {
                let hit = -1;
                for (const k of it.keys) {
                    for (const j of (lower.index.get(k) || [])) {
                        if (!used.has(j)) { hit = j; break; }
                    }
                    if (hit >= 0) break;
                }
                if (hit < 0) continue;
                used.add(hit);
                out.push({ a: { t: upper.t, it: it }, b: { t: lower.t, it: lower.items[hit] }, upper: it });
            }
            return out;
        };
        // Is this item of the topmost track present on EVERY other selected track? That is
        // what a solid line means, so it is asked of all of them, not just the next one down.
        const onAll = (it) => perTrack.every((p) => p.items === perTrack[order[0]].items
            || it.keys.some((k) => (p.index.get(k) || []).length));

        const links = [];
        for (let i = 0; i + 1 < order.length; i++) {
            const upper = perTrack[order[i]], lower = perTrack[order[i + 1]];
            for (const L of pairUp(upper, lower)) {
                if (links.length >= MAX_LINKS) break;
                links.push({ a: L.a, b: L.b, full: onAll(L.upper) });
            }
        }
        // The summary speaks from the TOP track, because "12 shared" says nothing about
        // which 12 of what: of the mutations on the first track, how many are also on the
        // others, and how many of those are on all of them.
        // Do any two of them even LOOK at the same stretch of genome? A "nothing in common"
        // means something quite different when the answer is no: comparing BRCA2 with EGFR
        // by position is a question with no possible yes, and saying so is more use than
        // reporting an empty result as though the samples simply disagreed.
        const spanOf = (t) => {
            try {
                const ex = t.getExons ? (t.getExons() || []) : [];
                if (ex.length) {
                    const gs = ex.flatMap((a) => [+a.gxi, +a.gxf]).filter(isFinite);
                    if (gs.length) return [Math.min.apply(null, gs), Math.max.apply(null, gs)];
                }
                const a = +t.xi, b = +t.xf;
                if (isFinite(a) && isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
            } catch (e) { }
            return null;
        };
        let overlapping = false;
        for (let i = 0; i < ts.length && !overlapping; i++) {
            for (let j = i + 1; j < ts.length && !overlapping; j++) {
                if (!C.sameChromosome(ts[i], ts[j])) continue;
                const A = spanOf(ts[i]), B = spanOf(ts[j]);
                if (A && B && A[0] <= B[1] && B[0] <= A[1]) overlapping = true;
            }
        }

        const top = perTrack[order[0]];
        let topShared = 0, topAll = 0;
        for (const it of top.items) {
            const elsewhere = perTrack.some((p) => p !== top && it.keys.some((k) => (p.index.get(k) || []).length));
            if (!elsewhere) continue;
            topShared++;
            if (onAll(it)) topAll++;
        }

        // ---- the overlay ----------------------------------------------------------------
        const SHARED = '#1aa3bd', PARTIAL = '#f59e0b';
        const draw = (ctx) => {
            if (!links.length) return;
            ctx.save();
            try { if (graph.resetCanvasEffects) graph.resetCanvasEffects(ctx); } catch (e) { }
            for (const L of links) {
                let ax, ay, bx, by;
                try {
                    const A = screenY(L.a.t), B = screenY(L.b.t);
                    if (!A || !B) continue;
                    ax = graph.graph.X(L.a.t.tgraph.X(L.a.it.x));
                    bx = graph.graph.X(L.b.t.tgraph.X(L.b.it.x));
                    ay = A.bot; by = B.top;
                    // Whichever way the stack runs, the line leaves the lower edge of the
                    // upper track and arrives at the upper edge of the lower one.
                    if (A.top > B.top) { ay = A.top; by = B.bot; }
                } catch (e) { continue; }
                if (![ax, ay, bx, by].every(isFinite)) continue;
                const W = ctx.canvas ? ctx.canvas.width : 4000;
                if ((ax < -50 && bx < -50) || (ax > W + 50 && bx > W + 50)) continue;
                ctx.beginPath();
                ctx.strokeStyle = L.full ? SHARED : PARTIAL;
                ctx.lineWidth = L.full ? 1.3 : 1;
                ctx.setLineDash(L.full ? [] : [4, 3]);
                // A gentle S through the gap: a straight line between two lollipops at
                // different x reads as a diagonal slash across whatever sits between them.
                const my = (ay + by) / 2;
                ctx.moveTo(ax, ay);
                ctx.bezierCurveTo(ax, my, bx, my, bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                for (const p of [[ax, ay], [bx, by]]) {
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], L.full ? 2.6 : 2.2, 0, Math.PI * 2);
                    ctx.fillStyle = L.full ? SHARED : PARTIAL;
                    ctx.fill();
                }
            }
            ctx.restore();
        };

        graph.__compareDraw = draw;
        graph.post_graphics_modifications = draw;
        const noun = kind === 'variants' ? 'mutation' : (kind === 'annotations' ? 'annotation' : 'oligo');
        const summary = {
            kind: kind, match: match, tracks: ts.length,
            topTrack: (top.t && top.t.name) || 'the first track',
            topTotal: top.items.length, shared: topShared, sharedByAll: topAll,
            links: links.length, counted: counts.reduce((a, b) => a + b, 0),
            capped: links.length >= MAX_LINKS,
        };
        graph.__compareSummary = summary;
        try { if (graph.wake) graph.wake(); } catch (e) { }
        tell(topShared
            ? (topShared + ' of ' + summary.topTotal + ' ' + noun + 's on ' + summary.topTrack
                + ' are also on the other ' + (ts.length - 1) + ' track' + (ts.length === 2 ? '' : 's')
                + (ts.length > 2 ? ' \u2014 ' + topAll + ' on all of them' : '')
                + (summary.capped ? ' (drawing the first ' + MAX_LINKS + ' lines)' : '')
                + '. Compare \u25b8 Clear removes the lines.')
            : ('Nothing in common: none of the ' + summary.counted + ' ' + noun + 's appears on more than one of these tracks'
                + (match === 'position'
                    ? (overlapping
                        ? ' at the same position. Try matching by rs number or protein change instead.'
                        : ' \u2014 and these tracks cover different regions, so no variant can be at the same position. Match by rs number or protein change instead.')
                    : '.')));
        return summary;
    })();
}

function () {

    // THE BLOCKS AN ALIGNMENT IS MADE OF, from its two aligned rows.
    //   const AB = await exec('baja/bio/align-blocks.js');
    //   AB.blocks(ra, rb, a0, b0)   ->  [{ n, a0, a1, b0, b1, identity, similarity }]
    //
    // ra and rb are the aligned rows with '-' for gaps; a0 and b0 are where the alignment
    // STARTS in each sequence, 0-based. A local alignment starts partway into each one, and
    // counting from zero instead puts every block that many units to the left -- on a track,
    // squarely on the wrong bases. That is the one thing this cannot be allowed to get
    // wrong, so the starts are arguments rather than assumed.
    //
    // A SHORT GAP DOES NOT END A BLOCK. Splitting at every single gap shatters one conserved
    // region into twenty fragments, each too small to mean anything and each drawing its own
    // bar and its own arrow, which is worse than drawing nothing. A run longer than
    // maxInnerGap is a real discontinuity and does end it.
    //
    // The same rules as the protein aligner's own block finder (py/bio/protein/
    // align-proteins.py), so a comparison drawn from the browser and one drawn from the
    // backend look like the same picture.

    return (async () => {

        const DEF = { minBlock: 8, maxInnerGap: 5, minIdentity: 0.35, maxBlocks: 12 };

        const blocks = (ra, rb, startA, startB, o) => {
            const opt = Object.assign({}, DEF, o || {});
            const A = '' + (ra || ''), B = '' + (rb || '');
            const n = Math.min(A.length, B.length);
            let ia = (+startA || 0), ib = (+startB || 0);
            const out = [];
            let cur = null, gapRun = 0;

            const close = () => {
                if (!cur) return;
                const len = Math.min(cur.a1 - cur.a0 + 1, cur.b1 - cur.b0 + 1);
                if (len >= opt.minBlock && cur.cols) {
                    const identity = cur.ident / cur.cols;
                    if (identity >= opt.minIdentity) {
                        out.push({ a0: cur.a0, a1: cur.a1, b0: cur.b0, b1: cur.b1,
                            columns: cur.cols, identical: cur.ident,
                            identity: identity, similarity: cur.simil / cur.cols });
                    }
                }
                cur = null;
            };

            for (let k = 0; k < n; k++) {
                const x = A[k], y = B[k];
                if (x === '-' || y === '-') {
                    gapRun++;
                    if (cur) {
                        if (gapRun > opt.maxInnerGap) close();
                        else cur.cols++;
                    }
                    if (x !== '-') ia++;
                    if (y !== '-') ib++;
                    continue;
                }
                gapRun = 0;
                if (!cur) cur = { a0: ia, a1: ia, b0: ib, b1: ib, cols: 0, ident: 0, simil: 0 };
                cur.cols++;
                cur.a1 = ia; cur.b1 = ib;
                if (x === y) { cur.ident++; cur.simil++; }
                else if (opt.similar && opt.similar(x, y)) cur.simil++;
                ia++; ib++;
            }
            close();

            // Best first by how much matched sequence each block accounts for, capped, then
            // back into order along A so the numbering reads left to right on the track.
            out.sort((p, q) => q.identical - p.identical);
            const kept = out.slice(0, opt.maxBlocks);
            kept.sort((p, q) => p.a0 - q.a0);
            kept.forEach((b, i) => { b.n = i + 1; });
            return kept;
        };

        // A run of units [i0, i1] to a span of track x, through a map of unit -> x. The map
        // RUNS BACKWARDS on a minus-strand track, so the ends are ordered here rather than
        // assumed, and the last unit's remaining bases are taken in.
        const span = (at, i0, i1, unit) => {
            const u = at(i0), v = at(i1);
            if (!isFinite(u) || !isFinite(v)) return null;
            const w = Math.max(1, (+unit || 1));
            const lo = Math.min(u, v), hi = Math.max(u, v) + (w - 1);
            return (hi > lo) ? { x1: lo, x2: hi + 1 } : null;
        };

        return { blocks: blocks, span: span, DEF: DEF };
    })();
}

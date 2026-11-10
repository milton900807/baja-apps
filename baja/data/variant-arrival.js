function (snpindel) {

    // EVERY VARIANT THAT ARRIVES ON A TRACK PASSES THROUGH HERE, and a burst of them is
    // pulsed once, together, when the burst stops.
    //   exec('baja/data/variant-arrival.js', snp);     // from Track.addsnpindel, not awaited
    //
    // WHY HERE AND NOT IN THE LOADERS. Thirty-seven files in this tree put variants on a
    // track: database loads, VCF, pasted rsIDs, pasted HGVS, the annotation menus, the
    // sequence menus, the editors. Wiring a pulse into each of them is a list that is wrong
    // the day someone adds the thirty-eighth, and it was already wrong -- two were wired and
    // the one actually being used was not. Both Track classes funnel all of them through
    // addsnpindel, so that is where this belongs.
    //
    // DEBOUNCED, because a load calls addsnpindel once per variant. Two hundred arrivals in
    // a tight loop are two hundred calls to this and ONE pulse, over all two hundred, once
    // the loop stops. The window is short enough to feel immediate and long enough that no
    // ordinary loop outruns it.
    //
    // THE GRAPH IS NOT PASSED IN, because Track has not got one: no back-reference, no
    // global handle. CurrentLayout.getStashed('graph') is how flexigraph/oligo.js and
    // sirna.js reach it from the same position, and it is used the same guarded way here.
    // No graph means no canvas to blink on, so the arrivals are simply dropped.
    //
    // OPENING A FILE DOES NOT PULSE. A track built from a saved file assigns its snpindels
    // array outright rather than adding them one at a time, so it never reaches this. That
    // is the right line: those variants did not arrive, they were always there.

    const W = (typeof window !== 'undefined') ? window : null;
    if (!W) return;
    const S = (W.__variantArrival = W.__variantArrival || { pending: [], timer: null });
    if (snpindel) S.pending.push(snpindel);
    if (S.timer) { try { clearTimeout(S.timer); } catch (e) { } }
    S.timer = setTimeout(() => {
        S.timer = null;
        const batch = S.pending.splice(0, S.pending.length);
        if (!batch.length) return;
        let g = null;
        try { g = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed) ? CurrentLayout.getStashed('graph') : null; } catch (e) { g = null; }
        if (!g) return;
        try { exec('baja/data/variant-pulse.js', g, batch); } catch (e) { }
    }, 350);
}

function () {

    // LOCAL RNA SECONDARY STRUCTURE, by nearest-neighbour thermodynamics.
    //
    // WHAT THIS IS. A hairpin finder. It searches a window for the most stable stem-loop it
    // can form, scoring stems with the Turner nearest-neighbour stacking parameters and
    // charging the standard hairpin-loop initiation penalty. It answers one question well:
    // "is there a stable hairpin sitting where it will get in the way?"
    //
    // WHAT THIS IS NOT. It is not a folding algorithm. It does not compute a minimum free
    // energy structure, it does not consider multi-branch loops, pseudoknots, coaxial
    // stacking or the partition function, and it will not reproduce ViennaRNA or mfold. A
    // real MFE fold is an O(n^3) dynamic program over the whole transcript and belongs in a
    // model plugged into lib/models.js, not in a scan that has to run while somebody types.
    //
    // WHY A HAIRPIN FINDER IS STILL WORTH HAVING. The two places structure demonstrably
    // decides output are both LOCAL and both near a known landmark:
    //
    //   the cap        a 43S subunit has to load onto an unstructured 5ʹ end. A stable
    //                  hairpin in the first ~40 nt blocks loading, and the effect is large.
    //   the start      structure across the initiation codon slows or skips recognition.
    //                  Some structure just DOWNSTREAM of the start can help by slowing the
    //                  ribosome at the right moment, which is why this is reported rather
    //                  than simply flagged as bad.
    //
    // Both are windows of a few dozen bases around a fixed point, which is exactly what this
    // can do honestly.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');

        // ---- nearest-neighbour stacking, Turner 2004, kcal/mol at 37 C -----------------------
        //
        // Keyed by the two stacked pairs read 5ʹ->3ʹ on the top strand: KEY = top[i] + top[i+1]
        // + bottom[i+1] + bottom[i], where bottom is the pairing partner. Watson-Crick pairs
        // and the GU wobble are included; GU values are the less certain half of this table
        // and are the reason a GU-heavy stem should not be trusted to a tenth of a kcal.
        const STACK = {
            // Watson-Crick / Watson-Crick
            'AAUU': -0.93, 'AUAU': -1.10, 'UAUA': -1.33, 'CUAG': -2.08, 'CAUG': -2.11,
            'GUAC': -2.24, 'GACU': -2.35, 'CGCG': -2.36, 'GGCC': -3.26, 'GCGC': -3.42,
            'UGAC': -2.11, 'ACGU': -2.24, 'CCGG': -3.26, 'UCAG': -2.08, 'AGUC': -2.35,
            'GGUC': -1.80, 'UUAA': -0.93, 'AAUG': -0.60,
            // GU wobble containing stacks (approximate)
            'GUUG': -0.50, 'UGGU': -0.50, 'GGUU': -1.50, 'UUGG': -1.50,
            'GUUA': -1.30, 'AUUG': -1.00, 'GCUG': -1.50, 'UGCG': -1.50,
            'CGUG': -1.40, 'GUCG': -1.40, 'UAGU': -1.00, 'GAUU': -1.30
        };

        // Hairpin loop initiation, by loop size. Turner values for 3-9; above that the
        // Jacobson-Stockmayer extrapolation, which is what every folding package uses.
        const LOOP = { 3: 5.4, 4: 5.6, 5: 5.7, 6: 5.4, 7: 6.0, 8: 5.5, 9: 6.4 };
        const loopPenalty = (n) => {
            if (n < 3) return Infinity;                    // sterically impossible
            if (LOOP[n] != null) return LOOP[n];
            return LOOP[9] + 1.75 * 0.6163 * Math.log(n / 9);   // 1.75 R T ln(n/9), RT=0.6163
        };

        // The terminal-mismatch and AU-end penalties, kept to the one that matters most: a
        // helix ending in an A-U or G-U pair is less stable than one ending in G-C.
        const AU_END = 0.45;

        const PAIRS = { 'AU': 1, 'UA': 1, 'GC': 1, 'CG': 1, 'GU': 1, 'UG': 1 };
        const canPair = (a, b) => !!PAIRS[a + b];
        const isAUend = (a, b) => (a + b) !== 'GC' && (a + b) !== 'CG';

        // Stack energy for the step between pair (i,j) and pair (i+1,j-1).
        const stackEnergy = (a1, a2, b2, b1) => {
            const k = a1 + a2 + b2 + b1;
            if (STACK[k] != null) return STACK[k];
            // Unlisted combination: fall back to a mild stabilisation rather than zero, and
            // it is a GU-containing step by construction. Documented so nobody reads a
            // precise number off a stem built mostly from these.
            return -0.8;
        };

        // ---- the hairpin search ------------------------------------------------------------------
        //
        // For every (i, j) that can pair, extend inward while the bases keep pairing and the
        // loop stays at least 3 nt, and keep the running total. Bulges and internal loops are
        // NOT explored: a stem is a contiguous helix here. That is the main simplification and
        // it makes the result a lower bound on stability -- a real hairpin with a one-base
        // bulge will be reported as the longer of its two perfect halves.
        const MAX_SPAN = 120;              // do not look for hairpins spanning more than this

        const bestHairpin = (rna, minStem) => {
            const s = rna;
            const n = s.length;
            const need = minStem || 4;
            let best = null;
            for (let i = 0; i < n; i++) {
                const jmax = Math.min(n - 1, i + MAX_SPAN);
                for (let j = jmax; j - i >= need * 2 + 3 - 1; j--) {
                    if (!canPair(s[i], s[j])) continue;
                    let dg = 0, len = 1, a = i, b = j;
                    while (a + 1 < b - 1 && canPair(s[a + 1], s[b - 1]) && (b - 1) - (a + 1) - 1 >= 3) {
                        dg += stackEnergy(s[a], s[a + 1], s[b - 1], s[b]);
                        a++; b--; len++;
                    }
                    if (len < need) continue;
                    const loop = (b - a - 1);
                    if (loop < 3) continue;
                    let total = dg + loopPenalty(loop);
                    if (isAUend(s[i], s[j])) total += AU_END;
                    if (best === null || total < best.dg) {
                        best = {
                            dg: total, from: i, to: j, stem: len, loop: loop,
                            stem5: s.slice(i, i + len), loopSeq: s.slice(a + 1, b),
                            stem3: s.slice(b, b + len)
                        };
                    }
                }
            }
            return best;
        };

        // ---- the two windows that matter ------------------------------------------------------
        //
        // capWindow  the first `capNt` bases of the transcript. A stable hairpin here blocks
        //            43S loading. The published rule of thumb is that anything below about
        //            -10 kcal/mol in the first 40 nt is a real problem and below -6 is worth
        //            looking at; those are the thresholds used for the verdicts.
        // startWindow  from `-15` before the A of the AUG to `+30` after it.
        const analyse = (opts) => {
            const o = opts || {};
            const full = GC.toRna(GC.cleanNt(o.sequence || ''));
            const cdsFrom = (typeof o.cdsFrom === 'number') ? o.cdsFrom : null;
            const capNt = o.capNt || 40;

            const out = { capWindow: null, startWindow: null, notes: [] };

            if (full.length >= 12) {
                const win = full.slice(0, Math.min(capNt, full.length));
                const h = bestHairpin(win, 4);
                out.capWindow = {
                    window: win, from: 0, to: win.length, hairpin: h,
                    dg: h ? h.dg : null,
                    verdict: !h ? 'no hairpin found'
                        : (h.dg <= -10 ? 'blocking' : (h.dg <= -6 ? 'marginal' : 'clear'))
                };
                out.notes.push(!h
                    ? 'No hairpin of four or more base pairs in the first ' + win.length + ' bases. That is what you want at the cap.'
                    : 'The most stable hairpin in the first ' + win.length + ' bases folds at '
                    + h.dg.toFixed(1) + ' kcal/mol (' + h.stem + ' bp stem, ' + h.loop + ' nt loop). '
                    + (h.dg <= -10 ? 'That is stable enough to impede 43S loading; open the 5ʹ end.'
                        : (h.dg <= -6 ? 'Borderline. Worth opening if expression is short of target.'
                            : 'Weak enough to be unwound during scanning.')));
            }

            if (cdsFrom != null && full.length > cdsFrom + 6) {
                const from = Math.max(0, cdsFrom - 15);
                const to = Math.min(full.length, cdsFrom + 30);
                const win = full.slice(from, to);
                const h = bestHairpin(win, 4);
                out.startWindow = {
                    window: win, from: from, to: to, hairpin: h,
                    dg: h ? h.dg : null,
                    verdict: !h ? 'no hairpin found'
                        : (h.dg <= -12 ? 'blocking' : (h.dg <= -8 ? 'marginal' : 'clear'))
                };
                out.notes.push(!h
                    ? 'No hairpin across the start codon.'
                    : 'The most stable hairpin around the start codon folds at ' + h.dg.toFixed(1)
                    + ' kcal/mol. ' + (h.dg <= -12
                        ? 'Structure this stable over an initiation codon reduces recognition; recode the first few codons.'
                        : 'Mild structure here is normal and some of it is thought to help by pausing the ribosome at the right moment.'));
            }

            return out;
        };

        // A coarse structure profile over the whole transcript, for a plot: the best local
        // hairpin ΔG in each window. Useful for seeing WHERE a transcript is structured
        // without claiming to have folded it.
        const profile = (seq, win, step) => {
            const s = GC.toRna(GC.cleanNt(seq));
            const w = win || 60, st = step || 30;
            const out = [];
            for (let i = 0; i + w <= s.length; i += st) {
                const h = bestHairpin(s.substr(i, w), 4);
                out.push({ at: i, dg: h ? h.dg : 0 });
            }
            return out;
        };

        return {
            STACK: STACK, loopPenalty: loopPenalty,
            canPair: canPair, bestHairpin: bestHairpin,
            analyse: analyse, profile: profile
        };
    })();
}

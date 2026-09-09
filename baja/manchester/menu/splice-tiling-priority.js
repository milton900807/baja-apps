return new Promise(async (resolve) => {

    // Tiling priority from a track's cis-regulatory model (baja/bio/splicing/cis-layer.js).
    //   const P = await exec('baja/manchester/menu/splice-tiling-priority.js');
    //
    // A steric-blocking ASO works by SITTING ON a sequence element and denying it to the
    // spliceosome, so which windows to aim at is decided by the sign of what the model
    // measured there:
    //
    //   exon INCLUSION  -> aim at windows the model scores NEGATIVE (suppressive). The
    //                      native sequence there is holding the site down; cover it and the
    //                      exon is used more.
    //   exon EXCLUSION  -> aim at windows the model scores POSITIVE (supportive). Cover the
    //                      sequence the site depends on and the exon is used less.
    //
    // The sign convention is the layer's own: impact = reference - scrambled, so positive
    // means the native sequence SUPPORTS the site. Nothing here re-derives it.
    //
    // This only ever REORDERS a design. It does not invent candidates, drop them, or change
    // a single base: a candidate with no overlap keeps its place at the back in the order the
    // designer produced, so the worst case is the design you would have had anyway.

    const MODES = { inclusion: 'inclusion', exclusion: 'exclusion' };

    // Every cis-regulatory layer on a track. A layer that has been saved and reloaded may be
    // a plain TrackLayer again rather than a CisLayer, so this matches on the DATA it
    // carries, not on the class -- `windows` plus the data_type the layer saves itself under.
    const modelLayers = (track) => {
        const out = [];
        try {
            for (const l of ((track && track.track_layers) || [])) {
                if (!l) continue;
                const isCis = (l.type === 'CisLayer')
                    || (typeof l.data_type === 'string' && l.data_type.indexOf('Cis:') === 0);
                if (isCis && Array.isArray(l.windows) && l.windows.length) out.push(l);
            }
        } catch (e) { }
        return out;
    };

    // Every scored window across those layers, in track coordinates.
    const modelWindows = (track) => {
        const out = [];
        for (const l of modelLayers(track)) {
            for (const w of (l.windows || [])) {
                if (!w) continue;
                const x0 = Math.min(+w.x0, +w.x1), x1 = Math.max(+w.x0, +w.x1);
                if (!isFinite(x0) || !isFinite(x1) || x1 <= x0) continue;
                if (!isFinite(+w.impact)) continue;
                out.push({
                    x0: x0, x1: x1,
                    impact: +w.impact,
                    // z and coverage may be absent on a very old saved layer; treat them as
                    // "no reason to discount" rather than dropping the window.
                    z: isFinite(+w.z) ? +w.z : 4,
                    covered: isFinite(+w.covered) ? +w.covered : 1,
                    site: l.site, which: l.which, layer: l.data_type
                });
            }
        }
        return out;
    };

    // The splice sites themselves, from every cis-regulatory layer on the track.
    //
    // These are KEEP-OUT zones for an inclusion design. A steric ASO sitting on the 5' or 3'
    // splice site blocks U1 / U2AF from it, which is how you force an exon to be SKIPPED --
    // the exact opposite of what an inclusion design is for. The site is off limits there no
    // matter how strong a suppressive window happens to sit next to it.
    //
    // Every layer's site is collected, not just the ones being targeted: a compound aimed at
    // a window belonging to one site can still land on a different site nearby.
    const modelSites = (track) => {
        const seen = {}, out = [];
        for (const l of modelLayers(track)) {
            const x = +l.site;
            if (!isFinite(x)) continue;
            const key = x + ':' + (l.which || '');
            if (seen[key]) continue;
            seen[key] = 1;
            out.push({ x: x, which: l.which || '' });
        }
        return out;
    };

    // Does a span sit on a splice site? `guard` widens the site by a few bases either side,
    // because the element being protected is the consensus around the junction, not the two
    // bases of the dinucleotide alone.
    const hitsSite = (span, sites, guard) => {
        const g = (guard == null) ? 3 : guard;
        for (const s of (sites || [])) {
            if (span.xi <= s.x + g && span.xf >= s.x - g) return s;
        }
        return null;
    };

    // The windows worth aiming at for a given outcome. minAbsZ drops windows whose effect is
    // inside the scramble-to-scramble spread: aiming a compound at noise is worse than not
    // prioritising at all, because it looks principled.
    const targetWindows = (windows, mode, minAbsZ) => {
        const z = (minAbsZ == null) ? 2 : minAbsZ;
        const wantNegative = (mode === MODES.inclusion);
        return (windows || []).filter((w) => {
            if (!w || !isFinite(w.impact)) return false;
            if (Math.abs(w.z) < z) return false;
            if (!(w.covered > 0)) return false;              // nothing real was scrambled there
            return wantNegative ? (w.impact < 0) : (w.impact > 0);
        });
    };

    // Every window worth believing, BOTH SIGNS. targetWindows answers "where do I tile";
    // this answers "what is under this compound" -- and a compound that covers a supportive
    // window while aiming at a suppressive one has its effect reduced by it, so the ranking
    // has to see both. Only the noise filter is applied.
    const scoredWindows = (windows, minAbsZ) => {
        const z = (minAbsZ == null) ? 2 : minAbsZ;
        return (windows || []).filter((w) =>
            w && isFinite(w.impact) && Math.abs(w.z) >= z && w.covered > 0);
    };

    // The SIGNED attribution a span covers: for every window it overlaps, that window's
    // impact scaled by how much of the WINDOW is covered, summed.
    //
    // Scaled by the window rather than by the compound because impact is a property of the
    // window's own span -- covering half of a window neutralises half of what that window
    // was doing, whatever length of oligo happened to do the covering. Summing then makes a
    // long compound spanning three elements score all three, which is the point.
    //
    // Sign is the whole answer. A more NEGATIVE sum means the compound covers more
    // suppressive sequence, which is what raises inclusion; a more POSITIVE sum means it
    // covers more supportive sequence, which is what drives exclusion.
    const spliceSum = (span, windows) => {
        let sum = 0;
        for (const w of (windows || [])) {
            const lo = Math.max(span.xi, w.x0), hi = Math.min(span.xf, w.x1);
            const cov = Math.max(0, hi - lo);
            if (!cov) continue;
            sum += (+w.impact) * (cov / Math.max(1, w.x1 - w.x0));
        }
        return sum;
    };

    // How much of `span` lies inside `w`, as a fraction of the SPAN. A short oligo sitting
    // wholly inside a window scores 1: coverage of the compound is what matters, since that
    // is what is being placed.
    const overlapFraction = (span, w) => {
        const lo = Math.max(span.xi, w.x0), hi = Math.min(span.xf, w.x1);
        const len = span.xf - span.xi;
        if (!(len > 0)) return 0;
        return Math.max(0, hi - lo) / len;
    };

    // Priority of one span: the strongest window it covers, weighted by how much of the span
    // sits in it. SUM would reward a long oligo for clipping several windows weakly; the
    // point is to sit on one element properly.
    const scoreSpan = (span, targets) => {
        let best = 0, bestW = null;
        for (const w of (targets || [])) {
            const f = overlapFraction(span, w);
            if (f <= 0) continue;
            const s = Math.abs(w.impact) * f;
            if (s > best) { best = s; bestW = w; }
        }
        return { score: best, window: bestW };
    };

    // Reorder candidates by priority, highest first. `getSpan` reads {xi, xf} off whatever
    // shape the caller holds. STABLE: equal scores, and the whole zero-score tail, keep the
    // designer's own order, so nothing is silently reshuffled on a tie.
    const rank = (candidates, targets, getSpan) => {
        const list = (candidates || []).map((c, i) => {
            const span = getSpan ? getSpan(c) : c;
            const r = (span && isFinite(span.xi) && isFinite(span.xf))
                ? scoreSpan(span, targets) : { score: 0, window: null };
            return { c: c, i: i, score: r.score, window: r.window };
        });
        list.sort((a, b) => (b.score - a.score) || (a.i - b.i));
        return list;
    };

    resolve({
        MODES: MODES,
        modelLayers: modelLayers,
        modelWindows: modelWindows,
        modelSites: modelSites,
        hitsSite: hitsSite,
        scoredWindows: scoredWindows,
        spliceSum: spliceSum,
        targetWindows: targetWindows,
        overlapFraction: overlapFraction,
        scoreSpan: scoreSpan,
        rank: rank
    });
});

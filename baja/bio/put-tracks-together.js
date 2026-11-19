function (graph, tracks, opts) {

    // PUT THESE TRACKS TOGETHER: side by side in y, lined up in x.
    //   exec('baja/bio/put-tracks-together.js', graph, [t1, t2], { })
    //
    // "put spag9_mRNA and MAPK8IP3_mRNA together" is a layout request, and the editor had no
    // layout operation at all: it offered the across-tracks library and then said combining
    // tracks was not something it does. Nobody asked to combine them. They are to be MOVED
    // next to each other and lined up, so the eye can run down one column and compare.
    //
    // TWO THINGS HAVE TO BE TRUE for a comparison to be readable, and they are different
    // things. Adjacent in y: no unrelated track between them. Aligned in x: the same base
    // offset in each lands at the same place across, which means one origin and ONE SCALE.
    // Same origin alone is not enough -- two mRNAs drawn at different bases-per-pixel drift
    // apart as the eye moves right, and the drift reads as a difference between the genes.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            const g = graph;
            const chosen = (tracks || []).filter(Boolean);
            if (!g || chosen.length < 2) {
                resolve({ error: 'name two or more tracks to put together' });
                return;
            }
            const all = (g.track || []).filter(Boolean);
            if (all.length < 2) { resolve({ error: 'there are not two tracks here' }); return; }

            // Either class of track can be on the board, and they keep their grid under
            // different names.
            const gridOf = (t) => (t && (t.grid || t.tgraph)) || null;
            const spanOf = (t) => {
                const n = Math.abs((+t.xf) - (+t.xi));
                return (isFinite(n) && n > 0) ? n : 0;
            };
            for (const t of chosen) {
                if (!gridOf(t)) { resolve({ error: ((t && t.name) || 'a track') + ' has no layout to move' }); return; }
            }

            // WHICH WAY IS DOWN. World y runs the OPPOSITE way to screen y: the canvas maps
            // it with Y(v) = yi + height - (v - ymin) * yscale, so a LARGER yi is HIGHER on
            // screen and the way to put one track under another is to SUBTRACT. Getting this
            // backwards does not throw or look broken in code; it quietly lays the board out
            // upside down. It is written once, here, and everything below goes through it.
            const higher = (a, b) => gridOf(b).yi - gridOf(a).yi;   // sorts top of screen first
            const DOWN = -1;                                        // add this * step to descend

            // THE RHYTHM OF THE BOARD IS MEASURED, NOT ASSUMED. Tracks are stacked by
            // whatever put them there, and a hard-coded gap would re-space the whole canvas
            // as a side effect of moving two of them. The median step is used because one
            // odd gap -- a track someone dragged away -- should not set the spacing for
            // everything else. Magnitude only: the direction is DOWN above.
            const ordered = all.slice().sort(higher);
            const steps = [];
            for (let i = 1; i < ordered.length; i++) {
                const d = Math.abs(gridOf(ordered[i]).yi - gridOf(ordered[i - 1]).yi);
                if (isFinite(d) && d > 0) steps.push(d);
            }
            steps.sort((a, b) => a - b);
            let step = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
            if (!(step > 0)) step = Math.abs(+g.trackVerticalSpacing || 1.6);

            // THE ANCHOR IS THE ONE HIGHEST ON SCREEN, not the first one named. The group
            // then forms where the user is already looking, instead of the board appearing
            // to jump because they happened to say the lower track first. Highest means the
            // LARGEST yi, for the reason above.
            let anchor = chosen[0];
            for (const t of chosen) { if (gridOf(t).yi > gridOf(anchor).yi) anchor = t; }
            const ag = gridOf(anchor);
            const aSpan = spanOf(anchor);
            const aScale = (aSpan > 0 && isFinite(ag.width)) ? (ag.width / aSpan) : 0;

            // ---- x: one origin, one scale ------------------------------------------------
            const lined = [];
            for (const t of chosen) {
                if (t === anchor) continue;
                const tg = gridOf(t);
                tg.xi = ag.xi;
                const sp = spanOf(t);
                if (aScale > 0 && sp > 0) {
                    // Its own length at the anchor's scale: a longer transcript reaches
                    // further right rather than being squeezed to the same width, which
                    // would make two sequences of different lengths look the same length.
                    tg.width = sp * aScale;
                }
                try { tg.setxmin(ag.xmin); tg.setxmax(ag.xmax); } catch (e) { }
                try { tg.rescale(); } catch (e) { }
                lined.push(t.name || '(unnamed)');
            }

            // ---- y: the chosen together, then everyone else in the order they were in ------
            // The rest keep their existing order. Re-laying the whole column is what stops a
            // moved track from landing on top of one that was already there, and reordering
            // the untouched ones would be a change nobody asked for.
            const rest = ordered.filter((t) => chosen.indexOf(t) < 0);
            const group = ordered.filter((t) => chosen.indexOf(t) >= 0);   // keeps screen order
            // Above and below on SCREEN: above is the larger yi.
            const above = rest.filter((t) => gridOf(t).yi > ag.yi);
            const below = rest.filter((t) => gridOf(t).yi <= ag.yi);

            // The group starts where the anchor already is, and everything from there
            // downward is re-laid in the order it was already in. Tracks above the anchor
            // are not touched at all: they are already clear of the group, and moving them
            // would be a change nobody asked for.
            let y = ag.yi;
            const place = (t) => {
                const tg = gridOf(t);
                tg.yi = y;
                try { tg.rescale(); } catch (e) { }
                y += DOWN * step;
            };
            for (const t of group) place(t);
            for (const t of below) place(t);

            const names = group.map((t) => t.name || '(unnamed)');

            // ---- show them ---------------------------------------------------------------
            try {
                // animateTo takes (xmin, xmax, ymin, ymax) in world coordinates, so the
                // bounds are worked out as min and max rather than as top and bottom: with
                // y inverted, naming them top and bottom is how they get passed the wrong
                // way round.
                const ys = group.map((t) => gridOf(t).yi);
                const yLo = Math.min.apply(null, ys) - step;
                const yHi = Math.max.apply(null, ys) + step;
                const x0 = ag.xi, x1 = ag.xi + Math.max.apply(null, group.map((t) => gridOf(t).width || 0));
                const pad = Math.max(1, (x1 - x0) * 0.04);
                await g.animateTo(x0 - pad, x1 + pad, yLo, yHi);
            } catch (e) { }
            try { g.wake(); } catch (e) { }

            try {
                g.setMessage(names.join(' and ') + ': now together'
                    + (lined.length ? ', lined up from the same origin at the same scale' : '')
                    + '.');
            } catch (e) { }

            resolve({ together: names, lined: lined, step: step, anchor: anchor.name || '' });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

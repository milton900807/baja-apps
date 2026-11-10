function () {
    // ZOOM TO ONE VARIANT AND SPOTLIGHT IT. The editor's single way of doing this.
    //   const ZV = await exec('baja/manchester/menu/zoom-to-variant.js');
    //   await ZV(graph, track, snp, { select: true });
    //
    // Written as its own module because "zoom to a variant" is not one call. Getting it
    // right means all of:
    //   * zooming close enough to SEE the base sequence but no closer, so the surrounding
    //     context is not thrown away -- track sequence letters only render above
    //     screencell > 5 px/base (baja/bio/track.js), so the target is just past that;
    //   * reserving VERTICAL room for the lollipop, which pops a fixed ~30-150 px (stem +
    //     head + label) up from the track and can fan either way. A zoom that sets only the
    //     x range leaves the marker clipped off the top of the screen -- the variant is on
    //     screen and its label is not;
    //   * spotlighting the variant (focus-mutation.js) BEFORE the zoom, so the animation
    //     lands on something already highlighted rather than highlighting after arrival.
    //
    // This lived inline in mutations-menu.js. The ClinVar splice tool then did its own
    // `graph.zoom(wx - 80, wx + 80)`, which set no y range and knew nothing about the
    // lollipop, so clicking a row in its results window put the variant somewhere near the
    // middle of the screen with its marker cut off. Two callers, one behaviour, one copy.
    //
    // opts is passed through to focus-mutation.js. `select: false` spotlights without
    // putting the variant in the selection window -- a tour stop is not a choice the user
    // made, a clicked row is.
    return async (graph, track, snp, opts) => {
        try {
            const tg = track && track.tgraph;
            if (!tg || !tg.X || !snp) return false;

            const TARGET_PXPB = 6;          // px per base: just above the >5 sequence-visible threshold
            let gridW = 800;
            try { gridW = (graph.grid && graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
            const worldPerBase = Math.abs((tg.screenWidth ? tg.screenWidth(1) : (tg.X(snp.xi + 1) - tg.X(snp.xi))) || 1) || 1;
            const halfWorld = (worldPerBase * gridW) / (2 * TARGET_PXPB);
            const centerW = tg.X(snp.xi);
            const xMin = centerW - halfWorld, xMax = centerW + halfWorld;
            const yA = tg.yi, yB = tg.yi + (tg.height || 0);
            const cy = (yA + yB) / 2;
            const span = (Math.abs(yB - yA) || 0.1);
            // Biased toward the top, which is the lollipop side, while keeping room below so a
            // down-fanned marker also stays visible.
            const topExt = span * 3.6;
            const botExt = span * 2.2;

            try { await exec('baja/manchester/menu/focus-mutation.js', graph, snp, 10000, Object.assign({ track: track }, opts || {})); } catch (e) { }
            if (graph.zoomRect) {
                await graph.zoomRect(xMin, xMax, cy + topExt, cy - botExt, 500);   // smooth animated
            } else if (graph.graph && graph.graph.setxmin) {
                graph.graph.setxmin(xMin); graph.graph.setxmax(xMax);
                graph.graph.setymin(cy + topExt); graph.graph.setymax(cy - botExt);
            }
            if (graph.wake) graph.wake();
            return true;
        } catch (e) { return false; }
    };
}

function (graph, links, opts) {

    // A LINE FROM A PLACE ON ONE TRACK TO A PLACE ON ANOTHER.
    //   exec('baja/bio/compare/track-link-layer.js', graph, [
    //       { from: { track: a, start: 1000, end: 1100 },
    //         to:   { track: b, start: 9000, end: 9100 }, label: '100%' }
    //   ], { id: 'sim', color: 'rgba(79,208,230,0.9)' })
    //
    // A layer is drawn by its own track and cannot reach the one above it, so a result that
    // belongs to TWO tracks -- this stretch of DNM1 is that stretch of DNM3 -- had nowhere
    // to be drawn. It was reported in a sentence, and a sentence cannot say WHERE.
    //
    // Drawn as a curve between the two spans, with the span marked at each end and the label
    // at the midpoint. It is painted over the tracks by the graph (gene.js __linkPainters),
    // after them, so it lands on top of whatever each track drew and moves with the canvas:
    // both ends are worked out from the tracks' own coordinates on every frame rather than
    // being baked in, so a pan, a zoom or a track being dragged keeps the line attached.
    //
    // IT IS NOT A LAYER and is not saved with the document. A line between two tracks is a
    // statement about a comparison that was just run, not data on either track; the layers
    // the comparison leaves behind are where the result lives.

    return (async () => {
        const o = opts || {};
        const id = '' + (o.id || 'link');
        const color = o.color || 'rgba(79,208,230,0.95)';
        const ink = o.labelColor || '#eaf6f9';
        const list = (links || []).filter((L) => L && L.from && L.to && L.from.track && L.to.track);

        if (!graph) return false;
        graph.__linkPainters = (graph.__linkPainters || []).filter((p) => p && p.id !== id);
        if (!list.length) { try { if (graph.wake) graph.wake(); } catch (e) { } return false; }

        const painter = {
            id: id,
            links: list,
            // Gone when either track has left the canvas: a line to a track that is not there
            // is drawn to wherever its coordinates used to be.
            dead: (g) => {
                try {
                    const on = (g && g.track) || [];
                    for (const L of list) {
                        if (on.indexOf(L.from.track) < 0 || on.indexOf(L.to.track) < 0) return true;
                    }
                    return false;
                } catch (e) { return true; }
            },
            draw: (ctx, g) => {
                const sx = (t, v) => g.X(t.tgraph.X(v));
                // WHERE THE LINE LEAVES A TRACK: THE MIDDLE OF IT, NOT ITS TOP EDGE.
                // tgraph.yi is the track's top, and a line that leaves from there reads as
                // belonging to whatever sits above the track rather than to the track
                // itself, and crosses everything drawn on it on the way out. The middle is
                // where the band it is about is, so the line starts on the thing it names.
                // An end may ask for another height as a fraction of the track, 0 at the
                // bottom and 1 at the top, which is the same scale the layers use.
                const sy = (t, frac) => {
                    const f = isFinite(frac) ? +frac : 0.5;
                    try {
                        const y = g.Y(t.tgraph.Y(f));
                        if (isFinite(y)) return y;
                    } catch (e) { }
                    return g.Y(t.tgraph.yi);        // a grid without a Y of its own
                };
                ctx.save();
                try { ctx.filter = 'none'; } catch (e) { }
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.font = '600 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (const L of list) {
                    let x1, x2, y1, y2, a1, b1, a2, b2;
                    try {
                        a1 = sx(L.from.track, L.from.start); b1 = sx(L.from.track, L.from.end);
                        a2 = sx(L.to.track, L.to.start); b2 = sx(L.to.track, L.to.end);
                        y1 = sy(L.from.track, L.from.y); y2 = sy(L.to.track, L.to.y);
                    } catch (e) { continue; }
                    if (![a1, b1, a2, b2, y1, y2].every((v) => isFinite(v))) continue;
                    x1 = (a1 + b1) / 2; x2 = (a2 + b2) / 2;

                    // THE SPAN AT EACH END, not just a point. A line landing in the middle of
                    // a 500 nt match says nothing about how much of the track it covers, and
                    // at a zoom where the match is half the screen that is the whole story.
                    ctx.globalAlpha = 0.85;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(Math.min(a1, b1), y1); ctx.lineTo(Math.max(a1, b1), y1);
                    ctx.moveTo(Math.min(a2, b2), y2); ctx.lineTo(Math.max(a2, b2), y2);
                    ctx.stroke();

                    // A curve rather than a straight line, bowed towards the midpoint, so two
                    // links that cross are told apart and neither is mistaken for a track.
                    const my = (y1 + y2) / 2;
                    ctx.globalAlpha = 0.7;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
                    ctx.stroke();

                    const label = ('' + (L.label == null ? '' : L.label));
                    if (label) {
                        const lx = (x1 + x2) / 2, ly = my;
                        const w = Math.max(26, ctx.measureText(label).width + 10);
                        ctx.globalAlpha = 0.95;
                        ctx.fillStyle = 'rgba(10,37,64,0.92)';
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(lx - w / 2, ly - 9, w, 18, 6);
                        else ctx.rect(lx - w / 2, ly - 9, w, 18);
                        ctx.fill();
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = ink;
                        ctx.fillText(label, lx, ly);
                    }
                }
                ctx.restore();
            }
        };
        graph.__linkPainters.push(painter);
        try { if (graph.wake) graph.wake(); } catch (e) { }
        return painter;
    })();
}

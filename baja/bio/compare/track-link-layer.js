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
                const labels = [];
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
                    // A line may carry a colour of its own, chosen from its menu. The
                    // painter's colour is what it falls back to, not what it overrides.
                    const col = L.color || color;
                    ctx.globalAlpha = (L === painter.chosen) ? 1 : 0.85;
                    ctx.strokeStyle = col;
                    ctx.lineWidth = (L === painter.chosen) ? 5 : 3;
                    ctx.beginPath();
                    ctx.moveTo(Math.min(a1, b1), y1); ctx.lineTo(Math.max(a1, b1), y1);
                    ctx.moveTo(Math.min(a2, b2), y2); ctx.lineTo(Math.max(a2, b2), y2);
                    ctx.stroke();

                    // A curve rather than a straight line, bowed towards the midpoint, so two
                    // links that cross are told apart and neither is mistaken for a track.
                    const my = (y1 + y2) / 2;
                    ctx.globalAlpha = (L === painter.chosen) ? 1 : 0.7;
                    ctx.lineWidth = (L === painter.chosen) ? 3.4 : 1.6;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
                    ctx.stroke();

                    // WHERE THIS LINE WAS JUST DRAWN, so a press can be matched to it. The
                    // curve is worked out again from the tracks on every frame, so the only
                    // honest thing to hit-test against is the frame that is on screen: a
                    // geometry worked out at press time from a different zoom would pick
                    // the wrong line, or none.
                    L.__geom = { x1: x1, y1: y1, x2: x2, y2: y2, my: my,
                        a1: a1, b1: b1, a2: a2, b2: b2 };

                    // The label is not drawn yet: every line bows through the same
                    // midpoint band, so they have to be placed against each other.
                    const label = ('' + (L.label == null ? '' : L.label));
                    if (label) {
                        labels.push({ L: L, text: label, x: (x1 + x2) / 2, y: my, col: col });
                    }
                }

                // ---- THE LABELS, PLACED AGAINST EACH OTHER -------------------------
                // Each line bows through the midpoint between its two tracks, so with a
                // line per match the labels land on top of one another and read as one
                // smear: "70% 65% 65 65% 6 70% rc" in place of six numbers. Each label now
                // takes the nearest free row to where its line passes, with a leader back
                // to the line when it had to move, so the number stays attached to the
                // line it is about. Nothing is dropped to make room: a label that cannot
                // find a clear row is drawn where it belongs rather than left out, because
                // a missing number reads as a match that is not there.
                const placed = [];
                const clear = (x, y, w) => {
                    for (const r of placed) {
                        if (Math.abs(y - r.y) < 19 && (Math.abs(x - r.x) * 2) < (w + r.w + 8)) return false;
                    }
                    return true;
                };
                labels.sort((p, q) => p.x - q.x);
                for (const it of labels) {
                    const w = Math.max(26, ctx.measureText(it.text).width + 10);
                    let ly = it.y;
                    for (let k = 1; k <= 14 && !clear(it.x, ly, w); k++) {
                        ly = it.y + ((k % 2) ? 1 : -1) * Math.ceil(k / 2) * 20;
                    }
                    placed.push({ x: it.x, y: ly, w: w });
                    it.L.__geom.lx = it.x; it.L.__geom.ly = ly; it.L.__geom.lw = w;

                    if (Math.abs(ly - it.y) > 1) {
                        ctx.globalAlpha = 0.5;
                        ctx.strokeStyle = it.col;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(it.x, it.y);
                        ctx.lineTo(it.x, ly);
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 0.95;
                    ctx.fillStyle = 'rgba(10,37,64,0.92)';
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(it.x - w / 2, ly - 9, w, 18, 6);
                    else ctx.rect(it.x - w / 2, ly - 9, w, 18);
                    ctx.fill();
                    ctx.strokeStyle = it.col;
                    ctx.lineWidth = (it.L === painter.chosen) ? 2 : 1;
                    ctx.stroke();
                    ctx.fillStyle = ink;
                    ctx.fillText(it.text, it.x, ly);
                }
                ctx.restore();
            },

            // ---- A LINE IS SOMETHING YOU CAN PRESS ---------------------------------
            // Drawn over the tracks and belonging to neither, a line had no way of being
            // picked: the only way to be rid of one was to run the comparison again
            // differently, and a set of twelve lines was all or nothing. The press is
            // matched against the curve AS DRAWN on the last frame, sampled along its
            // length, plus the span bar at each end and the label, which are the parts of
            // it people actually aim at.
            hit: (sx, sy) => {
                if (!isFinite(sx) || !isFinite(sy)) return null;
                const dSeg = (px, py, ax, ay, bx, by) => {
                    const vx = bx - ax, vy = by - ay;
                    const len2 = vx * vx + vy * vy;
                    let t = len2 ? (((px - ax) * vx + (py - ay) * vy) / len2) : 0;
                    t = Math.max(0, Math.min(1, t));
                    const qx = ax + vx * t, qy = ay + vy * t;
                    return Math.hypot(px - qx, py - qy);
                };
                // A line is 1.6 px wide and a curve is a poor target, so the press is
                // given room: a dozen pixels is close enough to mean that line and far
                // enough from the next to not be ambiguous.
                const NEAR = 12;
                let best = null, bestD = NEAR;
                for (const L of list) {
                    const G = L.__geom;
                    if (!G) continue;                 // never drawn, or off screen
                    let d = Math.min(
                        dSeg(sx, sy, Math.min(G.a1, G.b1), G.y1, Math.max(G.a1, G.b1), G.y1),
                        dSeg(sx, sy, Math.min(G.a2, G.b2), G.y2, Math.max(G.a2, G.b2), G.y2));
                    let px = G.x1, py = G.y1;
                    for (let k = 1; k <= 24 && d > 0; k++) {
                        const t = k / 24, u = 1 - t;
                        const qx = u * u * u * G.x1 + 3 * u * u * t * G.x1 + 3 * u * t * t * G.x2 + t * t * t * G.x2;
                        const qy = u * u * u * G.y1 + 3 * u * u * t * G.my + 3 * u * t * t * G.my + t * t * t * G.y2;
                        d = Math.min(d, dSeg(sx, sy, px, py, qx, qy));
                        px = qx; py = qy;
                    }
                    if (isFinite(G.lx) && isFinite(G.ly)
                        && Math.abs(sx - G.lx) <= (G.lw / 2 + 2) && Math.abs(sy - G.ly) <= 11) {
                        d = 0;                        // the label is part of its line
                    }
                    if (d < bestD) { bestD = d; best = L; }
                }
                return best;
            },

            // THE MENU ON ONE LINE. Colour it, drop it, or drop the whole set: the three
            // things there are to do with a line that is drawn over your data.
            menu: (L, g) => {
                const gg = g || graph;
                const where = (e) => (((e.track && e.track.name) || 'track') + ' '
                    + Math.min(e.start, e.end) + '\u2013' + Math.max(e.start, e.end));
                const redraw = () => { try { if (gg.wake) gg.wake(); } catch (e) { } };
                const close = () => { try { gg.showSideMenu(null); } catch (e) { } };
                const open = (rows) => {
                    try { (gg.openMenuAtPointer || gg.showSideMenu).call(gg, rows); } catch (e) { }
                };
                const drop = () => {
                    const i = list.indexOf(L);
                    if (i >= 0) list.splice(i, 1);
                    painter.chosen = null;
                    // A painter with nothing left to draw is not kept: an empty set of
                    // lines is an invisible thing still being asked for on every frame.
                    if (!list.length) {
                        try {
                            gg.__linkPainters = (gg.__linkPainters || []).filter((x) => x !== painter);
                        } catch (e) { }
                    }
                    redraw();
                };
                const dropAll = () => {
                    list.length = 0;
                    painter.chosen = null;
                    try {
                        gg.__linkPainters = (gg.__linkPainters || []).filter((x) => x !== painter);
                    } catch (e) { }
                    redraw();
                };
                const COLORS = [
                    ['rgba(79,208,230,0.95)', 'Cyan'], ['rgba(255,170,60,0.95)', 'Amber'],
                    ['rgba(120,230,150,0.95)', 'Green'], ['rgba(240,110,140,0.95)', 'Pink'],
                    ['rgba(180,150,255,0.95)', 'Violet'], ['rgba(245,245,245,0.95)', 'White']
                ];
                painter.chosen = L;
                redraw();
                const head = (L.label ? (L.label + ' \u00b7 ') : '') + where(L.from)
                    + '  \u2192  ' + where(L.to);
                open([
                    { label: head, header: true },
                    {
                        label: 'Color \u25b8', move: () => { },
                        click: () => open([{ label: 'Line colour', header: true }].concat(
                            COLORS.map(([hex, nm]) => ({
                                label: '  \u25a0 ' + nm + ((L.color || color) === hex ? '   \u2713' : ''),
                                move: () => { },
                                click: () => { L.color = hex; painter.chosen = null; redraw(); close(); }
                            })), [{
                                label: '  Back to the layer colour', move: () => { },
                                click: () => { L.color = null; painter.chosen = null; redraw(); close(); }
                            }]))
                    },
                    {
                        label: 'Remove', emphasis: 'danger', move: () => { },
                        click: () => { drop(); close(); }
                    },
                    {
                        label: 'Remove Graph Layer  (' + list.length + ' line'
                            + (list.length === 1 ? '' : 's') + ')',
                        emphasis: 'danger', move: () => { },
                        click: () => { dropAll(); close(); }
                    }
                ]);
            },

            // A press that missed every line puts the highlight down again.
            clearChoice: () => {
                if (!painter.chosen) return false;
                painter.chosen = null;
                try { if (graph.wake) graph.wake(); } catch (e) { }
                return true;
            }
        };
        graph.__linkPainters.push(painter);
        try { if (graph.wake) graph.wake(); } catch (e) { }
        return painter;
    })();
}

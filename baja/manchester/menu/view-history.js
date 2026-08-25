function (graph) {
    // View-state history: sample the grid (zoom/pan) state; once a view has been stable
    // for >2s, push it onto a browser-style back/forward stack. Everything is attached to
    // graph.__viewHistory so other modules (Navigate → History) can drive back()/forward().
    // Idempotent — safe to call more than once.
    if (graph.__viewHistory && graph.__viewHistory.__installed) return graph.__viewHistory;

    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
    const grid = (gg && gg.grid) ? gg.grid : gg;
    if (!grid || !grid.getxmin || !grid.setxmin) return null;

    const H = {
        __installed: true,
        stack: [],
        index: -1,
        navigating: false,
        MIN_STABLE_MS: 2000,
        _last: null,
        _stableSince: 0,
    };

    const snap = () => ({ xmin: grid.getxmin(), xmax: grid.getxmax(), ymin: grid.getymin(), ymax: grid.getymax() });
    const eq = (a, b) => !!a && !!b
        && Math.abs(a.xmin - b.xmin) < 1e-6 && Math.abs(a.xmax - b.xmax) < 1e-6
        && Math.abs(a.ymin - b.ymin) < 1e-6 && Math.abs(a.ymax - b.ymax) < 1e-6;

    H.current = () => (H.index >= 0 && H.index < H.stack.length) ? H.stack[H.index] : null;

    H.record = (st) => {
        if (eq(st, H.current())) return;                       // no-op if unchanged
        if (H.index < H.stack.length - 1) H.stack = H.stack.slice(0, H.index + 1); // drop forward branch
        H.stack.push(st);
        if (H.stack.length > 100) H.stack.shift();
        H.index = H.stack.length - 1;
    };

    // Animate from the current view to `st` with a cubic ease-out (fast, then slows as it
    // arrives). A new restore supersedes any in-flight one via the animation token.
    let _animId = 0;
    const restore = (st) => {
        if (!st) return;
        H.navigating = true;
        const from = snap();
        const to = st;
        const startMs = Date.now();
        const DUR = 600;
        const ease = (p) => 1 - Math.pow(1 - p, 3);
        const myId = ++_animId;
        const step = () => {
            if (myId !== _animId) return;   // superseded by a newer restore
            const p = Math.min(1, (Date.now() - startMs) / DUR);
            const e = ease(p);
            try {
                grid.setxmin(from.xmin + (to.xmin - from.xmin) * e);
                grid.setxmax(from.xmax + (to.xmax - from.xmax) * e);
                grid.setymin(from.ymin + (to.ymin - from.ymin) * e);
                grid.setymax(from.ymax + (to.ymax - from.ymax) * e);
                if (grid.rescale) grid.rescale();
                if (graph.wake) graph.wake();
            } catch (e2) { }
            if (p < 1) { setTimeout(step, 16); }
            else {
                // Reset the stability window so the restored view isn't re-recorded as "new".
                H._last = snap(); H._stableSince = 0;
                setTimeout(() => { if (myId === _animId) H.navigating = false; }, 200);
            }
        };
        step();
    };

    H.canBack = () => H.index > 0;
    H.canForward = () => H.index < H.stack.length - 1;
    H.back = () => { if (H.canBack()) { H.index--; restore(H.stack[H.index]); return true; } return false; };
    H.forward = () => { if (H.canForward()) { H.index++; restore(H.stack[H.index]); return true; } return false; };
    H.goto = (i) => { if (i >= 0 && i < H.stack.length) { H.index = i; restore(H.stack[i]); return true; } return false; };
    H.clear = () => { H.stack = []; H.index = -1; H._last = snap(); H._stableSince = Date.now(); };

    // Poll: record the view once it has held still for MIN_STABLE_MS.
    const tick = () => {
        try {
            if (H.navigating) return;
            const cur = snap();
            if (!isFinite(cur.xmin) || !isFinite(cur.xmax)) return;
            const now = Date.now();
            if (H._last && eq(cur, H._last)) {
                if (H._stableSince && (now - H._stableSince) >= H.MIN_STABLE_MS) {
                    H.record(cur);
                    H._stableSince = 0;   // recorded; wait for the next change
                }
            } else {
                H._last = cur;
                H._stableSince = now;     // a new stable window begins
            }
        } catch (e) { }
    };
    try { if (H._interval) clearInterval(H._interval); } catch (e) { }
    H._interval = setInterval(tick, 500);

    // Seed with the current view.
    H._last = snap();
    H._stableSince = Date.now();

    graph.__viewHistory = H;
    return H;
}

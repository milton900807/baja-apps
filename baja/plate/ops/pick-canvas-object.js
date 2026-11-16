function (pt, want, opts) {

    // ONE ANSWER TO "WHICH ONE?", FOR ANYTHING ON THE CANVAS.
    //
    // A table, a chart, a timeline and a note all live in different lists and are all things
    // somebody can name in a request. Two operations had grown their own copy of the search
    // and a third was about to, which is how "show me assumptions" and "share assumptions"
    // end up disagreeing about which table that is.
    //
    // THE ORDER IS THE SAME EVERY TIME, and it is the order of what the user has most
    // plainly told us:
    //   1. a name in the request, because they said it
    //   2. what the Ask button was pressed on, because they pressed it on that
    //   3. what is selected
    //   4. the only object there, if there is only one
    // and otherwise it asks rather than picking. opts.kind narrows it to tables ('plate') or
    // plots ('plot') when the caller can only act on one of those.

    const o = opts || {};
    const out = (x) => x;
    if (!pt) return out({ error: 'there is no project open' });

    const isPlot = (x) => !!(x && (typeof x.drawPlot === 'function' || x.__tlIs || x.points || x.type === 'timeline'));
    const kindOf = (x) => isPlot(x) ? 'plot' : (x && x.shape ? 'glyph' : 'plate');

    const all = [];
    for (const list of [pt.root, pt.m_plots, pt.plots, pt.objects]) {
        if (!Array.isArray(list)) continue;
        for (const x of list) { if (x && x.name != null && all.indexOf(x) < 0) all.push(x); }
    }
    const pool = o.kind ? all.filter((x) => kindOf(x) === o.kind) : all;
    if (!pool.length) return out({ error: 'there is nothing on the canvas yet' });

    const norm = (s) => ('' + (s == null ? '' : s)).trim().toLowerCase();
    const named = ('' + (want == null ? '' : want)).trim();

    // 1. NAMED IN THE REQUEST. An exact name wins outright, so a table called Assumptions
    //    beside one called Assumptions_2026 is not a coin toss; a near miss is still the
    //    thing, in either direction.
    if (named) {
        const w = norm(named);
        let hit = pool.filter((x) => norm(x.name) === w)[0] || null;
        if (!hit) hit = pool.filter((x) => norm(x.name).indexOf(w) >= 0 || w.indexOf(norm(x.name)) >= 0)[0] || null;
        if (hit) return out({ object: hit, kind: kindOf(hit), name: hit.name, how: 'named' });
        return out({ error: 'there is nothing called "' + named + '" on the canvas: this one has '
            + pool.map((x) => '"' + x.name + '"').join(', '), all: pool });
    }

    // 2. WHAT THE ASK BUTTON WAS PRESSED ON. Pressing Ask on a table and typing "share this"
    //    names it as plainly as typing its name does.
    for (const asked of [pt.__askedTable, pt.__askedTimeline]) {
        if (!asked) continue;
        const hit = (typeof asked === 'string')
            ? pool.filter((x) => norm(x.name) === norm(asked))[0]
            : (pool.indexOf(asked) >= 0 ? asked : null);
        if (hit) return out({ object: hit, kind: kindOf(hit), name: hit.name, how: 'asked_from' });
    }

    // 3. WHAT IS SELECTED.
    for (const sel of [pt.selectedPlate, pt.selected, pt.active]) {
        if (sel && pool.indexOf(sel) >= 0) {
            return out({ object: sel, kind: kindOf(sel), name: sel.name, how: 'selected' });
        }
    }

    // 4. THE ONLY ONE THERE.
    if (pool.length === 1) {
        return out({ object: pool[0], kind: kindOf(pool[0]), name: pool[0].name, how: 'only_one' });
    }

    return out({ error: 'which one? this project has '
        + pool.map((x) => '"' + x.name + '"').join(', '), all: pool });
}

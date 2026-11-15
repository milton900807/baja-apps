function (pm, o) {

    // PUT SOMETHING ON A TIMELINE: a milestone on a date, or an interval between two.
    //
    // A timeline draws startDate..endDate across its axis, and every point carries both an
    // axis position and a real date. The conversion between the two is the track's own
    // (__tlMsToX), so this asks it rather than working out hours-since-start for itself: the
    // axis unit is an hour from startDate, and a second implementation of that would be one
    // more thing to keep in step.
    //
    // A DATE OUTSIDE THE WINDOW GROWS THE WINDOW. It used to be refused, on the grounds that
    // a point off the end of the axis is drawn nowhere -- true, but the answer to "add a
    // milestone next week" on a timeline that starts in December is not to tell the user
    // their own timeline is the wrong shape. The window moves to take the date in, which is
    // what dragging the timeline's edge does by hand, and the reply says it happened.
    //
    // The track's own __tlSetWindow does the moving: it re-stamps every existing point with
    // its date first, so the points keep their dates while the axis changes under them. A
    // second implementation of that is how points end up sliding off their dates.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || typeof pt.__tlIs !== 'function') {
                resolve({ error: 'timelines are not available here' });
                return;
            }

            // The selected timeline, or the only one on the canvas.
            let tl = null;
            if (pt.selectedPlate && pt.__tlIs(pt.selectedPlate)) tl = pt.selectedPlate;
            if (!tl) {
                const all = (pt.root || []).filter((x) => pt.__tlIs(x));
                if (all.length === 1) tl = all[0];
                else if (all.length > 1) {
                    resolve({ error: 'there is more than one timeline here: select the one you mean' });
                    return;
                }
            }
            if (!tl) { resolve({ error: 'there is no timeline here to add to' }); return; }

            const asDate = (v) => {
                const s = ('' + (v == null ? '' : v)).trim();
                if (!s) return null;
                const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                const d = ymd
                    ? new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10))
                    : new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };

            const title = ('' + ((o && o.title) || '')).trim();
            if (!title) { resolve({ error: 'what should it be called?' }); return; }

            const win = pt.__tlWin(tl);
            const fmt = (ms) => (typeof pt.__tlFmt === 'function') ? pt.__tlFmt(ms) : new Date(ms).toDateString();
            const inWindow = (d) => d.getTime() >= win.startMs && d.getTime() <= win.endMs;

            if (!tl.scatterData) tl.scatterData = { points: [] };
            if (!Array.isArray(tl.scatterData.points)) tl.scatterData.points = [];

            const kind = ('' + ((o && o.kind) || 'milestone')).trim().toLowerCase();
            let added = null;
            let grew = null;

            // GROW THE WINDOW TO TAKE A DATE IN, by a day past it so the point is not drawn
            // exactly on the edge where the axis label sits. Only the side that needs to move
            // moves: a date before the start does not also push the end out.
            const DAY = 24 * 60 * 60 * 1000;
            const grow = (aMs, bMs) => {
                if (typeof pt.__tlSetWindow !== 'function') {
                    return { error: 'this timeline runs ' + fmt(win.startMs) + ' to ' + fmt(win.endMs)
                        + ', and that falls outside it' };
                }
                const lo = Math.min(aMs, bMs), hi = Math.max(aMs, bMs);
                const s = Math.min(win.startMs, lo - DAY);
                const e = Math.max(win.endMs, hi + DAY);
                pt.__tlSetWindow(tl, s, e);
                // The window just moved, so everything measured from it is stale.
                const w2 = pt.__tlWin(tl);
                win.startMs = w2.startMs; win.endMs = w2.endMs;
                win.xmin = w2.xmin; win.xmax = w2.xmax; win.range = w2.range; win.span = w2.span;
                return { grew: { start: fmt(w2.startMs), end: fmt(w2.endMs) } };
            };

            if (kind === 'interval') {
                const a = asDate(o && o.start), b = asDate(o && o.end);
                if (!a) { resolve({ error: 'when does it start?' }); return; }
                if (!b) { resolve({ error: 'when does it end?' }); return; }
                if (b.getTime() <= a.getTime()) {
                    resolve({ error: 'that ends before it starts' });
                    return;
                }
                if (!inWindow(a) || !inWindow(b)) {
                    const g = grow(a.getTime(), b.getTime());
                    if (g.error) { resolve({ error: g.error }); return; }
                    grew = g.grew;
                }
                added = {
                    x: pt.__tlMsToX(tl, b.getTime()), startX: pt.__tlMsToX(tl, a.getTime()),
                    y: 0.1, type: 'interval', name: title, color: '#0a2540',
                    date: b, __startDate: a
                };
            } else {
                const d = asDate(o && o.date);
                if (!d) { resolve({ error: 'what date is it on?' }); return; }
                if (!inWindow(d)) {
                    const g = grow(d.getTime(), d.getTime());
                    if (g.error) { resolve({ error: g.error }); return; }
                    grew = g.grew;
                }
                added = {
                    x: pt.__tlMsToX(tl, d.getTime()), y: 0.1, type: 'milestone',
                    name: title, color: 'red', date: d
                };
            }

            tl.scatterData.points.push(added);
            try { if (pt.__collab && !pt.__collab.holds(tl)) pt.__collab.acquire(tl); } catch (e) { }
            try { if (tl.grid && tl.grid.rescale) tl.grid.rescale(); } catch (e) { }
            try {
                pt.setMessage('Added ' + title + ' on ' + fmt(added.date.getTime())
                    + (grew ? ('  (timeline now runs ' + grew.start + ' to ' + grew.end + ')') : ''), 6);
            } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            resolve({ timeline: tl.name, kind: kind, title: title,
                date: added.date.toDateString(), extended: grew || null,
                points: tl.scatterData.points.length });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

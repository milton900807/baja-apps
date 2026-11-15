function (pm, o) {

    // PUT SOMETHING ON A TIMELINE: a milestone on a date, or an interval between two.
    //
    // A timeline draws startDate..endDate across its axis, and every point carries both an
    // axis position and a real date. The conversion between the two is the track's own
    // (__tlMsToX), so this asks it rather than working out hours-since-start for itself: the
    // axis unit is an hour from startDate, and a second implementation of that would be one
    // more thing to keep in step.
    //
    // A DATE OUTSIDE THE WINDOW IS REFUSED. The point would be placed off the end of the
    // axis, where nothing draws it -- so the request would appear to have done nothing, and
    // the user's next move is to type it again. Saying which window it has to fall in lets
    // them move the window or pick another date.

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

            if (kind === 'interval') {
                const a = asDate(o && o.start), b = asDate(o && o.end);
                if (!a) { resolve({ error: 'when does it start?' }); return; }
                if (!b) { resolve({ error: 'when does it end?' }); return; }
                if (b.getTime() <= a.getTime()) {
                    resolve({ error: 'that ends before it starts' });
                    return;
                }
                if (!inWindow(a) || !inWindow(b)) {
                    resolve({ error: 'this timeline runs ' + fmt(win.startMs) + ' to '
                        + fmt(win.endMs) + ', and that falls outside it' });
                    return;
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
                    resolve({ error: 'this timeline runs ' + fmt(win.startMs) + ' to '
                        + fmt(win.endMs) + ', and ' + fmt(d.getTime()) + ' falls outside it' });
                    return;
                }
                added = {
                    x: pt.__tlMsToX(tl, d.getTime()), y: 0.1, type: 'milestone',
                    name: title, color: 'red', date: d
                };
            }

            tl.scatterData.points.push(added);
            try { if (pt.__collab && !pt.__collab.holds(tl)) pt.__collab.acquire(tl); } catch (e) { }
            try { if (tl.grid && tl.grid.rescale) tl.grid.rescale(); } catch (e) { }
            try { pt.setMessage('Added ' + title + ' on ' + fmt(added.date.getTime()), 6); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            resolve({ timeline: tl.name, kind: kind, title: title,
                date: added.date.toDateString(), points: tl.scatterData.points.length });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

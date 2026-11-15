function (pm, o) {

    // MOVING A TIMELINE'S OWN RANGE: wider, narrower, or set to two dates.
    //
    // "Expand the timeline by 10% on both start and end" had no operation behind it, so a
    // request made from the timeline's own frame came back "Nothing here does that" about
    // the timeline it was asked from. Dragging and pinching a timeline already move the
    // window by hand; this is the same move, said in words.
    //
    // THE WINDOW IS MOVED BY THE TRACK'S OWN __tlSetWindow, which stamps every point with
    // its date before the axis changes so the points stay on their dates. Nothing here
    // recomputes an axis position: that arithmetic lives in one place.
    //
    // NARROWING THAT WOULD HIDE SOMETHING IS REFUSED. A point outside the window is drawn
    // off the end of the axis, where it is not deleted but cannot be seen -- which looks
    // exactly like having lost it. The names of what would go are given, so the ask can be
    // made again with them in mind.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const picked = await exec('baja/plate/ops/timeline-pick.js', pt, o && o.timeline);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const tl = picked.timeline;

            if (typeof pt.__tlSetWindow !== 'function') {
                resolve({ error: 'this timeline’s range cannot be changed here' });
                return;
            }

            const asDate = (v) => {
                const s = ('' + (v == null ? '' : v)).trim();
                if (!s) return null;
                const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                const d = ymd
                    ? new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10))
                    : new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };
            const num = (v) => {
                if (v == null || v === '') return 0;
                const n = parseFloat('' + v);
                return isFinite(n) ? n : NaN;
            };

            const win = pt.__tlWin(tl);
            const fmt = (ms) => (typeof pt.__tlFmt === 'function') ? pt.__tlFmt(ms) : new Date(ms).toDateString();
            const DAY = 24 * 60 * 60 * 1000;
            const was = { start: fmt(win.startMs), end: fmt(win.endMs) };

            let s = win.startMs, e = win.endMs;

            // Two dates said outright win over any amount: "from March to June" is not a
            // nudge of what is there, it is the answer.
            const ds = asDate(o && o.start), de = asDate(o && o.end);
            if (ds) s = ds.getTime();
            if (de) e = de.getTime();

            const pct = num(o && o.by_percent);
            const days = num(o && o.by_days);
            if (isNaN(pct) || isNaN(days)) { resolve({ error: 'by how much?' }); return; }

            const edge = ('' + ((o && o.edge) || 'both')).trim().toLowerCase();
            if (['start', 'end', 'both'].indexOf(edge) < 0) {
                resolve({ error: 'which end: start, end, or both?' });
                return;
            }

            // DATES WIN OUTRIGHT, and that means the amounts are not applied on top of them.
            // Both were being applied: "from March to June, 50% wider" set the two dates and
            // then widened past them, so the answer was neither of the two things asked for.
            if ((pct || days) && !(ds || de)) {
                // A percentage is of the range as it stands, worked out BEFORE either edge
                // moves, so "10% on both ends" adds the same amount at each end rather than
                // compounding the second on the first.
                const span = Math.max(1, e - s);
                const amount = (pct ? span * (pct / 100) : 0) + (days ? days * DAY : 0);
                if (edge === 'start' || edge === 'both') s -= amount;
                if (edge === 'end' || edge === 'both') e += amount;
            }

            if (!(isFinite(s) && isFinite(e))) { resolve({ error: 'that does not work out to two dates' }); return; }
            if (e - s < DAY) {
                resolve({ error: 'that would leave the timeline less than a day long' });
                return;
            }

            // ONLY WHAT IS VISIBLE NOW CAN BE HIDDEN BY THIS.
            //
            // The first version asked which points would fall outside the NEW range, and
            // refused a widening of 10% because three points were outside the range already
            // -- labels left over from how the timeline was built, which a wider window can
            // only help. A change is answerable for what IT takes away: a point that cannot
            // be seen now and still cannot be seen afterwards is not this request's doing.
            //
            // Dates are stamped first, from the axis positions, so a point that never had
            // one is compared as the date it is drawn on rather than skipped.
            try { if (typeof pt.__tlStampDates === 'function') pt.__tlStampDates(tl); } catch (e2) { }
            const span = (p, lo, hi) => {
                if (!p) return false;
                const t = p.date != null ? new Date(p.date).getTime() : NaN;
                const t0 = p.__startDate != null ? new Date(p.__startDate).getTime() : t;
                if (!isFinite(t) || !isFinite(t0)) return false;   // no date: nothing to judge
                return t >= lo && t <= hi && t0 >= lo && t0 <= hi;
            };
            const hidden = ((tl.scatterData && tl.scatterData.points) || []).filter(
                (p) => span(p, win.startMs, win.endMs) && !span(p, s, e));
            if (hidden.length) {
                resolve({ error: 'that would put ' + hidden.length + ' of what is already on this '
                    + 'timeline outside the range, where it cannot be seen: '
                    + hidden.map((p) => '"' + (p.name || '?') + '"').join(', ') });
                return;
            }

            pt.__tlSetWindow(tl, s, e);
            try { if (pt.__collab && !pt.__collab.holds(tl)) pt.__collab.acquire(tl); } catch (e2) { }
            const now = pt.__tlWin(tl);
            try { pt.setMessage((tl.name || 'Timeline') + ' now runs ' + fmt(now.startMs)
                + ' to ' + fmt(now.endMs), 6); } catch (e2) { }
            try { if (pt.wake) pt.wake(); } catch (e2) { }

            resolve({ timeline: tl.name, was: was,
                now: { start: fmt(now.startMs), end: fmt(now.endMs) } });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

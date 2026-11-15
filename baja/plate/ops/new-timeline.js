function (pm, o) {

    // A TIMELINE OVER A RANGE OF DATES.
    //
    // The work is already done by baja/draw/place-timeline-with-time-range.js, which the
    // timelines workbench uses, and which asks for a title itself. This resolves the two
    // dates and hands over. It is deliberately a wrapper and not a copy: there are already
    // ten near-identical timeline-building blocks across the app files, and an eleventh
    // would be the problem, not the feature.
    //
    // THE DATES ARE WORKED OUT BEFORE HERE, by the model, from today's date in the request's
    // context -- "the end of the year" is a different day depending on when it is asked, and
    // nothing in this file knows when it was asked. What this does is check that what came
    // back is two real dates in the right order, because a timeline running backwards, or
    // from an unparseable string, draws something nobody can read and says nothing about why.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || typeof pt.panToNextSpot !== 'function') {
                resolve({ error: 'there is no project open to put a timeline in' });
                return;
            }

            // A plain YYYY-MM-DD is read as local midnight, not UTC: new Date("2026-12-31")
            // is UTC midnight, which is the 30th in any timezone west of Greenwich, so a
            // timeline asked for "until the end of the year" would stop a day early.
            const asDate = (v) => {
                const s = ('' + (v == null ? '' : v)).trim();
                if (!s) return null;
                const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                const d = ymd
                    ? new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10))
                    : new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };

            const start = asDate(o && o.start);
            const end = asDate(o && o.end);
            if (!start) { resolve({ error: 'when should the timeline start?' }); return; }
            if (!end) { resolve({ error: 'when should it end?' }); return; }
            if (end.getTime() === start.getTime()) {
                resolve({ error: 'the start and the end are the same day' });
                return;
            }
            if (end.getTime() < start.getTime()) {
                resolve({ error: 'that ends before it starts: '
                    + start.toDateString() + ' to ' + end.toDateString() });
                return;
            }

            await exec('baja/draw/place-timeline-with-time-range', pt, start, end);
            resolve({ start: start.toDateString(), end: end.toDateString() });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

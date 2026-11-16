function (pm, o) {

    // A CALENDAR ON A TIMELINE.
    //
    // "Integrate my jeff@violetresearch.org calendar" had nothing behind it. What it wants is
    // what is in that calendar, on the timeline, beside everything else being planned.
    //
    // WHAT THIS DOES NOT DO, AND WHY. It does not sign in to Google. Reading a calendar
    // through Google's API needs the calendar scope on the consent screen, a refresh token
    // kept per user on the server, and Google's review of the app for a sensitive scope --
    // decisions for whoever owns the cloud project, not something to improvise. Every
    // calendar worth reading publishes a private iCal address that needs no sign-in, so that
    // is what is asked for, and it works today with no new credentials.
    //
    // THE ADDRESS IS A SECRET AND IS TREATED AS ONE: it is used for the fetch and is not
    // written into the project, into a cell, or into any message.
    //
    // Events land as milestones, and anything spanning more than a day as an interval, which
    // is what the timeline already draws. Nothing already on the timeline is touched.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt) { resolve({ error: 'there is no project open' }); return; }

            const picked = await exec('baja/plate/ops/timeline-pick.js', pt, o && o.timeline);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const tl = picked.timeline;

            let address = ('' + ((o && o.address) || '')).trim();
            if (!address) {
                // ASKED FOR, NOT GUESSED. An email address is not a calendar address, and the
                // request usually carries the first while meaning the second.
                let answer = null;
                try {
                    answer = await prompt('Which calendar?',
                        [{ label: 'Secret iCal address', multiline: true, rows: 3,
                            placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics' }],
                        {}, 560, 300);
                } catch (e) { answer = null; }
                address = ('' + ((answer && (answer['Secret iCal address'] || answer['Address'])) || '')).trim();
                if (!address) { resolve({ cancelled: true }); return; }
            }

            const win = pt.__tlWin(tl);
            const fmt = (ms) => (typeof pt.__tlFmt === 'function') ? pt.__tlFmt(ms) : new Date(ms).toDateString();
            const iso = (ms) => { const d = new Date(ms); const p2 = (v) => (v < 10 ? '0' : '') + v;
                return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };

            let out = null;
            try {
                // ONLY THE TIMELINE'S OWN WINDOW IS ASKED FOR. A calendar holds years; a
                // timeline shows weeks, and everything outside it would be dropped by
                // timeline_add anyway, after being fetched and counted as a success.
                out = await exec('py/bio/project/ical-read.py', address,
                    JSON.stringify({ from: iso(win.startMs), to: iso(win.endMs), limit: 300 }));
            } catch (e) {
                resolve({ error: 'could not read that calendar: '
                    + ('' + (e && e.message ? e.message : e)) });
                return;
            }
            if (!out || out.status !== 'OK') {
                resolve({ error: (out && out.error) || 'nothing came back from that address' });
                return;
            }
            const events = Array.isArray(out.events) ? out.events : [];
            if (!events.length) {
                resolve({ error: 'that calendar has nothing between ' + fmt(win.startMs)
                    + ' and ' + fmt(win.endMs)
                    + (out.skipped_recurring ? ('. ' + out.skipped_recurring + ' repeating '
                        + 'event' + (out.skipped_recurring === 1 ? '' : 's') + ' could not be '
                        + 'read: repeats are not worked out') : '') });
                return;
            }

            // Already there, by name and date: asking twice should not double everything up.
            // An interval's `date` is the day it ENDS; the day it starts is __startDate. Keyed
            // by the end, a calendar read twice put every multi-day event on a second time,
            // since the event is known by the day it begins.
            const have = {};
            for (const p of ((tl.scatterData && tl.scatterData.points) || [])) {
                if (!p || !p.name) continue;
                let d = null;
                try {
                    const when = (p.type === 'interval' && p.__startDate != null) ? p.__startDate : p.date;
                    d = when ? new Date(when) : null;
                } catch (e) { d = null; }
                have[('' + p.name).trim().toLowerCase() + '|' + (d && !isNaN(d) ? iso(d.getTime()) : '')] = true;
            }

            let added = 0, already = 0, failed = 0;
            const why = [];
            for (const ev of events) {
                const title = ('' + (ev.title || '')).trim();
                if (!title) { failed++; continue; }
                const key = title.toLowerCase() + '|' + ev.start;
                if (have[key]) { already++; continue; }
                const spans = ev.end && ev.end !== ev.start;
                const args = spans
                    ? { timeline: tl.name, title: title, kind: 'interval', start: ev.start, end: ev.end }
                    : { timeline: tl.name, title: title, kind: 'milestone', date: ev.start };
                let r = null;
                try { r = await exec('baja/plate/ops/timeline-add.js', pt, args); }
                catch (e) { r = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (r && r.error) { failed++; if (why.length < 2) why.push(r.error); }
                else { added++; have[key] = true; }
            }

            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage('Put ' + added + ' event' + (added === 1 ? '' : 's') + ' from '
                    + (out.name ? ('"' + out.name + '"') : 'the calendar') + ' on ' + tl.name
                    + (already ? ('. ' + already + ' were already there') : '')
                    + (out.skipped_recurring ? ('. ' + out.skipped_recurring + ' repeating left out')
                        : '')
                    + (failed ? ('. ' + failed + ' could not be added: ' + why.join('; ')) : ''), 10);
            } catch (e) { }

            resolve({ timeline: tl.name, calendar: out.name || undefined, added: added,
                already_there: already || undefined, repeating_skipped: out.skipped_recurring || undefined,
                failed: failed || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

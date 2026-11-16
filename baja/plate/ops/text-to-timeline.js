function (pm, o) {

    // MILESTONES AND INTERVALS READ OUT OF TEXT.
    //
    // "Integrate gmail and load milestones and intervals derived from it" is two jobs, and
    // only the first is about Gmail: getting the mail, and reading commitments out of it.
    // This is the second, and it does not care where the text came from -- a pasted thread
    // today, a mailbox when there is one to read. Built this way round because the reading
    // is the part with the judgment in it, and it can be looked at and corrected now rather
    // than waiting on a consent screen.
    //
    // NOTHING GOES ON THE TIMELINE UNSEEN. What comes back is shown first, with the words it
    // was taken from, and the user says yes. A date read out of a sentence is a guess that
    // looks like a fact once it is drawn on a timeline, and the sentence beside it is the
    // only way to tell the two apart.
    //
    // THE TEXT IS EVIDENCE, NEVER AN INSTRUCTION. Mail contains requests, and some of it is
    // written to be read by a machine. It is passed to the reader as text to find dates in,
    // the reader is told so, and nothing in it decides what happens here.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const picked = await exec('baja/plate/ops/timeline-pick.js', pt, o && o.timeline);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const tl = picked.timeline;

            let text = ('' + ((o && o.text) || '')).trim();
            if (!text) {
                let answer = null;
                try {
                    answer = await exec('baja/lib/prompt-text.js', {
                        title: 'Read dates out of text',
                        message: 'Paste the mail, the notes or the thread. Anything with dates '
                            + 'in it: what is found is shown before it goes on ' + (tl.name || 'the timeline') + '.',
                        placeholder: 'Paste here',
                        value: '',
                        actions: [{ key: 'go', label: 'READ IT' }]
                    });
                } catch (e) { answer = null; }
                text = ('' + ((answer && answer.text) || '')).trim();
                if (!text) { resolve({ cancelled: true }); return; }
            }

            const win = pt.__tlWin(tl);
            const iso = (ms) => { const d = new Date(ms); const p2 = (v) => (v < 10 ? '0' : '') + v;
                return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
            const today = iso(Date.now());

            let out = null;
            try {
                out = await exec('py/bio/project/text-events.py', text, JSON.stringify({
                    today: today,
                    sent: ('' + ((o && o.sent) || '')).trim() || null,
                    from: iso(win.startMs), to: iso(win.endMs), limit: 60
                }));
            } catch (e) {
                resolve({ error: 'could not read that: ' + ('' + (e && e.message ? e.message : e)) });
                return;
            }
            if (!out || out.status !== 'OK') {
                resolve({ error: (out && out.error) || 'nothing came back' });
                return;
            }
            const events = Array.isArray(out.events) ? out.events : [];
            if (!events.length) {
                resolve({ error: out.note || 'nothing in that text has a date that could be placed' });
                return;
            }

            // WHAT WAS FOUND, BEFORE IT IS PUT ANYWHERE. Shown with the words each one came
            // from, and whether the date was stated or worked out.
            if (!(o && o.confirmed)) {
                const lines = events.map((e) => {
                    const when = e.kind === 'interval'
                        ? (('' + e.start).replace('T', ' ') + ' to ' + ('' + e.end).replace('T', ' '))
                        : ('' + e.date).replace('T', ' ');
                    return '• ' + e.title + '  (' + when + ')'
                        + (e.confidence === 'implied' ? '  [worked out, not stated]' : '')
                        + (e.quote ? ('\n    "' + e.quote + '"') : '');
                }).join('\n');
                let say = null;
                try {
                    say = await exec('baja/lib/prompt-text.js', {
                        title: events.length + ' found in that text',
                        message: 'These go on ' + (tl.name || 'the timeline') + '. Take out any '
                            + 'line that is wrong before adding them'
                            + (out.dropped ? ('. ' + out.dropped + ' more had no date that could be placed') : '')
                            + '.',
                        value: lines,
                        actions: [{ key: 'go', label: 'ADD THESE' }]
                    });
                } catch (e) { say = null; }
                const kept = ('' + ((say && say.text) || '')).trim();
                if (!kept) { resolve({ cancelled: true }); return; }
                // Only the ones still named in what came back. Edited titles are matched by
                // the line the user left, so striking a line out really removes that event.
                const left = kept.toLowerCase();
                const keep = events.filter((e) => left.indexOf(('' + e.title).toLowerCase()) >= 0);
                if (!keep.length) { resolve({ cancelled: true }); return; }
                events.length = 0;
                for (const e of keep) events.push(e);
            }

            let added = 0, failed = 0;
            const why = [];
            for (const e of events) {
                const args = (e.kind === 'interval')
                    ? { timeline: tl.name, title: e.title, kind: 'interval', start: e.start, end: e.end }
                    : { timeline: tl.name, title: e.title, kind: 'milestone', date: e.date };
                let r = null;
                try { r = await exec('baja/plate/ops/timeline-add.js', pt, args); }
                catch (err) { r = { error: ('' + (err && err.message ? err.message : err)) }; }
                if (r && r.error) { failed++; if (why.length < 2) why.push(e.title + ': ' + r.error); }
                else added++;
            }

            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage('Put ' + added + ' on ' + tl.name
                    + (out.dropped ? ('. ' + out.dropped + ' had no date that could be placed') : '')
                    + (failed ? ('. ' + failed + ' could not be added: ' + why.join('; ')) : ''), 10);
            } catch (e) { }

            resolve({ timeline: tl.name, added: added, undated: out.dropped || undefined,
                failed: failed || undefined, note: out.note || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

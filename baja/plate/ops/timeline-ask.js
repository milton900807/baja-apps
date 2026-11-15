function (plot, pt) {

    // ASKING A TIMELINE FOR SOMETHING, FROM ITS OWN FRAME.
    //
    // The button that calls this sits on the timeline's title bar, next to maximize, which is
    // where you are already looking when you want to do something to the thing in front of
    // you. Three earlier placements failed for the same reason: a field somewhere else on the
    // screen does not read as belonging to this object, and twice it could not be seen at all.
    //
    // THE TIMELINE IS THE CONTEXT. Its name and the two dates it covers go into the request,
    // so "a milestone on the 3rd" has a month and a year to be the 3rd of, and the model is
    // never asked to guess a range it was not told.
    //
    // It routes to project-command.js, the one place a sentence is turned into an operation or
    // into the menu item that performs it. Nothing here runs anything itself: a second
    // interpreter for timelines is exactly the duplicate this app keeps growing.

    return new Promise(async (resolve) => {
        const track = (pt && pt.plateTrack) ? pt.plateTrack : pt;
        const say = (m) => { try { if (track && track.setMessage) track.setMessage(m, 8); } catch (e) { } };
        try {
            if (!plot) { resolve({ error: 'there is no timeline to ask about' }); return; }

            const name = ('' + ((plot.name) || '')).trim();
            const when = (d) => {
                try { const x = new Date(d); return isNaN(x.getTime()) ? null : x.toDateString(); }
                catch (e) { return null; }
            };
            const from = when(plot.startDate), to = when(plot.endDate);

            // Said, not assumed: if the dates are missing the box says so rather than
            // offering a range it does not have, because a date typed against a range that
            // was never shown is the one thing that cannot be checked afterwards.
            const range = (from && to)
                ? ('It runs ' + from + ' to ' + to + '. ')
                : 'This timeline has no dates set yet. ';

            let r = null;
            try {
                r = await exec('baja/lib/prompt-text.js', {
                    title: 'Ask about ' + (name || 'this timeline'),
                    message: range + 'Add a milestone on a date, or a phase between two dates.',
                    placeholder: 'add a milestone called First patient dosed on March 3',
                    value: '',
                    historyKey: 'timeline-ask',
                    actions: [{ key: 'go', label: 'GO' }]
                });
            } catch (e) { r = null; }

            const text = ('' + ((r && r.text) || '')).trim();
            if (!text) { resolve({ cancelled: true }); return; }

            let menus = [];
            try { menus = (track && track.__lastMenubar) ? (track.__lastMenubar() || []) : []; } catch (e) { menus = []; }

            await exec('baja/plate/menu/project-command.js', {
                menus: menus,
                pm: track,
                text: text,
                context: {
                    timeline: name || null,
                    start: from || null,
                    end: to || null,
                    showing: 'a timeline'
                },
                setError: say
            });
            resolve({ asked: text });
        } catch (e) {
            // A failure here would otherwise look like a button that does nothing.
            const m = ('' + (e && e.message ? e.message : e));
            say('Could not read that: ' + m);
            resolve({ error: m });
        }
    });
}

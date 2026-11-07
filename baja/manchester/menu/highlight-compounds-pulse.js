function (graph, track, opts) {

    // PULSE EVERY COMPOUND ON A TRACK MAGENTA, for as long as it takes to find them.
    //
    //   await exec('baja/manchester/menu/highlight-compounds-pulse.js', graph, track, { ms: 60000 });
    //   await exec('baja/manchester/menu/highlight-compounds-pulse.js', graph, track, { stop: true });
    //
    // o.highlight__ is not a boolean: the renderer hands it straight to drawVerticalLineScreen
    // as the COLOR of the markers at each compound's ends (baja/bio/track-flexi.js), so setting
    // it to a color is what draws them, and toggling it is the twinkle. A static highlight is
    // easy to lose on a busy track; motion is what the eye catches.
    //
    // WHY A MINUTE, AND WHY IT CAN BE STOPPED. Five seconds is long enough to answer "did that
    // land" and too short to answer "where are they all" -- which you answer by panning and
    // zooming while they blink, and five seconds does not survive the first scroll. A minute
    // does. Anything running that long has to be interruptible, so running it again stops it,
    // Escape stops it, and it stops itself when the time is up.
    //
    // Whatever each compound had in highlight__ before is restored at the end, so this cannot
    // clobber a highlight something else set (an off-target run marks its hits the same way).
    //
    // Resolves { started, stopped, count, ms }.
    return (async () => {
        const o = opts || {};
        const MAGENTA = o.color || '#ff2fd6';
        const EVERY = Math.max(120, Math.round(+o.intervalMs || 450));
        const MS = Math.max(1000, Math.round(+o.ms || 60000));
        const wake = () => { try { if (graph && graph.wake) graph.wake(); } catch (e) { } };
        const say = (m) => { if (!m) return; try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        // Teardown for one pulse, whoever asks for it: the timer, the key handler, the
        // highlight each compound had before, and the slot on the graph.
        const teardown = (st, msg) => {
            if (!st || st.done) return false;
            st.done = true;
            try { clearInterval(st.timer); } catch (e) { }
            try { clearTimeout(st.endTimer); } catch (e) { }
            try { document.removeEventListener('keydown', st.onKey, true); } catch (e) { }
            try { st.list.forEach((c, i) => { c.highlight__ = st.prev[i]; }); } catch (e) { }
            try { if (graph && graph.__compoundPulse === st) graph.__compoundPulse = null; } catch (e) { }
            wake();
            say(msg);
            return true;
        };

        // ONE PULSE AT A TIME per canvas: a second over the same compounds would fight the
        // first for highlight__ and neither would put back the right value. Asking again is
        // therefore how you stop the one that is running.
        const live = (graph && graph.__compoundPulse) || null;
        if (o.stop) return { started: false, stopped: teardown(live, o.quiet ? '' : 'Highlighting stopped.'), count: 0, ms: 0 };
        if (live) return { started: false, stopped: teardown(live, 'Highlighting stopped.'), count: 0, ms: 0 };

        const list = ((track && track.oligos) || []).filter(Boolean);
        if (!list.length) {
            say('There are no compounds on ' + ((track && track.name) || 'this track') + ' to highlight.');
            return { started: false, stopped: false, count: 0, ms: 0 };
        }

        const st = {
            list: list, prev: list.map((c) => c.highlight__),
            timer: null, endTimer: null, onKey: null, done: false,
        };
        st.onKey = (e) => { if (e && e.key === 'Escape') teardown(st, 'Highlighting stopped.'); };
        st.stop = (msg) => teardown(st, msg);
        try { document.addEventListener('keydown', st.onKey, true); } catch (e) { }
        if (graph) graph.__compoundPulse = st;

        const t0 = Date.now();
        const name = (track && track.name) || 'track';
        const noun = list.length + ' compound' + (list.length === 1 ? '' : 's');
        // The message bar clears itself after a few seconds, so a minute-long job has to keep
        // saying what it is doing -- with the time left, which is also how the user knows it
        // will stop on its own rather than having stuck.
        const tick = () => {
            const left = Math.max(0, Math.ceil((MS - (Date.now() - t0)) / 1000));
            say('Highlighting ' + noun + ' on ' + name + ' — ' + left
                + 's left. Run it again, or press Escape, to stop.');
        };
        tick();

        let on = false, sinceSay = 0;
        const everySay = Math.max(1, Math.round(3000 / EVERY));
        st.timer = setInterval(() => {
            // The pulse was replaced or torn down from elsewhere: stop touching the compounds.
            if (st.done || !graph || graph.__compoundPulse !== st) { try { clearInterval(st.timer); } catch (e) { } return; }
            on = !on;
            for (const c of list) { try { c.highlight__ = on ? MAGENTA : false; } catch (e) { } }
            wake();
            if (++sinceSay >= everySay) { sinceSay = 0; tick(); }
        }, EVERY);
        st.endTimer = setTimeout(() => {
            teardown(st, 'Finished highlighting ' + noun + ' on ' + name + '.');
        }, MS);

        return { started: true, stopped: false, count: list.length, ms: MS };
    })();
}

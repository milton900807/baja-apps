function (graph, variants, opts) {

    // PULSE THE VARIANTS THAT JUST ARRIVED, so they can be found before the track settles.
    //
    //   await exec('baja/data/variant-pulse.js', graph, placedSnpIndels);          // a minute
    //   await exec('baja/data/variant-pulse.js', graph, null, { stop: true });     // stop it
    //
    // The sibling of baja/manchester/menu/highlight-compounds-pulse.js, same shape and the
    // same reasoning, over snpindels instead of oligos.
    //
    // WHAT BLINKS. SnpIndel.highlight is the selection ring the renderer already draws
    // around a marker, and it sits OUTSIDE the head rather than recolouring it, so the
    // variant keeps whatever its colour is saying -- the clinical call, or the batch's loss
    // of function reading -- while the ring blinks around it. Toggling the colour instead
    // would make the thing being pointed at unreadable for the minute it was being pointed
    // at, which is the wrong trade.
    //
    // WHY A MINUTE. Five seconds answers "did that land" and not "where did they all go",
    // which is answered by panning and zooming while they blink, and five seconds does not
    // survive the first scroll.
    //
    // ADDING AGAIN RESTARTS IT over the new arrivals. The compound pulse treats a second
    // call as "stop", because there it is a command the user issued twice; here it is a
    // consequence of loading more variants, and the ones that just arrived are the ones that
    // need finding. The running pulse is torn down first, putting back every highlight it
    // borrowed, so the two can never fight over the same marker.
    //
    // Whatever each variant had in highlight before is restored at the end, so a search
    // result or a hand-made selection survives a pulse that happened to cover it.
    //
    // Resolves { started, stopped, count, ms }.
    return (async () => {
        const o = opts || {};
        const EVERY = Math.max(120, Math.round(+o.intervalMs || 420));
        const MS = Math.max(1000, Math.round(+o.ms || 60000));
        const wake = () => { try { if (graph && graph.wake) graph.wake(); } catch (e) { } };
        const say = (m) => { if (!m || o.quiet) return; try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        const teardown = (st, msg) => {
            if (!st || st.done) return false;
            st.done = true;
            try { clearInterval(st.timer); } catch (e) { }
            try { clearTimeout(st.endTimer); } catch (e) { }
            try { document.removeEventListener('keydown', st.onKey, true); } catch (e) { }
            try { st.list.forEach((v, i) => { v.highlight = st.prev[i]; }); } catch (e) { }
            try { if (graph && graph.__variantPulse === st) graph.__variantPulse = null; } catch (e) { }
            wake();
            say(msg);
            return true;
        };

        const live = (graph && graph.__variantPulse) || null;
        if (o.stop) return { started: false, stopped: teardown(live, o.quiet ? '' : 'Highlighting stopped.'), count: 0, ms: 0 };
        // Restart rather than toggle: see ADDING AGAIN above.
        if (live) teardown(live, '');

        const list = (Array.isArray(variants) ? variants : (variants ? [variants] : [])).filter(Boolean);
        if (!list.length) return { started: false, stopped: false, count: 0, ms: 0 };

        const st = {
            list: list, prev: list.map((v) => !!v.highlight),
            timer: null, endTimer: null, onKey: null, done: false,
        };
        st.onKey = (e) => { if (e && e.key === 'Escape') teardown(st, 'Highlighting stopped.'); };
        st.stop = (msg) => teardown(st, msg);
        try { document.addEventListener('keydown', st.onKey, true); } catch (e) { }
        if (graph) graph.__variantPulse = st;

        const t0 = Date.now();
        const noun = list.length + ' new variant' + (list.length === 1 ? '' : 's');
        // The message bar clears itself after a few seconds, so a minute-long job has to keep
        // saying what it is, with the time left -- which is also how the user knows it will
        // stop on its own rather than having stuck.
        const tick = () => {
            const left = Math.max(0, Math.ceil((MS - (Date.now() - t0)) / 1000));
            say('Highlighting ' + noun + ' — ' + left + 's left. Press Escape to stop.');
        };
        tick();

        let on = false, sinceSay = 0;
        const everySay = Math.max(1, Math.round(3000 / EVERY));
        st.timer = setInterval(() => {
            if (st.done || !graph || graph.__variantPulse !== st) { try { clearInterval(st.timer); } catch (e) { } return; }
            on = !on;
            for (const v of list) { try { v.highlight = on; } catch (e) { } }
            wake();
            if (++sinceSay >= everySay) { sinceSay = 0; tick(); }
        }, EVERY);
        st.endTimer = setTimeout(() => { teardown(st, 'Finished highlighting ' + noun + '.'); }, MS);

        return { started: true, stopped: false, count: list.length, ms: MS };
    })();
}

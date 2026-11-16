function (pm, o) {

    // SHOW ME THE THING THAT IS ALREADY HERE.
    //
    // "Show me assumptions", with a table called Assumptions on the canvas, offered a menu
    // item that opens a Product Assumptions dialog. The words matched; the request did not.
    // Somebody asking to see something by name, when something of that name is sitting on
    // the canvas, wants to look AT it -- and the canvas is usually scrolled somewhere else,
    // which is the whole reason for asking.
    //
    // The move itself is show-new-object.js, which every operation that creates something
    // already uses to put it in front of the user. Same answer to the same question.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt) { resolve({ error: 'there is no project open' }); return; }

            const want = ('' + ((o && o.name) || '')).trim();
            if (!want) { resolve({ error: 'which one?' }); return; }

            // EVERYTHING ON THE CANVAS, not just the tables: a timeline and a chart are
            // objects somebody can ask to see, and they live in a different list. The search
            // itself is pick-canvas-object.js, which every operation that has to work out
            // which object a request means now shares, so they cannot disagree about it.
            const pick = await exec('baja/plate/ops/pick-canvas-object.js', pt, want);
            if (!pick || pick.error) { resolve({ error: (pick && pick.error) || 'which one?' }); return; }
            const hit = pick.object;

            let shown = null;
            try { shown = await exec('baja/plate/ops/show-new-object.js', pt, hit); } catch (e) { shown = null; }
            try { if (typeof pt.setSelected === 'function') pt.setSelected(hit); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            try { pt.setMessage('Showing ' + hit.name, 4); } catch (e) { }

            resolve({ name: hit.name, moved: !!(shown && shown.moved) });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

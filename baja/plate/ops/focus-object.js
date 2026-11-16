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
            // objects somebody can ask to see, and they live in a different list.
            const all = [];
            for (const list of [pt.root, pt.m_plots, pt.plots, pt.objects]) {
                if (!Array.isArray(list)) continue;
                for (const x of list) { if (x && x.name != null && all.indexOf(x) < 0) all.push(x); }
            }
            if (!all.length) { resolve({ error: 'there is nothing on the canvas yet' }); return; }

            const norm = (s) => ('' + (s == null ? '' : s)).trim().toLowerCase();
            const w = norm(want);
            let hit = all.filter((x) => norm(x.name) === w)[0] || null;
            // A near miss is still the thing: "assumptions" for "Product Assumptions", and
            // the other way round. An exact name wins first, so a table called Assumptions
            // beside one called Assumptions_2026 is not a coin toss.
            if (!hit) hit = all.filter((x) => norm(x.name).indexOf(w) >= 0 || w.indexOf(norm(x.name)) >= 0)[0] || null;
            if (!hit) {
                resolve({ error: 'there is nothing called "' + want + '" on the canvas: this one has '
                    + all.map((x) => '"' + x.name + '"').join(', ') });
                return;
            }

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

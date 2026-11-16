function (pt, obj) {

    // PUT WHAT WAS JUST MADE ON SCREEN.
    //
    // A new table is placed at the next free spot on the canvas, which is frequently not
    // where the user is looking. Making something and leaving the view where it was reads
    // exactly like nothing happening, and the user's next move is to type it again. The
    // thing that was asked for should be in front of them, centred and at a size they can
    // read, and selected, so the menus that act on a selection apply to it.
    //
    // Every operation that CREATES something calls this, rather than each one working out
    // its own idea of where to look. It is deliberately forgiving about what it is handed:
    // an operation's job is to make the thing, and a view that failed to move is never a
    // reason to report that the thing was not made.

    return new Promise(async (resolve) => {
        const ok = (moved) => resolve({ moved: !!moved });
        try {
            if (!pt || !obj) { ok(false); return; }

            // zoomToFitTable fits the whole table and keeps the cells readable, which is the
            // right answer for anything with a grid. zoomintoplate is the older one and is
            // the fallback, exactly as plate-track itself does it.
            if (obj.grid && typeof pt.zoomToFitTable === 'function') {
                await pt.zoomToFitTable(obj);
                ok(true);
                return;
            }
            if (typeof pt.zoomintoplate === 'function') {
                await pt.zoomintoplate(obj);
                ok(true);
                return;
            }
            // Nothing to zoom with: at least select it, so it is findable and the menus
            // point at it.
            if (typeof pt.setSelected === 'function') pt.setSelected(obj);
            ok(false);
        } catch (e) {
            try { if (pt && typeof pt.setSelected === 'function') pt.setSelected(obj); } catch (e2) { }
            ok(false);
        }
    });
}

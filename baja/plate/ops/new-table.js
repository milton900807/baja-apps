function (pm, o) {

    // A TABLE OF A SIZE THAT WAS ASKED FOR.
    //
    // Draw > Table cannot do this. It asks for a name and then takes the number of rows and
    // columns from how far the mouse is dragged, so "two rows and four columns" has nowhere
    // to go: the request carries the dimensions and the dialog does not accept them. That is
    // why the project's sentence path needs a few operations with declared parameters beside
    // the menu, exactly as the genome editor has -- a menu item is a door, and some requests
    // arrive with the answer to the question behind it already in hand.
    //
    // Everything after the size is the same path the formula bar uses to place a plate, so a
    // table made this way sits and behaves like any other.

    return new Promise(async (resolve, reject) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || typeof pt.addPlateWithConsistentWellSize !== 'function') {
                resolve({ error: 'there is no project open to put a table in' });
                return;
            }

            // A SIZE OUT OF RANGE IS REFUSED, NOT TRIMMED. Quietly turning "400 columns"
            // into 200 would build something that is not what was asked for and report it
            // as though it were.
            const whole = (v) => {
                const n = Number(v);
                return (isFinite(n) && Math.floor(n) === n) ? n : null;
            };
            const rows = whole(o && o.rows), cols = whole(o && o.cols);
            if (rows == null || cols == null) {
                resolve({ error: 'a table needs a whole number of rows and columns' });
                return;
            }
            if (rows < 1 || cols < 1) {
                resolve({ error: 'a table needs at least one row and one column' });
                return;
            }
            if (rows > 500 || cols > 200) {
                resolve({ error: 'that is bigger than a table can be here (500 rows, 200 columns)' });
                return;
            }

            // WELL.JS FIRST. completeNullValues builds each cell with GenericWell, which
            // only exists once well.js has been exec'd -- these modules share one scope, so a
            // Plate made without it comes back the right SHAPE with nothing in it, and every
            // reference into it reads an empty cell. The failure is invisible: the table draws,
            // the grid is right, and only the numbers are missing.
            try { await exec('baja/plate/well.js'); } catch (e) { }
            const Plate = await exec('baja/plate/plate.js');
            const name = ('' + ((o && o.name) || '')).trim();
            // new Plate(name, xmax, ymax): columns then rows. An empty name is filled in by
            // the constructor, which is where that choice already lives.
            const p = new Plate(name, cols, rows);
            try { p.completeNullValues(); } catch (e) { }

            try { await pt.panToNextSpot(100); } catch (e) { }
            pt.addPlateWithConsistentWellSize(p);
            try { pt.updateCalculations(); } catch (e) { }

            // Centred, sized to read, and selected. A table dropped at the next free spot is
            // usually off screen, and a creation the user cannot see is indistinguishable
            // from one that did not happen.
            let shown = null;
            try { shown = await exec('baja/plate/ops/show-new-object.js', pt, p); } catch (e) { shown = null; }

            try { pt.setMessage('Added ' + p.name + ': ' + rows + ' x ' + cols, 6); } catch (e) { }

            resolve({ name: p.name, rows: rows, cols: cols, shown: !!(shown && shown.moved) });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

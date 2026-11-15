function (pm, o) {

    // MOVE WHAT IS ALREADY IN A COLUMN, UP OR DOWN.
    //
    // "move all the values in the first column down one row" is the request that has no
    // menu item: inserting a row at the top shifts every column, and doing it by hand means
    // retyping the column from the bottom up so as not to overwrite the cell below as you go.
    //
    // A CELL IS ITS VALUE AND ITS FORMULA. Moving the value and leaving the formula behind
    // would leave the formula to recompute and put the old value straight back, so the move
    // would appear not to have happened. Both travel together. References inside a formula
    // are to a table and a tag -- Inputs[Budget] -- not to a position, so they still mean
    // what they meant one row higher.
    //
    // ANYTHING THAT WOULD FALL OFF THE END STOPS THE WHOLE MOVE. Shifting down by one in a
    // full column pushes the last value out of the table, and there is nowhere for it to go:
    // the alternatives are to drop it, which loses work silently, or to grow the table, which
    // changes its shape without being asked. Saying what would be lost lets the user add the
    // rows themselves and ask again.

    return new Promise(async (resolve) => {
        try {
            const IO = await exec('baja/plate/ops/column-io.js');
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;

            const by = Math.floor(Number((o && o.by) != null ? o.by : 1));
            if (!isFinite(by) || by < 1) { resolve({ error: 'how many rows should they move?' }); return; }
            const dir = ('' + ((o && o.direction) || '')).trim().toLowerCase();
            if (dir !== 'up' && dir !== 'down') { resolve({ error: 'up or down?' }); return; }

            const t = IO.pickTable(pt, o && o.table);
            if (t.error) { resolve({ error: t.error }); return; }
            const table = t.table;

            const c = IO.pickColumn(table, o && o.column);
            if (c.error) { resolve({ error: c.error }); return; }
            const column = c.cells;

            const snapshot = IO.readCells(column);
            const n = snapshot.length;
            if (!n) { resolve({ error: 'that column has no cells' }); return; }

            const step = (dir === 'down') ? by : -by;
            const lost = [];
            for (let r = 0; r < n; r++) {
                if (!snapshot[r].filled) continue;
                const to = r + step;
                if (to < 0 || to >= n) lost.push(r);
            }
            if (lost.length) {
                resolve({ error: lost.length + ' value' + (lost.length === 1 ? '' : 's')
                    + ' would be pushed out of ' + table.name + ' (it has ' + n + ' row'
                    + (n === 1 ? '' : 's') + '). Add rows first, or move them the other way.' });
                return;
            }

            // Built whole, then written, so a cell is never read after it has been overwritten.
            const next = snapshot.map(() => IO.blank());
            for (let r = 0; r < n; r++) {
                if (!snapshot[r].filled) continue;
                next[r + step] = snapshot[r];
            }

            const moved = IO.writeCells(column, next);

            IO.finish(pt, table, 'Moved ' + moved + ' value' + (moved === 1 ? '' : 's') + ' '
                + dir + ' by ' + by);

            resolve({ table: table.name, column: c.index, direction: dir, by: by, moved: moved });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

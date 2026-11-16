function (pm, o) {

    // WHOLE COLUMNS, COPIED ONTO ANOTHER, SWAPPED, OR MOVED TO A NEW POSITION.
    //
    // Copy and swap are between two columns that both exist. MOVE is different and is the one
    // worth being careful about: moving column 3 to position 0 is not a swap, it is a
    // rotation -- 3 goes to the front and 0, 1 and 2 each shift one to the right. Treating it
    // as a swap would put column 0 where column 3 was, which is not what anybody means by
    // moving a column, and the damage is quiet because the two look identical when there are
    // only two columns.
    //
    // THE CELLS MOVE, NOT THE COLUMN OBJECTS. Reordering the wells arrays themselves would
    // carry each column's width and formatting with it, and a column's width belongs to its
    // position on screen rather than to its contents.

    return new Promise(async (resolve) => {
        try {
            const IO = await exec('baja/plate/ops/column-io.js');
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;

            const t = IO.pickTable(pt, o && o.table);
            if (t.error) { resolve({ error: t.error }); return; }
            const table = t.table;

            const action = ('' + ((o && o.action) || '')).trim().toLowerCase();
            if (['copy', 'swap', 'move'].indexOf(action) < 0) {
                resolve({ error: 'copy, swap or move?' });
                return;
            }

            const a = IO.pickColumn(table, o && o.column, 'column');
            if (a.error) { resolve({ error: a.error }); return; }
            if ((o && o.to) == null || ('' + o.to).trim() === '') {
                resolve({ error: 'which column should it ' + action + ' to?' });
                return;
            }
            const b = IO.pickColumn(table, o && o.to, 'destination column');
            if (b.error) { resolve({ error: b.error }); return; }

            if (a.index === b.index) {
                resolve({ table: table.name, action: action, column: a.index,
                    to: b.index, unchanged: true });
                return;
            }

            const from = IO.readCells(a.cells);
            const onto = IO.readCells(b.cells);

            if (action === 'copy') {
                // A COPY THAT WOULD WRITE OVER SOMETHING SAYS SO FIRST. Overwriting a column
                // of work because a sentence was ambiguous is not recoverable by looking at
                // the screen, and the user can clear it and ask again in one more step.
                const occupied = onto.filter((x) => x.filled).length;
                if (occupied) {
                    resolve({ error: 'column ' + (o.to) + ' already has ' + occupied + ' value'
                        + (occupied === 1 ? '' : 's') + ' in it. Clear it first, or swap them.' });
                    return;
                }
                IO.writeCells(b.cells, from);
                IO.finish(pt, table, 'Copied a column in ' + table.name);
                resolve({ table: table.name, action: action, column: a.index, to: b.index });
                return;
            }

            if (action === 'swap') {
                IO.writeCells(b.cells, from);
                IO.writeCells(a.cells, onto);
                IO.finish(pt, table, 'Swapped two columns in ' + table.name);
                resolve({ table: table.name, action: action, column: a.index, to: b.index });
                return;
            }

            // MOVE: a rotation, not a swap.
            const order = [];
            for (let i = 0; i < table.wells.length; i++) if (i !== a.index) order.push(i);
            order.splice(Math.min(b.index, order.length), 0, a.index);

            // Read every column BEFORE writing any of them, for the same reason a column is
            // written from a complete list: a column read after it has been written is the
            // new contents, not the old.
            const before = table.wells.map((col) => IO.readCells(col));
            for (let pos = 0; pos < order.length; pos++) {
                IO.writeCells(table.wells[pos], before[order[pos]]);
            }
            IO.finish(pt, table, 'Moved a column in ' + table.name);
            resolve({ table: table.name, action: action, column: a.index, to: b.index,
                order: order });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

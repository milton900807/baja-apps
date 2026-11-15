function (pm, o) {

    // WRITE A LIST OF VALUES DOWN ONE COLUMN.
    //
    // "add content to the first column that is the price, cog and pn" is three cells, and
    // every way of doing it by hand is slower than saying it: click a cell, type, tab, type.
    //
    // WELLS ARE INDEXED [column][row], not the other way round, which is the thing most
    // likely to be got wrong here and is why the test asserts the shape of the result rather
    // than only its contents.
    //
    // MORE VALUES THAN ROWS IS REFUSED. Truncating loses the values the user listed and says
    // nothing; growing the table changes its shape in a way that was not asked for and that
    // they would have to undo. Saying how many rows there are lets them decide which they
    // wanted.

    return new Promise(async (resolve) => {
        try {
            const IO = await exec('baja/plate/ops/column-io.js');
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;

            const values = Array.isArray(o && o.values) ? o.values : null;
            if (!values || !values.length) { resolve({ error: 'nothing to put in it' }); return; }

            const t = IO.pickTable(pt, o && o.table);
            if (t.error) { resolve({ error: t.error }); return; }
            const table = t.table;

            const c = IO.pickColumn(table, o && o.column);
            if (c.error) { resolve({ error: c.error }); return; }
            const column = c.cells;

            const start = Math.max(0, Math.floor(Number((o && o.start_row) || 0)) || 0);
            if (start + values.length > column.length) {
                resolve({ error: table.name + ' has ' + column.length + ' row'
                    + (column.length === 1 ? '' : 's') + ', and ' + values.length + ' value'
                    + (values.length === 1 ? '' : 's') + (start ? (' from row ' + start) : '')
                    + ' would not fit' });
                return;
            }

            let written = 0;
            for (let i = 0; i < values.length; i++) {
                const well = column[start + i];
                if (!well) continue;
                try {
                    if (typeof well.setValue === 'function') well.setValue(values[i]);
                    else well.value = values[i];
                    written++;
                } catch (e) { }
            }

            IO.finish(pt, table, 'Filled ' + written + ' cell' + (written === 1 ? '' : 's')
                + ' in ' + table.name);

            resolve({ table: table.name, column: c.index, start: start, written: written });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

function (pm, o) {

    // ROWS AND COLUMNS ON A TABLE THAT IS ALREADY THERE.
    //
    // "Add 4 rows", asked from the Employees table's own bar, came back as nothing matching,
    // with Draw > Table and File > New offered -- three ways to make a NEW table in answer to
    // a request about the one in front of you. A table is the thing people most often want
    // one more row of, and there was no operation for it: the only way was the + button,
    // one row per press.
    //
    // THE SIZE IS CHANGED BY THE TABLE'S OWN METHODS -- addRow, addColumn, removeLastRow --
    // which keep the grid, the heights and the column headers in step. A loop over them is
    // the whole implementation; reaching into wells to push arrays is how a table ends up
    // drawn one size and clicked at another.
    //
    // TAKING AWAY IS NOT THE SAME AS ADDING. Rows come off the bottom and they take what is
    // in them, so a request that would remove something says what it is about to remove and
    // refuses if that is more than the empty room at the end -- unless it is told plainly to
    // go ahead. Undo covers it either way (removeLastRow pushes its own snapshot), but a
    // user who has to reach for undo was not asked.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

            const whole = (v) => {
                if (v == null || v === '') return 0;
                const n = Number(v);
                return (isFinite(n) && Math.floor(n) === n) ? n : null;
            };
            const rows = whole(o && o.rows), cols = whole(o && o.columns);
            if (rows == null || cols == null) {
                resolve({ error: 'how many rows or columns, as a whole number?' });
                return;
            }
            if (!rows && !cols) { resolve({ error: 'add or remove how many?' }); return; }
            if (Math.abs(rows) > 500 || Math.abs(cols) > 200) {
                resolve({ error: 'that is more than a table can change by here (500 rows, 200 columns)' });
                return;
            }

            const nCols = () => (t.wells && t.wells.length) || 0;
            const nRows = () => (nCols() && t.wells[0] ? t.wells[0].length : 0);
            const filled = (w) => !!w && ((w.value != null && ('' + w.value).trim() !== '')
                || (typeof w.formula === 'string' && w.formula.trim() !== ''));

            const was = { rows: nRows(), cols: nCols() };
            let addedRows = 0, addedCols = 0, removedRows = 0;

            if (rows > 0) {
                for (let i = 0; i < rows; i++) { try { t.addRow(); addedRows++; } catch (e) { break; } }
            } else if (rows < 0) {
                const take = Math.min(-rows, was.rows);
                // What is about to go, counted before anything moves.
                let holding = 0;
                for (let r = was.rows - take; r < was.rows; r++) {
                    for (let c = 0; c < was.cols; c++) {
                        if (filled(t.wells[c] && t.wells[c][r])) { holding++; break; }
                    }
                }
                if (holding && !(o && o.force)) {
                    resolve({ error: holding + ' of the last ' + take + ' row'
                        + (take === 1 ? '' : 's') + ' of ' + t.name + ' ' + (holding === 1 ? 'has' : 'have')
                        + ' something in ' + (holding === 1 ? 'it' : 'them') + ', so nothing was '
                        + 'removed. Say to remove them anyway if that is what you want' });
                    return;
                }
                for (let i = 0; i < take; i++) { try { t.removeLastRow(); removedRows++; } catch (e) { break; } }
            }

            if (cols > 0) {
                const names = ('' + ((o && o.names) || '')).split(',').map((x) => x.trim()).filter((x) => x !== '');
                for (let i = 0; i < cols; i++) {
                    try { t.addColumn(names[i] || ''); addedCols++; } catch (e) { break; }
                }
            } else if (cols < 0) {
                // Columns are not taken away here. A column carries its header and every
                // formula written against its position, and there is no removeLastColumn that
                // puts those right; saying so beats doing most of it.
                resolve({ error: 'removing columns is not something this can do yet: '
                    + 'the formulas written against them would be left pointing at nothing' });
                return;
            }

            try { if (pt.__collab && !pt.__collab.holds(t)) pt.__collab.acquire(t); } catch (e) { }
            try { if (typeof t.fitRowsAndColumns === 'function') t.fitRowsAndColumns(); } catch (e) { }
            try { if (typeof t.applycolumnheaders === 'function') t.applycolumnheaders(); } catch (e) { }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            const bits = [];
            if (addedRows) bits.push('added ' + addedRows + ' row' + (addedRows === 1 ? '' : 's'));
            if (removedRows) bits.push('removed ' + removedRows + ' row' + (removedRows === 1 ? '' : 's'));
            if (addedCols) bits.push('added ' + addedCols + ' column' + (addedCols === 1 ? '' : 's'));
            if (!bits.length) { resolve({ error: 'nothing changed: ' + t.name + ' is as it was' }); return; }
            try { pt.setMessage(t.name + ': ' + bits.join(', ') + ' (now '
                + nRows() + ' x ' + nCols() + ')', 6); } catch (e) { }

            resolve({ table: t.name, added_rows: addedRows || undefined,
                removed_rows: removedRows || undefined, added_columns: addedCols || undefined,
                rows: nRows(), columns: nCols() });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

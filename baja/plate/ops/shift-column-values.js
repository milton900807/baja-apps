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
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }

            const by = Math.floor(Number((o && o.by) != null ? o.by : 1));
            if (!isFinite(by) || by < 1) { resolve({ error: 'how many rows should they move?' }); return; }
            const dir = ('' + ((o && o.direction) || '')).trim().toLowerCase();
            if (dir !== 'up' && dir !== 'down') {
                resolve({ error: 'up or down?' });
                return;
            }

            const tables = pt.root.filter((p) => p && Array.isArray(p.wells));
            const named = ('' + ((o && o.table) || '')).trim();
            let table = null;
            if (named) {
                table = (typeof pt.getTableByName === 'function') ? pt.getTableByName(named) : null;
                if (!table) { resolve({ error: 'there is no table called ' + named }); return; }
            } else {
                table = pt.selectedPlate || (tables.length === 1 ? tables[0] : null);
                if (!table) { resolve({ error: 'say which table, or select it first' }); return; }
            }
            if (!Array.isArray(table.wells) || !table.wells.length) {
                resolve({ error: table.name + ' has no cells' });
                return;
            }

            const raw = ('' + ((o && o.column) != null ? o.column : '')).trim();
            let col = 0;
            if (raw) {
                if (/^\d+$/.test(raw)) {
                    col = parseInt(raw, 10);
                } else if (/^[A-Za-z]{1,2}$/.test(raw)) {
                    const up = raw.toUpperCase();
                    col = 0;
                    for (let i = 0; i < up.length; i++) col = col * 26 + (up.charCodeAt(i) - 64);
                    col -= 1;
                } else {
                    resolve({ error: 'which column? Give its number (0 is the first) or its letter' });
                    return;
                }
            }
            if (col < 0 || col >= table.wells.length) {
                resolve({ error: table.name + ' has ' + table.wells.length + ' column'
                    + (table.wells.length === 1 ? '' : 's') + ', so there is no column ' + raw });
                return;
            }

            const column = table.wells[col] || [];
            const n = column.length;
            if (!n) { resolve({ error: 'that column has no cells' }); return; }

            const has = (cell) => !!cell && ((cell.value != null && ('' + cell.value).trim() !== '')
                || (typeof cell.formula === 'string' && cell.formula.trim() !== ''));
            const snapshot = column.map((w) => ({
                value: w ? w.value : '',
                formula: (w && typeof w.formula === 'string') ? w.formula : null,
                filled: has(w)
            }));

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
            const next = snapshot.map(() => ({ value: '', formula: null, filled: false }));
            for (let r = 0; r < n; r++) {
                if (!snapshot[r].filled) continue;
                next[r + step] = snapshot[r];
            }

            let moved = 0;
            for (let r = 0; r < n; r++) {
                const well = column[r];
                if (!well) continue;
                const want = next[r];
                try {
                    if (typeof well.setValue === 'function') well.setValue(want.value == null ? '' : want.value);
                    else well.value = (want.value == null ? '' : want.value);
                    if (want.formula != null) well.formula = want.formula;
                    else if (typeof well.formula === 'string') well.formula = '';
                    if (want.filled) moved++;
                } catch (e) { }
            }

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.setSelected) pt.setSelected(table); } catch (e) { }
            try { pt.setMessage('Moved ' + moved + ' value' + (moved === 1 ? '' : 's') + ' '
                + dir + ' by ' + by, 6); } catch (e) { }

            resolve({ table: table.name, column: col, direction: dir, by: by, moved: moved });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

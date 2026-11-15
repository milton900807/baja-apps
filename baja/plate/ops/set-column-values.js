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
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }

            const values = Array.isArray(o && o.values) ? o.values : null;
            if (!values || !values.length) { resolve({ error: 'nothing to put in it' }); return; }

            // Which table: the one named, the selected one, or the only one there is.
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

            // A COLUMN IS A NUMBER OR A LETTER, as the ruler above the table shows it: 0 (A),
            // 1 (B). Anything else is refused rather than guessed at, because guessing wrong
            // writes over cells that had something in them.
            const raw = ('' + ((o && o.column) != null ? o.column : '')).trim();
            let col = null;
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
            if (col < 0 || col >= table.wells.length) {
                resolve({ error: table.name + ' has ' + table.wells.length + ' column'
                    + (table.wells.length === 1 ? '' : 's') + ', so there is no column ' + raw });
                return;
            }

            const column = table.wells[col] || [];
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

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.setSelected) pt.setSelected(table); } catch (e) { }
            try { pt.setMessage('Filled ' + written + ' cell' + (written === 1 ? '' : 's')
                + ' in ' + table.name, 6); } catch (e) { }

            resolve({ table: table.name, column: col, start: start, written: written });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

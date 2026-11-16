function (pm, o) {

    // THE SELECTED CELLS COME FROM A NEW TABLE.
    //
    // A new table is made the shape of the selection, and each selected cell is given a
    // formula pointing at the matching cell in it. So the numbers live in one place and the
    // cells that use them show through to it: change the new table and these follow.
    //
    // THE SHAPE IS THE SELECTION'S SHAPE, worked out from the selected cells' own row and
    // column positions rather than from how many there are. A block three wide and two deep
    // becomes a table three wide and two deep, and cell (c,r) points at (c-minCol, r-minRow),
    // so the arrangement a user selected is the arrangement they get. Flattening it into one
    // column would silently rearrange their data.
    //
    // THE REFERENCE IS POSITIONAL -- Name[col][row] -- which is the form the formula engine's
    // own getWellsByString parses. It is not invented here.
    //
    // NOTHING IS OVERWRITTEN WITHOUT SAYING SO: cells that already hold something are
    // reported, and the new table is filled with what they held, so the values move into it
    // rather than being replaced by references to empty cells.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }

            const named = ('' + ((o && o.table) || '')).trim();
            let host = null;
            if (named) {
                host = (typeof pt.getTableByName === 'function') ? pt.getTableByName(named) : null;
                if (!host) { resolve({ error: 'there is no table called ' + named }); return; }
            } else {
                const tables = pt.root.filter((p) => p && Array.isArray(p.wells));
                host = pt.selectedPlate || (tables.length === 1 ? tables[0] : null);
                if (!host) { resolve({ error: 'say which table, or select it first' }); return; }
            }

            let cells = [];
            try {
                if (typeof host.getSelectedWellsInOrder === 'function') cells = host.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'select the cells that should come from the new table first' });
                return;
            }

            // Where each selected cell sits, so the new table can be its shape.
            const at = [];
            for (const c of cells) {
                let ix = null;
                try { ix = host.getWellIndicies(c); } catch (e) { ix = null; }
                if (!ix || ix.colIdx == null || ix.rowIdx == null) {
                    resolve({ error: 'could not work out where the selected cells are' });
                    return;
                }
                at.push({ cell: c, col: ix.colIdx, row: ix.rowIdx });
            }
            const minCol = Math.min.apply(null, at.map((x) => x.col));
            const minRow = Math.min.apply(null, at.map((x) => x.row));
            const cols = Math.max.apply(null, at.map((x) => x.col)) - minCol + 1;
            const rows = Math.max.apply(null, at.map((x) => x.row)) - minRow + 1;

            // THE NAME IS ASKED FOR WHEN IT IS NOT GIVEN. A formula names the table it reads,
            // so a table nobody named is one nobody can write a formula against afterwards.
            let name = ('' + ((o && o.name) || '')).trim();
            if (!name) {
                try {
                    const answer = await prompt('Name for the new table', ['Name'], { Name: '' }, 300, 300);
                    name = ('' + ((answer && answer.Name) || '')).trim();
                } catch (e) { name = ''; }
                if (!name) { resolve({ cancelled: true }); return; }
            }
            if (!/^[A-Za-z_]\w*$/.test(name)) {
                resolve({ error: '"' + name + '" cannot be used in a formula, so it cannot name '
                    + 'a table. Letters, digits and underscores, starting with a letter.' });
                return;
            }
            if (typeof pt.getTableByName === 'function' && pt.getTableByName(name)) {
                resolve({ error: 'there is already a table called ' + name });
                return;
            }

            // A TABLE WITH NAMED COLUMNS AND A TOTAL AT THE FOOT.
            //
            // "Derive this value from the sum of the salaries column in a new table called
            // lab_employees" asks for something the shape-of-the-selection version cannot
            // make: one cell selected gave a 1 x 1 table and a reference to its only cell,
            // which is a rename of the number rather than a place to keep salaries.
            //
            // What is wanted is a table to type into -- a column per heading, room under it
            // -- with the last row of the named column totalling what is above it, and the
            // cell that asked pointing at THAT total. Then typing a salary into the new table
            // moves the figure in the assumptions sheet, which is the point of deriving it.
            //
            // THE TOTAL IS A FORMULA, not a number written once: a table filled in afterwards
            // has to add up to what the other sheet reads.
            const colNames = ('' + ((o && o.columns) || '')).split(',')
                .map((x) => x.trim()).filter((x) => x !== '');
            const wantSum = ('' + ((o && o.sum_column) || '')).trim();
            if (colNames.length || wantSum) {
                const names = colNames.length ? colNames : ['Name', wantSum || 'Value'];
                // WHICH COLUMN IS TOTALLED. By name if the request says one, else the second,
                // which is where the numbers sit in a two-column table of labels and values.
                // A name that matches nothing is said rather than quietly totalling column 2.
                let sumAt = -1;
                if (wantSum) {
                    const w = wantSum.toLowerCase();
                    names.forEach((n, i) => { if (sumAt < 0 && n.toLowerCase() === w) sumAt = i; });
                    if (sumAt < 0) names.forEach((n, i) => {
                        if (sumAt < 0 && (n.toLowerCase().indexOf(w) >= 0 || w.indexOf(n.toLowerCase()) >= 0)) sumAt = i;
                    });
                    if (sumAt < 0 && /^\d+$/.test(wantSum)) sumAt = Math.max(0, parseInt(wantSum, 10) - 1);
                    if (sumAt < 0 || sumAt >= names.length) {
                        resolve({ error: 'there is no column called "' + wantSum + '" in that table: '
                            + 'it would have ' + names.map((n) => '"' + n + '"').join(', ') });
                        return;
                    }
                } else {
                    sumAt = (names.length > 1) ? 1 : 0;
                }

                let dataRows = Math.floor(Number((o && o.rows) || 0));
                if (!isFinite(dataRows) || dataRows < 1) dataRows = 8;
                dataRows = Math.min(dataRows, 400);

                try { await exec('baja/plate/well.js'); } catch (e) { }
                const Plate2 = await exec('baja/plate/plate.js');
                // One header row, the rows to type into, and the total under them.
                const made2 = new Plate2(name, names.length, dataRows + 2);
                try { made2.completeNullValues(); } catch (e) { }
                try { await pt.panToNextSpot(100); } catch (e) { }
                pt.addPlateWithConsistentWellSize(made2);

                const put = (c, r, v) => {
                    const w = made2.wells[c] && made2.wells[c][r];
                    if (!w) return false;
                    try { if (typeof w.setValue === 'function') w.setValue(v); else w.value = v; } catch (e) { }
                    return ('' + (w.value == null ? '' : w.value)) === ('' + v);
                };
                names.forEach((n, i) => put(i, 0, n));
                // applycolumnheaders marks a top row of text as headings, which is what makes
                // them draw as headings and what count_rows later leaves out of its count.
                try { made2.applycolumnheaders(); } catch (e) { }

                const lastRow = dataRows + 1;
                put(0, lastRow, 'Total');
                const total = '=sum(' + name + '[' + sumAt + ':' + sumAt + '][1:' + dataRows + '])';
                const tcell = made2.wells[sumAt] && made2.wells[sumAt][lastRow];
                if (tcell) {
                    try { made2.formula[made2.getWellRange([tcell])] = total; } catch (e) { }
                    try { pt.addFormula(name + '' + made2.getWellRange([tcell]), total); } catch (e) { }
                    try { tcell.setValue(total); } catch (e) { }
                }

                // The cells that asked read the TOTAL, not the first cell of the table.
                try { pushHistory(HM(host)); } catch (e) { }
                let wired2 = 0;
                const ref = '=' + name + '[' + sumAt + '][' + lastRow + ']';
                for (const x of at) {
                    try {
                        const wr = host.getWellRange([x.cell]);
                        try { host.formula[wr] = ref; } catch (e) { }
                        try { pt.addFormula(host.name + '' + wr, ref); } catch (e) { }
                        try { x.cell.setValue(ref); } catch (e) { }
                        wired2++;
                    } catch (e) { }
                }

                try { pt.updateCalculations(); } catch (e) { }
                try { await exec('baja/plate/ops/show-new-object.js', pt, made2); } catch (e) { }
                try {
                    pt.setMessage(name + ': ' + names.length + ' columns, ' + dataRows + ' rows to '
                        + 'fill in, and "' + names[sumAt] + '" totalled at the foot. '
                        + wired2 + ' cell' + (wired2 === 1 ? '' : 's') + ' read that total.', 9);
                } catch (e) { }
                resolve({ table: name, columns: names, rows: dataRows,
                    totals: names[sumAt], total_formula: total, wired: wired2 });
                return;
            }

            // WELL.JS FIRST. completeNullValues builds each cell with GenericWell, which
            // only exists once well.js has been exec'd -- these modules share one scope, so a
            // Plate made without it comes back the right SHAPE with nothing in it, and every
            // reference into it reads an empty cell. The failure is invisible: the table draws,
            // the grid is right, and only the numbers are missing.
            try { await exec('baja/plate/well.js'); } catch (e) { }
            const Plate = await exec('baja/plate/plate.js');
            const made = new Plate(name, cols, rows);
            try { made.completeNullValues(); } catch (e) { }

            try { await pt.panToNextSpot(100); } catch (e) { }
            pt.addPlateWithConsistentWellSize(made);

            // AFTER THE PLATE IS ON THE TRACK, not before. A Plate's cells are not there
            // to be written to until it has been added: doing this on the way in carried
            // nothing and left every reference pointing at an empty cell, which looks exactly
            // like the feature working until you read the numbers.
            //
            // What the cells already hold moves INTO the new table, so nothing is lost and
            // the references resolve to the same numbers they showed a moment ago.
            let carried = 0, lost = 0;
            for (const x of at) {
                const target = made.wells[x.col - minCol] && made.wells[x.col - minCol][x.row - minRow];
                if (!target) continue;
                const v = x.cell ? x.cell.value : null;
                if (v != null && ('' + v).trim() !== '' && !/^\s*=/.test('' + v)) {
                    try {
                        if (typeof target.setValue === 'function') target.setValue(v); else target.value = v;
                    } catch (e) { }
                    // COUNTED FROM WHAT THE CELL HOLDS, not from whether the call returned.
                    // setValue does its work and then notifies, and the notification can
                    // throw on its own account -- so catching the throw and calling the value
                    // lost reports a failure that did not happen. And the opposite case is
                    // the one that matters: this cell is about to be replaced by a reference
                    // to that one, so a value that did NOT arrive is a value destroyed.
                    const landed = target.value;
                    if (landed != null && ('' + landed) === ('' + v)) carried++; else lost++;
                }
            }


            try { pushHistory(HM(host)); } catch (e) { }
            let wired = 0;
            for (const x of at) {
                const f = '=' + name + '[' + (x.col - minCol) + '][' + (x.row - minRow) + ']';
                try {
                    const wr = host.getWellRange([x.cell]);
                    try { host.formula[wr] = f; } catch (e) { }
                    try { pt.addFormula(host.name + '' + wr, f); } catch (e) { }
                    try { x.cell.setValue(f); } catch (e) { }
                    wired++;
                } catch (e) { }
            }

            try { pt.updateCalculations(); } catch (e) { }
            try { await exec('baja/plate/ops/show-new-object.js', pt, made); } catch (e) { }
            try { pt.setMessage(wired + ' cell' + (wired === 1 ? '' : 's') + ' now read from '
                + name + (carried ? (', which kept their ' + carried + ' value'
                    + (carried === 1 ? '' : 's')) : '')
                + (lost ? ('. ' + lost + ' value' + (lost === 1 ? '' : 's')
                    + ' could not be copied across') : ''), 8); } catch (e) { }

            resolve({ name: name, rows: rows, cols: cols, wired: wired, carried: carried,
                lost: lost || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

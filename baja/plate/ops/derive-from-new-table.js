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

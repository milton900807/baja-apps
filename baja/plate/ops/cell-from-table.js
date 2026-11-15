function (pm, o) {

    // THE SELECTED CELL READS A WHOLE TABLE: its sum, average, smallest, largest or count.
    //
    // "I want this value to be the sum of the Employees table", typed into a cell, had no
    // operation behind it and came back as nothing matching -- with three menu items offered
    // that do something else entirely. A cell that totals another table is one of the few
    // things a spreadsheet is FOR.
    //
    // AND IF THAT TABLE IS NOT THERE YET, IT IS ASKED FOR RATHER THAN REFUSED. Being told
    // "there is no table called Employees" when you have just said you want the Employees
    // total is a dead end with the answer in plain sight: the shape and the numbers are
    // asked for, the table is made, and the cell is then pointed at it. A request names what
    // the user wants to exist, not only what already does.
    //
    // THE FORMULA IS THE ENGINE'S OWN: sum(Name[c0:c1][r0:r1]), the form
    // excel-function-manager translates Excel's SUM into, over the table's real extent. It
    // is not invented here, and the non-numeric cells in it (a column of names) are dropped
    // by the function rather than by anything written here.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }

            const IO = await exec('baja/plate/ops/column-io.js');
            const host = IO.pickTable(pt, o && o.in_table);
            if (host.error) { resolve({ error: host.error }); return; }
            const into = host.table;

            // The cells that are to read it.
            let cells = [];
            try {
                if (typeof into.getSelectedWellsInOrder === 'function') cells = into.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'select the cell that should hold it first' });
                return;
            }

            const want = ('' + ((o && o.table) || '')).trim();
            if (!want) { resolve({ error: 'which table should it read?' }); return; }

            const HOW = { sum: 'sum', total: 'sum', average: 'average', mean: 'average',
                min: 'min', max: 'max', count: 'count', count_rows: 'count', rows: 'count' };
            let how = HOW[('' + ((o && o.how) || 'sum')).trim().toLowerCase()];
            if (!how) { resolve({ error: 'sum, average, min, max or count?' }); return; }

            // A name that cannot be written in a formula cannot be read by one either.
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(want)) {
                resolve({ error: '"' + want + '" cannot be used in a formula: a table’s name has '
                    + 'to start with a letter and hold only letters, numbers and underscores' });
                return;
            }

            let table = (typeof pt.getTableByName === 'function') ? pt.getTableByName(want) : null;
            let made = false;

            if (!table) {
                // ASKED FOR, NOT INVENTED. The numbers are the user's; nothing here guesses a
                // shape or fills a table with zeroes to have something to point at.
                let answer = null;
                try {
                    answer = await prompt('There is no table called ' + want
                        + '. Make it? (values are optional)',
                        ['Columns', 'Values (optional)'],
                        { 'Columns': '2', 'Values (optional)': '' }, 420, 320);
                } catch (e) { answer = null; }
                if (!answer) { resolve({ cancelled: true }); return; }

                const cols = Math.floor(Number(('' + (answer['Columns'] || '1')).trim()));
                if (!isFinite(cols) || cols < 1) { resolve({ error: 'how many columns?' }); return; }

                // One value per line, or several to a line separated by commas or tabs: all
                // three are how people paste numbers, and guessing wrong loses them.
                const values = ('' + (answer['Values (optional)'] || answer['Values'] || ''))
                    .split(/[\n\r]+/).join(',').split(/[,\t]/)
                    .map((v) => ('' + v).trim()).filter((v) => v !== '');

                // AN EMPTY TABLE IS A FINE ANSWER. Making the values compulsory meant the
                // only way to get a table was to have its contents to hand, which is not how
                // one gets made: the usual thing is to put it there and fill it in. With
                // nothing typed it comes with two rows to type into, which is also what the
                // count then reads -- zero until something is in them.
                const rows = values.length ? Math.ceil(values.length / cols) : 2;
                const built = await exec('baja/plate/ops/new-table.js', pt, { name: want, rows: rows, cols: cols });
                if (!built || built.error) { resolve({ error: (built && built.error) || 'the table could not be made' }); return; }

                table = (typeof pt.getTableByName === 'function') ? pt.getTableByName(want) : null;
                if (!table) { resolve({ error: 'the table was made but cannot be found by name' }); return; }
                made = true;

                // ACROSS THEN DOWN, the way they were typed.
                let put = 0;
                for (let i = 0; i < values.length; i++) {
                    const c = i % cols, r = Math.floor(i / cols);
                    const w = table.wells && table.wells[c] && table.wells[c][r];
                    if (!w) continue;
                    try {
                        if (typeof w.setValue === 'function') w.setValue(values[i]); else w.value = values[i];
                        put++;
                    } catch (e) { }
                }
                if (put < values.length) {
                    resolve({ error: 'only ' + put + ' of ' + values.length + ' values would fit: '
                        + 'the table is ' + cols + ' wide' });
                    return;
                }
            }

            const nCols = (table.wells && table.wells.length) || 0;
            const nRows = (nCols && table.wells[0] && table.wells[0].length) || 0;
            if (!nCols || !nRows) { resolve({ error: want + ' has no cells to read' }); return; }

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            const numericCell = (w) => {
                if (!w) return false;
                const v = w.value;
                if (v == null || ('' + v).trim() === '') return false;
                return isFinite(Number(('' + v).replace(/[$,\s]/g, '')));
            };

            // A TABLE WITH NO NUMBERS IN IT IS COUNTED, NOT REFUSED.
            //
            // The table has usually just been made, two empty rows waiting to be typed into,
            // and there is nothing to add up yet. Refusing with "nothing in Employees is a
            // number" is true and useless: the cell beside a row labelled Employees is a
            // count of them, which is the one thing that CAN be worked out from an empty
            // table and the thing that was being asked for.
            let fellBack = false;
            if (how !== 'count') {
                let anyNumber = false;
                for (let c = 0; c < nCols && !anyNumber; c++) {
                    for (let r = 0; r < nRows; r++) {
                        if (numericCell(table.wells[c] && table.wells[c][r])) { anyNumber = true; break; }
                    }
                }
                if (!anyNumber) { how = 'count'; fellBack = true; }
            }

            let f;
            if (how === 'count') {
                // COUNTING ROWS IS NOT COUNTING CELLS, so it is its own function rather than
                // a range handed to one that adds things up. count_rows reads the table
                // itself: it leaves out the header row and the empty rows a table was given
                // room in, which no range written here could know to do.
                // The table itself, with no range: a range here is noise (the function reads
                // the table, not a block of cells) and [0:][0:] is rewritten to [0:0] by the
                // engine's own preprocessing on the way in, which then counts nothing.
                f = '=count_rows(' + want + ')';
            } else {
                // THE RANGE LEAVES OUT WHAT WOULD THROW. sum() over a whole table fails the
                // moment it meets a name -- every cell in the range has to be a number -- and
                // a table of people has a column of names and a row of headings by design.
                // The cell went red and said nothing about why. So the range covers the rows
                // under the headings and the columns that actually hold numbers.
                let firstRow = 0;
                for (let r = 0; r < nRows; r++) {
                    let header = false;
                    for (let c = 0; c < nCols; c++) { if (isHeaderCell(table.wells[c] && table.wells[c][r])) { header = true; break; } }
                    if (header) firstRow = r + 1; else break;
                }
                const numCols = [];
                for (let c = 0; c < nCols; c++) {
                    for (let r = firstRow; r < nRows; r++) {
                        if (numericCell(table.wells[c] && table.wells[c][r])) { numCols.push(c); break; }
                    }
                }
                if (!numCols.length || firstRow >= nRows) {
                    // Only a table whose numbers are all above the headings can reach this.
                    resolve({ error: 'the numbers in ' + want + ' are all in its heading row, '
                        + 'so there is no ' + how + ' to take under it' });
                    return;
                }
                f = '=' + how + '(' + want + '[' + numCols[0] + ':' + numCols[numCols.length - 1]
                    + '][' + firstRow + ':' + (nRows - 1) + '])';
            }

            let wired = 0;
            for (const cell of cells) {
                try {
                    const wr = into.getWellRange([cell]);
                    try { into.formula[wr] = f; } catch (e) { }
                    try { pt.addFormula(into.name + '' + wr, f); } catch (e) { }
                    try { cell.setValue(f); } catch (e) { }
                    wired++;
                } catch (e) { }
            }
            if (!wired) { resolve({ error: 'the formula could not be written into the cell' }); return; }

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage((made ? ('Made ' + want + ', and ') : '')
                    + wired + ' cell' + (wired === 1 ? '' : 's') + ' now show '
                    + (how === 'count' ? ('how many rows ' + want + ' has') : ('the ' + how + ' of ' + want))
                    + (fellBack ? (' (there are no numbers in ' + want + ' yet, so this counts '
                        + 'its rows; ask again once it has some)') : ''), 9);
            } catch (e) { }

            resolve({ table: want, how: how, made: made, wired: wired, formula: f,
                counted_instead: fellBack || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

function (pm, o) {

    // TOTAL THE CELLS ABOVE THIS ONE.
    //   exec('baja/plate/ops/sum-above.js', pm, { how: 'sum' })
    //
    // "make this cell sum the total above", typed into the cell at the foot of a column of
    // costs, came back as "Nothing here does that: writing a formula that sums the cells
    // above a selected cell". It is the commonest thing anybody does to a column of numbers,
    // and the only operations that wrote a formula either needed the formula already written
    // (set_formula) or totalled a whole OTHER table (cell_from_table).
    //
    // THE RANGE IS READ OFF THE COLUMN, NOT ASKED FOR. "Above" is not a number of rows: it
    // is the run of numbers that ends where the user is standing. The walk goes up from the
    // cell until it meets a heading, an empty cell, or the top, which is exactly where a
    // person would stop reading, and is why a total under one block of costs does not reach
    // up into the block above it.
    //
    // A CELL THAT IS NOT A NUMBER ENDS THE RUN, and that is a feature. The engine's sum()
    // throws the moment a range holds a name, and a total that goes red saying nothing is
    // worse than one that covers the numbers it can see.
    //
    // THE FORMULA IS THE ENGINE'S OWN: sum(Name[c0:c1][r0:r1]), the same form every other
    // formula-writing operation here produces, stored per cell so an iterator reads each
    // cell's own row.
    //
    // A TOTAL ROW IS WRITTEN BEFORE THE FIGURES AS OFTEN AS AFTER THEM. "the first cell has
    // Total and the second is the total sum of all the cells above", asked of the last row
    // of a table nobody had filled in yet, came back as "the cell above is empty, so there
    // is nothing to total". There was a formula to write: the one that totals those cells
    // once they hold something. So blank cells above no longer refuse. The walk steps over
    // them to the run of numbers they sit under, and when the column is blank all the way
    // up the formula covers the blank cells, reads 0, and fills in as the figures arrive.
    //
    // THE WORD BESIDE THE TOTAL GOES IN WITH IT (o.label). With several cells selected along
    // one row the first takes the word and the rest take formulas, which is the row as it
    // was described. With one cell selected the word goes in the cell to its left, and only
    // if that cell is empty: a label is never written over something already there.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

            const HOW = { sum: 'sum', total: 'sum', average: 'average', mean: 'average',
                avg: 'average', min: 'min', minimum: 'min', max: 'max', maximum: 'max',
                count: 'count' };
            const how = HOW[('' + ((o && o.how) || 'sum')).trim().toLowerCase()] || 'sum';

            let cells = [];
            try {
                if (typeof t.getSelectedWellsInOrder === 'function') cells = t.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'click the cell the total should go in first' });
                return;
            }

            const nCols = (t.wells && t.wells.length) || 0;
            const nRows = (nCols && t.wells[0]) ? t.wells[0].length : 0;
            if (!nCols || !nRows) { resolve({ error: t.name + ' has no cells' }); return; }

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            // A number, as the engine will see it. A cell holding its own formula counts:
            // a column of subtotals is a column of numbers.
            const numeric = (w) => {
                if (!w) return false;
                if (typeof w.formula === 'string' && w.formula.trim()) return true;
                const v = w.value;
                if (v == null || ('' + v).trim() === '') return false;
                const s = ('' + v).replace(/[$,£€\s]/g, '').replace(/%$/, '');
                return s !== '' && isFinite(Number(s));
            };
            const blank = (w) => {
                if (!w) return true;
                if (typeof w.formula === 'string' && w.formula.trim()) return false;
                return w.value == null || ('' + w.value).trim() === '';
            };
            const at = (c, r) => (t.wells[c] && t.wells[c][r]) || null;

            const where = (cell) => {
                for (let c = 0; c < nCols; c++) {
                    const col = t.wells[c] || [];
                    for (let r = 0; r < col.length; r++) { if (col[r] === cell) return { c: c, r: r }; }
                }
                return null;
            };

            // The word beside the total, if the request asked for one.
            const label = (o && o.label != null) ? ('' + o.label).trim() : '';
            let labelCell = null, labelled = false;
            if (label && cells.length > 1) {
                const ps = cells.map(where);
                if (ps.every((p) => p && p.r === ps[0].r)) {
                    let first = 0;
                    for (let i = 1; i < ps.length; i++) { if (ps[i].c < ps[first].c) first = i; }
                    labelCell = cells[first];
                    cells = cells.filter((x) => x !== labelCell);
                }
            }

            const done = [], refused = [];
            for (const cell of cells) {
                const pos = where(cell);
                if (!pos) { refused.push({ why: 'that cell is not in ' + t.name }); continue; }
                if (pos.r === 0) { refused.push({ why: 'that cell is in the top row: there is nothing above it' }); continue; }

                // Up from the cell to the start of the run. Blank cells directly above are
                // stepped over first: a total row is often written under a spacer row, or
                // under a column that has not been filled in yet.
                let r0 = pos.r - 1;
                while (r0 >= 0 && !isHeaderCell(at(pos.c, r0)) && blank(at(pos.c, r0))) r0--;
                let top = -1;
                for (let r = r0; r >= 0; r--) {
                    const w = at(pos.c, r);
                    if (isHeaderCell(w)) break;
                    if (!numeric(w)) break;
                    top = r;
                }
                let empty = false;
                if (top < 0 && r0 < pos.r - 1) {
                    // Nothing but blanks between here and the heading (or the top, or a
                    // word): the formula covers those blanks and waits for the figures.
                    top = r0 + 1;
                    empty = true;
                }
                if (top < 0) {
                    const above = at(pos.c, pos.r - 1);
                    refused.push({
                        why: isHeaderCell(above)
                            ? 'the cell above is a heading, so there are no numbers to total'
                            : ('the cell above holds “' + ('' + above.value).slice(0, 24)
                                + '”, which is not a number, so the run of numbers ends there')
                    });
                    continue;
                }

                // The run ends at its last figure, not at the spacer row under it.
                const end = empty ? (pos.r - 1) : r0;
                const f = '=' + how + '(' + t.name + '[' + pos.c + ':' + pos.c + ']['
                    + top + ':' + end + '])';
                try {
                    const wr = t.getWellRange([cell]);
                    try { t.formula[wr] = f; } catch (e) { }
                    try { pt.addFormula(t.name + '' + wr, f); } catch (e) { }
                    try { cell.setValue(f); } catch (e) { }
                    done.push({ formula: f, rows: (end - top + 1), column: pos.c, empty: empty });
                    if (label && !labelCell && !labelled && cells.length === 1 && pos.c > 0) {
                        const left = at(pos.c - 1, pos.r);
                        if (left && !isHeaderCell(left) && blank(left)) labelCell = left;
                    }
                } catch (e) {
                    refused.push({ why: ('' + (e && e.message ? e.message : e)) });
                }
            }

            if (!done.length) {
                resolve({ error: (refused[0] && refused[0].why) || 'nothing could be totalled' });
                return;
            }

            if (labelCell) {
                try { labelCell.setValue(label); labelled = true; } catch (e) { }
            }

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            const n = done[0].rows;
            try {
                pt.setMessage((done.length === 1
                    ? ('That cell now ' + (how === 'count' ? 'counts' : (how + 's')) + ' the '
                        + n + ' cell' + (n === 1 ? '' : 's') + ' above it')
                    : (done.length + ' cells now take the ' + how + ' of the run above each'))
                    + (done.every((d) => d.empty)
                        ? ('. ' + (n === 1 ? 'It is' : 'They are') + ' empty, so it reads 0 until '
                            + (n === 1 ? 'it is' : 'they are') + ' filled in')
                        : '')
                    + (labelled ? ('. “' + label + '” is in the cell beside it') : '')
                    + (refused.length ? ('. ' + refused.length + ' could not: ' + refused[0].why) : ''), 8);
            } catch (e) { }

            resolve({ table: t.name, how: how, written: done.length, rows: n,
                formula: done[0].formula,
                label: labelled ? label : undefined,
                empty: done.every((d) => d.empty) || undefined,
                refused: refused.length || undefined,
                why: refused.length ? refused[0].why : undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

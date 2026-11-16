function (pm, o) {

    // A FORMULA TYPED AS A REQUEST IS A FORMULA.
    //
    // =sum(employees[1:1][1:]) typed into the ask box was sent to a model, which answered
    // that nothing here does that and suggested clicking the cell and typing it instead.
    // There is nothing to work out: an "=" at the front is the user saying exactly what they
    // want in the cell, and the only thing to do with it is put it there.
    //
    // IT GOES WHERE THE SELECTION IS, one formula per cell, and the project recalculates. A
    // formula stored per cell is what lets an iterator read each cell's own row -- the same
    // path "Add to each" uses, not a second one.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const f = ('' + ((o && o.formula) || '')).trim();
            if (!f || f.charAt(0) !== '=') { resolve({ error: 'that is not a formula' }); return; }

            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

            let cells = [];
            try {
                if (typeof t.getSelectedWellsInOrder === 'function') cells = t.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'select the cell it should go in first' });
                return;
            }

            try { pushHistory(HM(t)); } catch (e) { }
            let n = 0;
            for (const w of cells) {
                try {
                    const wr = t.getWellRange([w]);
                    try { t.formula[wr] = f; } catch (e) { }
                    try { pt.addFormula(t.name + '' + wr, f); } catch (e) { }
                    // A cell that was red for the formula it used to hold should not stay red
                    // for one it no longer has.
                    try { if (w.clearError) w.clearError(); } catch (e) { }
                    w.setValue(f);
                    n++;
                } catch (e) { }
            }
            if (!n) { resolve({ error: 'the formula could not be written into the cell' }); return; }

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            // WHAT IT CAME OUT AS, because a formula that lands and then fails looks the same
            // as one that was never written.
            let shows = null;
            try {
                const v = cells[0] ? cells[0].value : null;
                shows = (v == null) ? null : ('' + v);
            } catch (e) { shows = null; }
            const broke = (() => {
                try { return !!(cells[0] && cells[0].hasError && cells[0].hasError()); } catch (e) { return false; }
            })();

            try {
                pt.setMessage(n + ' cell' + (n === 1 ? '' : 's') + ' set to ' + f
                    + (broke ? ' — it did not work out; open the cell to see why'
                        : (shows && shows !== f ? ' — ' + shows : '')), 8);
            } catch (e) { }

            resolve({ table: t.name, cells: n, formula: f, shows: shows, error_in_cell: broke || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

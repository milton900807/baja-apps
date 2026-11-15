function (pm, o) {

    // FILLING A TABLE THAT ALREADY HAS ITS COLUMNS.
    //
    // "Add a bunch of employees and appropriate salaries to this for a small biotech company
    // with an in vivo lab" -- a table with Job and Salary across the top, one row in it, and
    // nothing in the app that could put content into it. Making a NEW table from a sentence
    // was covered; filling in the one in front of you was not, and that is the commoner job.
    //
    // THE COLUMNS ARE THE TABLE'S, NOT THE MODEL'S. The headings and a sample of what is
    // already there are sent, and what comes back is rows of exactly that width, which are
    // written into the columns they were generated for. A row of the wrong width is dropped
    // rather than spread across the ones that are there.
    //
    // NOTHING THAT IS ALREADY WRITTEN IS OVERWRITTEN. The rows go into the empty ones at the
    // bottom, and the table is made taller if there are not enough. A table someone has been
    // working in is the worst place to find out that a request meant "replace".
    //
    // GENERATED CELLS ARE VALUES. The python strips a leading "=", and setValue is handed a
    // string: a generated formula would be evaluated against the live workbook, which is a
    // far larger act than filling in some rows.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

            const what = ('' + ((o && o.what) || '')).trim();
            if (!what) { resolve({ error: 'what should go in it?' }); return; }

            const nCols = (t.wells && t.wells.length) || 0;
            const nRows = (nCols && t.wells[0] ? t.wells[0].length : 0);
            if (!nCols || !nRows) { resolve({ error: t.name + ' has no cells to fill' }); return; }

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            const filled = (w) => !!w && ((w.value != null && ('' + w.value).trim() !== '')
                || (typeof w.formula === 'string' && w.formula.trim() !== ''));
            const text = (w) => (w && w.value != null) ? ('' + w.value) : '';

            // The heading row, and the first row under it that is not a heading.
            let firstRow = 0;
            for (let r = 0; r < nRows; r++) {
                let header = false;
                for (let c = 0; c < nCols; c++) { if (isHeaderCell(t.wells[c] && t.wells[c][r])) { header = true; break; } }
                if (header) firstRow = r + 1; else break;
            }
            const columns = [];
            for (let c = 0; c < nCols; c++) {
                const head = firstRow > 0 ? text(t.wells[c] && t.wells[c][firstRow - 1]) : '';
                columns.push(head || ('column ' + (c + 1)));
            }

            // A sample of what is there, so the generated rows match it rather than a guess
            // at what a table of this name usually holds.
            const existing = [];
            for (let r = firstRow; r < nRows && existing.length < 8; r++) {
                let any = false;
                const row = [];
                for (let c = 0; c < nCols; c++) {
                    const w = t.wells[c] && t.wells[c][r];
                    if (filled(w)) any = true;
                    row.push(text(w));
                }
                if (any) existing.push(row);
            }

            const asked = Math.floor(Number((o && o.rows) || 0));
            const wanted = (isFinite(asked) && asked > 0) ? Math.min(asked, 200) : 0;

            let out = null;
            try {
                out = await exec('py/bio/project/table-fill.py', what,
                    JSON.stringify({ table: t.name, columns: columns, existing: existing,
                        rows_wanted: wanted }));
            } catch (e) {
                resolve({ error: 'could not work out what to put in: '
                    + ('' + (e && e.message ? e.message : e)) });
                return;
            }
            if (!out || out.status !== 'OK') {
                resolve({ error: (out && out.error) || 'nothing came back' });
                return;
            }
            // THE WIDTH IS CHECKED AGAIN HERE. The python drops a row that does not have one
            // cell per column, and this checks the same thing: a row of the wrong width
            // written across the columns anyway is content silently put in the wrong place,
            // which is the one failure nobody spots by looking.
            const all = Array.isArray(out.rows) ? out.rows : [];
            const rows = all.filter((row) => Array.isArray(row) && row.length === nCols);
            const wrongWidth = all.length - rows.length;
            if (!rows.length) {
                if (wrongWidth) {
                    resolve({ error: wrongWidth + ' row' + (wrongWidth === 1 ? '' : 's') + ' came back '
                        + 'with the wrong number of cells for ' + t.name + '\u2019s ' + nCols
                        + ' columns, so nothing was written' });
                    return;
                }
                resolve({ error: out.note || 'nothing was generated that fits these columns' });
                return;
            }

            // Where to put them: the empty rows at the bottom, and more rows if needed.
            const emptyFrom = (() => {
                let last = firstRow - 1;
                for (let r = firstRow; r < nRows; r++) {
                    for (let c = 0; c < nCols; c++) { if (filled(t.wells[c] && t.wells[c][r])) { last = r; break; } }
                }
                return last + 1;
            })();
            const room = nRows - emptyFrom;
            let grew = 0;
            if (rows.length > room) {
                const need = rows.length - room;
                for (let i = 0; i < need; i++) { try { t.addRow(); grew++; } catch (e) { break; } }
            }
            const nowRows = (t.wells[0] ? t.wells[0].length : nRows);

            let written = 0, skipped = 0;
            for (let i = 0; i < rows.length; i++) {
                const r = emptyFrom + i;
                if (r >= nowRows) { skipped++; continue; }
                for (let c = 0; c < nCols; c++) {
                    const w = t.wells[c] && t.wells[c][r];
                    if (!w) continue;
                    // Counted from what the cell holds afterwards, not from whether the call
                    // returned: setValue notifies, and a notification can throw on its own.
                    const v = ('' + (rows[i][c] == null ? '' : rows[i][c]));
                    try { if (typeof w.setValue === 'function') w.setValue(v); else w.value = v; } catch (e) { }
                }
                if (t.wells[0][r] && ('' + t.wells[0][r].value) === ('' + rows[i][0])) written++;
            }

            try { if (pt.__collab && !pt.__collab.holds(t)) pt.__collab.acquire(t); } catch (e) { }
            try { if (typeof t.fitRowsAndColumns === 'function') t.fitRowsAndColumns(); } catch (e) { }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage('Put ' + written + ' row' + (written === 1 ? '' : 's') + ' into ' + t.name
                    + (grew ? (', making it ' + grew + ' row' + (grew === 1 ? '' : 's') + ' taller') : '')
                    + (skipped ? ('. ' + skipped + ' did not fit') : ''), 8);
            } catch (e) { }

            resolve({ table: t.name, written: written, added_rows: grew || undefined,
                skipped: skipped || undefined,
                dropped: (out.dropped || 0) + wrongWidth || undefined,
                note: out.note || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

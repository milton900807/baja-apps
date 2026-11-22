function (pm, o) {

    // VALUES FOR THE CELLS THAT ARE SELECTED, FROM ONE SENTENCE.
    //   exec('baja/plate/ops/fill-selection.js', pm, { what: 'typical monthly cost for each of these' })
    //
    // fill_table writes rows into a table and change_values does arithmetic on numbers that
    // are already there. Neither answers the plainest request of all, made with a few cells
    // selected: "put something sensible in these". This does: each selected cell is sent
    // with the label at the start of its row and the heading over its column, and a value
    // comes back for it.
    //
    // ONLY THE CELLS THAT WERE SELECTED ARE WRITTEN, AND NEVER A HEADING OR A FORMULA. The
    // answer is keyed by cell and anything keyed to a cell that was not sent is dropped. A
    // heading is not content. A cell holding a formula is left alone, because a typed-in
    // number over a formula silently stops it calculating; the message says how many were
    // passed over for that.
    //
    // WHAT IS WRITTEN IS A VALUE. A leading "=" is taken off here as well as in the python:
    // a formula is asked for by starting the same prompt with "=", and that goes through
    // the service that checks one before writing it.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            let t = (o && o.plate && Array.isArray(o.plate.wells)) ? o.plate : null;
            if (!t) {
                const IO = await exec('baja/plate/ops/column-io.js');
                const picked = IO.pickTable(pt, o && o.table);
                if (picked.error) { resolve({ error: picked.error }); return; }
                t = picked.table;
            }
            const what = ('' + ((o && o.what) || '')).trim();
            if (!what) { resolve({ error: 'say what the cells should hold' }); return; }

            let cells = [];
            if (o && Array.isArray(o.cells) && o.cells.length) cells = o.cells.slice();
            else {
                try { if (typeof t.getSelectedWellsInOrder === 'function') cells = t.getSelectedWellsInOrder() || []; } catch (e) { cells = []; }
                if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            }
            if (!cells.length) { resolve({ error: 'select the cells to fill in first' }); return; }

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            const text = (w) => (w && w.value != null) ? ('' + w.value).trim() : '';
            const numberish = (s) => s !== '' && isFinite(Number(s.replace(/[$,£€%\s]/g, '')));
            const hasFormula = (w) => {
                try { if (typeof t.formulaTextForWell === 'function' && t.formulaTextForWell(w)) return true; } catch (e) { }
                if (typeof w.formula === 'string' && w.formula.trim()) return true;
                return typeof w.value === 'string' && w.value.trim().charAt(0) === '=';
            };

            const where = (w) => {
                for (let c = 0; c < t.wells.length; c++) {
                    const r = (t.wells[c] || []).indexOf(w);
                    if (r >= 0) return { c: c, r: r };
                }
                return null;
            };
            const headings = t.wells.map((col) => {
                for (let r = 0; r < Math.min(col.length, 3); r++) if (isHeaderCell(col[r])) return text(col[r]).slice(0, 60);
                return '';
            });

            const MAX = 300;
            const send = [], byId = {};
            let headers = 0, formulas = 0, outside = 0;
            for (const w of cells) {
                const p = where(w);
                if (!p) { outside++; continue; }
                if (isHeaderCell(w)) { headers++; continue; }
                if (hasFormula(w)) { formulas++; continue; }
                if (send.length >= MAX) continue;
                // What the row is: the first thing in it that is text and is not this cell.
                let label = '';
                for (let c = 0; c < t.wells.length; c++) {
                    const x = t.wells[c] && t.wells[c][p.r];
                    if (!x || x === w || isHeaderCell(x)) continue;
                    const s = text(x);
                    if (s && !numberish(s) && s.charAt(0) !== '=') { label = s.slice(0, 80); break; }
                }
                const id = p.c + ':' + p.r;
                byId[id] = w;
                send.push({ id: id, row: p.r, column: p.c, label: label, heading: headings[p.c] || '', now: text(w).slice(0, 60) });
            }
            if (!send.length) {
                resolve({ error: formulas
                    ? ('the selected cell' + (formulas === 1 ? ' holds a formula' : 's hold formulas') + ', and a value written over a formula stops it calculating. Start the request with = to change the formula instead')
                    : (headers ? 'only headings are selected, and a heading is not filled in' : 'none of the selected cells is in ' + t.name) });
                return;
            }

            let out = null;
            try {
                out = await exec('py/bio/project/cells-fill.py', what.slice(0, 2000),
                    JSON.stringify({ table: t.name, headings: headings, cells: send }));
            } catch (e) { resolve({ error: 'could not work that out: ' + ('' + (e && e.message ? e.message : e)) }); return; }
            if (!out || out.status !== 'OK') { resolve({ error: (out && out.error) || 'nothing came back' }); return; }

            const values = (out.values && typeof out.values === 'object') ? out.values : {};
            const note = ('' + (out.note || '')).slice(0, 200);
            const ids = Object.keys(values).filter((k) => byId[k]);
            if (!ids.length) {
                resolve({ error: 'nothing was filled in' + (note ? (': ' + note) : ': there was nothing sensible to put in those cells from that') });
                return;
            }

            try { pushHistory(HM(t)); } catch (e) { }
            let written = 0;
            for (const id of ids) {
                let v = ('' + (values[id] == null ? '' : values[id])).trim();
                while (v.charAt(0) === '=') v = v.slice(1).trim();
                if (!v) continue;
                const w = byId[id];
                try { if (w.clearError) w.clearError(); } catch (e) { }
                try { if (typeof w.setValue === 'function') w.setValue(v); else w.value = v; written++; } catch (e) { }
            }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            const left = send.length - written;
            try {
                pt.setMessage(written + ' cell' + (written === 1 ? '' : 's') + ' in ' + t.name + ' filled in'
                    + (left ? ('. ' + left + ' left as ' + (left === 1 ? 'it was' : 'they were') + (note ? (': ' + note) : '')) : (note ? ('. ' + note) : ''))
                    + (formulas ? ('. ' + formulas + ' holding a formula ' + (formulas === 1 ? 'was' : 'were') + ' not touched') : '')
                    + (cells.length > MAX ? ('. Only the first ' + MAX + ' selected cells were looked at') : '')
                    + '. Undo puts them back', 10);
            } catch (e) { }
            resolve({ table: t.name, filled: written, left_alone: left || undefined, formulas_skipped: formulas || undefined, note: note || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

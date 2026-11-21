function (pm, o) {

    // A FORMULA WORKED OUT FROM WORDS, OR FROM A FORMULA THAT DID NOT WORK.
    //   exec('baja/plate/ops/formula-from-words.js', pm, { what: '=sum the cells above' })
    //
    // A cell holding "=sum the cells above" was red, and pressing Enter on it wrote the same
    // text back and left it red. The cell was not empty of meaning: the "=" said a formula
    // was wanted and the words said which one. The same is true of a formula with a bracket
    // missing or a table's name misspelt. Both are a description of a formula by someone who
    // knows what they want, and the app's answer to both was a red square.
    //
    // So the text, the reason the cell is red, and what is around the cell (its table's
    // headings and row labels, the other tables on the canvas) are sent to a model, which
    // answers with one formula in the engine's own form.
    //
    // WHAT COMES BACK IS CHECKED BEFORE IT IS WRITTEN, AND THEN TRIED. A generated formula is
    // a guess until shown otherwise: every table it names has to be on the canvas, every
    // cell it reads has to exist, it may use only the handful of functions listed here, and
    // it is run through the engine once before it goes anywhere near the cell. A formula
    // that fails any of that goes back to the model once, with the reason. If the second
    // one fails too the cell is left exactly as it was and the reason is said: swapping one
    // red formula for another is not a repair.
    //
    // IT SAYS WHAT IT WROTE. A formula rewritten without a word is worse than a red cell,
    // which is at least asking to be looked at. The message carries the new formula and the
    // text it replaced, and the change is on the undo stack.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

            let cells = [];
            try {
                if (typeof t.getSelectedWellsInOrder === 'function') cells = t.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) { resolve({ error: 'click the cell the formula should go in first' }); return; }
            if (cells.length > 1) {
                resolve({ error: 'select one cell: a formula worked out from a description is for the cell it describes' });
                return;
            }
            const cell = cells[0];

            const tables = (Array.isArray(pt.root) ? pt.root : []).filter((p) => p && Array.isArray(p.wells) && p.name);
            const size = (x) => ({ cols: x.wells.length, rows: (x.wells[0] ? x.wells[0].length : 0) });
            let pos = null;
            for (let c = 0; c < t.wells.length && !pos; c++) {
                const r = (t.wells[c] || []).indexOf(cell);
                if (r >= 0) pos = { c: c, r: r };
            }
            if (!pos) { resolve({ error: 'that cell is not in ' + t.name }); return; }

            const was = (cell.value == null) ? '' : ('' + cell.value);
            const what = ('' + ((o && o.what) || '')).trim() || was.trim();
            if (!what) { resolve({ error: 'say what the formula should work out' }); return; }

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            const text = (w) => (w && w.value != null) ? ('' + w.value).slice(0, 60) : '';

            // What a person would read off the table to write this formula themselves.
            const describe = (x, full) => {
                const s = size(x);
                const out = { table: x.name, columns: s.cols, rows: s.rows, headings: [], cells: [] };
                for (let c = 0; c < s.cols; c++) {
                    let h = '';
                    for (let r = 0; r < Math.min(s.rows, 3); r++) {
                        if (isHeaderCell(x.wells[c][r])) { h = text(x.wells[c][r]); break; }
                    }
                    out.headings.push(h);
                }
                const maxRows = full ? 60 : 25;
                for (let r = 0; r < Math.min(s.rows, maxRows); r++) {
                    const row = [];
                    for (let c = 0; c < Math.min(s.cols, 8); c++) {
                        const w = x.wells[c] && x.wells[c][r];
                        row.push(w === cell ? '(THIS CELL)' : text(w));
                    }
                    out.cells.push({ row: r, values: row });
                }
                return out;
            };
            let why = '';
            try { why = ('' + (cell.__errorMessage || '')).slice(0, 300); } catch (e) { why = ''; }
            let hint = null;
            try {
                if (was.trim().charAt(0) === '=') hint = await exec('baja/plate/ops/diagnose-formula.js', pt, t, was.trim(), cell);
            } catch (e) { hint = null; }

            const context = {
                cell: { table: t.name, column: pos.c, row: pos.r,
                    ref: t.name + '[' + pos.c + ':' + pos.c + '][' + pos.r + ':' + pos.r + ']' },
                in_the_cell_now: was.slice(0, 300),
                why_it_is_red: why || (hint && hint.why) || '',
                suggested_by_the_app: (hint && hint.suggest) ? ('' + hint.suggest) : '',
                this_table: describe(t, true),
                other_tables: tables.filter((x) => x !== t).slice(0, 8).map((x) => describe(x, false))
            };

            // ---- the check ------------------------------------------------------------------
            const FUNCS = { sum: 1, average: 1, min: 1, max: 1, abs: 1, sqrt: 1 };
            const byName = (n) => tables.filter((x) => ('' + x.name) === n)[0] || null;
            const names = tables.map((x) => '' + x.name).sort((a, b) => b.length - a.length);
            const check = (raw) => {
                let f = ('' + (raw == null ? '' : raw)).trim();
                if (!f) return { why: 'no formula came back' };
                if (f.charAt(0) !== '=') f = '=' + f;
                const body = f.slice(1).trim();
                if (!body || body.length > 300) return { why: 'the formula is empty or too long' };
                // Every reference, by exact table name, with both of its brackets.
                let rest = '', i = 0, refs = 0;
                while (i < body.length) {
                    let hit = null;
                    for (const n of names) {
                        if (body.startsWith(n + '[', i) && !/[A-Za-z0-9_]/.test(i > 0 ? body.charAt(i - 1) : ' ')) { hit = n; break; }
                    }
                    if (!hit) { rest += body.charAt(i); i++; continue; }
                    const m = /^\[(\d*)(:?)(\d*)\]\[(\d*)(:?)(\d*)\]/.exec(body.slice(i + hit.length));
                    if (!m) return { why: 'the reference to ' + hit + ' is not written as ' + hit + '[column][row]' };
                    const s = size(byName(hit));
                    const lo = (v) => (v === '' ? 0 : parseInt(v, 10));
                    const c0 = lo(m[1]), c1 = m[2] ? (m[3] === '' ? s.cols - 1 : parseInt(m[3], 10)) : c0;
                    const r0 = lo(m[4]), r1 = m[5] ? (m[6] === '' ? s.rows - 1 : parseInt(m[6], 10)) : r0;
                    if (c0 > c1 || r0 > r1 || c1 >= s.cols || r1 >= s.rows) {
                        return { why: hit + ' has columns 0 to ' + (s.cols - 1) + ' and rows 0 to ' + (s.rows - 1)
                            + ', and the formula reads ' + hit + m[0] + ', which is outside it' };
                    }
                    // A formula that reads its own cell goes round in a circle. An open-ended
                    // sum is the one exception the engine makes, and that is its to make.
                    if (byName(hit) === t && pos.c >= c0 && pos.c <= c1 && pos.r >= r0 && pos.r <= r1
                        && !(m[5] && m[6] === '')) {
                        return { why: 'the formula reads the cell it is written in (' + hit + m[0] + ')' };
                    }
                    refs++;
                    rest += ' 1 ';
                    i += hit.length + m[0].length;
                }
                // What is left is arithmetic and the functions on the list.
                const bad = rest.replace(/[A-Za-z_]\w*/g, (w) => (FUNCS[w.toLowerCase()] ? '' : '\u0000' + w));
                const k = bad.indexOf('\u0000');
                if (k >= 0) {
                    const word = /^\u0000([A-Za-z_]\w*)/.exec(bad.slice(k))[1];
                    return { why: '"' + word + '" is not a table on the canvas or a function that can be used here ('
                        + Object.keys(FUNCS).join(', ') + ')' };
                }
                if (!/^[\d\s.+\-*/^(),]*$/.test(bad)) return { why: 'the formula has something in it that is not a reference, a number or arithmetic' };
                let depth = 0;
                for (const ch of rest) { if (ch === '(') depth++; if (ch === ')') depth--; if (depth < 0) break; }
                if (depth !== 0) return { why: 'its brackets do not match' };
                if (!refs && !/\d/.test(rest)) return { why: 'the formula does not read or work out anything' };
                return { formula: '=' + body };
            };
            // Tried once in the engine before it is written. Only a plain failure counts: an
            // engine that cannot be asked here is not a reason to refuse a checked formula.
            const tryOut = async (f) => {
                let r = null;
                try { r = await exec('baja/plate/ops/frun-object.js', f, pt); }
                catch (e) { return ('' + (e && e.message ? e.message : e)).slice(0, 200); }
                if (typeof r === 'string') return /fail/i.test(r) ? 'the engine could not work it out' : null;
                const res = (r && Array.isArray(r.results)) ? r.results : null;
                if (res && res.length && res[0] === null) return 'one of the cells it reads does not hold a number';
                return null;
            };

            let formula = null, note = '', lastWhy = '', rejected = null;
            for (let attempt = 0; attempt < 2 && !formula; attempt++) {
                let out = null;
                try {
                    out = await exec('py/bio/project/formula-write.py', what.slice(0, 1000),
                        JSON.stringify(Object.assign({}, context, rejected ? { rejected: rejected } : {})));
                } catch (e) {
                    resolve({ error: 'could not work out a formula: ' + ('' + (e && e.message ? e.message : e)) });
                    return;
                }
                if (!out || out.status !== 'OK') { resolve({ error: (out && out.error) || 'nothing came back' }); return; }
                note = ('' + (out.note || '')).slice(0, 200);
                if (!out.formula) { lastWhy = note || 'it could not be worked out from that'; break; }
                const v = check(out.formula);
                if (v.formula) {
                    const broke = await tryOut(v.formula);
                    if (!broke) { formula = v.formula; break; }
                    lastWhy = broke;
                } else {
                    lastWhy = v.why;
                }
                rejected = { formula: ('' + out.formula).slice(0, 300), why: lastWhy };
            }
            if (!formula) {
                resolve({ error: 'no formula could be worked out for “' + what.slice(0, 60) + '”: '
                    + (lastWhy || 'nothing usable came back') + '. The cell is as it was' });
                return;
            }

            try { pushHistory(HM(t)); } catch (e) { }
            try {
                const wr = t.getWellRange([cell]);
                try { t.formula[wr] = formula; } catch (e) { }
                try { pt.addFormula(t.name + '' + wr, formula); } catch (e) { }
            } catch (e) { }
            try { if (cell.clearError) cell.clearError(); } catch (e) { }
            try { cell.setValue(formula); } catch (e) { resolve({ error: 'the formula could not be written into the cell' }); return; }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            try {
                pt.setMessage('That cell is now ' + formula
                    + (was.trim() && was.trim() !== formula ? (', worked out from “' + was.trim().slice(0, 60) + '”') : '')
                    + '. Undo puts it back', 10);
            } catch (e) { }

            resolve({ table: t.name, formula: formula, was: was || undefined, note: note || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

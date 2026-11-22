function (pm, o) {

    // A NOTES COLUMN, WRITTEN ROW BY ROW FROM WHAT THE CANVAS ACTUALLY HOLDS.
    //   exec('baja/plate/ops/annotate-rows.js', pm, { table: 'pnl' })
    //   exec('baja/plate/ops/annotate-rows.js', pm, { table: 'pnl', what: 'explain each formula for an investor' })
    //
    // "add a notes column that describes the formula on each row" used to be answered by
    // adding a column and stopping, or by filling it with text made up from the row's label.
    // Neither is a description of the formula: that takes reading the formula.
    //
    // SO EACH FORMULA IS READ HERE, BEFORE ANY MODEL IS ASKED. Every reference in it is
    // resolved against the canvas, the way the engine resolves it: an address to the cells
    // at that position, a tag reference to the cells that carry every tag in it. What is
    // sent for a row is its label, its tags, its values, and for each formula the names of
    // the things it reads and the numbers there now. The note is written from that, so it
    // says "annual insurance divided by twelve" because that is what the formula reads, not
    // because the row is called Insurance. A reference that lands on nothing is sent as
    // unresolved, and the note says so, which is the most useful thing a note can say.
    //
    // THE ROWS ARE GONE THROUGH IN TURN, a handful to a request, with the panel saying how
    // far it has got. One request for a long table is slow, silent, and loses every row if
    // it fails; this way a table of eighty rows shows its progress and keeps what it has.
    //
    // ONLY THE NOTES COLUMN IS WRITTEN. If the table has a column headed Notes it is used;
    // otherwise one is added, by the table's own addColumn. A note already there is kept
    // unless `overwrite` says yes: notes are the one column a person is likely to have
    // typed into, and a regenerated one over a hand-written one is a loss nobody would
    // notice until they wanted it.

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
            const what = ('' + ((o && o.what) || '')).trim() || 'describe each row and the formula in it';
            const heading = ('' + ((o && o.column) || '')).trim() || 'Notes';
            const overwrite = /^(yes|true|1)$/i.test('' + ((o && o.overwrite) || ''));

            const tables = (Array.isArray(pt.root) ? pt.root : []).filter((p) => p && Array.isArray(p.wells) && p.name);
            const byName = (n) => tables.filter((x) => ('' + x.name) === n)[0] || null;
            const names = tables.map((x) => '' + x.name).filter((n) => /^[A-Za-z_]\w*$/.test(n)).sort((a, b) => b.length - a.length);

            const isHeaderCell = (w) => {
                if (!w) return false;
                if (w.skin_type === 'ColumnHeader') return true;
                const g = w.group;
                if (g && typeof g === 'object' && g['ColumnHeader'] != null) return true;
                return (typeof g === 'string' && g === 'ColumnHeader');
            };
            const text = (w) => (w && w.value != null) ? ('' + w.value).trim() : '';
            const numberish = (s) => s !== '' && isFinite(Number(('' + s).replace(/[$,£€%\s]/g, '')));
            const formulaOf = (T, w) => {
                let f = '';
                try { if (typeof T.formulaTextForWell === 'function') f = T.formulaTextForWell(w) || ''; } catch (e) { f = ''; }
                if (!f && w && typeof w.formula === 'string') f = w.formula;
                if (!f && w && typeof w.value === 'string' && w.value.trim().charAt(0) === '=') f = w.value;
                f = ('' + (f || '')).trim().replace(/^(=\s*)+/, '');
                return f ? ('=' + f) : '';
            };
            const headingsOf = (T) => T.wells.map((col) => {
                for (let r = 0; r < Math.min((col || []).length, 3); r++) if (isHeaderCell(col[r])) return text(col[r]).slice(0, 60);
                return '';
            });
            const labelOf = (T, r, not) => {
                for (let c = 0; c < T.wells.length; c++) {
                    const x = T.wells[c] && T.wells[c][r];
                    if (!x || x === not || isHeaderCell(x)) continue;
                    const s = text(x);
                    if (s && !numberish(s) && s.charAt(0) !== '=') return s.slice(0, 80);
                }
                return '';
            };

            // ---- the notes column -------------------------------------------------------------
            let heads = headingsOf(t);
            let nc = -1;
            for (let c = 0; c < heads.length; c++) if (heads[c].toLowerCase() === heading.toLowerCase()) { nc = c; break; }
            // A column whose top cell says Notes but is not marked as a heading is still it.
            if (nc < 0) for (let c = 0; c < t.wells.length; c++) if (text(t.wells[c] && t.wells[c][0]).toLowerCase() === heading.toLowerCase()) { nc = c; break; }
            let added = false;
            if (nc < 0) {
                if (typeof t.addColumn !== 'function') { resolve({ error: t.name + ' cannot be given another column here' }); return; }
                const before = t.wells.length;
                try { t.addColumn(heading); } catch (e) { resolve({ error: 'the ' + heading + ' column could not be added: ' + (e && e.message ? e.message : e) }); return; }
                if (t.wells.length <= before) { resolve({ error: 'the ' + heading + ' column could not be added' }); return; }
                nc = t.wells.length - 1;
                added = true;
                heads = headingsOf(t);
                if (!heads[nc]) heads[nc] = heading;
                try { if (pt.wake) pt.wake(); } catch (e) { }
            } else {
                try { pushHistory(HM(t)); } catch (e) { }
            }
            const nRows = t.wells[0] ? t.wells[0].length : 0;

            // ---- what a formula reads, resolved against the canvas ----------------------------
            const describeCells = (T, cells) => {
                const hs = headingsOf(T);
                const seen = {}, out = { names: [], values: [] };
                for (const w of cells.slice(0, 12)) {
                    let c = -1, r = -1;
                    for (let k = 0; k < T.wells.length && c < 0; k++) { const i = (T.wells[k] || []).indexOf(w); if (i >= 0) { c = k; r = i; } }
                    const nm = [labelOf(T, r, w), hs[c] || ''].filter(Boolean).join(' / ') || ('row ' + r);
                    if (!seen[nm]) { seen[nm] = 1; out.names.push(nm); }
                    const v = text(w);
                    if (v && v.charAt(0) !== '=') out.values.push(v.slice(0, 24));
                }
                if (cells.length > 12) out.more = cells.length - 12;
                return out;
            };
            const reads = (formula) => {
                const body = formula.slice(1);
                const out = [];
                let i = 0;
                while (i < body.length && out.length < 12) {
                    let hit = null;
                    for (const n of names) {
                        if (body.startsWith(n + '[', i) && !/[A-Za-z0-9_]/.test(i > 0 ? body.charAt(i - 1) : ' ')) { hit = n; break; }
                    }
                    if (!hit) { i++; continue; }
                    const rest = body.slice(i + hit.length);
                    const T = byName(hit);
                    const cols = T.wells.length, rows = T.wells[0] ? T.wells[0].length : 0;
                    const am = /^\[(\d*)(:?)(\d*)\]\[(\d*)(:?)(\d*)\]/.exec(rest);
                    if (am) {
                        const lo = (v) => (v === '' ? 0 : parseInt(v, 10));
                        const c0 = lo(am[1]), c1 = am[2] ? (am[3] === '' ? cols - 1 : parseInt(am[3], 10)) : c0;
                        const r0 = lo(am[4]), r1 = am[5] ? (am[6] === '' ? rows - 1 : parseInt(am[6], 10)) : r0;
                        const cells = [];
                        for (let c = c0; c <= c1 && c < cols; c++) for (let r = r0; r <= r1 && r < rows; r++) if (T.wells[c] && T.wells[c][r] && !isHeaderCell(T.wells[c][r])) cells.push(T.wells[c][r]);
                        out.push(cells.length ? Object.assign({ table: hit, cells: cells.length }, describeCells(T, cells))
                            : { table: hit, unresolved: hit + am[0] + ' is outside the table' });
                        i += hit.length + am[0].length;
                        continue;
                    }
                    const tm = /^\[([^\[\]]+)\]/.exec(rest);
                    if (tm) {
                        const tags = tm[1].split(/\s*,\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
                        const cells = [];
                        for (let c = 0; c < cols; c++) for (const w of (T.wells[c] || [])) {
                            if (!w || !w.group || typeof w.group !== 'object' || isHeaderCell(w)) continue;
                            if (tags.every((g) => Object.prototype.hasOwnProperty.call(w.group, g))) cells.push(w);
                        }
                        out.push(cells.length ? Object.assign({ table: hit, tags: tags, cells: cells.length }, describeCells(T, cells))
                            : { table: hit, tags: tags, unresolved: 'no cell in ' + hit + ' is tagged ' + tags.join(' and ') });
                        i += hit.length + tm[0].length;
                        continue;
                    }
                    i += hit.length;
                }
                return out;
            };

            // Which rows elsewhere read a given cell of this table: "used by", for inputs.
            const usedBy = (() => {
                const map = new Map();
                let budget = 4000;
                for (const T of tables) {
                    for (let c = 0; c < T.wells.length; c++) {
                        const col = T.wells[c] || [];
                        for (let r = 0; r < col.length && budget > 0; r++) {
                            const w = col[r];
                            if (!w || (T === t && c === nc)) continue;
                            const f = formulaOf(T, w);
                            if (!f || f.indexOf(t.name + '[') < 0) continue;
                            budget--;
                            const who = (T === t ? '' : (T.name + ': ')) + (labelOf(T, r, w) || ('row ' + r));
                            const body = f.slice(1);
                            let i = body.indexOf(t.name + '[');
                            while (i >= 0) {
                                const rest = body.slice(i + t.name.length);
                                const am = /^\[(\d*)(:?)(\d*)\]\[(\d*)(:?)(\d*)\]/.exec(rest);
                                const tm = am ? null : /^\[([^\[\]]+)\]/.exec(rest);
                                const rowsHit = [];
                                if (am) {
                                    const r0 = am[4] === '' ? 0 : parseInt(am[4], 10);
                                    const r1 = am[5] ? (am[6] === '' ? nRows - 1 : parseInt(am[6], 10)) : r0;
                                    for (let k = r0; k <= r1 && k < nRows && rowsHit.length < 200; k++) rowsHit.push(k);
                                } else if (tm) {
                                    const tags = tm[1].split(/\s*,\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
                                    for (let k = 0; k < nRows; k++) {
                                        for (let cc = 0; cc < t.wells.length; cc++) {
                                            const x = t.wells[cc] && t.wells[cc][k];
                                            if (x && x.group && typeof x.group === 'object' && tags.every((g) => Object.prototype.hasOwnProperty.call(x.group, g))) { rowsHit.push(k); break; }
                                        }
                                    }
                                }
                                for (const k of rowsHit) {
                                    if (T === t && k === r) continue;
                                    const a = map.get(k) || [];
                                    if (a.indexOf(who) < 0 && a.length < 6) a.push(who);
                                    map.set(k, a);
                                }
                                i = body.indexOf(t.name + '[', i + t.name.length);
                            }
                        }
                    }
                }
                return map;
            })();

            // ---- the rows ---------------------------------------------------------------------
            const MAX = 400;
            const rows = [];
            let alreadyNoted = 0, emptyRows = 0;
            for (let r = 0; r < nRows && rows.length < MAX; r++) {
                const noteCell = t.wells[nc] && t.wells[nc][r];
                if (!noteCell || isHeaderCell(noteCell)) continue;
                if (isHeaderCell(t.wells[0] && t.wells[0][r])) continue;
                if (r === 0 && added) continue;                                  // the new heading
                const cells = [];
                const tagset = {};
                let formulas = 0;
                for (let c = 0; c < t.wells.length; c++) {
                    if (c === nc) continue;
                    const w = t.wells[c] && t.wells[c][r];
                    if (!w) continue;
                    if (w.group && typeof w.group === 'object') for (const g of Object.keys(w.group)) tagset[g] = 1;
                    const f = formulaOf(t, w);
                    const v = text(w);
                    if (!f && !v) continue;
                    const cell = { heading: heads[c] || ('column ' + c), value: (v && v.charAt(0) !== '=') ? v.slice(0, 60) : '' };
                    if (f) { cell.formula = f.slice(0, 300); cell.reads = reads(f); formulas++; }
                    cells.push(cell);
                }
                if (!cells.length) { emptyRows++; continue; }
                if (text(noteCell) && !overwrite) { alreadyNoted++; continue; }
                const row = { row: r, label: labelOf(t, r, noteCell), tags: Object.keys(tagset).filter((g) => g !== 'ColumnHeader').slice(0, 8), cells: cells };
                if (!formulas && usedBy.has(r)) row.used_by = usedBy.get(r);
                rows.push({ send: row, cell: noteCell });
            }
            if (!rows.length) {
                resolve({ error: alreadyNoted
                    ? ('every row of ' + t.name + ' already has a note, and notes that are there are kept. Ask to rewrite them to replace them')
                    : (t.name + ' has no rows with anything in them to write about') });
                return;
            }

            const others = tables.filter((x) => x !== t).slice(0, 12).map((x) => ({ table: x.name, headings: headingsOf(x).filter(Boolean).slice(0, 8) }));
            const panel = () => { try { return (typeof window !== 'undefined') ? window.__bajaWorking : null; } catch (e) { return null; } };
            const BATCH = 12;
            let written = 0, unanswered = 0, failedBatches = 0, firstError = '';
            for (let i = 0; i < rows.length; i += BATCH) {
                const part = rows.slice(i, i + BATCH);
                const msg = 'Writing notes for ' + t.name + ': rows ' + (i + 1) + ' to ' + (i + part.length) + ' of ' + rows.length
                    + (written ? (', ' + written + ' written') : '');
                try { const p = panel(); if (p && p.step) p.step(msg); } catch (e) { }
                try { pt.setMessage(msg, 20); } catch (e) { }
                let out = null;
                try {
                    out = await exec('py/bio/project/rows-annotate.py', what.slice(0, 2000),
                        JSON.stringify({ table: t.name, headings: heads.filter((h, c) => c !== nc), rows: part.map((x) => x.send), other_tables: others }));
                } catch (e) { out = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }
                if (!out || out.status !== 'OK') {
                    failedBatches++;
                    if (!firstError) firstError = (out && out.error) || 'nothing came back';
                    // Two in a row with nothing written at all: it is not going to work.
                    if (failedBatches >= 2 && !written) break;
                    continue;
                }
                const notes = (out.notes && typeof out.notes === 'object') ? out.notes : {};
                for (const x of part) {
                    let v = notes['' + x.send.row];
                    v = (typeof v === 'string') ? v.replace(/\s+/g, ' ').trim() : '';
                    while (v.charAt(0) === '=') v = v.slice(1).trim();
                    if (!v) { unanswered++; continue; }
                    try { if (typeof x.cell.setValue === 'function') x.cell.setValue(v.slice(0, 400)); else x.cell.value = v.slice(0, 400); written++; } catch (e) { }
                    // A NOTE IS SHOWN WHOLE. Plain text cuts a sentence off at the edge of the
                    // cell with an ellipsis, which for a note is most of it gone. The wrapped
                    // type draws all of it. Only where no type has been chosen for the cell:
                    // a type somebody set is theirs.
                    try {
                        if (!x.cell.skin_type || x.cell.skin_type === 'SIMPLE_TEXT') {
                            if (typeof x.cell.setWellType === 'function') x.cell.setWellType('WRAP_TEXT'); else x.cell.skin_type = 'WRAP_TEXT';
                        }
                    } catch (e) { }
                }
                // Shown as it goes: the column fills in front of the user.
                try { if (pt.wake) pt.wake(); } catch (e) { }
            }

            if (!written) {
                resolve({ error: 'no notes could be written for ' + t.name + ': ' + (firstError || 'nothing came back')
                    + (added ? ('. The ' + heading + ' column was added and is empty; undo removes it') : '') });
                return;
            }
            try { if (typeof t.fitRowsAndColumns === 'function') t.fitRowsAndColumns(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            const summary = (added ? ('Added a ' + heading + ' column to ' + t.name + ' and wrote ') : ('Wrote '))
                + written + ' note' + (written === 1 ? '' : 's') + (added ? '' : (' in the ' + heading + ' column of ' + t.name))
                + (alreadyNoted ? ('. ' + alreadyNoted + ' row' + (alreadyNoted === 1 ? ' already had a note, which was' : 's already had notes, which were') + ' kept') : '')
                + (unanswered ? ('. ' + unanswered + ' row' + (unanswered === 1 ? '' : 's') + ' had nothing worth saying and ' + (unanswered === 1 ? 'was' : 'were') + ' left blank') : '')
                + (failedBatches ? ('. ' + failedBatches + ' group' + (failedBatches === 1 ? '' : 's') + ' of rows could not be done (' + firstError.slice(0, 80) + '); ask again to fill them in') : '')
                + (nRows > MAX && rows.length >= MAX ? ('. Only the first ' + MAX + ' rows were done') : '');
            try { pt.setMessage(summary + '. Undo puts it back', 12); } catch (e) { }
            resolve({ table: t.name, column: heading, added_column: added || undefined, notes: written,
                kept: alreadyNoted || undefined, blank: unanswered || undefined, failed_groups: failedBatches || undefined, summary: summary });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

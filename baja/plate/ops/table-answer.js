function (pm, o) {

    // A QUESTION ABOUT A TABLE IS ANSWERED, FROM THE CANVAS.
    //
    // "how many kegs does this create", asked of the assumptions table, came back "Nothing
    // here does that": the command card matches a sentence to something the app can DO, and
    // a question asks for nothing to be done. This is what answers it.
    //
    // WHAT IS SENT. The table the question was asked from, every cell that holds something,
    // each with the names of its row and column, its formula and its tags; and the other
    // tables on the canvas the same way, because the answer is very often already worked
    // out in one of them (a production_capacity table beside the assumptions). The asked
    // table gets the most room, the rest share what is left.
    //
    // THE STRATEGY is the model's to follow and is written out in
    // py/bio/project/table-answer.py: read it off a cell if a cell already is the answer,
    // work it out if the numbers are there, estimate only with every outside figure named,
    // describe if it is not a number, and otherwise say what is missing.
    //
    // WHAT COMES BACK IS CHECKED, NOT TRUSTED.
    //   - Every cell cited is found again on the canvas. One that is not there is dropped,
    //     and the value shown is the one in the cell now, not the one the model quoted.
    //   - The arithmetic is done again here from "calc", which may hold only numbers and
    //     + - * / ( ). The figure shown is this one. If the model's own differs, that is said.
    //   - An answer "read" from a cell with no cell left to show for it is marked unchecked.
    //
    // NOTHING IS WRITTEN. This reads the canvas and answers. Putting the answer on the
    // canvas is a separate request, offered as "next".
    //
    // o: { question, table?: name, plate?: the table itself }
    // Resolves { answer: {kind, answer, calc, value, unit, from: [{table, at, value, why, well, plate}],
    //            assumed, missing, next, unchecked, disagrees}, table } or { error }.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const question = ('' + ((o && o.question) || '')).trim();
            if (!question) { resolve({ error: 'There is no question to answer.' }); return; }
            const tables = (pt && Array.isArray(pt.root) ? pt.root : []).filter((p) => p && Array.isArray(p.wells) && p.wells.length && p.name);
            if (!tables.length) { resolve({ error: 'There are no tables on the canvas to answer from.' }); return; }

            // Which table "this" is: the one handed in, the one named, the one the question
            // names, the one selected. With none of those, no table is singled out.
            const byName = (n) => { const k = ('' + (n || '')).trim().toLowerCase(); return k ? (tables.filter((x) => ('' + x.name).toLowerCase() === k)[0] || null) : null; };
            let asked = (o && o.plate && tables.indexOf(o.plate) >= 0) ? o.plate : byName(o && o.table);
            if (!asked) {
                const low = question.toLowerCase();
                asked = tables.filter((x) => { const n = ('' + x.name).toLowerCase(); return n.length > 2 && (low.indexOf(n) >= 0 || low.indexOf(n.replace(/_/g, ' ')) >= 0); })
                    .sort((a, b) => ('' + b.name).length - ('' + a.name).length)[0] || null;
            }
            if (!asked && pt.selectedPlate && tables.indexOf(pt.selectedPlate) >= 0) asked = pt.selectedPlate;

            const isHead = (w, kind) => !!w && (w.skin_type === kind || (w.group && typeof w.group === 'object' && w.group[kind] != null));
            const text = (w) => (w && w.value != null) ? ('' + w.value).trim() : '';
            const formulaOf = (T, w) => {
                let f = '';
                try { if (typeof T.formulaTextForWell === 'function') f = T.formulaTextForWell(w) || ''; } catch (e) { f = ''; }
                if (!f && w && typeof w.formula === 'string') f = w.formula;
                f = ('' + (f || '')).trim().replace(/^(=\s*)+/, '');
                return f ? ('=' + f) : '';
            };
            const SKIP = { RowHeader: 1, ColumnHeader: 1, dollar: 1, percent: 1, $: 1 };

            // One table, as cells with their names. The row's name is its first text cell
            // (its header if it has one); the column's is its header cell, if it has one.
            const describe = (T, room) => {
                const cols = T.wells.length, rows = T.wells[0] ? T.wells[0].length : 0;
                const colName = [];
                for (let c = 0; c < cols; c++) {
                    let n = '';
                    for (let r = 0; r < Math.min(rows, 3) && !n; r++) if (isHead(T.wells[c][r], 'ColumnHeader')) n = text(T.wells[c][r]);
                    colName.push(n.slice(0, 60));
                }
                const rowName = (r, not) => {
                    for (let c = 0; c < cols; c++) { const w = T.wells[c] && T.wells[c][r]; if (w && w !== not && isHead(w, 'RowHeader') && text(w)) return text(w).slice(0, 60); }
                    for (let c = 0; c < cols; c++) { const w = T.wells[c] && T.wells[c][r]; const s = text(w); if (w && w !== not && s && !isFinite(Number(s.replace(/[$,%\s]/g, '')))) return s.slice(0, 60); }
                    return '';
                };
                const cells = [];
                let left = 0;
                for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                    const w = T.wells[c] && T.wells[c][r];
                    const v = text(w), f = w ? formulaOf(T, w) : '';
                    if (!w || (!v && !f)) continue;
                    if (cells.length >= room) { left++; continue; }
                    const cell = { at: '[' + c + ':' + c + '][' + r + ':' + r + ']', value: v.slice(0, 160) };
                    const rn = rowName(r, w), cn = colName[c];
                    if (rn) cell.row = rn;
                    if (cn && cn !== v) cell.column = cn;
                    if (f) cell.formula = f.slice(0, 200);
                    const tags = (w.group && typeof w.group === 'object') ? Object.keys(w.group).filter((k) => !SKIP[k]) : [];
                    if (tags.length) cell.tags = tags.slice(0, 6);
                    cells.push(cell);
                }
                const out = { name: '' + T.name, columns: cols, rows: rows, cells: cells };
                if (left) out.cells_not_shown = left;
                return out;
            };
            const others = tables.filter((x) => x !== asked).slice(0, 24);
            const share = Math.max(40, Math.floor(1500 / Math.max(1, others.length)));
            const canvas = { asked: asked ? ('' + asked.name) : null,
                tables: (asked ? [describe(asked, 700)] : []).concat(others.map((x) => describe(x, Math.min(300, share)))) };

            let r = null;
            try { r = await exec('py/bio/project/table-answer.py', question, JSON.stringify(canvas), (o && o.model) || ''); }
            catch (e) { r = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }
            if (!r || r.status !== 'OK' || !r.answer) { resolve({ error: 'Could not answer that: ' + ((r && r.error) || 'no answer came back') }); return; }
            const a = r.answer;

            // ---- every cell cited, found again -------------------------------------------
            const from = [];
            for (const c of (Array.isArray(a.from) ? a.from : [])) {
                const T = byName(c && c.table);
                const m = /^\[(\d+):\d+\]\[(\d+):\d+\]$/.exec(('' + ((c && c.at) || '')).replace(/\s+/g, ''));
                if (!T || !m) continue;
                const w = T.wells[+m[1]] && T.wells[+m[1]][+m[2]];
                if (!w) continue;
                if (from.some((x) => x.well === w)) continue;
                from.push({ table: '' + T.name, at: '[' + (+m[1]) + ':' + (+m[1]) + '][' + (+m[2]) + ':' + (+m[2]) + ']', value: text(w), why: ('' + (c.why || '')).slice(0, 120), well: w, plate: T });
            }

            // ---- the arithmetic, done again ----------------------------------------------
            let value = null, disagrees = false;
            const calc = ('' + (a.calc || '')).trim();
            if (calc && /^[0-9\s.+\-*/()]+$/.test(calc) && /[0-9]/.test(calc) && !/\*\*|\/\//.test(calc)) {
                try { const v = Function('"use strict"; return (' + calc + ');')(); if (typeof v === 'number' && isFinite(v)) value = v; } catch (e) { value = null; }
            }
            if (value != null && typeof a.result === 'number' && isFinite(a.result)) {
                disagrees = Math.abs(value - a.result) > Math.max(1e-9, Math.abs(value) * 0.005);
            }
            const kind = ['read', 'calculated', 'estimate', 'describe', 'cannot'].indexOf(a.kind) >= 0 ? a.kind : 'describe';
            // Read from a cell, or worked out from cells, with no cell to show for it.
            const unchecked = (kind === 'read' || kind === 'calculated') && from.length === 0;

            resolve({ table: asked ? ('' + asked.name) : '', answer: {
                kind: kind, answer: '' + a.answer, calc: value != null ? calc : '', value: value, unit: '' + (a.unit || ''),
                from: from, assumed: Array.isArray(a.assumed) ? a.assumed.map((s) => '' + s) : [],
                missing: '' + (a.missing || ''), next: '' + (a.next || ''), unchecked: unchecked, disagrees: disagrees } });
        } catch (e) {
            resolve({ error: 'Could not answer that: ' + (e && e.message ? e.message : e) });
        }
    });
}

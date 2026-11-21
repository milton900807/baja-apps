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
    //
    // A TABLE WORKED OUT FROM ANOTHER TABLE READS IT, WITH FORMULAS. "use assumptions to
    // create a monthly cost table" made a table of typed-in numbers: the generator was never
    // shown assumptions at all, so the figures were invented, and even right ones would
    // have gone stale the moment an assumption changed. That is the one case where values
    // are the wrong answer. So a table the request draws on (o.from, or a table the request
    // names) is sent with a reference for every number in it, and a cell worked out from
    // those numbers comes back as a formula over those references.
    //
    // THAT IS THE ONLY FORMULA THAT IS EVER WRITTEN, AND IT IS CHECKED HERE, NOT TRUSTED.
    // A generated formula is kept only when it is made of nothing but the references that
    // were sent, plain numbers, + - * / and brackets. No function, no other table, no
    // range that was not offered. Anything else is not written at all, and is counted and
    // said: its text without the "=" would be rubbish in a cell that looks like an answer.
    //
    // A TABLE THAT IS NOT THERE YET IS MADE, CENTRED, AND THEN FILLED. "create a table of
    // assumptions of costs associated with single sea plane operations" came back as "there
    // is no table called assumptions": the plan was a fill, the fill was right, and the only
    // thing missing was the table it was to go in. Refusing over that hands the user a
    // two-step job that the request already described in one sentence.
    //
    // It is made FIRST and put in front of the user before anything is generated, so a
    // request that takes a few seconds to answer shows the thing it is answering into,
    // rather than an empty canvas and then everything at once.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const what = ('' + ((o && o.what) || '')).trim();
            if (!what) { resolve({ error: 'what should go in it?' }); return; }

            let picked = IO.pickTable(pt, o && o.table);
            let made = null;
            if (picked.error && /^there is no table called /.test(picked.error)) {
                made = await (async () => {
                    const want = ('' + ((o && o.table) || '')).trim();
                    // The headings the request implies. The fill python will not invent
                    // columns -- filling a table whose columns are fixed is its one job, and
                    // that is what keeps generated rows in the columns they were made for --
                    // so they come from the request, through the plan.
                    const heads = ('' + ((o && o.columns) || '')).split(',')
                        .map((x) => x.trim()).filter(Boolean).slice(0, 40);
                    // Nothing said: a label and a number, which is the shape of nearly every
                    // table a sentence like this asks for. Said plainly in the result rather
                    // than passed off as what was asked for.
                    const cols = heads.length ? heads : ['Item', 'Value'];
                    const askedRows = Math.floor(Number((o && o.rows) || 0));
                    const body = (isFinite(askedRows) && askedRows > 0) ? Math.min(askedRows, 200) : 10;
                    const r = await exec('baja/plate/ops/new-table.js', pm,
                        { rows: body + 1, cols: cols.length, name: want });
                    if (!r || r.error) return { error: (r && r.error) || 'the table could not be made' };
                    const t2 = (typeof pt.getTableByName === 'function') ? pt.getTableByName(r.name) : null;
                    if (!t2) return { error: 'the table was made but could not be found again' };
                    // The headings, in the top row, marked as headings: the same test the
                    // fill below uses to find them, so the rows start underneath rather than
                    // writing over them.
                    for (let c = 0; c < cols.length; c++) {
                        const w = t2.wells[c] && t2.wells[c][0];
                        if (!w) continue;
                        try { if (typeof w.setValue === 'function') w.setValue(cols[c]); else w.value = cols[c]; } catch (e) { }
                        try { w.skin_type = 'ColumnHeader'; } catch (e) { }
                    }
                    try { if (typeof t2.setColumnHeader === 'function') t2.setColumnHeader(0); } catch (e) { }
                    try { if (typeof t2.fitRowsAndColumns === 'function') t2.fitRowsAndColumns(); } catch (e) { }
                    try { if (pt.wake) pt.wake(); } catch (e) { }
                    try { pt.setMessage('Made ' + r.name + '. Filling it in \u2026', 20); } catch (e) { }
                    return { table: t2, name: r.name, columns: cols, guessed: !heads.length };
                })();
                if (made.error) { resolve({ error: made.error }); return; }
                picked = { table: made.table };
            }
            if (picked.error) { resolve({ error: picked.error }); return; }
            const t = picked.table;

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

            // THE TABLES THIS ONE IS WORKED OUT FROM. Named by the plan (o.from), or named
            // in the request itself: "monthly cost table based on assumptions" says it as
            // plainly as a parameter would. Only a name a formula can carry is used, and
            // never the table being filled.
            const numberIn = (w) => {
                if (!w || isHeaderCell(w)) return false;
                if (typeof w.formula === 'string' && w.formula.trim()) return true;
                const v = w.value;
                if (v == null || ('' + v).trim() === '') return false;
                const x = ('' + v).replace(/[$,£€\s]/g, '').replace(/%$/, '');
                return x !== '' && isFinite(Number(x));
            };
            const sources = [], allowed = {};
            (() => {
                const all = (Array.isArray(pt.root) ? pt.root : [])
                    .filter((p) => p && Array.isArray(p.wells) && p !== t && p.name
                        && /^[A-Za-z_]\w*$/.test('' + p.name));
                const named = ('' + ((o && o.from) || '')).split(',')
                    .map((x) => x.trim().toLowerCase()).filter(Boolean);
                const said = what.toLowerCase();
                const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let budget = 300;
                for (const src of all) {
                    const nm = ('' + src.name).toLowerCase();
                    const mentioned = new RegExp('(^|[^a-z0-9_])' + esc(nm) + '($|[^a-z0-9_])').test(said);
                    if (named.indexOf(nm) < 0 && !mentioned) continue;
                    const sc = src.wells.length, sr = (src.wells[0] ? src.wells[0].length : 0);
                    const cells = [];
                    for (let r = 0; r < sr && budget > 0; r++) {
                        // What the row is called: the first thing in it that is not a number.
                        let label = '';
                        for (let c = 0; c < sc; c++) {
                            const w = src.wells[c] && src.wells[c][r];
                            if (w && !isHeaderCell(w) && filled(w) && !numberIn(w)) { label = text(w).slice(0, 80); break; }
                        }
                        for (let c = 0; c < sc && budget > 0; c++) {
                            const w = src.wells[c] && src.wells[c][r];
                            if (!numberIn(w)) continue;
                            let head = '';
                            for (let h = r - 1; h >= 0; h--) {
                                const hw = src.wells[c][h];
                                if (isHeaderCell(hw)) { head = text(hw).slice(0, 60); break; }
                            }
                            const ref = src.name + '[' + c + ':' + c + '][' + r + ':' + r + ']';
                            allowed[ref] = true;
                            cells.push({ ref: ref, label: label, column: head, value: text(w).slice(0, 40) });
                            budget--;
                        }
                    }
                    if (cells.length) sources.push({ table: src.name, cells: cells });
                }
            })();

            // ONLY WHAT WAS OFFERED, AND ARITHMETIC. Every reference is taken out by exact
            // match; what is left has to be numbers, + - * / and brackets, and nothing else.
            const checked = (v) => {
                let f = ('' + v).trim().replace(/^=+\s*/, '');
                if (!f) return null;
                let refs = 0, rest = '', i = 0;
                const names = Object.keys(allowed).sort((a, b) => b.length - a.length);
                while (i < f.length) {
                    let hit = null;
                    for (const n of names) { if (f.startsWith(n, i)) { hit = n; break; } }
                    if (hit) { refs++; rest += ' 1 '; i += hit.length; } else { rest += f.charAt(i); i++; }
                }
                if (!refs) return null;
                if (!/^[\d\s.+\-*/()]+$/.test(rest)) return null;
                let depth = 0;
                for (const ch of rest) { if (ch === '(') depth++; if (ch === ')') depth--; if (depth < 0) return null; }
                if (depth !== 0) return null;
                // Two things side by side with no operator between them is not arithmetic.
                if (/[\d.)]\s+[\d.(]/.test(rest.replace(/\s+/g, ' ')) || /\)\s*\(/.test(rest)
                    || /[+\-*/]\s*[*/)]/.test(rest) || /\(\s*[*/)]/.test(rest) || /[+\-*/]\s*$/.test(rest)
                    || /^\s*[*/]/.test(rest)) return null;
                return '=' + f.replace(/\s+/g, '');
            };

            let out = null;
            try {
                out = await exec('py/bio/project/table-fill.py', what,
                    JSON.stringify({ table: t.name, columns: columns, existing: existing,
                        rows_wanted: wanted, sources: sources.length ? sources : undefined }));
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

            let written = 0, skipped = 0, formulas = 0, unchecked = 0;
            for (let i = 0; i < rows.length; i++) {
                const r = emptyFrom + i;
                if (r >= nowRows) { skipped++; continue; }
                for (let c = 0; c < nCols; c++) {
                    const w = t.wells[c] && t.wells[c][r];
                    if (!w) continue;
                    // Counted from what the cell holds afterwards, not from whether the call
                    // returned: setValue notifies, and a notification can throw on its own.
                    let v = ('' + (rows[i][c] == null ? '' : rows[i][c]));
                    if (v.trim().charAt(0) === '=') {
                        const f = sources.length ? checked(v) : null;
                        if (f) {
                            try {
                                const wr = t.getWellRange([w]);
                                try { t.formula[wr] = f; } catch (e) { }
                                try { pt.addFormula(t.name + '' + wr, f); } catch (e) { }
                            } catch (e) { }
                            try { if (typeof w.setValue === 'function') w.setValue(f); else w.value = f; } catch (e) { }
                            formulas++;
                            continue;
                        }
                        // Not one of ours: left empty and said, never written as text.
                        unchecked++;
                        v = '';
                    }
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
                    + (formulas ? ('. ' + formulas + ' cell' + (formulas === 1 ? ' is a formula' : 's are formulas')
                        + ' reading ' + sources.map((x) => x.table).join(' and ')
                        + ', so ' + (formulas === 1 ? 'it follows' : 'they follow') + ' when it changes') : '')
                    + (unchecked ? ('. ' + unchecked + ' cell' + (unchecked === 1 ? '' : 's')
                        + ' came back as a formula that could not be checked and '
                        + (unchecked === 1 ? 'was' : 'were') + ' left empty') : '')
                    + (skipped ? ('. ' + skipped + ' did not fit') : ''), 8);
            } catch (e) { }

            resolve({ table: t.name, written: written,
                created: made ? made.name : undefined,
                columns: made ? made.columns.join(', ') : undefined,
                // SAID, NOT SLIPPED IN. Columns nobody asked for are a guess, and a guess
                // the user is not told about is one they cannot correct.
                note_columns: (made && made.guessed)
                    ? ('the request did not say what the columns should be, so it was made with '
                        + made.columns.join(' and ') + '; rename them and fill it again to change that')
                    : undefined,
                formulas: formulas || undefined,
                reads: (formulas && sources.length) ? sources.map((x) => x.table).join(', ') : undefined,
                left_empty: unchecked || undefined,
                added_rows: grew || undefined,
                skipped: skipped || undefined,
                dropped: (out.dropped || 0) + wrongWidth || undefined,
                note: out.note || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

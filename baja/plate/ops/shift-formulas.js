function (pt, tableName, atRow, by) {

    // ROWS MOVED, SO THE FORMULAS MOVE WITH THEM.
    //
    // Inserting a row shifts cells down and leaves everything that refers to them pointing
    // at what used to be there. A total stops counting the row it was built to count; a cell
    // on another sheet reads its neighbour's number; a reference past the new end goes red.
    // None of it is announced, and all of it looks like the table was fine.
    //
    // TWO THINGS MOVE, and they are not the same thing.
    //
    //   1. WHERE A FORMULA LIVES. A formula is held against the cell it sits in --
    //      Name[c:c][r:r] -- and the cells below the insertion are now one row lower, so
    //      those keys move with them. Done from the bottom up, or a key shifted downwards
    //      lands on one not yet moved and one of the two is lost.
    //
    //   2. WHAT A FORMULA POINTS AT. Every reference to this table ANYWHERE -- in this
    //      table, in another table, on a cell, in the project's own map -- is read and
    //      shifted. "All along the path" is the whole point: a figure three sheets away is
    //      still reading row 9.
    //
    // A RANGE THAT SPANS THE INSERTION GROWS; one entirely below it moves. =sum(T[1:1][1:6])
    // with a row put in at 3 becomes [1:7], so a total still totals what is under it, which
    // is what inserting a row into a list is FOR. A range wholly above is left alone.
    //
    // NOTHING IS GUESSED. Only references naming this table are touched, only row numbers at
    // or below the insertion move, and the count of what changed comes back so the caller
    // can say it rather than claim it.

    const name = ('' + (tableName == null ? '' : tableName)).trim();
    const at = Math.floor(Number(atRow));
    const n = Math.floor(Number(by));
    const out = { keys: 0, refs: 0, cells: 0 };
    if (!pt || !name || !isFinite(at) || !isFinite(n) || n === 0) return out;

    const tables = Array.isArray(pt.root) ? pt.root.filter((p) => p && Array.isArray(p.wells)) : [];

    // --- 2. what a formula points at -------------------------------------------------
    // Name[c]..[r] in either form, single or range, with the name matched exactly: a table
    // called Salary must not be touched by a shift in Salaries.
    const REF = new RegExp('(^|[^A-Za-z0-9_])(' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + ')\\s*\\[(\\d+)(?::(\\d+))?\\]\\s*\\[(\\d+)(?::(\\d+))?\\]', 'g');
    const rewrite = (text) => {
        const s = '' + (text == null ? '' : text);
        if (!s || s.indexOf(name) < 0) return s;
        let touched = 0;
        const next = s.replace(REF, (whole, pre, nm, c0, c1, r0, r1) => {
            const R0 = +r0, R1 = (r1 == null ? +r0 : +r1);
            let a = R0, b = R1;
            if (R0 >= at) { a = R0 + n; b = R1 + n; }          // wholly below: it moves
            else if (R1 >= at) { b = R1 + n; }                 // spans it: it grows
            else return whole;                                  // wholly above: untouched
            touched++;
            const cols = (c1 == null) ? ('[' + c0 + ']') : ('[' + c0 + ':' + c1 + ']');
            const rows = (r1 == null) ? ('[' + a + ']') : ('[' + a + ':' + b + ']');
            return pre + nm + cols + rows;
        });
        if (touched) out.refs += touched;
        return next;
    };

    try {
        for (const t of tables) {
            // the text held in the table's own map
            for (const k of Object.keys(t.formula || {})) {
                const was = t.formula[k];
                const now = rewrite(was);
                if (now !== was) t.formula[k] = now;
            }
            // and the text sitting in the cells, which is what is drawn and recalculated
            for (let c = 0; c < t.wells.length; c++) {
                const col = t.wells[c] || [];
                for (let r = 0; r < col.length; r++) {
                    const w = col[r];
                    if (!w) continue;
                    const v = w.value;
                    if (v == null || ('' + v).charAt(0) !== '=') continue;
                    const now = rewrite('' + v);
                    if (now !== ('' + v)) {
                        try { if (typeof w.setValue === 'function') w.setValue(now); else w.value = now; } catch (e) { }
                        out.cells++;
                    }
                }
            }
        }
        for (const k of Object.keys((pt && pt.formulas) || {})) {
            const was = pt.formulas[k];
            const now = rewrite(was);
            if (now !== was) pt.formulas[k] = now;
        }
    } catch (e) { /* counted below as far as it got */ }

    // --- 1. where a formula lives ----------------------------------------------------
    const rowsOfKey = (k) => {
        const m = ('' + k).match(/\[(\d+)(?::(\d+))?\]\s*\[(\d+)(?::(\d+))?\]\s*$/);
        if (!m) return null;
        return { r0: +m[3], r1: (m[4] == null ? +m[3] : +m[4]), m: m };
    };
    const shiftKey = (k) => {
        const m = ('' + k).match(/^(.*)\[(\d+)(?::(\d+))?\]\s*\[(\d+)(?::(\d+))?\]\s*$/);
        if (!m) return null;
        const r0 = +m[4], r1 = (m[5] == null ? +m[4] : +m[5]);
        const cols = (m[3] == null) ? ('[' + m[2] + ']') : ('[' + m[2] + ':' + m[3] + ']');
        const rows = (m[5] == null) ? ('[' + (r0 + n) + ']') : ('[' + (r0 + n) + ':' + (r1 + n) + ']');
        return m[1] + cols + rows;
    };

    try {
        const target = tables.filter((t) => ('' + (t.name || '')) === name)[0] || null;
        if (target && target.formula) {
            // Bottom up: a key moving down onto one that has not moved yet would overwrite it.
            const keys = Object.keys(target.formula)
                .map((k) => ({ k: k, rows: rowsOfKey(k) }))
                .filter((x) => x.rows && x.rows.r0 >= at)
                .sort((a, b) => b.rows.r0 - a.rows.r0);
            for (const x of keys) {
                const nk = shiftKey(x.k);
                if (!nk || nk === x.k) continue;
                target.formula[nk] = target.formula[x.k];
                delete target.formula[x.k];
                out.keys++;
            }
        }
        if (pt && pt.formulas) {
            const keys = Object.keys(pt.formulas)
                .filter((k) => k.indexOf(name) === 0)
                .map((k) => ({ k: k, rows: rowsOfKey(k.slice(name.length)) }))
                .filter((x) => x.rows && x.rows.r0 >= at)
                .sort((a, b) => b.rows.r0 - a.rows.r0);
            for (const x of keys) {
                const nk = shiftKey(x.k);
                if (!nk || nk === x.k) continue;
                pt.formulas[nk] = pt.formulas[x.k];
                delete pt.formulas[x.k];
            }
        }
    } catch (e) { }

    return out;
}

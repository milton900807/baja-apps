function (pt, tableName, atRow, by, opts) {

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
    //
    // DELETING ROWS IS THE SAME MOVE BACKWARDS, with one thing insertion never has: a
    // formula pointing INTO the rows that are going. Nothing honest can be done with it --
    // the cell it names will not exist, and shifting it up makes it read its neighbour's
    // number, which is the silent wrong answer this whole module exists to avoid. Those are
    // called orphans, counted, and reported; with opts.plan the caller asks what WOULD
    // happen and nothing is touched, so it can refuse the delete before anything is lost.
    // Where a delete does go ahead, an orphan is left exactly as it is and its cell is
    // marked in error, which puts it in front of the diagnosis that offers a repair.

    const name = ('' + (tableName == null ? '' : tableName)).trim();
    const at = Math.floor(Number(atRow));
    const n = Math.floor(Number(by));
    const o = opts || {};
    const plan = !!o.plan;                       // work it out, change nothing
    const out = { keys: 0, refs: 0, cells: 0, orphans: 0, orphan_where: [] };
    if (!pt || !name || !isFinite(at) || !isFinite(n) || n === 0) return out;
    const gone = (n < 0) ? -n : 0;               // how many rows are being removed
    const lastGone = at + gone - 1;

    const tables = Array.isArray(pt.root) ? pt.root.filter((p) => p && Array.isArray(p.wells)) : [];

    // --- 2. what a formula points at -------------------------------------------------
    // Name[c]..[r] in either form, single or range, with the name matched exactly: a table
    // called Salary must not be touched by a shift in Salaries.
    const REF = new RegExp('(^|[^A-Za-z0-9_])(' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        + ')\\s*\\[(\\d+)(?::(\\d+))?\\]\\s*\\[(\\d+)(?::(\\d+))?\\]', 'g');
    const rewrite = (text, where) => {
        const s = '' + (text == null ? '' : text);
        if (!s || s.indexOf(name) < 0) return s;
        let touched = 0, orphaned = false;
        const next = s.replace(REF, (whole, pre, nm, c0, c1, r0, r1) => {
            const R0 = +r0, R1 = (r1 == null ? +r0 : +r1);
            let a = R0, b = R1;
            if (gone) {
                // REMOVING. Below the block moves up; a range across it shrinks by the part
                // of it that is going; anything wholly inside it has nowhere to point.
                if (R0 > lastGone) { a = R0 - gone; b = R1 - gone; }
                else if (R1 < at) { return whole; }                        // wholly above
                else if (R0 >= at && R1 <= lastGone) { orphaned = true; return whole; }
                else {
                    a = Math.min(R0, at);
                    b = Math.max(at - 1, R1 - gone);
                    if (b < a) { orphaned = true; return whole; }
                }
            } else if (R0 >= at) { a = R0 + n; b = R1 + n; }   // wholly below: it moves
            else if (R1 >= at) { b = R1 + n; }                 // spans it: it grows
            else return whole;                                  // wholly above: untouched
            touched++;
            const cols = (c1 == null) ? ('[' + c0 + ']') : ('[' + c0 + ':' + c1 + ']');
            const rows = (r1 == null) ? ('[' + a + ']') : ('[' + a + ':' + b + ']');
            return pre + nm + cols + rows;
        });
        if (orphaned) {
            out.orphans++;
            if (where && out.orphan_where.length < 12) out.orphan_where.push(where);
        }
        if (touched) out.refs += touched;
        return next;
    };

    try {
        for (const t of tables) {
            // the text held in the table's own map
            for (const k of Object.keys(t.formula || {})) {
                const was = t.formula[k];
                const now = rewrite(was, (t.name || '?') + ' ' + k);
                if (!plan && now !== was) t.formula[k] = now;
            }
            // and the text sitting in the cells, which is what is drawn and recalculated
            for (let c = 0; c < t.wells.length; c++) {
                const col = t.wells[c] || [];
                for (let r = 0; r < col.length; r++) {
                    const w = col[r];
                    if (!w) continue;
                    const v = w.value;
                    if (v == null || ('' + v).charAt(0) !== '=') continue;
                    const before = out.orphans;
                    const now = rewrite('' + v, (t.name || '?') + ' [' + c + '][' + r + ']');
                    if (!plan && out.orphans > before) {
                        // Left as it is and marked, so it goes red and the cell editor's
                        // diagnosis offers the repair rather than it reading as a number.
                        try { if (typeof w.setError === 'function') w.setError('points at a row that was removed'); } catch (e) { }
                    }
                    if (!plan && now !== ('' + v)) {
                        try { if (typeof w.setValue === 'function') w.setValue(now); else w.value = now; } catch (e) { }
                        out.cells++;
                    }
                }
            }
        }
        for (const k of Object.keys((pt && pt.formulas) || {})) {
            const was = pt.formulas[k];
            const now = rewrite(was, k);
            if (!plan && now !== was) pt.formulas[k] = now;
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

    // Which keys move, and which way to walk them. Inserting pushes keys DOWN, so the
    // bottom one goes first or it lands on a key not yet moved; removing pulls them UP, so
    // the top one goes first for the same reason. A key ON a removed row is dropped: the
    // cell it belongs to is gone with the row.
    const movers = (keyOf, holder, prefix) => {
        const list = Object.keys(holder)
            .filter((k) => !prefix || k.indexOf(prefix) === 0)
            .map((k) => ({ k: k, rows: rowsOfKey(prefix ? k.slice(prefix.length) : k) }))
            .filter((x) => x.rows && x.rows.r0 >= at);
        list.sort((a, b) => gone ? (a.rows.r0 - b.rows.r0) : (b.rows.r0 - a.rows.r0));
        for (const x of list) {
            if (gone && x.rows.r0 <= lastGone) { delete holder[x.k]; continue; }
            const nk = shiftKey(x.k);
            if (!nk || nk === x.k) continue;
            holder[nk] = holder[x.k];
            delete holder[x.k];
            out.keys++;
        }
    };

    try {
        if (!plan) {
            const target = tables.filter((t) => ('' + (t.name || '')) === name)[0] || null;
            if (target && target.formula) movers(rowsOfKey, target.formula, '');
            if (pt && pt.formulas) {
                const before = out.keys;
                movers(rowsOfKey, pt.formulas, name);
                out.keys = before;      // the same formulas, counted once
            }
        }
    } catch (e) { }

    return out;
}

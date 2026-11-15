function () {

    // READING AND WRITING A COLUMN, ONCE.
    //
    // Four operations now move cell contents about, and every one of them has to answer the
    // same four questions: which table, which column, what counts as an occupied cell, and
    // how do you write a column back without overwriting a cell you have not read yet. Four
    // answers to one question is how this codebase keeps finding bugs in itself, so there is
    // one answer here.
    //
    // A CELL IS ITS VALUE AND ITS FORMULA. Move the value and leave the formula and the
    // formula recomputes and puts the old value straight back, so the move looks as though it
    // never happened. A cell holding only a formula is occupied, not empty.

    const isFilled = (cell) => !!cell
        && ((cell.value != null && ('' + cell.value).trim() !== '')
            || (typeof cell.formula === 'string' && cell.formula.trim() !== ''));

    const readCells = (column) => (column || []).map((w) => ({
        value: w ? w.value : '',
        formula: (w && typeof w.formula === 'string') ? w.formula : null,
        filled: isFilled(w)
    }));

    const blank = () => ({ value: '', formula: null, filled: false });

    // WRITTEN FROM A COMPLETE LIST, NEVER CELL BY CELL FROM THE LIVE COLUMN. Writing in the
    // direction of travel overwrites the next cell before it has been read, which turns a
    // column of three values into the same value three times.
    const writeCells = (column, cells) => {
        let n = 0;
        for (let r = 0; r < column.length; r++) {
            const well = column[r];
            if (!well) continue;
            const want = cells[r] || blank();
            try {
                if (typeof well.setValue === 'function') well.setValue(want.value == null ? '' : want.value);
                else well.value = (want.value == null ? '' : want.value);
                if (want.formula != null) well.formula = want.formula;
                else if (typeof well.formula === 'string') well.formula = '';
                if (want.filled) n++;
            } catch (e) { }
        }
        return n;
    };

    // The table the request names, the selected one, or the only one there is. Beyond that
    // it is a guess, and acting on the wrong table is not something the user can see.
    const pickTable = (pt, named) => {
        if (!pt || !Array.isArray(pt.root)) return { error: 'there is no project open' };
        const tables = pt.root.filter((p) => p && Array.isArray(p.wells));
        const want = ('' + (named || '')).trim();
        if (want) {
            const t = (typeof pt.getTableByName === 'function') ? pt.getTableByName(want) : null;
            return t ? { table: t } : { error: 'there is no table called ' + want };
        }
        // THE TABLE WHOSE OWN ASK BUTTON WAS PRESSED comes before the selection. A request
        // made from a table's title bar is about that table, and "selected" is whatever was
        // last clicked, which is not the same thing and is not what the user pointed at.
        if (pt.__askedTable && tables.indexOf(pt.__askedTable) >= 0) return { table: pt.__askedTable };
        const t = pt.selectedPlate || (tables.length === 1 ? tables[0] : null);
        return t ? { table: t } : { error: 'say which table, or select it first' };
    };

    // A column is its number or its letter, the way the ruler above the table shows it:
    // 0 (A), 1 (B). Anything else is refused rather than guessed at, because guessing wrong
    // writes over cells that had something in them. Nothing named at all means the first.
    const pickColumn = (t, raw, what) => {
        const s = ('' + (raw == null ? '' : raw)).trim();
        let i = 0;
        if (s) {
            if (/^\d+$/.test(s)) {
                i = parseInt(s, 10);
            } else if (/^[A-Za-z]{1,2}$/.test(s)) {
                const up = s.toUpperCase();
                i = 0;
                for (let k = 0; k < up.length; k++) i = i * 26 + (up.charCodeAt(k) - 64);
                i -= 1;
            } else {
                return { error: 'which ' + (what || 'column') + '? Give its number (0 is the '
                    + 'first) or its letter' };
            }
        }
        if (!Array.isArray(t.wells) || !t.wells.length) return { error: t.name + ' has no cells' };
        if (i < 0 || i >= t.wells.length) {
            return { error: t.name + ' has ' + t.wells.length + ' column'
                + (t.wells.length === 1 ? '' : 's') + ', so there is no column ' + s };
        }
        return { index: i, cells: t.wells[i] || [] };
    };

    const finish = (pt, t, message) => {
        try { pt.updateCalculations(); } catch (e) { }
        try { if (pt.setSelected) pt.setSelected(t); } catch (e) { }
        try { if (message) pt.setMessage(message, 6); } catch (e) { }
    };

    // The names are deliberately not read/write/table/column: these modules all run in one
    // scope with lib/core.js, where `read` already exists, and lioncheck catches it.
    return { isFilled: isFilled, readCells: readCells, writeCells: writeCells, blank: blank,
        pickTable: pickTable, pickColumn: pickColumn, finish: finish };
}

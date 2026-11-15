function (pm, o) {

    // REARRANGE WHAT IS ALREADY IN A COLUMN.
    //
    // One operation rather than eight, because they are the same three steps every time:
    // read the column, produce a new list from it, write the list back. What differs is one
    // function in the middle, and splitting that into eight modules would be eight copies of
    // the reading and the writing waiting to drift apart.
    //
    // NOTHING GROWS THE TABLE AND NOTHING IS DROPPED. Every action here produces a list no
    // longer than the column, and where an action would push a value past the end it is
    // refused with what would be lost rather than silently truncated.

    return new Promise(async (resolve) => {
        try {
            const IO = await exec('baja/plate/ops/column-io.js');
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;

            const t = IO.pickTable(pt, o && o.table);
            if (t.error) { resolve({ error: t.error }); return; }
            const table = t.table;

            const c = IO.pickColumn(table, o && o.column);
            if (c.error) { resolve({ error: c.error }); return; }

            const cells = IO.readCells(c.cells);
            const n = cells.length;
            if (!n) { resolve({ error: 'that column has no cells' }); return; }

            const action = ('' + ((o && o.action) || '')).trim().toLowerCase();
            const filled = cells.filter((x) => x.filled);
            const text = (x) => ('' + (x.value == null ? '' : x.value)).trim();

            // A COLUMN OF NUMBERS SORTS AS NUMBERS. Sorting 2, 10, 9 as text gives 10, 2, 9,
            // which is right for words and wrong for every column anybody sorts. Numbers
            // first when they ALL parse; otherwise the whole column sorts as text, because a
            // mixed column sorted half one way and half the other is worse than either.
            const asNumber = (x) => {
                const s = text(x).replace(/[$,\s]/g, '');
                if (!s || !/^-?\d*\.?\d+(?:[eE][-+]?\d+)?%?$/.test(s)) return null;
                const v = parseFloat(s);
                return isFinite(v) ? v : null;
            };
            const allNumeric = filled.length > 0 && filled.every((x) => asNumber(x) !== null);
            const compare = (a, b) => {
                if (allNumeric) return asNumber(a) - asNumber(b);
                return text(a).toLowerCase().localeCompare(text(b).toLowerCase());
            };

            // Each action returns the new list, or a string explaining the refusal.
            const pad = (list) => {
                const out = list.slice(0, n);
                while (out.length < n) out.push(IO.blank());
                return out;
            };

            let next = null, note = '';
            if (action === 'reverse') {
                // THE VALUES REVERSE; THE CELLS THEY SIT IN DO NOT MOVE.
                //
                // This used to reverse the whole column, blanks and all. On a column of three
                // values in a table of forty rows that sends them to the BOTTOM of the table
                // and leaves thirty-seven blanks on top -- a flip of the column, not a
                // reversal of the list, and nobody asking to reverse an order means that.
                //
                // The occupied positions stay exactly as they are and the values are dealt
                // back into them in the opposite order, so a gap in the middle of a list
                // stays in the middle and the list still reads bottom-to-top.
                const spots = [];
                for (let r = 0; r < n; r++) if (cells[r].filled) spots.push(r);
                next = cells.map((x) => (x.filled ? IO.blank() : x));
                for (let k = 0; k < spots.length; k++) {
                    next[spots[k]] = cells[spots[spots.length - 1 - k]];
                }
                note = 'reversed';
            } else if (action === 'sort_asc' || action === 'sort_desc') {
                // The blanks go to the bottom either way: a sort that floats empty cells to
                // the top buries the data under the gaps.
                const sorted = filled.slice().sort(compare);
                if (action === 'sort_desc') sorted.reverse();
                next = pad(sorted);
                note = 'sorted ' + (action === 'sort_asc' ? 'A to Z' : 'Z to A')
                    + (allNumeric ? ' as numbers' : '');
            } else if (action === 'compact') {
                next = pad(filled.slice());
                note = 'closed ' + (n - filled.length) + ' gap' + ((n - filled.length) === 1 ? '' : 's');
            } else if (action === 'dedupe') {
                const seen = {};
                const kept = [];
                for (const x of filled) {
                    const key = text(x).toLowerCase();
                    if (seen[key]) continue;
                    seen[key] = true;
                    kept.push(x);
                }
                next = pad(kept);
                note = 'removed ' + (filled.length - kept.length) + ' repeat'
                    + ((filled.length - kept.length) === 1 ? '' : 's');
            } else if (action === 'fill_down') {
                // An empty cell takes the value above it. A FORMULA IS NOT COPIED DOWN: the
                // same formula in two cells is the same answer twice, which is almost never
                // what filling down is for, and copying it would silently duplicate a
                // calculation the user would have to find and undo.
                const out = [];
                let last = null;
                for (const x of cells) {
                    if (x.filled) { last = x; out.push(x); continue; }
                    out.push(last ? { value: last.value, formula: null, filled: true } : IO.blank());
                }
                next = out;
                note = 'filled down';
            } else if (action === 'clear') {
                next = cells.map(() => IO.blank());
                note = 'cleared ' + filled.length + ' cell' + (filled.length === 1 ? '' : 's');
            } else if (action === 'trim') {
                next = cells.map((x) => (x.filled
                    ? { value: text(x).replace(/\s+/g, ' '), formula: x.formula, filled: true }
                    : IO.blank()));
                note = 'tidied the spacing';
            } else {
                resolve({ error: 'that is not something this can do to a column' });
                return;
            }

            const changed = IO.writeCells(c.cells, next);
            IO.finish(pt, table, note.charAt(0).toUpperCase() + note.slice(1)
                + ' in ' + table.name);
            resolve({ table: table.name, column: c.index, action: action,
                filled: changed, note: note });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

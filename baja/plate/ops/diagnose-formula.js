function (pt, table, formula, cell) {

    // WHY A CELL IS RED, AND WHAT WOULD FIX IT.
    //
    // =Salaries[1][9] on a table whose last row is 8 draws red with an error badge and no
    // reason. The reason is knowable: the name exists or it does not, the column exists or
    // it does not, the row is inside the table or past the end of it. Each of those has one
    // obvious correction, and offering it is the difference between a cell somebody repairs
    // and a cell somebody deletes.
    //
    // IT ONLY EVER SUGGESTS. Nothing here writes to a cell: it answers with a sentence and,
    // where there is one, a formula to put in the box, which the user can read before
    // pressing anything. A formula silently rewritten is worse than a red cell, because a
    // red cell is at least asking to be looked at.
    //
    // A SUGGESTION IS A REAL REFERENCE OR IT IS NOT MADE. Every one offered is checked
    // against the table it names: the column is there, the row is there. "Did you mean row
    // 9?" about a table with eight rows would be the same bug wearing an apology.

    const out = { ok: true, why: '', suggest: '', about: '' };
    try {
        const f = ('' + (formula == null ? '' : formula)).trim();
        if (!f || f[0] !== '=') return out;

        const tables = (pt && Array.isArray(pt.root))
            ? pt.root.filter((p) => p && Array.isArray(p.wells)) : [];
        const byName = (n) => {
            const w = ('' + n).trim().toLowerCase();
            return tables.filter((t) => ('' + (t.name || '')).trim().toLowerCase() === w)[0] || null;
        };
        const extent = (t) => {
            const c = (t.wells && t.wells.length) || 0;
            return { cols: c, rows: (c && t.wells[0]) ? t.wells[0].length : 0 };
        };
        // How close two names are, for "did you mean". Cheap and good enough to tell
        // Salaries from Salary and from Suppliers.
        const near = (a, b) => {
            a = ('' + a).toLowerCase(); b = ('' + b).toLowerCase();
            if (a === b) return 0;
            if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 1;
            const m = [];
            for (let i = 0; i <= a.length; i++) m[i] = [i];
            for (let j = 0; j <= b.length; j++) m[0][j] = j;
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1,
                        m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
            }
            return m[a.length][b.length];
        };

        // Every Name[..][..] reference in the formula, with where it sits in the text.
        const refs = [];
        const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\[(\d+)(?::(\d+))?\]\s*\[(\d+)(?::(\d+))?\]/g;
        let m;
        while ((m = re.exec(f)) !== null) {
            refs.push({
                text: m[0], name: m[1], at: m.index,
                c0: +m[2], c1: (m[3] == null ? +m[2] : +m[3]),
                r0: +m[4], r1: (m[5] == null ? +m[4] : +m[5])
            });
        }
        if (!refs.length) return out;

        for (const r of refs) {
            const t = byName(r.name);
            if (!t) {
                // THE NAME. A table that is not there is the commonest cause, and the
                // commonest reason is that it was renamed or never made.
                const names = tables.map((x) => '' + (x.name || '')).filter((n) => n);
                let best = null, score = 99;
                for (const n of names) { const d = near(n, r.name); if (d < score) { score = d; best = n; } }
                out.ok = false;
                out.why = 'there is no table called "' + r.name + '"';
                if (best && score <= Math.max(2, Math.ceil(r.name.length / 3))) {
                    out.why += ', but there is one called "' + best + '"';
                    out.suggest = f.split(r.name + '[').join(best + '[');
                    out.about = 'point it at "' + best + '" instead';
                } else if (names.length) {
                    out.about = 'the tables here are ' + names.map((n) => '"' + n + '"').join(', ');
                }
                return out;
            }

            const e = extent(t);
            if (!e.cols || !e.rows) {
                out.ok = false;
                out.why = '"' + t.name + '" has no cells in it';
                return out;
            }

            // THE COLUMN, then THE ROW. Said one at a time: two corrections in one sentence
            // is a sentence nobody reads.
            if (r.c1 >= e.cols) {
                const last = e.cols - 1;
                out.ok = false;
                out.why = '"' + t.name + '" has ' + e.cols + ' column' + (e.cols === 1 ? '' : 's')
                    + ' (0 to ' + last + '), and this asks for column ' + r.c1;
                const fixed = r.text
                    .replace('[' + r.c0 + (r.c0 === r.c1 ? '' : ':' + r.c1) + ']',
                        '[' + Math.min(r.c0, last) + (r.c0 === r.c1 ? '' : ':' + last) + ']');
                out.suggest = f.split(r.text).join(fixed);
                out.about = 'use the last column instead';
                return out;
            }
            if (r.r1 >= e.rows) {
                const last = e.rows - 1;
                out.ok = false;
                out.why = '"' + t.name + '" has ' + e.rows + ' row' + (e.rows === 1 ? '' : 's')
                    + ' (0 to ' + last + '), and this asks for row ' + r.r1;
                const fixed = r.text
                    .replace('[' + r.r0 + (r.r0 === r.r1 ? '' : ':' + r.r1) + ']',
                        '[' + Math.min(r.r0, last) + (r.r0 === r.r1 ? '' : ':' + last) + ']');
                out.suggest = f.split(r.text).join(fixed);
                out.about = (r.r0 === r.r1) ? 'use row ' + last + ', the last one'
                    : 'stop the range at row ' + last;
                return out;
            }

            // In range, but pointing at nothing. A reference to an empty cell is not an
            // error to the engine and is almost always a mistake to the person: the row
            // below the last one with anything in it is the usual off-by-one.
            if (r.r0 === r.r1 && r.c0 === r.c1) {
                const w = t.wells[r.c0] && t.wells[r.c0][r.r0];
                const empty = !w || w.value == null || ('' + w.value).trim() === '';
                if (empty) {
                    let lastFilled = -1;
                    for (let i = 0; i < e.rows; i++) {
                        const x = t.wells[r.c0][i];
                        if (x && x.value != null && ('' + x.value).trim() !== '') lastFilled = i;
                    }
                    out.ok = false;
                    out.why = '"' + t.name + '" row ' + r.r0 + ' is empty';
                    if (lastFilled >= 0) {
                        const fixed = r.text.replace('[' + r.r0 + ']', '[' + lastFilled + ']');
                        out.suggest = f.split(r.text).join(fixed);
                        out.about = 'the last row with anything in that column is ' + lastFilled;
                    }
                    return out;
                }
            }
        }
        return out;
    } catch (e) {
        return { ok: true, why: '', suggest: '', about: '' };
    }
}

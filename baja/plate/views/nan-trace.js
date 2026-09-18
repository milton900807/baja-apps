function (pt, plate, well) {

    // WHY IS THIS CELL NOT A NUMBER — and where did it start?
    //
    //   await exec('baja/plate/views/nan-trace.js', pt, plate, well)
    //
    // A formula that reads one empty or non-numeric cell answers NaN, and so does every
    // formula that reads THAT one: a model built on a missing assumption shows a column of
    // NaN and none of them is the cause. This follows the references from the cell you
    // clicked back to the cell that actually broke, and lists the chain with the root first.
    // Every step is clickable: it selects that cell and zooms the canvas onto its table.
    //
    // It reads the same references the calculation engine does:
    //   Table[Label]          the row named Label; its value is column 1, as the engine reads it
    //   Table[c:c][r:r]       one cell, or a range, by index
    //   Table[c][r]           one cell by index
    return (async () => {
        const MAX_DEPTH = 12;
        const esc = (v) => ('' + (v == null ? '' : v));
        const textOf = (pl, w) => { try { return pl.formulaTextForWell ? pl.formulaTextForWell(w) : null; } catch (e) { return null; } };
        const numOf = (v) => {
            if (typeof v === 'number') return v;
            const s = ('' + (v == null ? '' : v)).replace(/[$,\s]/g, '');
            if (s === '') return NaN;
            return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? +s : NaN;
        };
        // What a cell contributes to a formula that reads it.
        const classify = (w) => {
            if (!w) return 'missing';
            const raw = w.value;
            const s = ('' + (raw == null ? '' : raw)).trim();
            if (s === '') return 'empty';
            if (/^(nan|-?infinity|inf)$/i.test(s)) return 'nan';
            const n = numOf(raw);
            if (isNaN(n)) return 'text';
            if (!isFinite(n)) return 'nan';
            return 'number';
        };
        const WHY = {
            missing: 'that row or cell does not exist',
            empty: 'that cell is empty',
            text: 'that cell holds text, not a number',
            nan: 'that cell is itself not a number',
        };
        // Where a cell sits, in words.
        const whereOf = (pl, w) => {
            try {
                for (let c = 0; c < pl.wells.length; c++) {
                    const r = (pl.wells[c] || []).indexOf(w);
                    if (r < 0) continue;
                    const head = (pl.wells[c][0] && pl.wells[c][0].value != null) ? ('' + pl.wells[c][0].value) : ('column ' + c);
                    const lab = (pl.wells[0] && pl.wells[0][r] && pl.wells[0][r].value != null) ? ('' + pl.wells[0][r].value) : ('row ' + r);
                    return { col: c, row: r, text: pl.name + ' · ' + (c === 0 ? lab : head + ' · ' + lab) };
                }
            } catch (e) { }
            return { col: -1, row: -1, text: pl.name };
        };

        // ---- references of one formula -------------------------------------------------
        const refsOf = (formula) => {
            const f = ('' + (formula || '')).replace(/^=/, '');
            const out = [];
            const seen = new Set();
            const add = (o) => { const k = o.text; if (!seen.has(k)) { seen.add(k); out.push(o); } };
            const rangeG = /([A-Za-z_]\w*)\[(\d+)(?::(\d+))?\]\[(\d+)(?::(\d+))?\]/g;
            let m;
            const masked = f.replace(rangeG, (full, t, c0, c1, r0, r1) => {
                add({ text: full, table: t, c0: +c0, c1: +(c1 == null ? c0 : c1), r0: +r0, r1: +(r1 == null ? r0 : r1) });
                return ' '.repeat(full.length);
            });
            const namedG = /([A-Za-z_]\w*)\[((?:"[^"\n\r]*")|(?:[^\[\]]+))\]/g;
            while ((m = namedG.exec(masked))) {
                const rawLabel = m[2];
                if (/^\d+(:\d+)?$/.test(rawLabel)) continue;                  // an index, handled above
                const label = (rawLabel.startsWith('"') && rawLabel.endsWith('"')) ? rawLabel.slice(1, -1) : rawLabel;
                add({ text: m[0], table: m[1], label: label });
            }
            return out;
        };
        // The cells a reference points at, and what is wrong with them.
        const resolve = (ref) => {
            const pl = pt.getTableByName ? pt.getTableByName(ref.table) : null;
            if (!pl || !pl.wells) return { ref, plate: null, cells: [], state: 'missing', note: 'there is no table called ' + ref.table };
            if (ref.label != null) {
                const col0 = pl.wells[0] || [];
                for (let r = 1; r < col0.length; r++) {
                    if (col0[r] && ('' + col0[r].value).trim() === ref.label) {
                        const w = pl.wells[1] && pl.wells[1][r];
                        return { ref, plate: pl, cells: w ? [w] : [], state: classify(w), note: null, row: r };
                    }
                }
                return { ref, plate: pl, cells: [], state: 'missing', note: pl.name + ' has no row called ' + ref.label };
            }
            const cells = [];
            for (let c = ref.c0; c <= ref.c1; c++) for (let r = ref.r0; r <= ref.r1; r++) {
                const w = pl.wells[c] && pl.wells[c][r];
                if (w) cells.push(w);
            }
            if (!cells.length) return { ref, plate: pl, cells: [], state: 'missing', note: pl.name + ' has no cell at that index' };
            const bad = cells.find((w) => classify(w) !== 'number');
            return { ref, plate: pl, cells: cells, state: bad ? classify(bad) : 'number', bad: bad || null };
        };

        // ---- follow the chain ----------------------------------------------------------
        // Each step: the cell, its formula, the reference that broke it, and where that led.
        const chain = [];
        const visited = new Set();
        let curPlate = plate, curWell = well, depth = 0, root = null;
        while (curWell && depth < MAX_DEPTH) {
            if (visited.has(curWell)) { root = { plate: curPlate, well: curWell, reason: 'circular', formula: textOf(curPlate, curWell) }; break; }
            visited.add(curWell);
            const f = textOf(curPlate, curWell);
            const step = { plate: curPlate, well: curWell, formula: f, where: whereOf(curPlate, curWell), state: classify(curWell) };
            chain.push(step);
            if (!f) { root = { plate: curPlate, well: curWell, reason: step.state, formula: null }; break; }
            const results = refsOf(f).map(resolve);
            const culprits = results.filter((r) => r.state !== 'number');
            step.refs = results;
            step.culprits = culprits;
            if (!culprits.length) {
                // Every reference is a number: the arithmetic itself produced it (a division
                // by zero, or a value the engine could not parse).
                root = { plate: curPlate, well: curWell, reason: 'arithmetic', formula: f };
                break;
            }
            const first = culprits[0];
            step.followed = first;
            if (!first.plate || !first.cells.length) { root = { plate: first.plate, well: null, reason: first.state, note: first.note, ref: first.ref }; break; }
            const next = first.bad || first.cells[0];
            curPlate = first.plate; curWell = next; depth++;
        }
        if (!root && curWell) root = { plate: curPlate, well: curWell, reason: classify(curWell), formula: textOf(curPlate, curWell) };

        // ---- the shelf -----------------------------------------------------------------
        const jump = (pl, w, note) => async () => { try { await pt.jumpToCell(pl, w, note); } catch (e) { console.warn('jump', e); } };
        const books = [];
        const head = chain[0];
        const headWhere = head ? head.where.text : (plate ? plate.name : '');
        books.push({ section: 'The cell', note: true, title: headWhere + (head && head.formula ? '  =  ' + esc(head.formula).replace(/^=/, '') : '') });

        // The cause, in one line, with the jump that matters most.
        if (root) {
            if (root.reason === 'arithmetic') {
                books.push({ section: 'Why', note: true, title: 'Every value this formula reads is a number, so the result comes from the arithmetic itself: '
                    + 'most often a division by zero, or a unit written into the formula as text.' });
            } else if (!root.well) {
                books.push({ section: 'Why', note: true, title: 'It reads ' + esc(root.ref ? root.ref.text : 'a reference') + ', and ' + esc(root.note || WHY[root.reason] || 'that cannot be read') + '.' });
                if (root.plate) books.push({ section: 'Jump to', title: 'Open ' + root.plate.name, badge: 'table', icon: 'table_chart', ready: true,
                    blurb: 'The table the missing row or cell belongs to.', open: jump(root.plate, null, 'The reference points into ' + root.plate.name) });
            } else if (root.reason === 'circular') {
                books.push({ section: 'Why', note: true, title: 'The references come back to a cell already in this chain, so nothing in it can ever resolve.' });
                books.push({ section: 'Jump to', title: whereOf(root.plate, root.well).text, badge: 'circular', icon: 'loop', ready: true,
                    blurb: 'Where the chain closes on itself.', open: jump(root.plate, root.well, 'The chain closes here') });
            } else {
                const rw = whereOf(root.plate, root.well);
                books.push({ section: 'Why', note: true, title: 'It began at ' + rw.text + ': ' + (WHY[root.reason] || 'that cell cannot be read') + '.'
                    + (chain.length > 1 ? ' Everything after it is NaN because of that, not on its own.' : '') });
                books.push({ section: 'Jump to', title: rw.text, badge: 'the cause', icon: 'my_location', ready: true,
                    blurb: root.reason === 'empty' ? 'Put a number in this cell and the chain recomputes.'
                        : (root.reason === 'text' ? 'This cell holds text where a number is needed.' : 'Start here.'),
                    open: jump(root.plate, root.well, 'The cause: ' + (WHY[root.reason] || 'not a number')) });
            }
        }

        // The chain itself, nearest first, each step clickable.
        if (chain.length > 1 || (chain.length === 1 && chain[0].culprits && chain[0].culprits.length)) {
            chain.forEach((st, i) => {
                const fol = st.followed;
                books.push({
                    section: 'The chain', title: (i === 0 ? 'This cell: ' : 'then ') + st.where.text,
                    badge: i === 0 ? 'clicked' : ('step ' + (i + 1)), icon: 'arrow_downward', ready: true,
                    blurb: (st.formula ? esc(st.formula).replace(/^=/, '') : 'no formula')
                        + (fol ? '  —  reads ' + esc(fol.ref.text) + ', which ' + (WHY[fol.state] || 'cannot be read') : ''),
                    open: jump(st.plate, st.well, 'Step ' + (i + 1) + ' of the chain')
                });
            });
        }

        // Everything the clicked cell reads, so a second missing input is visible too.
        if (head && head.refs && head.refs.length) {
            head.refs.forEach((r) => {
                const ok = r.state === 'number';
                const target = r.bad || r.cells[0] || null;
                books.push({
                    section: 'What this cell reads', title: esc(r.ref.text),
                    badge: ok ? 'number' : r.state, icon: ok ? 'check' : 'error_outline', ready: true,
                    blurb: ok ? ('reads ' + esc(target ? target.value : '')) : esc(r.note || WHY[r.state] || 'cannot be read'),
                    open: (r.plate && (target || !r.cells.length)) ? jump(r.plate, target, esc(r.ref.text)) : undefined
                });
            });
        }

        await exec('baja/lib/shelf.js', {
            id: 'baja-nan-trace',
            title: 'Where the NaN comes from',
            subtitle: head ? (headWhere + ' is not a number. ' + (chain.length > 1 ? chain.length + ' formulas are in the chain; the cause is at the bottom of it.' : 'Its cause is below.')) : 'Nothing to trace.',
            books: books
        });
        return { chain: chain.length, root: root ? (root.reason || '') : '' };
    })();
}

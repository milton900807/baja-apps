function (pm, o) {

    // ARITHMETIC ON THE CELLS THAT ARE SELECTED.
    //
    // "Increase these values by 10%", with eight salaries selected, had nothing behind it:
    // the only way was to retype eight numbers. Changing numbers that are already there is
    // what a selection is FOR, and it is the one kind of request where the cells say which
    // ones without anybody naming them.
    //
    // A FORMULA CELL IS LEFT ALONE. Writing a number over a formula lasts until the next
    // recalculation and then the old value comes back, so the change would appear to have
    // worked and then undo itself. Those cells are skipped and counted, and the count is
    // reported: a silent skip is indistinguishable from a cell that was missed.
    //
    // TEXT IS LEFT ALONE TOO, which is what makes "increase these" safe to type with a whole
    // column selected: the headings and the names in it are not numbers and are not touched.
    //
    // WHAT IS READ IS THE NUMBER, NOT THE DRAWING OF IT. A cell tagged as money holds 95000
    // and is drawn as $95,000.00; the currency symbol and the separators are stripped before
    // the arithmetic and never written back, so the cell stays a number a formula can add.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const IO = await exec('baja/plate/ops/column-io.js');
            const picked = IO.pickTable(pt, o && o.table);
            if (picked.error) { resolve({ error: picked.error }); return; }
            const table = picked.table;

            let cells = [];
            try {
                if (typeof table.getSelectedWellsInOrder === 'function') cells = table.getSelectedWellsInOrder() || [];
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'select the cells first, then say what to do with them' });
                return;
            }

            const num = (v) => {
                if (v == null || v === '') return 0;
                const n = Number(v);
                return isFinite(n) ? n : NaN;
            };
            const pct = num(o && o.by_percent);
            const add = num(o && o.add);
            const times = num(o && o.multiply_by);
            const setTo = (o && o.set_to != null && ('' + o.set_to).trim() !== '')
                ? num(o.set_to) : null;
            if (isNaN(pct) || isNaN(add) || isNaN(times) || (setTo != null && isNaN(setTo))) {
                resolve({ error: 'by how much, as a number?' });
                return;
            }
            if (!pct && !add && !times && setTo == null) {
                resolve({ error: 'increase, decrease, multiply or set them to what?' });
                return;
            }

            const ROUND = { none: null, whole: 1, cents: 0.01, ten: 10, hundred: 100, thousand: 1000 };
            const rk = ('' + ((o && o.round) || 'none')).trim().toLowerCase();
            if (!(rk in ROUND)) { resolve({ error: 'round to what: whole, cents, ten, hundred, thousand?' }); return; }
            const step = ROUND[rk];

            const isFormula = (w) => !!w && typeof w.formula === 'string' && w.formula.trim() !== '';
            const reads = (w) => {
                if (!w) return NaN;
                const raw = w.value;
                if (raw == null || ('' + raw).trim() === '') return NaN;
                // $95,000.00 and 95 000 and 1,200 are all the same number to a person.
                const s = ('' + raw).replace(/[$£€,\s]/g, '');
                if (!/^-?\d*\.?\d+%?$/.test(s)) return NaN;
                const asPct = s.endsWith('%');
                const n = Number(asPct ? s.slice(0, -1) : s);
                return isFinite(n) ? n : NaN;
            };

            let changed = 0, skippedText = 0, skippedFormula = 0;
            const before = [], after = [];
            for (const w of cells) {
                if (!w) continue;
                if (isFormula(w)) { skippedFormula++; continue; }
                const n = reads(w);
                if (isNaN(n)) { skippedText++; continue; }

                let v = n;
                if (setTo != null) v = setTo;
                if (times) v = v * times;
                if (pct) v = v * (1 + pct / 100);
                if (add) v = v + add;
                if (step) v = Math.round(v / step) * step;
                // 54998.900000000001 is what a tenth of a salary looks like in binary; a cell
                // is not the place to show that.
                if (!step) v = Math.round(v * 1e6) / 1e6;

                try {
                    if (before.length < 3) { before.push(n); after.push(v); }
                    if (typeof w.setValue === 'function') w.setValue(v); else w.value = v;
                    changed++;
                } catch (e) { }
            }

            if (!changed) {
                resolve({ error: skippedFormula
                    ? ('every selected cell holds a formula, and writing a number over one '
                        + 'would be undone by the next recalculation')
                    : 'none of the selected cells hold a number' });
                return;
            }

            try { if (pt.__collab && !pt.__collab.holds(table)) pt.__collab.acquire(table); } catch (e) { }
            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            const how = setTo != null ? ('set to ' + setTo)
                : (pct ? ((pct > 0 ? 'up ' : 'down ') + Math.abs(pct) + '%') : '')
                    + (times ? ((pct ? ', ' : '') + 'times ' + times) : '')
                    + (add ? ((pct || times ? ', ' : '') + (add > 0 ? 'plus ' : 'minus ') + Math.abs(add)) : '');
            const sample = before.length
                ? ('  e.g. ' + before.map((b, i) => b + ' → ' + after[i]).join(', ')) : '';
            try {
                pt.setMessage(changed + ' cell' + (changed === 1 ? '' : 's') + ' ' + how + sample
                    + (skippedFormula ? ('. ' + skippedFormula + ' left alone: '
                        + (skippedFormula === 1 ? 'it holds' : 'they hold') + ' a formula') : '')
                    + (skippedText ? ('. ' + skippedText + ' left alone: not '
                        + (skippedText === 1 ? 'a number' : 'numbers')) : ''), 9);
            } catch (e) { }

            resolve({ table: table.name, changed: changed,
                skipped_formula: skippedFormula || undefined,
                skipped_text: skippedText || undefined });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

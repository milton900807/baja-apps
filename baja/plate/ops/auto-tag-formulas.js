function (pt) {

    // AT EACH CALCULATION: A FORMULA THAT CAN READ BY TAG, DOES.
    //   const h = await exec('baja/plate/ops/auto-tag-formulas.js', track);  h.schedule();
    //
    // Converting addresses to tags (formulas-to-tags.js) was a menu item, which means it
    // happened when somebody remembered it. A formula written by the table generator, pasted
    // in, or typed by hand comes with addresses, and stays wrong-in-waiting until then. So
    // the track asks for this every time it recalculates: any formula that still names a
    // cell by its position, where tags would pick out the same cell, is rewritten.
    //
    // IT IS THE SAME OPERATION, WITH THE SAME TWO CHECKS. Nothing is decided here about
    // what can be converted: this finds the formulas that still hold an address and hands
    // them to formulas-to-tags.js, which rewrites a reference only when the tags pick out
    // exactly the same cells and keeps a formula only when the engine gives the same answer.
    //
    // EACH FORMULA IS LOOKED AT ONCE. A recalculation happens on every edit, and most
    // formulas with an address in them have one because no tag fits. So what has been tried
    // is remembered (table, cell, formula text, and how many cells are tagged), and it is
    // tried again only when the formula or the tagging has changed.
    //
    // UNDO STAYS UNDONE. The formula a conversion replaced is remembered as tried too. If
    // it comes back, by undo or by being typed again, it is left as the person put it: a
    // change that reapplies itself every time it is undone is not one that can be refused.
    //
    // It runs a moment after the calculation that asked for it, never inside it, and never
    // twice at once. Set track.attr__autoTagFormulas = false to turn it off.

    const WAIT = 700, MAX_SEEN = 20000;
    const ADDRESS = /[A-Za-z_]\w*\[\d*:?\d*\]\[\d*:?\d*\]/;
    let timer = null, running = false, again = false;
    if (!pt.__autoTagSeen) pt.__autoTagSeen = new Set();
    const seen = pt.__autoTagSeen;

    const tables = () => (Array.isArray(pt.root) ? pt.root : []).filter((p) => p && Array.isArray(p.wells) && p.name);
    const formulaOf = (t, w) => {
        let f = '';
        try { if (typeof t.formulaTextForWell === 'function') f = t.formulaTextForWell(w) || ''; } catch (e) { f = ''; }
        if (!f && w && typeof w.formula === 'string') f = w.formula;
        if (!f && w && typeof w.value === 'string' && w.value.trim().charAt(0) === '=') f = w.value;
        f = ('' + (f || '')).trim();
        return f ? (f.charAt(0) === '=' ? f : ('=' + f)) : '';
    };
    // How much is tagged. A tag added to a row is what makes yesterday's unconvertible
    // formula convertible today, so it is part of what "already tried" means.
    const tagging = () => {
        let n = 0;
        for (const t of tables()) for (const col of t.wells) for (const w of (col || [])) {
            if (w && w.group && typeof w.group === 'object') n += 1 + Object.keys(w.group).length;
        }
        return n;
    };
    const keyOf = (t, c, r, f, sig) => t.name + '|' + c + ':' + r + '|' + sig + '|' + f;

    const run = async () => {
        if (running) { again = true; return null; }
        if (pt.attr__autoTagFormulas === false) return null;
        running = true;
        let converted = 0, example = '', where = [];
        try {
            const sig = tagging();
            if (!sig) return { converted: 0 };
            for (const t of tables()) {
                const todo = [], marks = [];
                const hasMap = t.formula && typeof t.formula === 'object' && Object.keys(t.formula).length > 0;
                for (let c = 0; c < t.wells.length; c++) {
                    const col = t.wells[c] || [];
                    for (let r = 0; r < col.length; r++) {
                        const w = col[r];
                        if (!w) continue;
                        // Cheap first: a cell with no formula of its own in a table with no
                        // formula map cannot hold one.
                        if (!hasMap && typeof w.formula !== 'string' && !(typeof w.value === 'string' && w.value.charAt(0) === '=')) continue;
                        const f = formulaOf(t, w);
                        if (!f || !ADDRESS.test(f)) continue;
                        const k = keyOf(t, c, r, f, sig);
                        if (seen.has(k)) continue;
                        todo.push(w); marks.push({ c: c, r: r, w: w, k: k });
                    }
                }
                if (!todo.length) continue;
                let out = null;
                try { out = await exec('baja/plate/ops/formulas-to-tags.js', pt, { plate: t, cells: todo, auto: true }); }
                catch (e) { out = null; }
                if (seen.size > MAX_SEEN) seen.clear();
                for (const m of marks) {
                    seen.add(m.k);                                    // what it was: tried
                    const now = formulaOf(t, m.w);
                    if (now) seen.add(keyOf(t, m.c, m.r, now, sig));   // what it is now: done
                }
                if (out && out.converted) {
                    converted += out.converted;
                    if (!example) example = out.example || '';
                    where.push(t.name);
                }
            }
            if (converted) {
                try {
                    pt.setMessage(converted + ' formula' + (converted === 1 ? '' : 's') + ' in ' + where.join(', ')
                        + (converted === 1 ? ' now reads' : ' now read') + ' by tag instead of by address'
                        + (example ? (', for example ' + example.slice(0, 70)) : '') + '. Undo puts '
                        + (converted === 1 ? 'it' : 'them') + ' back, and ' + (converted === 1 ? 'it stays' : 'they stay') + ' back', 9);
                } catch (e) { }
                try { if (pt.wake) pt.wake(); } catch (e) { }
            }
            return { converted: converted, tables: where };
        } catch (e) {
            return { converted: 0, error: ('' + (e && e.message ? e.message : e)) };
        } finally {
            running = false;
            if (again) { again = false; schedule(); }
        }
    };

    const schedule = () => {
        if (pt.attr__autoTagFormulas === false) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; run(); }, WAIT);
    };

    return { schedule: schedule, run: run };
}

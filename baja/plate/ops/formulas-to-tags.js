function (pm, o) {

    // FORMULAS THAT NAME WHAT THEY READ, NOT WHERE IT IS.
    //   exec('baja/plate/ops/formulas-to-tags.js', pm, { table: 'flight_cost' })
    //   exec('baja/plate/ops/formulas-to-tags.js', pm, { plate: thisTable })       // from its menu
    //
    //   =assumptions[1:1][65:65]+assumptions[1:1][66:66]+ ... +assumptions[1:1][74:74]
    //
    // is ten addresses. It says nothing about what is being added up, and it is wrong the
    // day a row is inserted above row 65. The formula language has had a second way to say
    // the same thing all along: assumptions[Fuel,Value] is "the cell tagged Fuel and Value",
    // wherever it has moved to. This rewrites a table's formulas from the first form to the
    // second.
    //
    // A REFERENCE IS ONLY REWRITTEN WHEN THE TAGS PICK OUT EXACTLY THE SAME CELLS. For each
    // address it looks for one tag, or two together, carried by those cells and by no other
    // cell in that table. If there is none (the cells are untagged, or two rows share a
    // label) the address stays as it is. A run of single cells added together becomes one
    // sum(...) when a tag covers exactly that run; otherwise each cell is named on its own.
    //
    // AND THE REWRITTEN FORMULA HAS TO WORK OUT TO THE SAME THING. Before a formula is
    // replaced, the old one and the new one are both run through the engine, and the new one
    // is kept only if the answers are the same. The rule above is this file's reading of
    // how the engine matches tags; this is the engine's own.
    //
    // WHICH FORMULAS: the selected cells that hold one, and if none of them does, every
    // formula in the table. One undo puts them all back.
    //
    // The track also runs this by itself after each calculation (auto-tag-formulas.js),
    // with `cells` naming the formulas to look at and `auto` set: then it says nothing and
    // recalculates nothing, since the caller does the first and the second is what called it.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            let t = (o && o.plate && Array.isArray(o.plate.wells)) ? o.plate : null;
            if (!t) {
                const IO = await exec('baja/plate/ops/column-io.js');
                const picked = IO.pickTable(pt, o && o.table);
                if (picked.error) { resolve({ error: picked.error }); return; }
                t = picked.table;
            }
            const tables = (Array.isArray(pt.root) ? pt.root : []).filter((p) => p && Array.isArray(p.wells) && p.name);
            const byName = (n) => tables.filter((x) => ('' + x.name) === n)[0] || null;
            const names = tables.map((x) => '' + x.name).filter((n) => /^[A-Za-z_]\w*$/.test(n)).sort((a, b) => b.length - a.length);

            // ---- the formulas ---------------------------------------------------------------
            const formulaOf = (w) => {
                let f = '';
                try { if (typeof t.formulaTextForWell === 'function') f = t.formulaTextForWell(w) || ''; } catch (e) { f = ''; }
                if (!f && w && typeof w.formula === 'string') f = w.formula;
                if (!f && w && typeof w.value === 'string' && w.value.trim().charAt(0) === '=') f = w.value;
                f = ('' + (f || '')).trim();
                if (!f) return '';
                return f.charAt(0) === '=' ? f : ('=' + f);
            };
            const everyCell = [];
            for (let c = 0; c < t.wells.length; c++) for (const w of (t.wells[c] || [])) if (w) everyCell.push(w);
            let sel = [];
            try { if (typeof t.getSelectedWellsInOrder === 'function') sel = t.getSelectedWellsInOrder() || []; } catch (e) { sel = []; }
            const auto = !!(o && o.auto);
            let scope = sel.filter((w) => formulaOf(w));
            let whole = !scope.length;
            if (whole) scope = everyCell.filter((w) => formulaOf(w));
            if (o && Array.isArray(o.cells)) { scope = o.cells.filter((w) => everyCell.indexOf(w) >= 0 && formulaOf(w)); whole = false; }
            if (!scope.length) { resolve(auto ? { table: t.name, converted: 0 } : { error: 'there are no formulas in ' + t.name + ' to convert' }); return; }

            // ---- tags, read the way the engine reads them -------------------------------------
            // A tag is a key of a cell's group. In a reference with two tags the engine takes
            // one beginning "row" or "col" for a position, and a number for a column, so those
            // cannot be written there. Words the reference grammar splits on cannot be either.
            const tagsOf = (w) => (w && w.group && typeof w.group === 'object') ? Object.keys(w.group) : [];
            const writable = (g) => /^[A-Za-z_]\w*$/.test(g) && !/^(and|or|not)$/i.test(g);
            const pairable = (g) => writable(g) && !/^(row|col)/.test(g);
            const cache = {};
            const cellsWith = (T, tags) => {
                const key = T.name + '\u0000' + tags.join('\u0000');
                if (cache[key]) return cache[key];
                const out = [];
                for (let c = 0; c < T.wells.length; c++) {
                    for (const w of (T.wells[c] || [])) {
                        if (!w || w.value == null || !w.group) continue;
                        if (tags.every((g) => Object.prototype.hasOwnProperty.call(w.group, g))) out.push(w);
                    }
                }
                return (cache[key] = out);
            };
            const same = (a, b) => a.length === b.length && a.every((w) => b.indexOf(w) >= 0);
            // One tag, else two, that pick out exactly these cells. The rarer tag goes first:
            // that is the row's label, and it is how these are written by hand.
            const tagsFor = (T, cells) => {
                if (!cells.length || cells.some((w) => !w || w.value == null || !w.group)) return null;
                const common = tagsOf(cells[0]).filter((g) => cells.every((w) => Object.prototype.hasOwnProperty.call(w.group, g)));
                for (const g of common.filter((x) => writable(x) && !/^\d+$/.test(x))) {
                    if (same(cellsWith(T, [g]), cells)) return [g];
                }
                const p = common.filter(pairable);
                for (let i = 0; i < p.length; i++) {
                    for (let j = i + 1; j < p.length; j++) {
                        if (!same(cellsWith(T, [p[i], p[j]]), cells)) continue;
                        const a = cellsWith(T, [p[i]]).length, b = cellsWith(T, [p[j]]).length;
                        return a <= b ? [p[i], p[j]] : [p[j], p[i]];
                    }
                }
                return null;
            };

            // ---- references -------------------------------------------------------------------
            const refsIn = (body) => {
                const out = [];
                let i = 0;
                while (i < body.length) {
                    let hit = null;
                    for (const n of names) {
                        if (body.startsWith(n + '[', i) && !/[A-Za-z0-9_]/.test(i > 0 ? body.charAt(i - 1) : ' ')) { hit = n; break; }
                    }
                    if (!hit) { i++; continue; }
                    const m = /^\[(\d*)(:?)(\d*)\]\[(\d*)(:?)(\d*)\]/.exec(body.slice(i + hit.length));
                    if (!m) { i += hit.length; continue; }
                    const T = byName(hit);
                    const cols = T.wells.length, rows = T.wells[0] ? T.wells[0].length : 0;
                    const lo = (v) => (v === '' ? 0 : parseInt(v, 10));
                    const c0 = lo(m[1]), c1 = m[2] ? (m[3] === '' ? cols - 1 : parseInt(m[3], 10)) : c0;
                    const r0 = lo(m[4]), r1 = m[5] ? (m[6] === '' ? rows - 1 : parseInt(m[6], 10)) : r0;
                    const cells = [];
                    let inside = c0 <= c1 && r0 <= r1 && c1 < cols && r1 < rows;
                    // An open end ("[3:]") grows with the table. A tag set is fixed to the cells
                    // that carry it today, so those are left as they are.
                    const open = (m[2] && m[3] === '') || (m[5] && m[6] === '') || m[1] === '' || m[4] === '';
                    if (inside) for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) cells.push(T.wells[c][r]);
                    out.push({ at: i, len: hit.length + m[0].length, text: body.substr(i, hit.length + m[0].length),
                        table: T, cells: cells, usable: inside && !open && cells.length > 0 });
                    i += hit.length + m[0].length;
                }
                return out;
            };
            const write = (T, tags) => T.name + '[' + tags.join(',') + ']';

            const convert = (formula) => {
                const body = formula.slice(1);
                const refs = refsIn(body);
                if (!refs.length) return { formula: formula, changed: 0, kept: 0 };

                // A run of single cells joined by "+" and nothing else: one sum, if a tag
                // covers exactly the run.
                const usable = refs.filter((r) => r.usable);
                if (refs.length > 1 && usable.length === refs.length && refs.every((r) => r.cells.length === 1 && r.table === refs[0].table)) {
                    let rest = body, ok = true;
                    for (let k = refs.length - 1; k >= 0; k--) rest = rest.slice(0, refs[k].at) + '@' + rest.slice(refs[k].at + refs[k].len);
                    ok = /^\s*@(\s*\+\s*@)*\s*$/.test(rest);
                    const cells = refs.map((r) => r.cells[0]);
                    if (ok && cells.every((w, i) => cells.indexOf(w) === i)) {
                        const tags = tagsFor(refs[0].table, cells);
                        if (tags) return { formula: '=sum(' + write(refs[0].table, tags) + ')', changed: refs.length, kept: 0, summed: true };
                    }
                }

                let out = body, changed = 0, kept = 0;
                for (let k = refs.length - 1; k >= 0; k--) {
                    const r = refs[k];
                    const tags = r.usable ? tagsFor(r.table, r.cells) : null;
                    if (!tags) { kept++; continue; }
                    out = out.slice(0, r.at) + write(r.table, tags) + out.slice(r.at + r.len);
                    changed++;
                }
                return { formula: '=' + out, changed: changed, kept: kept };
            };

            // The engine's own answer for a formula, as text to compare; null if it has none.
            const worksOutTo = async (f) => {
                let r = null;
                try { r = await exec('baja/plate/ops/frun-object.js', f, pt); } catch (e) { return null; }
                if (!r || typeof r === 'string') return null;
                const res = Array.isArray(r.results) ? r.results : null;
                if (!res || !res.length || res[0] === null || res[0] === undefined) return null;
                // The answer, not its wrapping: an address gives the value with the cell's group
                // as an object, a tag gives it with the group as a list, and a sum gives a
                // bare number. Three shapes of the same 345000.
                const num = (x) => {
                    if (x && typeof x === 'object' && 'value' in x) x = x.value;
                    if (typeof x === 'string' && x.trim() !== '' && isFinite(Number(x))) x = Number(x);
                    return (typeof x === 'number') ? Math.round(x * 1e9) / 1e9 : x;
                };
                const vals = res.map(num);
                if (vals.some((v) => v === null || v === undefined || (typeof v === 'number' && isNaN(v)))) return null;
                try { return JSON.stringify(vals); } catch (e) { return null; }
            };

            let done = [], untagged = 0, differed = 0, noRefs = 0, example = null;
            let pushed = false;
            for (const cell of scope) {
                const before = formulaOf(cell);
                const c = convert(before);
                if (!c.changed) { if (c.kept) untagged++; else noRefs++; continue; }
                // Unasked, the trial is silent: a formula the engine cannot work out with tags
                // is simply left alone, and whatever the engine would have said about the
                // attempt is about a formula that was never written.
                let a = null, b = null;
                const had = Object.prototype.hasOwnProperty.call(pt, 'setMessage'), say = pt.setMessage;
                if (auto) { try { pt.setMessage = () => { }; } catch (e) { } }
                try { a = await worksOutTo(before); b = await worksOutTo(c.formula); }
                finally { if (auto) { try { if (had) pt.setMessage = say; else delete pt.setMessage; } catch (e) { } } }
                if (a === null || b === null || a !== b) { differed++; continue; }

                if (!pushed) { try { pushHistory(HM(t)); } catch (e) { } pushed = true; }
                // STORED WITHOUT ITS "=", WHICH IS HOW THE TABLE KEEPS A FORMULA. The field at
                // the top shows a stored formula with an "=" put in front; one stored with its
                // own came up as "==beer[...]".
                //
                // AND UNASKED, THE CELL KEEPS ITS VALUE. Writing the formula text into the
                // cell is how a formula is entered: the next calculation turns it into a
                // number. Run after a calculation, with no other to follow, that left the
                // cell showing "=beer[Basel_Wheat,Quantity]*..." where 1400 had been. The
                // value has not changed (that was the condition for converting), so only the
                // stored formula is replaced and the number stays where it is.
                const bare = c.formula.replace(/^(=\s*)+/, '');
                try {
                    const wr = t.getWellRange([cell]);
                    try { t.formula[wr] = bare; } catch (e) { }
                    try { pt.addFormula(t.name + '' + wr, bare); } catch (e) { }
                } catch (e) { }
                try {
                    if (typeof cell.formula === 'string' && cell.formula.trim()) cell.formula = (cell.formula.trim().charAt(0) === '=') ? c.formula : bare;
                } catch (e) { }
                if (!auto || (typeof cell.value === 'string' && cell.value.trim().charAt(0) === '=')) {
                    try { cell.setValue(c.formula); } catch (e) { }
                }
                done.push({ was: before, now: c.formula, references: c.changed, left: c.kept });
                if (!example) example = c.formula;
            }

            if (!done.length && auto) { resolve({ table: t.name, converted: 0, no_tags: untagged || undefined, different_value: differed || undefined }); return; }
            if (!done.length) {
                resolve({ error: 'no formula in ' + t.name + ' was changed: '
                    + (untagged ? (untagged + ' read cells that no tag picks out on their own (tag the rows and columns they read, then try again)') : '')
                    + (untagged && differed ? '; ' : '')
                    + (differed ? (differed + ' did not work out to the same value written with tags, so ' + (differed === 1 ? 'it was' : 'they were') + ' left alone') : '')
                    + (!untagged && !differed ? 'none of them reads a cell by its address' : '') });
                return;
            }

            // The values have not changed (that was the condition for writing), so when this
            // was called by a calculation there is nothing for another one to do.
            if (!auto) { try { pt.updateCalculations(); } catch (e) { } }
            try { if (pt.wake) pt.wake(); } catch (e) { }
            const partial = done.filter((d) => d.left).length;
            try {
                if (!auto) pt.setMessage(done.length + ' formula' + (done.length === 1 ? '' : 's') + ' in ' + t.name
                    + (done.length === 1 ? ' now reads' : ' now read') + ' by tag, for example ' + example.slice(0, 80)
                    + (partial ? ('. ' + partial + ' still ' + (partial === 1 ? 'has' : 'have') + ' an address no tag picks out') : '')
                    + (untagged ? ('. ' + untagged + ' could not be converted at all: no tag picks out the cells they read') : '')
                    + (differed ? ('. ' + differed + ' did not work out the same with tags and ' + (differed === 1 ? 'was' : 'were') + ' left alone') : '')
                    + '. Undo puts them back', 12);
            } catch (e) { }

            resolve({ table: t.name, converted: done.length, example: example, scope: whole ? 'every formula in the table' : 'the selected cells',
                partly: partial || undefined, no_tags: untagged || undefined, different_value: differed || undefined,
                changes: done.slice(0, 20) });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}

function (pt, formula, options) {

    // MISSING REFERENCES IN A FORMULA — repair them instead of failing.
    //   const r = await exec('baja/plate/ops/resolve-missing-references.js', pt, formula)
    //   r = { formula, changed, notes: [..], created: ["Table[Label]", ..] }
    //
    // A formula names Table[Row_Label] tokens. Any token whose table or label the plate track
    // does not have is resolved in order of cost:
    //   1. locally, with no model call: case and near-miss spelling of a table or label; a
    //      function name run into a table name (ABSPnL[Net_Income] -> ABS(PnL[Net_Income]));
    //      a label that exists in exactly one other table.
    //   2. with Claude (py/openai/resolve-reference.py) for what is left: it either rewrites the
    //      formula or defines the missing inputs, which are then created on the canvas through
    //      the same builder the AI models use (a row in an existing table, or a new
    //      Label/Value table), so the formula can calculate.
    // Results are cached per formula on the plate track so a recalculation does not ask again.
    return (async () => {
        // options.apply === false  -> PROPOSE only: nothing is created on the canvas; the rows
        // Claude would add come back in `tables` and every rewrite in `changes`, for the
        // caller to show the user and apply on approval (see plate-track.repairMissingReferences).
        const o = options || {};
        const applyNow = o.apply !== false;
        const original = (formula == null) ? '' : String(formula);
        const result = { formula: original, changed: false, notes: [], created: [], changes: [], tables: {} };
        if (!pt || !original.trim() || /^\s*function\b/.test(original)) return result;

        pt.__missingRefRepairs = pt.__missingRefRepairs || {};
        const cacheKey = (applyNow ? 'apply:' : 'propose:') + original;
        const cached = pt.__missingRefRepairs[cacheKey];
        if (cached && !o.force) return cached;

        // Rows proposed but not yet created are "virtual": they let the local matcher map a
        // token onto them so the proposal shown to the user is the final formula.
        const virtual = {};   // table -> Set(labels)

        // ---- what the model has --------------------------------------------------------
        const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const tableNames = (pt.getTableNames ? pt.getTableNames() : []).filter(Boolean);
        const labelsOf = (name) => {
            const t = pt.getTableByName ? pt.getTableByName(name) : null;
            const keys = new Set(virtual[name] ? Array.from(virtual[name]) : []);
            if (!t) return Array.from(keys);
            try {
                const g = pt.collectGroupKeysFromPlate ? pt.collectGroupKeysFromPlate(t) : null;
                if (g) for (const k of g) keys.add(k);
            } catch (e) { }
            try {
                const col0 = (t.wells && t.wells[0]) || [];
                for (let r = 1; r < col0.length; r++) {
                    const v = col0[r] && col0[r].value;
                    if (typeof v === 'string' && v.trim()) keys.add(v.trim());
                }
            } catch (e) { }
            keys.delete('RowHeader'); keys.delete('ColumnHeader');
            return Array.from(keys);
        };
        const findTable = (name) => {
            if (tableNames.includes(name)) return name;
            const n = norm(name);
            return tableNames.find(t => norm(t) === n) || null;
        };
        const lev = (a, b) => {
            a = norm(a); b = norm(b);
            if (a === b) return 0;
            const m = a.length, n = b.length;
            if (!m || !n) return Math.max(m, n);
            let prev = Array.from({ length: n + 1 }, (_, j) => j);
            for (let i = 1; i <= m; i++) {
                const cur = [i];
                for (let j = 1; j <= n; j++) {
                    cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
                prev = cur;
            }
            return prev[n];
        };
        const nearest = (name, candidates, maxDist) => {
            let best = null, bestD = Infinity;
            for (const c of candidates) {
                const d = lev(name, c);
                if (d < bestD) { bestD = d; best = c; }
            }
            return (best != null && bestD <= maxDist) ? best : null;
        };
        const findLabel = (table, key) => {
            const labels = labelsOf(table);
            if (labels.includes(key)) return key;
            const n = norm(key);
            const exact = labels.find(l => norm(l) === n);
            if (exact) return exact;
            return nearest(key, labels, key.length >= 6 ? 2 : 1);
        };
        const FUNCS = ['abs', 'sum', 'min', 'max', 'average', 'mean', 'sqrt', 'round', 'log', 'log10', 'ceil', 'floor', 'if', 'sumproduct', 'geomean', 'median', 'count'];

        // ---- the tokens ------------------------------------------------------------------
        const TOKEN = /\b([A-Za-z_]\w*)\[([^\]]+)\]/g;
        const isCellRange = (key) => /^\s*\d*\s*(:\s*\d*\s*)?$/.test(key) || /^\d+:\d+$/.test(key);
        const isMissing = (table, key) => !findTable(table) || !findLabel(findTable(table), key);

        let text = original;
        // kind: 'function' = a function name run into an existing table name (unambiguous,
        // safe to apply without asking); 'match' = a case/spelling/table correction.
        const rewrite = (from, to, note, kind) => {
            if (from === to) return;
            text = text.split(from).join(to);
            result.changed = true;
            result.notes.push(note);
            result.changes.push({ from: from, to: to, kind: kind || 'match' });
        };

        // ---- 1. local repairs ------------------------------------------------------------
        // Every token is canonicalised, not only the ones that fail outright: the evaluator
        // is case-sensitive, so pnl[net_income] must become PnL[Net_Income] to calculate.
        const localFix = (token, table, key) => {
            let fn = null;
            let t = findTable(table);
            if (!t) {
                // "ABSPnL" = a function name run into a table name.
                const lower = table.toLowerCase();
                const cand = FUNCS.filter(f => lower.startsWith(f) && lower.length > f.length)
                    .sort((a, b) => b.length - a.length)[0];
                if (cand) {
                    const rest = table.slice(cand.length);
                    const t2 = findTable(rest) || nearest(rest, tableNames, 1);
                    if (t2 && findLabel(t2, key)) { fn = cand.toUpperCase(); t = t2; }
                }
            }
            if (!t) t = nearest(table, tableNames, table.length >= 6 ? 2 : 1);
            if (!t) {
                // A label that exists in exactly one table: the table name was simply wrong.
                const owners = tableNames.filter(x => findLabel(x, key));
                if (owners.length === 1) t = owners[0];
            }
            if (!t) return null;
            const k = findLabel(t, key);
            if (!k) return null;
            // Only an exact table and label make the function-prefix case unambiguous.
            const exact = (t === (fn ? table.slice(fn.length) : table)) && k === key;
            return { repl: fn ? (fn + '(' + t + '[' + k + '])') : (t + '[' + k + ']'), kind: (fn && exact) ? 'function' : 'match' };
        };

        const pending = [];
        for (const m of Array.from(original.matchAll(TOKEN))) {
            const [token, table, key] = m;
            if (isCellRange(key) || key.indexOf(':') >= 0) continue;
            const fix = localFix(token, table, key);
            if (fix) {
                if (fix.repl !== token) rewrite(token, fix.repl, token + ' read as ' + fix.repl, fix.kind);
                continue;
            }
            pending.push({ token, table, key });
        }

        // ---- 2. Claude for whatever is still unresolved ------------------------------------
        if (pending.length && !o.noClaude) {
            const payload = {
                formula: text,
                missing: pending.map(p => ({ table: p.table, key: p.key })),
                tables: tableNames.map(n => ({ name: n, labels: labelsOf(n) }))
            };
            let answer = null;
            try {
                if (pt.setMessage) pt.setMessage('Resolving ' + pending.map(p => p.token).join(', ') + ' with Claude…', 1);
                answer = await exec('py/openai/resolve-reference.py', JSON.stringify(payload));
            } catch (e) { answer = null; }
            if (answer && answer.status === 'OK') {
                const tables = answer.tables || {};
                const keys = Object.keys(tables);
                if (keys.length) {
                    result.tables = Object.assign({}, tables);
                    for (const k of keys) {
                        const mm = k.match(/^([A-Za-z_][\w.-]*)\[(.+)\]$/);
                        if (mm) {
                            (virtual[mm[1]] = virtual[mm[1]] || new Set()).add(mm[2]);
                            if (!tableNames.includes(mm[1])) tableNames.push(mm[1]);
                        }
                    }
                    if (applyNow) {
                        try {
                            await exec('baja/draw/data-model-to-tables-gpt', pt, { tables: tables, formulas: {}, annotations: {} });
                            result.created = keys.slice();
                            result.notes.push('Created ' + keys.map(k => k + ' = ' + tables[k]).join(', '));
                        } catch (e) {
                            result.notes.push('Could not create ' + keys.join(', ') + ': ' + (e && e.message ? e.message : e));
                        }
                    } else {
                        result.notes.push('Would create ' + keys.map(k => k + ' = ' + tables[k]).join(', '));
                    }
                }
                if (typeof answer.formula === 'string' && answer.formula.trim() && answer.formula.trim() !== text.trim()) {
                    const lead = /^\s*=/.test(text) && !/^\s*=/.test(answer.formula) ? '=' : '';
                    text = lead + answer.formula.trim();
                    result.changed = true;
                }
                // Inputs Claude created now exist, so a token it left alone (or a token in its
                // rewrite) can be matched to them by the same local rules.
                for (const m of Array.from(text.matchAll(TOKEN))) {
                    const [token, table, key] = m;
                    if (isCellRange(key) || key.indexOf(':') >= 0) continue;
                    const fix = localFix(token, table, key);
                    if (fix && fix.repl !== token) rewrite(token, fix.repl, token + ' read as ' + fix.repl, fix.kind);
                }
                for (const n of (answer.notes || [])) result.notes.push(String(n));
            } else if (answer && answer.error) {
                result.notes.push('Claude could not resolve the reference: ' + answer.error);
            }
        }

        result.formula = text;
        if (applyNow && (result.changed || result.created.length)) {
            try {
                if (pt.setMessage) pt.setMessage(result.notes[result.notes.length - 1] || 'Formula reference repaired', 1);
            } catch (e) { }
        }
        pt.__missingRefRepairs[cacheKey] = result;
        return result;
    })();
}

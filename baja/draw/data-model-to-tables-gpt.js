function (platetrack, model, option) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate.js');
        const TransparentPlate = await exec('baja/plate/plate-transparent')
        let GenericWell = await exec('baja/plate/well.js')

        function normalizeFormulas(formulas) {
            if (!formulas || typeof formulas !== 'object') return formulas;

            const out = {};
            for (const [rawKey, rawExpr] of Object.entries(formulas)) {
                const key = typeof rawKey === 'string' ? rawKey : String(rawKey);
                const expr = typeof rawExpr === 'string' ? rawExpr : String(rawExpr);

                const newKey = normalizeRefString(key);
                const newExpr = normalizeRefString(expr);

                out[newKey] = '=' + newExpr;
            }
            return out;
        }

        function normalizeRefString(s) {
            if (typeof s !== 'string' || !s) return s;

            const tableRefRe = /([A-Za-z_]\w*)\s*((?:\[[^\[\]]*\])+)/g;

            return s.replace(tableRefRe, (full, table, bracketBlob) => {
                const groups = parseBracketGroups(bracketBlob);
                const fixedGroups = groups.map(g => {
                    const trimmed = String(g).trim();
                    if (/^\d+$/.test(trimmed)) {

                        return `${trimmed}:${trimmed}`;
                    }

                    return trimmed;
                });

                const rebuilt = fixedGroups.map(inner => `[${inner}]`).join('');
                return `${table}${rebuilt}`;
            });
        }

        function parseBracketGroups(bracketBlob) {
            const parts = [];
            let cur = '';
            let depth = 0;

            for (let i = 0; i < bracketBlob.length; i++) {
                const ch = bracketBlob[i];
                if (ch === '[') {
                    if (depth === 0) cur = '';
                    depth++;
                } else if (ch === ']') {
                    depth--;
                    if (depth === 0) parts.push(cur);
                } else if (depth > 0) {
                    cur += ch;
                }
            }
            return parts;
        }
        function toTableKeyValueMaps(cellDict) {
            const keyRe = /^([^[]+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
            const byTable = new Map();

            for (const [addr, raw] of Object.entries(cellDict || {})) {
                const m = keyRe.exec(addr);
                if (!m) continue;
                const [, table, cStart, cEnd, rStart, rEnd] = m;
                const c0 = +cStart, c1 = +cEnd, r0 = +rStart, r1 = +rEnd;

                for (let c = c0; c <= c1; c++) {
                    for (let r = r0; r <= r1; r++) {
                        let t = byTable.get(table);
                        if (!t) {
                            t = { labelsByRow: new Map(), valuesByRow: new Map() };
                            byTable.set(table, t);
                        }
                        if (c === 0) {
                            t.labelsByRow.set(r, String(raw).trim());
                        } else if (c === 1) {
                            t.valuesByRow.set(r, coerce(raw));
                        }
                    }
                }
            }

            const out = {};
            for (const [table, { labelsByRow, valuesByRow }] of byTable.entries()) {
                const obj = {};
                for (const [row, label] of labelsByRow.entries()) {
                    if (!label) continue;
                    if (!valuesByRow.has(row)) continue;
                    const value = valuesByRow.get(row);

                    obj[label] = value;
                }
                out[table] = obj;
            }
            return out;

            function coerce(v) {
                if (typeof v !== 'string') return v;
                const s = v.trim();

                if (/^(null|nullvalue)$/i.test(s)) return null;
                if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);

                if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);

                return s;
            }
        }
        function isLabelFound(plate, key) {
            const needle = key.trim().toLowerCase();
            const wells = plate.wells;

            for (let y = 0; y < plate.grid.ymax; y++) {
                const col0 = wells[0]?.[y];
                if (!col0) continue;
                const value_ = col0.value
                if ((value_ + '').toLowerCase() === needle) {
                    return true;
                }
            }
            return false;
        }
        function appendJsonRowsToPlate(plate, payload) {
            if (!payload || !payload.tables) return { added: 0, skipped: 0 };
            let added = 0, skipped = 0;
            let kv = toTableKeyValueMaps(payload.tables)
            for (let table_key of Object.keys(kv)) {
                let table_dictionary = kv[table_key]
                for (let __key of Object.keys(table_dictionary)) {
                    let __value = table_dictionary[__key]
                    if (!isLabelFound(plate, __key) && typeof plate.addRow === 'function') {
                        plate.addRow();
                        let currentyIndex = plate.grid.ymax - 1;
                        plate.setValueByIndex(0, currentyIndex, __key)
                        plate.setValueByIndex(1, currentyIndex, __value)
                        added++;
                    } else {
                        skipped++;
                    }
                }
            }
            return { added, skipped };
        }

        function preseedTablesIntoPlatetrack(tablesParam, platetrack, assignments = {}, annotations) {
            const WELL_SCREEN_WIDTH = 150;
            const WELL_SCREEN_HEIGHT = 14;

            const cellRefRe = /^([A-Za-z_]\w*)\[(\d+:\d+)\]\[(\d+:\d+)\]$/;
            const labelAssignRe = /^([A-Za-z_][\w.-]*)\[(.+?)\]$/;

            function newBounds() { return { xi: Number.POSITIVE_INFINITY, xf: -1, yi: Number.POSITIVE_INFINITY, yf: -1 }; }
            function bumpBounds(b, c, r) {
                b.xi = Math.min(b.xi, c);
                b.xf = Math.max(b.xf, c);
                b.yi = Math.min(b.yi, r);
                b.yf = Math.max(b.yf, r);
            }
            function bumpRangeBounds(b, cs, ce, rs, re) {
                b.xi = Math.min(b.xi, cs);
                b.xf = Math.max(b.xf, ce);
                b.yi = Math.min(b.yi, rs);
                b.yf = Math.max(b.yf, re);
            }

            function parseSel(sel) {
                const [a, b] = sel.split(':').map(n => parseInt(n, 10));
                const s = Math.min(a, b), e = Math.max(a, b);
                return [s, e];
            }

            function isRowMap(obj) {
                if (!obj || Array.isArray(obj) || typeof obj !== 'object') return false;
                const keys = Object.keys(obj);
                if (keys.length === 0) return false;
                return keys.every(k => /^\d+$/.test(k) && Array.isArray(obj[k]) && obj[k].length >= 1);
            }

            function coerceValue(v) {
                if (typeof v === 'number') return v;

                const s = String(v).trim();
                if (s === '') return v;

                if (/[-/\.]/.test(s)) return s;

                const n = parseFloat(s);
                return !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s) ? n : s;
            }

            const findPlate = (name) => platetrack.root.find(p => p.name === name) || null;

            function ensurePlateWithBounds(name, b) {

                const xi = Number.isFinite(b.xi) ? b.xi : 0;
                const xf = b.xf >= 0 ? b.xf : 1;
                const yi = Number.isFinite(b.yi) ? b.yi : 0;
                const yf = b.yf >= 0 ? b.yf : 1;

                let p = findPlate(name);
                if (p) {
                    p.range = { xi, xf, yi, yf };
                    return p;
                }

                const PlateCtor = Plate;
                const plate = new PlateCtor(name, 1, 1);
                plate.last_touched = new Date();
                plate.setPreferences('showInputs', true)

                plate.range = { xi, xf, yi, yf };

                plate.grid.xmin = xi;
                plate.grid.ymin = yi;
                plate.grid.xmax = xf + 1;
                plate.grid.ymax = yf + 1;

                plate.grid.width = platetrack.grid.worldWidth(plate.grid.xmax * WELL_SCREEN_WIDTH);
                plate.grid.height = platetrack.grid.worldHeight(plate.grid.ymax * WELL_SCREEN_HEIGHT);
                plate.grid.yi = platetrack.grid.Ywc(100) - plate.grid.height;
                plate.grid.rescale?.();

                plate.wells = [];
                for (let c = xi; c <= xf; c++) {
                    const col = [];
                    for (let r = yi; r <= yf; r++) {
                        const label = `${String.fromCharCode(65 + (c - xi))}${(r - yi) + 1}`;
                        col[r] = new GenericWell(label);
                    }
                    plate.wells[c] = col;
                }

                plate.completeNullValues?.();

                plate.trimFat?.();

                if (option && option === 'hidden') {
                    plate.hidden = true;
                }
                platetrack.addNextAvailableX(plate);
                return plate;
            }

            function ensureCols(plate, upToColIdx) {
                for (let c = plate.wells.length; c <= upToColIdx; c++) {
                    plate.insertCol?.(c);
                    if (!plate.wells[c]) plate.wells[c] = [];
                    if (!plate.wells[c][0]) {
                        plate.wells[c][0] = new GenericWell(`${String.fromCharCode(65 + c)}1`);
                    }
                }
            }
            function addRowsUntil(plate, rowIndex) {
                if (!plate.wells[0]) {
                    plate.insertCol?.(0);
                    plate.wells[0] = plate.wells[0] || [];
                    if (!plate.wells[0][0]) plate.wells[0][0] = new GenericWell('A1');
                }
                while (plate.getLastRow && plate.getLastRow() < rowIndex) {
                    plate.addRow?.();
                }
            }
            function ensureWell(plate, c, r) {
                ensureCols(plate, c);
                addRowsUntil(plate, r);
                if (!plate.wells[c][r]) {
                    plate.wells[c][r] = new GenericWell(`${String.fromCharCode(65 + c)}${r + 1}`);
                }
                return plate.wells[c][r];
            }
            function ensureHeaderColumn(plate, headerLabel) {
                let idx = plate.wells.findIndex(col => col && col[0] && col[0].value === headerLabel);
                if (idx !== -1) return idx;
                idx = plate.wells.length;
                plate.insertCol?.(idx);
                if (!plate.wells[idx]) plate.wells[idx] = [];
                if (!plate.wells[idx][0]) plate.wells[idx][0] = new GenericWell(`${String.fromCharCode(65 + idx)}1`);
                plate.wells[idx][0].value = headerLabel;
                return idx;
            }
            function ensureRowByLabel(plate, labelHeaderName, labelValue) {
                addRowsUntil(plate, 1);
                const labelCol = ensureHeaderColumn(plate, labelHeaderName);
                for (let r = 1; r < (plate.wells[labelCol]?.length || 0); r++) {
                    if (plate.wells[labelCol][r] && plate.wells[labelCol][r].value === labelValue) return r;
                }
                const targetRow = (plate.getLastRow ? plate.getLastRow() + 1 : (plate.wells[labelCol].length)) || 1;
                addRowsUntil(plate, targetRow);
                for (let c = 0; c < plate.wells.length; c++) {
                    if (!plate.wells[c]) plate.wells[c] = [];
                    if (!plate.wells[c][targetRow]) plate.wells[c][targetRow] = new GenericWell(`${String.fromCharCode(65 + c)}${targetRow + 1}`);
                }
                plate.wells[labelCol][targetRow].value = labelValue;
                return targetRow;
            }
            function setCell(plate, colIndex, rowIndex, value) {
                ensureWell(plate, colIndex, rowIndex);
                const w = plate.wells[colIndex][rowIndex];
                if (typeof w.setValue === 'function') w.setValue(value); else w.value = value;
            }
            function refreshTags(plate) {
                plate.applycolumnheaders?.();
                plate.applyrowheaders?.();
            }
            function rescalePlateGrid(plate) {
                const cols = plate.grid?.xmax ?? plate.wells.length;
                const rows = plate.grid?.ymax ?? (plate.wells[0]?.length || 1);
                if (typeof plate.getLastColumn === 'function') {
                    const lastCol = plate.getLastColumn();
                    plate.grid.xmax = Math.max(cols, (lastCol ?? cols) + 1);
                } else {
                    plate.grid.xmax = Math.max(cols, plate.wells.length);
                }
                if (typeof plate.getLastRow === 'function') {
                    const lastRow = plate.getLastRow();
                    plate.grid.ymax = Math.max(rows, (lastRow ?? rows) + 1);
                } else {
                    let maxRows = 1;
                    for (let c = 0; c < plate.wells.length; c++) {
                        maxRows = Math.max(maxRows, plate.wells[c].length);
                    }
                    plate.grid.ymax = Math.max(rows, maxRows);
                }
                plate.grid.width = platetrack.grid.worldWidth(plate.grid.xmax * WELL_SCREEN_WIDTH);
                plate.grid.height = platetrack.grid.worldHeight(plate.grid.ymax * WELL_SCREEN_HEIGHT);
                plate.grid.rescale?.();
            }
            function isFormula(str) {

                if (!str) {
                    return false;
                }

                if (str && typeof str === 'string' && str.startsWith('=')) {
                    return true;
                } else
                    return false;

            }

            const schemaTables = {};
            const objectLiteralTables = {};
            const rangeAssignments = {};
            const labelAssignments = {};

            if (tablesParam && typeof tablesParam === 'object') {
                for (const [k, v] of Object.entries(tablesParam)) {
                    if (cellRefRe.test(k)) { rangeAssignments[k] = v; continue; }
                    const lm = k.match(labelAssignRe);
                    if (lm) {
                        const [, table, label] = lm;
                        (labelAssignments[table] ||= []).push({ label, value: v });
                        continue;
                    }
                    if (v && typeof v === 'object' && !Array.isArray(v)) {

                        if (isRowMap(v)) { schemaTables[k] = v; continue; }
                        const looksLikeCells = Object.keys(v).every(s => /^\d+:\d+$/.test(s));
                        if (looksLikeCells) { objectLiteralTables[k] = v; continue; }
                    }
                    schemaTables[k] = v;
                }
            }

            if (assignments && typeof assignments === 'object') {
                for (const [k, v] of Object.entries(assignments)) {
                    if (cellRefRe.test(k)) rangeAssignments[k] = v;
                }
            }

            const bounds = {};

            for (const [tableName, schema] of Object.entries(schemaTables)) {
                if (isRowMap(schema)) {
                    const rows = Object.keys(schema).map(k => parseInt(k, 10));
                    if (rows.length) {
                        const b = bounds[tableName] ||= newBounds();
                        const minRow = Math.min(...rows);
                        const maxRow = Math.max(...rows);

                        let maxCols = 0;
                        for (const i of rows) maxCols = Math.max(maxCols, Array.isArray(schema[i]) ? schema[i].length : 0);

                        bumpRangeBounds(b, 0, Math.max(0, maxCols - 1), minRow, maxRow);
                    }
                } else if (schema && typeof schema === 'object') {

                    if (Array.isArray(schema.data) && schema.data.length > 0) {
                        const cols = schema.data[0].length;
                        const rows = schema.data.length;
                        const b = bounds[tableName] ||= newBounds();
                        bumpRangeBounds(b, 0, Math.max(0, cols - 1), 0, Math.max(0, rows - 1));
                    } else if (Array.isArray(schema.columns) && Array.isArray(schema.rows)) {
                        const cols = schema.columns.length;
                        const rows = schema.rows.length + 1;
                        const b = bounds[tableName] ||= newBounds();
                        bumpRangeBounds(b, 0, Math.max(0, cols - 1), 0, Math.max(0, rows - 1));
                    }
                }
            }

            for (const [tableName, objLiteral] of Object.entries(objectLiteralTables)) {
                const b = bounds[tableName] ||= newBounds();
                for (const key of Object.keys(objLiteral)) {
                    const [c, r] = key.split(':').map(n => parseInt(n, 10));
                    bumpBounds(b, c, r);
                }
            }

            for (const [ref, _] of Object.entries(rangeAssignments)) {
                const m = ref.match(cellRefRe);
                if (!m) continue;
                const [, tableName, colSel, rowSel] = m;
                const [cs, ce] = parseSel(colSel);
                const [rs, re] = parseSel(rowSel);
                const b = bounds[tableName] ||= newBounds();
                bumpRangeBounds(b, cs, ce, rs, re);
            }

            for (const [tableName, items] of Object.entries(labelAssignments)) {
                const b = bounds[tableName] ||= newBounds();

                bumpRangeBounds(b, 0, 1, 0, Math.max(1, items.length));
            }

            for (const name of new Set([
                ...Object.keys(schemaTables),
                ...Object.keys(objectLiteralTables),
                ...Object.keys(labelAssignments),
                ...Object.keys(rangeAssignments).map(k => k.match(cellRefRe)?.[1]).filter(Boolean),
            ])) {
                if (!bounds[name]) bounds[name] = { xi: 0, xf: 1, yi: 0, yf: 1 };
            }

            for (const [name, b] of Object.entries(bounds)) {
                ensurePlateWithBounds(name, b);
            }

            for (const [tableName, schema] of Object.entries(schemaTables)) {
                if (!isRowMap(schema)) continue;
                const plate = findPlate(tableName);

                for (const [rowStr, cells] of Object.entries(schema)) {
                    const r = parseInt(rowStr, 10);
                    for (let c = 0; c < cells.length; c++) {
                        setCell(plate, c, r, coerceValue(cells[c]));
                    }
                }
                refreshTags(plate);
                rescalePlateGrid(plate);
            }

            for (const [tableName, objLiteral] of Object.entries(objectLiteralTables)) {
                const plate = findPlate(tableName);
                for (const [key, rawVal] of Object.entries(objLiteral)) {
                    const [c, r] = key.split(':').map(n => parseInt(n, 10));
                    setCell(plate, c, r, coerceValue(rawVal));
                }
                refreshTags(plate);
                rescalePlateGrid(plate);
            }

            const touchedPlates = new Set();
            for (const [ref, rawVal] of Object.entries(rangeAssignments)) {
                const m = ref.match(cellRefRe);
                if (!m) continue;
                const [, tableName, colSel, rowSel] = m;
                const plate = findPlate(tableName);
                const [cs, ce] = parseSel(colSel);
                const [rs, re] = parseSel(rowSel);

                for (let c = cs; c <= ce; c++) for (let r = rs; r <= re; r++) ensureWell(plate, c, r);

                if (isFormula(rawVal)) {
                    if (!plate.formula) plate.formula = {};
                    plate.formula[`[${colSel}][${rowSel}]`] = String(rawVal).trim();
                } else {
                    const value = coerceValue(rawVal);
                    for (let c = cs; c <= ce; c++) {
                        for (let r = rs; r <= re; r++) setCell(plate, c, r, value);
                    }
                }
                touchedPlates.add(plate);
            }

            for (const [tableName, items] of Object.entries(labelAssignments)) {
                const plate = findPlate(tableName);

                if (!plate.wells?.[0]?.[0]?.value) setCell(plate, 0, 0, 'Label');
                if (!plate.wells?.[1]?.[0]?.value) setCell(plate, 1, 0, 'Value');

                for (const { label, value: rawVal } of items) {
                    const rowIndex = ensureRowByLabel(plate, 'Label', label);
                    if (isFormula(rawVal)) {
                        if (!plate.formula) plate.formula = {};
                        plate.formula[`[1:1][${rowIndex}:${rowIndex}]`] = String(rawVal).trim();
                    } else {
                        setCell(plate, 1, rowIndex, coerceValue(rawVal));
                    }
                    touchedPlates.add(plate);
                }
            }

            for (const plate of platetrack.root) {
                if (typeof plate.getLastRow === 'function' && typeof plate.getLastColumn === 'function') {
                    if (plate.getLastRow() > 1 && plate.getLastColumn() > 1 && typeof plate.removeEmptyRowsAndColumns === 'function') {
                        plate.removeEmptyRowsAndColumns();
                    }
                }
                refreshTags(plate);
                rescalePlateGrid(plate);
            }

            for (let p of platetrack.root) {
                if (p?.wells?.[0]?.[0]) p.wells[0][0].value = p.name;
            }

            return platetrack.root;
        }

        function validatePlatetrackFormulas(dataset, platetrack) {
            const { tables = {}, formulas = {}, annotations } = dataset || {};

            let fixed_formulas = normalizeFormulas(model.formulas);
            preseedTablesIntoPlatetrack(model.tables, platetrack, fixed_formulas, model.annotations);

            const cellRefRe = /^([A-Za-z_]\w*)\[(\d+:\d+)\]\[(\d+:\d+)\]$/;
            const tableRefRe = /([A-Za-z_]\w*)\s*(\[(?:[^\[\]\r\n]|\\\]|\\\[)+\]+)/g;
            const isRange = (sel) => /^\d+:\d+$/.test(sel);

            const findPlate = (name) => platetrack?.root?.find(p => p && p.name === name) || null;

            function parseBracketGroups(bracketStr) {

                const parts = [];
                let cur = '';
                let depth = 0;
                for (let i = 0; i < bracketStr.length; i++) {
                    const ch = bracketStr[i];
                    if (ch === '[') {
                        if (depth === 0) cur = '';
                        depth++;
                    } else if (ch === ']') {
                        depth--;
                        if (depth === 0) parts.push(cur);
                    } else if (depth > 0) {
                        cur += ch;
                    }
                }
                return parts;
            }

            function findRowIndexByLabel(plate, label) {

                if (!plate || !Array.isArray(plate.wells) || !plate.wells[0]) return -1;
                for (let r = 0; r < plate.wells[0].length; r++) {
                    const w = plate.wells[0][r];
                    if (w && w.value === label) return r;
                }
                return -1;
            }

            function hasCell(plate, c, r) {
                return Boolean(plate && plate.wells && plate.wells[c] && plate.wells[c][r]);
            }

            function lastCol(plate) {
                if (!plate?.wells) return -1;
                return plate.wells.length - 1;
            }

            function lastRow(plate) {
                if (!plate?.wells?.length) return -1;
                let m = -1;
                for (let c = 0; c < plate.wells.length; c++) {
                    m = Math.max(m, plate.wells[c]?.length ?? -1);
                }
                return m - 1;
            }

            function extractAllFormulas() {
                const out = [];

                for (const [k, v] of Object.entries(tables)) {
                    if (typeof v === 'string' && looksLikeFormula(v)) {
                        out.push({ source: 'tables', key: k, formula: v });
                    }
                }

                for (const [k, v] of Object.entries(formulas)) {
                    if (typeof v === 'string') {
                        out.push({ source: 'formulas', key: k, formula: v });
                    }
                }

                for (const plate of (platetrack.root || [])) {
                    if (plate?.formula && typeof plate.formula === 'object') {
                        for (const [cellKey, f] of Object.entries(plate.formula)) {
                            if (typeof f === 'string') {
                                out.push({ source: `plate:${plate.name}`, key: cellKey, formula: f });
                            }
                        }
                    }
                }

                return out;
            }

            function looksLikeFormula(str) {
                const s = String(str).trim();
                if (/^[=+\-*/^$!()]/.test(s)) return true;
                if (/\b(sum|max|min|avg|mean|count)\b/i.test(s)) return true;
                if (/[A-Za-z_]\w*(?:\[[^\[\]\r\n]*\])+/.test(s)) return true;
                if (/(?:\w|\])\s*[\+\-\*\/\^]\s*(?:\w|\[)/.test(s)) return true;
                return false;
            }

            function parseFormulaRefs(formula) {
                const refs = [];
                const visited = new Set();
                const s = String(formula);

                let m;
                while ((m = tableRefRe.exec(s)) !== null) {
                    const table = m[1];
                    const bracketGroup = m[2];
                    const sig = `${table}${bracketGroup}`;
                    if (visited.has(sig)) continue;
                    visited.add(sig);

                    const inner = parseBracketGroups(bracketGroup);

                    if (inner.length === 1 && !isRange(inner[0])) {
                        refs.push({ table, kind: 'label', info: { label: inner[0] } });
                    } else if (inner.length === 2 && isRange(inner[0]) && isRange(inner[1])) {
                        refs.push({
                            table,
                            kind: 'range',
                            info: {
                                colSel: inner[0],
                                rowSel: inner[1],
                            },
                        });
                    } else {

                        refs.push({ table, kind: 'unknown', info: { parts: inner } });
                    }
                }

                return refs;
            }

            function parseSel(sel) {
                const [a, b] = sel.split(':').map(n => parseInt(n, 10));
                const s = Math.min(a, b);
                const e = Math.max(a, b);
                return [s, e];
            }

            const report = {
                errors: [],
                warnings: [],
                details: [],
            };

            function err(msg, ctx) {
                report.errors.push(ctx ? `${msg} — ${ctx}` : msg);
            }
            function warn(msg, ctx) {
                report.warnings.push(ctx ? `${msg} — ${ctx}` : msg);
            }

            const all = extractAllFormulas();

            for (const item of all) {
                const refs = parseFormulaRefs(item.formula);
                const per = { source: item.source, key: item.key, formula: item.formula, refs: [] };

                if (!refs.length) {

                    report.details.push(per);
                    continue;
                }

                for (const ref of refs) {
                    const entry = { ...ref, ok: true, messages: [] };
                    const plate = findPlate(ref.table);

                    if (!plate) {
                        entry.ok = false;
                        entry.messages.push(`Missing table: "${ref.table}"`);
                        err(`Missing table "${ref.table}"`, `in formula: ${item.formula}`);
                        per.refs.push(entry);
                        continue;
                    }

                    if (ref.kind === 'label') {
                        const r = findRowIndexByLabel(plate, ref.info.label);
                        if (r < 0) {
                            entry.ok = false;
                            entry.messages.push(
                                `Row label "${ref.info.label}" not found in table "${ref.table}" (expected in first column).`
                            );
                            err(
                                `Unknown row label "${ref.info.label}" in "${ref.table}"`,
                                `formula: ${item.formula}`
                            );
                        } else {

                            if (lastCol(plate) < 1) {
                                entry.ok = false;
                                entry.messages.push(
                                    `Table "${ref.table}" has no value column at index 1 for label "${ref.info.label}".`
                                );
                                err(
                                    `No value column in "${ref.table}" for label "${ref.info.label}"`,
                                    `formula: ${item.formula}`
                                );
                            } else if (!hasCell(plate, 1, r)) {
                                entry.ok = false;
                                entry.messages.push(
                                    `Missing cell at column 1, row ${r} in "${ref.table}" for label "${ref.info.label}".`
                                );
                                err(
                                    `Missing value cell in "${ref.table}" (c=1, r=${r}) for "${ref.info.label}"`,
                                    `formula: ${item.formula}`
                                );
                            }
                        }
                    } else if (ref.kind === 'range') {
                        const [cs, ce] = parseSel(ref.info.colSel);
                        const [rs, re] = parseSel(ref.info.rowSel);

                        const lc = lastCol(plate);
                        const lr = lastRow(plate);
                        if (lc < ce || lr < re) {
                            entry.ok = false;
                            entry.messages.push(
                                `Range [${ref.info.colSel}][${ref.info.rowSel}] exceeds bounds of "${ref.table}" (last col=${lc}, last row=${lr}).`
                            );
                            err(
                                `Out-of-bounds range in "${ref.table}"`,
                                `range [${ref.info.colSel}][${ref.info.rowSel}], formula: ${item.formula}`
                            );
                        } else {

                            for (let c = cs; c <= ce; c++) {
                                for (let r = rs; r <= re; r++) {
                                    if (!hasCell(plate, c, r)) {
                                        entry.ok = false;
                                        entry.messages.push(
                                            `Missing cell c=${c}, r=${r} in "${ref.table}" for range [${ref.info.colSel}][${ref.info.rowSel}]`
                                        );
                                    }
                                }
                            }
                            if (!entry.messages.length) {

                            } else {
                                err(
                                    `Missing cells within range in "${ref.table}"`,
                                    `range [${ref.info.colSel}][${ref.info.rowSel}], formula: ${item.formula}`
                                );
                            }
                        }
                    } else {
                        warn(
                            `Unrecognized reference pattern in "${ref.table}" with parts ${JSON.stringify(
                                ref.info.parts
                            )}`,
                            `formula: ${item.formula}`
                        );
                    }

                    per.refs.push(entry);
                }

                report.details.push(per);
            }

            const ok = report.errors.length === 0;
            return { ok, report };
        }

        function checkFormulaValueWells(reportJson, platetrack) {
            const result = {
                ok: true,
                report: {
                    errors: [],
                    warnings: [],
                    missingValues: []
                }
            };

            const findPlate = (name) =>
                platetrack?.root?.find(p => p && p.name === name) || null;

            function readWell(plate, c, r) {
                const w = plate?.wells?.[c]?.[r];
                if (!w) return { exists: false, value: undefined };

                const val = typeof w.getValue === 'function' ? w.getValue() : w.value;
                return { exists: true, value: val };
            }

            function findRowIndexByLabelExact(plate, label) {
                const col0 = plate?.wells?.[0];
                if (!col0) return -1;
                for (let r = 0; r < col0.length; r++) {
                    const v = col0[r]?.value;
                    if (v === label) return r;
                }
                return -1;
            }

            function findRowIndexByLabelCaseInsensitive(plate, label) {
                const target = String(label).toLowerCase();
                const col0 = plate?.wells?.[0];
                if (!col0) return { row: -1, matchedLabel: null };
                for (let r = 0; r < col0.length; r++) {
                    const v = col0[r]?.value;
                    if (typeof v === 'string' && v.toLowerCase() === target) {
                        return { row: r, matchedLabel: v };
                    }
                }
                return { row: -1, matchedLabel: null };
            }

            function hasConcreteValue(val) {
                if (val === null || val === undefined) return false;
                if (typeof val === 'number') return !Number.isNaN(val);
                const s = String(val).trim();
                return s !== '' && s.toLowerCase() !== 'NaN'.toLowerCase();
            }

            const details = reportJson?.report?.details || [];
            for (const d of details) {

                for (const ref of (d.refs || [])) {
                    if (ref.kind !== 'label') continue;

                    const table = ref.table;
                    const label = ref.info?.label;
                    const plate = findPlate(table);

                    if (!plate) continue;

                    let row = findRowIndexByLabelExact(plate, label);
                    let caseNote = null;

                    if (row < 0) {
                        const ci = findRowIndexByLabelCaseInsensitive(plate, label);
                        if (ci.row >= 0) {
                            row = ci.row;
                            caseNote = `Case mismatch: label on plate is "${ci.matchedLabel}", formula uses "${label}".`;
                        }
                    }

                    if (row < 0) continue;

                    const { exists, value } = readWell(plate, 1, row);
                    const good = exists && hasConcreteValue(value);

                    if (!good) {
                        result.ok = false;
                        const msg =
                            `Missing value for ${table}[${label}] at (col=1,row=${row})`
                            + (exists ? ' (cell exists but is empty)' : ' (cell does not exist)');
                        result.report.errors.push(
                            `${msg} — referenced by ${d.source} ${d.key}`
                        );
                        const entry = {
                            table,
                            label,
                            source: d.source,
                            formulaKey: d.key,
                            at: { col: 1, row }
                        };
                        if (caseNote) {
                            entry.note = caseNote;
                            result.report.warnings.push(`${caseNote} — ${table}[${label}] in ${d.source} ${d.key}`);
                        }
                        result.report.missingValues.push(entry);
                    }
                }
            }
            return result;

        }

        function addImpliedMultiplication(dataset) {
            const out = {};

            const IMPLIED_MUL = /(\]|\)|\d(?:\.\d+)?)(?=\s*(\(|[A-Za-z_]|[0-9]))/g;

            for (const [k, v] of Object.entries(dataset || {})) {
                if (typeof v !== 'string') { out[k] = v; continue; }

                let s = v;

                s = s.replace(IMPLIED_MUL, '$1*');

                out[k] = s;
            }
            return out;
        }

        if (option && option === 'append') {

            let rs = []
            for (let pr of platetrack.root) {
                rs.push(appendJsonRowsToPlate(pr, model))

            }
            return resolve(rs)
        }

        let fixed_formulas = (model.formulas)
        preseedTablesIntoPlatetrack(model.tables, platetrack, fixed_formulas, model.annotations)
        let report = validatePlatetrackFormulas(model.formulas, platetrack)
        let report2 = checkFormulaValueWells(report, platetrack)
        let units = model.units;
        function convertUnits(dict) {
            const converted = {};

            for (const [key, valueDict] of Object.entries(dict)) {

                if (!valueDict || typeof valueDict !== "object") {
                    converted[key] = "default";
                    continue;
                }

                const innerConverted = {};

                for (const [innerKey, innerValue] of Object.entries(valueDict)) {
                    if (!innerValue) {
                        innerConverted[innerKey] = "default";
                        continue;
                    }

                    const keyLower = innerKey.toLowerCase();

                    const isCostsLike =
                        keyLower.endsWith("_costs") ||
                        keyLower.includes("_costs_") ||
                        keyLower.endsWith("_capital") ||
                        keyLower.startsWith("cogs") ||
                        keyLower.endsWith("cogs");

                    if (isCostsLike) {
                        innerConverted[innerKey] = "DOLLAR";
                    } else if (typeof innerValue === "string" && innerValue.includes("USD")) {
                        innerConverted[innerKey] = "DOLLAR";
                    } else if (innerValue === "fraction") {
                        innerConverted[innerKey] = "PERCENT";
                    } else {
                        innerConverted[innerKey] = innerValue;
                    }
                }

                converted[key] = innerConverted;
            }

            return converted;
        }

        if (units) {
            units = convertUnits(units)
        }

        for (let pl of platetrack.root) {
            if (pl.getFormula() == null || Object.keys(pl.getFormula()).length <= 0) {
                const plate = Plate.buildPlateFromJSON(pl.toJSON());
                plate.column_widths = [];
                platetrack.replacePlate(pl, plate);
            }
        }

        for (let pl of platetrack.root) {
            if (units) {
                let keys = Object.keys(units)
                for (let k of keys) {
                    if (k === pl.name) {
                        if (pl.applyWellType) {
                            let ttypes = units[k];
                            for (let t of Object.keys(ttypes)) {
                                pl.applyWellType(t, ttypes[t])
                            }
                        }
                    }
                }
            }

        }

        return resolve(report2)
    })
}

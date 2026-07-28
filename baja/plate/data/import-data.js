function (text, pt, paint_panel) {

    return new Promise(async (resolve, reject) => {

        function importToPlateValue(mappingResult, plate, pastedText, opts = {}) {
            const coerceNumbers = opts.coerceNumbers !== false;

            const safeStr = v => (v == null ? "" : String(v));
            const toNumberIf = v => {
                if (!coerceNumbers) return v;
                if (v === "" || v == null) return v;
                const n = Number(v);
                return Number.isFinite(n) ? n : v;
            };
            const unescapeIfLiteral = s =>
                s && (s.includes("\\t") || s.includes("\\n") || s.includes("\\r"))
                    ? s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t")
                    : s;

            const detectDelimiter = line => {
                const counts = {
                    "\t": (line.match(/\t/g) || []).length,
                    ",": (line.match(/,/g) || []).length,
                    ";": (line.match(/;/g) || []).length,
                    "|": (line.match(/\|/g) || []).length,
                };

                return Object.entries(counts).sort((a, b) => (b[1] - a[1]) || (a[0] === "\t" ? -1 : 1))[0][0] || "\t";
            };

            const uniquifyHeaders = (arr) => {
                const seen = new Map();
                return arr.map((h, i) => {
                    let name = safeStr(h).trim();
                    if (name === "") name = `__EMPTY_COL_${i + 1}`;
                    const base = name;
                    let k = name, n = 2;
                    while (seen.has(k)) k = `${base}__${n++}`;
                    seen.set(k, true);
                    return k;
                });
            };

            const parsePasted = (text) => {
                text = unescapeIfLiteral(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                const lines = text.split("\n").filter(l => l.length > 0);
                if (!lines.length) return { headers: [], rows: [] };
                const delim = detectDelimiter(lines[0]);
                const rawRows = lines.map(line => line.split(delim));

                const rows = rawRows.map(r => {
                    let j = r.length;
                    while (j > 0 && safeStr(r[j - 1]).trim() === "") j--;
                    return r.slice(0, j).map(c => safeStr(c).trim());
                });
                const headers = uniquifyHeaders(rows[0] || []);
                const data = rows.slice(1).filter(r => r.some(c => c !== ""));
                return { headers, rows: data };
            };

            const src = parsePasted(pastedText);
            const srcHeaders = src.headers;
            const srcRows = src.rows;
            const srcPos = Object.fromEntries(srcHeaders.map((h, i) => [h, i]));

            const cols = plate?.wells?.length || 0;
            const rows = cols ? (plate.wells[0]?.length || 0) : 0;
            if (!cols || !rows) return { status: "no-op", reason: "Empty plate." };

            const destHeaders = [];
            for (let x = 0; x < cols; x++) {
                const headerCell = plate.wells[x]?.[0];
                destHeaders.push(safeStr(headerCell?.value));
            }
            const destPos = Object.fromEntries(destHeaders.map((h, i) => [h || `Col${i + 1}`, i]));

            const applied = [];
            const skipped = [];
            const mapping = Array.isArray(mappingResult?.mapping) ? mappingResult.mapping : [];

            const normalizeFrom = (fromHeader) => {
                if (srcPos.hasOwnProperty(fromHeader)) return fromHeader;
                if (fromHeader === "") {
                    const fallback = srcHeaders.find(h => h.startsWith("__EMPTY_COL_"));
                    return fallback || null;
                }
                return null;
            };

            for (const m of mapping) {
                const toHeader = m?.to;
                const fromOrig = m?.from;

                if (!toHeader || !destPos.hasOwnProperty(toHeader)) {
                    skipped.push({ to: toHeader, from: fromOrig, reason: "destination header not on plate" });
                    continue;
                }
                const fromHeader = normalizeFrom(fromOrig);
                if (!fromHeader || !srcPos.hasOwnProperty(fromHeader)) {
                    skipped.push({ to: toHeader, from: fromOrig, reason: "source header missing (incl. empty fallback)" });
                    continue;
                }

                const dx = destPos[toHeader];
                const sx = srcPos[fromHeader];

                for (let y = 1; y < rows; y++) {
                    const ridx = y - 1;
                    if (ridx < 0 || ridx >= srcRows.length) break;
                    const v = toNumberIf(srcRows[ridx][sx]);
                    const cell = plate.wells[dx]?.[y];
                    if (!cell) continue;
                    cell.value = v;
                }

                applied.push({ to: toHeader, from: fromHeader });
            }

            return {
                status: "ok",
                mode: { join: "row-index" },
                applied_mappings: applied,
                skipped_mappings: skipped,
                source_headers_seen: srcHeaders,
                destination_headers_seen: destHeaders,
            };
        }

        function detectTableFormat(text) {
            if (!text || typeof text !== 'string') {
                return { rows: 0, columns: 0, data: [] };
            }

            const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const rawLines = normalized.split('\n');

            while (rawLines.length && rawLines[rawLines.length - 1].trim() === '') rawLines.pop();
            const lines = rawLines.length ? rawLines : [''];

            const candidates = [
                { name: 'tab', delim: '\t', type: 'char' },
                { name: 'comma', delim: ',', type: 'char' },
                { name: 'semicolon', delim: ';', type: 'char' },
                { name: 'pipe', delim: '|', type: 'char' },
                { name: 'multispace', delim: /\s{2,}/g, type: 'regex' },
                { name: 'space', delim: /[ ]/g, type: 'regex' }
            ];

            function parseDSVLine(line, delimChar) {
                const out = [];
                let cur = '';
                let i = 0;
                let inQuotes = false;

                while (i < line.length) {
                    const ch = line[i];

                    if (inQuotes) {
                        if (ch === '"') {
                            const next = line[i + 1];
                            if (next === '"') {
                                cur += '"';
                                i += 2;
                            } else {
                                inQuotes = false;
                                i += 1;
                            }
                        } else {
                            cur += ch;
                            i += 1;
                        }
                    } else {
                        if (ch === '"') {
                            inQuotes = true;
                            i += 1;
                        } else if (ch === delimChar) {
                            out.push(cur);
                            cur = '';
                            i += 1;
                        } else {
                            cur += ch;
                            i += 1;
                        }
                    }
                }
                out.push(cur);
                return out;
            }

            function parseWithCandidate(lines, cand) {
                const rows = [];
                if (cand.type === 'char') {
                    for (const ln of lines) rows.push(parseDSVLine(ln, cand.delim));
                } else {

                    for (const ln of lines) {
                        const parts = ln.split(cand.delim);
                        rows.push(parts);
                    }
                }
                return rows;
            }

            function scoreRows(rows) {
                if (!rows.length) return { colsMode: 0, variance: 0, nonEmptyLines: 0 };
                const counts = rows.map(r => r.length);
                const nonEmptyLines = rows.filter(r => r.some(cell => (cell ?? '').length > 0)).length;
                const freq = new Map();
                for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);

                let colsMode = 0, bestN = -1;
                for (const [c, n] of freq.entries()) {
                    if (n > bestN || (n === bestN && c > colsMode)) { bestN = n; colsMode = c; }
                }

                const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
                const variance = counts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / counts.length;
                return { colsMode, variance, nonEmptyLines };
            }

            let best = null;
            for (const cand of candidates) {
                const parsed = parseWithCandidate(lines, cand);
                const metrics = scoreRows(parsed);

                const multiCol = metrics.colsMode > 1 ? 1 : 0;
                const score = (multiCol * 1000) + (metrics.nonEmptyLines * 10) + metrics.colsMode - metrics.variance;
                if (!best || score > best.score) {
                    best = { cand, parsed, metrics, score };
                }
            }

            let parsedRows = best ? best.parsed : lines.map(ln => [ln]);

            if (parsedRows.length === 1 && parsedRows[0].length > 1) {

            } else if (parsedRows.length >= 1) {

            }

            parsedRows = parsedRows.map(r => r.map(c => (c ?? '').trim()));

            const columns = parsedRows.reduce((m, r) => Math.max(m, r.length), 0);
            const rowsCount = parsedRows.length;

            const padded = parsedRows.map(r => {
                if (r.length === columns) return r;
                const copy = r.slice();
                while (copy.length < columns) copy.push('');
                return copy;
            });

            const data = Array.from({ length: columns }, () => Array(rowsCount).fill(''));
            for (let r = 0; r < rowsCount; r++) {
                for (let c = 0; c < columns; c++) {
                    let v = padded[r][c];

                    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)) {
                        const n = Number(v);
                        v = Number.isFinite(n) ? n : v;
                    }

                    data[c][r] = v;
                }
            }

            return { rows: rowsCount, columns, data };
        }

        if (pt.selectedPlate && pt.selectedPlate.typeof === 'plot') {

            if (text.startsWith('{')) {

                function parseIfValidJsonObject(str) {
                    if (typeof str !== 'string') return null;

                    const trimmed = str.trim();
                    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

                    try {
                        const obj = JSON.parse(trimmed);

                        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                            const requiredKeys = ['name', 'x', 'y', 'type'];
                            const hasAll = requiredKeys.every(key => Object.prototype.hasOwnProperty.call(obj, key));

                            if (hasAll) {
                                return obj;
                            }
                        }
                    } catch (e) {

                    }

                    return null;
                }
                let vs = parseIfValidJsonObject(text.trim());
                if (vs) {
                    pt.selectedPlate.scatterData.points.push(vs)
                    pt.setMessage(" Point added ")
                    return resolve(vs)
                }
            }

        }

        let HM = await exec('baja/history/HM')

        function canonicalKey(obj) {
            const entries = Object.entries(obj || {})
                .filter(([, v]) => v != null && String(v).trim() !== '')
                .map(([k, v]) => [String(k).trim(), String(v).trim()]);
            entries.sort(([a], [b]) => a.localeCompare(b));
            return entries.map(([k, v]) => `${k}=${v}`).join('|');
        }

        function hashToColor(str) {

            let h = 2166136261 >>> 0;
            for (let i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            const hue = h % 360, sat = 65, light = 55;

            function hslToHex(H, S, L) {
                S /= 100; L /= 100;
                const k = n => (n + H / 30) % 12;
                const a = S * Math.min(L, 1 - L);
                const f = n => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
                const toHex = x => Math.round(255 * f(x)).toString(16).padStart(2, '0');
                return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
            }
            return hslToHex(hue, sat, light);
        }

        function collectWellText(well) {
            return [
                well?.name,
                well?.label,
                well?.value,
                well?.properties?.formula
            ]
                .filter(Boolean)
                .join(' | ')
                .toLowerCase();
        }

        function distinctGroupValues(groupObj) {

            const GENERIC = new Set(['unknown', 'na', 'n/a', '-', '']);
            const vals = Object.values(groupObj || {}).map(v => String(v ?? '').trim());
            const out = [];
            const seen = new Set();
            for (const v of vals) {
                const vv = v.toLowerCase();
                if (!GENERIC.has(vv) && !seen.has(vv)) {
                    out.push(v);
                    seen.add(vv);
                }
            }
            return out;
        }

        function assignReplicateColorsFuzzy(replicateGroups, plate, opts = {}) {
            const { minScore = 1, verbose = true } = opts;

            if (!replicateGroups || replicateGroups.length === 0) {
                if (verbose) console.warn('No replicateGroups provided.');
                return;
            }
            const cols = Array.isArray(plate?.wells) ? plate.wells.length : 0;
            const rows = cols > 0 && Array.isArray(plate.wells[0]) ? plate.wells[0].length : 0;
            if (cols === 0 || rows === 0) {
                if (verbose) console.warn('Plate wells grid is empty or malformed.');
                return;
            }

            const groups = replicateGroups.map((g, i) => {
                const key = canonicalKey(g);
                return {
                    idx: i,
                    obj: g,
                    key,
                    color: hashToColor(key),
                    tokens: distinctGroupValues(g).map(s => s.toLowerCase())
                };
            });

            let colored = 0;
            const sampleMisses = [];

            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const well = plate.wells[c]?.[r];
                    if (!well) continue;

                    const text = collectWellText(well);

                    let best = null;
                    for (const g of groups) {
                        if (g.tokens.length === 0) continue;
                        let score = 0;
                        for (const t of g.tokens) {
                            if (t && text.includes(t)) score++;
                        }
                        if (score > 0) {
                            if (!best || score > best.score || (score === best.score && g.idx < best.group.idx)) {
                                best = { score, group: g };
                            }
                        }
                    }

                    if (best && best.score >= minScore) {
                        well.color = best.group.color;
                        colored++;
                    } else if (verbose && sampleMisses.length < 10) {
                        sampleMisses.push({
                            well: well?.name || `${String.fromCharCode(65 + c)}${r + 1}`,
                            preview: text.slice(0, 120),
                        });
                    }
                }
            }

            if (verbose) {
                console.info(`Replicate coloring complete: colored ${colored} wells.`);
                if (colored === 0) {
                    console.warn('No wells were colored. Here are a few examples that failed to match:');
                    console.table(sampleMisses);
                    console.warn(
                        'Tips:\n' +
                        '- Ensure at least ONE distinctive group value appears in a well’s label/value/formula.\n' +
                        '- Consider excluding very common values (we already ignore UNKNOWN/NA).\n' +
                        '- If your well text contains only a subset (e.g., only a sample id), that will still score and color.\n' +
                        '- You can lower the minimum score by calling with {minScore: 1}.'
                    );
                }
            }
        }

        let menuList = [
            {
                label: "New table...", click: async (xwc, ywc) => {
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', paint_panel);

                    let m = null;
                    do {
                        let va = await prompt("Enter a valid Name (only alphanumeric characters)", ["Name"], { "Name": '' }, 300, 350);
                        m = va['Name'];
                    }
                    while (!m || !/^[A-Za-z][A-Za-z0-9_]*$/.test(m));
                    let index = 0;

                    setTimeout(async () => {
                        pt.setMessage(" Reading clipboard ")
                        let table = await exec('baja/plate/data/data-table-parser.js', text)
                        for (let t of table) {
                            if (index > 0)
                                t.setName(m + index)
                            else
                                t.setName(m);
                            t.plateType = 'data'
                            t.removeEmptyRowsAndColumns()
                            t.grid.rescale();
                            pt.grid.rescale();

                            if (t.rescaleDimensions) {
                                t.rescaleDimensions(pt)
                            }

                            pt.addNextAvailablePlates([t])
                            pt.zoomintoplate(t);
                            pt.setMessage(" Loaded ")

                            index++;
                        }

                    }, 200)

                }
            },

        ]

        if (pt.root && pt.root.length > 0) {

            menuList.push({
                label: "Append table...", click: async (xwc, ywc) => {
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', paint_panel);
                    let tableList = []
                    for (let table of pt.root) {
                        tableList.push(
                            {
                                label: `${table.name}`, click: async (xwc, ywc) => {
                                    pt.setSelected(pt.getTableByName(table.name))

                                    let olist = [
                                        {
                                            label: `Append data to table ${table.name} as columns (right side)`, click: async (xwc, ywc) => {

                                                let { rows, columns, data } = detectTableFormat(text)
                                                let appendIndicies = []
                                                let textColumns = []
                                                for (let i = 0; i < columns; i++) {
                                                    appendIndicies.push(table.grid.xmax)
                                                    table.insertCol(table.grid.xmax++)

                                                    table.setValuesInOrderAndOverwrite(data[i], table.grid.xmax - 1)
                                                    pt.deselectAll();

                                                }
                                                CurrentLayout.reset('mainPanel')

                                            }
                                        },

                                        {
                                            label: `Append data to ${table.name} table top rows`, click: async (xwc, ywc) => {

                                                let { rows, columns, data } = detectTableFormat(text)

                                                table.insertRow(rows.length)

                                                for (let i = 0; i < columns; i++) {
                                                    if (i >= table.grid.xmax) {
                                                        setTimeout(() => {
                                                            pt.setMessage("Pasted data has more columns than the table... ")

                                                        }, 2000)
                                                        break;
                                                    }
                                                    for (let v = 0; v < data[i].length; v++) {
                                                        table.wells[i][v].value = data[i][v]
                                                    }
                                                }
                                                CurrentLayout.reset('mainPanel')
                                            }
                                        },
                                        {
                                            label: `Append data to ${table.name} table as bottom rows`, click: async (xwc, ywc) => {

                                                let { rows, columns, data } = detectTableFormat(text)

                                                for (let i = 0; i < columns; i++) {

                                                    if (i >= table.grid.xmax) {
                                                        setTimeout(() => {
                                                            pt.setMessage("Pasted data has more columns than the table... ")

                                                        }, 2000)
                                                        break;
                                                    }
                                                    for (let v = 0; v < data[i].length; v++) {
                                                        table.appendColumn(data[i][v], i)
                                                    }
                                                }
                                                CurrentLayout.reset('mainPanel')

                                            }
                                        },
                                        {
                                            label: `Add columns to table ${table.name} (left).`, click: async (xwc, ywc) => {

                                                let { rows, columns, data } = detectTableFormat(text)

                                                for (let i = 0; i < columns; i++) {
                                                    table.insertCol(i)
                                                    table.setValuesInOrderAndOverwrite(data[i], i)
                                                }
                                                CurrentLayout.reset('mainPanel')

                                            }
                                        }
                                    ]

                                    olist.push({
                                        label: "Join tables by value...", click: async (xwc, ywc) => {

                                            function parseTableArray(input) {
                                                return input
                                                    .split('\n')
                                                    .map(row => {

                                                        let leadingDelimiters = row.match(/^([\t,]+)/);
                                                        let result = [];

                                                        if (leadingDelimiters) {
                                                            let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                                            for (let i = 0; i < emptyCells; i++) {
                                                                result.push('');
                                                            }
                                                            row = row.slice(leadingDelimiters[0].length);
                                                        }

                                                        let cells = row.split(/[\t,]+/);
                                                        result = result.concat(cells.map(cell => cell.trim()));

                                                        return result;
                                                    });
                                            }
                                            let text = await navigator.clipboard.readText();
                                            let parsedData = parseTableArray(text);

                                            function jsonToTabDelimitedTable(jsonData) {

                                                const filteredData = jsonData.filter(row => row.length > 1);

                                                const tableRows = filteredData.map(row => row.join("\t"));

                                                return tableRows.join("\n");
                                            }
                                            const tname = []
                                            for (let p = 0; p < parsedData[0].length; p++) {
                                                tname.push('#' + p + ":" + parsedData[0][p] + '...')
                                            }

                                            const dname = []
                                            for (let p = 0; p < pt.selectedPlate.wells.length; p++) {
                                                dname.push('#' + (p) + ": Value:" + pt.selectedPlate.wells[p][0].value + '...')
                                            }

                                            let selectionpanel = null;
                                            const selectPanel = createIon((pa) => {
                                                selectionpanel = pa;
                                            })
                                            let selectionpanel2 = null;
                                            const selectPanel2 = createIon((pa) => {
                                                selectionpanel2 = pa;
                                            })

                                            let zoom_to = {
                                                wid: 'card',
                                                componentRef: 'bottomPanel',
                                                data: {
                                                    height: '800px',
                                                    cards: [
                                                        [
                                                            {
                                                                'title': 'Choose the join column in your pasted text.',
                                                                width: '100%',

                                                                'body': ` `, 'component':
                                                                {
                                                                    wid: 'selection-list',
                                                                    width: '100%',
                                                                    refCallback: selectPanel,
                                                                    data: {
                                                                        listItems: tname
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                'title': 'Choose the join column in your destination table.',
                                                                width: '100%',

                                                                'body': ` `, 'component':
                                                                {
                                                                    wid: 'selection-list',
                                                                    width: '100%',
                                                                    refCallback: selectPanel2,
                                                                    data: {
                                                                        listItems: dname
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                'title': '',
                                                                'width': '100%',
                                                                'component': {
                                                                    wid: 'mt-button', data: {
                                                                        buttons: [
                                                                            {
                                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                                    hideAllModal();
                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                    CurrentLayout.setComponent('mainPanel', paint_panel);

                                                                                })
                                                                            },
                                                                            {
                                                                                label: 'Join', ionFunction: createIonFunction(() => {
                                                                                    setTimeout(() => {

                                                                                        function parseIntegerFromString(input) {
                                                                                            const match = input.match(/^#(\d+)/);
                                                                                            if (match) {
                                                                                                return parseInt(match[1], 10);
                                                                                            }
                                                                                            return null;
                                                                                        }

                                                                                        let ptext = selectionpanel.selectedItems[0]
                                                                                        let dtext = selectionpanel2.selectedItems[0]

                                                                                        let pi = parseIntegerFromString(ptext)
                                                                                        let di = parseIntegerFromString(dtext)

                                                                                        setTimeout(() => {

                                                                                            pt.pasteAndJoinOnValueColumn(pi, di)

                                                                                        }, 2000)
                                                                                    }, 100)
                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                    CurrentLayout.setComponent('mainPanel', paint_panel);

                                                                                })
                                                                            }
                                                                        ]
                                                                    }
                                                                }
                                                            }
                                                        ]]
                                                }
                                            }

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', zoom_to);

                                        }
                                    })

                                    olist.push({
                                        label: "Join tables by cell address...", click: async (xwc, ywc) => {

                                            function parseTableArray(input) {
                                                return input
                                                    .split('\n')
                                                    .map(row => {

                                                        let leadingDelimiters = row.match(/^([\t,]+)/);
                                                        let result = [];

                                                        if (leadingDelimiters) {
                                                            let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                                            for (let i = 0; i < emptyCells; i++) {
                                                                result.push('');
                                                            }
                                                            row = row.slice(leadingDelimiters[0].length);
                                                        }

                                                        let cells = row.split(/[\t,]+/);
                                                        result = result.concat(cells.map(cell => cell.trim()));

                                                        return result;
                                                    });
                                            }
                                            let text = await navigator.clipboard.readText();
                                            let parsedData = parseTableArray(text);

                                            function jsonToTabDelimitedTable(jsonData) {

                                                const filteredData = jsonData.filter(row => row.length > 1);

                                                const tableRows = filteredData.map(row => row.join("\t"));

                                                return tableRows.join("\n");
                                            }
                                            const tname = []
                                            for (let p = 0; p < parsedData[0].length; p++) {
                                                tname.push('#' + p + ":" + parsedData[0][p] + '...')
                                            }

                                            const dname = []
                                            for (let p = 0; p < pt.selectedPlate.wells.length; p++) {
                                                dname.push('#' + (p) + ": Value:" + pt.selectedPlate.wells[p][0].value + ', Address:' + pt.selectedPlate.wells[p][0].position + '...')
                                            }

                                            let selectionpanel = null;
                                            const selectPanel = createIon((pa) => {
                                                selectionpanel = pa;
                                            })
                                            let selectionpanel2 = null;
                                            const selectPanel2 = createIon((pa) => {
                                                selectionpanel2 = pa;
                                            })

                                            let zoom_to = {
                                                wid: 'card',
                                                componentRef: 'bottomPanel',
                                                data: {
                                                    height: '800px',
                                                    cards: [
                                                        [
                                                            {
                                                                'title': 'Choose the address column in your pasted text.',
                                                                width: '100%',

                                                                'body': ` `, 'component':
                                                                {
                                                                    wid: 'selection-list',
                                                                    width: '100%',
                                                                    refCallback: selectPanel,
                                                                    data: {
                                                                        listItems: tname
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                'title': 'Choose the column in your destination table.',
                                                                width: '100%',

                                                                'body': ` `, 'component':
                                                                {
                                                                    wid: 'selection-list',
                                                                    width: '100%',
                                                                    refCallback: selectPanel2,
                                                                    data: {
                                                                        listItems: dname
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                'title': '',
                                                                'width': '100%',
                                                                'component': {
                                                                    wid: 'mt-button', data: {
                                                                        buttons: [
                                                                            {
                                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                                    hideAllModal();
                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                    CurrentLayout.setComponent('mainPanel', paint_panel);

                                                                                })
                                                                            },
                                                                            {
                                                                                label: 'Join', ionFunction: createIonFunction(() => {
                                                                                    setTimeout(() => {

                                                                                        function parseIntegerFromString(input) {
                                                                                            const match = input.match(/^#(\d+)/);
                                                                                            if (match) {
                                                                                                return parseInt(match[1], 10);
                                                                                            }
                                                                                            return null;
                                                                                        }

                                                                                        let ptext = selectionpanel.selectedItems[0]
                                                                                        let dtext = selectionpanel2.selectedItems[0]

                                                                                        let pi = parseIntegerFromString(ptext)
                                                                                        let di = parseIntegerFromString(dtext)

                                                                                        setTimeout(() => {

                                                                                            pt.pasteAndJoinOnAddressColumn(pi, di)

                                                                                        }, 2000)
                                                                                    }, 100)
                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                    CurrentLayout.setComponent('mainPanel', paint_panel);

                                                                                })
                                                                            }
                                                                        ]
                                                                    }
                                                                }
                                                            }
                                                        ]]
                                                }
                                            }

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', zoom_to);

                                        }
                                    })

                                    exec('flexigraph/window-menu.js', olist, paint_panel)

                                }
                            })
                    }
                    exec('flexigraph/window-menu.js', tableList, paint_panel, '<h3> Select a table </h3>')
                }
            })
            menuList.push({
                label: "Import into table...", click: async (xwc, ywc) => {
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', paint_panel);
                    let t = pt.selectedPlate
                    let val = await exec('py/import-data/map-columns.py', t.toValueFormulaJSON(), text)
                    importToPlateValue(val, t, text)
                    showModal({
                        wid: 'json',
                        data: JSON.stringify(val)
                    })
                }
            })

        }

        if (pt && pt.selectedPlate && pt.selectedPlate.selectedWells) {
            menuList.push({
                label: "Paste into selected cells...", click: async (xwc, ywc) => {

                    let mlist = [
                        {
                            label: "Overwrite", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);
                                setTimeout(async () => {
                                    await pt.pasteIntoSelectedWells(text)
                                }, 500)
                                pt.wb(null)
                            }
                        },
                        {
                            label: "Prepend to existing content", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);
                                setTimeout(async () => {
                                    await pt.pastePrependIntoSelectedWells(text)
                                }, 500)
                                pt.wb(null)
                            }
                        }, {
                            label: "Prepend to existing content but insert text between...", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);
                                let va = await prompt("Text to insert between pasted values", ["Txt"], { "Txt": '' }, 300, 300);
                                let m = va['Txt'];
                                setTimeout(async () => {
                                    console.log('debubg');
                                    await pt.pastePrependIntoSelectedWells(text, m)
                                }, 500)
                                pt.wb(null)
                            }
                        },
                        {
                            label: "Append to existing content", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);

                            }
                        },

                        {
                            label: "Paste as cell address", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);
                                setTimeout(async () => {

                                    console.log('debubg');

                                    let plate = pt.selectedPlate;
                                    if (plate) {
                                        pushHistory(HM(plate))
                                        let se = plate.getSelectedWellsInOrder()
                                        const text = await navigator.clipboard.readText();

                                        if (text.startsWith('[{')) {
                                            let js = JSON.parse(text)
                                            let se_len = js.length;
                                            for (let i = 0; i < se_len; i++) {
                                                if (i < se.length) {
                                                    se[i].position = (js[i].value)
                                                }

                                            }
                                            this.deselectAll();
                                            pt.wb(null)
                                        } else {
                                            await pt.pasteIntoSelectedWellsASAddresses();
                                        }
                                    }

                                }, 1000)
                            }
                        },

                        {
                            label: "Paste values into matched addresses", click: async (xwc, ywc) => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', paint_panel);
                                setTimeout(() => {
                                    pt.pasteIntoSelectedWellsMatchAddresses()
                                }, 1000)
                            }
                        },

                    ]
                    exec('flexigraph/window-menu.js', mlist, paint_panel)
                }
            })

        } else if (pt && pt.selectedPlate) {

        }
        if (pt && pt.selectedPlate && pt.selectedPlate.selectedWells) {
            menuList.push({
                label: "Paste values as tags...", click: async (xwc, ywc) => {
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', paint_panel);
                    setTimeout(async () => {
                        await pt.pasteValuesasTagsSelectedWells()
                    }, 1000)
                    pt.wb(null)
                }
            })

        }

        exec('flexigraph/window-menu.js', menuList, paint_panel)

    })

}

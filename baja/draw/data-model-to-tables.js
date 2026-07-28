function (platetrack) {
    return new Promise(async (resolve, reject) => {
        try {

            const Plate = await exec('baja/plate/plate.js');
            const GenericWell = await exec('baja/plate/well.js');

            function parseJsonWithoutComments(jsonWithComments) {
                if (typeof jsonWithComments !== 'string') throw new Error('Input must be a string');
                const withoutComments = jsonWithComments
                    .replace(/(^|\s)\/\/.*$/gm, '')
                    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")|\/\/.*$/gm, '$1')
                    .trim();
                return JSON.parse(withoutComments);
            }

            function safeHas(arr, i) { return Array.isArray(arr) && i >= 0 && i < arr.length && arr[i] != null; }

            function ensureColumnWithHeader(plate, headerLabel) {
                if (!plate || !Array.isArray(plate.wells)) return 0;
                const topRow = 0;
                for (let c = 0; c < plate.wells.length; c++) {
                    if (safeHas(plate.wells, c) && safeHas(plate.wells[c], topRow)) {
                        if (plate.wells[c][topRow] && plate.wells[c][topRow].value === headerLabel) return c;
                    }
                }
                const newColIndex = plate.wells.length;
                if (typeof plate.insertCol === 'function') plate.insertCol(newColIndex);
                if (!safeHas(plate.wells, newColIndex)) plate.wells[newColIndex] = [];
                if (!safeHas(plate.wells[newColIndex], topRow)) plate.wells[newColIndex][topRow] = new GenericWell(`${String.fromCharCode(65 + newColIndex)}${topRow + 1}`);
                plate.wells[newColIndex][topRow].value = headerLabel;
                return newColIndex;
            }

            function ensureRowWithLabel(plate, labelValue) {
                if (!plate || !Array.isArray(plate.wells) || !safeHas(plate.wells, 0)) return 0;
                const leftCol = 0;
                for (let r = 0; r < plate.wells[leftCol].length; r++) {
                    if (safeHas(plate.wells[leftCol], r) && plate.wells[leftCol][r] && plate.wells[leftCol][r].value === labelValue) return r;
                }
                const newRowIndex = plate.wells[leftCol].length;
                if (typeof plate.insertRow === 'function') plate.insertRow(newRowIndex);
                if (!safeHas(plate.wells[leftCol], newRowIndex)) plate.wells[leftCol][newRowIndex] = new GenericWell(`${String.fromCharCode(65 + leftCol)}${newRowIndex + 1}`);
                plate.wells[leftCol][newRowIndex].value = labelValue;
                return newRowIndex;
            }

            const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);

            function createPlatesFromFormulas(jsonString, platetrack) {
                function getPlate(name) { return platetrack.root.find(p => p.name === name) || null; }

                function initWells(plate, xmax, ymax) {
                    plate.wells = [];
                    for (let col = 0; col < xmax; col++) {
                        plate.wells[col] = [];
                        for (let row = 0; row < ymax; row++) {
                            plate.wells[col][row] = new GenericWell(`${String.fromCharCode(65 + col)}${row + 1}`);
                        }
                    }
                }

                function ensurePlate(name, xmaxHint = 1, ymaxHint = 1, createdOut) {
                    let p = getPlate(name);
                    if (p) return p;
                    const plate = new Plate(name, 1, 1);
                    plate.last_touched = new Date();

                    if (platetrack && platetrack.grid && typeof platetrack.grid.worldWidth === 'function') {
                        plate.grid.width = platetrack.grid.worldWidth(platetrack.grid.width - platetrack.grid.width * 0.2);
                        plate.grid.height = platetrack.grid.worldHeight(platetrack.grid.height - platetrack.grid.height * 0.2);
                        plate.grid.yi = platetrack.grid.Ywc(100) - plate.grid.height;
                    }
                    plate.grid.xmin = 0; plate.grid.ymin = 0; plate.grid.xmax = xmaxHint; plate.grid.ymax = ymaxHint;
                    if (plate.grid && typeof plate.grid.rescale === 'function') plate.grid.rescale();
                    initWells(plate, plate.grid.xmax, plate.grid.ymax);
                    if (typeof plate.completeNullValues === 'function') plate.completeNullValues();

                    if ( !platetrack.root )
                        platetrack.root = []
                    platetrack.root.push(plate);
                    if (createdOut) createdOut.push(plate);
                    return plate;
                }

                function isIntegerRangeReference(str) { return /^[a-zA-Z_][a-zA-Z0-9_]*\[\d+(?::\d+)?\]\[\d+(?::\d+)?\]$/.test(String(str).trim()); }
                function extractKeysFromReference(refString) { const m = String(refString).match(/^[a-zA-Z_][a-zA-Z0-9_]*\[(.+?)\]$/); return m ? m[1].split(',').map(k => k.trim()) : []; }
                function extractTableName(refString) { const m = String(refString).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(.+?)\]$/); return m ? m[1] : null; }
                function isFormula(str) {
                    const t = String(str).trim();
                    if (/^[a-zA-Z\s\-]+$/.test(t) && /\s/.test(t)) return false;
                    if (/^[=+\-*/^$!()]/.test(t)) return true;
                    if (/(?:^|\b)(sum|max|min|avg|mean|count)(?:\b|\()/i.test(t)) return true;
                    if (/\w+\[[^\]]+\]/.test(t)) return true;
                    if (/(?:\w|\])\s*[+\-*/^]\s*(?:\w|\[)/.test(t)) return true;
                    return false;
                }
                function isNumericString(str) { const t = typeof str === 'number' ? String(str) : String(str || '').trim(); if (!t) return false; const n = parseFloat(t); return Number.isFinite(n); }

                const formulaMap = parseJsonWithoutComments(jsonString);
                const allTableNames = new Set();
                const outputTableNames = new Set();
                const maxGridSizes = {};
                const created = [];
                const touched = new Set();

                for (const key in formulaMap) {
                    const value = formulaMap[key];
                    if (typeof value !== 'string') continue;
                    const m = key.match(/^(\w+)\[(\d+(?::\d+)?)\]\[(\d+(?::\d+)?)\]$/);
                    if (!m) continue;
                    const [, name, colRef, rowRef] = m;
                    const [cs, ce] = colRef.split(':').map(n => parseInt(n));
                    const [rs, re] = rowRef.split(':').map(n => parseInt(n));
                    outputTableNames.add(name);
                    if (!maxGridSizes[name]) maxGridSizes[name] = { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
                    maxGridSizes[name].xmin = Math.min(maxGridSizes[name].xmin, cs);
                    maxGridSizes[name].xmax = Math.max(maxGridSizes[name].xmax, (Number.isFinite(ce) ? ce : cs) + 1);
                    maxGridSizes[name].ymin = Math.min(maxGridSizes[name].ymin, rs);
                    maxGridSizes[name].ymax = Math.max(maxGridSizes[name].ymax, (Number.isFinite(re) ? re : rs) + 1);
                }

                for (const key in formulaMap) {
                    const val = formulaMap[key];
                    if (typeof val !== 'string') continue;
                    try {
                        const refs = [...val.matchAll(/(\w+)\[([^\]]+)\]/g)];
                        for (const m of refs) {
                            const table = m[1];
                            const indices = m[2].split(',');
                            allTableNames.add(table);
                            if (!outputTableNames.has(table)) {
                                if (!maxGridSizes[table]) maxGridSizes[table] = { xmin: 0, xmax: 1, ymin: 0, ymax: 1 };
                                if (indices.length === 2) {
                                    const [ci, ri] = indices.map(x => parseInt(x));
                                    if (Number.isFinite(ci)) {
                                        maxGridSizes[table].xmin = Math.min(maxGridSizes[table].xmin, ci);
                                        maxGridSizes[table].xmax = Math.max(maxGridSizes[table].xmax, ci + 1);
                                    }
                                    if (Number.isFinite(ri)) {
                                        maxGridSizes[table].ymin = Math.min(maxGridSizes[table].ymin, ri);
                                        maxGridSizes[table].ymax = Math.max(maxGridSizes[table].ymax, ri + 1);
                                    }
                                }
                            }
                        }
                    } catch (e) {  }
                }

                for (const key in formulaMap) {
                    const formula = formulaMap[key];
                    if (typeof formula !== 'string') continue;

                    if (/^(\w+)\[(\d+(?::\d+)?)\]\[(\d+(?::\d+)?)\]$/.test(key)) {
                        const [, name] = key.match(/^(\w+)\[/) || [];
                        const xmax = maxGridSizes[name]?.xmax || 1;
                        const ymax = maxGridSizes[name]?.ymax || 1;
                        const plate = ensurePlate(name, xmax, ymax, created);
                        touched.add(plate);

                        const tagMatches = String(formula).match(/(\w+)\([^)]*\)|((\w+)\[([^,\]]+),([^\]]+)\])/g);
                        const pairs = String(formula).match(/(\w+)\[([^,\]]+),([^\]]+)\]/g) || [];
                        for (const tag of pairs) {
                            const m = tag.match(/^(\w+)\[([^,\]]+),([^\]]+)\]$/);
                            if (!m) continue;
                            const [, tagTable, headerRaw, rowLabelRaw] = m;
                            const header = headerRaw.trim();
                            const rowLabel = rowLabelRaw.trim();
                            const targetPlateName = outputTableNames.has(tagTable) ? tagTable : `${tagTable}`;
                            const txmax = maxGridSizes[tagTable]?.xmax || 5;
                            const tymax = maxGridSizes[tagTable]?.ymax || 5;
                            const targetPlate = ensurePlate(targetPlateName, txmax, tymax, created);
                            const colIndex = ensureColumnWithHeader(targetPlate, header);
                            const rowIndex = ensureRowWithLabel(targetPlate, rowLabel);
                            if (!safeHas(targetPlate.wells, colIndex)) targetPlate.wells[colIndex] = [];
                            if (!safeHas(targetPlate.wells[colIndex], rowIndex)) targetPlate.wells[colIndex][rowIndex] = new GenericWell(`${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`);
                            if (targetPlate.wells[colIndex][rowIndex].value == null) targetPlate.wells[colIndex][rowIndex].value = '';
                            touched.add(targetPlate);
                        }
                    } else {
                        const name = extractTableName(key);
                        if (!name) continue;
                        const xmax = maxGridSizes[name]?.xmax || 1;
                        const ymax = maxGridSizes[name]?.ymax || 1;
                        const plate = ensurePlate(name, xmax, ymax, created);
                        touched.add(plate);

                        const pairs = String(formula).match(/(\w+)\[([^,\]]+),([^\]]+)\]/g) || [];
                        for (const tag of pairs) {
                            const m = tag.match(/^(\w+)\[([^,\]]+),([^\]]+)\]$/);
                            if (!m) continue;
                            const [, tagTable, headerRaw, rowLabelRaw] = m;
                            const header = headerRaw.trim();
                            const rowLabel = rowLabelRaw.trim();
                            const targetPlateName = outputTableNames.has(tagTable) ? tagTable : `${tagTable}`;
                            const txmax = maxGridSizes[tagTable]?.xmax || 5;
                            const tymax = maxGridSizes[tagTable]?.ymax || 5;
                            const targetPlate = ensurePlate(targetPlateName, txmax, tymax, created);
                            const colIndex = ensureColumnWithHeader(targetPlate, header);
                            const rowIndex = ensureRowWithLabel(targetPlate, rowLabel);
                            if (!safeHas(targetPlate.wells, colIndex)) targetPlate.wells[colIndex] = [];
                            if (!safeHas(targetPlate.wells[colIndex], rowIndex)) targetPlate.wells[colIndex][rowIndex] = new GenericWell(`${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`);
                            if (targetPlate.wells[colIndex][rowIndex].value == null) targetPlate.wells[colIndex][rowIndex].value = '';
                            touched.add(targetPlate);
                        }

                        const flat = String(formula).match(/(\w+)\[([^,:\]]+)\]/g) || [];
                        for (const tag of flat) {
                            const m = tag.match(/^(\w+)\[([^,:\]]+)\]$/);
                            if (!m) continue;
                            const [, tagTable, header] = m;
                            if (header.includes(':') || header.includes(',') || header.includes('row$')) continue;
                            const targetPlateName = outputTableNames.has(tagTable) ? tagTable : `${tagTable}`;
                            const txmax = maxGridSizes[tagTable]?.xmax || 5;
                            const tymax = maxGridSizes[tagTable]?.ymax || 5;
                            const targetPlate = ensurePlate(targetPlateName, txmax, tymax, created);
                            ensureColumnWithHeader(targetPlate, header);
                            touched.add(targetPlate);
                        }
                    }
                }

                for (const key in formulaMap) {
                    const formula = formulaMap[key];
                    const name = extractTableName(key);
                    const plate = name ? platetrack.root.find(p => p.name === name) : null;
                    if (plate && typeof plate.applycolumnheaders === 'function') plate.applycolumnheaders();
                    if (plate && typeof plate.applyrowheaders === 'function') plate.applyrowheaders();

                    if (!isIntegerRangeReference(key)) {
                        if (!plate) continue;
                        const keys = extractKeysFromReference(key);
                        if (isNumericString(formula)) {
                            let wells = plate.getWellsByTags(keys);
                            let str = plate.getWellRange(wells);
                            if (str === '[No_Selection]' && keys.length === 1) {
                                if (typeof plate.addColumn === 'function') plate.addColumn();
                                if (plate.getLastRow && plate.getLastRow() === 0 && typeof plate.addRow === 'function') plate.addRow();
                                const _header_well = plate.getWellByIndex(plate.getLastColumn(), 0);
                                _header_well.setValue(keys[0]);
                                if (typeof plate.applycolumnheaders === 'function') plate.applycolumnheaders();
                                wells = plate.getWellsByTags(keys);
                                str = plate.getWellRange(wells);
                            }
                            for (const w of wells) w.setValue(Number(formula));
                        } else if (typeof formula === 'string' && isFormula(formula)) {
                            let wells = plate.getWellsByTags(keys);
                            let str = plate.getWellRange(wells);
                            if (str === '[No_Selection]' && keys.length === 1) {
                                if (typeof plate.addColumn === 'function') plate.addColumn();
                                if (plate.getLastRow && plate.getLastRow() === 0 && typeof plate.addRow === 'function') plate.addRow();
                                const _header_well = plate.getWellByIndex(plate.getLastColumn(), 0);
                                _header_well.setValue(keys[0]);
                                if (typeof plate.applycolumnheaders === 'function') plate.applycolumnheaders();
                                wells = plate.getWellsByTags(keys);
                                str = plate.getWellRange(wells);
                            }
                            if (!plate.formula) plate.formula = {};
                            plate.formula[str] = formula;
                        } else {
                            let wells = plate.getWellsByTags(keys);
                            if ((!wells || wells.length === 0) && keys.length === 1) {
                                if (typeof plate.addColumn === 'function') plate.addColumn();
                                if (plate.getLastRow && plate.getLastRow() === 0 && typeof plate.addRow === 'function') plate.addRow();
                                const _header_well = plate.getWellByIndex(plate.getLastColumn(), 0);
                                _header_well.setValue(keys[0]);
                                if (typeof plate.applycolumnheaders === 'function') plate.applycolumnheaders();
                                wells = plate.getWellsByTags(keys);
                            }
                            for (const w of wells) {
                                const numVal = parseFloat(formula);
                                w.value = Number.isFinite(numVal) ? numVal : formula;
                            }
                        }
                    } else {
                        const m = key.match(/^(\w+)\[(\d+(?::\d+)?)\]\[(\d+(?::\d+)?)\]$/);
                        if (!m) continue;
                        const [, rangeName, colRef, rowRef] = m;
                        const rPlate = platetrack.root.find(p => p.name === rangeName);
                        if (!rPlate) continue;
                        if (typeof formula === 'string' && isFormula(formula)) {
                            if (!rPlate.formula) rPlate.formula = {};
                            rPlate.formula[`[${colRef}][${rowRef}]`] = formula;
                        } else {
                            const wells = rPlate.getWellsByString(`[${colRef}][${rowRef}]`);
                            for (const w of wells) {
                                const numVal = parseFloat(formula);
                                w.value = Number.isFinite(numVal) ? numVal : formula;
                            }
                        }
                    }
                }

                for (const table of allTableNames) {
                    if (!outputTableNames.has(table) && !platetrack.root.find(p => p.name === table)) {
                        const xmax = maxGridSizes[table]?.xmax || 1;
                        const ymax = maxGridSizes[table]?.ymax || 1;
                        ensurePlate(table, xmax, ymax, created);
                    }
                }

                const WELL_SCREEN_WIDTH = 150;
                const WELL_SCREEN_HEIGHT = 12;
                const PADDING_X = 20;
                const PADDING_Y = 20;

                for (const p of [...platetrack.root]) {
                    if (p.getLastRow && p.getLastColumn && p.getLastRow() > 1 && p.getLastColumn() > 1 && typeof p.removeEmptyRowsAndColumns === 'function') {
                        p.removeEmptyRowsAndColumns();
                    }
                }

                const screenCenterX = platetrack.grid.width / 2;
                const screenCenterY = platetrack.grid.height / 2;
                let currentX = screenCenterX;
                let currentY = screenCenterY;
                let rowMaxHeight = 0;
                let rowStartX = screenCenterX;
                const screenMaxWidth = platetrack.grid.width - PADDING_X;
                let rowPlates = [];

                for (const plate of [...platetrack.root]) {
                    const numCols = (plate.grid.xmax - plate.grid.xmin) || 1;
                    const numRows = (plate.grid.ymax - plate.grid.ymin) || 1;
                    const gridWidth = platetrack.grid.worldWidth(numCols * WELL_SCREEN_WIDTH);
                    const gridHeight = platetrack.grid.worldHeight(numRows * WELL_SCREEN_HEIGHT);
                    plate.grid.width = gridWidth;
                    plate.grid.height = gridHeight;
                    if (typeof plate.grid.rescale === 'function') plate.grid.rescale();
                    const plateScreenWidth = platetrack.grid.screenWidth(plate.grid.width);
                    const plateScreenHeight = platetrack.grid.screenHeight(plate.grid.height);
                    const nextX = rowStartX + plateScreenWidth + PADDING_X;
                    if (nextX > screenMaxWidth && rowPlates.length > 0) {
                        currentY += rowMaxHeight + PADDING_Y;
                        currentX = screenCenterX;
                        rowStartX = screenCenterX;
                        rowMaxHeight = 0;
                        rowPlates = [];
                    }
                    plate.grid.xi = platetrack.grid.Xwc(currentX);
                    plate.grid.yi = platetrack.grid.Ywc(currentY);
                    currentX += plateScreenWidth + PADDING_X;
                    rowStartX = currentX;
                    rowMaxHeight = Math.max(rowMaxHeight, plateScreenHeight);
                    rowPlates.push(plate);
                }

                return { created, touched: [...touched] };
            }

            let v;
            const export_sequence = {
                wid: 'card',
                componentRef: 'bottomPanel',
                data: {
                    height: '800px',
                    cards: [[
                        {
                            title: 'Enter datamodel in JSON format',
                            width: '100%',
                            component: {
                                wid: 'input-textarea-editor',
                                data: { showButton: false, title: 'ID', ionHookFunction: createIonFunction((input_box) => { v = input_box; }) }
                            }
                        },
                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Save',
                                            ionFunction: createIonFunction(async () => {
                                                try {
                                                    let ct = v.getWidgetValue();
                                                    if (typeof ct === 'string' && ct.indexOf('\n') > 0) ct = ct.trim();
                                                    const value = ct;
                                                    let model = parseJsonWithoutComments(value);

                                                    if ( model.refined)
                                                    {
                                                        model = model.refined;
                                                    }

                                                    if (model && model.tables && model.formulas) {
                                                        await exec('baja/draw/data-model-to-tables-gpt', platetrack, model);
                                                        hideAllModal();
                                                        setTimeout(() => {
                                                            const g = CurrentLayout.getStashed('graph');
                                                            if (g && typeof g.touchMe === 'function') g.touchMe();
                                                            if (platetrack && typeof platetrack.separatePlatesOverTime === 'function') {
                                                                platetrack.separatePlatesOverTime({
                                                                    spacing: 0.0,
                                                                    durationMs: 10_000,
                                                                    iterationsPerFrame: 8,
                                                                    explodeFrac: 0.3,
                                                                    explodeStep: 1,
                                                                    wanderStep: 0.5,
                                                                    jitterReseedRate: 0.25,
                                                                    keepStrictCenter: true,
                                                                });
                                                            }
                                                            if (platetrack && typeof platetrack.updateCalculations === 'function') platetrack.updateCalculations();
                                                        }, 100);
                                                    } else {
                                                        const { created } = createPlatesFromFormulas(value, platetrack);

                                                        for (const r of created) {
                                                            if (typeof r.trim === 'function') r.trim();
                                                            if (typeof r.applycolumnheaders === 'function') r.applycolumnheaders();
                                                            if (typeof r.applyrowheaders === 'function') r.applyrowheaders();
                                                            if (Array.isArray(r.wells)) {
                                                                for (let col = 0; col < r.wells.length; col++) {
                                                                    if (r.wells[col] && r.wells[col][0] && typeof r.wells[col][0].setWellType === 'function') {
                                                                        r.wells[col][0].setWellType('ColumnHeader');
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        showModal({ wid: 'json', data: JSON.stringify({ created: created.map(p => p.name) }) });
                                                        hideAllModal();

                                                    }
                                                } catch (e) {
                                                    showModal({ wid: 'error', data: String(e && e.message ? e.message : e) });
                                                }
                                            })
                                        },
                                        { label: 'Cancel', ionFunction: createIonFunction(() => { hideAllModal(); }) }
                                    ]
                                }
                            }
                        }
                    ]]
                }
            };

            showModal(export_sequence);

            resolve({ ok: true, ui: 'shown' });
        } catch (err) {
            reject(err);
        }
    });
}

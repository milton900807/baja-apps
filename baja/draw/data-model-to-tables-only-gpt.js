function (platetrack, model) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate.js');
        const TransparentPlate = await exec('baja/plate/plate-transparent')
        let GenericWell = await exec('baja/plate/well.js')

        function initWells(plate, xmax, ymax) {
            plate.wells = [];
            for (let col = 0; col < xmax; col++) {
                plate.wells[col] = [];
                for (let row = 0; row < ymax; row++) {
                    plate.wells[col][row] = new GenericWell(`${String.fromCharCode(65 + col)}${row + 1}`);
                }
            }
        }

        function replaceLabel(plates) {
            for (let p of plates) {
                p.wells[0][0].value = p.name
            }
        }

        function normalizeFormulaDefaultIndices(formula, namesSet) {
            if (typeof formula !== 'string' || !formula.trim()) return formula;
            if (!namesSet || namesSet.size === 0) return formula;

            const parts = Array.from(namesSet).sort((a, b) => b.length - a.length)

                .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
            if (parts.length === 0) return formula;

            const re = new RegExp(`\\b(?:${parts.join('|')})\\b(?!\\s*\\[)`, 'g');

            return formula.replace(re, (m) => `${m}[0:0][0:0]`);
        }

        function buildPlatesFromCellMap(spec, platetrack, PlateCtor, WellCtor) {
            PlateCtor = PlateCtor || (typeof Plate !== 'undefined' ? Plate : null);
            WellCtor = WellCtor || (typeof GenericWell !== 'undefined' ? GenericWell : null);

            if (!spec || typeof spec !== 'object' || !spec.tables) return platetrack.root || [];

            function findPlate(name) {
                return (platetrack.root || []).find(p => p && p.name === name) || null;
            }

            function ensurePlate(name, hintCols, hintRows) {
                const p = findPlate(name);
                if (p) return p;

                if (!PlateCtor) throw new Error('Plate constructor not provided');
                const plate = new PlateCtor(name, 1, 1);
                plate.last_touched = new Date();
                plate.wells = plate.wells || [];

                if (plate.grid) {
                    plate.grid.xmin = 0;
                    plate.grid.ymin = 0;
                    plate.grid.xmax = Math.max(1, hintCols || 1);
                    plate.grid.ymax = Math.max(1, hintRows || 1);
                    plate.grid.rescale && plate.grid.rescale();
                }

                const cols = plate.grid && plate.grid.xmax ? plate.grid.xmax : (hintCols || 1);
                const rows = plate.grid && plate.grid.ymax ? plate.grid.ymax : (hintRows || 1);
                for (let c = 0; c < cols; c++) {
                    plate.wells[c] = plate.wells[c] || [];
                    for (let r = 0; r < rows; r++) {
                        if (!plate.wells[c][r]) {
                            const label = String.fromCharCode(65 + c) + (r + 1);
                            plate.wells[c][r] = WellCtor ? new WellCtor(label) : { value: undefined, label };
                        }
                    }
                }

                platetrack.root = platetrack.root || [];
                platetrack.root.push(plate);
                return plate;
            }

            function ensureCols(plate, upToColIdx) {
                plate.wells = plate.wells || [];
                while (plate.wells.length <= upToColIdx) {
                    const c = plate.wells.length;
                    plate.insertCol && plate.insertCol(c);
                    plate.wells[c] = plate.wells[c] || [];
                    if (!plate.wells[c][0]) {
                        const label = String.fromCharCode(65 + c) + '1';
                        plate.wells[c][0] = WellCtor ? new WellCtor(label) : { value: undefined, label };
                    }
                }
            }

            function addRowsUntil(plate, rowIndex) {
                plate.wells = plate.wells || [];
                if (!plate.wells[0]) {
                    plate.insertCol && plate.insertCol(0);
                    plate.wells[0] = [];
                    plate.wells[0][0] = WellCtor ? new WellCtor('A1') : { value: undefined, label: 'A1' };
                }
                if (typeof plate.getLastRow === 'function' && typeof plate.addRow === 'function') {
                    while (plate.getLastRow() < rowIndex) plate.addRow();
                } else {
                    for (let c = 0; c < plate.wells.length; c++) {
                        while ((plate.wells[c] ? plate.wells[c].length : 0) <= rowIndex) {
                            const r = plate.wells[c] ? plate.wells[c].length : 0;
                            plate.wells[c] = plate.wells[c] || [];
                            const label = String.fromCharCode(65 + c) + (r + 1);
                            plate.wells[c][r] = plate.wells[c][r] || (WellCtor ? new WellCtor(label) : { value: undefined, label });
                        }
                    }
                }
            }

            function ensureWell(plate, c, r) {
                ensureCols(plate, c);
                addRowsUntil(plate, r);
                plate.wells[c] = plate.wells[c] || [];
                if (!plate.wells[c][r]) {
                    const label = String.fromCharCode(65 + c) + (r + 1);
                    plate.wells[c][r] = WellCtor ? new WellCtor(label) : { value: undefined, label };
                }
                return plate.wells[c][r];
            }

            function coerceValue(v) {
                if (typeof v === 'number') return v;
                const s = String(v == null ? '' : v).trim();
                if (s === '') return '';
                const n = Number(s);
                return Number.isFinite(n) ? n : v;
            }

            function rescalePlateGrid(plate) {
                if (!plate.grid) return;
                const cols = (plate.wells && plate.wells.length) || 1;
                let rows = 1;
                for (let c = 0; c < cols; c++) {
                    const len = (plate.wells[c] && plate.wells[c].length) || 0;
                    if (len > rows) rows = len;
                }
                plate.grid.xmax = Math.max(plate.grid.xmax || 1, cols);
                plate.grid.ymax = Math.max(plate.grid.ymax || 1, rows);
                plate.grid.rescale && plate.grid.rescale();
            }

            function getLastUsedRow(plate) {
                if (!plate || !plate.wells || plate.wells.length === 0) return -1;

                if (typeof plate.getLastRow === 'function') return plate.getLastRow();
                let last = -1;
                const cols = plate.wells.length;
                for (let c = 0; c < cols; c++) {
                    const col = plate.wells[c] || [];
                    for (let r = col.length - 1; r >= 0; r--) {
                        const w = col[r];

                        const hasVal = w && ('value' in w ? w.value !== undefined && w.value !== '' : true);
                        if (hasVal) {
                            if (r > last) last = r;
                            break;
                        }
                    }

                    if (col.length - 1 > last) last = col.length - 1;
                }
                return last;
            }

            Object.keys(spec.tables).forEach(function (tableName) {
                const cellMap = spec.tables[tableName];

                let maxC = 0, maxR = 0;
                Object.keys(cellMap).forEach(function (key) {
                    const parts = key.split(':');
                    if (parts.length !== 2) return;
                    const c = parseInt(parts[0], 10);
                    const r = parseInt(parts[1], 10);
                    if (Number.isFinite(c) && Number.isFinite(r)) {
                        if (c > maxC) maxC = c;
                        if (r > maxR) maxR = r;
                    }
                });

                const preExisting = !!findPlate(tableName);
                const plate = ensurePlate(tableName, maxC + 1, maxR + 1);

                const appendBase = preExisting ? (getLastUsedRow(plate) + 1) : 0;

                if (spec.annotations && spec.annotations[tableName] != null) {
                    plate.annotation = spec.annotations[tableName];
                }
                if (spec.units && spec.units[tableName] != null) {
                    plate.units = spec.units[tableName];
                }

                Object.keys(cellMap).forEach(function (key) {
                    const parts = key.split(':');
                    if (parts.length !== 2) return;
                    const c = parseInt(parts[0], 10);
                    const r = parseInt(parts[1], 10);
                    if (!Number.isFinite(c) || !Number.isFinite(r)) return;

                    const r2 = r + appendBase;
                    const well = ensureWell(plate, c, r2);
                    const v = coerceValue(cellMap[key]);
                    if (well && typeof well.setValue === 'function') well.setValue(v);
                    else if (well) well.value = v;
                });

                rescalePlateGrid(plate);
                plate.applycolumnheaders && plate.applycolumnheaders();
                plate.applyrowheaders && plate.applyrowheaders();
            });

            (platetrack.root || []).forEach(function (plate) {
                if (plate && plate.removeEmptyRowsAndColumns && plate.getLastRow && plate.getLastColumn) {
                    if (plate.getLastRow() > 0 || plate.getLastColumn() > 0) {
                        plate.removeEmptyRowsAndColumns();
                        rescalePlateGrid(plate);
                    }
                }
            });

            return platetrack.root;
        }

        function buildPlatesFromCellMap_prev(spec, platetrack, PlateCtor, WellCtor) {
            PlateCtor = PlateCtor || (typeof Plate !== 'undefined' ? Plate : null);
            WellCtor = WellCtor || (typeof GenericWell !== 'undefined' ? GenericWell : null);

            if (!spec || typeof spec !== 'object' || !spec.tables) return platetrack.root || [];

            function findPlate(name) {
                return (platetrack.root || []).find(p => p && p.name === name) || null;
            }

            function ensurePlate(name, hintCols, hintRows) {
                var p = findPlate(name);
                if (p) return p;

                if (!PlateCtor) throw new Error('Plate constructor not provided');
                var plate = new PlateCtor(name, 1, 1);
                plate.last_touched = new Date();
                plate.wells = plate.wells || [];

                if (plate.grid) {
                    plate.grid.xmin = 0;
                    plate.grid.ymin = 0;
                    plate.grid.xmax = Math.max(1, hintCols || 1);
                    plate.grid.ymax = Math.max(1, hintRows || 1);
                    plate.grid.rescale && plate.grid.rescale();
                }

                var cols = plate.grid && plate.grid.xmax ? plate.grid.xmax : (hintCols || 1);
                var rows = plate.grid && plate.grid.ymax ? plate.grid.ymax : (hintRows || 1);
                for (var c = 0; c < cols; c++) {
                    plate.wells[c] = plate.wells[c] || [];
                    for (var r = 0; r < rows; r++) {
                        if (!plate.wells[c][r]) {
                            var label = String.fromCharCode(65 + c) + (r + 1);
                            plate.wells[c][r] = WellCtor ? new WellCtor(label) : { value: undefined, label: label };
                        }
                    }
                }

                platetrack.root = platetrack.root || [];
                platetrack.root.push(plate);
                return plate;
            }

            function ensureCols(plate, upToColIdx) {
                plate.wells = plate.wells || [];
                while (plate.wells.length <= upToColIdx) {
                    var c = plate.wells.length;
                    plate.insertCol && plate.insertCol(c);
                    plate.wells[c] = plate.wells[c] || [];
                    if (!plate.wells[c][0]) {
                        var label = String.fromCharCode(65 + c) + '1';
                        plate.wells[c][0] = WellCtor ? new WellCtor(label) : { value: undefined, label: label };
                    }
                }
            }

            function addRowsUntil(plate, rowIndex) {
                plate.wells = plate.wells || [];
                if (!plate.wells[0]) {
                    plate.insertCol && plate.insertCol(0);
                    plate.wells[0] = [];
                    plate.wells[0][0] = WellCtor ? new WellCtor('A1') : { value: undefined, label: 'A1' };
                }
                if (typeof plate.getLastRow === 'function' && typeof plate.addRow === 'function') {
                    while (plate.getLastRow() < rowIndex) plate.addRow();
                } else {
                    for (var c = 0; c < plate.wells.length; c++) {
                        while ((plate.wells[c] ? plate.wells[c].length : 0) <= rowIndex) {
                            var r = plate.wells[c] ? plate.wells[c].length : 0;
                            plate.wells[c] = plate.wells[c] || [];
                            var label = String.fromCharCode(65 + c) + (r + 1);
                            plate.wells[c][r] = plate.wells[c][r] || (WellCtor ? new WellCtor(label) : { value: undefined, label: label });
                        }
                    }
                }
            }

            function ensureWell(plate, c, r) {
                ensureCols(plate, c);
                addRowsUntil(plate, r);
                plate.wells[c] = plate.wells[c] || [];
                if (!plate.wells[c][r]) {
                    var label = String.fromCharCode(65 + c) + (r + 1);
                    plate.wells[c][r] = WellCtor ? new WellCtor(label) : { value: undefined, label: label };
                }
                return plate.wells[c][r];
            }

            function coerceValue(v) {
                if (typeof v === 'number') return v;
                var s = String(v == null ? '' : v).trim();
                if (s === '') return '';
                var n = Number(s);
                return Number.isFinite(n) ? n : v;
            }

            function rescalePlateGrid(plate) {
                if (!plate.grid) return;
                var cols = (plate.wells && plate.wells.length) || 1;
                var rows = 1;
                for (var c = 0; c < cols; c++) {
                    var len = (plate.wells[c] && plate.wells[c].length) || 0;
                    if (len > rows) rows = len;
                }
                plate.grid.xmax = Math.max(plate.grid.xmax || 1, cols);
                plate.grid.ymax = Math.max(plate.grid.ymax || 1, rows);
                plate.grid.rescale && plate.grid.rescale();
            }

            Object.keys(spec.tables).forEach(function (tableName) {
                var cellMap = spec.tables[tableName];

                var maxC = 0, maxR = 0;
                Object.keys(cellMap).forEach(function (key) {
                    var parts = key.split(':');
                    if (parts.length !== 2) return;
                    var c = parseInt(parts[0], 10);
                    var r = parseInt(parts[1], 10);
                    if (Number.isFinite(c) && Number.isFinite(r)) {
                        if (c > maxC) maxC = c;
                        if (r > maxR) maxR = r;
                    }
                });

                var plate = ensurePlate(tableName, maxC + 1, maxR + 1);

                if (spec.annotations && spec.annotations[tableName] != null) {
                    plate.annotation = spec.annotations[tableName];
                }
                if (spec.units && spec.units[tableName] != null) {
                    plate.units = spec.units[tableName];
                }

                Object.keys(cellMap).forEach(function (key) {
                    var parts = key.split(':');
                    if (parts.length !== 2) return;
                    var c = parseInt(parts[0], 10);
                    var r = parseInt(parts[1], 10);
                    if (!Number.isFinite(c) || !Number.isFinite(r)) return;

                    var well = ensureWell(plate, c, r);
                    var v = coerceValue(cellMap[key]);
                    if (well && typeof well.setValue === 'function') well.setValue(v);
                    else if (well) well.value = v;
                });

                rescalePlateGrid(plate);
                plate.applycolumnheaders && plate.applycolumnheaders();
                plate.applyrowheaders && plate.applyrowheaders();
            });

            (platetrack.root || []).forEach(function (plate) {
                if (plate && plate.removeEmptyRowsAndColumns && plate.getLastRow && plate.getLastColumn) {
                    if (plate.getLastRow() > 0 || plate.getLastColumn() > 0) {
                        plate.removeEmptyRowsAndColumns();
                        rescalePlateGrid(plate);
                    }
                }
            });

            return platetrack.root;
        }
        platetrack.root = platetrack.root || [];
        buildPlatesFromCellMap(model, platetrack);

        let units = model.units;
        console.log('debubg');
        function convertUnits(dict) {
            const converted = {};
            for (const [key, value] of Object.entries(dict)) {
                if (value.includes("USD")) {
                    converted[key] = value.replace("USD", "DOLLAR");
                } else if (value === "fraction") {
                    converted[key] = "percent";
                } else {
                    converted[key] = value;
                }
            }
            return converted;
        }
        if (units) {

        }

        for (let pl of platetrack.root) {
            if (pl.getFormula() == null || Object.keys(pl.getFormula()).length <= 0) {
                const plate = Plate.buildPlateFromJSON(pl.toJSON());
                plate.column_widths = [];
                platetrack.replacePlate(pl, plate);

            }
            if (units) {
                let keys = Object.keys(units)
                for (let k of keys) {
                    if (pl.applyWellType)
                        pl.applyWellType(k, keys[k])
                }
            }

        }
        return resolve(model)
    })
}

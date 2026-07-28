function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {

        async function getDistinctGroupValues(groupName, selectedTable, pt, { filterFalsy = true, sort = false } = {}) {
            if (!groupName) throw new Error("groupName required");
            if (!selectedTable || !selectedTable.name) throw new Error("selectedTable.name required");

            const tableName = sanitizeName(selectedTable.name);
            const groupKey = sanitizeName(groupName);

            const expr = `${tableName}[${groupKey}]`;
            const ret = await exec("baja/plate/ops/frun-object", expr, pt);

            const raw = Array.isArray(ret?.results) ? ret.results : [];

            let values = raw.map(v => (v && typeof v === "object" && "value" in v) ? v.value : v);

            if (filterFalsy) {
                values = values.filter(v => v !== null && v !== undefined && v !== "");
            }

            const seen = new Set();
            const distinct = [];
            for (const v of values) {
                const key = String(v);
                if (!seen.has(key)) {
                    seen.add(key);
                    distinct.push(v);
                }
            }

            if (sort) {
                distinct.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            }

            return distinct;
        }

        async function buildAssignmentFormulaFromSelections(
            lhsName,
            selectedTable,
            pt,
            bracketKeys = ["Well", "Sample", "Target", "Cq"],
            condKey = "Target",
            { sort = false, filterFalsy = true } = {}
        ) {
            if (!lhsName) throw new Error("lhsName required");
            if (!selectedTable || !selectedTable.name) throw new Error("selectedTable.name required");

            const quoteIfNeeded = (v) => {
                const s = String(v);

                return /^[A-Za-z0-9_.-]+$/.test(s) ? s : "`" + s.replace(/`/g, "\\`") + "`";
            };

            const tableName = sanitizeName(selectedTable.name);
            const lhs = sanitizeName(lhsName);
            const fieldExpr = `${tableName}[${(condKey)}]`;
            const ret = await exec('baja/plate/ops/frun-object', fieldExpr, pt);
            const raw = Array.isArray(ret?.results) ? ret.results : [];
            let values = raw.map(v => (v && typeof v === 'object' && 'value' in v) ? v.value : v);
            if (filterFalsy) values = values.filter(v => v !== null && v !== undefined && v !== "");
            const seen = new Set();
            const distinct = [];
            for (const v of values) {
                const key = String(v);
                if (!seen.has(key)) {
                    seen.add(key);
                    distinct.push((v));
                }
            }
            if (sort) {
                distinct.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            }

            const pipes = (bracketKeys || [])
                .map(k => `${tableName}[${k}]`)
                .join("|");

            const whereClauses = distinct.map(val => {
                const rhsValue = quoteIfNeeded(val);
                return `where ${condKey} is ${rhsValue}`;
            });

            const sections = whereClauses.map(w => `(${pipes} ${w})`);

            const vfinal = `${lhs}=${sections.join(",")}`;

            return { vfinal, whereClauses };
        }

        if (!pt) {
            pt = CurrentLayout.getStashed('plate-track')
        }

        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')
        async function plotStandard(plate1, pt) {
            let LogGrid = await exec('flexigraph/grid-with-logscales.js')
            const MPlot = await exec('flexigraph/plot')
            const standardGroups = [];

            function generateColorPalette(numColors) {
                const colors = [];
                const hueStep = 360 / numColors;
                for (let i = 0; i < numColors; i++) {
                    const hue = i * hueStep;
                    colors.push(`hsl(${hue}, 70%, 50%)`);
                }
                return colors;
            }
            plate1.wells.forEach(row => {
                row.forEach(well => {
                    if (well.isComputationWell()) {
                        if (well.getGroup("STANDARD") && well.concentration !== null && well.value !== null) {
                            well.selectIt();
                            standardGroups.push(well);
                        }
                    }
                });
            });
            if (standardGroups.length === 0) {
                console.error('No wells found in the "STANDARD" group');
                return;
            }
            let allScatterData = {
                points: []
            };
            const colorPalette = generateColorPalette(standardGroups.length);
            const combinedPlot = new MPlot(allScatterData);
            combinedPlot.x_axis_label = 'Amount'
            combinedPlot.y_axis_label = 'Fluorescence'

            let index = 0;
            const concentrations = standardGroups.map(well => well.concentration);
            const values = standardGroups.map(well => well.value);
            const { slope, intercept, rSquared } = linearRegression(concentrations, values);
            const color = colorPalette[index++];
            const scatterData = {
                points: standardGroups.map(well => ({
                    uid: uuid(),
                    ref: [well.uid],
                    x: well.concentration,
                    y: well.value,
                    name: `${well.concentration}`,
                    color: color
                }))
            };
            allScatterData.points = allScatterData.points.concat(scatterData.points);
            combinedPlot.addLineEquation({
                slope: slope,
                intercept: intercept,
                label: ``,
                color: color,
                rSquared: rSquared
            });

            combinedPlot.type = 'line';
            combinedPlot.name = "Ribogreen";
            const maxX = Math.max(...allScatterData.points.map(p => p.x));
            const maxY = Math.max(...allScatterData.points.map(p => p.y));
            const minY = Math.min(...allScatterData.points.map(p => p.y));

            combinedPlot.name = "Ribogreen";
            combinedPlot.setxmax(maxX);
            combinedPlot.setxmin(0);
            combinedPlot.setymax(maxY);
            combinedPlot.setymin(minY);
            pt.setPlot(combinedPlot, (plate1.grid.xi), plate1.grid.yi - 1)
            return combinedPlot;

        }
        function generateColorPalette(numColors) {
            const colors = [];
            const hueStep = 360 / numColors;
            for (let i = 0; i < numColors; i++) {
                const hue = i * hueStep;
                colors.push(`hsl(${hue}, 70%, 50%)`);
            }
            return colors;
        }
        function alignBxs(topBox, numBelowBoxes, gap = 1) {
            const boxSize = topBox.width;
            const positions = [];
            const totalBelowRowWidth = (boxSize * numBelowBoxes) + (gap * (numBelowBoxes - 1));
            const startX = topBox.xi + (topBox.width - totalBelowRowWidth) / 2;
            const startY = topBox.yi + topBox.height + gap;
            for (let i = 0; i < numBelowBoxes; i++) {
                const x = startX + (boxSize + gap) * i;
                const y = startY;
                positions.push({ x, y, width: boxSize, height: boxSize });
            }
            return positions;
        }
        function linearRegression(x, y) {
            const n = x.length;
            const sumX = x.reduce((sum, xi) => sum + xi, 0);
            const sumY = y.reduce((sum, yi) => sum + yi, 0);
            const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
            const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
            const meanX = sumX / n;
            const meanY = sumY / n;

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = meanY - slope * meanX;

            const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
            const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
            const rSquared = 1 - (ssResidual / ssTotal);

            return { slope, intercept, rSquared };
        }
        function checkUniformColor(wells) {
            if (!wells || wells.length === 0) {
                return null;
            }
            const firstColor = wells[0].color;
            for (let i = 1; i < wells.length; i++) {
                if (wells[i].color !== firstColor) {
                    return null;
                }
            }
            return firstColor;
        }

        let MPlot = await exec('flexigraph/plot.js')

        const ls = {

        }

        ls['Dismiss note'] = async (x, y) => {
            selectedPlate.clearActionGlyphs();
        }

        const ddQQ = async (options) => {
            if (!pt) {
                pt = CurrentLayout.getStashed('plate-track').plateTrack;
            }
            pt.updateCalculations();
            selectedPlate.deselectAll();

            let result = await exec(
                'py/openai/analytics/qpcr-analysis/select-rows.py',
                selectedPlate.toValueFormulaJSON()
            );

            if (result && result.table_structure === "columntargets") {
                if (options && options.myreference) {
                    result.role_headers.reference = options.myreference;
                    result.myreference = options.myreference;
                }
                if (options && options.mytarget) {
                    result.role_headers.target = options.mytarget;
                    result.mytarget = options.mytarget;
                }
                const keys = Object.keys(result.selections || {});
                for (let key of keys) {
                    const s = result.selections[key] || [];
                    for (let select of s) {
                        pt.setGroup(select, key);
                    }
                }
                if (!result.myreference || (Array.isArray(result.myreference) && result.myreference.length <= 0)) {
                    const bm = [];
                    const hdrs = result.headers || [];
                    for (let key of hdrs) {
                        bm.push({
                            label: `${key}`,
                            click: async () => {
                                options = options || {};
                                options.myreference = key;
                                await ddQQ(options);
                            }
                        });
                    }
                    pt.showMenuWithTitle('Select the reference', bm);
                    return;
                }
                if (!result.mytarget || (Array.isArray(result.mytarget) && result.mytarget.length <= 0)) {
                    const bm = [];
                    const hdrs = result.headers || [];
                    for (let key of hdrs) {
                        bm.push({
                            label: `${key}`,
                            click: async () => {
                                options = options || {};
                                options.mytarget = key;
                                await ddQQ(options);
                            }
                        });
                    }
                    pt.showMenuWithTitle('Select the target', bm);
                    return;
                }

                let targetColumn = sanitizeName(result.role_headers.target);
                let referenceColumn = sanitizeName(result.role_headers.reference)
                const wells = result.role_headers.well;
                const sample = result.role_headers.sample;
                const cq_ = result.role_headers.cq;

                selectedPlate.addColumn("dCq");
                selectedPlate.clearActionGlyphs();
                const last = selectedPlate.wells.length - 1;
                let _select = `[${last}:${last}][1:${selectedPlate.grid.ymax - 1}]`;
                selectedPlate.formula[_select] = `${selectedPlate.name}[${targetColumn},row\${i}]-${selectedPlate.name}[${referenceColumn},row\${i}]`;
                pt.updateCalculations();
                await selectedPlate.highlightRowByTag(['mycontrol']);
                pt.zoomToSelectedWells(selectedPlate);
                await selectedPlate.setGroupForHighlightedRows(['mycontrol']);
                pt.deselectAll();

                setTimeout(async () => {
                    const mean_formula = `UTC_MEAN=average(${selectedPlate.name}[mycontrol,dCq])`;
                    let _mean_control = await pt.createPlateFromFormula(mean_formula);
                    let utc_mean_dct = Object.keys(_mean_control.wells[0][1].group)[0]
                    const ddcq = `2^-(${selectedPlate.name}[dCq,row\${i}]-${_mean_control.name}[${utc_mean_dct}])`;
                    selectedPlate.addColumn('ddCq');
                    selectedPlate.formula[`[${selectedPlate.grid.xmax - 1}:${selectedPlate.grid.xmax - 1}][${1}:${selectedPlate.grid.ymax - 1}]`] = ddcq;
                    selectedPlate.updateCalculations(pt)

                    setTimeout(async () => {
                        await selectedPlate.highlightRowByTag(['mycontrol']);
                        await pt.zoomToSelectedWells(selectedPlate);
                        await selectedPlate.setGroupForHighlightedRows(['mycontrol']);
                        selectedPlate.deselectAll();

                        _mean_control.addColumnWithFormula('relative_expression_utc_mean', `average(${selectedPlate.name}[ddCq,mycontrol])`)
                        await _mean_control.updateCalculations(pt)
                        await pt.zoomintoplate(_mean_control);

                        selectedPlate.addColumnWithFormula('Rel_PCTR', `100*(${selectedPlate.name}[ddCq,row\${i}]/${_mean_control.name}[relative_expression_utc_mean])`)
                        setTimeout(async () => {
                            setTimeout(async () => {
                                await pt.zoomintoplate(selectedPlate);
                                await pt.updateCalculations();
                            }, 2000)
                        }, 1000)
                        const tr = `100*(${selectedPlate.name}[ddCq,row\${i}]]/2)`

                    }, 2000);
                }, 2000);

            } else {

                showModal({
                    wid: 'json',
                    data: JSON.stringify(result)
                })

                if (options && options.myreference) {
                    result.role_headers.reference = options.myreference;
                    result.myreference = options.myreference;
                }
                if (options && options.mytarget) {
                    result.role_headers.target = options.mytarget;
                    result.mytarget = options.mytarget;
                }
                const distinctValues = await getDistinctGroupValues("mytarget", selectedPlate, pt, { sort: true });

                const keys = Object.keys(result.selections || {});
                for (let key of keys) {
                    const s = result.selections[key] || [];
                    for (let select of s) {
                        pt.setGroup(select, key);
                    }
                }

                if (!result.myreference || (Array.isArray(result.myreference) && result.myreference.length <= 0)) {
                    const bm = [];
                    const hdrs = result.headers || [];
                    for (let key of hdrs) {
                        bm.push({
                            label: `${key}`,
                            click: async () => {
                                options = options || {};
                                options.myreference = key;
                                await ddQQ(options);
                            }
                        });
                    }
                    pt.showMenuWithTitle('Select the reference', bm);
                    return;
                }

                if (!result.mytarget || (Array.isArray(result.mytarget) && result.mytarget.length <= 0)) {
                    const bm = [];
                    const hdrs = result.headers || [];
                    for (let key of hdrs) {
                        bm.push({
                            label: `${key}`,
                            click: async () => {
                                options = options || {};
                                options.mytarget = key;
                                await ddQQ(options);
                            }
                        });
                    }
                    pt.showMenuWithTitle('Select the target', bm);
                    return;
                }

                let targetColumn = result.role_headers.target;

                const wells = result.role_headers.well;
                const sample = result.role_headers.sample;
                const cq_ = result.role_headers.cq;

                const stuff = await buildAssignmentFormulaFromSelections(
                    "dCq",
                    selectedPlate,
                    pt,
                    [wells, sample, targetColumn, cq_],
                    targetColumn,
                );

                const target_ = selectedPlate.getDistinctValues([targetColumn, 'mytarget']);
                const reference_ = selectedPlate.getDistinctValues([targetColumn, 'myreference']);

                const target_column_name = sanitizeName(cq_) + '_' + sanitizeName(target_[0]);
                const refernce_column_name = sanitizeName(cq_) + '_' + sanitizeName(reference_[0]);

                const formula = stuff.vfinal;
                let _plate = await pt.createPlateFromFormula(formula);
                await pt.zoomintoplate(_plate);

                _plate.addColumn("dCq");
                const last = _plate.wells.length - 1;
                let _select = `[${last}:${last}][1:${_plate.grid.ymax - 1}]`;
                _plate.formula[_select] = `dCq[${refernce_column_name},row\${i}]-dCq[${target_column_name},row\${i}]`;

                pt.updateCalculations();
                _plate.highlightRowByTag(['mycontrol']);
                pt.zoomToSelectedWells(_plate);

                setTimeout(async () => {
                    await _plate.setGroupForHighlightedRows(['mycontrol']);
                    const mean_formula = `dCq_Controls_Mean=average(${_plate.name}[mycontrol,dCq])`;

                    let _mean_control = await pt.createPlateFromFormula(mean_formula);
                    await pt.zoomintoplate(_mean_control);

                    const ddcq = `2^-(${_plate.name}[dCq,row\${i}]-${_mean_control.name}[${sanitizeName(mean_formula)}])`;
                    _plate.addColumn('ddCq');
                    _plate.formula[`[${_plate.grid.xmax - 1}:${_plate.grid.xmax - 1}][${1}:${_plate.grid.ymax - 1}]`] = ddcq;

                    setTimeout(async () => {
                        await pt.zoomintoplate(_plate);
                        pt.updateCalculations();
                    }, 3000);
                }, 4000);
            }
        };

        ls['Calculate ddCq'] = async (x, y) => {

            ddQQ();
        }
        ls['Select housekeeping genes'] = async (x, y) => {
            function extractDistinctValues(blocks, grouped = true) {
                if (!Array.isArray(blocks)) return grouped ? {} : [];
                if (grouped) {
                    const result = {};
                    for (const b of blocks) {
                        if (!b || typeof b !== "object") continue;
                        const key = b.by || "unknown";
                        const val = String(b.value ?? "").trim();
                        if (!val) continue;
                        if (!result[key]) result[key] = new Set();
                        result[key].add(val);
                    }

                    for (const k in result) {
                        result[k] = Array.from(result[k]).sort();
                    }
                    return result;
                } else {

                    const vals = new Set();
                    for (const b of blocks) {
                        if (b && b.value != null) vals.add(String(b.value).trim());
                    }
                    return Array.from(vals).sort();
                }
            }
            function getValuesBy(blocks, byName) {
                if (!Array.isArray(blocks) || !byName) return [];
                const set = new Set();

                for (const b of blocks) {
                    if (!b || typeof b !== "object") continue;
                    if (b.by === byName && b.value != null && String(b.value).trim() !== "") {
                        set.add(String(b.value).trim());
                    }
                }

                return Array.from(set).sort();
            }
            pt.setMessage("Finding...", 5)
            let em = new EngineMonitor((msg) => {
                pt.updateSprite(msg)
            });
            em.addProgressListener(async (v) => {
                if (v >= 100) {
                }
            })
            let current_assumptions = sp.toValueFormulaJSON();
            let model = await exec('py/import-data/find-distinct-blocks-in-table.py', em, current_assumptions)
            sp.deselectAll()
            let distinctValues = Object.keys(extractDistinctValues(model.blocks))
            let m = []
            for (let d of distinctValues) {
                m.push({
                    label: `${d}`,
                    click: async () => {
                        const values = getValuesBy(model.blocks, d);
                        let mm = []
                        for (let v of values) {
                            mm.push({
                                label: `${v}`,
                                click: async () => {
                                    sp.searchForItemInTaggedWells(v, d)
                                    let selected_wells = sp.getSelectedWellsInOrder();
                                    for (let sss of selected_wells) {
                                        sss.setGroup('housekeeping')
                                    }
                                    setTimeout(async () => {
                                        pt.setMessage ( "Housekeeping genes ", 2)
                                        await pt.zoomToSelectedWells(sp)
                                    }, 2000)

                                }
                            })
                        }

                        pt.killSprite();
                        pt.setMenu(mm)
                    }
                })
            }
            pt.killSprite();
            pt.setMenu(m)

        }
         ls['Select housekeeping genes'] = async (x, y) => {
            function extractDistinctValues(blocks, grouped = true) {
                if (!Array.isArray(blocks)) return grouped ? {} : [];
                if (grouped) {
                    const result = {};
                    for (const b of blocks) {
                        if (!b || typeof b !== "object") continue;
                        const key = b.by || "unknown";
                        const val = String(b.value ?? "").trim();
                        if (!val) continue;
                        if (!result[key]) result[key] = new Set();
                        result[key].add(val);
                    }

                    for (const k in result) {
                        result[k] = Array.from(result[k]).sort();
                    }
                    return result;
                } else {

                    const vals = new Set();
                    for (const b of blocks) {
                        if (b && b.value != null) vals.add(String(b.value).trim());
                    }
                    return Array.from(vals).sort();
                }
            }
            function getValuesBy(blocks, byName) {
                if (!Array.isArray(blocks) || !byName) return [];
                const set = new Set();

                for (const b of blocks) {
                    if (!b || typeof b !== "object") continue;
                    if (b.by === byName && b.value != null && String(b.value).trim() !== "") {
                        set.add(String(b.value).trim());
                    }
                }

                return Array.from(set).sort();
            }
            pt.setMessage("Finding...", 5)
            let em = new EngineMonitor((msg) => {
                pt.updateSprite(msg)
            });
            em.addProgressListener(async (v) => {
                if (v >= 100) {
                }
            })
            let current_assumptions = sp.toValueFormulaJSON();
            let model = await exec('py/import-data/find-distinct-blocks-in-table.py', em, current_assumptions)
            sp.deselectAll()
            let distinctValues = Object.keys(extractDistinctValues(model.blocks))
            let m = []
            for (let d of distinctValues) {
                m.push({
                    label: `${d}`,
                    click: async () => {
                        const values = getValuesBy(model.blocks, d);
                        let mm = []
                        for (let v of values) {
                            mm.push({
                                label: `${v}`,
                                click: async () => {
                                    sp.searchForItemInTaggedWells(v, d)
                                    let selected_wells = sp.getSelectedWellsInOrder();
                                    for (let sss of selected_wells) {
                                        sss.setGroup('housekeeping')
                                    }
                                    setTimeout(async () => {
                                        pt.setMessage ( "Housekeeping genes ", 2)
                                        await pt.zoomToSelectedWells(sp)
                                    }, 2000)

                                }
                            })
                        }

                        pt.killSprite();
                        pt.setMenu(mm)
                    }
                })
            }
            pt.killSprite();
            pt.setMenu(m)

        }
        ls['Label assays'] = async (x, y) => {
            function extractDistinctValues(blocks, grouped = true) {
                if (!Array.isArray(blocks)) return grouped ? {} : [];
                if (grouped) {
                    const result = {};
                    for (const b of blocks) {
                        if (!b || typeof b !== "object") continue;
                        const key = b.by || "unknown";
                        const val = String(b.value ?? "").trim();
                        if (!val) continue;
                        if (!result[key]) result[key] = new Set();
                        result[key].add(val);
                    }

                    for (const k in result) {
                        result[k] = Array.from(result[k]).sort();
                    }
                    return result;
                } else {

                    const vals = new Set();
                    for (const b of blocks) {
                        if (b && b.value != null) vals.add(String(b.value).trim());
                    }
                    return Array.from(vals).sort();
                }
            }
            function getValuesBy(blocks, byName) {
                if (!Array.isArray(blocks) || !byName) return [];
                const set = new Set();

                for (const b of blocks) {
                    if (!b || typeof b !== "object") continue;
                    if (b.by === byName && b.value != null && String(b.value).trim() !== "") {
                        set.add(String(b.value).trim());
                    }
                }

                return Array.from(set).sort();
            }
            pt.setMessage("Finding...", 5)
            let em = new EngineMonitor((msg) => {
                pt.updateSprite(msg)
            });
            em.addProgressListener(async (v) => {
                if (v >= 100) {
                }
            })
            let current_assumptions = sp.toValueFormulaJSON();
            let model = await exec('py/import-data/find-distinct-blocks-in-table.py', em, current_assumptions)
            sp.deselectAll()
            let distinctValues = Object.keys(extractDistinctValues(model.blocks))
            let m = []
            for (let d of distinctValues) {
                m.push({
                    label: `${d}`,
                    click: async () => {
                        const values = getValuesBy(model.blocks, d);
                        let mm = []
                        for (let v of values) {
                            mm.push({
                                label: `${v}`,
                                click: async () => {
                                    sp.searchForItemInTaggedWells(v, d)
                                    let selected_wells = sp.getSelectedWellsInOrder();
                                    for (let sss of selected_wells) {
                                        sss.setGroup(v)
                                    }
                                    setTimeout(async () => {
                                        pt.setMessage ( "Housekeeping genes ", 2)
                                        await pt.zoomToSelectedWells(sp)
                                    }, 2000)

                                }
                            })
                        }

                        pt.killSprite();
                        pt.setMenu(mm)
                    }
                })
            }
            pt.killSprite();
            pt.setMenu(m)

        }
        ls['Find controls values'] = async (x, y) => {

            pt.setMessage(" Fuzzy search for controls... ", 2)

            let result = await exec('py/openai/analytics/qpcr-analysis/select-rows.py', selectedPlate.toValueFormulaJSON())
            if (result && result.table_structure === "columntargets") {
                const keys = Object.keys(result.selections || {});
                for (let key of keys) {
                    const s = result.selections[key] || [];
                    for (let select of s) {
                        pt.setGroup(select, key);
                    }
                }
            }
            pt.setMessage(null)
            await selectedPlate.highlightRowByTag(['mycontrol']);

            pt.zoomToSelectedWells(selectedPlate);

            setTimeout(() => {
                let se = pt.getSelectedWellsInOrder()
                for (let s of se) {
                    s.setWellType('CONTROL')
                }
                pt.deselectAll();

            }, 1000)

        }
        resolve(ls)
    })

}

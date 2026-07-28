function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        const sp = selectedPlate;

        const ls = {

        }

        const GROUP_COLORS = {
            target: "#ff6666",
            reference: "#66a3ff",
            ribogreen: "#66ff99"
        };

        let formatf = await exec('py/openai/analytics/qpcr-analysis/what-format-is-this.py', selectedPlate.toValueFormulaJSON())
        if (formatf && formatf.table_style === 'column_targets') {
            ls['ddCt'] = async (x, y) => {

                const mvb = [];
                mvb.push({
                    label: 'Tag Target column',
                    click: async (x, y) => {
                        let _headers = []
                        for (let h of formatf.headers) {
                            _headers.push({
                                label: h,
                                click: async (x, y) => {
                                    selectedPlate.deselectAll();
                                    selectedPlate.selectColumnByHeader(h)
                                    const www = selectedPlate.getSelectedWellsInOrder();
                                    for (let w of www) {
                                        w.setGroup("target");
                                        w.setColor(GROUP_COLORS.target);
                                    }
                                    selectedPlate.deselectAll()

                                }

                            })
                        }
                        pt.setMenu(_headers)
                    }
                })

                mvb.push({
                    label: 'Tag Housekeeping column',
                    click: async (x, y) => {
                        let _headers = []
                        for (let h of formatf.headers) {
                            _headers.push({
                                label: h,
                                click: async (x, y) => {
                                    selectedPlate.deselectAll();
                                    selectedPlate.selectColumnByHeader(h)
                                    let www = selectedPlate.getSelectedWellsInOrder();
                                    for (let w of www) {
                                        w.setGroup("reference");
                                        w.setColor(GROUP_COLORS.reference);
                                    }
                                    selectedPlate.deselectAll()
                                }
                            })
                        }
                        pt.setMenu(_headers)
                    }
                })

                mvb.push({
                    label: 'Tag Ribogreen column',
                    click: async (x, y) => {
                        let _headers = []
                        for (let h of formatf.headers) {
                            _headers.push({
                                label: h,
                                click: async (x, y) => {
                                    selectedPlate.deselectAll();
                                    selectedPlate.selectColumnByHeader(h)
                                    let www = selectedPlate.getSelectedWellsInOrder();
                                    for (let w of www) {
                                        w.setGroup("ribogreen");
                                        w.setColor(GROUP_COLORS.ribogreen);
                                    }
                                    selectedPlate.deselectAll()

                                }
                            })
                        }
                        pt.setMenu(_headers)

                    }
                })

                pt.setMenu(mvb)

            }

        } else {

            let target_column = 'Target'
            let sample_column = 'Sample'

            let HM = await exec('baja/history/HM')

            let result = await exec('py/openai/analytics/qpcr-analysis/select-rows.py', selectedPlate.toValueFormulaJSON())
            if (result && result.selections && result.selections) {
                const keys = Object.keys(result.selections || {});
                for (let key of keys) {
                    const s = result.selections[key] || [];
                    for (let select of s) {
                        pt.setGroup(select, key);
                    }
                }
            }

            if (result.role_headers) {
                target_column = result.role_headers.target;
                sample_column = result.role_headers.target;
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

            ls['Dismiss note'] = async (x, y) => {
                selectedPlate.clearActionGlyphs();
            }

            ls['Extract data...'] = async (x, y) => {
                selectedPlate.clearActionGlyphs();
                let attr_window = ''
                let sequenceTextEditor;
                let descHook = createIonFunction((p) => {
                    sequenceTextEditor = p;
                });
                const txt = 'Add variables for 1) travel expecting 7 international trips and 2) monthly gpu costs with azure';
                let initalText = true;
                setTimeout(() => {
                    let i = 0;
                    let currentText = '';

                    const interval = setInterval(() => {

                        currentText += txt[i];
                        if (!initalText) {
                            sequenceTextEditor.setContent('');
                            clearInterval(interval)
                            return;
                        }
                        sequenceTextEditor.setContent(currentText);
                        i++;

                        if (i >= txt.length) {
                            clearInterval(interval);
                        }
                    }, 10);
                }, 150);

                let sequence_input = {
                    wid: 'card',
                    "height": "300px",
                    data: {
                        "style.padding-top": '1px',
                        "style.border": '1px',
                        "style.height": "200px",
                        cards: [
                            [
                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'html',
                                        data: `

                                                <H4>
  <font color="navy">

                                                Write a paragraph that describes items you would like to add/edit:
                                                </font> </h4>
                                                `
                                    }

                                },
                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'text-editor',
                                        refCallback: descHook,
                                        data: {
                                            height: "600px",
                                            showButton: false,
                                            editorOptions: {
                                                value: '',
                                                language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                suggestOnTriggerCharacters: false,
                                                quickSuggestions: false,
                                                parameterHints: { enabled: false },
                                                minimap: { enabled: false },
                                                fontFamily: "Courier New, monospace",
                                                placeholder: "",
                                                cursorStyle: "block"
                                            },
                                            onDidFocusEditorWidget: createIon(() => {
                                                if (initalText)
                                                    sequenceTextEditor.setContent("")
                                                initalText = false;
                                            }),

                                            keybinding: {
                                                'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                })
                                            },
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'html',
                                        data: '<hr>'
                                    }
                                },
                                {
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                        hideAllModal();
                                                        CurrentLayout.reset('mainPanel')

                                                    })
                                                },
                                                {
                                                    label: 'Extract data into tables', ionFunction: createIonFunction(async () => {
                                                        hideAllModal();
                                                        CurrentLayout.reset('mainPanel')
                                                        pt.setMessage("Generating Assumptions...", 5)
                                                        let em = new EngineMonitor((msg) => {
                                                            pt.updateSprite(msg)
                                                        });
                                                        em.addProgressListener(async (v) => {
                                                            if (v >= 100) {
                                                            }
                                                        })
                                                        let content = sequenceTextEditor.getContent();
                                                        const lv = selectedPlate.toValueFormulaJSON()
                                                        let model = await exec('py/openai/analytics/select-blocks.py', em, lv, content)
                                                        pt.updateCalculations();
                                                        pt.killSprite()

                                                        const m = await ddQQForGeneratedBlockPlates(model, selectedPlate, pt)
                                                        showModal({
                                                            wid: 'json',
                                                            data: JSON.stringify(m)
                                                        })
                                                    })
                                                }

                                            ]

                                        }
                                    }
                                }
                            ]]
                    }
                }
                CurrentLayout.setComponent('mainPanel', sequence_input)

            }
            async function generatePlatesForBlocks(result, selectedPlate, pt) {
                if (!result || !Array.isArray(result.blocks) || !selectedPlate || !selectedPlate.wells) {
                    console.warn('generatePlatesForBlocks: missing result.blocks or selectedPlate.wells');
                    return {};
                }

                if (!pt) {
                    pt = CurrentLayout.getStashed('plate-track').plateTrack;
                }

                const width = selectedPlate.wells.length;
                const headerRowIndex = 0;
                const baseName = sanitizeName(selectedPlate.name || result.table_name || 'Plate');

                const blockIdToPlate = {};

                async function createPlateForBlock(block) {
                    const blockRows = (block.rows || []).slice().sort((a, b) => a - b);
                    if (!blockRows.length) return;

                    const height = blockRows.length + 1;

                    const blockLabel = block.label || block.block_id || block.kind || 'block';
                    const blockNamePart = sanitizeName(String(blockLabel));
                    const newPlateName = `${baseName}_${blockNamePart}`;

                    const p = new Plate(newPlateName, width, height);

                    for (let col = 0; col < width; col++) {

                        const headerCell = selectedPlate.wells[col][headerRowIndex];
                        if (headerCell && headerCell.deepCopy) {
                            p.wells[col][0] = headerCell.deepCopy();
                        }

                        let prow = 1;
                        for (const row_y of blockRows) {

                            const src = selectedPlate.wells[col][row_y];
                            if (src && src.deepCopy) {
                                p.wells[col][prow++] = src.deepCopy();
                            }
                        }
                    }

                    p.removeEmptyRowsAndColumns();
                    selectedPlate.deselectWells();
                    pt.addPlateWithConsistentWellSize(p);
                    pt.zoomintoplate(p);

                    blockIdToPlate[block.block_id] = p;

                    setTimeout(() => {
                        const t = p;

                    }, 300);
                }

                for (const block of result.blocks) {
                    await createPlateForBlock(block);
                }

                return blockIdToPlate;
            }
            const ddQQSeparateTables = async ({
                targetPlate,
                referencePlate,
                pt,
                targetCqColumn,
                referenceCqColumn,
                plateNameForFormulas,
            } = {}) => {

                if (!pt) {
                    pt = CurrentLayout.getStashed('plate-track').plateTrack;
                }

                plateNameForFormulas = plateNameForFormulas || targetPlate.name;

                targetPlate.addColumn("dCq");
                targetPlate.clearActionGlyphs();
                const last = targetPlate.wells.length - 1;
                let _select = `[${last}:${last}][1:${targetPlate.grid.ymax - 1}]`;
                targetPlate.formula[_select] =
                    `${plateNameForFormulas}[${targetCqColumn},row\${i}] - ` +
                    `${referencePlate.name}[${referenceCqColumn},row\${i}]`;
                pt.updateCalculations();
                await targetPlate.highlightRowByTag(['control']);
                pt.zoomToSelectedWells(targetPlate);
                await targetPlate.setGroupForHighlightedRows(['control']);
                pt.deselectAll();

                setTimeout(async () => {
                    const mean_formula = `UTC_MEAN=average(${targetPlate.name}[control,dCq])`;
                    let _mean_control = await pt.createPlateFromFormula(mean_formula);

                    let utc_mean_dct = Object.keys(_mean_control.wells[0][1].group)[0];

                    const ddcqFormula =
                        `2^-(${targetPlate.name}[dCq,row\${i}] - ` +
                        `${_mean_control.name}[${utc_mean_dct}])`;

                    targetPlate.addColumn('ddCq');
                    targetPlate.formula[
                        `[${targetPlate.grid.xmax - 1}:${targetPlate.grid.xmax - 1}]` +
                        `[1:${targetPlate.grid.ymax - 1}]`
                    ] = ddcqFormula;

                    targetPlate.updateCalculations(pt);

                    setTimeout(async () => {
                        await targetPlate.highlightRowByTag(['control']);
                        await pt.zoomToSelectedWells(targetPlate);
                        await targetPlate.eForHighlightedRows(['control']);
                        targetPlate.deselectAll();
                        _mean_control.addColumnWithFormula(
                            'relative_expression_utc_mean',
                            `average(${targetPlate.name}[ddCq,control])`
                        );
                        await _mean_control.updateCalculations(pt);

                        targetPlate.addColumnWithFormula(
                            'Rel_PCTR',
                            `100*(${targetPlate.name}[ddCq,row\${i}]` +
                            `/${_mean_control.name}[relative_expression_utc_mean])`
                        );
                        setTimeout(async () => {
                            await pt.zoomintoplate(targetPlate);
                            await pt.updateCalculations();
                        }, 2000);

                    }, 2000);
                }, 2000);
            };

            async function ddQQForGeneratedBlockPlates(model, selectedPlate, pt) {
                if (!pt) {
                    pt = CurrentLayout.getStashed('plate-track').plateTrack;
                }

                const blockPlates = await generatePlatesForBlocks(model, selectedPlate, pt);

                const hkBlocks = (model.blocks || []).filter(b => b.kind === 'housekeeping');
                const toiBlocks = (model.blocks || []).filter(b => b.kind === 'target_of_interest');
                if (!hkBlocks.length || !toiBlocks.length) {
                    console.warn('ddQQForGeneratedBlockPlates: need at least one housekeeping and one target_of_interest block');
                    return;
                }
                const referenceBlock = hkBlocks[0];
                const referencePlate = blockPlates[referenceBlock.block_id];

                if (!referencePlate) {
                    console.warn('ddQQForGeneratedBlockPlates: no plate found for housekeeping block', referenceBlock.block_id);
                    return;
                }

                let cqColumnName = 'Cq';
                if (model.role_headers && model.role_headers.cq) {
                    cqColumnName = model.role_headers.cq;
                }

                for (const toiBlock of toiBlocks) {
                    const targetPlate = blockPlates[toiBlock.block_id];
                    if (!targetPlate) {
                        console.warn('ddQQForGeneratedBlockPlates: no plate found for target block', toiBlock.block_id);
                        continue;
                    }

                    const plateNameForFormulas = targetPlate.name;
                    await ddQQSeparateTables({
                        targetPlate,
                        referencePlate,
                        pt,
                        targetCqColumn: cqColumnName,
                        referenceCqColumn: cqColumnName,
                        plateNameForFormulas
                    });
                }
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

                let multiple_target_rows = false;
                if (result && result.row_unique_targets && result.row_unique_targets.length > 1) {
                    multiple_target_rows = true;
                }

                if (!multiple_target_rows && result && result.table_structure === "columntargets") {
                    if (options && options.reference) {
                        result.role_headers.reference = options.reference;
                        result.reference = options.reference;
                    }
                    if (options && options.target) {
                        result.role_headers.target = options.target;
                        result.target = options.target;
                    }
                    const keys = Object.keys(result.selections || {});
                    for (let key of keys) {
                        const s = result.selections[key] || [];
                        for (let select of s) {
                            pt.setGroup(select, key);
                        }
                    }
                    if (!result.reference || (Array.isArray(result.reference) && result.reference.length <= 0)) {
                        const bm = [];
                        const hdrs = result.headers || [];
                        for (let key of hdrs) {
                            bm.push({
                                label: `${key}`,
                                click: async () => {
                                    options = options || {};
                                    options.reference = key;
                                    await ddQQ(options);
                                }
                            });
                        }
                        pt.showMenuWithTitle('Select the reference', bm);
                        return;
                    }
                    if (!result.target || (Array.isArray(result.target) && result.target.length <= 0)) {
                        const bm = [];
                        const hdrs = result.headers || [];
                        for (let key of hdrs) {
                            bm.push({
                                label: `${key}`,
                                click: async () => {
                                    options = options || {};
                                    options.target = key;
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
                    await selectedPlate.highlightRowByTag(['control']);
                    pt.zoomToSelectedWells(selectedPlate);
                    await selectedPlate.setGroupForHighlightedRows(['control']);
                    pt.deselectAll();

                    setTimeout(async () => {
                        const mean_formula = `UTC_MEAN=average(${selectedPlate.name}[control,dCq])`;
                        let _mean_control = await pt.createPlateFromFormula(mean_formula);
                        let utc_mean_dct = Object.keys(_mean_control.wells[0][1].group)[0]
                        const ddcq = `2^-(${selectedPlate.name}[dCq,row\${i}]-${_mean_control.name}[${utc_mean_dct}])`;
                        selectedPlate.addColumn('ddCq');
                        selectedPlate.formula[`[${selectedPlate.grid.xmax - 1}:${selectedPlate.grid.xmax - 1}][${1}:${selectedPlate.grid.ymax - 1}]`] = ddcq;
                        selectedPlate.updateCalculations(pt)

                        setTimeout(async () => {
                            await selectedPlate.highlightRowByTag(['control']);
                            await pt.zoomToSelectedWells(selectedPlate);
                            await selectedPlate.eForHighlightedRows(['control']);
                            selectedPlate.deselectAll();

                            _mean_control.addColumnWithFormula('relative_expression_utc_mean', `average(${selectedPlate.name}[ddCq,control])`)
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

                    if (options && options.reference) {
                        result.role_headers.reference = options.reference;
                        result.reference = options.reference;
                    }
                    if (options && options.target) {
                        result.role_headers.target = options.target;
                        result.target = options.target;
                    }
                    const keys = Object.keys(result.selections || {});
                    for (let key of keys) {
                        const s = result.selections[key] || [];
                        for (let select of s) {
                            pt.setGroup(select, key);
                        }
                    }

                    if (!result.reference || (Array.isArray(result.reference) && result.reference.length <= 0)) {
                        const bm = [];
                        const hdrs = result.headers || [];
                        for (let key of hdrs) {
                            bm.push({
                                label: `${key}`,
                                click: async () => {
                                    options = options || {};
                                    options.reference = key;
                                    await ddQQ(options);
                                }
                            });
                        }
                        pt.showMenuWithTitle('Select the reference', bm);
                        return;
                    }

                    if (!result.target || (Array.isArray(result.target) && result.target.length <= 0)) {
                        const bm = [];
                        const hdrs = result.headers || [];
                        for (let key of hdrs) {
                            bm.push({
                                label: `${key}`,
                                click: async () => {
                                    options = options || {};
                                    options.target = key;
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

                    const target_ = selectedPlate.getDistinctValues([targetColumn, 'target']);
                    const reference_ = selectedPlate.getDistinctValues([targetColumn, 'reference']);

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
                    _plate.highlightRowByTag(['control']);
                    pt.zoomToSelectedWells(_plate);

                    setTimeout(async () => {
                        await _plate.setGroupForHighlightedRows(['control']);
                        const mean_formula = `dCq_Controls_Mean=average(${_plate.name}[control,dCq])`;

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

            if (result && result.selections && result.selections) {
                const keys = Object.keys(result.selections || {});
                for (let key of keys) {
                    ls[`Select ${key}`] = async (x, y) => {
                        const opts = []
                        await selectedPlate.highlightRowByTag([`${key}`]);
                        const j = key;
                        opts.push({
                            label: `New table for ${j}...`, click: async (x, y) => {

                                selectedPlate.selectWellsByTag('columnheader')
                                let selectedRows = {};
                                for (let col = 0; col < selectedPlate.wells.length; col++) {
                                    for (let row = 0; row < selectedPlate.wells[col].length; row++) {
                                        if (selectedPlate.wells[col][row].select === true) {
                                            selectedRows[row] = row;
                                        }
                                    }
                                }
                                let kk = Object.keys(selectedRows)
                                let p = new Plate(sanitizeName(this.name) + '_' + sanitizeName(j), selectedPlate.wells.length, selectedRows.length);
                                for (let col = 0; col < selectedPlate.wells.length; col++) {
                                    let prow = 0;
                                    for (let k of kk) {
                                        let row = selectedRows[k]
                                        if (selectedPlate.wells[col][row].select)
                                            p.wells[col][prow++] = selectedPlate.wells[col][row].deepCopy();
                                    }

                                }
                                p.removeEmptyRowsAndColumns();
                                selectedPlate.deselectWells();
                                pt.addPlateWithConsistentWellSize(p)
                                pt.zoomintoplate(p)
                                setTimeout(() => {
                                    const t = p
                                    pt.zoomintoplate(p)

                                    setTimeout(async () => {
                                        let plate_type = await exec('py/openai/analytics/get-plate-type.py', t.toValueFormulaJSON(), ['data', 'Dose-response', 'ribogreen', 'QPCR-Analysis'])
                                        if (plate_type?.selection?.chosen) {
                                            t.setType(plate_type.selection.chosen)
                                            let TableOps = await exec('baja/table/table-ops')
                                            let m = await TableOps.load(pt, selectedPlate)
                                            if (m && m.length > 0) {

                                                t.addActionGlyph(pt, 'Options for ' + plate_type.selection.chosen, async (pt, selectedPlate) => {
                                                    setTimeout(async () => {
                                                        let Menu = await exec('flexigraph/menu.js');
                                                        const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                                                        pt.setMenu(smenu)
                                                    }, 1000)
                                                })
                                            }
                                        }
                                    }, 200)

                                }, 3000)

                            }
                        })
                        opts.push({
                            label: `Delete rows`, click: async (x, y) => {
                                pushHistory(HM(this))
                                selectedPlate.removeFullySelectedRows()
                                selectedPlate.clk_drag(pt);
                            }
                        })
                        pt.setMenu(opts)
                    }
                }
            }

            if (result?.selections?.target) {
                const distinctValues = selectedPlate.getDistinctValues(['target', target_column])
                for (let j of distinctValues) {
                    ls[`New table for ${j}...`] = async (x, y) => {
                        selectedPlate.deselectAll();
                        selectedPlate.selectWellsByTagAndValue('target', j)
                        selectedPlate.selectWellsByTag('columnheader')
                        let selectedRows = {};
                        for (let col = 0; col < selectedPlate.wells.length; col++) {
                            for (let row = 0; row < selectedPlate.wells[col].length; row++) {
                                if (selectedPlate.wells[col][row].select === true) {
                                    selectedRows[row] = row;
                                }
                            }
                        }
                        let kk = Object.keys(selectedRows)
                        let p = new Plate(sanitizeName(this.name) + '_' + sanitizeName(j), selectedPlate.wells.length, selectedRows.length);
                        for (let col = 0; col < selectedPlate.wells.length; col++) {
                            let prow = 0;
                            for (let k of kk) {
                                let row = selectedRows[k]
                                if (selectedPlate.wells[col][row].select)
                                    p.wells[col][prow++] = selectedPlate.wells[col][row].deepCopy();
                            }

                        }
                        p.removeEmptyRowsAndColumns();
                        selectedPlate.deselectWells();
                        pt.addPlateWithConsistentWellSize(p)
                        pt.zoomintoplate(p)
                        setTimeout(() => {
                            const t = p;
                            pt.zoomintoplate(p)

                            setTimeout(async () => {
                                let plate_type = await exec('py/openai/analytics/get-plate-type.py', t.toValueFormulaJSON(), ['data', 'Dose-response', 'ribogreen', 'QPCR-Analysis'])
                                if (plate_type?.selection?.chosen) {
                                    t.setType(plate_type.selection.chosen)
                                    t.addActionGlyph(pt, 'Options for ' + plate_type.selection.chosen, async (pt, selectedPlate) => {
                                        let TableOps = await exec('baja/table/table-ops')
                                        let m = await TableOps.load(pt, selectedPlate)
                                        setTimeout(async () => {
                                            let Menu = await exec('flexigraph/menu.js');
                                            const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                                            pt.setMenu(smenu)
                                        }, 1000)
                                    })
                                }
                            }, 200)
                        }, 3000)

                    }
                }

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
                                            pt.setMessage("Housekeeping genes ", 2)
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
        }
        resolve(ls)
    })

}

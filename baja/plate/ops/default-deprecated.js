function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')

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

            'Select cells':
                () => {

                    console.log('debubg');
                    let md = false;
                    let start;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let plate = pt.getPlate(xw, yw)
                        if (plate) {
                            start = plate.getWell(xw, yw)
                            if (start) {
                                start.selectIt();

                            }
                        }
                    }
                    let mouseMoveListener = (x, y) => {
                        if (start) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let plate = pt.getPlate(xw, yw);
                            if (plate) {
                                let [currentRow, currentCol] = plate.getWellCoordinates(xw, yw);
                                if (currentRow !== undefined && currentCol !== undefined) {
                                    let startRow = Math.min(start.row, currentRow);
                                    let endRow = Math.max(start.row, currentRow);
                                    let startCol = Math.min(start.col, currentCol);
                                    let endCol = Math.max(start.col, currentCol);

                                    for (let row = startRow; row <= endRow; row++) {
                                        for (let col = startCol; col <= endCol; col++) {
                                            let well = plate.wells[row][col];
                                            if (well) {
                                                well.selectIt();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    let mouseUpListener = async (x, y) => {

                    }

                    let t = {
                        id: 'select-cells-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: null,
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Drag Select':
                () => {
                    let md = false;
                    freezFrame = false;

                    let startIndex = null;
                    let currentSelected = [];
                    let cursorIndex = null;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        currentSelected = [];
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            startIndex = selectedPlate.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md && startIndex != null) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                let currentIndex = selectedPlate.getWellRowIndex(current_well);
                                if (currentIndex) {
                                    cursorIndex = currentIndex;

                                    for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                                        for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                            if (selectedPlate.wells[row] && selectedPlate.wells[row][col]) {
                                                if (!currentSelected.some(cs => cs.row === row && cs.col === col)) {
                                                    currentSelected.push({
                                                        w: selectedPlate.wells[row][col],
                                                        row: row,
                                                        col: col
                                                    });
                                                    selectedPlate.wells[row][col].selectIt();
                                                }
                                            }
                                        }
                                    }

                                    currentSelected = currentSelected.filter(selected => {
                                        const isWithinBounds =
                                            selected.row >= startIndex.rowIndex &&
                                            selected.row <= currentIndex.rowIndex &&
                                            selected.col >= startIndex.colIndex &&
                                            selected.col <= currentIndex.colIndex;

                                        if (!isWithinBounds) {
                                            selected.w.deselectIt();
                                        }

                                        return isWithinBounds;
                                    });
                                }
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;
                        startIndex = null;
                    };

                    let t = {
                        id: 'select-cells-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                            ctx.font = "24px Arial";

                            if (startIndex) {
                                const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                                const textX = grid.X(selectedPlate.grid.X(cursorIndex.rowIndex));
                                const textY = grid.Y(selectedPlate.grid.Y(cursorIndex.colIndex));

                                const textWidth = ctx.measureText(text).width;
                                const textHeight = 20;

                                const padding = 8;
                                const cornerRadius = 10;
                                const rectX = textX - padding;
                                const rectY = textY - textHeight - padding;
                                const rectWidth = textWidth + 2 * padding;
                                const rectHeight = textHeight + 2 * padding;

                                ctx.shadowBlur = 10;
                                ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                                ctx.shadowBlur = 0;
                                ctx.fillStyle = "black";
                                ctx.fillText(text, textX, textY);

                            }

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },
            'Column Select__':
                () => {
                    let md = false;
                    freezFrame = false;
                    let mouseDownListener = async (x, y) => {
                        md = true;

                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;

                    };

                    let t = {
                        id: 'select-cell-col-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Row Select':
                () => {
                    let md = false;
                    freezFrame = false;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            selectedPlate.selectRowAtColumn(current_well.y, current_well.x)
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                selectedPlate.selectRowAtColumn(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;
                    };

                    let t = {
                        id: 'select-cell-col-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Deselect cells':
                () => {
                    selectedPlate.deselectWells();
                },

        }

        if (selectedPlate.hasSelectedWells()) {

            ls['Assign standard dilution series'] =
                async () => {

                    let WellDisplay = await exec('baja/plate/views/well-display-factory.js')
                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Enter dilutions'
                                        }
                                    }, {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Start', 'Dilution factor', 'Group Name'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        pt.menu = null;
                                                        pt.deselectAll();

                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let start = +input_params['Start']
                                                        let factor = +input_params['Dilution factor']
                                                        let standard_group = input_params['Group Name']
                                                        let w = selectedPlate.getSelectedWellsInOrder()

                                                        let conc = start;
                                                        for (let i of w) {
                                                            if (i)
                                                                for (let j of i) {
                                                                    if (j) {
                                                                        j.concentration = conc;
                                                                        j.setGroup(standard_group);
                                                                    }
                                                                }
                                                            conc = conc / factor;
                                                        }

                                                        pt.setMessage(" " + standard_group + " dilution series... ")
                                                        selectedPlate.updateWellView('CONCENTRATION')

                                                        setTimeout(() => {
                                                            selectedPlate.deselectWells();
                                                            selectedPlate.updateWellView(null)
                                                        }, 3000);

                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                }

        }

        if (selectedPlate.plateType === 'qpcr') {
            ls['Plot standard curve'] = () => {
                function plotStandardGroupsByObj(plate, pt, equations) {
                    let allScatterData = {
                        points: []
                    };

                    const standardGroups = {};

                    const colorPalette = generateColorPalette(Object.keys(equations).length);
                    const combinedPlot = new MPlot(allScatterData);
                    let index = 0;
                    equations.forEach(obj => {
                        const color = colorPalette[index++];
                        combinedPlot.addLineEquation({
                            obj: obj.obj,
                            slope: obj.slope,
                            intercept: obj.intercept,
                            label: `${obj.obj}`,
                            color: color,
                            rSquared: obj.rSquared
                        });
                        plate.wells.forEach(row => {
                            row.forEach(well => {
                                for (let ww of obj.wells) {
                                    if (well.getGroup( 'STANDARD') && well.position === ww && well.value !== null && well.obj === obj.obj) {
                                        if (!standardGroups[well.obj]) {
                                            standardGroups[well.obj] = [];
                                        }
                                        well['color'] = color;
                                        standardGroups[well.obj].push(well);
                                    }
                                }
                            });
                        });
                    })
                    combinedPlot.x_axis_label = 'Concentration';
                    combinedPlot.y_axis_label = 'Cq';
                    index = 0;

                    Object.keys(standardGroups).forEach(obj => {
                        const wells = standardGroups[obj];
                        const color = colorPalette[index++];
                        const scatterData = {
                            points: wells.map(well => ({
                                x: well.concentration,
                                y: well.value,
                                name: `${well.concentration}`,
                                color: well.color
                            }))
                        };
                        allScatterData.points = allScatterData.points.concat(scatterData.points);
                    });
                    combinedPlot.type = 'line';
                    combinedPlot.name = "STANDARDs";
                    const maxX = Math.max(...allScatterData.points.map(p => p.x));
                    combinedPlot.setxmax(maxX);
                    combinedPlot.setxmin(0);
                    pt.resetState();
                    pt.setPlot(combinedPlot, plate.grid.xi, plate.grid.yi - 1);
                }

                function findRowLevelEquationsFromAttributes(plate) {
                    const results = [];

                    plate.wells.forEach((row, rowIndex) => {
                        const rowEquations = [];

                        row.forEach(well => {
                            if (well && well.properties) {
                                const slope = parseFloat(well.properties['slope']) || null;
                                const intercept = parseFloat(well.properties['y-intercept']) || null;
                                const rSquared = parseFloat(well.properties['r2']) || null;

                                if (slope !== null && intercept !== null && rSquared !== null) {
                                    rowEquations.push({
                                        wellPosition: well.position,
                                        slope: slope,
                                        intercept: intercept,
                                        rSquared: rSquared,
                                        obj: well.obj
                                    });
                                }
                            }
                        });

                        if (rowEquations.length > 0) {
                            results.push({
                                rowIndex: rowIndex,
                                equations: rowEquations
                            });
                        }
                    });

                    return results;
                }

                function findDistinctEquationsByR2(equationsFromAttributes, r2Threshold = 0.01) {
                    const distinctEquations = [];
                    equationsFromAttributes.forEach(rowData => {
                        rowData.equations.forEach(wellData => {
                            const existingEquation = distinctEquations.find(eq => Math.abs(eq.rSquared - wellData.rSquared) < r2Threshold);

                            if (!existingEquation) {
                                distinctEquations.push({
                                    obj: wellData.obj,
                                    slope: wellData.slope,
                                    intercept: wellData.intercept,
                                    rSquared: wellData.rSquared,
                                    wells: [wellData.wellPosition]
                                });
                            } else {

                                existingEquation.wells.push(wellData.wellPosition);
                            }
                        });
                    });

                    return distinctEquations;
                }
                const equationsFromAttributes = findRowLevelEquationsFromAttributes(selectedPlate);
                const distinctEquations = findDistinctEquationsByR2(equationsFromAttributes, 0.002);
                console.log(distinctEquations);
                plotStandardGroupsByObj(selectedPlate, pt, distinctEquations)

            }

            ls.push({
                'Calculate STANDARD curve':
                    () => {
                        function plotStandardGroupsByObj(plate, pt) {

                            const standardGroups = {};
                            plate.wells.forEach(row => {
                                row.forEach(well => {
                                    if (well.getGroup( "STANDARD") && well.concentration !== null && well.value !== null && typeof well.concentration === 'number' && typeof well.value === 'number' ) {
                                        if (!standardGroups[well.obj]) {
                                            standardGroups[well.obj] = [];
                                        }
                                        standardGroups[well.obj].push(well);
                                    }
                                });
                            });

                            if (Object.keys(standardGroups).length === 0) {
                                console.error('No wells found in the "STANDARD" group');
                                return;
                            }

                            let allScatterData = {
                                points: []
                            };

                            const colorPalette = generateColorPalette(Object.keys(standardGroups).length);
                            const combinedPlot = new MPlot(allScatterData);
                            combinedPlot.x_axis_label = 'Concentration'
                            combinedPlot.y_axis_label = 'Cq'

                            let index = 0;

                            Object.keys(standardGroups).forEach(obj => {
                                const wells = standardGroups[obj];
                                const concentrations = wells.map(well => well.concentration);
                                const values = wells.map(well => well.value);

                                const { slope, intercept, rSquared } = linearRegression(concentrations, values);

                                const color = colorPalette[index++];

                                const scatterData = {
                                    points: wells.map(well => ({
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
                                    label: `${obj}`,
                                    color: color,
                                    rSquared: rSquared
                                });

                                console.log(`Added plot for Obj: ${obj} with slope: ${slope}, intercept: ${intercept}, R²: ${rSquared}`);
                            });

                            combinedPlot.type = 'line';
                            combinedPlot.name = "STANDARDs";

                            const maxX = Math.max(...allScatterData.points.map(p => p.x));
                            combinedPlot.setxmax(maxX);

                            pt.resetState();
                            pt.setPlot(combinedPlot, plate.grid.xi, plate.grid.yi - 2);

                            console.log(`STANDARDs.`);
                        }

                        plotStandardGroupsByObj(selectedPlate, pt)
                    }
            });

            resolve(ls)
        }

        else if (selectedPlate.plateType === 'financial') {
            resolve({
                'Export (csv)':
                    () => {
                        let go = () => {
                            let csvContent = '';
                            let propertyKeys = [];

                            for (let x = 0; x < selectedPlate.wells.length; x++) {
                                for (let y = 0; y < selectedPlate.wells[x].length; y++) {
                                    let well = selectedPlate.wells[x][y];
                                    if (well && well.properties && typeof well.properties === 'object') {
                                        propertyKeys = Object.keys(well.properties);
                                        break;
                                    }
                                }
                                if (propertyKeys.length > 0) break;
                            }

                            csvContent += ['', ...propertyKeys].join(',') + '\n';

                            let index = 0;

                            for (let x = 0; x < selectedPlate.wells.length; x++) {
                                for (let y = 0; y < selectedPlate.wells[x].length; y++) {
                                    let well = selectedPlate.wells[x][y];
                                    if (well) {

                                        let wellPosition = `${index}${x + 1}`;

                                        let propertyValues = propertyKeys.map(key => (well.properties && well.properties[key] !== undefined) ? well.properties[key] : '');

                                        csvContent += [wellPosition, ...propertyValues].join(',') + '\n';
                                        index++;

                                    }

                                }
                            }
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(selectedPlate.wells)
                            })
                            downloadCSV(csvContent, this.name + "_" + '.csv')

                        }
                        go();
                    }
            })
        }
        resolve(ls)

    })

}

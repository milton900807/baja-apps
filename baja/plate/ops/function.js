function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')
        let Menu = await exec('flexigraph/menu')

        let smenu = null;

        function generateScatterData(wells, groups = null) {
            let xAxisLabels = [];
            let yAxisLabels = [];
            let scatterPlotData = { points: [] };

            let xLabelRow = -1;
            let yLabelCol = -1;

            for (let row = 0; row < wells[0].length; row++) {
                if (wells[0][row] && wells[0][row].wellType === 'label') {
                    xLabelRow = row;

                    for (let col = 1; col < wells.length; col++) {
                        if (wells[col][row] && wells[col][row].wellType === 'label') {
                            yAxisLabels.push(wells[col][row].value);
                        } else {
                            break;
                        }
                    }
                    break;
                }
            }

            for (let col = 0; col < wells.length; col++) {
                if (wells[col][0] && wells[col][0].wellType === 'label') {
                    yLabelCol = col;

                    for (let row = 1; row < wells[col].length; row++) {
                        if (wells[col][row] && wells[col][row].wellType === 'label') {
                            xAxisLabels.push(wells[col][row].value);
                        } else {
                            break;
                        }
                    }
                    break;
                }
            }

            if (xLabelRow !== -1 && yLabelCol !== -1) {
                for (let row = xLabelRow + 1; row < wells[0].length; row++) {
                    let previousPoint = null;

                    for (let col = yLabelCol + 1; col < wells.length; col++) {
                        let well = wells[col][row];
                        if (well) {

                            if (well.getGroup( 'StdDev') && previousPoint) {
                                previousPoint.stdDev = well.value;
                            } else if (groups === null || groups.includes(well.group)) {

                                let scatterPoint = {
                                    x: row - (xLabelRow + 1),
                                    y: well.value,
                                    name: well.name || `${xAxisLabels[col - (yLabelCol + 1)]}-${yAxisLabels[row - (xLabelRow + 1)]}`,
                                    color: well.color || 'blue',
                                    stdDev: 0,
                                    isSelected: false
                                };

                                scatterPlotData.points.push(scatterPoint);
                                previousPoint = scatterPoint;
                            }
                        }
                    }
                }
            }

            return scatterPlotData;
        }

        function findScatterPlotData(wells) {
            let xAxisLabels = [];
            let yAxisLabels = [];
            let scatterPlotData = [];

            let xLabelRow = -1;
            let yLabelCol = -1;

            for (let row = 0; row < wells[0].length; row++) {
                if (wells[0][row] && wells[0][row].wellType === 'label') {
                    xLabelRow = row;

                    for (let col = 1; col < wells.length; col++) {
                        if (wells[col][row] && wells[col][row].wellType === 'label') {
                            yAxisLabels.push(wells[col][row].value);
                        } else {
                            break;
                        }
                    }
                    break;
                }
            }

            for (let col = 0; col < wells.length; col++) {
                if (wells[col][0] && wells[col][0].wellType === 'label') {
                    yLabelCol = col;

                    for (let row = 1; row < wells[col].length; row++) {
                        if (wells[col][row] && wells[col][row].wellType === 'label') {
                            xAxisLabels.push(wells[col][row].value);
                        } else {
                            break;
                        }
                    }
                    break;
                }
            }

            if (xLabelRow !== -1 && yLabelCol !== -1) {
                for (let row = xLabelRow + 1; row < wells[0].length; row++) {
                    for (let col = yLabelCol + 1; col < wells.length; col++) {
                        let well = wells[col][row];
                        if (well) {
                            scatterPlotData.push({
                                x: well.value,
                                y: row - (xLabelRow + 1),
                                xAxisLabel: xAxisLabels[col - (yLabelCol + 1)],
                                yAxisLabel: yAxisLabels[row - (xLabelRow + 1)]
                            });
                        }
                    }
                }
            }

            return {
                xAxisLabels,
                yAxisLabels,
                scatterPlotData
            };
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
        function meanIQR(values) {
            if (values.length < 4) {
                throw new Error("At least 4 values are required to calculate the IQR.");
            }

            const sorted = values.slice().sort((a, b) => a - b);

            function quartile(arr, q) {
                const pos = (arr.length - 1) * q;
                const base = Math.floor(pos);
                const rest = pos - base;
                if (arr[base + 1] !== undefined) {
                    return arr[base] + rest * (arr[base + 1] - arr[base]);
                } else {
                    return arr[base];
                }
            }

            const q1 = quartile(sorted, 0.25);
            const q3 = quartile(sorted, 0.75);

            const iqr = q3 - q1;

            return (q1 + q3) / 2;
        }

        function mean(values) {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }

        function median(values) {
            values.sort((a, b) => a - b);
            const mid = Math.floor(values.length / 2);
            if (values.length % 2 === 0) {
                return (values[mid - 1] + values[mid]) / 2;
            } else {
                return values[mid];
            }
        }

        function mode(values) {
            const frequency = {};
            let maxFreq = 0;
            let modes = [];

            values.forEach(val => {
                frequency[val] = (frequency[val] || 0) + 1;
                if (frequency[val] > maxFreq) {
                    maxFreq = frequency[val];
                }
            });

            for (let key in frequency) {
                if (frequency[key] === maxFreq) {
                    modes.push(parseFloat(key));
                }
            }

            return modes;
        }

        function range(values) {
            const min = Math.min(...values);
            const max = Math.max(...values);
            return max - min;
        }
        function variance(values) {
            const avg = mean(values);
            return values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
        }

        function standardDeviation(values) {
            return Math.sqrt(variance(values));
        }

        function interquartileRange(values) {
            values.sort((a, b) => a - b);
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            return q3 - q1;
        }

        function percentile(values, p) {
            const sorted = [...values].sort((a, b) => a - b);
            const idx = (p / 100) * (sorted.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
        }
        function interquartileRange(values) {
            values.sort((a, b) => a - b);
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            return q3 - q1;
        }

        function percentile(values, p) {
            const sorted = [...values].sort((a, b) => a - b);
            const idx = (p / 100) * (sorted.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
        }
        function kurtosis(values) {
            const avg = mean(values);
            const stdDev = standardDeviation(values);
            const n = values.length;
            const kurt = values.reduce((acc, val) => acc + Math.pow((val - avg) / stdDev, 4), 0) / n;
            return kurt - 3;
        }

        function percentile(values, p) {
            values.sort((a, b) => a - b);
            const idx = (p / 100) * (values.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return values[lower] + (values[upper] - values[lower]) * (idx - lower);
        }
        function zScores(values) {
            const avg = mean(values);
            const stdDev = standardDeviation(values);
            return values.map(val => (val - avg) / stdDev);
        }
        function detectOutliers(values) {
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            const iqr = q3 - q1;
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;
            return values.filter(val => val < lowerBound || val > upperBound);
        }

        let createEditColMenu = (pt, upx, upy) => {
            let msub = []
            msub.push(
                {
                    label: 'Mean',
                    click: async (x, y) => {
                        try {

                            let selected_wells = selectedPlate.getSelectedWellsInOrder();

                            let lv = []
                            for (let item of selected_wells) {
                                let v = item.value;
                                lv.push ( v )
                            }
                            let m = mean ( lv );
                            let w = new GenericWell('', m);
                            let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                            w.setGroup('Mean')
                            w.equations[functionToBase64(mean)]=selected_wells.map(_o =>  _o.uid);

                            selectedPlate.appendColumn ( w, cr.colIdx )

                            pt.wb(null)

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    },
                });
                msub.push(
                    {
                        label: 'IQR Mean',
                        click: async (x, y) => {
                            try {

                                let selected_wells = selectedPlate.getSelectedWellsInOrder();

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push ( v )
                                }
                                let m = mean ( lv );
                                let w = new GenericWell('', m);
                                let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                                w.setGroup('IQRMean')
                                w.equations[functionToBase64(meanIQR)]=selected_wells.map(_o =>  _o.uid);

                                selectedPlate.appendColumn ( w, cr.colIdx )

                                pt.wb(null)

                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                        move: () => {
                        },
                    });
                msub.push(
                {
                    label: 'Range',
                    click: async (x, y) => {
                        try {

                            let selected_wells = selectedPlate.getSelectedWellsInOrder();
                            let lv = []
                            for (let item of selected_wells) {
                                let v = item.value;
                                lv.push ( v )
                            }
                            let m = range ( lv );
                            let w = new GenericWell('', m);
                            let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                            w.setGroup('Range')
                            w.equations[functionToBase64(range)]=selected_wells.map(_o =>  _o.uid);
                            selectedPlate.appendColumn ( w, cr.colIdx )
                            pt.wb(null)

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    },
                });
            msub.push(
                {
                    label: 'Variance',
                    click: async (x, y) => {
                        try {

                            let selected_wells = selectedPlate.getSelectedWellsInOrder();
                            let index = 0;

                            let lv = []
                            for (let item of selected_wells) {
                                let v = item.value;
                                lv.push ( v )
                            }
                            let m = variance ( lv );
                            let w = new GenericWell('', m);
                            let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                            w.setGroup ('Variance')
                            w.ref = selected_wells.map(_o =>  _o.uid);
                            w.equations[functionToBase64(variance)]=selected_wells.map(_o =>  _o.uid);
                            selectedPlate.appendColumn ( w, cr.colIdx )

                            pt.wb(null)

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    },
                });

            msub.push(
                {
                    label: 'Standard Deviation',
                    click: async (x, y) => {
                        try {
                            let selected_wells = selectedPlate.getSelectedWellsInOrder();
                            let lv = []
                            for (let item of selected_wells) {
                                let v = item.value;
                                lv.push ( v )
                            }
                            let m = standardDeviation ( lv );
                            let w = new GenericWell('', m);
                            let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                            w.setGroup('StdDev')
                            w.equations[functionToBase64(standardDeviation)]=selected_wells.map(_o =>  _o.uid);
                            selectedPlate.appendColumn ( w, cr.colIdx )
                            pt.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    },
                });

                msub.push(
                    {
                        label: 'interquartile Range',
                        click: async (x, y) => {
                            try {

                                let selected_wells = selectedPlate.getSelectedWellsInOrder();
                                let index = 0;

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push ( v )
                                }
                                let m = interquartileRange ( lv );
                                let w = new GenericWell('', m);
                                let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                                w.setGroup('IQR')
                                w.equations[functionToBase64(interquartileRange)]=selected_wells.map(_o =>  _o.uid);
                                selectedPlate.appendColumn ( w, cr.colIdx )
                                pt.wb(null)

                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                        move: () => {
                        },
                    });

                    msub.push(
                        {
                            label: 'Z-scores',
                            click: async (x, y) => {
                                try {

                                    let selected_wells = selectedPlate.getSelectedWellsInOrder();
                                    let index = 0;

                                    let lv = []
                                    for (let item of selected_wells) {
                                        let v = item.value;
                                        lv.push ( v )
                                    }
                                    let m = zScores ( lv );
                                    let w = new GenericWell('', m);
                                    let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                                    w.setGroup('zScores')
                                    w.equations[functionToBase64(zScores)]=selected_wells.map(_o =>  _o.uid);
                                    selectedPlate.appendColumn ( w, cr.colIdx )
                                    pt.wb(null)

                                } catch (err) {
                                    console.error('Failed to read from clipboard: ', err); pt.wb(null)
                                }
                            },
                            move: () => {
                            },
                        });

                        msub.push(
                            {
                                label: 'Outliers',
                                click: async (x, y) => {
                                    try {

                                        let selected_wells = selectedPlate.getSelectedWellsInOrder();
                                        let index = 0;

                                        let lv = []
                                        for (let item of selected_wells) {
                                            let v = item.value;
                                            lv.push ( v )
                                        }
                                        let m = detectOutliers ( lv );
                                        let w = new GenericWell('', m);
                                        let cr = selectedPlate.getWellIndicies ( selected_wells[selected_wells.length-1])
                                        w.setGroup('Outliers')
                                        w.equations[functionToBase64(detectOutliers)]=selected_wells.map(_o =>  _o.uid);
                                        selectedPlate.appendColumn ( w, cr.colIdx )
                                        pt.wb(null)

                                    } catch (err) {
                                        console.error('Failed to read from clipboard: ', err); pt.wb(null)
                                    }
                                },
                                move: () => {
                                },
                            });

            smenu = new Menu(msub, upx, upy, 'rgb(0, 87, 163)', 'white')
            pt.wb(null)
            let t = {
                id: 'select-cell-col-function-options-menu',
                mouseDownListener: async (x, y) => {
                    if (selectedPlate) {
                        selectedPlate.textActive = false;
                        selectedPlate.text = ''

                    }
                },
                priority: true,
                mouseMoveListener: (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    selectedPlate.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }
                },
                mouseUpListener: async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                },
                draw: (grid, ctx) => {
                    if (smenu) {
                        smenu.draw(ctx, grid)
                    }
                },
                close: () => {
                    smenu = null;

                },
                menuManager: null,
                smenu: smenu
            }
            pt.wb(t)
        }

        const ls = {

            'Select function': () => {
                let md = false;
                let mouseDownListener = async (x, y) => {
                    md = true;
                    freezFrame = false;
                    let xw = pt.grid.Xwc(x);
                    let yw = pt.grid.Ywc(y);
                    if (selectedPlate) {
                        selectedPlate.textActive = false;
                        selectedPlate.text = ''

                    }

                    let current_well = selectedPlate.getWell(xw, yw);
                    if (current_well) {
                        selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                    }
                };

                let mouseMoveListener = (x, y) => {
                    if (md) {
                        freezFrame = false;
                        if (selectedPlate) {
                            selectedPlate.textActive = false;
                            selectedPlate.text = ''

                        }

                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                        }
                    }
                }

                let mouseUpListener = (x, y) => {
                    if (selectedPlate) {
                        selectedPlate.textActive = false;
                        selectedPlate.text = ''

                    }

                    createEditColMenu(pt, pt.grid.Xwc(x), pt.grid.Ywc(y))
                    md = false;
                };

                let t = {
                    id: 'select-cell-col-function-menu',
                    mouseMoveListener: mouseMoveListener,
                    mouseUpListener: mouseUpListener,
                    mouseDownListener: mouseDownListener,
                    draw: (grid, ctx) => {

                    },
                    close: () => {
                    },
                    menuManager: null,
                    smenu: smenu
                }

                pt.wb(t)

            },
            'Add Column function': () => {
                exec('baja/plate/ops/function-table-ops.js', pt, selectedPlate)
            },
            'Append cell function'
                : async () => {
                    let va = await prompt("Function name", ["Name"], { "Name": this.name }, 300, 300)
                    let m = va['Name']
                    if (m != null) {
                        exec('baja/plate/ops/function-cell-ops.js', pt, selectedPlate)

                    }
                },
        }

        let d = findScatterPlotData(selectedPlate.wells)

        if (d.scatterPlotData != null && d.scatterPlotData.length > 0) {
            ls['Plot...'] = () => {
                let sca = generateScatterData(selectedPlate.wells);

                const combinedPlot = new MPlot(sca);
                combinedPlot.x_axis_label = 'Wells';
                combinedPlot.y_axis_label = 'Fluorescense';

                combinedPlot.errorBarColor = 'gray';
                combinedPlot.fitScaleToData = true;
                combinedPlot.type = 'barchart'

                const maxX = Math.max(...sca.points.map(p => p.x));
                const maxY = Math.max(...sca.points.map(p => p.y));
                combinedPlot.setxmax(maxX);
                combinedPlot.setymax(maxY);
                combinedPlot.grid.width = 1;
                combinedPlot.grid.height = 1;
                combinedPlot.setxmin(0);
                combinedPlot.grid.rescale();
                pt.resetState();
                pt.setPlot(combinedPlot, selectedPlate.grid.xi, selectedPlate.grid.yi - 1.5);
            }
        }
        if (d.scatterPlotData != null && d.scatterPlotData.length > 0) {
            ls['Plot Mean'] = () => {

                let sca = generateScatterData(selectedPlate.wells, ['Mean']);

                showModal({
                    wid: 'json',
                    data: JSON.stringify(sca)
                })

                const combinedPlot = new MPlot(sca);
                combinedPlot.x_axis_label = 'Wells';
                combinedPlot.y_axis_label = 'Fluorescense';

                combinedPlot.errorBarColor = 'gray';
                combinedPlot.fitScaleToData = true;
                combinedPlot.type = 'barchart'

                const maxX = Math.max(...sca.points.map(p => p.x));
                const maxY = Math.max(...sca.points.map(p => p.y));
                combinedPlot.setxmax(maxX);
                combinedPlot.setymax(maxY);
                combinedPlot.grid.width = 1;
                combinedPlot.grid.height = 1;
                combinedPlot.setxmin(0);
                combinedPlot.grid.rescale();
                pt.resetState();
                pt.setPlot(combinedPlot, selectedPlate.grid.xi, selectedPlate.grid.yi - 1.5);
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
                                    if (well.getGroup('STANDARD') && well.position === ww && well.value !== null && well.obj === obj.obj) {
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

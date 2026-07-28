function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')

        function checkAndCastToNumber(str) {

            if (str != null && typeof str === 'number') {
                return str;
            }
            else if (str != null && typeof str === 'string') {
                str = str.trim();
            }
            else if (str === null || str === undefined) {
                str = '';
            }
            const numberPattern = /^-?\d+(\.\d+)?$/;
            if (numberPattern.test(str)) {
                let number = Number(str)
                if (Number.isInteger(number)) {
                    return parseInt(number)
                }
                return Number(str);
            } else {
                return str;
            }
        }

        async function plotStandard(plate1, pt, bajabio, pty) {

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
            combinedPlot.x_axis_label = 'Quantity'
            combinedPlot.y_axis_label = 'Fluorescence'

            let index = 0;
            const values = standardGroups.map(well => [checkAndCastToNumber(well.concentration), checkAndCastToNumber(well.value)]);
            const { slope, intercept, rSquared } = linearRegression(values);
            const color = colorPalette[index++];

            const concentrationGroups = standardGroups.reduce((acc, well) => {
                const key = well.concentration;
                if (!acc[key]) {
                    acc[key] = { sum: 0, count: 0, uids: [] };
                }
                acc[key].sum += well.value;
                acc[key].count += 1;
                acc[key].uids.push(well.uid);
                return acc;
            }, {});

            const averagedScatterData = {
                points: Object.entries(concentrationGroups).map(([concentration, data]) => ({
                    uid: uuid(),
                    ref: data.uids,
                    x: parseFloat(concentration),
                    y: data.sum / data.count,
                    name: `${concentration}`,
                    color: color
                }))
            };

            allScatterData.points = allScatterData.points.concat(averagedScatterData.points);
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

            combinedPlot.w = pt.grid.worldWidth(200)
            combinedPlot.h = pt.grid.worldHeight(200)
            combinedPlot.x = pt.grid.Xwc(200)
            combinedPlot.y = pt.grid.Ywc(200)
            let ctx = (pt.grid.width - 200) / 2
            let cty = (pt.grid.height - 200) / 2
            combinedPlot.x = pt.grid.Xwc(ctx);
            combinedPlot.y = pt.grid.Ywc(cty);
            pt.setPlot(combinedPlot, ctx, cty);
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

        function linearRegression(data2D) {
            const n = data2D.length;

            const sumX = data2D.reduce((sum, pair) => sum + pair[0], 0);
            const sumY = data2D.reduce((sum, pair) => sum + pair[1], 0);
            const sumXY = data2D.reduce((sum, pair) => sum + pair[0] * pair[1], 0);
            const sumXX = data2D.reduce((sum, pair) => sum + pair[0] * pair[0], 0);
            const meanX = sumX / n;
            const meanY = sumY / n;

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = meanY - slope * meanX;

            const ssTotal = data2D.reduce((sum, pair) => sum + Math.pow(pair[1] - meanY, 2), 0);
            const ssResidual = data2D.reduce((sum, pair) => sum + Math.pow(pair[1] - (slope * pair[0] + intercept), 2), 0);
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
            'Plot Standard Curve (barchart)': async () => {

                let current_json = selectedPlate.toValueFormulaJSON();
                const fstandards = await exec('py/analytics/ribogreen/find-standards.py', current_json)

                selectedPlate.deselectAll();

                if (fstandards && fstandards.result && fstandards.result.length > 0) {
                    let www = selectedPlate.selectWellsByUID(fstandards.result[0].well_uids);
                    selectedPlate.zoomToSelectedWells(pt)
                }

                showModal({
                    wid: 'json',
                    data: JSON.stringify(fstandards.result)
                })



                let points = [];
                selectedPlate.wells.forEach(row => {
                    row.forEach(well => {

                        if (well && well.getGroup("STANDARD") && well.value !== null) {
                            points.push({
                                name: well.concentration + ' ' + well.position,
                                x: well.concentration,
                                y: well.value
                            });
                        }
                    });
                });
                const scatterData = {
                    points: points
                };
                const plot = new MPlot(scatterData);
                plot.lineColor = 'blue';
                plot.pointColor = 'red';
                plot.errorBarColor = 'gray';
                plot.fitScaleToData = true;
                plot.type = 'barchart'
                pt.resetState()

                pt.setPlot(plot, (selectedPlate.grid.xi), (selectedPlate.grid.yi) - 2);
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

        ls['Transpose'] = async () => {
            console.log('debubg');
            selectedPlate.wells = selectedPlate.transposeWells(selectedPlate.wells);
            selectedPlate.grid.xmax = selectedPlate.wells.length;
            selectedPlate.grid.ymax = selectedPlate.wells[0].length;
            selectedPlate.grid.width = (selectedPlate.grid.xmax * pt.grid.worldWidth(1))
            selectedPlate.grid.height = (selectedPlate.grid.ymax * pt.grid.worldHeight(20))
            selectedPlate.grid.rescale();
            pt.zoomintoplate(selectedPlate)

        },

            resolve(ls)
    })

}

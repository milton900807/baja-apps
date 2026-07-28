function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')

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

                            if (well.getGroup('StdDev') && previousPoint) {
                                previousPoint.stdDev = well.value;
                            } else if (groups === null || groups.includes(well.getGroups())) {

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

        function suggestPlots(wells) {
            const columnCount = wells.length;
            const rowCount = wells[0]?.length || 0;

            const filterColumn = (column) => {
                const values = column.map(well => well?.value).filter(value => value !== '' && value !== null);
                const uniqueValues = [...new Set(values)];
                return uniqueValues.length > 1 ? uniqueValues : null;
            };

            const analyzeColumn = (values) => {
                let containsStrings = false;
                let containsNumbers = false;

                values.forEach((value) => {
                    if (typeof value === 'string' && isNaN(Number(value))) {
                        containsStrings = true;
                    } else if (!isNaN(parseFloat(value))) {
                        containsNumbers = true;
                    }
                });

                return { containsStrings, containsNumbers };
            };

            const suggestPlotType = (valuesA, valuesB) => {
                const aType = analyzeColumn(valuesA);
                const bType = analyzeColumn(valuesB);

                if (aType.containsNumbers && bType.containsNumbers) {
                    return 'Scatter Plot';
                } else if (
                    (aType.containsStrings && bType.containsNumbers) ||
                    (aType.containsNumbers && bType.containsStrings)
                ) {
                    return 'Bar Chart';
                } else {
                    return null;
                }
            };

            const plottablePairs = [];

            for (let colA = 0; colA < columnCount; colA++) {
                const filteredA = filterColumn(wells[colA]);
                if (!filteredA) continue;

                for (let colB = colA + 1; colB < columnCount; colB++) {
                    const filteredB = filterColumn(wells[colB]);
                    if (!filteredB) continue;

                    const plotType = suggestPlotType(filteredA, filteredB);
                    if (plotType) {
                        plottablePairs.push({
                            columns: [colA, colB],
                            plotType,
                        });
                    }
                }
            }

            return plottablePairs;
        }

        ls = {}

        let welldimensions = selectedPlate.getSelectedWellsInOrder();
        if (welldimensions.length > 0 && welldimensions.length % 2 === 0) {
            function splitArrayInHalf(arr) {
                const middleIndex = Math.ceil(arr.length / 2);
                const firstHalf = arr.slice(0, middleIndex);
                const secondHalf = arr.slice(middleIndex);

                return [firstHalf, secondHalf];
            }

            ls['Bar chart'] = async () => {
                const [firstHalf, secondHalf] = splitArrayInHalf(welldimensions);
                const points = firstHalf.map((well, index) => {
                    return {
                        x: well.value,
                        y: secondHalf[index] ? secondHalf[index].value : null,
                        stdDev: secondHalf[index] ? secondHalf[index].stdDev : null
                    };
                });
                let scatterData = {
                    points: points
                }

                let MPlot = await exec("flexigraph/plot.js");
                const plot = new MPlot(scatterData)
                plot.errorBarColor = 'gray';
                plot.fitScaleToData = false;
                plot.type = 'barchart'
                plot.name = 'untitled'
                const maxX = Math.max(...scatterData.points.map(p => p.x));
                const maxY = Math.max(...scatterData.points.map(p => p.y));
                plot.grid.setxmax(maxX);
                plot.grid.setymax(maxY);
                plot.grid.setxmin(0);
                plot.setWidth(pt.grid.worldWidth(400))
                plot.setHeight(pt.grid.worldHeight(400))
                plot.grid.rescale();
                pt.setPlotCenter(plot)
                pt.setNextToPlate(plot, selectedPlate, (selectedPlate.grid.yi + selectedPlate.grid.height - (plot.h / 3)));

                setTimeout(() => {
                    pt.zoomintoplot(plot)

                }, 299)
            }
        }

        ls[`Set table type`] = async () => {

            let attr_window = ''
            let va = await prompt("Type", ["Type"], { "Type": attr_window }, 300, 300)
            let m = va['Type']
            const v___ = selectedPlate.getTopRowAndFirstColumnValues();
            let jsonobj = {
                 key: m,
                 type: v___
            }
            selectedPlate.plateType = m;
            let host_ = window['env']['apiUrl']

        }

        return resolve(ls)

    })

}

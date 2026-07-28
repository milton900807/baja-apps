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

        const ls = {
            'Linear regression'
                : async () => {

                    let allScatterData = {
                        points: []
                    };
                    let Plot = await exec('flexigraph/plot')
                    let p = new Plot(allScatterData)
                    let code = {
                        x: `${selectedPlate.name}[Tag]`,
                        y: `${selectedPlate.name}[Value]`,
                        equation: 'linearregression',
                        name: selectedPlate.name

                    }
                    p.applyConfig(code, pt);
                    p.w = pt.grid.worldWidth(400);
                    p.h = pt.grid.worldHeight(300)
                    p.grid.height = p.h;
                    p.grid.width = p.w;
                    p.config_script.plot = {
                        lineColor: 'lightBlue',
                        pointColor: 'red',
                        errorBarColor: 'gray',
                        fitScaleToData: true
                    };
                    await pt.panToNextSpot(10);
                    setTimeout(() => {
                        pt.setPlotCenter(p)

                    })

                },
            'Bar chart': async () => {

                let allScatterData = {
                    points: []
                };
                let Plot = await exec('flexigraph/plot')
                let p = new Plot(allScatterData)

                let code = {
                    x: `${selectedPlate.name}[Tag]`,
                    y: `${selectedPlate.name}[Value]`,
                    stdDev: `${selectedPlate.name}[Stdev]`,
                    type: 'barchart',
                    drawErrors: true
                }
                p.applyConfig(code, pt);
                p.w = pt.grid.worldWidth(400);
                p.h = pt.grid.worldHeight(300)
                p.grid.height = p.h;
                p.grid.width = p.w;
                p.config_script.plot = {
                    lineColor: 'blue',
                    pointColor: 'red',
                    errorBarColor: 'gray',
                    fitScaleToData: true,
                    type: 'barchart',
                    drawErrors: true

                };

                await pt.panToNextSpot(10);

                pt.setPlot(p)
                pt.setNextToPlate(p, selectedPlate, selectedPlate.grid.y)

                setTimeout(() => {
                    pt.setPlotCenter(p)

                })

            },
            'Dose-response': async () => {
                let allScatterData = {
                    points: []
                };
                let Plot = await exec('flexigraph/plot')
                let p = new Plot(allScatterData)
                let code = {
                    x: `${selectedPlate.name}[Tag]`,
                    y: `${selectedPlate.name}[Value]`,
                    stdDev: `${selectedPlate.name}[Stdev]`,
                    type: 'scatter',
                    drawErrors: true
                }

                await p.applyConfig(code, pt);
                console.log('debubg');
                function extractDoseResponse(scatterData) {

                    const doses = [];
                    const responses = [];

                    scatterData.points.forEach(point => {

                        doses.push(point.x);
                        responses.push(point.y);
                    });

                    return {
                        doses,
                        responses
                    };
                }

                let { doses, responses } = extractDoseResponse(p.scatterData)

                console.log('debubg');
                let ic50js = await exec('py/baja/dose-response/ic50.py', doses, responses);

                const drawDoseResponseCurve = (grid, ctx, data) => {
                    const doseResponse = data['dose-response'];
                    const { IC50, top, bottom, hill_slope, doses, responses } = doseResponse;

                    function sigmoid(dose) {
                        return bottom + (top - bottom) / (1 + Math.pow(dose / IC50, hill_slope));
                    }

                    const minDose = Math.min(...doses);
                    const maxDose = Math.max(...doses);
                    const numPoints = 500;

                    const polygonPoints = [];
                    for (let i = 0; i < numPoints; i++) {
                        const dose = minDose * Math.pow(maxDose / minDose, i / (numPoints - 1));
                        const response = sigmoid(dose);
                        polygonPoints.push([dose, response]);
                    }

                    const polygon = polygonPoints;

                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    let scx = grid.X(polygon[0][0]);
                    ctx.moveTo(scx, grid.Y(polygon[0][1]));
                    for (let i = 1; i < polygon.length; i++) {
                        let lx = grid.X(polygon[i][0]);
                        let ly = grid.Y(polygon[i][1]);
                        ctx.lineTo(lx, ly);
                    }
                    ctx.stroke();

                    const IC50X = grid.X(IC50);
                    ctx.strokeStyle = 'red';
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(IC50X, grid.Y(top));
                    ctx.lineTo(IC50X, grid.Y(bottom));
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = 'black';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'left';

                    const textX = IC50X + 10;
                    const textY = grid.Y(top) + 30;

                    ctx.fillText(`IC50: ${IC50.toFixed(2)} `, textX, textY);

                }
                p.addLineEquation({
                    label: ' Dose-response',
                    data: JSON.parse(ic50js),
                    mfunction: drawDoseResponseCurve
                })

                p.w = pt.grid.worldWidth(400);
                p.h = pt.grid.worldHeight(300)
                p.grid.height = p.h;
                p.grid.width = p.w;
                p.config_script.plot = {
                    lineColor: 'blue',
                    pointColor: 'red',
                    errorBarColor: 'gray',
                    fitScaleToData: true,
                    type: 'dose-response',
                    drawErrors: true

                };
                pt.setPlot(p)
                pt.setNextToPlate(p, selectedPlate, selectedPlate.grid.y)
                setTimeout(() => {
                    pt.zoomintoplot(p)

                }, 299)

            },

        }

        if (selectedPlate.hasSelectedWells()) {

        }

        resolve(ls)
    })

}

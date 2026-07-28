function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
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

        ls['Apply well address to plate'] = async (x, y) => {

            let indexToWellAddress = (index, __cols) => {
                const rowLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                let row = Math.floor(index / __cols);
                let col = (index % __cols) + 1;
                if (row >= rowLetters.length) {
                    throw new Error('Row index out of range');
                }
                let rowLetter = rowLetters.charAt(row);
                return `${rowLetter}${col}`;
            }
            let generateWellAddresses = (rows, cols) => {
                let wellAddresses = [];
                for (let index = 0; index < rows * cols; index++) {
                    wellAddresses.push(indexToWellAddress(index, cols));
                }
                return wellAddresses;
            }

            let arr = generateWellAddresses(selectedPlate.grid.ymax, selectedPlate.grid.xmax);
            let numRows = Math.floor(selectedPlate.grid.xmax);
            let numCols = Math.floor(selectedPlate.grid.ymax);
            let index = 0;
            console.log(" apply the well address to the palte  ");
            for (let col = 0; col < numCols; col++) {
                for (let row = 0; row < numRows; row++) {
                    if (index < arr.length) {
                        selectedPlate.wells[row][col].name = arr[index];
                        selectedPlate.wells[row][col].position = arr[index];
                        selectedPlate.wells[row][col].value = arr[index];
                        index++;
                    }
                }
            }
        }

        resolve(ls)
    })

}

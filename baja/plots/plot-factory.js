function (plateTrack) {

    function splitTextIntoChunks(text) {

        const splitPattern = /^x=/gm;

        const chunks = text.split(splitPattern)
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length > 0);

        return chunks.map(chunk => 'x=' + chunk);
    }

    let ref;

    function linearRegression(allScatterData) {
        console.log('debubg');
        const points = allScatterData.points;

        if (points.length === 0) {
            throw new Error("The points array is empty.");
        }

        const x = points.map(point => point.x);
        const y = points.map(point => point.y);

        const n = points.length;

        const sumX = x.reduce((sum, xi) => sum + xi, 0);
        const sumY = y.reduce((sum, yi) => sum + yi, 0);
        const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        const meanX = sumX / n;
        const meanY = sumY / n;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = meanY - slope * meanX;

        const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
        const ssResidual = points.reduce(
            (sum, point) => sum + Math.pow(point.y - (slope * point.x + intercept), 2),
            0
        );
        const rSquared = 1 - ssResidual / ssTotal;

        return { slope, intercept, rSquared };
    }

    function generateColor(percent) {
        percent = Math.max(0, Math.min(100, percent));
        const red = Math.floor((100 - percent) * 255 / 100);
        const green = Math.floor(percent * 255 / 100);
        const color = '#' + componentToHex(red) + '00' + componentToHex(green);
        return color;
    }

    let new_plate_panel;
    let __nameHook___ = createIonFunction((ed) => {
        new_plate_panel = ed;
    });

    let editor;
    let innerComponentCallback__ = createIon((_panel) => {
        editor = _panel;
        if (editor) {
            editor.setContent('')
        }
    })

    let parseInput = (inputString) => {
        const parsedObj = {};
        const lines = inputString.trim().split('\n');
        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key !== undefined && value !== undefined) {
                parsedObj[key.trim()] = value.trim();
            } else {
                console.warn(`Invalid line format: ${line}`);
            }
        });

        return parsedObj;
    }
    let buildMultiplePlots = async (code, mmx, mmy, mmw, mmh) => {

        let xMatches = splitTextIntoChunks(code.trim())
        if (xMatches.length <= 1) {

            let plot = await buildPlots(code, mmx, mmy, mmw, mmh);
            plateTrack.resetState()
            plateTrack.setPlot(plot);
            return;
        } else if (xMatches.length > 1) {
            let CompositePlot = await exec('flexigraph/composite-plot')
            let composite = new CompositePlot()
            for (let chunk of xMatches) {
                composite.addPlot(await buildPlots(chunk));
            }
            composite.w = mmw;
            composite.h = mmh;
            composite.x = mmx;
            composite.y = mmy;
            plateTrack.resetState()
            plateTrack.setPlot(composite);
            return;

        }

    };
    function analyzePoints(allScatterData) {
        const points = allScatterData.points;

        const xValues = points.map(point => parseFloat(point.x));
        const yValues = points.map(point => parseFloat(point.y));
        const areAllFloats = xValues.every(value => !isNaN(value)) && yValues.every(value => !isNaN(value));

        if (areAllFloats) {

            allScatterData.points = points.map(point => ({
                x: parseFloat(point.x),
                y: parseFloat(point.y)
            }));

            const xmin = Math.min(...xValues);
            const xmax = Math.max(...xValues);
            return { xmin, xmax };
        } else {
            const areAllStrings = points.every(point => typeof point.x === "string");
            if (areAllStrings) {

                const xmin = 0;
                const xmax = points.length;
                return { xmin, xmax, allScatterData };
            } else {
                const xmin = 0;
                const xmax = points.length;
                return { xmin, xmax, allScatterData };

            }
        }
    }

    let newPlot = async (name, config) => {
        let allScatterData = {
            points: []
        };

        let MPlot = await exec ('flexigraph/plot')

        function parsePlotObject(input) {

            const jsonStart = input.indexOf("{");
            const jsonEnd = input.lastIndexOf("}");
            const jsonString = input.substring(jsonStart, jsonEnd + 1);

            const data = JSON.parse(jsonString);

            const plot = new MPlot(data.plot.scatterData || []);
            plot.config_script = data.plot.config_script || {};
            plot.lineEquations = data.plot.lineEquations || [];
            plot.name = data.plot.name || "Unnamed Plot";
            plot.scaleType = data.plot.scaleType || "linear";

            plot.fixed_xmax = data.plot.fixed_xmax || null;
            plot.fixed_ymax = data.plot.fixed_ymax || null;
            plot.fixed_xmin = data.plot.fixed_xmin || null;
            plot.fixed_ymin = data.plot.fixed_ymin || null;
            plot.x = data.plot?.x || 0;
            plot.y = data.plot?.y || 0;
            plot.w = data.plot?.w || 0;
            plot.h = data.plot?.h || 0;
            plot.type = data.plot.type || "scatter";
            plot.lineColor = data.plot?.lineColor || "black";
            plot.pointColor = data.plot?.pointColor || "black";
            plot.errorBarColor = data.plot?.errorBarColor || "black";
            plot.fitScaleToData = data.plot?.fitScaleToData || false;
            if (data.plot.code)
                plot.applyConfig(data.plot.code, plateTrack)

            return plot;
        }
        let plot = parsePlotObject ( config )
        plot.name = name;

        plateTrack.setPlot ( plot )
    }

    let buildPlots = async (code, mmx, mmy, mmw, mmh) => {
        let allScatterData = {
            points: []
        };
        let Plot = await exec('flexigraph/plot')
        let name = 'Untitled'
        let cdic = parseInput(code);
        let xvalues_expression = cdic['x']
        let yvalues_expression = cdic['y']

        if (!xvalues_expression) {
            xvalues_expression = 'index'
        }

        let yvalues = await exec('baja/plate/ops/frun-fun', yvalues_expression, plateTrack);
        if (xvalues_expression.startsWith('index')) {
            let extractParenthesisContent = (methodCall) => {
                const match = methodCall.match(/\(([^)]+)\)/);
                return match ? match[1].trim() : null;
            }
            const internal_expression = extractParenthesisContent(xvalues_expression);
            let xvalues = await exec('baja/plate/ops/frun-fun', internal_expression, plateTrack);
            let i = 0;
            for (let xv of xvalues.results) {
                let yv = yvalues.results[i++]
                allScatterData.points.push({
                    x: i,
                    y: yv,
                    name: `${xv}`,
                    color: 'blue'
                })
            }
        } else {
            let xvalues = await exec('baja/plate/ops/frun-fun', xvalues_expression, plateTrack);
            let i = 0;
            for (let xv of xvalues.results) {
                let yv = yvalues.results[i++]
                allScatterData.points.push({
                    x: xv,
                    y: yv,
                    name: `${xv}`,
                    color: 'blue'
                })
            }

        }

        allScatterData.points = allScatterData.points.filter(point => {
            return typeof point.y === 'number' && !isNaN(point.y);
        });

        if (cdic['type']) {
            if (cdic['type'].startsWith('barchart')) {

            } else {
                allScatterData.points = allScatterData.points.filter(point => {
                    return typeof point.x === 'number' && !isNaN(point.x);
                });
            }

            if (cdic['type'].indexOf('aggregate') > 0) {
                const aggregatedData = {};
                allScatterData.points.forEach(point => {
                    if (!aggregatedData[point.name]) {
                        aggregatedData[point.name] = [];
                    }
                    aggregatedData[point.name].push(point.y);
                });
                const aggregatedPoints = [];
                Object.keys(aggregatedData).forEach(xValue => {
                    const yValues = aggregatedData[xValue];
                    const mean = yValues.reduce((sum, val) => sum + val, 0) / yValues.length;
                    const variance = yValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / yValues.length;
                    const stdDev = Math.sqrt(variance);
                    aggregatedPoints.push({
                        x: xValue,
                        y: mean,
                        stdDev: stdDev,
                        name: xValue
                    });
                });
                allScatterData.points = aggregatedPoints;
            }

        }
        let plot = new Plot(allScatterData)
        plot.name = name;
        if (!plot.name) {
            plot.name = 'Untitled'
        }

        if (cdic['type']) {
            plot.type = cdic['type']
        }
        if (cdic['equation']) {
            if (cdic["equation"].toLowerCase() === 'linearregression') {
                let eqLabel = ''
                if (cdic['equation_label']) {
                    eqLabel = cdic['equation_label']
                }
                const { slope, intercept, rSquared } = linearRegression(allScatterData);
                plot.addLineEquation({
                    slope: slope,
                    intercept: intercept,
                    label: `${eqLabel}`,
                    color: 'black',
                    rSquared: rSquared
                });
            }
        }
        if (cdic['sort']) {
            if (cdic.sort.toLowerCase() === 'descending') {
                plot.sortDescending()
            } else if (cdic.sort.toLowerCase() == 'ascending') {
                plot.sortAscending();
            }
        }
        plot.x_axis_label = cdic['x-label']
        plot.y_axis_label = cdic['y-label']
        plot.fixed_ymin = cdic['ymin']
        plot.fixed_ymax = cdic['ymax']
        plot.fixed_xmin = cdic['xmin']
        plot.fixed_xmax = cdic['xmax']

        const result = analyzePoints(allScatterData);

        if (!plot.fixed_xmax) {
            plot.fixed_xmax = result.xmax
        }
        if (!plot.fixed_xmin) {
            plot.fixed_xmin = result.xmin
        }

        plot.lineColor = 'blue';
        plot.pointColor = 'red';
        plot.errorBarColor = 'gray';
        plot.w = mmw;
        plot.h = mmh;
        plot.x = mmx;
        plot.y = mmy;

        plot.fitScaleToData = true;

        cdic.plot = {
            lineColor: 'blue',
            pointColor: 'red',
            errorBarColor: 'gray',
            w: mmw,
            h: mmh,
            x: mmx,
            y: mmy,
            fitScaleToData: true
        };

        plot.config_script = cdic;

        return plot
    }

    return newPlot;

}

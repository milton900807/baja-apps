function () {

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

    function checkStandardGroupWellsInPlate(plate) {
        let standardCount = 0;

        plate.wells.forEach(row => {
            row.forEach(well => {
                if (well.getGroup("STANDARD")) {
                    standardCount++;
                }
            });
        });

        if (standardCount === 0) {
            return null;
        }

        return standardCount;
    }

    async function plotStandardGroupsByObj(plate1, plate2, pt) {
        let LogGrid = await exec('flexigraph/grid-with-logscales.js')
        const MPlot = await exec('flexigraph/plot')
        const standardGroups = {};
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
                if (well.getGroup( "STANDARD") && well.concentration !== null && well.value !== null) {
                    if (!standardGroups[well.obj]) {
                        standardGroups[well.obj] = [];
                    }
                    well.selectIt();
                    standardGroups[well.obj].push(well);
                }
            });
        });
        plate2.wells.forEach(row => {
            row.forEach(well => {
                if (well.getGroup( "STANDARD")&& well.concentration !== null && well.value !== null) {
                    if (!standardGroups[well.obj]) {
                        standardGroups[well.obj] = [];
                    }
                    well.selectIt();

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
                label: `${obj}`,
                color: color,
                rSquared: rSquared
            });
            console.log(`Added plot for Obj: ${obj} with slope: ${slope}, intercept: ${intercept}, R²: ${rSquared}`);
        });
        combinedPlot.type = 'line';
        combinedPlot.name = "STANDARDs";
        const maxX = Math.max(...allScatterData.points.map(p => p.x));
        const maxY = Math.max(...allScatterData.points.map(p => p.y));
        const minY = Math.min(...allScatterData.points.map(p => p.y));

        combinedPlot.name = "STANDARDs";
        combinedPlot.setxmax(200);
        combinedPlot.setxmin(0);
        combinedPlot.setymax(maxY);
        combinedPlot.setymin(minY);
        pt.setPlot(combinedPlot, (plate1.grid.xi + plate2.grid.xi) / 2, plate1.grid.yi - 1)
        return combinedPlot;

    }

    return {
        'Technical-replicates': {
            'Average':
                async (type, plate1, plate2, pt) => {
                    const GenericWell = await exec('baja/plate/well.js');
                    const Plate = await exec('baja/plate/plate.js');

                    function countValidWells(plate) {
                        let count = 0;
                        if (plate.wells) {
                            for (let x = 0; x < plate.wells.length; x++) {
                                if (plate.wells[x] != null) {
                                    for (let y = 0; y < plate.wells[x].length; y++) {
                                        const well = plate.wells[x][y];
                                        if (well && well.value !== null && isFinite(well.value)) {
                                            count++;
                                        }
                                    }
                                }
                            }
                        }
                        return count;
                    }

                    const plate1ValidWells = countValidWells(plate1);
                    const plate2ValidWells = countValidWells(plate2);
                    const primaryPlate = plate1ValidWells >= plate2ValidWells ? plate1 : plate2;
                    const secondaryPlate = primaryPlate === plate1 ? plate2 : plate1;

                    const newPlate = new Plate(primaryPlate.name + "_Averaged", primaryPlate.grid.xmax, primaryPlate.grid.ymax);

                    for (let x = 0; x < primaryPlate.grid.xmax; x++) {
                        for (let y = 0; y < primaryPlate.grid.ymax; y++) {
                            let primaryWell = primaryPlate.wells[x] && primaryPlate.wells[x][y] ? primaryPlate.wells[x][y] : null;
                            let secondaryWell = secondaryPlate.wells[x] && secondaryPlate.wells[x][y] ? secondaryPlate.wells[x][y] : null;

                            let newWell = new GenericWell(primaryWell ? primaryWell.name : secondaryWell ? secondaryWell.name : `Well ${x}${y}`);

                            if (primaryWell) {
                                Object.assign(newWell, primaryWell);
                            } else if (secondaryWell) {
                                Object.assign(newWell, secondaryWell);
                            }

                            if (primaryWell && isFinite(primaryWell.value) && secondaryWell && isFinite(secondaryWell.value)) {
                                newWell.value = (primaryWell.value + secondaryWell.value) / 2;
                            } else if (primaryWell && isFinite(primaryWell.value)) {
                                newWell.value = primaryWell.value;
                            } else if (secondaryWell && isFinite(secondaryWell.value)) {
                                newWell.value = secondaryWell.value;
                            }

                            newPlate.wells[x][y] = newWell;
                        }
                    }

                    newPlate.barcode = primaryPlate.barcode;
                    newPlate.plateType = primaryPlate.plateType;
                    newPlate.location = primaryPlate.location;
                    newPlate.uid = uuid();

                    return newPlate;
                }
        },
        'Multiplexed Ct': {

            'Apply normalizing function':
                async (type, pt, context) => {
                    let plate1ref = context.references[0]
                    let plate2ref = context.references[1]
                    let plate1 = pt.getRef(plate1ref)
                    let plate2 = pt.getRef(plate2ref)
                    let md = false;

                    let setMenu = async (__smenu) => {
                        pt.updateworkbench({
                            smenu: __smenu,
                            priority: true,
                            init: () => {
                            },
                            mouseDownListener: (x, y) => {
                                __smenu.x = pt.grid.Xwc(x);
                                __smenu.y = pt.grid.Ywc(y)
                            },
                            mouseMoveListener: (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (__smenu && __smenu.isIn(pt.grid, mmx, mmy)) {
                                    __smenu.mouseMove(pt.grid, mmx, mmy)
                                }
                            },
                            draw: (grid, ctx) => {
                                __smenu.draw(ctx, grid)
                            },
                            mouseUpListener: async (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (__smenu && __smenu.isIn(pt.grid, mmx, mmy)) {
                                    await __smenu.mouseUp(pt.grid, mmx, mmy)

                                }
                            }
                        })
                    }
                    let generateNormalizedPlates = async (plates, equation, _y) => {
                        const Plate = await exec('baja/plate/plate.js');
                        for (let p of plates) {
                            const newPlate = new Plate(p.name + "_normalized", p.grid.xmax, p.grid.ymax);
                            newPlate.wells = p.deepCopyWells();
                            newPlate.plateType = 'data'
                            newPlate.grid.width = 1;
                            newPlate.grid.height = 1;
                            console.log('debubg');
                            for (let x = 0; x < p.wells.length; x++) {
                                if (p.wells[x] != null) {
                                    for (let y = 0; y < p.wells[x].length; y++) {
                                        const well = p.wells[x][y];
                                        if (well && well.value !== null && isFinite(well.value)) {
                                            let x = well.value;
                                            let newValue = equation.slope * x + equation.intercept;
                                            console.log ( " new value " + newValue )
                                            newPlate.wells[x][y].value = newValue;
                                        }
                                    }
                                }
                            }
                            pt.setPlate ( newPlate, p.grid.xi, _y)

                        }

                    }

                    let getPlot = (scx, scy) => {

                        for (let plot of pt.m_plots) {
                            if (plot._highlight === true && plot.inside(pt.grid, scx, scy)) {
                                return plot;
                            }
                        }

                        for (let plot of pt.m_plots) {
                            if (plot._highlight !== true && plot.inside(pt.grid, scx, scy)) {
                                return plot;
                            }
                        }

                        return null;
                    };

                    pt.updateworkbench({
                        id: 'select-function-move',
                        priority: true,
                        mouseMoveListener: async (x, y) => {
                            pt.unhighlightPlots()
                            md = false;
                            let plot = getPlot((x), (y))
                            let Menu = await exec('flexigraph/menu.js')
                            if (plot) {
                                plot.highlight();
                                pt.setMessage(" Select a function...")
                                let equations = plot.lineEquations;
                                let tools_menu = []

                                for (let obj of equations) {
                                    tools_menu.push({
                                        'label': `y=${obj.slope.toFixed(2)}x+${obj.intercept.toFixed(2)}`, click: (async () => {
                                            generateNormalizedPlates([plate1, plate2], obj, (pt.grid.Ywc(y)-1))
                                            setTimeout(async () => {
                                                pt.wb(null)
                                            }, 100)
                                        }
                                        )
                                    })
                                }
                                if (tools_menu.length > 0) {
                                    let m = new Menu(tools_menu, x, y)
                                    await setMenu(m)
                                }

                            }

                        }
                        ,
                        mouseUpListener: async (x, y) => {

                        },
                        mouseDownListener: async (x, y) => {

                        },
                        draw: () => {

                        },
                        close: () => {

                        }
                    })

                },

            'Plot standard curve':
                async (type, pt, context) => {

                    let plate1ref = context.references[0]
                    let plate2ref = context.references[1]
                    let plate1 = pt.getRef(plate1ref)
                    let plate2 = pt.getRef(plate2ref)

                    if (!checkStandardGroupWellsInPlate(plate1)) {
                        pt.setMessage(" Standards not found in " + plate1.name)
                    }
                    if (!checkStandardGroupWellsInPlate(plate2)) {
                        pt.setMessage(" Standards not found in " + plate2.name)
                    }

                    plotStandardGroupsByObj(plate1, plate2, pt);

                }, '\u0394 Ct':
                async (type, pt, context) => {

                    let plate1ref = context.references[0]
                    let plate2ref = context.references[1]
                    let plate1 = pt.getRef(plate1ref)
                    let plate2 = pt.getRef(plate2ref)

                    let combinedPlot = await plotStandardGroupsByObj(plate1, plate2, pt);
                    let combinedEquations = combinedPlot.lineEquations
                    const Plate = await exec('baja/plate/plate')
                    const MPlot = await exec('flexigraph/plot')
                    let GenericWell = await exec('baja/plate/well.js')
                    const Connection = await exec('baja/plate/connect')
                    const objValues = {};
                    const objSet = new Set();
                    function find_objs(plate) {
                        plate.wells.forEach(row => {
                            row.forEach(well => {
                                if (well.obj) {
                                    objSet.add(well.obj);
                                }
                            });
                        });
                    }
                    find_objs(plate1)
                    find_objs(plate2)

                    let objCriteria = Array.from(objSet);

                    function processPlateWells(plate) {
                        plate.wells.forEach(row => {
                            row.forEach(well => {
                                if (well.obj && objCriteria.includes(well.obj) && well.group.toLowerCase() === 'utc') {
                                    if (!objValues[well.obj]) {
                                        objValues[well.obj] = [];
                                    }

                                    objValues[well.obj].push(well.value);
                                }
                            });
                        });
                    }

                    processPlateWells(plate1);
                    processPlateWells(plate2);

                    const objAverages = {};
                    for (const obj in objValues) {
                        const values = objValues[obj];
                        const total = values.reduce((acc, val) => acc + val, 0);
                        objAverages[obj] = total / values.length;
                    }

                    function calculateDCT(plate, newPlate, objAverages) {
                        plate.wells.forEach((row, x) => {
                            row.forEach((well, y) => {
                                if (newPlate.wells[x][y] && well && well.obj && objAverages[well.obj] !== undefined && well.value !== null) {
                                    newPlate.wells[x][y].value = objAverages[well.obj] - well.value;
                                    newPlate.wells[x][y].properties.ct = well.value;

                                }
                            });
                        });
                    }

                    let newPlate1 = Plate.buildPlateFromJSON((plate1).toJSON());
                    let newPlate2 = Plate.buildPlateFromJSON((plate2).toJSON());
                    newPlate1.name = '\u0394 Ct ' + plate1.name
                    newPlate2.name = '\u0394 Ct ' + plate2.name
                    newPlate1.uid = uuid();
                    newPlate2.uid = uuid();

                    calculateDCT(plate1, newPlate1, objAverages);
                    calculateDCT(plate2, newPlate2, objAverages);

                    plate1.plates.push(newPlate1);
                    newPlate1.grid.xi = plate1.grid.xi
                    newPlate1.grid.yi = plate1.grid.yi - 4
                    newPlate1.grid.width = 1;
                    newPlate1.grid.height = 1;

                    plate2.plates.push(newPlate2);
                    newPlate2.grid.xi = plate2.grid.xi
                    newPlate2.grid.yi = plate2.grid.yi - 4
                    newPlate2.grid.width = 1;
                    newPlate2.grid.height = 1;

                    let c = new Connection(newPlate1.uid, newPlate2.uid)
                    c.type = 'Multiplexed \u0394 Ct'
                    pt.addConnection(c);
                    function getObjectByObjValue(arr, objValue) {
                        return arr.find(item => item.label === objValue);
                    }

                    let columns = Object.keys(objAverages).length;

                    function calculateEfficiency(slope) {
                        if (slope === 0) {
                            throw new Error("Slope cannot be zero.");
                        }

                        const efficiency = Math.pow(10, -1 / slope) - 1;
                        return efficiency * 100;
                    }
                    const efficiencies = new Plate("Efficiency", columns, 3);
                    let k = Object.keys(objAverages)
                    let x = 0;
                    for (let key of k) {
                        let newWell = new GenericWell(`${key}`);
                        newWell.wellType = 'header'
                        efficiencies.wells[x][0] = newWell;
                        let newWell1 = new GenericWell(`${key}`);
                        newWell1.value = objAverages[key]
                        newWell1.obj = key;
                        newWell1.wellType = 'simple_value'

                        efficiencies.wells[x][1] = newWell1;

                        let obj = getObjectByObjValue(combinedEquations, key)
                        let slope = obj['slope']
                        if (slope != null && slope === typeof 'string') {
                            slope = parseFloat(slope)
                        }
                        slope = slope * 100;

                        let vs = calculateEfficiency(slope)
                        let newWell2 = new GenericWell(`${vs}`);
                        newWell2.value = vs;
                        newWell2.wellType = 'simple_value'
                        efficiencies.wells[x][2] = newWell2;
                        x++;
                    }

                    pt.appendPlate(efficiencies)
                    let eff_connection = new Connection(efficiencies)
                    c.connections.push(eff_connection)

                }
        },
        'Multiplexed \u0394 Ct': {
            '\u0394_\u0394 Ct':
                async (type, pt, context) => {

                    const Plate = await exec('baja/plate/plate')
                    const Connection = await exec('baja/plate/connect')

                    let efficiency_table = null;
                    for (let conn of context.connections) {
                        if (conn.table1.name.toLowerCase().startsWith('eff')) {
                            efficiency_table = conn.table1;
                        }
                    }

                    let prv = null;
                    for (let p of context.references) {
                        let plate = pt.getRef(p)
                        let newPlate1 = Plate.buildPlateFromJSON((plate).toJSON());
                        newPlate1.uid = uuid();

                        plate.wells.forEach((row, x) => {
                            row.forEach((well, y) => {
                                let evi = efficiency_table.getWellWithObj(well.obj)
                                evi = evi / 100 + 1;
                                if (well && well.obj && evi !== null) {
                                    if (well.group != 'STANDARD' && well.group != 'UTC')
                                        newPlate1.wells[x][y].value = Math.pow(evi, well.value);
                                }
                            });
                        });
                        newPlate1.grid.xi = plate.grid.xi
                        newPlate1.grid.yi = plate.grid.yi - 2
                        newPlate1.grid.width = 1;
                        newPlate1.grid.height = 1;
                        plate.plates.push(newPlate1);

                        if (prv) {
                            prv.table2 = newPlate1
                            prv.type = 'Multiplexed \u0394\u0394 Ct'
                            pt.addConnection(prv)
                            prv = new Connection(newPlate1)
                        } else {
                            prv = new Connection(newPlate1)
                        }
                    }

                },

        },
        'Multiplexed \u0394\u0394 Ct': {
            'Plot %ctrl':
                async (type, pt, context) => {

                    const Plate = await exec('baja/plate/plate')
                    const Connection = await exec('baja/plate/connect')

                    const points = []
                    let px = 0;
                    let py = 2;
                    for (let p of context.references) {
                        let plate = pt.getRef(p)

                        px = plate.grid.xi;
                        py = plate.grid.yi - 3
                        let index = 0;
                        plate.wells.forEach((row, x) => {
                            row.forEach((well, y) => {
                                if (well && well.obj) {
                                    if (well.compoundId && well.group != 'STANDARD' && well.group != 'UTC' && well.value) {
                                        points.push({
                                            x: index,
                                            y: well.value,
                                            name: `${well.name}`,
                                            color: 'black'
                                        })
                                        index++;
                                    }
                                }
                            })
                        })

                    }

                    let scatterData = {
                        points: points
                    }
                    scatterData.points.sort((a, b) => a.y - b.y);

                    let MPlot = await exec('flexigraph/plot.js')

                    const combinedPlot = new MPlot(scatterData);
                    combinedPlot.x_axis_label = 'i'
                    combinedPlot.y_axis_label = '%Ctrl'
                    combinedPlot.type = 'barchart'
                    combinedPlot.setxmax(scatterData.points.length);
                    combinedPlot.setxmin(0);
                    combinedPlot.setymax(150);
                    combinedPlot.setymin(0);

                    pt.resetState();
                    pt.setPlot(combinedPlot, px, py);

                }

        },

    }

}

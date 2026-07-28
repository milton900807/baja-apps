function (text) {
    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        let Plate = await exec('baja/plate/plate.js')
        function findMaxRowAndCol(parsedArray) {

            const numRows = parsedArray.length;

            let numCols = 0;

            for (let i = 0; i < numRows; i++) {

                if (parsedArray[i].length > numCols) {
                    numCols = parsedArray[i].length;
                }
            }

            return {
                maxRows: numRows,
                maxCols: numCols
            };
        }

        function parseTo2DArray(inputText) {

            const rows = inputText.trim().split('\n');

            const resultArray = rows.map(row => row.split(/\t/));

            return resultArray;
        }

        function mapToWellsArray(parsedArray) {
            let res = findMaxRowAndCol(parsedArray)
            const numRows = res.maxRows;
            const numCols = res.maxCols;
            const wells = Array.from({ length: numCols }, () => []);

            for (let x = 0; x < numRows; x++) {
                for (let y = 0; y < numCols; y++) {
                    let value = parsedArray[x][y];

                    wells[y][x] = new GenericWell(value);

                }
            }

            return wells;
        }
        function parsePlateData(rawText) {
            let lines = []
            if (rawText == typeof 'string')
                lines = rawText.trim().split('\n');
            else
                lines = rawText;

            const positionRegex = /^[A-P][1-9][0-9]?$/;

            const wells = Array.from({ length: 24 }, () => Array(16).fill(null));

            const duplicateWells = new Map();
            console.log('debubg');

            for (let line of lines) {

                const columns = line.trim().split(/\t|\s{2,}/);
                const [position, group, value, obj] = columns.slice(0, 4);

                if (!positionRegex.test(position)) {
                    console.error(`Invalid position format: "${position}"`);
                    return false;
                }

                const col = position.charCodeAt(0) - 'A'.charCodeAt(0);
                const row = parseInt(position.slice(1)) - 1;

                if (value !== '' && isNaN(parseFloat(value))) {
                    console.error(`Invalid value: "${value}"`);
                    return false;
                }

                const well = new GenericWell(position, value, obj, group);

                if (wells[row][col] === null) {

                    wells[row][col] = well;
                } else {

                    if (!duplicateWells.has(position)) {
                        duplicateWells.set(position, [wells[row][col]]);
                    }
                    duplicateWells.get(position).push(well);
                }
            }

            const trimmedWells = wells.filter(row => row.some(well => well !== null));

            const multiplexedDatasets = [];
            duplicateWells.forEach((duplicateSet, position) => {

                const multiplexedSet = Array.from({ length: 24 }, () => Array(16).fill(null));

                for (let well of duplicateSet) {
                    const col = well.position.charCodeAt(0) - 'A'.charCodeAt(0);
                    const row = parseInt(well.position.slice(1)) - 1;
                    multiplexedSet[row][col] = well;
                }

                multiplexedDatasets.push(multiplexedSet);
            });

            return {
                wells: trimmedWells,
                multiplexedWells: multiplexedDatasets
            };
        }

        function splitDataIntoUniqueTables(rawData) {

            const lines = rawData.trim().split('\n');

            const tables = {};

            lines.forEach(line => {
                const columns = line.split(/\t/);
                const address = columns[0];
                if (!tables[address]) {
                    tables[address] = [];
                }
                tables[address].push(line);
            });

            return tables;
        }

        function processSplitTables(rawData) {

            const tables = splitDataIntoUniqueTables(rawData);

            let maxRowsPerAddress = 0;
            Object.values(tables).forEach(rows => {
                if (rows.length > maxRowsPerAddress) {
                    maxRowsPerAddress = rows.length;
                }
            });

            const numberOfTables = maxRowsPerAddress;
            const tableArray = Array.from({ length: numberOfTables }, () => []);

            Object.keys(tables).forEach(address => {
                const rows = tables[address];

                for (let i = 0; i < numberOfTables; i++) {
                    if (i < rows.length) {
                        tableArray[i].push(rows[i]);
                    } else {

                        tableArray[i].push(address);
                    }
                }
            });

            console.log('debubg');

            return tableArray;
        }

        function parseTable(tableText) {

            const parsedArray = parseTo2DArray(tableText);
            const wells = mapToWellsArray(parsedArray);
            return wells;
        }
        function detectPlateDataType(rawData) {
            let lines = [];

            if (Array.isArray(rawData)) {
                lines = rawData.map(line => line.trim());
            } else if (typeof rawData === 'string') {
                lines = rawData.trim().split('\n');
            } else {

                return 'unknown'
            }

            const firstLine = lines[0].split(/\t|\s{2,}/);

            const qpcrHeaders = ["Well Position"];

            const isQPCRHeader = qpcrHeaders.every(header => firstLine.includes(header));

            if (!isQPCRHeader) {
                const wellPositionRegex = /^[A-P][1-9][0-9]?$/;

                for (let i = 1; i < lines.length; i++) {
                    const columns = lines[i].split(/\t|\s{2,}/);

                    if (wellPositionRegex.test(columns[0])) {

                        return 'qpcr.no-header'

                    }

                }
            } else {
                return 'qpcr'
            }

            return 'unknown';
        }

        function parsePlateData(rawText) {

            let lines = rawText;
            if (rawText === typeof 'string') {
                lines = rawText.trim().split('\n');
            }

            const positionRegex = /^[A-P][1-9][0-9]?$/;

            const wells = Array.from({ length: 24 }, () => Array(16).fill(null));

            for (let line of lines) {
                const columns = line.trim().split(/\t|\s{2,}/);
                const [position, group, value, obj] = columns.slice(0, 4);

                if (!positionRegex.test(position)) {
                    console.error(`Invalid position format: "${position}"`);
                    return false;
                }

                const col = position.charCodeAt(0) - 'A'.charCodeAt(0);
                const row = parseInt(position.slice(1)) - 1;

                wells[row][col] = new GenericWell(position, value, obj, group);
            }
            const trimmedWells = wells.filter(row => row.some(well => well !== null));
            return trimmedWells;

        }
        function isValidPlateData(rawText) {

            const positionRegex = /^[A-P][1-9][0-9]?$/;

            const lines = rawText.trim().split('\n');

            for (let line of lines) {

                const columns = line.trim().split(/\t|\s{2,}/);

                const position = columns[0];

                if (positionRegex.test(position)) {

                    return true;
                }
            }

            return false;
        }

        function parseTable(table) {

            const lines = table.trim().split("\n");

            const headers = lines[0].split("\t");

            const wells = {};

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].split("\t");

                const wellPosition = line[0];
                const quantity = parseFloat(line[1]) || null;
                const target = line[2];
                const task = line[3];
                const cq = parseFloat(line[4]) || null;

                if (!wells[wellPosition]) {
                    wells[wellPosition] = [];
                }

                wells[wellPosition].push({
                    wellPosition,
                    quantity,
                    target,
                    task,
                    cq
                });
            }

            const resultArrays = [];

            Object.keys(wells).forEach(well => {
                const wellData = wells[well];

                if (wellData.length > 1) {
                    wellData.forEach(data => {
                        resultArrays.push(data);
                    });
                } else {
                    resultArrays.push(wellData[0]);
                }
            });

            return resultArrays;
        }

        const getQPCRParser = (header_string) => {
            return (rawText) => {

                let w = parseTable(rawText)
                const plates = [];
                let currentPlate = new Plate(`Plate 1`, 26, 16);

                currentPlate.type = 'qpcr'
                plates.push(currentPlate);

                let plateCount = 1;
                const lines = rawText.trim().split("\n");
                const headers = lines[0].split(/\t|\s{2,}/);

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].split("\t");

                    const wellPosition = line[0];
                    const quantity = parseFloat(line[1]) || null;
                    const target = line[2];
                    const task = line[3];
                    const cq = parseFloat(line[4]) || null;

                    const wellData = new GenericWell(wellPosition, wellPosition)
                    wellData.value = cq;
                    wellData.concentration = quantity;
                    wellData.obj = target;
                    wellData.setGroup(task);
                    wellData.position = wellPosition;

                    let wellAdded = false;

                    for (let plate of plates) {
                        if (plate.setWell(wellPosition, wellData)) {
                            wellAdded = true;
                            break;
                        }
                    }

                    if (!wellAdded) {
                        plateCount++;
                        currentPlate = new Plate(`Plate ${plateCount}`, 24, 16);

                        currentPlate.type = 'qpcr'
                        plates.push(currentPlate);
                        currentPlate.setWell(wellPosition, wellData);
                    }
                }

                for (let p of plates) {
                    p.completeNullValues()
                }

                return plates

            };
        };

        function createPlatesFromMultiplexedData(parsedData, xDimension, yDimension) {
            const { wells, multiplexedWells } = parsedData;

            const createDefaultWell = (row, col) => new GenericWell(`_${String.fromCharCode(65 + col)}${row + 1}`);

            let maxMultiplexCount = 1;
            multiplexedWells.forEach(multiplexSet => {
                multiplexSet.forEach(row => {
                    row.forEach(well => {
                        if (well !== null) {
                            const duplicates = multiplexedWells.flatMap(set => set).filter(w => w !== null && w.position === well.position);
                            maxMultiplexCount = Math.max(maxMultiplexCount, duplicates.length);
                        }
                    });
                });
            });

            const largestXDimension = Math.max(xDimension, wells.length);
            const largestYDimension = Math.max(yDimension, wells[0].length);

            const plates = Array.from({ length: maxMultiplexCount }, (_, index) => {

                const plate = new Plate(`Plate ${index + 1}`, largestXDimension, largestYDimension);

                return plate;
            });
            console.log('debubg');
            for (let plateIndex = 0; plateIndex < plates.length; plateIndex++) {
                for (let row = 0; row < multiplexedWells.length; row++) {
                    for (let col = 0; col < multiplexedWells[row].length; col++) {
                        const well = multiplexedWells[row][col] || createDefaultWell(row, col);
                        if (well != null && plates[plateIndex].wells && plates[plateIndex].wells[row])
                            plates[plateIndex].wells[row][col] = well;
                    }
                }
            }
            return plates;
        }
        function createPlateData(parsedData, xDimension, yDimension) {
            const wells = parsedData;
            const createDefaultWell = (row, col) => new GenericWell(`DWell${String.fromCharCode(65 + col)}${row + 1}`);
            const plate = new Plate(`Plate ${1}`, xDimension, yDimension);
            plate.wells = wells.map(row => row.map(well => well ? well : new GenericWell('')));

            return plate;

        }

        function detectDelimiter(inputString) {

            const delimiters = [',', ';', '|', '\t', ' ', ':', '-', '_', '/', '\\', '.'];

            const delimiterCounts = {};

            const cleanedString = inputString.replace(/\r?\n|\r/g, '');

            delimiters.forEach(delimiter => {
                const count = cleanedString.split(delimiter).length - 1;
                delimiterCounts[delimiter] = count;
            });

            let maxCount = 0;
            let detectedDelimiter = null;

            for (const [delimiter, count] of Object.entries(delimiterCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    detectedDelimiter = delimiter;
                }
            }

            return detectedDelimiter ? detectedDelimiter : 'No delimiter detected';
        }

        let getParser = async (plate_type) => {
            if (plate_type.endsWith('no-header') && plate_type.startsWith('Quant')) {
                let va = await prompt("Enter columns separated by comma", ["Columns"], { "Columns": 'Well Position,Quantity,Target,Task,Cq' }, 440, 300)
                let m = va['Columns']

                if (m === null) {

                    alert(' Cannot parse without header information')

                } else {
                    let header_ = m.split(',')
                    return getQPCRParser(header_.toString());
                }

            } else {
                return getQPCRParser();
            }
        }

        if (isValidPlateData(text)) {
            let plts = []

            let plate_type = detectPlateDataType(text);
            let parser = await getParser(plate_type);
            let splitTables;
            if (parser) {
                splitTables = parser(text);

                let mob = (splitTables);
                let wells = mob;
                if (mob.wells) {
                    wells = mob.wells;

                    const xDimension = wells.length;
                    let yDimension = 0;
                    for (let i = 0; i < xDimension; i++) {
                        if (wells[i].length > yDimension) {
                            yDimension = wells[i].length;
                        }
                    }
                    const mainPlate = new Plate('Main', xDimension, yDimension);
                    mainPlate.setWells(wells)
                    plts.push(mainPlate);

                    let plates = createPlatesFromMultiplexedData(mob, xDimension, yDimension);
                    plts = plts.concat(plates)
                } else {
                    plts = mob;
                }

            }
            if (!splitTables) {
                splitTables = processSplitTables(text);

                for (let wells of splitTables) {
                    const xDimension = wells.length;
                    let yDimension = 0;
                    for (let i = 0; i < xDimension; i++) {
                        if (wells[i].length > yDimension) {
                            yDimension = wells[i].length;
                        }
                    }
                    const mainPlate = new Plate('Main', xDimension, yDimension);
                    mainPlate.setWells(wells)
                    plts.push(mainPlate);

                    let plates = createPlatesFromMultiplexedData(mob, xDimension, yDimension);
                    plts = plts.concat(plates)
                }

            }

            resolve(plts)
        } else {
            const wellTable = parseTable(text);

            const xDimension = wellTable.length;
            const yDimension = wellTable[0].length;
            const myPlate = new Plate("Untitled", xDimension, yDimension);
            myPlate.setWells(wellTable)
            resolve([myPlate])
        }

    })

}

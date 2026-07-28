function (text) {
    return new Promise(async (resolve, reject) => {




        const MAX_ROWS = 10000;

        function trimRows(rawText, maxRows = MAX_ROWS) {
            if (typeof rawText !== 'string') return rawText;

            const rows = rawText.trim().split('\n');
            return rows.slice(0, maxRows).join('\n');
        }


        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        let Plate = await exec('baja/plate/plate.js')

        function parseJsonArray(jsonString) {
            try {
                const parsed = JSON.parse(jsonString);
                if (Array.isArray(parsed)) {
                    return parsed;
                } else {
                    return null;
                }
            } catch (error) {
                return null;
            }
        }

        function parseMarkdownTableToPlate(text) {
            const lines = text.trim().split('\n');

            const dataLines = lines.filter(line => /^\|/.test(line)).slice(2);

            const cells = [];
            for (const line of dataLines) {
                const cols = line.split('|').map(col => col.trim());
                if (cols.length >= 5) {
                    const cellName = cols[1];
                    const label = cols[2];
                    const value = cols[3].replace(/^`|`$/g, '');
                    const formula = cols[4];

                    if (/^[A-Z]+\d+$/.test(cellName)) {
                        const colIndex = cellName.charCodeAt(0) - 65;
                        const rowIndex = parseInt(cellName.slice(1), 10) - 1;

                        cells.push({ col: colIndex, row: rowIndex, label, value, formula });
                    }
                }
            }

            const maxCol = Math.max(...cells.map(c => c.col)) + 1;
            const maxRow = Math.max(...cells.map(c => c.row)) + 1;

            const plate = new Plate("", maxCol, maxRow);

            for (const { col, row, label, value, formula } of cells) {
                const well = new GenericWell(`${String.fromCharCode(65 + col)}${row + 1}`);
                well.value = value;
                well.label = label;
                well.properties = {
                    formula: formula || "",
                    refIDs: []
                };
                well.uid = uuid();
                well.properties.refIDs = [well.uid];
                plate.wells[col][row] = well;
            }

            plate.removeEmptyRowsAndColumns();

            return plate;
        }


        if (typeof text === 'string' && text.includes && text.includes('|') && text.includes('**Cell**')) {
            try {
                const plate = parseMarkdownTableToPlate(text);
                resolve([plate]);
            } catch (e) {
                console.error("Failed to parse markdown-style well table", e);
                return;
            }
        } else
            if (text.startsWith('[')) {
                let wells = (parseJsonArray(text))
                try {
                    console.log('debubg');
                    let numCols = wells.length;
                    const numRows = Math.max(...wells.map(row => row.length), 0);
                    const mpl = new Plate("", numCols, numRows);

                    for (let col = 0; col < numCols; col++) {
                        for (let row = 0; row < numRows; row++) {
                            mpl.wells[col][row] = Object.assign(new GenericWell(), wells[col][row]);
                            mpl.wells[col][row].properties['refIDs'] = [mpl.wells[col][row].uid];
                            mpl.wells[col][row].uid = uuid();
                        }
                    }

                    mpl.removeEmptyRowsAndColumns()

                    resolve([mpl])
                } catch (exception) {
                    console.log(" Failed to load the wells from a json structure")
                    return;
                }

            }
        const createDefaultWell = (row, col) => new GenericWell(`${String.fromCharCode(65 + col)}${row + 1}`);
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

        function castIfInteger(value) {
            if (typeof value === 'number' && Number.isInteger(value)) {
                return value;
            }
            return value;
        }

        function checkAndCastToNumber(str) {
            if (str === null || str === undefined) {
                str = '';
            }
            str = str.trim();
            const numberPattern = /^-?\d+(\.\d+)?$/;
            if (numberPattern.test(str)) {
                return Number(str);
            } else {

                return str;
            }
        }

        function mapToWellsArray(parsedArray) {
            let res = findMaxRowAndCol(parsedArray)
            const numRows = res.maxRows;
            const numCols = res.maxCols;
            const wells = Array.from({ length: numCols }, () => []);

            for (let x = 0; x < numRows; x++) {
                for (let y = 0; y < numCols; y++) {
                    let value = parsedArray[x][y];
                    wells[y][x] = createDefaultWell(y, x);
                    wells[y][x].setValue(checkAndCastToNumber(value));

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
            console.log('debubg');
            return trimmedWells;

        }
        function isValidPlateData(rawText) {

            const positionRegex = /^[A-P][1-9][0-9]?$/;

            const lines = rawText.trim().split('\n');

            let inx = 0;

            for (let line of lines) {

                if (inx > 5) {

                    return false;
                }

                const columns = line.trim().split(/\t|\s{2,}/);

                const position = columns[0];

                if (positionRegex.test(position)) {

                    return true;
                }
                inx++;
            }

            return false;
        }

        function createPlateData(parsedData, xDimension, yDimension) {
            const wells = parsedData;

            const plate = new Plate(`Plate ${1}`, xDimension, yDimension);
            plate.wells = wells.map(row => row.map(well => well ? well : createDefaultWell(row, col)));

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
            return null;
        }

        const trimmedText = trimRows(text, 10000);
        const wellTable = parseTable(trimmedText);
        const xDimension = wellTable.length;
        const yDimension = wellTable[0].length;
        const myPlate = new Plate("", xDimension, yDimension);
        myPlate.setWells(wellTable)
        resolve([myPlate])

    })

}

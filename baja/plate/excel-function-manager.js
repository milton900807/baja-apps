function () {

    return new Promise(async (resolve, reject) => {

        let cursorBlinkInterval = 500;

        class ExcelTranslator {
            static colLetterToNumber(col) {
                let num = 0;
                for (let i = 0; i < col.length; i++) {
                    num *= 26;
                    num += col.charCodeAt(i) - 64;
                }
                return num;
            }

            static convertExcelRange(range) {
                const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
                if (!match) throw new Error("Invalid range format");
                const [, colStart, rowStart, colEnd, rowEnd] = match;
                const xi = this.colLetterToNumber(colStart.toUpperCase()) - 1;
                const xf = this.colLetterToNumber(colEnd.toUpperCase()) - 1;
                const yi = parseInt(rowStart, 10);
                const yf = parseInt(rowEnd, 10);
                return `[${xi}:${xf}][${yi}:${yf}]`;
            }

            static convertSingleCellRef(ref) {
                const match = ref.match(/^([A-Z]+)(\d+)$/i);
                if (!match) return null;
                const [, col, row] = match;
                const x = this.colLetterToNumber(col.toUpperCase()) - 1;
                const y = parseInt(row, 10);
                return `[${x}:${x}][${y}:${y}]`;
            }

            static getFunctionType(input) {

                const excelRegex = /^=[A-Z]+\(.*\)$/i;

                const ljlToken = /[A-Za-z_][A-Za-z0-9_]*(\[\s*[^\[\]]+\s*\])+/;

                const ljlExpression = new RegExp(`^\\s*${ljlToken.source}(\\s*[-+*/]\\s*${ljlToken.source})*\\s*$`);

                if (typeof input !== 'string') return null;

                if (excelRegex.test(input)) {
                    return 'excel';
                } else if (ljlExpression.test(input)) {
                    return 'bajabio';
                } else {
                    return null;
                }
            }

            static translateExcelFormula(table_name, formula) {
                formula = formula.trim();
                if (!formula.startsWith('=')) return null;

                let expr = formula.slice(1).trim();

                let funtype = ExcelTranslator.getFunctionType(expr)
                if (funtype === 'bajabio') {
                    return expr;
                }
                else {

                    const simpleRef = expr.match(/^([A-Z]+\d+)$/i);
                    if (simpleRef) {
                        const coord = this.convertSingleCellRef(simpleRef[1]);
                        return `${table_name}${coord}`;
                    }

                    const rangeSum = expr.match(/^SUM\(([A-Z]+\d+:[A-Z]+\d+)\)$/i);
                    if (rangeSum) {
                        const range = rangeSum[1];
                        return `sum(${table_name}${this.convertExcelRange(range)})`;
                    }

                    const listSum = expr.match(/^SUM\(([^()]+,[^()]+)\)$/i);
                    if (listSum) {
                        const refs = listSum[1].split(',').map(ref => ref.trim());
                        const parts = refs.map(ref => {
                            const coord = this.convertSingleCellRef(ref);
                            return coord ? `${table_name}${coord}` : ref;
                        });
                        return `sum(${parts.join('+')})`;
                    }

                    const sumproductMatch = expr.match(/^SUMPRODUCT\(([^,]+),([^)]+)\)$/i);
                    if (sumproductMatch) {
                        const range1 = sumproductMatch[1].trim();
                        const range2 = sumproductMatch[2].trim();
                        return `sumproduct(${table_name}${this.convertExcelRange(range1)},${this.convertExcelRange(range2)})`;
                    }

                    const translated = expr.replace(/([A-Z]+\d+(:[A-Z]+\d+)?)/gi, match => {
                        if (match.includes(':')) {
                            return `${table_name}${this.convertExcelRange(match)}`;
                        } else {
                            const coord = this.convertSingleCellRef(match);
                            return coord ? `${table_name}${coord}` : match;
                        }
                    });

                    return translated;
                }
            }
        }

        function areYValuesValid(points) {
            return points.every(point => {
                const y = point.y;
                if (y === null) return false;
                if (typeof y === 'number' && !isNaN(y)) return true;
                if (typeof y === 'string' && !isNaN(Number(y))) return true;
                return false;
            });
        }

        function removeWordsFromString(wordsToRemove, inputString) {
            if (!Array.isArray(wordsToRemove) || typeof inputString !== "string") {
                throw new Error("Invalid input: wordsToRemove must be an array and inputString must be a string");
            }

            const regex = new RegExp(`\\b(${wordsToRemove.join('|')})\\b`, 'gi');

            return inputString.replace(regex, '').replace(/\s+/g, ' ').trim();
        }

        function splitString(inputString, delimiter) {
            if (typeof inputString !== 'string' || typeof delimiter !== 'string') {
                throw new Error('Both inputString and delimiter must be strings');
            }

            return inputString.split(delimiter);
        }

        function convertCommaDelimitedToArray(inputString) {
            if (typeof inputString !== 'string') {
                throw new Error("Input must be a string");
            }

            if (!inputString.includes(',')) {
                return [inputString.trim()];
            }

            return inputString
                .split(',')
                .map(word => word.trim())
                .filter(word => word.length > 0);
        }

        function convertToARGB(color) {
            let r, g, b, a = 255;
            if (color.startsWith('#')) {

                if (color.length === 4) {

                    r = parseInt(color[1] + color[1], 16);
                    g = parseInt(color[2] + color[2], 16);
                    b = parseInt(color[3] + color[3], 16);
                } else if (color.length === 7) {

                    r = parseInt(color.substring(1, 3), 16);
                    g = parseInt(color.substring(3, 5), 16);
                    b = parseInt(color.substring(5, 7), 16);
                }
            } else if (color.startsWith('rgb')) {

                const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
                if (rgba) {
                    r = parseInt(rgba[1], 10);
                    g = parseInt(rgba[2], 10);
                    b = parseInt(rgba[3], 10);
                    if (rgba[4] !== undefined) {
                        a = Math.round(parseFloat(rgba[4]) * 255);
                    }
                }
            }
            const alphaHex = ('0' + a.toString(16)).slice(-2).toUpperCase();
            const redHex = ('0' + r.toString(16)).slice(-2).toUpperCase();
            const greenHex = ('0' + g.toString(16)).slice(-2).toUpperCase();
            const blueHex = ('0' + b.toString(16)).slice(-2).toUpperCase();
            return { argb: `${alphaHex}${redHex}${greenHex}${blueHex}` };
        }

        let cursorVisible = true;
        function blinkCursor() {
            cursorVisible = !cursorVisible;
        }
        setInterval(blinkCursor, cursorBlinkInterval);
        const createDefaultWell = (row, col) => new GenericWell(`${String.fromCharCode(65 + col)}${row + 1}`);

        function getMaxDimensions(array2D) {
            let maxRow = array2D.length;
            let maxCol = 0;

            for (let row = 0; row < array2D.length; row++) {
                let currentRowLength = array2D[row].length;
                if (currentRowLength > maxCol) {
                    maxCol = currentRowLength;
                }
            }

            return { maxRow, maxCol };
        }
        function filterWells(wells, conditionFn) {
            let filteredWells = [];
            for (let x = 0; x < wells.length; x++) {
                let filteredRow = [];
                for (let y = 0; y < wells[x].length; y++) {
                    let well = wells[x][y];

                    if (well && conditionFn(well)) {
                        filteredRow.push(well);
                    }
                }

                if (filteredRow.length > 0) {
                    filteredWells.push(filteredRow);
                }
            }

            return filteredWells;
        }
        function getExcelColumnName(n) {
            let result = '';
            while (n >= 0) {
                result = String.fromCharCode((n % 26) + 65) + result;
                n = Math.floor(n / 26) - 1;
            }
            return result;
        }
        function highlightOutliersGrubbs(wc) {
            let numbers = [];
            let nwells = [];
            let other = [];

            for (let w of wc) {
                let value = w.value;
                if (typeof value === 'number' && !isNaN(value)) {
                    numbers.push(value);
                    nwells.push(w);
                } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
                    let floatVal = parseFloat(value);
                    numbers.push(floatVal);
                    nwells.push(w);
                } else {
                    other.push(w);
                }
            }

            if (numbers.length < 4) {
                console.warn("Not enough data points to perform Grubbs' test.");
                return;
            }

            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
            const stdDev = Math.sqrt(variance);

            let maxDeviation = 0;
            let maxIndex = -1;

            numbers.forEach((val, index) => {
                let g = Math.abs((val - mean) / stdDev);
                if (g > maxDeviation) {
                    maxDeviation = g;
                    maxIndex = index;
                }
            });

            const n = numbers.length;
            const tValue = 1.96;
            const grubbsCritical = ((n - 1) / Math.sqrt(n)) * Math.sqrt(tValue * tValue / (n - 2 + tValue * tValue));

            if (maxDeviation > grubbsCritical) {
                nwells[maxIndex].color = 'hsl(0, 100%, 50%)';
            } else {
                nwells.forEach(nwe => {
                    nwe.color = 'hsl(120, 100%, 50%)';
                });
            }
        }

        resolve({ ExcelTranslator, getExcelColumnName })

    })

}

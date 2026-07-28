function () {

    return new Promise(async (resolve, reject) => {

        const { ExcelTranslator, getExcelColumnName } = await exec('baja/plate/excel-function-manager.js')

        const COL_OFFSET = 0.95;
        let freezFrame = false;
        let click_and_drag = false;
        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorVisible = true;
        let cursorPos = 0;
        let cursorBlinkInterval = 500;
        let selectText = false;
        let textStyle;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let singleSelect = false;
        let mouseX;
        let mouseY;
        let __pt__;
        let __previousSkin = null;

        function areYValuesValid(points) {
            return points.every(point => {
                const y = point.y;
                if (y === null) return false;
                if (typeof y === 'number' && !isNaN(y)) return true;
                if (typeof y === 'string' && !isNaN(Number(y))) return true;
                return false;
            });
        }

        function removeCharactersFromString(charsToRemove, inputString) {
            if (!Array.isArray(charsToRemove) || typeof inputString !== "string") {
                throw new Error("Invalid input: charsToRemove must be an array and inputString must be a string");
            }

            const regex = new RegExp(`[${charsToRemove.join('')}]`, 'g');

            return inputString.replace(regex, '').trim();
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

        function generateHTMLReport(analysis) {
            const { hasNumberPattern, topSpecialChars, topUnits } = analysis;

            return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    line-height: 1.6;
                }
                h1 {
                    text-align: center;
                    color: #333;
                }
                .section {
                    margin-bottom: 20px;
                }
                table {
                    width: 50%;
                    border-collapse: collapse;
                    margin: 20px auto;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f4f4f4;
                }
                .key {
                    font-weight: bold;
                }
            </style>
        </head>
        <body>

        The following special characters were found.

            <div class="section">
                <table>
                    <thead>
                    </thead>
                    <tbody>
                        ${topSpecialChars
                    .map(
                        (charObj) =>
                            `<tr><td>${charObj.char}</td> </tr>`
                    )
                    .join("")}
                    </tbody>
                </table>
            </div>

        The following numerical units were found.

            <div class="section">

            <table>
                    <tbody>
                        ${topUnits
                    .map(
                        (unitObj) =>
                            `<tr><td>${unitObj.unit}</td></tr>`
                    )
                    .join("")}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
            `;
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

        function highlightValuesGradientTransparency(wc) {
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
                console.warn("Not enough data points to apply gradient.");
                return;
            }

            const minVal = Math.min(...numbers);
            const maxVal = Math.max(...numbers);

            for (let nwe of nwells) {
                let val = parseFloat(nwe.value);
                let normalized = (val - minVal) / (maxVal - minVal);
                let opacity = 0.3 + (normalized * 0.7);
                nwe.color = `hsla(240, 100%, 50%, ${opacity})`;
            }
        }

        function highlightOutliers(wc) {
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
                console.warn("Not enough data points to determine outliers.");
                return;
            }

            numbers.sort((a, b) => a - b);
            const q1 = numbers[Math.floor(numbers.length / 4)];
            const q3 = numbers[Math.floor(3 * numbers.length / 4)];
            const iqr = q3 - q1;

            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;

            for (let nwe of nwells) {
                let val = parseFloat(nwe.value);
                if (val < lowerBound) {
                    nwe.color = 'hsl(0, 100%, 50%)';
                } else if (val > upperBound) {
                    nwe.color = 'hsl(60, 100%, 50%)';
                } else {
                    nwe.color = 'hsl(120, 100%, 50%)';
                }
            }
        }
        function highlightOutliersZScore(wc) {
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
                console.warn("Not enough data points to determine outliers.");
                return;
            }

            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
            const stdDev = Math.sqrt(variance);

            for (let nwe of nwells) {
                let val = parseFloat(nwe.value);
                let zScore = (val - mean) / stdDev;
                if (zScore < -3) {
                    nwe.color = 'hsl(0, 100%, 50%)';
                } else if (zScore > 3) {
                    nwe.color = 'hsl(60, 100%, 50%)';
                } else {
                    nwe.color = 'hsl(120, 100%, 50%)';
                }
            }
        }

        function highlightOutliersBayesian(wc) {
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
                console.warn("Not enough data points to determine outliers.");
                return;
            }

            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
            const stdDev = Math.sqrt(variance);

            const lowerBound = mean - 3 * stdDev;
            const upperBound = mean + 3 * stdDev;

            for (let nwe of nwells) {
                let val = parseFloat(nwe.value);
                if (val < lowerBound) {
                    nwe.color = 'hsl(0, 100%, 50%)';
                } else if (val > upperBound) {
                    nwe.color = 'hsl(60, 100%, 50%)';
                } else {
                    nwe.color = 'hsl(120, 100%, 50%)';
                }
            }
        }
        function isObjectNotVisible(ctx, xscreen_min_, xscreen_max, yscreen_min_, yscreen_max) {

            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const isOutsideHorizontal = (xscreen_max < 0 && xscreen_min_ < 0) || (xscreen_min_ > canvasWidth && xscreen_max > canvasWidth);
            const isOutsideVertical = (yscreen_max < 0 && yscreen_min_ < 0) || (yscreen_min_ > canvasHeight && yscreen_max > canvasHeight);
            return isOutsideHorizontal || isOutsideVertical;
        }

        function op_on_string(operation, inputString) {
            if (typeof operation !== "string" || (typeof inputString !== "string" && inputString !== null && inputString !== undefined)) {
                throw new Error("Operation must be a string and inputString must be a valid string, null, or undefined");
            }

            const removeNonDigitCharacters = (str) => str.replace(/\D/g, "");
            const retainAllDigitCharacters = (str) => str.replace(/[^0-9]/g, "");
            const retainNonAlphanumericCharacters = (str) => str.replace(/[^a-zA-Z0-9]/g, "");
            const extractWords = (str) => str.match(/\b\w+\b/g)?.join(" ") || "";

            switch (operation) {
                case "non-digit characters":
                    return typeof inputString === "string" ? removeNonDigitCharacters(inputString) : inputString;
                case "all-digit characters":
                    return typeof inputString === "string" ? retainAllDigitCharacters(inputString) : inputString;
                case "non-alphanumeric characters":
                    return typeof inputString === "string" ? retainNonAlphanumericCharacters(inputString) : inputString;
                case "Words...":
                    return typeof inputString === "string" ? extractWords(inputString) : inputString;
                default:
                    throw new Error(`Invalid operation: "${operation}"`);
            }
        }

        function processItemsInArrayForOption(operation, strings) {
            if (typeof operation !== "string" || !Array.isArray(strings)) {
                throw new Error("Operation must be a string and strings must be an array");
            }

            const removeNonDigitCharacters = (str) => str.replace(/\D/g, "");
            const retainAllDigitCharacters = (str) => str.replace(/[^0-9]/g, "");
            const retainNonAlphanumericCharacters = (str) => str.replace(/[^a-zA-Z0-9]/g, "");
            const extractWords = (str) => str.match(/\b\w+\b/g)?.join(" ") || "";

            switch (operation) {
                case "non-digit characters":
                    return strings.map(str => (typeof str === "string" ? removeNonDigitCharacters(str) : str));
                case "all-digit characters":
                    return strings.map(str => (typeof str === "string" ? retainAllDigitCharacters(str) : str));
                case "non-alphanumeric characters":
                    return strings.map(str => (typeof str === "string" ? retainNonAlphanumericCharacters(str) : str));
                case "Words...":
                    return strings.map(str => (typeof str === "string" ? extractWords(str) : str));
                default:
                    throw new Error(`Invalid operation: "${operation}"`);
            }
        }

        let getWellText = (selected_well) => {
            let text = '';
            let skinType = 'value';
            if (selected_well.skin_type)
                skinType = selected_well.skin_type;
            switch (skinType) {
                case 'concentration':
                    if (selected_well.concentration === null || isNaN(selected_well.concentration)) {
                        text = '';
                    } else {
                        text = '' + selected_well.getConcentration();
                    }
                    break;

                case 'function':
                    if (selected_well.formula) {
                        text = selected_well.formula + '';
                    } else {
                        text = 'No formula';
                    }
                    break;

                case 'name':
                    text = selected_well.name || '';
                    break;

                case 'score':
                    text = selected_well.score || 'No score provided';
                    break;

                case 'obj':
                    text = selected_well.obj || 'No obj provided';
                    break;

                case 'welltype':
                    text = selected_well.wellType || 'Unknown well type';
                    break;

                case 'structure':
                    text = selected_well.structure || 'Unknown structure';
                    break;

                case 'group':
                    text = selected_well.group || '';
                    break;

                case 'color':
                    text = selected_well.color || null;
                    break;

                case 'value':
                    text = selected_well.value || '';
                    break;

                case 'source':
                    text = selected_well.source || 'Unknown source';
                    break;

                case 'compoundid':
                    text = selected_well.compoundId || 'No compound ID';
                    break;

                case 'idt':
                    text = selected_well.idt || 'No IDT';
                    break;

                case 'props':
                    text = selected_well.props || 'No props';
                    break;

                case 'dye':
                    text = selected_well.dye || 'No dye provided';
                    break;

                default:
                    text = selected_well.getValue();
                    break;
            }

            if (text === undefined) {
                text = '';
            }

            return text;
        }

        let ref;
        let interval_id;
        let current_well = null;
        let pausing = false;

        let md = false;

        let Plate = class Plate {
            formula = {}
            clk_and_drag_open = false;
            typeof = 'grid'
            attr__displayMenuButtons = true;
            attr__ShowTableName = true;
            attr__displayNumberValues = true;
            attr__RowAddRemoveButtons = true;
            attr__ShowFishEyeLense = true;
            attr__displayCellButtons = true;
            hidden = false;
            users = {}
            resizeable = false;
            selected = false;
            visible = true;
            wells;
            column_widths = [
            ]
            input_to = []
            tag_formula = []
            mode = null;
            columnFunction = {};
            name = '';
            plates = []
            grid;
            menu_selected;
            menu;
            selectedWells = [];
            subType = 'transparent';
            plateType = 'transparent';
            location;
            uid;
            row_vis_start = -Infinity;
            row_vis_stop = Infinity;
            column_headers = []
            row_headers = []
            docImageLoaded = false;
            plots = [];
            aspect_ratio = 1;
            textActive = false;
            text = ''
            message;
            table_summary = false;
            textBoxX;
            textBoxWidth = 240;
            textBoxHeight = 40;
            textBoxY;
            pwx;
            pwy;
            editable = false;
            width;
            height;
            __resizing = false;
            __moving = false;
            ___drawfish = false;
            __highlight_column = false;
            __highlight_column_width = false;
            bookmarks = []
            group_preferences = {}
            memorySize = null;
            last_touched = -Infinity;
            highlightbutton = null;
            button_set = null;
            parent_reference = null;
            visible_cell_aspect_ratio_min = 0.1;
            visible_cell_aspect_ratio_max = 35.0;

            constructor(name, xmax, ymax) {
                this.uid = uuid();
                if (!xmax) {
                    xmax = 12;
                }
                if (!ymax) {
                    ymax = 8;
                }
                if (name)
                    this.name = name.trim();

                if (!this.name || this.name.toLowerCase() === 'untitled') {
                    this.name = generateNautName();
                }

                this.grid = new MGrid(0, 0, 100, 100);
                this.grid.xi = 0;
                this.grid.yi = 0;
                this.grid.setxmax(xmax);
                this.grid.setymax(ymax);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
                this.margin = { top: 25, right: 50, bottom: 50, left: 50 };

                this.buttons = [
                    {
                        name: `move`, x: 0, y: 10, width: 30, height: 20, action: async (bx, by, x, y, pt) => { return await this.setMoveListeners(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null("move", pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'm'
                    },

                    {
                        name: "minimize", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.showMenuOptions(pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('minimize', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'M'
                    },
                    {
                        name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.test_menu(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('close', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'c'
                    },

                ];

                this.bottom_buttons = [
                    {
                        name: "-", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (pt) => { return this.removeLastRow(pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('remove', pt) }, color: 'rgba(100,100,100,0.2)', highlight_color: 'cyan', letter: 'c'
                    },
                    {
                        name: "+", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (pt) => { return this.addSameRow(pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('add', pt) }, color: 'rgba(100,100,100,0.2)', highlight_color: 'cyan', letter: 'c'
                    },

                ];
                this.button_set = this.buttons;
                this.package_buttons = [
                    {
                        name: `move`, x: 0, y: 10, width: 30, height: 20, action: async (bx, by, x, y, pt) => { return await this.setMoveListeners(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null("move", pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'm'
                    },
                    {
                        name: `\u03B4`, x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null("\u03B4", pt) }, color: 'lightBlue', highlight_color: 'cyan', letter: 'O'
                    },
                    {
                        name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.test_menu(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('close', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'c'
                    },

                ];
                this.simple_buttons = [
                    {
                        name: `move`, x: 0, y: 10, width: 30, height: 20, action: async (bx, by, x, y, pt) => { return await this.setMoveListeners(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null("move", pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'm'
                    },
                    {
                        name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.test_menu(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('close', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'c'
                    },

                ];
                this.icon_buttons = [
                    {
                        name: `move`, x: 0, y: 10, width: 30, height: 20, action: async (bx, by, x, y, pt) => { return await this.setMoveListeners(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null("move", pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'm'
                    },

                    {
                        name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.test_menu(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.dev_null('close', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'c'
                    },

                ];

                this.txbuttons = [
                    {
                        name: `\u0394 \u25BD`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => {
                            let range = this.getWellRowIndex(current_well)
                            this.selectRowAtColumn(range.rowIndex, range.colIndex)
                        },
                        highlight: async (bx, by, x, y, pt) => {
                            this.isHighlighted = false;
                            return await this.dev_null('tag', pt)
                        }, color: 'lightcyan', letter: '\u2192', isHighlighted: false
                    },
                    {
                        name: `\u0394 \u25BD`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => {
                            let range = this.getWellRowIndex(current_well)
                            this.selectColumnAtRow(range.rowIndex, range.colIndex)
                        },
                        highlight: async (well, pt) => {
                        }, color: 'lightcyan', letter: '\u2193', isHighlighted: false
                    },
                    {
                        name: `i`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => {

                            return this.showLJScript(pt)
                        },
                        highlight: async (bx, by, x, y, pt) => {
                            this.isHighlighted = false;
                            return await this.dev_null('i', pt)
                        }, color: 'lightcyan', letter: 'i', isHighlighted: false
                    },

                    {
                        name: `options`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => { return await this.goEditor(well, pt) },
                        highlight: async (bx, by, x, y, pt) => {

                            this.isHighlighted = false;
                            return await this.dev_null('options', pt)
                        }, color: 'lightcyan', letter: 'M', isHighlighted: false
                    },
                    {
                        name: "close", x: 0 + bsize, y: 10, width: 30, height: 20, action: async (well, pt) => { return await this.removeSelected(well, pt) },
                        highlight: async (bx, by, x, y, pt) => {

                            this.isHighlighted = true
                            return await this.dev_null('close', pt)

                        }, color: 'lightRed', letter: 'X', isHighlighted: false
                    },

                ];

                this.navigation_buttons = [
                    {
                        name: `\u0394 \u25BD`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => {
                        },
                        highlight: async (bx, by, x, y, pt) => {
                            this.isHighlighted = false;
                            return await this.dev_null('tag', pt)
                        }, color: 'lightcyan', letter: '\u2192', isHighlighted: false
                    },
                    {
                        name: `\u0394 \u25BD`, x: 0, y: 10, width: 30, height: 20, action: async (well, pt) => {
                        },
                        highlight: async (well, pt) => {
                        }, color: 'lightcyan', letter: '\u2193', isHighlighted: false
                    },
                    {
                        name: "close", x: 0 + bsize, y: 10, width: 30, height: 20, action: async (well, pt) => { return await this.removeSelected(well, pt) },
                        highlight: async (bx, by, x, y, pt) => {
                            this.isHighlighted = true
                            return await this.dev_null('close', pt)
                        }, color: 'lightBlue', letter: 'X', isHighlighted: false
                    },
                ];
                this.resizebutton = {
                    name: "Resize", x: 0 + bsize, y: 10, width: 30, height: 20, action: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) },
                    highlight: async (bx, by, x, y, pt) => { return await this.createConnectMenu(bx, by, x, y, pt) }
                }
                if (name)
                    this.name = name.trim();
                this.rows = ymax;
                this.cols = xmax;
                if (this.grid.xmax < 1) {
                    this.grid.xmax = 1;
                }
                this.wells = Array.from(Array(this.grid.xmax), () => new Array(this.grid.ymax))
            }

            setMenu(pt, menu) {
                pt.menu = menu;
            }

            showWellAction(pt) {
                let se = this.getSelectedWellsInOrder()
                pt.setSelected(this);
                exec('baja/table/io/lj-fun-to-table.js', pt, this, se)
            }

            async showWellAction___deprecated(pt, __value, ref, w) {

                if (this.plateType === 'package') {
                    let m = [
                    ]
                    let TableOps = await exec('baja/table/table-ops')
                    let menuList = await TableOps.load(pt, this)
                    m = m.concat(menuList)
                    pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                    return resolve();
                }

                let canvas = CurrentLayout.getStashed('graph-canvas')
                let t =
                {
                    height: '200px',
                    editorOptions: {
                        language: 'bajabio',
                        theme: 'no-border-theme',
                        minimap: { enabled: false },
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'hidden',
                        },
                        lineNumbers: 'off',
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        folding: false,
                        highlightActiveIndentGuide: false,
                        renderLineHighlight: 'none',
                        renderLineHighlightOnlyWhenFocus: false,
                        renderWhitespace: 'none',
                        fontSize: 15,
                        automaticLayout: true,
                        value: w[0].value,
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 30,
                            right: 30
                        }
                    },
                    objects: pt.root,
                    code: "" + __value,
                    buttons: [
                        {
                            'label': 'Save text', "color": 'blue', action: async () => {
                                let code = canvas.textEditor.getContent();
                                ref.hideEditor();
                                if (code.startsWith(':')) {
                                    let interpreter = await exec('baja/engine/interpreter.js', pt)
                                    interpreter.ref = this;
                                    let fal = await interpreter.run(code);
                                    w[0].setValue(fal);

                                } else {
                                    w[0].setValue(code);
                                }
                            }
                        },
                        {
                            'label': 'Save function', "color": 'blue', action: async () => {
                                function isValidFormat(input) {
                                    const regex = /^\w+\s+\d+,\d+$/;
                                    return regex.test(input);
                                }
                                let code = canvas.textEditor.getContent();
                                let selection = this.getSelectedWellRange()
                                if (code && code.startsWith(this.name)) {
                                    if (isValidFormat(code)) {
                                        const match = input.match(/^(\w+)\s+(\d+),(\d+)$/);
                                        const tableName = match[1];
                                        const col = match[2];
                                        const row = match[3];
                                        code = `${tableName}[${col}:${col}][${row}:${row}]`;
                                    }
                                }

                                let w = this.getSelectedWellsInOrder();
                                if (w != null && w.length > 1) {
                                    for (let iw of w) {
                                        iw.setFormula(code)
                                    }
                                }

                                pt.addFormula(this.name + '' + selection, code)
                            }
                        },

                        {
                            'label': 'Tag', 'color': 'black', "action": () => {

                                setTimeout(() => {
                                    this.goTag(null, pt)
                                }, 1000)
                                ref.hideEditor();
                            }
                        },
                        {
                            'label': 'Options', 'color': 'black', "action": async () => {
                                ref.hideEditor()
                                ref = null;
                                showOptions(0)

                            }
                        },

                        {
                            'label': 'Close', 'color': 'magenta', "action": () => {
                                singleSelect = false;
                                this.deselectAll();
                                this.selectIt();
                                ref.hideEditor();
                            }
                        }
                    ]
                }
                t.objects = pt.root;
                ref = canvas.setEditor(t);

                return;
            }

            generatePlateLayoutJSON() {
                let plateLayout = {
                    name: this.name,
                    rows: this.wells.length,
                    cols: this.wells[0].length,
                    layout: {},
                    groups: {}
                };

                for (let rowIndex = 0; rowIndex < this.wells.length; rowIndex++) {
                    for (let colIndex = 0; colIndex < this.wells[rowIndex].length; colIndex++) {
                        let well = this.wells[rowIndex][colIndex];
                        let wellData = {};
                        if (well.concentration != null) wellData.concentration = well.concentration;
                        if (well.obj) wellData.obj = well.obj;
                        if (well.structure) wellData.structure = well.structure;
                        if (well.group) {
                            wellData.group = well.group
                        }
                        if (Object.keys(wellData).length > 0) {
                            plateLayout.layout[well.position] = wellData;
                        }
                    }
                }
                return plateLayout;
            }

            countColumns() {
                return this.wells.length;
            }

            getColumnData(columnIndex) {
                const tf = []
                for (let rowIndex = 0; rowIndex < this.wells[columnIndex].length; rowIndex++) {
                    let well = this.wells[columnIndex][rowIndex];
                    tf.push(well.value)
                }
                return tf;
            }

            showLJScript(pt) {
                pt.menu = null;
                let se = this.getSelectedWellsInOrder()
                pt.setSelected(this);
                exec('baja/table/io/lj-fun-to-table.js', pt, this, se)
            }

            getLastTouched() {
                return this.last_touched
            }
            setGroupForRow(rowIndex, groupName) {
                groupName = groupName + ''
                groupName = groupName.replace(/[^a-zA-Z0-9]/g, '');
                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index");
                    return;
                }

                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    const well = this.wells[colIndex][rowIndex];
                    if (well && typeof well.setGroup === 'function') {

                        well.setGroup(groupName);
                    }
                }
            }
            setGroupForColumn(colIndex, groupName) {
                groupName = groupName + '';
                groupName = groupName.replace(/[^a-zA-Z0-9]/g, '');
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index");
                    return;
                }
                for (let rowIndex = 0; rowIndex < this.wells[0].length; rowIndex++) {
                    const well = this.wells[colIndex][rowIndex];
                    if (well && typeof well.setGroup === 'function') {
                        well.setGroup(groupName);
                    }
                }
            }

            unModal() {
                this.highlightbutton = null;
                this.textActive = false;
            }

            isModal(pt) {
                if (pt.menu) {
                    return true;
                }
                return false;
            }

            formula = {}

            getFormula() {
                let fk = {};
                for (let column = 0; column < this.wells.length; column++) {
                    for (let row = 0; row < this.wells[column].length; row++) {
                        let selectedRange = this.getWellRange([this.wells[column][row]]);

                        if (this.wells[column] && this.wells[column][row] && this.wells[column][row].obj) {
                            if (this.wells[column][row].obj && this.wells[column][row].obj.startsWith('='))
                                this.wells[column][row].formula = ExcelTranslator.translateExcelFormula(this.name, this.wells[column][row].obj)
                        }
                        if (
                            selectedRange != null &&
                            selectedRange.length > 0 &&
                            this.wells[column][row].formula &&
                            this.wells[column][row].formula.length > 0
                        ) {
                            fk[selectedRange] = this.wells[column][row].formula;
                        }
                    }
                }

                return { ...this.formula, ...fk };
            }

            clearAllFormulas() {
                let fk = {}
                for (let column = 0; column < this.wells.length; column++) {
                    for (let row = 0; row < this.wells[column].length; row++) {
                        console.log(" delete formula ")
                        this.wells[column][row].formula = null;
                    }
                }
                return fk

            }

            sortColumn(column, ascending = true) {
                const wells = this.wells[column];
                const sortable = [];
                const nonSortable = [];
                wells.forEach((item, index) => {
                    if (typeof item.value === 'number') {
                        sortable.push(item);
                    } else {
                        nonSortable.push({ item, index });
                    }
                });
                sortable.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);
                const sortedColumn = [];
                let sortableIndex = 0;
                for (let i = 0; i < wells.length; i++) {
                    if (nonSortable.length > 0 && nonSortable[0].index === i) {
                        sortedColumn.push(nonSortable.shift().item);
                    } else {
                        sortedColumn.push(sortable[sortableIndex]);
                        sortableIndex++;
                    }
                }
                this.wells[column] = sortedColumn;
                return this.wells;
            }

            setColumnHeader(index) {
                if (!index in this.column_headers)
                    this.column_headers.push(index)
            }

            setRowHeader(index) {
                if (!index in this.row_headers) {
                    this.row_headers.push(index)
                }
            }

            sortColumn_deprecated(column, ascending = true) {
                this.wells[column].sort((a, b) => {
                    const valueA = typeof a.value === 'number' ? a.value : null;
                    const valueB = typeof b.value === 'number' ? b.value : null;

                    return ascending ? valueA - valueB : valueB - valueA;
                });
                return wells;
            }

            sortRowsByColumnPreserveStrings(column, ascending = true) {
                const rows = Object.keys(this.wells[column]);
                const sortable = [];
                const nonSortable = [];
                rows.forEach((row, index) => {
                    let value = this.wells[column][row].value;
                    let numericValue = parseFloat(value);

                    if (!isNaN(numericValue)) {
                        sortable.push({ row, value: numericValue });
                    } else {
                        nonSortable.push({ row, index });
                    }
                });

                sortable.sort((a, b) => ascending ? a.value - b.value : b.value - a.value);

                const sortedWells = {};
                rows.forEach(() => {
                    for (let col in this.wells) {
                        sortedWells[col] = [];
                    }
                });

                let sortableIndex = 0;
                nonSortable.forEach(({ row, index }) => {
                    while (sortedWells[column][index] === undefined) {
                        const currentRow = sortable[sortableIndex]?.row;
                        if (currentRow !== undefined) {
                            for (let col in this.wells) {
                                sortedWells[col].push(this.wells[col][currentRow]);
                            }
                            sortableIndex++;
                        }
                    }
                    for (let col in this.wells) {
                        sortedWells[col][index] = this.wells[col][row];
                    }
                });

                while (sortableIndex < sortable.length) {
                    const currentRow = sortable[sortableIndex].row;
                    for (let col in this.wells) {
                        sortedWells[col].push(this.wells[col][currentRow]);
                    }
                    sortableIndex++;
                }

                return sortedWells;
            }

            colorWellsBySimilarity(wc) {
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

                const minVal = Math.min(...numbers);
                const maxVal = Math.max(...numbers);
                const normalized = numbers.map(num => (num - minVal) / (maxVal - minVal));

                const colors = normalized.map(n => {
                    const hue = 240 * (1 - n);
                    return `hsl(${hue}, 100%, 50%)`;
                });

                let index = 0;
                for (let nwe of nwells) {
                    nwe.color = colors[index++]
                }
            }

            resetHeaderWells() {
                let col = this.getWellsByTag('ColumnHeader')
                let row = this.getWellsByTag('RowHeader')
                if (col) {
                    for (let c of col) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForColumn(r.rowIdx, r.colIdx)
                    }
                }
                if (row) {
                    for (let c of row) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForRow(r.rowIdx, r.colIdx)
                    }
                }

            }
            applycolumnheaders() {
                for (let index = 0; index < this.wells.length; index++) {
                    if (this.wells[index]?.length > 0)
                        if (this.wells[index][0])
                            this.wells[index][0].setGroup('ColumnHeader')
                }

                let col = this.getWellsByTag('ColumnHeader')
                let row = this.getWellsByTag('RowHeader')
                if (col) {
                    for (let c of col) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForColumn(r.rowIdx, r.colIdx)
                    }
                }
                if (row) {
                    for (let c of row) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForRow(r.rowIdx, r.colIdx)
                    }
                }

            }

            reapplyHeaderWells() {
                for (let c of this.column_headers) {
                    for (let index = 0; index < this.wells.length; index++) {
                        this.wells[index][c].setGroup('ColumnHeader')
                    }
                }
                for (let r of this.row_headers) {
                    for (let index = 0; index < this.wells[r].length; index++)
                        this.wells[r][index] = 'RowHeader'
                }

                let col = this.getWellsByTag('ColumnHeader')
                let row = this.getWellsByTag('RowHeader')
                if (col) {
                    for (let c of col) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForColumn(r.rowIdx, r.colIdx)
                    }
                }
                if (row) {
                    for (let c of row) {
                        let r = this.getWellIndicies(c)
                        this.applyHeaderWellForRow(r.rowIdx, r.colIdx)
                    }
                }
            }

            applyHeaderWellForColumn(rowIndex, colIndex) {

                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index.");
                    return;
                }

                const well = this.wells[colIndex][rowIndex];

                if (well && well.value) {
                    let groupName = well.value;

                    for (let i = 0; i < this.wells[colIndex].length; i++) {
                        const targetWell = this.wells[colIndex][i];
                        if (targetWell && typeof targetWell.setGroup === 'function') {
                            if (groupName !== 'ColumnHeader' && targetWell.uid != well.uid) {
                                targetWell.setGroup(groupName);

                            }
                        }
                    }

                } else {
                    console.log(`No value found for well at row ${rowIndex}, column ${colIndex}`);
                }
            }

            clearHeaderWellForColumn(rowIndex, colIndex) {

                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index.");
                    return;
                }
                const well = this.wells[colIndex][rowIndex];

                if (well && well.value) {
                    let groupName = well.value;
                    for (let i = 0; i < this.wells[colIndex].length; i++) {
                        const targetWell = this.wells[colIndex][i];
                        if (targetWell && typeof targetWell.setGroup === 'function') {
                            if (groupName !== 'ColumnHeader' && targetWell.uid != well.uid) {
                                targetWell.removeGroup(groupName);

                            }
                        }
                    }
                } else {
                    console.log(`No value found for well at row ${rowIndex}, column ${colIndex}`);
                }
            }

            applyHeaderWellForRow(rowIndex, colIndex) {
                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index.");
                    return;
                }

                console.log(" colIndex " + colIndex)
                if (this.wells.length <= colIndex) {
                    return;
                }
                else if (this.wells.length <= colIndex || this.wells[colIndex].length <= rowIndex) {
                    return;
                }

                const well = this.wells[colIndex][rowIndex];

                if (well && well.value) {
                    let groupName = well.value;
                    for (let j = 0; j < this.wells.length; j++) {
                        const targetWell = this.wells[j][rowIndex];
                        if (targetWell && typeof targetWell.setGroup === 'function' && targetWell.uid != well.uid) {
                            targetWell.setGroup(groupName);

                        }
                    }
                } else {
                    console.log(`No value found for well at row ${rowIndex}, column ${colIndex}`);
                }
            }
            applyAddressWellForRow(rowIndex, colIndex) {
                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index.");
                    return;
                }
                const well = this.wells[colIndex][rowIndex];
                if (well && well.value) {
                    let address = well.value;
                    for (let j = colIndex + 1; j < this.wells.length; j++) {
                        const targetWell = this.wells[j][rowIndex];
                        if (targetWell && typeof targetWell.setAddress === 'function') {
                            targetWell.setAddress(address);
                        }
                    }
                } else {
                    console.log(`No value found for well at row ${rowIndex}, column ${colIndex}`);
                }
            }

            applyGroupBasedOnHeaderRow(rowIndex) {
                if (rowIndex < 0 || rowIndex >= this.wells[0].length) {
                    console.error("Invalid row index");
                    return;
                }

                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    const well = this.wells[colIndex][rowIndex];
                    if (well && well.getGroup && well.getGroup("Column_Header")) {
                        let groupName = well.value || "";
                        if (groupName) {
                            this.setGroupForRow(rowIndex, groupName);
                        }
                    }
                    else if (well && well.getGroup && well.getGroup("ColumnHeader")) {
                        let groupName = well.value || "";
                        if (groupName) {
                            this.setGroupForRow(rowIndex, groupName);
                        }
                    }
                }
                LJScript.add(this.name, 'Tag columns')
            }

            applyGroupBasedOnHeaderColumn(colIndex) {
                if (colIndex < 0 || colIndex >= this.wells.length) {
                    console.error("Invalid column index");
                    return;
                }
                for (let rowIndex = 0; rowIndex < this.wells[0].length; rowIndex++) {
                    const well = this.wells[colIndex][rowIndex];
                    if (well && well.getGroup && well.getGroup("Row_Header")) {
                        let groupName = well.value || "";
                        if (groupName) {
                            this.setGroupForColumn(colIndex, groupName);
                        }
                    }
                }
                LJScript.add(this.name, 'Tag rows')
            }

            selectContiguousRange() {
                let sl = this.getSelectedWellsInOrder();
                let selectedBlocks = this.findContiguousSelectedWells(sl)
                for (let s of selectedBlocks) {
                    s.selectIt();
                }

            }

            navigateWell(currentWell, direction, isSelected, pt) {

                let row = -1, col = -1;

                for (let i = 0; i < this.wells.length; i++) {
                    for (let j = 0; j < this.wells[i].length; j++) {
                        if (this.wells[i][j] === currentWell) {
                            row = i;
                            col = j;
                            break;
                        }
                    }
                    if (row !== -1) break;
                }

                if (row === -1 || col === -1) {
                    return null;
                }

                switch (direction) {
                    case 'up':
                        col = col > 0 ? col - 1 : col;
                        break;
                    case 'down':
                        col = col < this.wells[row].length - 1 ? col + 1 : col;
                        break;
                    case 'left':
                        row = row > 0 ? row - 1 : row;
                        break;
                    case 'right':
                        row = row < this.wells.length - 1 ? row + 1 : row;
                        break;
                    default:
                        return null;
                }

                let ww = this.getSelectedWellsInOrder();
                if (ww != null && ww.length == 1) {
                    ww[0].deselectIt();
                    pt.selected_well = this.wells[row][col]
                    this.wells[row][col].selectIt();
                }

                return this.wells[row][col]
            }

            selectUsingStringNotation(stringv) {
                return this.selectWellsByString(stringv)
            }

            selectColumnAtRow__(_rowIndex, _colindex) {
                for (let rowIndex = _rowIndex; rowIndex < this.wells[_colindex].length; rowIndex++) {
                    let well = this.wells[_colindex][rowIndex];
                    well.selectIt();
                }

                if (_colindex === this.grid.xmax - 1) {
                    _colindex = 'last'
                    LJScript.add(this.name, `select [${_colindex}:${_colindex}][${_rowIndex}:]`)

                } else {
                    LJScript.add(this.name, `select [${_colindex}:${_colindex}][${_rowIndex}:]`)
                }
            }
            selectColumnAtRow(_rowIndex, _colIndex) {
                for (let rowIndex = _rowIndex; rowIndex < this.wells[_colIndex].length; rowIndex++) {
                    let well = this.wells[_colIndex][rowIndex];
                    well.selectIt();
                }

                if (_colIndex === this.grid.xmax - 1) {
                    _colIndex = 'last';
                    LJScript.add(this.name, `select [${_colIndex}:${_colIndex}][${_rowIndex}:]`);
                } else {
                    LJScript.add(this.name, `select [${_colIndex}:${_colIndex}][${_rowIndex}:]`);
                }

                let contiguous = true;

                for (let colIndex = _colIndex; colIndex < this.wells.length; colIndex++) {
                    if (!contiguous && colIndex !== _colIndex) break;
                    let rowSelected = this.wells[colIndex][_rowIndex]?.select;
                    if (!rowSelected) {
                        contiguous = false;
                        break;
                    }
                    for (let rowIndex = _rowIndex; rowIndex < this.wells[colIndex].length; rowIndex++) {
                        let well = this.wells[colIndex][rowIndex];
                        if (!well) {
                            this.wells[colIndex][rowIndex] = { value: "", selectIt: () => { } };
                        }
                        this.wells[colIndex][rowIndex].selectIt();
                    }
                }

            }

            selectWellsByString(command) {

                let w = []

                function parseRange(rangeStr, maxIndex) {

                    let [start, end] = rangeStr.split(":").map(val => val.trim() ? parseInt(val, 10) : null);
                    return {
                        start: start ?? 0,
                        end: end ?? maxIndex - 1
                    };
                }

                const commands = command.split(",").map(str => str.trim());
                const maxCols = this.wells.length;
                const maxRows = Math.max(...this.wells.map(col => col.length));
                commands.forEach(singleCommand => {
                    const match = singleCommand.match(/^\[(.*?)\]\[(.*?)\]$/);
                    if (!match) {
                        throw new Error(`Invalid command format. Expected format: [column range][row range], but got: ${singleCommand}`);
                    }
                    LJScript.add(this.name, `select ${singleCommand}`)
                    const [_, colRangeStr, rowRangeStr] = match;
                    const { start: colStart, end: colEnd } = parseRange(colRangeStr, maxCols);
                    const { start: rowStart, end: rowEnd } = parseRange(rowRangeStr, maxRows);
                    for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
                        for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex++) {
                            let well = this.wells[colIndex]?.[rowIndex];
                            if (well) {
                                well.selectIt();
                                w.push(well)
                            }
                        }
                    }
                });
                return w;
            }

            getWells(colStart, colEnd, rowStart, rowEnd) {
                let w = []

                for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
                    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex++) {
                        let well = this.wells[colIndex]?.[rowIndex];
                        if (well) {
                            w.push(well)
                        }
                    }
                }
                return w;
            }

            getWellsByString(command) {
                let w = []
                function parseRange(rangeStr, maxIndex) {

                    let [start, end] = rangeStr.split(":").map(val => val.trim() ? parseInt(val, 10) : null);
                    return {
                        start: start ?? 0,
                        end: end ?? maxIndex - 1
                    };
                }

                const commands = command.split(",").map(str => str.trim());
                const maxCols = this.wells.length;
                const maxRows = Math.max(...this.wells.map(col => col.length));
                commands.forEach(singleCommand => {
                    const match = singleCommand.match(/^\[(.*?)\]\[(.*?)\]$/);
                    if (!match) {
                        throw new Error(`Invalid command format. Expected format: [column range][row range], but got: ${singleCommand}`);
                    }
                    LJScript.add(this.name, `select ${singleCommand}`)
                    const [_, colRangeStr, rowRangeStr] = match;
                    const { start: colStart, end: colEnd } = parseRange(colRangeStr, maxCols);
                    const { start: rowStart, end: rowEnd } = parseRange(rowRangeStr, maxRows);
                    for (let colIndex = colStart; colIndex <= colEnd; colIndex++) {
                        for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex++) {
                            let well = this.wells[colIndex]?.[rowIndex];
                            if (well) {
                                w.push(well)
                            }
                        }
                    }
                });
                return w;
            }

            getWellRange(_wells) {
                let minRow = Infinity;
                let maxRow = 0;
                let minColumn = Infinity;
                let maxColumn = 0;

                for (let _well of _wells) {

                    for (let colIdx = 0; colIdx < this.wells.length; colIdx++) {
                        const column = this.wells[colIdx];
                        for (let rowIdx = 0; rowIdx < column.length; rowIdx++) {
                            const well = column[rowIdx];

                            if (well === _well) {

                                if (rowIdx + 1 > maxRow) {
                                    maxRow = rowIdx + 1;
                                }
                                if (rowIdx + 1 < minRow) {
                                    minRow = rowIdx + 1;
                                }
                                if (colIdx + 1 > maxColumn) {
                                    maxColumn = colIdx + 1;
                                }
                                if (colIdx + 1 < minColumn) {
                                    minColumn = colIdx + 1;
                                }
                            }
                        }
                    }
                }

                if (minRow === Infinity || minColumn === Infinity) {
                    return '[No_Selection]';
                }

                return `[${minColumn - 1}:${maxColumn - 1}][${minRow - 1}:${maxRow - 1}]`;
            }

            selectWellsByTag(tag) {
                let wt = []
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                        if (this.wells[x] && this.wells[x][y]) {
                            let well = this.wells[x][y];
                            if (well.group) {
                                for (let property in well.group) {
                                    if (property.toLowerCase().startsWith(tag.toLowerCase())) {
                                        well.selectIt();
                                        wt.push(well)
                                    }
                                }
                            }
                        }
                    }
                }
                return wt;
            }
            deselectByTag(tag) {
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                        if (this.wells[x] && this.wells[x][y]) {
                            let well = this.wells[x][y];
                            if (well.group) {
                                for (let property in well.group) {
                                    if (property.toLowerCase().startsWith(tag.toLowerCase())) {
                                        well.deselectIt();
                                    }
                                }
                            }
                        }
                    }
                }
            }

            getColumnHeadersWithValue(value) {
                let matchingWells = [];
                const isFloat = !isNaN(parseFloat(value)) && isFinite(value);
                const targetValue = isFloat ? Math.round(parseFloat(value) * 10) / 10 : ('' + value).trim();

                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                        if (this.wells[x] && this.wells[x][y]) {
                            let well = this.wells[x][y];

                            if (well.group && well.group['ColumnHeader'] !== undefined) {
                                let wellValue = well.value;

                                if (typeof wellValue === 'number') {
                                    wellValue = Math.round(wellValue * 10) / 10;
                                } else {
                                    wellValue = ('' + wellValue).trim();
                                }

                                if (well.group['ColumnHeader'] && wellValue === targetValue) {
                                    matchingWells.push(well);
                                }
                            }
                        }
                    }
                }

                return matchingWells;
            }

            getWellsByTag(tag) {
                let wt = []
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                        if (this.wells[x] && this.wells[x][y]) {
                            let well = this.wells[x][y];
                            if (well.group) {
                                for (let property in well.group) {
                                    if (property.toLowerCase().startsWith(tag.toLowerCase())) {
                                        wt.push(well)
                                    }
                                }
                            }
                        }
                    }
                }
                return wt;
            }

            searchTaggedWells(tag) {
                return this.selectWellsByTag(tag)
            }

            getSelectedColumn = () => {
                let multiple = []

                for (let column of this.wells) {
                    const isColumnSelected = column.every(row => row.select === true);
                    if (isColumnSelected) {
                        multiple.push(column)
                    }
                }
                return multiple;
            }
            getSelectedRow = () => {
                let multiple = [];
                const rowCount = this.wells[0]?.length || 0;

                for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                    let isRowSelected = this.wells.every(column => column[rowIndex]?.select === true);

                    if (isRowSelected) {
                        let selectedRow = this.wells.map(column => column[rowIndex]);
                        multiple.push(selectedRow);
                    }
                }
                return multiple;
            };

            selectColumnsByRowValue(_rowIndex, param3) {
                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    let well = this.wells[colIndex][_rowIndex];

                    if (well.getValue() === param3) {

                        for (let rowIndex = 0; rowIndex < this.wells[0].length; rowIndex++) {
                            this.wells[colIndex][rowIndex].selectIt();
                        }
                    }
                }

                LJScript.add(this.name, `select all wells in columns where row ${_rowIndex} equals ${param3}`);
            }

            selectRowsByColumnValue(_colIndex, param3) {
                for (let rowIndex = 0; rowIndex < this.wells[0].length; rowIndex++) {
                    let well = this.wells[_colIndex][rowIndex];

                    if (well.getValue() === param3) {

                        for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                            this.wells[colIndex][rowIndex].selectIt();
                        }
                    }
                }
                LJScript.add(this.name, `select row where column ${_colIndex} equals ${param3}`);
            }

            selectRowAtColumn(_rowIndex, _colindex) {
                for (let colIndex = _colindex; colIndex < this.wells.length; colIndex++) {
                    let well = this.wells[colIndex][_rowIndex];
                    well.selectIt();
                }
                LJScript.add(this.name, `select [${_colindex}][${_rowIndex}]`)
            }

            createFunctionMenu = (pt, upx, upy) => {
                let msub = []
                msub.push(
                    {
                        label: 'Mean',
                        click: async (x, y) => {
                            try {
                                let selected_wells = this.getSelectedWellsInOrder();
                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = mean(lv);
                                let w = new GenericWell('', m);
                                let cr = selectedPlate.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('Mean')
                                w.equations[functionToBase64(mean)] = selected_wells.map(_o => _o.uid);
                                selectedPlate.appendColumn(w, cr.colIdx)
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
                                    lv.push(v)
                                }
                                let m = mean(lv);
                                let w = new GenericWell('', m);
                                let cr = selectedPlate.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('IQRMean')
                                w.equations[functionToBase64(meanIQR)] = selected_wells.map(_o => _o.uid);

                                selectedPlate.appendColumn(w, cr.colIdx)

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

                                let selected_wells = this.getSelectedWellsInOrder();
                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = range(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('Range');
                                w.equations[functionToBase64(range)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)
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

                                let selected_wells = this.getSelectedWellsInOrder();
                                let index = 0;

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = variance(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('Variance')
                                w.ref = selected_wells.map(_o => _o.uid);
                                w.equations[functionToBase64(variance)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)

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
                                let selected_wells = this.getSelectedWellsInOrder();
                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = standardDeviation(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('StdDev')
                                w.equations[functionToBase64(standardDeviation)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)
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

                                let selected_wells = this.getSelectedWellsInOrder();
                                let index = 0;

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = interquartileRange(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('IQR');
                                w.equations[functionToBase64(interquartileRange)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)
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

                                let selected_wells = this.getSelectedWellsInOrder();
                                let index = 0;

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = zScores(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('zScores');
                                w.equations[functionToBase64(zScores)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)
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

                                let selected_wells = this.getSelectedWellsInOrder();
                                let index = 0;

                                let lv = []
                                for (let item of selected_wells) {
                                    let v = item.value;
                                    lv.push(v)
                                }
                                let m = detectOutliers(lv);
                                let w = new GenericWell('', m);
                                let cr = this.getWellIndicies(selected_wells[selected_wells.length - 1])
                                w.setGroup('Outliers')
                                w.equations[functionToBase64(detectOutliers)] = selected_wells.map(_o => _o.uid);
                                this.appendColumn(w, cr.colIdx)
                                pt.wb(null)

                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                        move: () => {
                        },
                    });

                pt.menu = new Menu(msub, upx, upy, 'rgb(0, 87, 163)', 'white')
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
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu.mouseMove(pt.grid, mmx, mmy)
                        }
                    },
                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        }
                    },
                    draw: (grid, ctx) => {
                        if (pt.menu) {
                            ctx.fillStyle = 'rgba(255,255,255,0.23)'
                            ctx.fillRect(pm.plateTrack.grid.xi, pm.plateTrack.grid.yi, pm.plateTrack.grid.width, pm.plateTrack.grid.height)
                            pt.menu.draw(ctx, grid)
                        }
                    },
                    close: () => {
                        clearMenu();

                    },
                    menuManager: null,
                    menu: pt.menu
                }
                pt.wb(t)
            }

            getRef(ref) {
                if (ref === this.uid) {
                    return this;
                }
                else {
                    for (let t of this.plates) {
                        return t.getRef(ref)
                    }
                }
            }

            drawButtons(ctx, graph, __sw) {
                if (!this.selected) {
                    return;
                }
                this.grid.rescale();
                let screen_height = graph.screenHeight(this.getHeight());

                let sy = graph.Y(this.grid.yi);
                if ((sy + screen_height) < 0) {
                    return;
                }
                let index = 0;
                let b = this.button_set;

                let tw = (graph.worldWidth(30 * b.length));
                let init = graph.X(this.grid.xi + this.getWidth() - tw);
                if (init < 0) {
                    init = graph.Xwc(0);
                }

                ctx.lineWidth = 1;

                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = graph.Y(this.grid.yi + this.getHeight() + graph.worldHeight(this.margin.top));
                    let buttonHeight = button.height;
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    if (button.name === "close") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;

                        let padding = 5;
                        let x1 = centerX - circleRadius + padding;
                        let y1 = centerY - circleRadius + padding;
                        let x2 = centerX + circleRadius - padding;
                        let y2 = centerY + circleRadius - padding;

                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.moveTo(x1, y2);
                        ctx.lineTo(x2, y1);
                        ctx.stroke();
                    }
                    else if (button.name === "move") {

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = 'lightCyan';
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        let arrowLength = circleRadius * 0.8;
                        let arrowHead = 2;

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY - arrowLength);
                        ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                        ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY + arrowLength);
                        ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                        ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX - arrowLength, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX + arrowLength, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                        ctx.stroke();

                    }

                    else if (button.name === "minimize") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius}px Arial`;
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(button.letter, centerX, centerY);

                    } else {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;

                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius * 1.2}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';
                        ctx.fillText(button.name, centerX, centerY);

                    }

                    index++;
                }

                if (this.attr__RowAddRemoveButtons) {
                    let xinit = graph.X(this.grid.xi);
                    index = 0;
                    for (let button of this.bottom_buttons) {
                        let buttonX = xinit - bsize * index;
                        let buttonY = graph.Y(this.grid.yi);
                        let buttonHeight = button.height;
                        if (buttonY < 0 && (buttonY + screen_height) > 0) {
                            buttonY = 10;
                        }
                        ctx.shadowBlur = 3;
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        if (button.name === "+") {
                            let circleRadius = Math.min(bsize, buttonHeight) / 2;
                            let centerX = buttonX + bsize / 2;
                            let centerY = buttonY + buttonHeight / 2;

                            ctx.fillStyle = button.color;
                            if (this.highlightbutton && button.name === this.highlightbutton)
                                ctx.fillStyle = button.highlight_color;

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 2;

                            let padding = 5;
                            let barLength = circleRadius * 2 - padding * 2;

                            ctx.beginPath();
                            ctx.moveTo(centerX - barLength / 2, centerY);
                            ctx.lineTo(centerX + barLength / 2, centerY);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY - barLength / 2);
                            ctx.lineTo(centerX, centerY + barLength / 2);
                            ctx.stroke();
                        } else if (button.name === '-') {
                            let circleRadius = Math.min(bsize, buttonHeight) / 2;
                            let centerX = buttonX + bsize / 2;
                            let centerY = buttonY + buttonHeight / 2;

                            ctx.fillStyle = button.color;
                            if (this.highlightbutton && button.name === this.highlightbutton)
                                ctx.fillStyle = button.highlight_color;

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 2;

                            let padding = 5;
                            let barLength = circleRadius * 2 - padding * 2;

                            ctx.beginPath();
                            ctx.moveTo(centerX - barLength / 2, centerY);
                            ctx.lineTo(centerX + barLength / 2, centerY);
                            ctx.stroke();

                        }
                        index++;
                    }
                }
            }

            hideWellBorders() {
                for (let col of this.wells) {
                    for (let row of col) {
                        row.attr__showBorder = false;
                    }
                }
            }

            drawSimpleButtons(ctx, graph, __sw) {
                if (!this.selected) {
                    return;
                }
                if (this.plateType === 'annotation') {
                    this.button_set = this.icon_buttons
                }
                else if (this.plateType === 'package') {
                    this.button_set = this.package_buttons;
                }
                else
                    this.button_set = this.simple_buttons;
                this.grid.rescale();
                let screen_height = graph.screenHeight(this.getHeight());
                let sy = graph.Y(this.grid.yi);
                if ((sy + screen_height) < 0) {
                    return;
                }
                let index = 0;
                let b = this.button_set;
                let tw = (graph.worldWidth(30 * b.length));
                let init = graph.X(this.grid.xi + this.getWidth() - tw);
                if (init < 0) {
                    init = graph.Xwc(0);
                }

                ctx.lineWidth = 1;
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = graph.Y(this.grid.yi + this.getHeight() + graph.worldHeight(this.margin.top));
                    let buttonHeight = button.height;
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }

                    ctx.shadowBlur = 3;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;

                    if (button.name === "close") {

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;

                        let padding = 5;
                        let x1 = centerX - circleRadius + padding;
                        let y1 = centerY - circleRadius + padding;
                        let x2 = centerX + circleRadius - padding;
                        let y2 = centerY + circleRadius - padding;

                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.moveTo(x1, y2);
                        ctx.lineTo(x2, y1);
                        ctx.stroke();
                    }
                    else if (button.name === "move") {

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = 'lightCyan';
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        let arrowLength = circleRadius * 0.8;
                        let arrowHead = 2;

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY - arrowLength);
                        ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                        ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY + arrowLength);
                        ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                        ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX - arrowLength, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX + arrowLength, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                        ctx.stroke();

                    }

                    else if (button.name === "minimize") {

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius}px Arial`;
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(button.letter, centerX, centerY);

                    } else {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;

                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius * 1.2}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';
                        ctx.fillText(button.name, centerX, centerY);
                    }

                    index++;
                }
            }

            getWellByUID(uid) {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        if (this.wells[x][y].uid === uid) {
                            return this.wells[x][y]
                        }
                    }
                }
            }

            un__highlight__() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        this.wells[x][y].__highlight__ = false;
                    }
                }
            }

            selectNext(_well, _b) {
                let next = false;
                this.un__highlight__();
                for (let y = 0; y < this.wells[0].length; y++) {
                    for (let x = 0; x < this.wells.length; x++) {
                        let well = this.wells[x][y];
                        if (next) {
                            if (_b) {
                                if (well.select) {
                                    well.__highlight__ = true;
                                    return well;
                                }
                            } else {
                                well.__highlight__ = true;

                                return well;
                            }
                        }

                        if (well.uid === _well.uid) {
                            next = true;
                        }
                    }
                }
                return null;
            }

            async viewWell(xx, xy, pt) {
                this.grid.rescale();
                let xw = pt.grid.Xwc(xx);
                let yw = pt.grid.Ywc(xy);
                let x = Math.floor(this.grid.Xwc(xw - this.grid.xi * 2))
                let y = Math.floor(this.grid.Ywc(yw - this.grid.yi * 2))
                this.pwx = x
                this.pwy = y
                this.selected = true;
            }

            async highlightColumns(search_term) {
                this.last_touched = new Date();

                let wells = this.searchWells_index(search_term);
                let columns = [];
                for (let w of wells) {
                    columns.push(w.x);
                }
                for (let x of columns) {
                    for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                        if (this.wells[x] && this.wells[x][y])
                            this.wells[x][y].select = true;
                    }
                }
                let count = 0;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select === true) {
                            count++;
                        }
                    }
                }
                setTimeout(() => {
                    this.message = "Selected " + columns.length + " columns.";
                }, 1000);
            }

            highlightRows(search_term) {

                LJScript.add(this.name, `highlight_rows value=${search_term}`)

                this.last_touched = new Date();
                if (search_term === null)
                    return;

                let wells = this.searchWells_index(search_term)
                let rows = []
                for (let w of wells) {
                    rows.push(w.y);
                }
                for (let y of rows) {
                    for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                        if (this.wells[x] && this.wells[x][y])
                            this.wells[x][y].select = true;
                    }
                }
                let count = 0;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select === true) {
                            count++;
                        }
                    }
                }
                setTimeout(() => {
                    this.message = search_term + " = " + rows.length + " rows."
                }, 300)
            }

            getFirstRow() {
                return this.grid.ymin;
            }
            getLastColumn() {
                return this.grid.xmax - 1;
            }
            getLastRow() {
                return this.grid.ymax - 1;
            }
            getFirstColumn() {
                return this.grid.ymin;
            }

            highlightWells(search_term) {
                let wv = []

                function parseSyntax(input, pl) {

                    const lookup = {
                        column: {
                            last: () => pl.getLastColumn(),
                            first: () => pl.getFirstColumn(),
                        },
                        row: {
                            last: () => pl.getLastRow(),
                            first: () => pl.getFirstRow(),
                        }
                    };

                    const regex = /\[(\w+):?(\w*)\]/g;

                    let bracketCount = 0;

                    const transformed = input.replace(regex, (match, p1, p2) => {
                        bracketCount++;

                        const context = (bracketCount <= 2) ? 'column' : 'row';
                        let result = '[';

                        result += lookup[context][p1] ? lookup[context][p1]() : p1;

                        if (p2) {
                            result += ':' + (lookup[context][p2] ? lookup[context][p2]() : p2);
                        }

                        result += ']';
                        return result;
                    });

                    return transformed;
                }

                function isValidCommand(command) {

                    const regex = /^(\[\d*:?(\d+)?\]\[\d*:?(\d+)?\])(,(\[\d*:?(\d+)?\]\[\d*:?(\d+)?\]))*$/;
                    if (regex.test(command)) {
                        console.log("Valid command format:", command);
                        return true;
                    } else {
                        console.log("Invalid command format:", command);
                        return false;
                    }
                }
                if (search_term === null || search_term.length <= 0)
                    return;

                search_term = parseSyntax(search_term, this)

                if (search_term.startsWith('[') && isValidCommand(search_term)) {
                    return this.selectWellsByString(search_term)
                }
                let wells = this.searchWells(search_term)
                for (let w of wells) {
                    w.selectIt()
                }
                let count = 0;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select === true) {
                            count++;
                            this.message = "" + count

                        }
                    }
                }
                setTimeout(() => {
                    this.message = "Selected " + count
                }, 100)

                return wells;
            }

            async highlightWellsTagged(search_term) {
                this.unhighlightWells();
                function isValidCommand(command) {
                    const regex = /^(\[\d*:?(\d+)?\]\[\d*:?(\d+)?\])(,(\[\d*:?(\d+)?\]\[\d*:?(\d+)?\]))*$/;
                    if (command.startsWith('[') && regex.test(command)) {
                        console.log("Valid command format:", command);
                        return true;
                    } else {
                        console.log("Invalid command format:", command);
                        return false;
                    }
                }
                if (search_term === null || search_term.length <= 0)
                    return;

                search_term = search_term.trim();
                if (isValidCommand(search_term)) {
                    return this.selectWellsByTag(search_term)
                }
                let wells = this.selectWellsByTag(search_term)
                if (wells && wells.length > 0) {
                    for (let w of wells) {
                        w.selectIt()
                    }

                    let count = 0;
                    for (let x = 0; x < this.wells.length; x++) {
                        for (let y = 0; y < this.wells[x].length; y++) {
                            let well = this.wells[x][y];
                            if (well && well.select === true) {
                                count++;
                            }
                        }
                    }
                    setTimeout(() => {
                        this.message = "Selected " + count
                    }, 400)
                    return v
                }

            }

            fitRowsAndColumns() {
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                for (let x = 0; x < this.wells.length; x++) {
                    if (this.grid.ymax < this.wells[x].length) {
                        this.grid.ymax = this.wells[x].length;
                    }
                }
                this.grid.rescale();
            }

            async selectWellByAddress(well_name) {
                let count = 0;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.position == well_name && well.select === true) {
                            count++;
                        }
                    }
                }
            }

            async unhighlightWells() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        try {
                            let well = this.wells[x][y];

                            if (well && typeof well.deselectIt === 'function') {
                                well.select = false;
                            }
                        } catch (error) {
                            console.error(`Error deselecting well at [${x}, ${y}]:`, error);
                        }
                    }
                }
            }

            unhighlight() {
                this.unhighlightWells();
            }

            searchWells(search_term) {
                let matchedWells = [];
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            if (well && well.value && typeof well.value === 'string' && well.value.toLowerCase().indexOf(search_term.toLowerCase()) >= 0) {
                                matchedWells.push(well);
                            }
                            else if (well && well.value != null && well.value.toString().toLowerCase().indexOf(search_term.toLowerCase()) >= 0) {
                                matchedWells.push(well);
                            }

                        }
                    }
                }
                return matchedWells;
            }

            searchWells_index(search_term) {
                if (search_term === null || search_term.length <= 0) {
                    return this.searchForEmptyWells_index();
                }

                let matchedWells = [];
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.value && well.value.toString().startsWith(search_term))
                            matchedWells.push({ x: x, y: y });

                    }
                }
                return matchedWells;
            }
            searchForEmptyWells_index() {
                let matchedWells = [];
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            if (well.value === null || well.value === '' || well.value === NaN) {
                                matchedWells.push({ x: x, y: y });
                            }
                        }
                    }
                }
                return matchedWells;
            }

            handleKeyDown(pt, event) {
                textStyle = 'data'
                if (event.ctrlKey) {
                    return;
                }
                this.last_touched = new Date();
                if (smenu) {
                    return;
                }

                let w = this.getSelectedWellsInOrder();
                if (!this.textActive && w.length > 0 && !smenu) {
                    this.editWell(w[0], pt)
                }

                if (!this.textActive) {
                    return;
                }
                const navigateAndUpdateWell = (direction) => {
                    if (pt.selected_well) {
                        this.pushAnyPreviousHistory();
                        pt.selected_well.__highlight__ = false;
                        console.log(" diretion " + direction)
                        pt.selected_well = this.navigateWell(pt.selected_well, direction, true, pt);


                        if (pt.selected_well != null && pt.selected_well.x != null) {
                            this.textBoxX = pt.selected_well.__screen_x;
                            this.textBoxY = pt.selected_well.__screen_y;
                            this.pwx = pt.selected_well.x;
                            this.pwy = pt.selected_well.y;
                            pt.selected_well.__highlight__ = true;
                            this.text = getWellText(pt.selected_well)
                            cursorPos = this.text.length;
                        }
                    }
                };

                const handleCharacterInput = (key) => {
                    this.last_touched = new Date();

                    try {
                        if (selectText) {
                            this.text = key + '';
                            selectText = false;
                        } else
                            this.text = this.text.slice(0, cursorPos) + key + this.text.slice(cursorPos);
                        if (pt.selected_well) {
                            pt.selected_well.setValue(this.text)
                        }
                    } catch (exception) {
                        this.text = '';
                    }
                    cursorPos = this.text.length;
                };

                const handleBackspace = () => {
                    if (cursorPos > 0) {
                        this.text = this.text.slice(0, cursorPos - 1) + this.text.slice(cursorPos);
                        cursorPos -= 1;
                    }
                };

                const handleEnter = () => {

                    if (pt.selected_well) {
                        this.pushAnyPreviousHistory();

                        if (pt.selected_well.skin_type === 'CONCENTRATION') {
                            if (pt.selected_well.setValueByType)
                                pt.selected_well.setValueByType(this.text);
                            this.__dirty = true;

                        }
                        else if (pt.selected_well.skin_type === 'Function') {
                            pt.selected_well.formula = this.text;
                            this.__dirty = true;

                        }
                        else {

                            if (pt.selected_well.setValueByType) {
                                pt.selected_well.setValueByType(this.text);
                                let id = this.getWellIndicies(pt.selected_well)
                                this.__dirty = true;

                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + this.text)
                            }
                        }
                        this.text = '';
                        this.textActive = false;
                        pt.selected_well.__highlight__ = false;
                        pt.selected_well = null;

                    }
                };





                switch (event.key) {

                    case 'Backspace':
                        if (w != null && w.length === 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                                let length = (pt.selected_well.obj + '').length;
                                pt.selected_well.setValue('');
                                pt.selected_well.obj = ((pt.selected_well.obj + '').substring(0, length - 1));
                                if (pt.selected_well.obj === '') {
                                    pt.selected_well.setWellType(null)
                                }
                                cursorPos -= 1;
                                return;
                            }
                            if (!pt.selected_well.value) {
                                pt.selected_well.setValue('');
                                let id = this.getWellIndicies(pt.selected_well)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                return;
                            }
                            let length = (pt.selected_well.value + '').length;
                            pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                            cursorPos -= 1;

                            return;
                        } else if (w != null && w.length > 1) {
                            let length = (pt.selected_well.value + '').length;
                            pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                            cursorPos -= 1;
                            return;
                        }
                        break;

                    case 'Enter':
                        this.__dirty = true;

                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)

                        }
                        this.__dirty = true;

                        if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                            pt.selected_well.setWellType(null)
                            this.deselectAll()
                            this.selectIt(pt);

                            return;
                        }
                        this.selectIt(pt);
                        pt.setMessage('Crunching the numbers...', 3)
                        setTimeout(() => {
                            pt.updateCalculations();
                        }, 100)
                        return;
                    case 'Delete':
                        if (w && w.length > 0) {
                            for (let a of w) {
                                a.setValue('')
                                let id = this.getWellIndicies(a)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                            }
                        }
                        return;
                    case 'Tab':
                        let ww = this.getSelectedWellsInOrder();
                        if (ww && ww.length === 1) {
                            return navigateAndUpdateWell('right')
                        } else
                            if (pt.selected_well) {

                                let id = this.getWellIndicies(pt.selected_well)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)
                                let useSelectionPath = false;
                                let count = this.getSelectedWells(this);
                                if (count != null && count.length > 1) {
                                    useSelectionPath = true;
                                }
                                pt.selected_well = this.selectNext(pt.selected_well, useSelectionPath);
                                if (pt.selected_well) {
                                    pt.selected_well.textSelected = true;

                                }
                                textStyle = 'data'
                                if (pt.selected_well && pt.selected_well.value && (pt.selected_well.value + '').length)
                                    cursorPos = this.text.length;
                            }
                        if (pt.selected_well) {
                            this.text = getWellText(pt.selected_well)
                            this.textBoxX = pt.selected_well.__screen_x;
                            this.textBoxY = pt.selected_well.__screen_y;
                            this.pwx = pt.selected_well.x;
                            this.pwy = pt.selected_well.y;

                            cursorPos = this.text.length;
                        }
                        break;
                    case 'ArrowLeft':
                        navigateAndUpdateWell('left');
                        break;
                    case 'ArrowRight':
                        navigateAndUpdateWell('right');
                        break;
                    case 'ArrowDown':
                        navigateAndUpdateWell('down');
                        break;
                    case 'ArrowUp':
                        navigateAndUpdateWell('up');
                        break;
                    case 'Backspace':
                        handleBackspace();
                        break;
                    case 'Enter':
                        handleEnter();
                        break;
                    case 'Escape':

                        break;
                    default:


                        if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                            let w = this.getSelectedWellsInOrder();
                            let ch = event.key;
                            if (w != null && w.length === 1) {
                                pt.selected_well = w[0]
                                if (pt.selected_well.textSelected) {
                                    pt.selected_well.setValue('');
                                    pt.selected_well.textSelected = false;
                                    cursorPos = 0
                                }
                                pt.selected_well.setValue((pt.selected_well.value || '') + ch);
                            } else if (w != null && w.length > 1) {
                                if (!pt.selected_well) {
                                    pt.selected_well = w[0]
                                }
                                if (pt.selected_well.textSelected) {
                                    pt.selected_well.setValue('');
                                    pt.selected_well.textSelected = false;
                                    cursorPos = 0
                                }
                                pt.selected_well.setValue((pt.selected_well.value || '') + ch);
                            }
                        }

                        break;
                }
            }

            deactivate() {
            }

            getXIndex(wx) {
                let cellX = this.grid.xmin;
                let currentXOffset = cellX;
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                    if (currentXOffset > wx) {
                        return x - 1;
                    }
                    currentXOffset += cellWidth + (1 - COL_OFFSET);
                }
                return Math.floor(currentXOffset);
            }

            insertCol(tx) {
                let newRow = [];
                for (let col = 0; col < this.wells[0].length; col++) {
                    newRow.push(createDefaultWell(tx, col));
                }
                let w = this.getWellByIndex(tx, 0);
                this.wells.splice(w.xindex, 0, newRow);
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;

                if (tx === this.grid.xmax - 1)
                    LJScript.add(this.name, 'add column')
                else
                    LJScript.add(this.name, 'Insert column ' + tx)
            }

            analyzeAndParse(strings) {
                const parseFunctions = {
                    splitByNumber: (str) => {
                        const match = str.match(/(\D+)(\d+)(\D+)/);
                        return match ? match.slice(1) : [str];
                    },
                    splitBySpecialChar: (str, char) => str.split(char),
                    splitByNumberAndUnit: (str) => {
                        const match = str.match(/(\D*)(\d+)([a-zA-Zμ]+.*)/);
                        return match ? match.slice(1) : [str];
                    },
                };

                const validStrings = strings.filter((str) => typeof str === "string" && str.trim() !== "");

                let specialCharCounts = {};
                let hasNumberPattern = true;
                let unitCounts = {};

                for (let str of validStrings) {

                    if (!/^\D+\d+\D+$/.test(str)) hasNumberPattern = false;

                    for (let char of str) {
                        if (/[,:;'\-_]/.test(char)) {
                            specialCharCounts[char] = (specialCharCounts[char] || 0) + 1;
                        }
                    }

                    const unitMatch = str.match(/\d+([a-zA-Zμ]+)/);
                    if (unitMatch) {
                        const unit = unitMatch[1];
                        unitCounts[unit] = (unitCounts[unit] || 0) + 1;
                    }
                }

                const topSpecialChars = Object.entries(specialCharCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([char, count]) => ({ char, count }));

                const topUnits = Object.entries(unitCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([unit, count]) => ({ unit, count }));

                let parsingDictionary = {};

                if (hasNumberPattern) {
                    parsingDictionary["splitByNumber"] = (arr) =>
                        arr.map((str) =>
                            typeof str === "string" && str.trim() !== ""
                                ? parseFunctions.splitByNumber(str)
                                : str
                        );
                }

                if (topSpecialChars.length > 0) {
                    parsingDictionary["splitBySpecialChar"] = (arr) =>
                        arr.map((str) =>
                            typeof str === "string" && str.trim() !== ""
                                ? parseFunctions.splitBySpecialChar(str, topSpecialChars[0].char)
                                : str
                        );
                }

                if (topUnits.length > 0) {
                    parsingDictionary["splitByNumberAndUnit"] = (arr) =>
                        arr.map((str) =>
                            typeof str === "string" && str.trim() !== ""
                                ? parseFunctions.splitByNumberAndUnit(str)
                                : str
                        );
                }

                return {
                    analysis: {
                        hasNumberPattern,
                        topSpecialChars,
                        topUnits,
                    },
                    parsingFunctions: parsingDictionary,
                };
            }

            getRowScreenHeight() {
                for (let col = 0; col < this.wells.length; col++) {
                    for (let row = 0; row < this.wells[col].length; row++) {
                        if (this.wells[col][row].__screen_height) {
                            return this.wells[col][row].__screen_height
                        }
                    }
                }
            }

            insertColWithCopy(tx, pt) {

                let newCol = [];
                for (let col = 0; col < this.wells[0].length; col++) {

                    if (tx > 0 && this.wells[tx - 1] && this.wells[tx - 1][col])
                        tx = 0;

                    let newWell;
                    if (tx > 0 && this.wells[tx - 1] && this.wells[tx - 1][col]) {

                        newWell = this.wells[tx - 1][col].deepCopy();
                        newWell.x = tx;
                        newWell.setAddress(`${String.fromCharCode(65 + tx)}${col + 1}`);
                        newWell.value = '';
                    } else if (tx === 0) {

                        newWell = this.wells[0][0].deepCopy();
                        newWell.x = tx;
                        newWell.setAddress(`${String.fromCharCode(65 + tx)}${col + 1}`);
                        newWell.value = '';
                    }
                    else {

                        newWell = createDefaultWell(tx, col);
                    }
                    newCol.push(newWell);
                }

                let w = this.getWellByIndex(tx, 0);
                this.wells.splice(w.xindex, 0, newCol);

                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                this.grid.rescale();
                if (tx === this.grid.xmax - 1) {
                    LJScript.add(this.name, 'add same column');
                } else {
                    LJScript.add(this.name, 'insert same column ' + tx);
                }
            }

            insertRowWithCopy(ty, pt) {
                if (ty > this.wells[0].length) {
                    ty = this.wells[0].length
                }
                if (ty < 0) {
                    ty = 0;
                }
                let rowHeight = this.getRowScreenHeight();
                for (let row = 0; row < this.wells.length; row++) {
                    let newWell;
                    if (ty > 0 && this.wells[row][ty - 1]) {

                        newWell = this.wells[row][ty - 1].deepCopy();
                        newWell.y = ty;
                        newWell.setAddress(`${String.fromCharCode(65 + row)}${ty + 1}`);
                        newWell.value = '';
                    } else
                        if (ty === 0) {

                            newWell = this.wells[row][0].deepCopy();
                            newWell.y = ty;
                            newWell.setAddress(`${String.fromCharCode(65 + row)}${ty + 1}`);
                            newWell.value = '';
                        }
                        else {

                            newWell = createDefaultWell(row, ty);
                        }
                    this.wells[row].splice(ty, 0, newWell);
                }
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                this.grid.yi -= pt.grid.worldHeight(rowHeight)
                this.grid.height += pt.grid.worldHeight(rowHeight)
                if (ty === this.grid.ymax - 1) {
                    LJScript.add(this.name, 'add same row');
                } else {
                    LJScript.add(this.name, 'insert same row ' + ty);
                }
            }
            insertRowWithCopyNoHightChange(ty, pt) {
                let rowHeight = this.getRowScreenHeight();
                for (let row = 0; row < this.wells.length; row++) {
                    let newWell;
                    if (ty > 0 && this.wells[row][ty - 1]) {

                        newWell = this.wells[row][ty - 1].deepCopy();
                        newWell.y = ty;

                        newWell.setAddress(`${String.fromCharCode(65 + row)}${ty + 1}`);
                        newWell.value = '';
                    } else {
                        ty = 1;
                        newWell = this.wells[row][ty - 1].deepCopy();
                        newWell.y = ty;
                        newWell.setAddress(`${String.fromCharCode(65 + row)}${ty + 1}`);
                        newWell.value = '';
                    }
                    this.wells[row].splice(ty, 0, newWell);
                }
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                if (ty === this.grid.ymax - 1) {
                    LJScript.add(this.name, 'add same row');
                } else {
                    LJScript.add(this.name, 'insert same row ' + ty);
                }
            }

            insertRow(ty) {
                for (let row = 0; row < this.wells.length; row++) {
                    const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);

                    this.wells[row].splice(ty, 0, createDefaultWell(row, ty));
                }
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                if (ty === this.grid.ymax - 1) {
                    LJScript.add(this.name, 'add row')
                } else
                    LJScript.add(this.name, 'insert row ' + ty)
            }

            removeLastRow() {
                pushHistory(HM(this))
                this.removeRowsDown(this.grid.ymax - 1)
            }

            removeRowsUp(fromRow) {
                pushHistory(HM(this))

                if (fromRow < 0 || fromRow >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }

                for (let col = this.grid.xmin; col < this.grid.xmax; col++) {
                    this.wells[col] = this.wells[col].slice(fromRow);
                }

                this.fitRowsAndColumns();
            }
            removeRowsDown(fromRow) {
                pushHistory(HM(this))

                if (fromRow < 0 || fromRow >= this.wells[0].length) {
                    console.error("Invalid row index.");
                    return;
                }

                for (let col = this.grid.xmin; col < this.grid.xmax; col++) {
                    this.wells[col] = this.wells[col].slice(0, fromRow);
                }

                this.fitRowsAndColumns();
            }

            appendRows(count) {
                for (let j = 0; j < count; j++) {
                    for (let col = this.grid.xmin; col < this.grid.xmax; col++) {
                        this.wells[col].push(new GenericWell(`${String.fromCharCode(65 + col)}${this.wells.length + 1}`));
                    }
                }
                this.fitRowsAndColumns();
            }

            inResize(mouseX, mouseY, pt) {
                const rectWidth = pt.grid.screenWidth(this.getWidth());
                const rectHeight = pt.grid.screenHeight(this.getHeight());
                const rectX = pt.grid.X(this.grid.xi);
                const rectY = pt.grid.Y(this.grid.yi);
                const cornerSize = 50;
                const cornerX = rectX + rectWidth - cornerSize / 2
                const cornerY = rectY - cornerSize / 2

                let val = (
                    mouseX >= cornerX &&
                    mouseX <= cornerX + cornerSize &&
                    mouseY >= cornerY &&
                    mouseY <= cornerY + cornerSize
                );

                return val;

            }
            onColumnEdge(mouseX, mouseY, pt) {
                let currentXOffset = 0;
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                    const cellX = pt.grid.X(this.grid.X(currentXOffset));
                    const edgeThreshold = 15;
                    if (Math.abs(mouseX - cellX) < edgeThreshold) {
                        return true;
                    }
                    currentXOffset += cellWidth + (1 - COL_OFFSET);
                }
                return false;
            }

            resizeColumn(mouseX, mouseY, pt) {
                const mmx = pt.grid.Xwc(mouseX);
                const mmy = pt.grid.Ywc(mouseY);

                let currentXOffset = this.grid.xmin;
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    let cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                    let cellWidth2 = this.column_widths?.[x + 1] ?? COL_OFFSET;
                    const cellX = pt.grid.X(this.grid.X(currentXOffset));
                    const cellXw = pt.grid.screenWidth(this.grid.screenWidth(cellWidth))
                    const edgeThreshold = 15;
                    if (Math.abs(mouseX - cellX) < edgeThreshold) {
                        cellWidth = this.column_widths?.[x - 1] ?? COL_OFFSET;
                        cellWidth2 = this.column_widths?.[x] ?? COL_OFFSET;
                        this.__highlight_column = x - 1;
                        this.__highlight_column_width = x;

                        let hd = {
                            startX: pt.grid.Xwc(this.grid.Xwc(cellX - this.grid.xi * 2)),
                            startY: null,
                            currentX: null,
                            currentY: null,
                            isDrawing: true,
                            id: 'resize-COLUMN',
                            priority: true,
                            draw: (grid, ctx) => {
                            },
                            mouseDownListener: async (x, y) => {
                                md = true;
                                hd.startX = pt.grid.Xwc(this.grid.Xwc(cellX - this.grid.xi * 2));
                                hd.currentX = x;
                                hd.currentY = y;
                            },
                            mouseMoveListener: (_x, y) => {
                                console.log(" moving " + x)
                                hd.currentX = pt.grid.Xwc(this.grid.Xwc(_x - this.grid.xi * 2));
                                if (!this.column_widths) {
                                    this.column_widths = []
                                }
                                this.column_widths[this.__highlight_column] = cellWidth + hd.currentX - hd.startX

                                this.column_widths[this.__highlight_column + 1] = cellWidth2 - (hd.currentX - hd.startX)

                            },

                            mouseUpListener: async (x, y) => {
                                hd.isDrawing = false;
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                                this.__highlight_column = false;
                                this.__highlight_column_width = false;

                                this.clk_drag(pt)
                                md = false;

                            },

                            close: () => {
                            },
                        };

                        pt.wb(hd)
                        hd.currentX = pt.grid.Xwc(this.grid.Xwc(mouseX - this.grid.xi * 2));
                        if (!this.column_widths) {
                            this.column_widths = []
                        }

                        return;

                    }
                    currentXOffset += cellWidth + (1 - COL_OFFSET);
                }

            }

            higlightColumn(mouseX, mouseY, pt) {
                const mmx = pt.grid.Xwc(mouseX);
                const mmy = pt.grid.Ywc(mouseY);
                if (this.inside(pt.grid, mmx, mmy)) {
                    let currentXOffset = 0;
                    for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                        const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                        const cellX = pt.grid.X(this.grid.X(currentXOffset));
                        const edgeThreshold = 25;
                        if (Math.abs(mouseX - cellX) < edgeThreshold) {
                            this.__highlight_column = x - 1;
                            this.__highlight_column_width = x;
                        }
                        currentXOffset += cellWidth + (1 - COL_OFFSET);
                    }
                }
            }

            onRightEdge(mouseX, mouseY, pt) {
                const rectWidth = pt.grid.screenWidth(this.getWidth());
                const rectX = pt.grid.X(this.grid.xi);
                const cornerSize = 55;
                const cornerX = rectX + rectWidth - cornerSize / 2
                const rectHeight = pt.grid.screenHeight(this.getHeight());
                const rectY = pt.grid.Y(this.grid.yi);
                const cornerY = rectY - rectHeight / 1.02
                let val = (
                    mouseX >= cornerX &&
                    mouseX <= cornerX + cornerSize
                );

                return val;
            }

            displayOperationsMenu(pt) {
                let m = [
                    {
                        label: 'Function',
                        click: (x, y) => {
                            pushHistory(HM(this))
                            let tx = this.grid.xmax + 1;
                            this.insertCol(tx)
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Paste',
                        click: async (__x, __y) => {
                            pushHistory(HM(this))
                            let se = this.getSelectedWellsInOrder()
                        },
                        move: () => {
                        },
                    },

                ]

                if (this.hasSelectedWells()) {

                }

                let cols = Math.ceil(m.length / 10);
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)

                let t = {
                    id: 'operations_menu',
                    draw: (pt, ctx) => {
                        let grid = pt.grid;
                        if (pt.menu) {

                            pt.menu.draw(ctx, grid)
                            this.textActive = false;
                            this.text = ''
                        }
                    },

                    mouseDownListener: async (x, y) => {
                        if (pt.menu) {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (mdc > 0 && pt.menu && !pt.menu.isIn(pt.grid, mmx, mmy)) {
                                pt.wb(null)
                            }
                            mdc++;

                            return;

                        }

                    },
                    mouseMoveListener: (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.grid.rescale();
                        this.grid.rescale();
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },

                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        }

                    }
                    ,
                    close: () => {
                        clearMenu();
                    },
                }

            }

            isSingleRowSelected = () => {
                let selectedRowCount = 0;

                const rowCount = this.wells[0]?.length || 0;

                for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                    const isRowSelected = this.wells.every(column => column[rowIndex]?.select === true);
                    if (isRowSelected) {
                        selectedRowCount++;
                    }
                    if (selectedRowCount > 1) {
                        return false;
                    }
                }

                return selectedRowCount === 1;
            }

            isSingleColumnSelected = () => {
                let selectedColumnCount = 0;
                for (let column of this.wells) {
                    const isColumnSelected = column.every(row => row.select === true);
                    if (isColumnSelected) {
                        selectedColumnCount++;
                    }
                    if (selectedColumnCount > 1) {
                        return false;
                    }
                }

                return selectedColumnCount === 1;
            };

            in_table_menu(well, button, mouseX, mouseY, pt) {
                pt.wb(null)
                let mdc = 0;
                let id = this.getWellIndicies(well)
                let col_edit_obj = {
                    id: 'in-table-menu' + uuid(),
                    init: async (x, y) => {

                        let msub = [
                            {
                                label: 'Select \u2192',
                                click: async (__x, __y) => {
                                    if (well) {

                                        let rowIndex = id.rowIdx;
                                        let colIndex = id.colIdx
                                        for (let selectColIndex = colIndex; selectColIndex < this.wells.length; selectColIndex++) {
                                            let rowWell = this.wells[selectColIndex][rowIndex];
                                            if (rowWell) {
                                                rowWell.select = true;
                                            }
                                        }
                                        LJScript.add(this.name, `select ${[colIndex, rowIndex]} right`)
                                        await this.showSelectOptionsMenu(pt)

                                    }
                                },
                                move: () => {
                                },
                            },

                            {
                                label: 'Select \u2193',
                                click: async (__x, __y) => {
                                    let wells = this.getSelectedWellsInTimeOrder();
                                    if (wells && wells.length > 0) {
                                        let id = this.getWellIndicies(wells[0])
                                        let colIndex = id.colIdx;
                                        let rowIndex = id.rowIdx;
                                        for (let selectRowIndex = rowIndex; selectRowIndex < this.wells[colIndex].length; selectRowIndex++) {
                                            let colWell = this.wells[colIndex][selectRowIndex];
                                            if (colWell) {
                                                colWell.select = true;
                                            }
                                        }

                                        LJScript.add(this.name, `select ${colIndex},${rowIndex} down`)
                                        await this.showSelectOptionsMenu(pt)
                                    }

                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Insert column \u2190',
                                click: (x, y) => {
                                    pushHistory(HM(this))
                                    let tx = Math.round(this.grid.Xwc(pt.menu.x - this.grid.xi * 2))
                                    if (tx < 0) {
                                        tx = 1;
                                    }
                                    this.insertColWithCopy(tx, pt)
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Insert column \u2192',
                                click: (x, y) => {

                                    pushHistory(HM(this))
                                    let tx = Math.round(this.grid.Xwc(pt.menu.x - this.grid.xi * 2)) + 1
                                    if (tx < 0) {
                                        tx = 1;
                                    }
                                    this.insertColWithCopy(tx, pt)
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            },

                            {
                                label: 'Insert row',
                                click: (x, y) => {
                                    pushHistory(HM(this))
                                    let ty = Math.floor(this.grid.Ywc(mouseY - this.grid.yi * 2))
                                    this.insertRowWithCopyNoHightChange(this.grid.ymax + ty, pt)
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Append rows or columns',
                                click: (x, y) => {
                                    pushHistory(HM(this))
                                    let dpanel;

                                    let dpanel_c = createIon((pa) => {
                                        dpanel = pa;
                                    });

                                    let dimensions_panel = {
                                        wid: 'card',
                                        data: {
                                            'style.padding-left': '5px',
                                            'style.padding-top': '1px',
                                            cards: [
                                                [

                                                    {
                                                        'width': '85%',
                                                        'body': ``,
                                                        'component':
                                                        {
                                                            wid: 'input-param-items',
                                                            refCallback: dpanel_c,
                                                            data: {
                                                                'input_labels': ['Rows', 'Columns'],
                                                                'default_values': { 'Rows': `${this.grid.ymax}`, 'Columns': `${this.grid.xmax}` },

                                                            }
                                                        },

                                                    },

                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                            let rows = parseInt(dpanel.get('Rows'))
                                                                            let columns = parseInt(dpanel.get('Columns'))
                                                                            let t = this.grid.ymax - rows;
                                                                            let c = this.grid.xmax - columns;
                                                                            if (t < 0) {
                                                                                this.appendRows(Math.abs(t))
                                                                            }
                                                                            hideAllModal();
                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                            hideAllModal();
                                                                        })
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    }

                                                ]
                                            ]
                                        }
                                    }

                                    showModal(dimensions_panel, 400, 500)
                                },
                                move: () => {
                                },
                            },

                            {
                                label: 'Clk+Drag select',
                                click: async (x, y) => {
                                    this.clk_drag(pt);
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Add top row',
                                click: (x, y) => {
                                    pushHistory(HM(this))

                                    let tx = Math.round(this.grid.Xwc(pt.menu.x - this.grid.xi * 2))

                                    if (tx < 0) {
                                        tx = 1;
                                    }
                                    this.insertRow(0)
                                    pt.wb(null)

                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Add column',
                                click: (x, y) => {
                                    pushHistory(HM(this))
                                    let tx = this.grid.xmax + 1;
                                    this.insertColWithCopy(tx, pt)

                                    pt.menu = null;
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Apply layout',
                                click: async (x, y) => {
                                    pushHistory(HM(this))

                                    await exec('baja/table/io/apply-layout-to-selected', this)
                                    pt.menu = null;

                                },
                                move: () => {
                                },

                            },
                            {
                                label: 'Save layout',
                                click: async (x, y) => {
                                    let gs = this.generatePlateLayoutJSON();
                                    await exec('baja/table/io/save-yakro-table-layout.js', gs)
                                },
                                move: () => {
                                },

                            },
                            {
                                label: 'Save table',
                                click: async (x, y) => {
                                    let gs = this.toJSON();
                                    await exec('baja/table/io/save-yakro-table-layout.js', gs, 'ljt')
                                },
                                move: () => {
                                },

                            },
                            {
                                label: 'Remove layout',
                                click: async (x, y) => {

                                    pushHistory(HM(this))
                                    let found = false;
                                    let rows = this.wells.length;

                                    let cols = this.wells[0].length;
                                    for (let row = 0; row < rows; row++) {
                                        for (let col = 0; col < cols; col++) {
                                            let w = this.wells[row][col]
                                            if (w.select) {
                                                w.clearGroups();
                                                found = true;
                                            }
                                        }
                                    }
                                    if (!found)
                                        pt.setMessage(" Select cells first.")
                                    pt.wb(null)

                                },
                                move: () => {
                                },

                            },

                            {
                                label: 'Deselect',
                                click: (x, y) => {
                                    pushHistory(HM(this))
                                    this.deselectWells();
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Delete column',
                                click: async (x, y) => {

                                    if (well) {
                                        pushHistory(HM(this))

                                        let id = this.getWellIndicies(well)
                                        let colIndex = id.colIdx;
                                        for (let selectRowIndex = 0; selectRowIndex < this.wells[colIndex].length; selectRowIndex++) {
                                            let colWell = this.wells[colIndex][selectRowIndex];
                                            if (colWell) {
                                                colWell.select = true;
                                            }
                                        }
                                    }
                                    for (let x = 0; x < this.wells.length; x++) {
                                        if (this.wells[x][0] && this.wells[x][0].select)
                                            this.removeCol(x)
                                    }
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            },
                            {
                                label: 'Copy > new column',
                                click: async (__x, __y) => {
                                    let newColumnIndex = this.wells.length;
                                    let selectedWells = this.getSelectedWellsInOrder()
                                    for (let y = 0; y < this.wells[0].length; y++) {
                                        if (!this.wells[newColumnIndex]) {
                                            this.wells[newColumnIndex] = [];
                                        }
                                        let cc = selectedWells[y] || null;
                                        if (cc)
                                            this.wells[newColumnIndex][y] = cc.deepCopy();
                                        else
                                            this.wells[newColumnIndex][y] = createDefaultWell()
                                    }
                                    this.fitRowsAndColumns();
                                    this.deselectAll();
                                    this.clk_drag(pt);

                                },
                                move: () => {
                                },
                            },

                            {
                                label: 'Copy > New table',
                                click: async (x, y) => {

                                    let selectedRows = {};
                                    for (let col = 0; col < this.wells.length; col++) {
                                        for (let row = 0; row < this.wells[col].length; row++) {
                                            if (this.wells[col][row].select === true) {
                                                selectedRows[row] = row;
                                            }
                                        }
                                    }

                                    let keys = Object.keys(selectedRows)
                                    let p = new Plate(this.name + '__CPY', this.wells.length, selectedRows.length);
                                    for (let col = 0; col < this.wells.length; col++) {
                                        let prow = 0;
                                        for (let k of keys) {
                                            let row = selectedRows[k]
                                            if (this.wells[col][row].select)
                                                p.wells[col][prow++] = this.wells[col][row].deepCopy();

                                        }

                                    }
                                    p.removeEmptyRowsAndColumns();
                                    p.deselectWells();

                                    p.fitRowsAndColumns();
                                    p.grid.width = this.getWidth();
                                    p.grid.height = 1;

                                    pt.setPlate(p, this.grid.xi, this.grid.yi - 3);
                                    pt.alignPlates();
                                    pt.zoomtfit();
                                    setTimeout(() => {

                                        pt.zoomintoplate(p);
                                    }, 1000)
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            }

                        ]

                        if (this.isSingleRowSelected()) {
                            msub.unshift({
                                label: 'Delete selected row',
                                click: async (x, y) => {
                                    pushHistory(HM(this))
                                    this.removeFullySelectedRows()
                                    pt.wb(null)
                                },
                                move: () => {
                                },
                            }
                            )
                        }

                        if (this.isSingleColumnSelected()) {
                            msub.unshift(
                                {
                                    label: 'Move...',
                                    click: async (x, y) => {
                                        pushHistory(HM(this))
                                        let hd = {

                                            startX: null,
                                            startY: null,
                                            currentX: null,
                                            currentY: null,
                                            isDrawing: true,

                                            draw: (grid, ctx) => {
                                                if (hd.startX !== null && hd.startY !== null) {
                                                    let w = grid.screenWidth(this.grid.screenWidth(1))
                                                    const rectWidth = w;
                                                    const rectHeight = grid.screenHeight(this.getHeight())
                                                    ctx.fillStyle = 'rgba(10,10,200,0.4)';
                                                    ctx.fillRect(hd.startX, hd.startY, rectWidth, rectHeight);
                                                }
                                            },

                                            mouseDownListener: async (x, y) => {
                                                hd.startX = x;
                                                hd.startY = y;
                                                hd.currentX = x;
                                                hd.currentY = y;
                                            },

                                            mouseMoveListener: (x, y) => {
                                                hd.startX = x;
                                                hd.startY = y;
                                                hd.currentX = x;
                                                hd.currentY = y;
                                            },

                                            mouseUpListener: async (x, y) => {
                                                if (hd.isDrawing) {
                                                    hd.isDrawing = false;
                                                    hd.startX = null;
                                                    hd.startY = null;
                                                    hd.currentX = null;
                                                    hd.currentY = null;
                                                }
                                            },

                                            close: () => {
                                                clearMenu();
                                            },
                                        };
                                        pt.wb(hd)

                                    },
                                    move: () => {
                                    },
                                }
                            );

                        }

                        if (this.hasSelectedWells()) {

                            msub.unshift(
                                {
                                    label: 'Clear values',
                                    click: async (x, y) => {
                                        pushHistory(HM(this))
                                        let se = this.getSelectedWellsInOrder()
                                        for (let i of se) {
                                            i.setValue(null);
                                        }
                                        clearMenu();

                                    },
                                    move: () => {
                                    },
                                }
                            );

                            msub.unshift(
                                {
                                    label: 'Insert data',
                                    click: (__x, __y) => {
                                        pushHistory(HM(this))
                                        let se = this.getSelectedWellsInOrder()
                                        pt.setSelected(this);
                                        exec('baja/table/io/lj-fun-to-table.js', pt, this, se)
                                    },
                                    move: () => {
                                    },
                                })

                            let areWells = false;
                            const text = await navigator.clipboard.readText();
                            try {

                                let js = JSON.parse(text)
                                for (let a of js) {
                                    if (a.position) {
                                        areWells = true;
                                        break;
                                    }
                                }

                                if (areWells) {

                                    msub.unshift(
                                        {
                                            label: 'Paste',
                                            click: async (__x, __y) => {
                                                pushHistory(HM(this))
                                                let se = this.getSelectedWellsInOrder()
                                                const text = await navigator.clipboard.readText();
                                                let js = JSON.parse(text)
                                                let se_len = js.length;
                                                for (let i = 0; i < se_len; i++) {
                                                    if (i < se.length) {
                                                        se[i].copyWell(js[i])
                                                    }

                                                }
                                                this.deselectAll();
                                                pt.wb(null)
                                            },
                                            move: () => {
                                            },
                                        })

                                    msub.unshift(
                                        {
                                            label: 'Paste as tag',
                                            click: async (x, y) => {
                                                try {
                                                    const text = await navigator.clipboard.readText();
                                                    let js = JSON.parse(text)
                                                    for (let a of js) {
                                                        let rows = this.wells.length;
                                                        let cols = this.wells[0].length;
                                                        for (let row = 0; row < rows; row++) {
                                                            for (let col = 0; col < cols; col++) {

                                                                let w = this.wells[row][col]
                                                                if (w.select && w.position.toLowerCase() === a.position.toLowerCase() && a.group != null) {
                                                                    w.appendGroups(a.getGroups())
                                                                }

                                                            }
                                                        }
                                                    }
                                                    pt.wb(null)

                                                } catch (err) {
                                                    console.error('Failed to read from clipboard: ', err); pt.wb(null)

                                                }
                                            },
                                            move: () => {
                                            },
                                        });
                                    msub.unshift(
                                        {
                                            label: 'Paste layout',
                                            click: async (__x, __y) => {
                                                pushHistory(HM(this))
                                                let se = this.getSelectedWellsInOrder()
                                                const text = await navigator.clipboard.readText();
                                                let js = JSON.parse(text)
                                                let se_len = js.length;
                                                for (let i = 0; i < se_len; i++) {
                                                    if (i < se.length) {
                                                        se[i].position = (js[i].value)
                                                        se[i].group = (Object.assign({}, js[i].group))
                                                        se[i].concentration = js[i].concentration
                                                    }
                                                }
                                                this.deselectAll();
                                                pt.wb(null)
                                            },
                                            move: () => {
                                            },
                                        })
                                    msub.unshift(
                                        {
                                            label: 'Paste as address',
                                            click: async (__x, __y) => {
                                                pushHistory(HM(this))
                                                let se = this.getSelectedWellsInOrder()
                                                const text = await navigator.clipboard.readText();
                                                let js = JSON.parse(text)
                                                let se_len = js.length;
                                                for (let i = 0; i < se_len; i++) {
                                                    if (i < se.length) {
                                                        se[i].position = (js[i].value)
                                                    }

                                                }
                                                this.deselectAll();
                                                pt.wb(null)
                                            },
                                            move: () => {
                                            }
                                        })
                                }
                            } catch (exception) {

                            }
                            msub.push({
                                label: 'Tag',
                                click: (__x, __y) => {
                                    this.goTag(null, pt);
                                },
                                move: () => {
                                },
                            })

                            msub.push({
                                label: 'Remove tag',
                                click: async (__x, __y) => {
                                    let se = this.getSelectedWellsInOrder()

                                    function getAllGroupKeys(wells) {
                                        const allKeys = new Set();

                                        wells.forEach(well => {
                                            if (well.group) {
                                                Object.keys(well.group).forEach(key => allKeys.add(key));
                                            }
                                        });

                                        return Array.from(allKeys);
                                    }

                                    let mm = [
                                    ]

                                    let gkeys = getAllGroupKeys(se);

                                    for (let o of gkeys) {
                                        mm.push({
                                            label: `${o}`,
                                            click: async (x, y) => {
                                                for (let s of se) {
                                                    if (!s.removeGroup(o)) {
                                                        s.removeGroup(o);
                                                    }
                                                }
                                                pt.wb(null)
                                            },
                                            move: () => {
                                            },
                                        },
                                        )
                                    }
                                    let menutest = {
                                        id: 'select-group-menu',
                                        init: (x, y) => {
                                            pt.menu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                                        },
                                        mouseDownListener: async (x, y) => {
                                            if (pt.menu) {
                                                return;
                                            }
                                        },
                                        mouseMoveListener: (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            pt.grid.rescale();
                                            this.grid.rescale();
                                            if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                                pt.menu.mouseMove(pt.grid, mmx, mmy)
                                            }

                                        },
                                        mouseUpListener: async (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                                await pt.menu.mouseUp(pt.grid, mmx, mmy)
                                            }
                                        }
                                        ,
                                        close: () => {
                                            clearMenu();
                                        },
                                        draw: (grid, ctx) => {
                                            if (pt.menu) {
                                                pt.menu.draw(ctx, grid)
                                                this.textActive = false;
                                                this.text = ''
                                            }
                                        },

                                    }
                                    menutest.draw.bind(this)

                                    setTimeout(() => {
                                        menutest['id'] = uuid()
                                        pt.wb(menutest)
                                    }, 500)

                                },
                                move: () => {
                                },
                            })

                            msub.push({
                                label: 'Set Default Tag',
                                click: async (__x, __y) => {
                                    let se = this.getSelectedWellsInOrder()
                                    let mm = [
                                    ]

                                    let WellColorPallette = await exec('baja/plate/well-color-palette.js')
                                    for (let o of Object.keys(WellColorPallette)) {
                                        mm.push({
                                            label: `${o}`,
                                            click: async (x, y) => {

                                                if (o === 'Other...') {
                                                    let va = await prompt("", ["Name"], { "Name": '' }, 300, 300)
                                                    o = va['Name']
                                                    if (o === null) {
                                                        return;
                                                    }
                                                }

                                                for (let s of se) {
                                                    if (!s.group)
                                                        s.setGroup(o);
                                                }
                                                pt.wb(null)
                                            },
                                            move: () => {
                                            },
                                        },
                                        )
                                    }

                                    let menutest = {
                                        id: 'select-group-menu',
                                        init: (x, y) => {
                                            pt.menu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm, 'rgb(0, 87, 163)', 'white', 2))

                                        },
                                        mouseDownListener: async (x, y) => {
                                            if (pt.menu) {
                                                return;
                                            }
                                        },
                                        mouseMoveListener: (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            pt.grid.rescale();
                                            this.grid.rescale();
                                            if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                                pt.menu.mouseMove(pt.grid, mmx, mmy)
                                            }

                                        },
                                        mouseUpListener: async (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                                await pt.menu.mouseUp(pt.grid, mmx, mmy)
                                            }
                                        }
                                        ,
                                        close: () => {
                                            clearMenu();
                                        },
                                        draw: (grid, ctx) => {
                                            if (pt.menu) {
                                                pt.menu.draw(ctx, grid)
                                                this.textActive = false;
                                                this.text = ''
                                            }
                                        },

                                    }
                                    menutest.draw.bind(this)

                                    setTimeout(() => {
                                        menutest['id'] = uuid()
                                        pt.wb(menutest)
                                    }, 500)

                                },
                                move: () => {
                                },
                            })

                            msub.unshift({
                                label: 'Copy',
                                click: async (__x, __y) => {
                                    let se = this.getSelectedWellsInOrder()
                                    pt.setMessage("Copied")

                                    this.textActive = false;
                                    this.deselectAll();
                                    navigator.clipboard.writeText(JSON.stringify(se)).then(() => {

                                        console.log("Object copied to clipboard!");
                                    }).catch(err => {
                                        console.error("Failed to copy object to clipboard: ", err);
                                    });

                                    this.deselectAll();

                                },
                                move: () => {
                                },
                            })

                        }
                        pt.menu = new Menu(msub, pt.grid.Xwc(mouseX), pt.grid.Ywc(mouseY), 'rgb(0, 87, 163)', 'white', 2)
                    },
                    draw: (grid, ctx) => {
                    },

                    mouseDownListener: async (x, y) => {
                        if (pt.menu) {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (mdc > 0 && pt.menu && !pt.menu.isIn(pt.grid, mmx, mmy)) {
                                clearMenu();
                                pt.wb(null)
                            }
                            mdc++;

                            return;

                        }

                    },
                    mouseMoveListener: (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.grid.rescale();
                        this.grid.rescale();
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },

                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        }

                    }
                    ,
                    close: () => {
                        clearMenu();
                    },
                }
                pt.wb(col_edit_obj)
            }
            async handleMouseDown(mouseX, mouseY, pt) {
                if (pt.menu) {
                    return;
                }
            }

            async handleMouseUp(mouseX, mouseY, pt) {
                this.__resizing = false;
                this.__moving = false;

            }

            editCells(pt, mouseX, mouseY) {
                let xw = pt.grid.Xwc(mouseX);
                let yw = pt.grid.Ywc(mouseY);
                if (pt.menu) {
                    console.log(" cannot edit the cell when a menu is viisible ")
                    return;
                }
                pt.selected_well = this.getWell(xw, yw, pt)
                let ws = this.getSelectedWellsInOrder();
                if (ws != null && ws.length === 1) {
                    pt.selected_well = ws[0]
                    pt.selected_well.textSelected = true;
                }
                else if (ws != null && ws.length > 1) {
                    pt.selected_well = ws[0]
                    pt.selected_well.textSelected = true;

                }
                if (pt.selected_well) {
                    pt.selected_well.__highlight__ = true;
                    this.textBoxX = pt.grid.X(this.grid.X(pt.selected_well.x));
                    this.textBoxY = pt.grid.Y(this.grid.Y(pt.selected_well.y));
                    textStyle = 'data'
                    this.textActive = true;
                    if (pt.selected_well.value === undefined) {
                        pt.selected_well.setValueByType('');
                    }

                    cursorPos = (pt.selected_well.value + '').length;

                    if (pt.selected_well.skin_type === 'CONCENTRATION') {

                        if (pt.selected_well.concentration)
                            this.text = pt.selected_well.getConcentration() + ''
                        else
                            this.text = pt.selected_well.getValue()

                        if (this.text == undefined) {
                            this.text = '';
                        }
                        cursorPos = this.text.length;
                    }
                    else if (pt.selected_well.skin_type === 'Function') {
                        if (pt.selected_well.formula)
                            this.text = pt.selected_well.formula + ''
                        else {
                            this.text = ''
                        }
                        cursorPos = this.text.length;
                    }
                    else {
                        if (pt.selected_well.value === null) {
                            this.text = '';
                        } else
                            this.text = pt.selected_well.getValue() + ''

                        if (this.text == undefined) {
                            this.text = '';
                        }

                        cursorPos = this.text.length;

                    }

                }
            }

            displayNumbers(boolo) {
                this.attr__displayNumberValues = boolo
            }

            highlight() {
                this.selected = true
            }

            async handleMouseUp___(mouseX, mouseY, pt) {

            }
            async handleMouseOver(mouseX, mouseY, pt) {

            }

            async devnull(bx, by, x, y, pt) {

            }

            moveCol = (colIndex, columnLocation) => {
                if (
                    colIndex >= 0 && colIndex < this.wells.length &&
                    columnLocation >= 0 && columnLocation < this.wells.length
                ) {

                    const [column] = this.wells.splice(colIndex, 1);

                    this.wells.splice(columnLocation, 0, column);

                    this.grid.xmax = this.wells.length;
                    this.grid.rescale();
                } else {
                    console.error("Invalid colIndex or columnLocation");
                }
            }

            removeCol = (colIndex) => {
                if (colIndex >= 0 && colIndex < this.wells.length) {
                    this.wells.splice(colIndex, 1);
                }
                this.grid.xmax = this.wells.length;
                this.grid.rescale();
            }
            removeRow = (_rowIndex) => {
                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    if (_rowIndex >= 0 && _rowIndex < this.wells[colIndex].length) {
                        this.wells[colIndex].splice(_rowIndex, 1);
                    }
                }
            }
            getSelectedWells(selectedPlate) {
                if (!selectedPlate) {
                    selectedPlate = this;
                }
                let selectedWells = [];
                for (let row = 0; row < selectedPlate.wells.length; row++) {
                    for (let col = 0; col < selectedPlate.wells[row].length; col++) {
                        let well = selectedPlate.wells[row][col];
                        if (well.select) {
                            selectedWells.push({ row: row, column: col, well: well });
                        }
                    }
                }
                return selectedWells;
            }

            getSelectedWellRange() {
                let minRow = Infinity;
                let maxRow = 0;
                let minColumn = Infinity;
                let maxColumn = 0;

                for (let colIdx = 0; colIdx < this.wells.length; colIdx++) {
                    const column = this.wells[colIdx];
                    for (let rowIdx = 0; rowIdx < column.length; rowIdx++) {
                        const well = column[rowIdx];

                        if (well.select) {

                            if (rowIdx + 1 > maxRow) {
                                maxRow = rowIdx + 1;
                            }
                            if (rowIdx + 1 < minRow) {
                                minRow = rowIdx + 1;
                            }
                            if (colIdx + 1 > maxColumn) {
                                maxColumn = colIdx + 1;
                            }
                            if (colIdx + 1 < minColumn) {
                                minColumn = colIdx + 1;
                            }
                        }
                    }
                }

                if (minRow === Infinity || minColumn === Infinity) {
                    return null;
                }

                return `[${minColumn - 1}:${maxColumn - 1}][${minRow - 1}:${maxRow - 1}]`;
            }

            getSelectedWellDimensions() {
                let maxRow = 0;
                let maxColumn = 0;

                for (let colIdx = 0; colIdx < this.wells.length; colIdx++) {
                    const column = this.wells[colIdx];
                    for (let rowIdx = 0; rowIdx < column.length; rowIdx++) {
                        const well = column[rowIdx];

                        if (well.select) {

                            if (rowIdx + 1 > maxRow) {
                                maxRow = rowIdx + 1;
                            }
                            if (colIdx + 1 > maxColumn) {
                                maxColumn = colIdx + 1;
                            }
                        }
                    }
                }

                return { maxColumn, maxRow };
            }
            getRowIndex(wellObject) {
                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    for (let rowIndex = 0; rowIndex < this.wells[colIndex].length; rowIndex++) {
                        const well = this.wells[colIndex][rowIndex];
                        if (well === wellObject) {
                            return rowIndex;
                        }
                    }
                }
                console.error("Well object not found in the plate.");
                return -1;
            }
            getTopRowAndFirstColumnValues() {
                const topRow = [];
                const firstColumn = [];

                for (let col = 0; col < this.wells.length; col++) {
                    const well = this.wells[col][0];
                    topRow.push(well ? well.value : null);
                }

                const rowCount = this.wells[0]?.length || 0;
                for (let row = 0; row < rowCount; row++) {
                    const well = this.wells[0][row];
                    firstColumn.push(well ? well.value : null);
                }

                return [topRow, firstColumn];
            }

            getColIndex(wellObject) {
                for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                    for (let rowIndex = 0; rowIndex < this.wells[colIndex].length; rowIndex++) {
                        const well = this.wells[colIndex][rowIndex];
                        if (well === wellObject) {
                            return colIndex;
                        }
                    }
                }
                console.error("Well object not found in the plate.");
                return -1;
            }

            getIndexOf(_well) {
                for (let rowIdx = 0; rowIdx < this.wells.length; rowIdx++) {
                    const column = this.wells[rowIdx];
                    for (let colIdx = 0; colIdx < column.length; colIdx++) {
                        const well = column[colIdx];

                        if (well.uid === _well.uid) {
                            return { colIdx, rowIdx }
                        }
                    }
                }
            }

            removeEmptyRowsAndColumns() {
                let columnsToRemove = new Set();
                let rowsToRemove = new Set();
                for (let col = 0; col < this.wells.length; col++) {
                    let colIsEmpty = true;
                    for (let row = 0; row < this.wells[col].length; row++) {
                        if (this.wells[col][row] !== null && this.wells[col][row] !== undefined &&
                            this.wells[col][row].value !== null && this.wells[col][row].value !== undefined && (this.wells[col][row].value + '').trim() !== ''
                        ) {
                            colIsEmpty = false;
                        }
                    }

                    if (colIsEmpty) {
                        columnsToRemove.add(col);
                    }
                }

                let rowCount = this.wells[0].length;
                for (let row = 0; row < rowCount; row++) {
                    let rowIsEmpty = true;

                    for (let col = 0; col < this.wells.length; col++) {

                        console.log('; well ' + this.wells[col][row].value)

                        if (this.wells[col][row] !== null && this.wells[col][row] !== undefined &&
                            this.wells[col][row].value !== null && this.wells[col][row].value !== undefined && (this.wells[col][row].value + '').trim() !== ''
                        ) {
                            rowIsEmpty = false;
                        }
                    }

                    if (rowIsEmpty) {
                        rowsToRemove.add(row);

                    }
                }

                this.wells = this.wells.filter((_, col) => !columnsToRemove.has(col));
                for (let col = 0; col < this.wells.length; col++) {
                    this.wells[col] = this.wells[col].filter((_, row) => !rowsToRemove.has(row));
                }
                this.grid.rescale();
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
            }

            addColumn() {
                pushHistory(HM(this))
                this.insertCol(this.wells.length)
            }
            async addColumnFunction(_function, pt) {
                function isArrayofArrays(variable) {
                    return Array.isArray(variable) && variable.every(Array.isArray);
                }

                let colIndex = this.wells.length;
                if (!this.wells[0] || !this.wells[0][0]) {
                    colIndex = 0;
                }

                this.columnFunction[colIndex] = _function;

                if (!this.wells[colIndex]) {
                    this.wells[colIndex] = []

                }
                let v = await exec('baja/plate/ops/frun-fun.js', _function.expression, pt);
                if (isArrayofArrays(v)) {
                    for (let r of v) {

                        if (!this.wells[colIndex]) {
                            this.wells[colIndex] = []
                        }
                        for (let y = 0; y < r.length; y++) {
                            if (r[y] != null) {
                                let value = r[y];
                                if (!isNaN(value) && isFinite(value)) {
                                    this.wells[colIndex][y] = new GenericWell(`(${y},${colIndex})`, parseFloat(value));
                                } else {
                                    this.wells[colIndex][y] = new GenericWell(`(${y},${colIndex})`, String(value));
                                }
                            } else {
                                this.wells[colIndex][y] = new GenericWell(`(${y},${colIndex})`, '');
                            }
                        }
                        colIndex++;

                    }
                } else {

                    for (let y = 0; y < v.length; y++) {
                        if (v[y] != null) {
                            let value = v[y]
                            if (!isNaN(value) && isFinite(value)) {
                                this.wells[colIndex][y] = new GenericWell('(' + y + ',' + colIndex + ')', parseFloat(value));
                            } else {
                                this.wells[colIndex][y] = new GenericWell(`(${y},${colIndex})`, String(value));
                            }
                        } else {
                            this.wells[colIndex][y] = new GenericWell('(' + y + ',' + colIndex + ')', '');
                        }
                    }

                }

                this.fitRowsAndColumns();
                let wh = pt.grid.worldHeight(60 * v.length)
                let ww = pt.grid.worldHeight(this.wells.length * 100)

                this.grid.rescale();
                pt.grid.rescale();
                pt.zoomintoplate(this)

            }
            async applyFunctionToSelected(_function, pt) {
                function isArrayofArrays(variable) {
                    return Array.isArray(variable) && variable.every(Array.isArray);
                }
                let selected_wells = this.getSelectedWellsInOrder();
                let index = 0;
                let v = await exec('baja/plate/ops/frun-fun.js', _function.expression, pt);
                if (isDictionary(v)) {
                    let keys = Object.keys(v);
                    for (let k of keys) {
                        let va = v[k];
                        if (va && va[0] && Array.isArray(va[0]) && va.length > 0) {
                            v = va[0]
                        }
                    }
                }

                if (isArrayofArrays(v)) {
                    for (let r of v) {
                        for (let y = 0; y < r.length; y++) {
                            if (r[y] != null) {
                                let value = r[y];
                                if (index >= selected_wells.length) {
                                    return;
                                }
                                let se = selected_wells[index++]
                                if (!isNaN(value) && isFinite(value)) {
                                    se.setValue(parseFloat(value));
                                } else {
                                    se.setValue(value);
                                }
                            }
                        }
                    }
                } else {

                    for (let y = 0; y < v.length; y++) {
                        if (index >= selected_wells.length) {
                            console.log(" index greater than selected wells ")
                            return;
                        }
                        let se = selected_wells[index++]

                        if (v[y] != null) {
                            let value = v[y];
                            if (!isNaN(value) && isFinite(value)) {
                                se.setValue(parseFloat(value));
                            } else {
                                se.setValue(value);
                            }
                        }
                    }

                }
            }

            createEditColMenu(pt) {
                if (pt.wb) {
                    pt.wb(null)
                }
                let msub = [
                    {
                        label: 'Copy',
                        click: async (__x, __y) => {
                            let se = this.getSelectedWellsInOrder()
                            pt.setMessage(" Copied !")
                            navigator.clipboard.writeText(JSON.stringify(se)).then(() => {
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });

                            this.textActive = false;
                            this.deselectAll();

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Copy > new column',
                        click: async (__x, __y) => {
                            let newColumnIndex = this.wells.length;
                            let selectedWells = this.getSelectedWellsInOrder()
                            for (let y = 0; y < this.wells[0].length; y++) {
                                if (!this.wells[newColumnIndex]) {
                                    this.wells[newColumnIndex] = [];
                                }
                                let cc = selectedWells[y] || null;
                                if (cc)
                                    this.wells[newColumnIndex][y] = cc.deepCopy();
                                else
                                    this.wells[newColumnIndex][y] = createDefaultWell()
                            }
                            this.fitRowsAndColumns();
                            this.deselectAll();
                            this.clk_drag(pt);

                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Copy > new table',
                        click: async (x, y) => {

                            let selectedRows = {};
                            for (let col = 0; col < this.wells.length; col++) {
                                for (let row = 0; row < this.wells[col].length; row++) {
                                    if (this.wells[col][row].select === true) {
                                        selectedRows[row] = row;
                                    }
                                }
                            }

                            let keys = Object.keys(selectedRows)
                            let p = new Plate(this.name + '_copy', this.wells.length, selectedRows.length);
                            for (let col = 0; col < this.wells.length; col++) {
                                let prow = 0;
                                for (let k of keys) {
                                    let row = selectedRows[k]
                                    if (this.wells[col][row].select)
                                        p.wells[col][prow++] = this.wells[col][row].deepCopy();

                                }

                            }

                            p.deselectWells();
                            p.removeEmptyRowsAndColumns();

                            p.fitRowsAndColumns();
                            p.grid.width = this.getWidth();
                            p.grid.height = 1;

                            pt.setPlate(p, this.grid.xi, this.grid.yi - 3);
                            pt.alignPlates();
                            pt.zoomtfit();
                            setTimeout(() => {

                                pt.zoomintoplate(p);
                            }, 1000)
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Deselect',
                        click: async (__x, __y) => {
                            this.deselectWells();
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Tag',
                        click: async (__x, __y) => {

                            this.goTag(null, pt);

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Remove tag',
                        click: async (__x, __y) => {
                            let se = this.getSelectedWellsInOrder()

                            function getAllGroupKeys(wells) {
                                const allKeys = new Set();

                                wells.forEach(well => {
                                    if (well.group) {
                                        Object.keys(well.group).forEach(key => allKeys.add(key));
                                    }
                                });

                                return Array.from(allKeys);
                            }

                            let mm = [
                            ]

                            let gkeys = getAllGroupKeys(se);

                            for (let o of gkeys) {
                                mm.push({
                                    label: `${o}`,
                                    click: async (x, y) => {
                                        for (let s of se) {
                                            if (!s.removeGroup(o)) {
                                                s.removeGroup(o);
                                            }
                                        }
                                        pt.wb(null)
                                    },
                                    move: () => {
                                    },
                                },
                                )
                            }

                            let menutest = {
                                id: 'select-group-menu',
                                init: (x, y) => {
                                    pt.menu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(0, 87, 163)', 'white', 2)

                                },
                                mouseDownListener: async (x, y) => {
                                    if (pt.menu) {
                                        return;
                                    }
                                },
                                mouseMoveListener: (x, y) => {
                                    let mmx = pt.grid.Xwc(x);
                                    let mmy = pt.grid.Ywc(y);
                                    pt.grid.rescale();
                                    this.grid.rescale();
                                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                                    } else {
                                        close();
                                    }

                                },
                                mouseUpListener: async (x, y) => {
                                    let mmx = pt.grid.Xwc(x);
                                    let mmy = pt.grid.Ywc(y);
                                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                        await pt.menu.mouseUp(pt.grid, mmx, mmy)
                                    }
                                }
                                ,
                                close: () => {
                                    clearMenu();
                                },
                                draw: (grid, ctx) => {
                                    if (pt.menu) {
                                        pt.menu.draw(ctx, grid)
                                        this.textActive = false;
                                        this.text = ''
                                    }
                                },

                            }
                            menutest.draw.bind(this)

                            setTimeout(() => {
                                menutest['id'] = uuid()
                                pt.wb(menutest)
                            }, 500)

                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Set Default Group',
                        click: async (__x, __y) => {
                            let se = this.getSelectedWellsInOrder()
                            let mm = [
                            ]

                            let WellColorPallette = await exec('baja/plate/well-color-palette.js')
                            for (let o of Object.keys(WellColorPallette)) {
                                mm.push({
                                    label: `${o}`,
                                    click: async (x, y) => {

                                        if (o === 'Other...') {
                                            let va = await prompt("", ["Name"], { "Name": '' }, 300, 300)
                                            o = va['Name']
                                            if (o === null) {
                                                return;
                                            }
                                        }

                                        for (let s of se) {
                                            if (!s.group) {
                                                s.setGroup(o);
                                            }
                                        }
                                        pt.wb(null)
                                    },
                                    move: () => {
                                    },
                                },
                                )
                            }

                            let menutest = {
                                id: 'select-group-menu',
                                init: (x, y) => {
                                    pt.menu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(0, 87, 163)', 'white', 2)

                                },
                                mouseDownListener: async (x, y) => {
                                    if (pt.menu) {
                                        return;
                                    }
                                },
                                mouseMoveListener: (x, y) => {
                                    let mmx = pt.grid.Xwc(x);
                                    let mmy = pt.grid.Ywc(y);
                                    pt.grid.rescale();
                                    this.grid.rescale();
                                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                                    }

                                },
                                mouseUpListener: async (x, y) => {
                                    let mmx = pt.grid.Xwc(x);
                                    let mmy = pt.grid.Ywc(y);
                                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                                        await pt.menu.mouseUp(pt.grid, mmx, mmy)
                                    }
                                }
                                ,
                                close: () => {
                                    clearMenu();
                                },
                                draw: (grid, ctx) => {
                                    if (pt.menu) {
                                        pt.menu.draw(ctx, grid)
                                        this.textActive = false;
                                        this.text = ''
                                    }
                                },

                            }
                            menutest.draw.bind(this)

                            setTimeout(() => {
                                menutest['id'] = uuid()
                                pt.wb(menutest)
                            }, 500)

                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Apply layout',
                        click: async (x, y) => {

                            await exec('baja/table/io/apply-layout-to-selected', this)
                        },
                        move: () => {
                        },

                    },
                    {
                        label: 'Save layout',
                        click: async (x, y) => {
                            let gs = this.generatePlateLayoutJSON();
                            await exec('baja/table/io/save-yakro-table-layout.js', gs)

                        },
                        move: () => {
                        },

                    },
                    {
                        label: 'Save table',
                        click: async (x, y) => {
                            let gs = this.toJSON();
                            await exec('baja/table/io/save-yakro-table-layout.js', gs, 'ljt')
                        },
                        move: () => {
                        },

                    },

                    {
                        label: 'Delete column',
                        click: async (x, y) => {
                            pushHistory(HM(this))

                            for (let x = 0; x < this.wells.length; x++) {
                                if (this.wells[x][0] && this.wells[x][0].select)
                                    this.removeCol(x)
                            }
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Delete selected row(s)',
                        click: async (x, y) => {
                            pushHistory(HM(this))
                            this.removeFullySelectedRows()
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Clk+Drag select',
                        click: async (x, y) => {
                            this.clk_drag(pt);
                        },
                        move: () => {
                        },
                    }, {
                        label: 'Background... ',
                        click: async (x, y) => {

                            let sequence_input = {
                                wid: 'card',
                                "height": "500px",
                                data: {
                                    "style.padding-top": '1px',
                                    "style.border": '1px',
                                    "style.height": "500px",
                                    cards: [
                                        [
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                let color = _color;
                                                                                let se = this.getSelectedWellsInOrder()
                                                                                for (let w of se) {
                                                                                    let color = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                                    w.bgcolor = color;
                                                                                }
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                    hideAllModal();

                                                                })

                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }

                            showModal(sequence_input);
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Foreground... ',
                        click: async (x, y) => {

                            let sequence_input = {
                                wid: 'card',
                                "height": "500px",
                                data: {
                                    "style.padding-top": '1px',
                                    "style.border": '1px',
                                    "style.height": "500px",
                                    cards: [
                                        [
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                let color = _color;
                                                                                let se = this.getSelectedWellsInOrder()
                                                                                for (let w of se) {
                                                                                    let color = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                                    w.fgcolor = color;
                                                                                }
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                })

                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }

                            showModal(sequence_input);
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Edit__',
                        click: async (x, y) => {

                            let se = this.getSelectedWellsInOrder()

                            this.editWell(se[0], pt);
                            return;

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Clear values',
                        click: async (x, y) => {
                            pushHistory(HM(this))

                            let se = this.getSelectedWellsInOrder()
                            for (let i of se) {
                                i.setValue(null);
                            }
                            clearMenu();

                        },
                        move: () => {
                        },
                    }

                ]

                let col_edit_obj = {
                    id: 'add-col-row' + uuid(),
                    init: async (x, y) => {
                        let areWells = false;
                        const text = await navigator.clipboard.readText();
                        try {

                            let js = JSON.parse(text)
                            for (let a of js) {
                                if (a.position) {
                                    areWells = true;
                                    break;
                                }
                            }

                            if (areWells) {
                                msub.unshift(
                                    {
                                        label: 'Paste',
                                        click: async (__x, __y) => {
                                            pushHistory(HM(this))
                                            let se = this.getSelectedWellsInOrder()
                                            const text = await navigator.clipboard.readText();
                                            let js = JSON.parse(text)
                                            let se_len = js.length;
                                            for (let i = 0; i < se_len; i++) {
                                                if (i < se.length) {
                                                    se[i].copyWell(js[i])
                                                }

                                            }
                                            this.deselectAll();
                                            pt.wb(null)
                                        },
                                        move: () => {
                                        },
                                    })

                                msub.unshift(
                                    {
                                        label: 'Paste as group',
                                        click: async (x, y) => {
                                            try {
                                                const text = await navigator.clipboard.readText();
                                                let js = JSON.parse(text)
                                                for (let a of js) {
                                                    let rows = this.wells.length;
                                                    let cols = this.wells[0].length;
                                                    for (let row = 0; row < rows; row++) {
                                                        for (let col = 0; col < cols; col++) {

                                                            let w = this.wells[row][col]
                                                            if (w.select && w.position.toLowerCase() === a.position.toLowerCase() && a.group != null) {
                                                                s.appendGroups(a.group)
                                                            }

                                                        }
                                                    }
                                                }
                                                pt.wb(null)

                                            } catch (err) {
                                                console.error('Failed to read from clipboard: ', err); pt.wb(null)

                                            }
                                        },
                                        move: () => {
                                        },
                                    });
                                msub.unshift(
                                    {
                                        label: 'Paste layout',
                                        click: async (__x, __y) => {
                                            pushHistory(HM(this))
                                            let se = this.getSelectedWellsInOrder()
                                            const text = await navigator.clipboard.readText();
                                            let js = JSON.parse(text)
                                            let se_len = js.length;
                                            for (let i = 0; i < se_len; i++) {
                                                if (i < se.length) {
                                                    se[i].position = (js[i].value)
                                                    se[i].group = (Object.assign({}, js[i].group))
                                                    se[i].concentration = js[i].concentration
                                                }
                                            }
                                            this.deselectAll();
                                            pt.wb(null)
                                        },
                                        move: () => {
                                        },
                                    })
                                msub.unshift(
                                    {
                                        label: 'Paste as address',
                                        click: async (__x, __y) => {
                                            pushHistory(HM(this))
                                            let se = this.getSelectedWellsInOrder()
                                            const text = await navigator.clipboard.readText();
                                            let js = JSON.parse(text)
                                            let se_len = js.length;
                                            for (let i = 0; i < se_len; i++) {
                                                if (i < se.length) {
                                                    se[i].position = (js[i].value)
                                                }

                                            }
                                            this.deselectAll();
                                            pt.wb(null)
                                        },
                                        move: () => {
                                        },
                                    })

                            }
                        } catch (exception) {
                        }

                        pt.menu = new Menu(msub, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * msub.length / 2), 'rgb(40, 87, 163)', 'white', 2)

                    },
                    draw: (grid, ctx) => {
                        if (pt.menu) {

                            pt.menu.draw(ctx, grid)
                            this.textActive = false;
                            this.text = ''
                        }
                    },

                    mouseDownListener: async (x, y) => {
                        if (pt.menu) {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);

                            if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            } else {
                                clearMenu();
                            }
                            return;
                        }
                    },
                    mouseMoveListener: (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.grid.rescale();
                        this.grid.rescale();
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },

                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        }
                    }
                    ,
                    close: () => {
                        clearMenu();
                    },
                }

                pt.wb(col_edit_obj)
            }

            editWell(well, pt) {
                if (!well || !well.__screen_x) {
                    return;
                }
                clearMenu();

                current_well = well;
                textStyle = 'data'
                this.textActive = true;
                if (well.__screen_x) {
                    this.textBoxX = well.__screen_x;
                    this.textBoxY = well.__screen_y;
                }
                this.pwx = well.x;
                this.pwy = well.y;
                well.__highlight__ = true;
                this.text = getWellText(well)
                cursorPos = 0;
                pt.selected_well = well;
                selectText = true;

            }

            resetTextWindow() {

            }

            findContiguousSelectedWells(wells) {
                const selectedBlocks = [];
                const visited = new Set();

                function exploreBlock(col, row) {
                    const stack = [[col, row]];
                    let colMin = col;
                    let colMax = col;
                    let rowMin = row;
                    let rowMax = row;

                    while (stack.length > 0) {
                        const [c, r] = stack.pop();
                        const key = `${c},${r}`;

                        if (
                            c < 0 || c >= wells.length ||
                            r < 0 || r >= wells[c].length ||
                            visited.has(key) ||
                            !wells[c][r].select
                        ) {
                            continue;
                        }

                        visited.add(key);

                        if (c < colMin) colMin = c;
                        if (c > colMax) colMax = c;
                        if (r < rowMin) rowMin = r;
                        if (r > rowMax) rowMax = r;

                        stack.push([c + 1, r]);
                        stack.push([c - 1, r]);
                        stack.push([c, r + 1]);
                        stack.push([c, r - 1]);
                    }

                    return `[${colMin}:${colMax}][${rowMin}:${rowMax}]`;
                }

                for (let col = 0; col < wells.length; col++) {
                    for (let row = 0; row < wells[col].length; row++) {
                        const key = `${col},${row}`;
                        if (wells[col][row].select && !visited.has(key)) {
                            const blockRange = exploreBlock(col, row);
                            selectedBlocks.push(blockRange);
                        }
                    }
                }

                return selectedBlocks;
            }

            renameTableInFormula(oldName, newName) {
                const regex = new RegExp(`\\b${oldName}\\s*\\[`, 'g');

                for (let rowIndex = 0; rowIndex < this.wells.length; rowIndex++) {
                    for (let colIndex = 0; colIndex < this.wells[rowIndex].length; colIndex++) {
                        let well = this.wells[rowIndex][colIndex];
                        if (typeof well.formula === 'string') {
                            well.formula = well.formula.replace(regex, `${newName}[`);
                        }
                    }
                }

                for (let key in this.formula) {
                    if (
                        this.formula.hasOwnProperty(key) &&
                        typeof this.formula[key] === 'string'
                    ) {
                        this.formula[key] = this.formula[key].replace(regex, `${newName}[`);
                    }
                }
            }

            createEditSelectedMenu(pt, smenu, mx, my) {
                let removeCol = (colIndex) => {
                    if (colIndex >= 0 && colIndex < this.wells.length) {
                        this.wells.splice(colIndex, 1);
                    }
                    this.grid.xmax = this.wells.length;
                    this.grid.rescale();
                }
                let removeRow = (_colindex) => {

                    for (let colIndex = 0; colIndex < this.wells.length; colIndex++) {
                        if (_colindex >= 0 && _colindex < this.wells[colIndex].length) {
                            this.wells[colIndex].splice(_colindex, 1);
                        }
                    }
                }

                let msub = [

                    {
                        label: 'Paste into column',
                        click: async (x, y) => {
                            let tx = Math.floor(this.grid.Xwc(pt.menu.x - this.grid.xi * 2))
                            await exec('baja/table/io/paste-into-column.js', pt, this, tx, null)
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Paste GROUP layout',
                        click: async (x, y) => {
                            try {
                                const text = await navigator.clipboard.readText();
                                let js = JSON.parse(text)
                                for (let a of js) {
                                    let rows = this.wells.length;
                                    let cols = this.wells[0].length;
                                    for (let row = 0; row < rows; row++) {
                                        for (let col = 0; col < cols; col++) {

                                            let w = this.wells[row][col]
                                            if (w.select && w.position === a.position && a.group != null) {
                                                w.appendGroups(a.group)
                                            }

                                        }
                                    }
                                }
                                pt.wb(null)
                                this.deselectWells()

                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)

                            }
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Delete column',
                        click: async (x, y) => {
                            pushHistory(HM(this))

                            for (let x = 0; x < this.wells.length; x++) {
                                if (this.wells[x][0] && this.wells[x][0].select)
                                    this.removeCol(x)
                            }
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Index column (well)',
                        click: async (x, y) => {

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
                            let va = await prompt("Plate Dimensions (e.g. 384 or 96 well)", ["Plate"], { "Plate": '384' }, 300, 300)
                            let m = va['Plate']
                            if (m === null) {
                                infoPrompt(" Please provide a plate dimension value ")
                                return;
                            }
                            let addr = generateWellAddresses(16, 24)
                            if (m == 384) {
                            } else if (m == 96) {
                                addr = generateWellAddresses(8, 12)
                            }
                            let tx = Math.floor(this.grid.Xwc(pt.menu.x - this.grid.xi * 2))
                            this.setValuesInOrderAndOverwriteForSelected(addr, tx, null)

                            pt.wb(null)

                        },
                        move: () => {
                        },
                    },

                ]
                let sm = new Menu(msub, (mx), (my), 'rgb(0, 87, 163)', 'black')

                let col_edit_obj = {
                    id: 'add-col-row',
                    smenu: sm,
                    mouseDownListener: async (x, y) => {
                        pt.menu = new Menu(msub, (mx), (my), 'white', 'black')
                        if (pt.menu) {
                            return;
                        }
                    },
                    mouseMoveListener: (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.grid.rescale();
                        this.grid.rescale();
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },
                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                            await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        }
                    }
                    ,
                    close: () => {
                        clearMenu();
                    },
                    draw: (grid, ctx) => {
                        if (pt.menu) {

                            pt.menu.draw(ctx, grid)
                            this.textActive = false;
                            this.text = ''
                        }
                    },

                }

                col_edit_obj.draw.bind(this)

                pt.wb(col_edit_obj)
            }

            addRow() {
                this.insertRow(this.wells[0].length)
            }
            addSameRow(pt) {
                this.insertRowWithCopy(this.wells[0].length, pt)
            }

            displayMenu(m, pt) {
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                    pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)

            }

            async createCopyMenu(pt) {
                return await exec('baja/plate/views/simple-menu.js', pt, this)
            }

            async createTextBoxMenuItems(pt) {
                return await exec('baja/plate/views/text-box-menu.js', pt, this)
            }

            showAverageOptions = (pt, wells) => {
                let m = [
                    {
                        label: 'Mean',
                        click: async (x, y) => {
                            pt.menu = null;
                            let t = wells.every(well => well.value !== null && !isNaN(well.value));
                            if (t) {

                                let interpreter = await exec('baja/engine/interpreter.js', pt)
                                interpreter.ref = this;
                                let fal = await interpreter.run('average into ' + uniqueString(this.name + '_mean', pt.getTableNames()) + '');
                                if (pt) {
                                    pt.zoomtolastplate()
                                }
                                pt.wb(null)
                            } else {
                                pt.setMessage(" Non-numeric values found ")
                            }

                        },
                        move: () => {
                        },
                    }, {
                        label: 'IQR Mean',
                        click: async (x, y) => {
                            pt.menu = null;
                            let t = wells__.every(well => well.value !== null && !isNaN(well.value));
                            if (t) {
                                let interpreter = await exec('baja/engine/interpreter.js', pt)
                                interpreter.ref = this;
                                let fal = await interpreter.run('iqrmean into ' + uniqueString(this.name + '_iqrmean', pt.getTableNames()) + '');
                                if (pt) {
                                    pt.zoomtolastplate()
                                }
                                pt.wb(null)
                            } else {
                                pt.setMessage(" Non-numeric values found ")
                            }

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Median',
                        click: async (x, y) => {
                            pt.menu = null;
                            let t = wells__.every(well => well.value !== null && !isNaN(well.value));
                            if (t) {

                                let interpreter = await exec('baja/engine/interpreter.js', pt)
                                interpreter.ref = this;
                                let fal = await interpreter.run('average into ' + uniqueString(this.name + 'average', pt.getTableNames()) + '');
                                pt.wb(null)
                            } else {
                                pt.setMessage(" Non-numeric values found ")
                            }

                        },
                        move: () => {
                        },
                    }
                ]

                if (this.getSelectedColumn() != null && this.getSelectedColumn().length === 2) {

                    m.push(
                        {
                            label: 'Mean for columns (replicates)',
                            click: async (x, y) => {
                                try {
                                    const method = 'mean'
                                    let selectedColumns = this.getSelectedColumn();
                                    let newColumn = [];
                                    let calculateColumnStatistics = (method = 'mean') => {
                                        const getSelectedColumn = () => {
                                            let multiple = [];
                                            for (let column of this.wells) {
                                                const isColumnSelected = column.every(row => row.select === true);
                                                if (isColumnSelected) {
                                                    multiple.push(column);
                                                }
                                            }
                                            return multiple;
                                        };

                                        const calculateMean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

                                        const calculateMedian = (values) => {
                                            const sorted = [...values].sort((a, b) => a - b);
                                            const mid = Math.floor(sorted.length / 2);
                                            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                                        };

                                        const calculateGeometricMean = (values) => {
                                            return Math.pow(values.reduce((a, b) => a * b, 1), 1 / values.length);
                                        };

                                        const calculateHarmonicMean = (values) => {
                                            return values.length / values.reduce((a, b) => a + 1 / b, 0);
                                        };
                                        const areAllNumbers = (values) => {
                                            return values.every(value => !isNaN(parseFloat(value)) && isFinite(value));
                                        };

                                        let nvalues = []
                                        let newColumn = [];

                                        for (let i = 0; i < selectedColumns[0].length; i++) {
                                            let values = selectedColumns.map(column => column[i].value);
                                            let result;

                                            if (!areAllNumbers(values)) {
                                                result = values;
                                            }
                                            switch (method) {
                                                case 'median':
                                                    result = calculateMedian(values);
                                                    break;
                                                case 'geometric':
                                                    result = calculateGeometricMean(values);
                                                    break;
                                                case 'harmonic':
                                                    result = calculateHarmonicMean(values);
                                                    break;
                                                case 'mean':
                                                default:
                                                    result = calculateMean(values);
                                                    break;
                                            }
                                            newColumn.push(result);

                                        }
                                        this.addColumn();
                                        for (let yindex = 0; yindex < newColumn.length; yindex++) {
                                            this.setValueByIndex(this.wells.length - 1, yindex, newColumn[yindex])
                                        }
                                    }
                                    let colstats = calculateColumnStatistics()
                                    showModal({
                                        wid: 'json',
                                        data: JSON.stringify(colstats[colstats.length - 1])
                                    })
                                    pt.wb(null)
                                } catch (err) {
                                    console.error('Failed to read from clipboard: ', err); pt.wb(null)
                                }
                            },
                            move: () => {
                            },
                        });

                }
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                click_and_drag = false;

            }

            showAggregateOptions = (pt) => {

                let selected_wells = this.getSelectedWells();
                let columns = []

                let index = 0;
                for (let s of selected_wells) {
                    if (s && s.length > 0)
                        columns.push(index)
                    index++
                }

                let m = [
                    {
                        label: 'Guess aggregation',
                        click: async (x, y) => {
                            pt.menu = null;
                            let interpreter = await exec('baja/engine/interpreter.js', pt)
                            interpreter.ref = this;
                            let fal = await interpreter.run('aggregate into ' + generateNautName() + '');
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    }]
                for (let c of columns) {
                    m.push({
                        label: `On column ${c}`,
                        click: async (x, y) => {

                            let ag_table_name = uniqueString(this.name + 'aggregate', pt.getTableNames());
                            let va = await prompt("", ["Name"], { "Name": ag_table_name }, 300, 350)
                            let m = va['Name']
                            if (m != null) {
                                ag_table_name = m;
                            }
                            let interpreter = await exec('baja/engine/interpreter.js', pt)
                            interpreter.ref = this;
                            let selectedBlocks = this.findContiguousSelectedWells(this.wells)
                            let fal = await interpreter.run(`aggregate ${selectedBlocks} on ${c} into ${ag_table_name}`);
                            LJScript.add(this.name, `aggregate into ` + ag_table_name)

                        },
                        move: () => {
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'
                    })

                }
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                click_and_drag = false;
            }

            showDeconvolveOptions = (pt) => {

                const deconvolve = (distinctColumnIndex) => {

                    if (distinctColumnIndex < 0 || distinctColumnIndex >= this.wells.length) {
                        throw new Error("Invalid column index");
                    }

                    const distinctValues = new Set();
                    for (let row = 0; row < this.wells[distinctColumnIndex].length; row++) {
                        const value = this.wells[distinctColumnIndex][row].value;
                        distinctValues.add(value);
                    }

                    const resultArrays = {};
                    distinctValues.forEach(value => {
                        resultArrays[value] = this.wells.map(column => []);
                    });

                    for (let column = 0; column < this.wells.length; column++) {
                        for (let row = 0; row < this.wells[column].length; row++) {
                            const cellValue = this.wells[distinctColumnIndex][row].value;
                            resultArrays[cellValue][column].push(this.wells[column][row]);
                        }
                    }

                    return resultArrays;
                }

                let selected_wells = this.getSelectedWells();
                let columns = []

                let index = 0;
                for (let s of selected_wells) {
                    if (s && s.length > 0)
                        columns.push(index)
                    index++
                }

                let m = [
                ]
                for (let c of columns) {
                    m.push({
                        label: `On column ${c}`,
                        click: async (x, y) => {

                            let wes = (deconvolve(c))

                            const separateByIndex = (arrayOf2DArrays) => {

                                const tables = [];

                                const maxColumns = arrayOf2DArrays[0].length;

                                for (let col = 0; col < maxColumns; col++) {
                                    tables[col] = [];
                                }

                                for (let a = 0; a < arrayOf2DArrays.length; a++) {
                                    let twoDArray = arrayOf2DArrays[a]
                                    for (let i = 0; i < twoDArray.length; i++) {
                                        tables[i].push(twoDArray[i])
                                    }
                                }

                                return tables;
                            };
                            let values = Object.values(wes)
                            const tables = separateByIndex(values);
                            let index = 0;
                            for (let w of tables) {
                                let p = new Plate(this.name + index + '__copy', w.length, w[0].length);
                                p.wells = w;
                                pt.addNextAvailableX(p)

                                index++;
                            }

                            pt.wb(null)

                        },
                        move: () => {
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'
                    })

                }
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                click_and_drag = false;
            }

            showSortOptions = (pt) => {
                let sl = this.getSelectedWellsInOrder();
                if (!pt.menu && !md && sl && sl.length === 1) {
                    this.editCells(pt, x, y);
                }
                else if (!pt.menu && !md && sl && sl.length > 1) {

                    let m = [
                        {
                            label: 'Ascending',
                            click: async (x, y) => {

                                pt.menu = null;
                                pushHistory(HM(this))
                                let c = this.getSelectedColumn();
                                let column = this.getColIndex(c[0][0])
                                this.sortColumn(column)

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Descending',
                            click: async (x, y) => {
                                pt.menu = null;
                                pushHistory(HM(this))
                                let c = this.getSelectedColumn();
                                let column = this.getColIndex(c[0][0])
                                this.sortColumn(column, false)

                            },
                            move: () => {
                            },
                        },
                    ]

                    pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                    click_and_drag = false;
                }
            }

            showMenuOptions = async (pt) => {

                if (this.subType === 'text_box') {
                    let m = await this.createTextBoxMenuItems(pt);
                    pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'black', 3)

                } else {

                    let m = await this.createCopyMenu(pt);
                    const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'black', 3)
                    pt.setMenu(smenu)

                }

            }

            showEditOptions = (pt) => {

                let sl = this.getSelectedWellsInOrder();

                if (!pt.menu && !md && sl && sl.length > 0) {

                    let m = [
                        {
                            label: 'One-at-a-time (tab) ',
                            click: async (x, y) => {

                                pt.setMessage("Start typing and [tab] to jump to next selected cell.")
                                this.editCells(pt, x, y);
                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },

                        {
                            label: 'Edit all together',
                            click: async (x, y) => {

                                let w = this.getSelectedWellsInOrder();
                                if (w != null && w.length > 1) {
                                    for (let iw of w) {
                                        iw.setValue('');
                                        let id = this.getWellIndicies(iw)

                                    }
                                }

                                let keydown_sb = (event) => {
                                    if (event.ctrlKey && event.key !== 'Control') {
                                        return;
                                    }
                                    this.___drawfish = true;
                                    pt.menu = null;
                                    let w = this.getSelectedWellsInOrder();
                                    if (event.key == 'Control') {
                                        return;
                                    }
                                    if (!pt.select_well && w && w.length > 0) {
                                        pt.setSelected(this);
                                    }
                                    if (event.key === 'Backspace') {
                                        if (w != null && w.length > 1) {
                                            for (let iw of w) {
                                                let length = (iw.value + '').length;
                                                iw.setValue((iw.value + '').substring(0, length - 1));
                                                let id = this.getWellIndicies(iw)
                                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                            }
                                            cursorPos -= 1;
                                            return;
                                        }
                                    }
                                    else if (event.key === 'Enter') {

                                        pushHistory(HM(this))
                                        pt.wb(null)

                                        return;
                                    }
                                    else if (event.key === 'Delete') {
                                        if (w && w.length > 0) {
                                            for (let a of w) {
                                                a.setValue('')
                                                let id = this.getWellIndicies(a)
                                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                            }
                                        }
                                        return;
                                    }
                                    if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                                        let w = this.getSelectedWellsInOrder();
                                        if (w != null && w.length > 1) {
                                            for (let iw of w) {
                                                iw.setValue(iw.value + event.key);
                                                let id = this.getWellIndicies(iw)
                                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                            }
                                        }
                                    }

                                }

                                let mouseDownListener_sb = async (x, y) => {
                                    let xw = pt.grid.Xwc(x);
                                    let yw = pt.grid.Ywc(y);
                                    if (ref) {
                                        ref.hideEditor();
                                    }
                                    if (pt.menu) {
                                        if (!pt.menu.isIn(pt.grid, xw, yw)) {
                                            pt.menu = null;
                                        }
                                        return;
                                    }
                                    if (pt.menu) {
                                        return;
                                    }

                                };

                                let mouseMoveListener_sb = async (x, y) => {
                                };

                                let mouseUpListener_sb = async (x, y) => {
                                };

                                let t = {
                                    id: 'sync-edit',
                                    mouseMoveListener: mouseMoveListener_sb,
                                    mouseUpListener: mouseUpListener_sb,
                                    mouseDownListener: mouseDownListener_sb,
                                    keydown: keydown_sb,
                                    init: () => {
                                    },
                                    close: () => {
                                        clearMenu();
                                    },
                                    priority: true,
                                    draw: (grid, ctx) => {

                                        ctx.font = "24px Arial";
                                        freezFrame = true;
                                        if (pt.menu) {
                                            ctx.fillStyle = 'rgba(255,255,255,0.63)'
                                            ctx.fillRect(pt.grid.xi, pt.grid.yi, pt.grid.width, pt.grid.height)

                                            pt.menu.draw(ctx, grid)
                                            this.textActive = false;

                                        }

                                    },
                                    menuManager: null,
                                    smenu: null
                                }
                                if (pt && pt.wb)
                                    pt.wb(t)

                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'LJScript',
                            click: async (x, y) => {
                                pt.menu = null;
                                let se = this.getSelectedWellsInOrder()
                                pt.setSelected(this);
                                exec('baja/table/io/lj-fun-to-table.js', pt, this, se)
                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Alphabet ',
                            click: async (x, y) => {

                                function generateRowLabel(index) {
                                    let label = '';
                                    while (index >= 0) {
                                        label = String.fromCharCode(65 + (index % 26)) + label;
                                        index = Math.floor(index / 26) - 1;
                                    }
                                    return label;
                                }

                                let w = this.getSelectedWellsInOrder();
                                if (w != null && w.length > 1) {

                                    let index = 0;
                                    for (let iw of w) {

                                        iw.setValue(generateRowLabel(index++));
                                        let id = this.getWellIndicies(iw)
                                        LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                    }
                                }

                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Index (1...i)',
                            click: async (x, y) => {
                                pt.menu = null;

                                let w = this.getSelectedWellsInOrder();
                                if (w != null && w.length > 1) {

                                    let index = 1;
                                    for (let iw of w) {
                                        iw.setValue((index++));
                                        let id = this.getWellIndicies(iw)
                                        LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                    }
                                }
                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Index append',
                            click: async (x, y) => {
                                pt.menu = null;
                                let w = this.getSelectedWellsInOrder();
                                if (w != null && w.length > 1) {

                                    let index = 1;
                                    for (let iw of w) {
                                        iw.setValue(iw.value + (index++));
                                        let id = this.getWellIndicies(iw)
                                        LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                    }
                                }

                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Random names',
                            click: async (x, y) => {
                                pt.menu = null;
                                let w = this.getSelectedWellsInOrder();

                                for (let iw of w) {
                                    iw.setValue(generateNautName());
                                    let id = this.getWellIndicies(iw)
                                    LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                }
                                pt.menu = null;

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Clear all',
                            click: async (x, y) => {
                                pt.menu = null;

                                pushHistory(HM(this))
                                let confirm = await exec('baja/lib/confirm.js', 'Delete selected contents?', async () => {
                                    for (let x = 0; x < this.wells.length; x++) {
                                        for (let y = 0; y < this.wells[x].length; y++) {
                                            let well = this.wells[x][y];
                                            if (well && well.select) {
                                                well.reset();
                                            }
                                        }
                                    }
                                    pt.wb(null)
                                })
                                showModal(confirm)

                            },
                            move: () => {
                            },
                        }

                    ]

                    if (this.getSelectedColumn() != null && this.getSelectedColumn().length > 0) {

                        let values = this.getSelectedWellsInOrder();

                        m.unshift(
                            {
                                label: 'Split column',
                                click: async (x, y) => {

                                    let v = [];
                                    for (let i of values) {
                                        v.push(i)
                                    }

                                    v = v.map(obj => obj.value);
                                    let suggestiosn = this.analyzeAndParse(v)

                                    let selectP;
                                    let selectPanel = createIonFunction(async (_panel) => {
                                        selectP = _panel;
                                    });

                                    let tp = suggestiosn.analysis.topSpecialChars.map(item => item.char);
                                    let up = suggestiosn.analysis.topUnits.map(item => item.unit);
                                    let t = {
                                        wid: 'card',
                                        data: {
                                            cards: [
                                                [
                                                    {
                                                        'title': 'Delimiter options',
                                                        width: '100%',

                                                        'body': `  `, 'component':
                                                        {
                                                            wid: 'selection-list',
                                                            width: '100%',
                                                            refCallback: selectPanel,
                                                            data: {
                                                                listItems: tp,
                                                                button_function: createIonFunction(async (items) => {
                                                                    let name = items[0]
                                                                    for (let schar of suggestiosn.analysis.topSpecialChars) {
                                                                        if (schar.char === name) {

                                                                            const tx = this.getColIndex(values[0]) + 1;
                                                                            this.insertColWithCopy(tx, pt)

                                                                            for (let w of values) {
                                                                                let row_index = this.getRowIndex(w)
                                                                                let string_value = w.value + '';
                                                                                if (string_value != null && string_value.length > 0) {
                                                                                    let new_values = string_value.split(schar.char)
                                                                                    if (new_values != null && new_values.length > 0) {
                                                                                        this.setWellValue(tx, row_index, new_values[1])
                                                                                        this.setWellValue(tx - 1, row_index, new_values[0])
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                })

                                                            }
                                                        }
                                                    },
                                                    {
                                                        'title': ' Numerical Units ',
                                                        width: '100%',
                                                        'body': `  `, 'component':
                                                        {
                                                            wid: 'selection-list',
                                                            width: '100%',
                                                            refCallback: selectPanel,
                                                            data: {
                                                                listItems: up
                                                            }
                                                        }
                                                    },
                                                ],
                                                [
                                                ]
                                            ]
                                        }
                                    }
                                    showModal(t, 500, 700)
                                },
                                move: () => {
                                }
                                ,
                                bg: 'yellow',
                                fg: 'black'

                            })
                    }

                    pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                    click_and_drag = false;
                }
            }

            inButtons(x, y, pt) {
                if (!pt.selected_well) {
                    return false;
                }

                if (this.xmax > 2 && this.ymax > 2 && this.txbuttons && this.txbuttons.length > 0) {
                    let buttonWidth = 20;
                    let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                    for (let index = 0; index < this.button_set.length; index++) {
                        let button = this.txbuttons[index];
                        let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                        let buttonHeight = button.height;

                        if (
                            x >= buttonX &&
                            x <= buttonX + buttonWidth &&
                            y >= buttonY &&
                            y <= buttonY + buttonHeight
                        ) {
                            return true;
                        }
                    }
                }

                if (this.txbuttons && this.txbuttons.length > 0) {
                    let buttonWidth = 20;
                    let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                    for (let index = 0; index < this.txbuttons.length; index++) {
                        let button = this.txbuttons[index];
                        let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                        let buttonHeight = button.height;

                        if (
                            x >= buttonX &&
                            x <= buttonX + buttonWidth &&
                            y >= buttonY &&
                            y <= buttonY + buttonHeight
                        ) {
                            return true;
                        }
                    }

                }
                return false;
            }

            isInsideBottomButtons(grid, mouseX, mouseY) {
                let index = 0;
                for (let button of this.bottom_buttons) {
                    let xinit = grid.X(this.grid.xi);
                    let buttonX = xinit - bsize * index;
                    let buttonY = grid.Y(this.grid.yi);
                    let buttonHeight = button.height;
                    if (buttonY < 0) {
                        buttonY = 10;
                    }
                    let buttonWidth = button.width || bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + buttonWidth &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + buttonHeight
                    ) {
                        return button;
                    }
                    index++;
                }
                return null;
            }

            clk_drag_______________(pt) {
                if (!pt) {
                    return;
                }
                __pt__ = pt;
                if (pt.wbid != null && pt.wbid.startsWith('override')) {
                    return;
                }
                let cell_width = pt.grid.screenWidth(this.getWidth(pt)) / (this.grid.xmax - this.grid.xmin);
                let cell_height = pt.grid.screenHeight(this.getHeight(pt)) / (this.grid.ymax - this.grid.ymin);
                if (this.visible_cell_aspect_ratio_min) {
                    let ratio = cell_width / cell_height;
                    if (ratio < this.visible_cell_aspect_ratio_min) {
                        return;
                    }
                }
                if (this.visible_cell_aspect_ratio_max) {
                    let ratio = cell_width / cell_height;
                    if (ratio > this.visible_cell_aspect_ratio_max) {
                        return;
                    }
                }
                this.textBoxX = null;
                textStyle = null;
                this.___drawfish = false;
                click_and_drag = false;
                let startIndex = null;
                let currentSelected = [];
                let cursorIndex = null;
                this.textActive = false;
                freezFrame = true;
                singleSelect = false;
                let tid = null;
                let ref;

                let swe = this.getSelectedWellsInOrder();
                if (swe && swe.length > 0) {
                    pt.selected_well = swe[0];
                    singleSelect = true;
                    textStyle = 'data'
                } else {
                    singleSelect = false;
                }
                let keydown = (event) => {
                    if (event.ctrlKey && event.key !== 'Control') {
                        return;
                    }
                    this.___drawfish = true;
                    let w = this.getSelectedWellsInOrder();
                    if (event.key == 'Control') {
                        return;
                    }
                    if (tid) {
                        clearInterval(tid)
                    }
                    if (!pt.select_well && w && w.length > 0) {
                        pt.setSelected(this);
                    }
                    if (event.key === 'Backspace') {
                        if (w != null && w.length === 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                                let length = (pt.selected_well.obj + '').length;
                                pt.selected_well.setValue('');
                                pt.selected_well.obj = ((pt.selected_well.obj + '').substring(0, length - 1));
                                if (pt.selected_well.obj === '') {
                                    pt.selected_well.setWellType(null)
                                }
                                cursorPos -= 1;
                                return;
                            }
                            if (!pt.selected_well.value) {
                                pt.selected_well.setValue('');
                                let id = this.getWellIndicies(pt.selected_well)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                return;
                            }
                            let length = (pt.selected_well.value + '').length;
                            pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                            cursorPos -= 1;

                            return;
                        } else
                            if (w != null && w.length > 1) {
                                let length = (pt.selected_well.value + '').length;
                                pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                                cursorPos -= 1;
                                return;
                            }
                    }
                    else if (event.key === 'Enter') {
                        this.__dirty = true;

                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)
                        }
                        this.__dirty = true;

                        if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                            pt.selected_well.setWellType(null)
                            this.deselectAll()
                            this.selectIt();

                            return;
                        }
                        this.deselectAll()
                        this.selectIt();

                        return;
                    }
                    if (event.key === 'Tab') {
                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)

                        }
                    }
                    else if (event.key === 'Delete') {
                        if (w && w.length > 0) {
                            for (let a of w) {
                                a.setValue('')
                                let id = this.getWellIndicies(a)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                            }
                        }
                        return;
                    }
                    if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {

                        let w = this.getSelectedWellsInOrder();
                        if (w != null && w.length === 1) {
                            pt.selected_well = w[0]
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            if (pt.selected_well.obj && (pt.selected_well.obj.startsWith('=')) || (event.key === '=')) {
                                if (pt.selected_well.skin_transient && pt.selected_well.skin_transient !== 'EXCEL_STYLE_TEXT')
                                    __previousSkin = pt.selected_well.skin_transient;
                                pt.selected_well.setWellType('EXCEL_STYLE_TEXT')
                                if (event.key === '=') {
                                    pt.selected_well.obj = event.key
                                } else {
                                    pt.selected_well.obj += event.key
                                }
                                pt.selected_well.setValue('')

                            } else
                                pt.selected_well.setValue(pt.selected_well.value + event.key);
                        } else if (w != null && w.length > 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            pt.selected_well.setValue(pt.selected_well.value + event.key);
                        }
                    }
                    this.handleKeyDown(pt, event)

                }

                let mouseDownListener = async (x, y) => {

                    if (pt.menu) {
                        return;
                    }

                    let w = this.getSelectedWellsInOrder();
                    let xw = pt.grid.Xwc(x);
                    let yw = pt.grid.Ywc(y);
                    if (ref) {
                        ref.hideEditor();
                    }

                    if (this.inButtons(x, y, pt)) {
                        return;
                    }

                    if (w && w.length > 0) {
                        pt.selected_well = w[0]
                    }

                    md = true;
                    let current_well = this.getWell(xw, yw, pt);
                    if (w && w.length === 1 && singleSelect && current_well === w[0]) {
                        let __value = w[0].value;
                        let range = this.getWellRange(w)
                        let formula = pt.getFormulaForWell(this.name + range)
                        if (formula && formula.length > 0) {
                            __value = formula;
                        }
                        if (w[0].icon) {
                            this.showIconMenu(pt, w[0])
                        } else {

                            this.showWellAction(pt, __value, ref, w)
                        }
                        singleSelect = false;
                        return;
                    }

                    this.editWell(current_well, pt)
                    click_and_drag = true;
                    if (w && w.length === 1 && w[0] === current_well) {
                        pt.selected_well = w;
                        singleSelect = true;
                        textStyle = 'data'
                        return;
                    } else if (w && w.length === 0 && !current_well) {

                        singleSelect = false;
                        return;
                    } else if (w && w.length === 1 && w[0] != current_well) {

                        current_well = w[0]

                        singleSelect = true;
                    }
                    else {
                        singleSelect = false;
                    }
                    if (current_well) {
                        if (current_well.select) {
                            current_well.deselectIt()
                            this.textBoxX = null;
                            textStyle = null;

                            currentSelected = currentSelected.filter(function (item) {
                                return item.w !== current_well;
                            });
                            return;
                        } else {
                            startIndex = this.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                        }
                    }

                };

                let mouseMoveListener = async (x, y) => {
                    this.resizeable = false;
                    mouseX = x;
                    mouseY = y;
                    this.___drawfish = true;
                    const mmx = pt.grid.Xwc(x);
                    const mmy = pt.grid.Ywc(y);

                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                        return;
                    }

                    if (md && startIndex != null) {
                        if (tid) {
                            clearInterval(tid)
                        }
                        freezFrame = false;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = this.getWell(xw, yw, pt);
                        if (current_well) {
                            let currentIndex = this.getWellRowIndex(current_well);
                            if (currentIndex) {
                                cursorIndex = currentIndex;

                                for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                                    for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                        if (this.wells[col] && this.wells[col][row]) {
                                            if (!currentSelected.some(cs => cs.row === row && cs.col === col)) {
                                                currentSelected.push({
                                                    w: this.wells[col][row],
                                                    row: row,
                                                    col: col
                                                });
                                                this.wells[col][row].selectIt();
                                            }
                                        }
                                    }
                                }

                                const minRow = startIndex.rowIndex;
                                const maxRow = currentIndex.rowIndex;
                                const minCol = startIndex.colIndex;
                                const maxCol = currentIndex.colIndex;

                                let i = currentSelected.length - 1;
                                while (i >= 0) {
                                    const selected = currentSelected[i];
                                    const isWithinBounds =
                                        selected.row >= minRow && selected.row <= maxRow &&
                                        selected.col >= minCol && selected.col <= maxCol;

                                    if (!isWithinBounds) {

                                        selected.w.deselectIt();
                                        currentSelected.splice(i, 1);
                                        i--;
                                    } else {

                                        break;
                                    }
                                }
                            }

                        }

                    } else {

                        if (this.textActive) {

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (!this.inside(pt.grid, mmx, mmy, true)) {
                                this.highlightbutton = null;
                                this.textActive = false;
                                return;
                            }
                        } else {
                            this.___drawfish = true;
                            if (!pt.selected_well) {

                                let sl = this.getSelectedWellsInOrder();
                                if (sl && sl.length > 0) {
                                    pt.selected_well = sl[0]
                                } else {
                                    textStyle = null;
                                    this.textBoxX = null;

                                }
                            }
                        }
                        if (this.inResize(x, y, pt)) {
                            this.textActive = false;

                        }
                        else if (this.onRightEdge(x, y, pt)) {
                            this.resizeable = true;
                        }
                    }

                }
                let mouseUpListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);

                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        pt.menu.mouseUp(pt.grid, mmx, mmy)
                        md = false;
                        pt.menu = null;
                        return;
                    } else if (pt.menu) {
                        if (!pt.menu.isIn(pt.grid, mmx, mmy)) {
                            pt.menu = null;
                        }
                        return;

                    }
                    if (pt.menu) {
                        console.log('debubg');
                        return;
                    }
                    md = false;
                    startIndex = null;
                    let b = this.button_set;
                    let tw = ((pt.grid.worldWidth(30 * b.length)))
                    let init = pt.grid.X(this.grid.xi + this.grid.width - tw);
                    if (init < 0) {
                        init = pt.grid.Xwc(0)
                    }
                    let index = 0;
                    for (let button of b) {
                        let buttonX = init + index * bsize;
                        let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                        if (buttonY < 0) {
                            buttonY = 10;
                        }
                        index++;
                        let bbw = bsize;
                        if (
                            x >= buttonX &&
                            x <= buttonX + bbw &&
                            y >= buttonY &&
                            y <= buttonY + button.height
                        ) {
                            return button.action(buttonX, buttonY, x, y, pt);
                        }
                    }
                    let olp = false;
                    if (this.txbuttons && this.txbuttons.length > 0 && textStyle && textStyle != 'search' && pt.selected_well) {
                        let buttonWidth = 20;
                        let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                        this.txbuttons.forEach(async (button, index) => {
                            let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                            let buttonHeight = button.height;

                            if (
                                x >= buttonX &&
                                x <= buttonX + buttonWidth &&
                                y >= buttonY &&
                                y <= buttonY + buttonHeight
                            ) {
                                console.log('debubg');
                                button.action(pt.selected_well, pt);
                                olp = true;
                            }
                        });
                    }

                    if (this.attr__RowAddRemoveButtons) {
                        if (this.isInsideBottomButtons(pt.grid, x, y)) {
                            const bu = this.isInsideBottomButtons(pt.grid, x, y)
                            bu.action(null, null, x, y, pt);
                        }
                    }
                    if (olp) {
                        return;
                    }
                    if (!this.inside(pt.grid, mmx, mmy)) {
                        this.highlightbutton = null;
                        this.textActive = false;
                        return;
                    }
                    if (this.ref) {
                        return;
                    }

                }

                let t = {
                    id: 'click_and_drag' + this.name,
                    mouseMoveListener: mouseMoveListener,
                    mouseUpListener: mouseUpListener,
                    mouseDownListener: mouseDownListener,
                    keydown: keydown,
                    init: () => {
                        this.clk_and_drag_open = true;
                    },
                    close: () => {
                        clearMenu();
                        this.textActive = false;
                        this.clk_and_drag_open = false;
                    },
                    priority: true,
                    draw: (grid, ctx) => {

                        ctx.font = "24px Arial";
                        freezFrame = true;

                        if (startIndex) {
                            if (startIndex != null && cursorIndex != null) {
                                const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                                const textX = grid.X(this.grid.X(cursorIndex.colIndex));
                                const textY = grid.Y(this.grid.Y(cursorIndex.rowIndex));

                                const textWidth = ctx.measureText(text).width;
                                const textHeight = 20;

                                const padding = 8;
                                const cornerRadius = 10;
                                const rectX = textX - padding;
                                const rectY = textY - textHeight - padding;
                                const rectWidth = textWidth + 2 * padding;
                                const rectHeight = textHeight + 2 * padding;

                                ctx.shadowBlur = 10;
                                ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                                ctx.shadowBlur = 0;
                                ctx.fillStyle = "black";
                                ctx.fillText(text, textX, textY);
                            }
                        }

                    },
                    menuManager: null,
                    smenu: null
                }
                if (pt && pt.wb)
                    pt.wb(t)

            }

            clk_drag___(pt) {

                if (!pt) {
                    return;
                }
                __pt__ = pt;

                this.___drawfish = false;
                click_and_drag = false;
                let startIndex = null;
                let currentSelected = [];
                let cursorIndex = null;

                freezFrame = true;
                singleSelect = false;
                let tid = null;
                let ref;

                if (this.plateType === 'package') {
                    this.attr__displayMenuButtons = true;
                    pt.setMessage(" Options for the folder ", 8)

                } else
                    pt.setMessage(" Table menu options", 8)

                let swe = this.getSelectedWellsInOrder();
                if (swe && swe.length > 0) {
                    pt.selected_well = swe[0];
                    singleSelect = true;
                    textStyle = 'data'
                } else {
                    singleSelect = false;
                }
                let keydown = (event) => {

                    if (event.ctrlKey && event.key !== 'Control') {
                        return;
                    }
                    this.___drawfish = true;
                    let w = this.getSelectedWellsInOrder();
                    if (event.key == 'Control') {
                        return;
                    }
                    if (tid) {
                        clearInterval(tid)
                    }
                    if (!pt.select_well && w && w.length > 0) {
                        pt.setSelected(this);
                    }

                    if (event.key === 'Backspace') {
                        if (w != null && w.length === 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                                let length = (pt.selected_well.obj + '').length;
                                pt.selected_well.setValue('');
                                pt.selected_well.obj = ((pt.selected_well.obj + '').substring(0, length - 1));
                                if (pt.selected_well.obj === '') {
                                    pt.selected_well.setWellType(null)
                                }
                                cursorPos -= 1;
                                return;
                            }
                            if (!pt.selected_well.value) {
                                pt.selected_well.setValue('');
                                let id = this.getWellIndicies(pt.selected_well)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                return;
                            }
                            let length = (pt.selected_well.value + '').length;
                            pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                            cursorPos -= 1;

                            return;
                        } else
                            if (w != null && w.length > 1) {
                                let length = (pt.selected_well.value + '').length;
                                pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                                cursorPos -= 1;
                                return;
                            }
                    }
                    else if (event.key === 'Enter') {
                        this.__dirty = true;

                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)

                        }
                        this.__dirty = true;

                        if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                            pt.selected_well.setWellType(null)
                            this.deselectAll()
                            this.selectIt(pt);

                            return;
                        }
                        this.selectIt(pt);
                        pt.setMessage('Crunching the numbers...', 3)
                        setTimeout(() => {
                            pt.updateCalculations();
                        }, 100)
                        return;
                    }
                    if (event.key === 'Tab') {
                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)
                        }
                    }
                    else if (event.key === 'Delete') {
                        if (w && w.length > 0) {
                            for (let a of w) {
                                a.setValue('')
                                let id = this.getWellIndicies(a)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                            }
                        }
                        return;
                    }
                    if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                        let w = this.getSelectedWellsInOrder();
                        if (w != null && w.length === 1) {
                            pt.selected_well = w[0]
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            if (pt.selected_well.obj && (pt.selected_well.obj.startsWith('=')) || (event.key === '=')) {
                                if (pt.selected_well.skin_transient && pt.selected_well.skin_transient !== 'EXCEL_STYLE_TEXT')
                                    __previousSkin = pt.selected_well.skin_transient;
                                pt.selected_well.setWellType('EXCEL_STYLE_TEXT')
                                if (event.key === '=') {
                                    pt.selected_well.obj = event.key
                                } else {
                                    pt.selected_well.obj += event.key
                                }
                                pt.selected_well.setValue('')

                            } else
                                pt.selected_well.setValue(pt.selected_well.value + event.key);
                        } else if (w != null && w.length > 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            pt.selected_well.setValue(pt.selected_well.value + event.key);
                        }
                    }
                    this.handleKeyDown(pt, event)
                }

                let mouseDownListener = async (x, y) => {

                    if (this.inButtons(x, y, pt)) {
                        return;
                    }
                    if (pt.menu || pt.__menu__) {
                        return;
                    }

                    if (this.menu) {
                        return;
                    }

                    this.deselectWells();

                    let w = this.getSelectedWellsInOrder();
                    let xw = pt.grid.Xwc(x);
                    let yw = pt.grid.Ywc(y);
                    if (ref) {
                        ref.hideEditor();
                    }
                    md = true;

                    if (w && w.length === 1) {
                        pt.selected_well = w[0]
                    }
                    let current_well = this.getWell(xw, yw);
                    if (this.plateType === 'package') {
                        return;
                    }

                    if (w && w.length === 1 && singleSelect && current_well === w[0]) {
                        let __value = w[0].value;
                        let range = this.getWellRange(w)
                        let formula = pt.getFormulaForWell(this.name + range)
                        if (formula && formula.length > 0) {
                            __value = formula;
                        }
                        if (w[0].icon) {
                            this.showIconMenu(pt, w[0])
                        } else {

                            this.showWellAction(pt, __value, ref, w)
                        }
                        singleSelect = false;
                    }

                    this.editWell(current_well, pt)
                    click_and_drag = true;
                    if (w && w.length === 1 && w[0] === current_well) {
                        pt.selected_well = w;
                        singleSelect = true;
                        textStyle = 'data'
                        return;
                    } else if (w && w.length === 0 && !current_well) {

                        singleSelect = false;
                        return;
                    } else if (w && w.length === 1 && w[0] != current_well) {
                        pt.selected_well = current_well;
                        if (current_well && current_well.selectIt)
                            current_well.selectIt();
                        singleSelect = true;
                        return;
                    }
                    else {
                        singleSelect = false;
                    }
                    if (current_well) {

                        if (current_well.select) {
                            for (let ww of w) {
                                ww.deselectIt();
                            }
                            startIndex = this.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                            return;
                        } else {
                            startIndex = this.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                        }
                    }

                };

                let mouseMoveListener = async (x, y) => {

                    if (this.inButtons(x, y, pt)) {
                        return;
                    }

                    this.resizeable = false;
                    mouseX = x;
                    mouseY = y;
                    this.___drawfish = true;
                    const mmx = pt.grid.Xwc(x);
                    const mmy = pt.grid.Ywc(y);
                    if (this.plateType !== '__viewer') {
                        let index = 0;
                        let b = this.button_set;
                        let tw = ((pt.grid.worldWidth(30 * b.length)))
                        let init = pt.grid.X(this.grid.xi + this.grid.width - tw);
                        if (init < 0) {
                            init = pt.grid.Xwc(0)

                        }

                        if (this.attr__displayMenuButtons) {

                            for (let button of b) {
                                let buttonX = init + index * bsize;
                                let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                                if (buttonY < 0) {
                                    buttonY = 10;
                                }
                                index++;
                                let bbw = bsize;
                                if (
                                    x >= buttonX &&
                                    x <= buttonX + bbw &&
                                    y >= buttonY &&
                                    y <= buttonY + button.height
                                ) {
                                    this.highlightbutton = button.name;
                                    this.___drawfish = false;

                                    return await button.highlight(buttonX, buttonY, x, y, pt);

                                }
                            }
                        }
                        if (this.isInsideBottomButtons(pt.grid, x, y)) {

                        }
                        if (this.attr__displayCellButtons) {
                            if (this.txbuttons && this.txbuttons.length > 0 && pt.selected_well) {
                                let buttonWidth = 20;
                                let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                                await this.txbuttons.forEach(async (button, index) => {
                                    let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                                    let buttonHeight = button.height;
                                    button.isHighlighted = false;

                                    if (
                                        x >= buttonX &&
                                        x <= buttonX + buttonWidth &&
                                        y >= buttonY &&
                                        y <= buttonY + buttonHeight
                                    ) {
                                        button.isHighlighted = true;
                                        this.highlightbutton = button.name;

                                    }
                                });
                            }
                        }
                    }
                    if (md && startIndex != null) {
                        if (tid) {
                            clearInterval(tid)
                        }
                        freezFrame = false;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = this.getWell(xw, yw);
                        if (current_well) {
                            let currentIndex = this.getWellRowIndex(current_well);
                            if (currentIndex) {
                                cursorIndex = currentIndex;

                                for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                                    for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                        if (this.wells[col] && this.wells[col][row]) {

                                            currentSelected.push({
                                                w: this.wells[col][row],
                                                row: row,
                                                col: col
                                            });
                                            this.wells[col][row].selectIt();

                                        }
                                    }
                                }

                                const minRow = startIndex.rowIndex;
                                const maxRow = currentIndex.rowIndex;
                                const minCol = startIndex.colIndex;
                                const maxCol = currentIndex.colIndex;

                                let i = currentSelected.length - 1;
                                while (i >= 0) {
                                    const selected = currentSelected[i];
                                    const isWithinBounds =
                                        selected.row >= minRow && selected.row <= maxRow &&
                                        selected.col >= minCol && selected.col <= maxCol;

                                    if (!isWithinBounds) {
                                        selected.w.deselectIt();
                                        currentSelected.splice(i, 1);
                                        i--;
                                    } else {
                                        break;
                                    }
                                }
                            }

                        }

                    } else {

                        if (this.textActive) {

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (!this.inside(pt.grid, mmx, mmy, true)) {
                                this.highlightbutton = null;
                                this.textActive = false;
                                return;
                            }
                        } else {
                            this.___drawfish = true;
                            if (!pt.selected_well) {

                                let sl = this.getSelectedWellsInOrder();
                                if (sl && sl.length > 0) {
                                    pt.selected_well = sl[0]
                                } else {
                                    textStyle = null;
                                    this.textBoxX = null;

                                }
                            }
                        }
                    }

                }
                let mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);

                    md = false;
                    startIndex = null;

                    let b = this.button_set;
                    let tw = ((pt.grid.worldWidth(30 * b.length)))
                    let init = pt.grid.X(this.grid.xi + this.grid.width - tw);
                    if (init < 0) {
                        init = pt.grid.Xwc(0)
                    }
                    let index = 0;
                    if (this.attr__displayMenuButtons) {
                        for (let button of b) {
                            let buttonX = init + index * bsize;
                            let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                            if (buttonY < 0) {
                                buttonY = 10;
                            }
                            index++;
                            let bbw = bsize;
                            if (
                                x >= buttonX &&
                                x <= buttonX + bbw &&
                                y >= buttonY &&
                                y <= buttonY + button.height
                            ) {
                                return button.action(buttonX, buttonY, x, y, pt);
                            }
                        }
                    }
                    let olp = false;
                    if (this.attr__displayCellButtons) {
                        if (this.txbuttons && this.txbuttons.length > 0 && textStyle && textStyle != 'search' && pt.selected_well) {
                            let buttonWidth = 20;
                            let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                            this.txbuttons.forEach(async (button, index) => {
                                let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                                let buttonHeight = button.height;

                                if (
                                    x >= buttonX &&
                                    x <= buttonX + buttonWidth &&
                                    y >= buttonY &&
                                    y <= buttonY + buttonHeight
                                ) {
                                    button.action(pt.selected_well, pt);
                                    olp = true;
                                }
                            });
                        }
                    }

                    let xw = pt.grid.Xwc(x);
                    let yw = pt.grid.Ywc(y);
                    let current_well = this.getWell(xw, yw);
                    if (current_well) {
                        if (this.plateType === 'package') {
                            await this.simpleMenu(pt)
                            return;
                        }
                    }

                    if (this.attr__RowAddRemoveButtons) {
                        if (this.isInsideBottomButtons(pt.grid, x, y)) {
                            const bu = this.isInsideBottomButtons(pt.grid, x, y)
                            bu.action(null, null, x, y, pt);
                        }
                    }
                    if (olp) {
                        return;
                    }
                    if (!this.inside(pt.grid, mmx, mmy)) {
                        this.highlightbutton = null;
                        this.textActive = false;
                        return;
                    }
                    if (this.ref) {
                        return;
                    }

                }

                let t = {
                    id: 'click_and_drag' + this.name,
                    mouseMoveListener: mouseMoveListener,
                    mouseUpListener: mouseUpListener,
                    mouseDownListener: mouseDownListener,
                    keydown: keydown,
                    init: () => {
                        this.clk_and_drag_open = true;
                    },
                    close: () => {
                        clearMenu();
                        this.textActive = false;
                        this.clk_and_drag_open = false;
                    },
                    priority: true,
                    draw: (grid, ctx) => {

                        ctx.font = "24px Arial";
                        freezFrame = true;

                        if (startIndex) {
                            if (startIndex != null && cursorIndex != null) {
                                const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                                const textX = grid.X(this.grid.X(cursorIndex.colIndex));
                                const textY = grid.Y(this.grid.Y(cursorIndex.rowIndex));

                                const textWidth = ctx.measureText(text).width;
                                const textHeight = 20;

                                const padding = 8;
                                const cornerRadius = 10;
                                const rectX = textX - padding;
                                const rectY = textY - textHeight - padding;
                                const rectWidth = textWidth + 2 * padding;
                                const rectHeight = textHeight + 2 * padding;

                                ctx.shadowBlur = 10;
                                ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                                ctx.shadowBlur = 0;
                                ctx.fillStyle = "black";
                                ctx.fillText(text, textX, textY);
                            }
                        }

                    },
                    menuManager: null,
                    smenu: null
                }
                if (pt && pt.wb)
                    pt.wb(t)

            }

            clk_drag(pt) {
                if (!pt) {
                    return;
                }
                __pt__ = pt;
                if (pt.wbid != null && pt.wbid.startsWith('override')) {
                    return;
                }
                this.selected = true;
                this.textBoxX = null;
                textStyle = null;
                this.___drawfish = false;
                click_and_drag = false;
                let startIndex = null;
                let currentSelected = [];
                let cursorIndex = null;
                this.textActive = false;
                freezFrame = true;
                singleSelect = false;
                let tid = null;
                let ref;
                if (pt.menu) {
                    pt.menu = null;
                }

                let keydown = (event) => {
                    if (event.ctrlKey && event.key !== 'Control') {
                        return;
                    }
                    this.___drawfish = true;
                    let w = this.getSelectedWellsInOrder();
                    if (event.key == 'Control') {
                        return;
                    }
                    if (tid) {
                        clearInterval(tid)
                    }
                    if (!pt.select_well && w && w.length > 0) {
                        pt.setSelected(this);
                    }
                    if (event.key === 'Backspace') {
                        if (w != null && w.length === 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                                let length = (pt.selected_well.obj + '').length;
                                pt.selected_well.setValue('');
                                pt.selected_well.obj = ((pt.selected_well.obj + '').substring(0, length - 1));
                                if (pt.selected_well.obj === '') {
                                    pt.selected_well.setWellType(null)
                                }
                                cursorPos -= 1;
                                return;
                            }
                            if (!pt.selected_well.value) {
                                pt.selected_well.setValue('');
                                let id = this.getWellIndicies(pt.selected_well)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                return;
                            }
                            let length = (pt.selected_well.value + '').length;
                            pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                            cursorPos -= 1;

                            return;
                        } else
                            if (w != null && w.length > 1) {
                                let length = (pt.selected_well.value + '').length;
                                pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                                cursorPos -= 1;
                                return;
                            }
                    }
                    else if (event.key === 'Enter') {
                        this.__dirty = true;

                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)

                        }
                        this.__dirty = true;

                        if (pt.selected_well.obj && pt.selected_well.obj.startsWith('=')) {
                            pt.selected_well.setWellType(null)
                            this.deselectAll()
                            this.selectIt(pt);

                            return;
                        }
                        this.selectIt(pt);
                        pt.setMessage('Crunching the numbers...', 3)
                        setTimeout(() => {
                            pt.updateCalculations();
                        }, 100)
                        return;
                    }
                    if (event.key === 'Tab') {
                        if (pt.selected_well && pt.selected_well.value) {
                            let id = this.getWellIndicies(pt.selected_well)
                            LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)

                        }
                    }
                    else if (event.key === 'Delete') {
                        if (w && w.length > 0) {
                            for (let a of w) {
                                a.setValue('')
                                let id = this.getWellIndicies(a)
                                LJScript.add(this.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                            }
                        }
                        return;
                    }
                    if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                        let w = this.getSelectedWellsInOrder();
                        if (w != null && w.length === 1) {
                            pt.selected_well = w[0]
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            if (pt.selected_well.obj && (pt.selected_well.obj.startsWith('=')) || (event.key === '=')) {
                                if (pt.selected_well.skin_transient && pt.selected_well.skin_transient !== 'EXCEL_STYLE_TEXT')
                                    __previousSkin = pt.selected_well.skin_transient;
                                pt.selected_well.setWellType('EXCEL_STYLE_TEXT')
                                if (event.key === '=') {
                                    pt.selected_well.obj = event.key
                                } else {
                                    pt.selected_well.obj += event.key
                                }
                                pt.selected_well.setValue('')

                            } else {
                                pt.selected_well.setValue(pt.selected_well.value + event.key);
                            }
                        } else if (w != null && w.length > 1) {
                            if (!pt.selected_well) {
                                pt.selected_well = w[0]
                            }
                            if (pt.selected_well.textSelected) {
                                pt.selected_well.setValue('');
                                pt.selected_well.textSelected = false;
                                cursorPos = 0
                            }
                            pt.selected_well.setValue(pt.selected_well.value + event.key);
                        }
                    }
                }

                let mouseDownListener = async (x, y) => {
                    let w = this.getSelectedWellsInOrder();
                    let xw = pt.grid.Xwc(x);
                    let yw = pt.grid.Ywc(y);
                    if (ref) {
                        ref.hideEditor();

                    }

                    let tx = false;

                    if (pt && pt.selected_well && pt.selected_well.__screen_y && this.grid.xmax > 2 && this.grid.ymax > 2 && this.txbuttons && this.txbuttons.length > 0) {
                        let buttonWidth = 20;

                        let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                        this.txbuttons.forEach(async (button, index) => {
                            let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                            let buttonHeight = button.height;
                            if (
                                x >= buttonX &&
                                x <= buttonX + buttonWidth &&
                                y >= buttonY &&
                                y <= buttonY + buttonHeight
                            ) {

                                tx = true
                                return;
                            }
                        });
                    }
                    if (tx) {
                        return;
                    }
                    this.selectIt();
                    this.selected = true;
                    if (pt.menu) {
                        if (pt.menu && pt.menu.isIn(pt.grid, xw, yw)) {
                            pt.menu.mouseUp(pt.grid, xw, yw)
                            md = false;
                            return;
                        }
                        else {
                            pt.menu = null;
                            pt.deselectAll();
                        }
                        return;
                    }
                    let b = this.button_set;
                    let tw = ((pt.grid.worldWidth(30 * b.length)))
                    let init = pt.grid.X(this.grid.xi + this.getWidth() - tw);
                    if (init < 0) {
                        init = pt.grid.Xwc(0)
                    }
                    let index = 0;
                    for (let button of b) {
                        let buttonX = init + index * bsize;
                        let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                        if (buttonY < 0) {
                            buttonY = 10;
                        }
                        index++;
                        let bbw = bsize;
                        if (
                            x >= buttonX &&
                            x <= buttonX + bbw &&
                            y >= buttonY &&
                            y <= buttonY + button.height
                        ) {
                            if (button.name === 'move')
                                return button.action(buttonX, buttonY, x, y, pt);
                        }
                    }

                    if (this.attr__RowAddRemoveButtons) {
                        if (this.isInsideBottomButtons(pt.grid, x, y)) {
                            const bu = this.isInsideBottomButtons(pt.grid, x, y)
                            bu.action(pt);
                        }
                    }
                    if (this.onColumnEdge(x, y, pt)) {
                        this.resizeColumn(x, y, pt)
                        return;
                    }

                    const mmx = pt.grid.Xwc(x);
                    const mmy = pt.grid.Ywc(y);
                    if (!this.inside(pt.grid, mmx, mmy)) {
                        this.highlightbutton = null;
                        this.textActive = false;
                        return;
                    }
                    if (this.ref) {
                        return;
                    }
                    let current_well = this.getWell(xw, yw, pt);
                    this.editWell(current_well, pt)
                    md = true;
                    currentSelected = [];
                    click_and_drag = true;

                    if (w && w.length === 1 && w[0] === current_well) {
                        pt.selected_well = w;
                        singleSelect = true;
                        textStyle = 'data'
                        return;
                    } else if (w && w.length === 0 && !current_well) {

                        singleSelect = false;
                        return;
                    } else if (w && w.length === 1 && w[0] != current_well) {

                        current_well = w[0]

                        singleSelect = true;
                    }
                    else {
                        singleSelect = false;
                    }

                    if (current_well) {

                        if (current_well.select) {
                            current_well.deselectIt()
                            currentSelected = currentSelected.filter(function (item) {
                                return item.w !== current_well;
                            });
                            return;
                        } else {
                            startIndex = this.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                        }
                    }

                };

                let mouseMoveListener = async (x, y) => {
                    this.resizeable = false;
                    mouseX = x;
                    mouseY = y;
                    this.___drawfish = true;
                    const mmx = pt.grid.Xwc(x);
                    const mmy = pt.grid.Ywc(y);

                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                        return;
                    }

                    let index = 0;
                    let b = this.button_set;
                    let tw = ((pt.grid.worldWidth(30 * b.length)))
                    let init = pt.grid.X(this.grid.xi + this.getWidth() - tw);
                    if (init < 0) {
                        init = pt.grid.Xwc(0)

                    }
                    for (let button of b) {
                        let buttonX = init + index * bsize;
                        let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                        if (buttonY < 0) {
                            buttonY = 10;
                        }
                        index++;
                        let bbw = bsize;
                        if (
                            x >= buttonX &&
                            x <= buttonX + bbw &&
                            y >= buttonY &&
                            y <= buttonY + button.height
                        ) {
                            this.highlightbutton = button.name;
                            this.___drawfish = false;

                            return await button.highlight(buttonX, buttonY, x, y, pt);

                        }
                    }

                    if (this.isInsideBottomButtons(pt.grid, x, y)) {

                    }

                    if (this.txbuttons && this.txbuttons.length > 0 && pt.selected_well) {
                        let buttonWidth = 20;
                        let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                        await this.txbuttons.forEach(async (button, index) => {
                            let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                            let buttonHeight = button.height;
                            button.isHighlighted = false;

                            if (
                                x >= buttonX &&
                                x <= buttonX + buttonWidth &&
                                y >= buttonY &&
                                y <= buttonY + buttonHeight
                            ) {
                                button.isHighlighted = true;
                                this.highlightbutton = button.name;

                            }
                        });
                    }

                    if (md && startIndex != null) {
                        if (tid) {
                            clearInterval(tid)
                        }
                        freezFrame = false;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = this.getWell(xw, yw, pt);
                        if (current_well) {
                            let currentIndex = this.getWellRowIndex(current_well);
                            if (currentIndex) {
                                cursorIndex = currentIndex;

                                for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                                    for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                        if (this.wells[col] && this.wells[col][row]) {
                                            if (!currentSelected.some(cs => cs.row === row && cs.col === col)) {
                                                currentSelected.push({
                                                    w: this.wells[col][row],
                                                    row: row,
                                                    col: col
                                                });
                                                this.wells[col][row].selectIt();
                                            }
                                        }
                                    }
                                }

                                currentSelected = currentSelected.filter(selected => {
                                    const isWithinBounds =
                                        selected.row >= startIndex.rowIndex &&
                                        selected.row <= currentIndex.rowIndex &&
                                        selected.col >= startIndex.colIndex &&
                                        selected.col <= currentIndex.colIndex;

                                    if (!isWithinBounds) {
                                        selected.w.deselectIt();
                                    }

                                    return isWithinBounds;
                                });
                            }
                        }

                    } else {

                        if (this.textActive) {

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (!this.inside(pt.grid, mmx, mmy, true)) {
                                this.highlightbutton = null;
                                this.textActive = false;
                                return;
                            }

                        } else {
                            this.___drawfish = true;
                            if (!pt.selected_well) {

                                let sl = this.getSelectedWellsInOrder();
                                if (sl && sl.length > 0) {
                                    pt.selected_well = sl[0]
                                } else {
                                    textStyle = null;
                                    this.textBoxX = null;

                                }
                            }
                        }
                        if (!pt.menu && this.inResize(x, y, pt)) {
                            this.textActive = false;

                        }
                        else if (!pt.menu && this.onRightEdge(x, y, pt)) {
                            this.resizeable = true;

                        } else if (!pt.menu && this.onColumnEdge(x, y, pt)) {
                            this.higlightColumn(x, y, pt)
                        } else {
                            this.__highlight_column = false;
                        }

                    }
                }

                let showOptions = async (mincount) => {
                    let sl = this.getSelectedWellsInOrder();
                    if (!pt.menu && !md && sl && sl.length > mincount) {
                        let selectedBlocks = this.findContiguousSelectedWells(this.wells)
                        for (let s of selectedBlocks)
                            LJScript.add(this.name, `select ${s}`)
                        let cou = this.getSelectedWellsInOrder()
                        if (cou != null && cou.length > 0) {
                            if (cou.length === 1) {
                                pt.selected_well = cou[0];
                            }
                            let m = await this.createCopyMenu(pt);
                            pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                            click_and_drag = false;
                        }
                    }
                }

                let mouseUpListener = (x, y) => {
                    let b = this.button_set;
                    let tw = ((pt.grid.worldWidth(30 * b.length)))
                    let init = pt.grid.X(this.grid.xi + this.getWidth() - tw);
                    if (init < 0) {
                        init = pt.grid.Xwc(0)
                    }
                    let index = 0;
                    for (let button of b) {
                        let buttonX = init + index * bsize;
                        let buttonY = pt.grid.Y(this.grid.yi + this.getHeight() + pt.grid.worldHeight(this.margin.top));
                        if (buttonY < 0) {
                            buttonY = 10;
                        }
                        index++;
                        let bbw = bsize;
                        if (
                            x >= buttonX &&
                            x <= buttonX + bbw &&
                            y >= buttonY &&
                            y <= buttonY + button.height
                        ) {
                            return button.action(buttonX, buttonY, x, y, pt);
                        }
                    }

                    let tx = false;

                    if (pt && pt.selected_well && pt.selected_well.__screen_y && this.grid.xmax > 2 && this.grid.ymax > 2 && this.txbuttons && this.txbuttons.length > 0) {
                        let buttonWidth = 20;

                        let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                        this.txbuttons.forEach(async (button, index) => {
                            let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                            let buttonHeight = button.height;
                            if (
                                x >= buttonX &&
                                x <= buttonX + buttonWidth &&
                                y >= buttonY &&
                                y <= buttonY + buttonHeight
                            ) {
                                button.action(pt.selected_well, pt);
                                tx = true;
                                return;
                            }
                        });
                    }
                    if (tx) {
                        return;
                    }

                    if (this.txbuttons && this.txbuttons.length > 0 && pt.selected_well) {
                        let buttonWidth = 20;
                        let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;
                        this.txbuttons.forEach(async (button, index) => {
                            let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                            let buttonHeight = button.height;
                            if (
                                x >= buttonX &&
                                x <= buttonX + buttonWidth &&
                                y >= buttonY &&
                                y <= buttonY + buttonHeight
                            ) {
                                if (button.name === 'options') {
                                    showOptions(0)
                                } else {
                                    button.action(pt.selected_well, pt);
                                }
                                return;
                            }
                        });
                    }

                    let w = this.getSelectedWellsInOrder();
                    if (w && w.length > 0) {
                        let __value = w[0].value;
                        pt.selected_well = w[0]
                        let range = this.getWellRange(w)
                        let formula = pt.getFormulaForWell(this.name + range)
                        if (formula && formula.length > 0) {
                            __value = formula;
                        }
                        md = false;

                        if (w && w.length === 1 && singleSelect) {
                            if (w[0].icon) {
                                this.showIconMenu(pt, w[0])
                            } else {
                                this.showWellAction(pt, __value, ref, w)
                                md = false;
                                singleSelect = false;
                            }
                        }
                        textStyle = 'data'
                        const mpos = w[0];
                        if (mpos) {
                            if (this.textBoxX = mpos.selected_well) {
                                this.textBoxX = mpos.selected_well.__screen_x;
                                this.textBoxY = mpos.__screen_y;
                                this.pwx = mpos.x;
                                this.pwy = mpos.y;
                            }
                        }

                    }

                    md = false;
                    startIndex = null;
                };

                let t = {
                    id: 'click_and_drag' + this.name,
                    mouseMoveListener: mouseMoveListener,
                    mouseUpListener: mouseUpListener,
                    mouseDownListener: mouseDownListener,
                    keydown: keydown,
                    init: () => {
                        this.clk_and_drag_open = true;
                    },
                    close: () => {
                        clearMenu();
                        this.textActive = false;
                        this.clk_and_drag_open = false;
                    },
                    priority: true,
                    draw: (grid, ctx) => {

                        ctx.font = "24px Arial";
                        freezFrame = true;

                        if (startIndex) {
                            if (startIndex != null && cursorIndex != null) {
                                const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                                const textX = grid.X(this.grid.X(cursorIndex.colIndex));
                                const textY = grid.Y(this.grid.Y(cursorIndex.rowIndex));

                                const textWidth = ctx.measureText(text).width;
                                const textHeight = 20;

                                const padding = 8;
                                const cornerRadius = 10;
                                const rectX = textX - padding;
                                const rectY = textY - textHeight - padding;
                                const rectWidth = textWidth + 2 * padding;
                                const rectHeight = textHeight + 2 * padding;

                                ctx.shadowBlur = 0;
                                ctx.fillStyle = "black";
                                ctx.fillText(text, textX, textY);
                            }
                        }
                        if (pt.menu) {
                            ctx.fillStyle = 'rgba(255,255,255,0.63)'
                            ctx.fillRect(pt.grid.xi, pt.grid.yi, pt.grid.width, pt.grid.height)

                            pt.menu.draw(ctx, grid)
                            this.textActive = false;

                        }

                    },
                    menuManager: null,
                    smenu: null
                }
                if (pt && pt.wb)
                    pt.wb(t)
            }

            isPlateMenuVisible() {
                if (pt.menu != null) {
                    return true;
                } else {
                    return false;
                }
            }

            transpose(pt) {
                this.wells = this.transposeWells(this.wells);
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                this.grid.width = (this.grid.xmax * pt.grid.worldWidth(1))

                this.grid.rescale();
                if (pt) {
                    pt.zoomintoplate(this)
                }
            }

            async showSelectOptionsMenu(pt) {
                let m = await this.createCopyMenu(pt);
                this.displayMenu(m, pt);
            }

            async createConnectMenu(pt) {
                return await exec('baja/plate/views/big-menu-little', pt, this)
            }
            async loadMenu(pt, path) {
                if (path) {
                    return await exec(path, pt, this)
                }
                return await exec('baja/plate/views/big-menu-little', pt, this)
            }

            async showIconMenu(pt, well) {
                let mouse_sc_y;
                let mouse_sc_x;
                let m = [
                    {
                        label: 'Image to table...',
                        click: async (x, y) => {

                            pt.setMessage("Running OCR... ")
                            const rawText = await well.icon.toOCR();
                            const lines = rawText.split('\n').filter(line => line.trim() !== "");

                            let wells = lines.map(line =>
                                line.split(/\t|,| {2,}/).map(cell => ({ value: cell.trim() }))
                            );

                            let colcount = 1;
                            if (!wells[0]) {
                                colcount = wells[0].length;
                            }

                            let p = new Plate(this.name + '__derivative', colcount, wells.length);
                            for (let row = 0; row < wells.length; row++) {
                                for (let col = 0; col < colcount; col++) {
                                    p.wells[col][row] = new GenericWell(`(${row},${col})`, wells[row][col].value);
                                }
                            }
                            p.removeEmptyRowsAndColumns();
                            p.deselectWells();
                            p.fitRowsAndColumns();
                            p.grid.width = this.getWidth();
                            p.grid.height = this.grid.height;
                            pt.addNextAvailableX(p)
                            setTimeout(() => {

                                pt.zoomintoplate(p);
                            }, 1000)
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Draw...',
                        click: async (x, y) => {

                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Delete',
                        click: async (x, y) => {

                        },
                        move: () => {
                        },
                    },

                ]

                let cols = Math.ceil(m.length / 10);
                let menuWidth = 200;
                let totalMenuWidth = menuWidth * (cols);
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 10 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)
            }

            adjustDimensionsToFitScale(pt) {
                this.grid.xmax = this.wells.length;
                this.grid.ymax = this.wells[0].length;
                this.grid.width = pt.grid.worldWidth(this.grid.xmax * 120)

                this.grid.rescale();
            }

            async createSimpleTextMenu(pt) {

                let mouse_sc_y;
                let mouse_sc_x;
                let m = [
                    {
                        label: 'Change name: ' + this.name,
                        click: async (x, y) => {
                            let attr_window = ''
                            let va = await prompt("Table name: " + this.name, ["Name"], { "Name": attr_window }, 500, 300)
                            let m = va['Name']
                            this.name = m;
                            pt.updateworkbench(null)

                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Table Type: ' + this.name,
                        click: async (x, y) => {
                            let attr_window = ''
                            let va = await prompt("Table type: " + this.plateType, ["Type"], { "Type": attr_window }, 500, 300)
                            let m = va['Type']
                            this.plateType = m;
                        },
                        move: () => {
                        },
                    },

                ]
                let cols = Math.ceil(m.length / 10);
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)

            }

            searchAndSelectByValue(pt) {
                this.textActive = true;
                textStyle = 'search'
                this.text = ''
                this.cursorPos = 0;
                this.textBoxX = pt.grid.width - (pt.grid.width / 2 - this.textBoxWidth / 2)
                this.textBoxY = pt.grid.height - (pt.grid.height / 2 - 40 / 2)
                pt.wb({
                    mouseDownListener: async (x, y) => {
                    },
                    mouseMoveListener: async (x, y) => {
                    },
                    mouseUpListener: async (x, y) => {
                        this.textBoxX = null;
                        this.textStyle = null;
                        this.clk_drag(pt)
                    }
                    ,
                    close: () => {
                        this.textActive = false;
                        this.text = ""
                    },
                    keydown: (event) => {

                        this.textActive = true;

                        if (event.ctrlKey) {
                            return;
                        }
                        if (event.key === 'Enter') {
                            this.textActive = false;
                            textStyle = null;
                            this.text = ''
                            this.textBoxX = 0;
                            this.textBoxY = 0;
                            pt.wb(null)
                            return;
                        }
                        this.unhighlightWells();
                        if (event.key === 'ArrowLeft') {
                            console.log('Left arrow pressed');
                            cursorPos -= 1;
                        } else if (event.key === 'ArrowRight') {
                            console.log('Right arrow pressed');
                            cursorPos += 1;
                        } else
                            if (event.key === 'Backspace') {
                                if (cursorPos >= 0) {
                                    this.text = this.text.slice(0, cursorPos - 1) + this.text.slice(cursorPos);
                                    cursorPos -= 1;
                                }
                                if (cursorPos < 0) {
                                    cursorPos = 0;
                                    this.text = ''
                                }
                                this.highlightRows(this.text);
                            }
                            else if (event.key === 'Enter') {
                                console.log('Enter key pressed');
                            } else {
                                if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{} :,\-]$/.test(event.key)) {
                                    this.text = this.text.slice(0, cursorPos) + event.key + this.text.slice(cursorPos);
                                    cursorPos = this.text.length;

                                    this.deselectWells();

                                    this.highlightRows(this.text);

                                } else {
                                    console.log('----Non-alphanumeric key pressed: ' + event.key);
                                }
                            }

                    }
                    ,
                    draw: (grid, ctx) => {
                    },

                })

            }
            searchAndSelectByTag(pt) {
                this.textActive = true;
                textStyle = 'search'
                this.text = ''
                this.textBoxX = pt.grid.width - (pt.grid.width / 2 - this.textBoxWidth / 2)
                this.textBoxY = pt.grid.height - (pt.grid.height / 2 - 40 / 2)
                pt.wb({
                    mouseDownListener: async (x, y) => {
                    },
                    mouseMoveListener: async (x, y) => {
                    },
                    mouseUpListener: async (x, y) => {
                        this.textBoxX = null;
                        this.textStyle = null;
                        this.clk_drag(pt)
                    }
                    ,
                    close: () => {
                        this.textActive = false;
                        this.text = ""
                        textStyle = null
                    },
                    keydown: async (event) => {

                        if (!this.textActive) {
                            return;
                        }

                        if (event.ctrlKey && event.key === 'c') {

                            this.close();
                            return;
                        }

                        if (event.key === 'ArrowLeft') {
                            console.log('Left arrow pressed');
                            cursorPos -= 1;
                        } else if (event.key === 'ArrowRight') {
                            console.log('Right arrow pressed');
                            cursorPos += 1;
                        } else if (event.key === 'Backspace') {
                            await this.unhighlightWells();

                            if (cursorPos > 0) {
                                this.text = this.text.slice(0, cursorPos - 1) + this.text.slice(cursorPos);
                                cursorPos -= 1;
                            } else {
                                this.text = ''
                            }

                            if (this.text.length > 1) {
                                this.selectWellsByTag(this.text);
                            }
                        }

                        else if (event.key === 'Enter') {
                            console.log('Enter key pressed');
                        } else {
                            if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{} :,\-]$/.test(event.key)) {
                                await this.unhighlightWells();
                                this.text = this.text.slice(0, cursorPos) + event.key + this.text.slice(cursorPos);
                                cursorPos += 1;

                                if (this.text.length > 1) {
                                    this.selectWellsByTag(this.text);
                                }

                            } else {
                                console.log('----Non-alphanumeric key pressed: ' + event.key);
                            }
                        }
                    }
                    ,
                    draw: (grid, ctx) => {
                    },

                })

            }

            showColorMenu(pt) {
                let smenu;
                let m = []
                m.push({
                    label: 'No color',
                    click: async (__x, __y) => {
                        this.setColorAll();
                        pt.menu = null;
                    },
                    move: () => {
                    },
                })

                m.push({
                    label: 'Heatmap (relative values)',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        this.colorWellsBySimilarity(se)
                        pt.menu = null;
                    },
                    move: () => {
                    },
                })

                m.push({
                    label: 'Color by tag',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        for (let s of se) {
                            s.color = null;
                        }

                        pt.menu = null;

                    },
                    move: () => {
                    },
                })

                m.push({
                    label: 'Gradient highlight',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        highlightValuesGradientTransparency(se)
                        pt.menu = null;

                    },
                    move: () => {
                    },
                })
                m.push({
                    label: 'Outliers (IQR)',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        highlightOutliers(se)
                        pt.menu = null;

                    },
                    move: () => {
                    },
                })
                m.push({
                    label: 'Outliers (Z-score)',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        highlightOutliersZScore(se)
                        pt.menu = null;

                    },
                    move: () => {
                    },
                })
                m.push({
                    label: 'Grubbs',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()
                        highlightOutliersGrubbs(se)
                        pt.menu = null;

                    },
                    move: () => {
                    },
                })
                m.push({
                    label: 'Choose color',
                    click: async (__x, __y) => {
                        let se = this.getSelectedWellsInOrder()

                        let color__ = 'blue'
                        let sequence_input = {
                            wid: 'card',
                            "height": "100px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "500px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'card',
                                                data: {
                                                    cards: [
                                                        [
                                                            {
                                                                'width': '100%',
                                                                'height': "100px",
                                                                "style.padding-top": '4px',
                                                                "style.border": '1px',
                                                                'component':
                                                                {
                                                                    'wid': 'color-chooser',
                                                                    'width': '100%',

                                                                    "data": {
                                                                        "selectionListener": createIonFunction((_color) => {

                                                                            color__ = _color;

                                                                        })
                                                                    }
                                                                }
                                                            },
                                                        ]
                                                    ]
                                                }
                                            }

                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                for (let s of se) {
                                                                    s.color = color__
                                                                }
                                                                hideAllModal();
                                                            })
                                                        },
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(sequence_input, 500, 200)

                        pt.menu = null;

                    },
                    move: () => {
                    },
                })

                let cols = Math.ceil(m.length / 10);
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)

            }

            goEditor(well, pt) {
                textStyle = null;

                this.showMenuOptions(pt);
            }

            goTag(well, pt) {

                exec('baja/plate/views/well-color-panel.js', this, pt)
            }

            async removeSelected(well, pt) {
                let column = this.getSelectedColumn()
                let rows = this.getSelectedRow();
                if (!column && !rows || (column.length == 0 && rows.length == 0)) {
                    let confirm = await exec('baja/lib/confirm.js', 'Delete the contents of the cells?', () => {
                        pushHistory(HM(this))
                        let selected_wells = this.getSelectedWellsInOrder();
                        for (let item of selected_wells) {
                            item.setValue('')
                        }
                    });
                    showModal(confirm)

                } else {

                    if (column && column.length > 0) {
                        let confirm = await exec('baja/lib/confirm.js', 'Delete the entire column?', () => {
                            pushHistory(HM(this))
                            this.removeFullySelectedColumns();
                        })
                        showModal(confirm)
                    }
                    if (rows && rows.length > 0) {
                        let confirm = await exec('baja/lib/confirm.js', 'Delete the row?', () => {
                            pushHistory(HM(this))
                            this.removeFullySelectedRows();
                        })
                        showModal(confirm)
                    }
                }
                setTimeout(() => {
                    pt.wb(null)
                }, 1000)
            }

            async dev_null(button_name, pt) {
                this.highlightbutton = button_name
            }

            async close_text_window(well, pt) {
                this.deselectAll();
                this.selectIt();
                setTimeout(() => {
                    this.clk_drag()
                }, 100)

            }
            async test_menu(bx, by, mmx, mmy, pt) {
                pushHistory(HM(this))
                let column = this.getSelectedColumn()
                let rows = this.getSelectedRow();
                if (!column && !rows || (column.length == 0 && rows.length == 0)) {
                    let confirm = await exec('baja/lib/confirm.js', 'Delete this table?', () => {
                        this.deselectAll();
                        pt.removePlate(this)
                        setTimeout(() => {
                            pt.wb(null)
                        }, 1000)
                    })
                    showModal(confirm)

                } else {

                    if (column && column.length > 0) {
                        let confirm = await exec('baja/lib/confirm.js', 'Delete the entire column?', () => {
                            pushHistory(HM(this))
                            this.removeFullySelectedColumns();
                        })
                        showModal(confirm)
                    }
                    if (rows && rows.length > 0) {
                        let confirm = await exec('baja/lib/confirm.js', 'Delete the row?', () => {
                            pushHistory(HM(this))
                            this.removeFullySelectedRows();
                        })
                        showModal(confirm)
                    }
                }
            }

            async createTableMenu(bx, by, mmx, mmy, pt) {

                let m = [

                ]
                let TableOps = await exec('baja/table/table-ops')
                let menuList = await TableOps.load(pt, this)

                m = m.concat(menuList)
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                pt.menu.menu_width = 180;
            }

            updateWellView(skin_type_) {

                let wellfn = WellDisplay[skin_type_]

                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            well.skin_transient = wellfn
                            well.skin_type = skin_type_;
                        }
                    }
                }
            }

            applyPlateLayout(plateLayout) {
                for (let wellPosition in plateLayout.layout) {
                    if (plateLayout.layout.hasOwnProperty(wellPosition)) {
                        const wellData = plateLayout.layout[wellPosition];
                        for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                            for (let y = this.grid.ymin; y < this.grid.ymax; y++) {
                                if (this.wells[x] && this.wells[x][y]) {

                                    let well = this.wells[x][y];
                                    if (well.position) {
                                        if (well.position.toLowerCase() === wellPosition.toLowerCase()) {

                                            if (wellData.group) {

                                                if (!well.group) {
                                                    well.group = {};
                                                }

                                                for (let groupKey in wellData.group) {

                                                    if (!well.group[groupKey]) {
                                                        well.group[groupKey] = [];
                                                    }
                                                    well.group[groupKey] = well.group[groupKey].concat(wellData.group[groupKey]);

                                                }
                                            }

                                            if (wellData.concentration != null) well.concentration = wellData.concentration;
                                            if (wellData.obj) well.obj = wellData.obj;
                                            if (wellData.value != null) well.value = wellData.value;
                                            if (wellData.structure) well.structure = wellData.structure;
                                            if (wellData.formula) well.formula = wellData.formula;

                                        } else {

                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            getSelectedWellsInTimeOrder() {

                let selectedWells = [];
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select) {
                            selectedWells.push(well);
                        }
                    }
                }

                selectedWells.sort((a, b) => b.timeSelected - a.timeSelected);

                return selectedWells;
            }

            getSelectedWells() {
                return this.wells.map(column => column.filter(well => well && well.select));
            }

            getSelectedWellsInOrder() {
                const selectedWells = [];
                if (!this.wells.length) return selectedWells;

                const numRows = this.wells.length;
                const numCols = this.wells[0].length;

                const getLongestRow = () => {
                    let maxRowLen = 0, maxRowIdx = -1;

                    for (let x = 0; x < numRows; x++) {
                        let count = 0;
                        for (let y = 0; y < numCols; y++) {
                            if (!(this.wells[x][y])) {
                                const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);
                                this.wells[x][y] = createDefaultWell
                            }

                            if (this.wells[x][y].select) {
                                count++;
                            } else {
                                count = 0;
                            }
                            if (count > maxRowLen) {
                                maxRowLen = count;
                                maxRowIdx = x;
                            }
                        }
                    }
                    return { length: maxRowLen, index: maxRowIdx, isRow: true };
                };

                const getLongestColumn = () => {
                    let maxColLen = 0, maxColIdx = -1;

                    for (let y = 0; y < numCols; y++) {
                        let count = 0;
                        for (let x = 0; x < numRows; x++) {
                            if (!(this.wells[x][y])) {
                                const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);
                                this.wells[x][y] = createDefaultWell
                            }

                            if (this.wells[x][y].select) {
                                count++;
                            } else {
                                count = 0;
                            }
                            if (count > maxColLen) {
                                maxColLen = count;
                                maxColIdx = y;
                            }
                        }
                    }
                    return { length: maxColLen, index: maxColIdx, isRow: false };
                };

                const longestRow = getLongestRow();
                const longestCol = getLongestColumn();

                const iterateByColumn = longestCol.length >= longestRow.length;

                for (let x = 0; x < this.grid.xmax; x++) {
                    for (let y = 0; y < this.grid.ymax; y++) {
                        if (this.wells[x][y] && this.wells[x][y].select) {
                            selectedWells.push(this.wells[x][y]);
                        }
                    }
                }

                return selectedWells;
            }

            deepCopyWells() {
                let copiedPlate = {
                    wells: []
                };
                for (let column = 0; column < this.wells.length; column++) {
                    copiedPlate.wells[column] = [];
                    for (let row = 0; row < this.wells[column].length; row++) {
                        copiedPlate.wells[column][row] = this.wells[column][row].deepCopy();
                    }
                }
                return copiedPlate.wells;
            }

            async createViewMenu(bx, by, x, y, pt) {
                let m = [

                    {
                        label: 'Change name: ' + this.name,
                        click: async (x, y) => {
                            let attr_window = ''
                            let va = await prompt("Name", ["Name"], { "Name": attr_window }, 300, 300)
                            let m = va['Name']
                            this.name = m;
                            pt.updateworkbench(null)

                        },
                        move: () => {
                        },
                    },

                ]

                m.push(
                    {
                        label: `Workstream...`,
                        click: async (scx, scy) => {
                            let commands = LJScript.getEvents(this.name);
                            if (!commands) {
                                commands = []
                            }
                            let st = commands.join("\n");
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let canvas = CurrentLayout.getStashed('graph-canvas')
                            let t =
                            {
                                height: '200px',
                                editorOptions: {
                                    language: 'bajabio',
                                    value: "Enter LJ-script here",
                                    theme: 'no-border-theme',
                                    minimap: { enabled: false },
                                    scrollbar: {
                                        vertical: 'hidden',
                                        horizontal: 'hidden',
                                    },
                                    lineNumbers: 'off',
                                    lineDecorationsWidth: 0,
                                    lineNumbersMinChars: 0,
                                    overviewRulerLanes: 0,
                                    hideCursorInOverviewRuler: true,
                                    folding: false,
                                    highlightActiveIndentGuide: false,
                                    renderLineHighlight: 'none',
                                    renderLineHighlightOnlyWhenFocus: false,
                                    renderWhitespace: 'none',
                                    fontSize: 15,
                                    automaticLayout: true,
                                    padding: {
                                        top: 20,
                                        bottom: 20,
                                        left: 30,
                                        right: 30
                                    }
                                },
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                    })
                                },
                                code: st,
                                buttons: [{
                                    'label': 'Update', "color": 'blue', action: async () => {
                                        let code = canvas.getEditorText();

                                        let interpreter = await exec('baja/engine/interpreter.js', pt)
                                        interpreter.ref = this;
                                        interpreter.run(code);
                                    }
                                },
                                {
                                    'label': 'Close', 'color': 'black', "action": () => {
                                        ref.hideEditor();
                                    }
                                }
                                ]
                            }
                            t.objects = pt.root;
                            ref = pt.showTextEditor(t);
                            interval_id = setInterval(() => {
                                if (ref && ref.isTextEditorVisible()) {
                                    let commands = LJScript.getEvents();
                                    if (commands)
                                        ref.setEditorText("" + (commands.join('\n')))
                                } else {
                                    clearInterval(interval_id)
                                    return;
                                }
                            }, 1000)
                        },
                        move: () => {
                        }
                    });
                m.push(
                    {
                        label: `Create LJScript...`,
                        click: async (scx, scy) => {
                            ref = null;
                            if (interval_id)
                                clearInterval(interval_id)

                            let st = LJScript.getEvents();
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let canvas = CurrentLayout.getStashed('graph-canvas')
                            let t =
                            {
                                height: '200px',
                                editorOptions: {
                                    language: 'bajabio',
                                    value: "Enter LJ-script here",
                                    theme: 'no-border-theme',
                                    minimap: { enabled: false },
                                    scrollbar: {
                                        vertical: 'hidden',
                                        horizontal: 'hidden',
                                    },
                                    lineNumbers: 'off',
                                    lineDecorationsWidth: 0,
                                    lineNumbersMinChars: 0,
                                    overviewRulerLanes: 0,
                                    hideCursorInOverviewRuler: true,
                                    folding: false,
                                    highlightActiveIndentGuide: false,
                                    renderLineHighlight: 'none',
                                    renderLineHighlightOnlyWhenFocus: false,
                                    renderWhitespace: 'none',
                                    fontSize: 15,
                                    automaticLayout: true,
                                    padding: {
                                        top: 20,
                                        bottom: 20,
                                        left: 30,
                                        right: 30
                                    }
                                },
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                    })
                                },
                                code: st,
                                buttons: [{
                                    'label': 'Run', "color": 'blue', action: async () => {
                                        let code = canvas.textEditor.getContent();

                                        let interpreter = await exec('baja/engine/interpreter.js', pt)
                                        interpreter.ref = this;
                                        interpreter.run(code);

                                    }
                                },
                                {
                                    'label': 'Save', 'color': 'black', "action": async () => {
                                        if (interval_id)
                                            clearInterval(interval_id)
                                        let va = await prompt("Name", ["Name"], { "Name": '' }, 300, 300)
                                        let m = va['Name']
                                        let host_ = window['env']['apiUrl']

                                        let gsObject = {
                                            name: m,
                                            script: this.name + ':\n' + ref.getEditorText(),
                                            date: new Date()
                                        }
                                        let gs = JSON.stringify(gsObject)
                                        let jsonobj = {
                                            "name": m + '.nautilus',
                                            "key": "user",
                                            "user": getUser(),
                                            "spath": '.',
                                            "value": gs
                                        }
                                        let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');
                                        if (rs.status === 404) {
                                            infoPrompt("Error saving...")
                                        } else {
                                            pm.tentacles[m] = gsObject;
                                            infoPrompt("Saved")
                                        }
                                    }
                                },
                                {
                                    'label': 'Open', 'color': 'black', "action": async () => {
                                        await exec('baja/table/io/open-nautilus', this)

                                    }

                                },
                                {
                                    'label': 'Close', 'color': 'black', "action": () => {
                                        ref.hideEditor();
                                    }
                                }
                                ]
                            }

                            t.objects = pm.plateTrack.root;

                            ref = pt.showTextEditor(t);

                        },
                        move: () => {
                        }
                    });

                m.push({
                    label: 'Table type...',
                    click: async (x, y) => {
                        let va = await prompt("Type", ["Type"], { "Type": this.plateType }, 300, 300)
                        let m = va['Type']
                        if (m != null) {
                            this.plateType = m;
                        }

                    },
                    move: () => {
                    },
                })
                m.push({
                    label: 'Group preferences',
                    click: async (x, y) => {
                        await exec("baja/plate/views/well-color-palette-preferences.js", this.group_preferences)
                    },
                    move: () => {
                    },
                })

                if (this.hasSelectedWells()) {
                    m.push({
                        label: 'Set LABEL type for selected wells',
                        click: (x, y) => {

                            let selecedWells = this.getSelectedWellsInOrder()
                            for (let w of selecedWells) {
                                w.wellType = 'label'
                            }

                        },
                        move: () => {
                        },
                    })
                }

                m.push(
                    {
                        label: 'Main view',
                        click: async (x, y) => {
                            this.updateWellView(null)
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    });
                m.push(
                    {
                        label: 'Concentration',
                        click: async (x, y) => {
                            this.updateWellView('CONCENTRATION')
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    });
                m.push(
                    {
                        label: 'Group',
                        click: async (x, y) => {
                            this.updateWellView('GROUP')
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    });
                m.push(
                    {
                        label: 'Address',

                        click: async (x, y) => {

                            this.updateWellView('Address')
                            pt.wb(null)

                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Heatmap',
                        click: async (x, y) => {
                            let filtered = filterWells(this.wells, (well) => {
                                console.log(' well select ' + well.select)
                                return well.select
                            })
                            const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);
                            let twells = filtered.map(row => row.map(well => well ? well.deepCopy() : createDefaultWell(row, col)));
                            if (twells.length <= 0) {
                                infoPrompt("No wells are selected in this table ")
                                return;
                            }
                            let mvmax = getMaxDimensions(twells)
                            let newPlate = new Plate(this.name + '.sub', mvmax['maxCol'], mvmax['maxRow']);
                            newPlate.plateType = 'data'
                            newPlate.setWells(twells);
                            this.addChildPlate(newPlate)
                        },
                        move: () => {
                        },

                    });

                pt.menu = new Menu(m, pt.grid.Xwc(bx - 10), pt.grid.Ywc(by + 20))
                let t = {
                    id: 'plate-menu-connection',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,

                }
                t.draw = (grid, ctx) => {
                    if (pt.menu) {
                        this.textActive = false;
                        pt.menu.draw(ctx, grid)
                    }
                }
                t.mouseDownListener = (x, y) => {
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    this.textActive = false;

                    let mmx = pt.grid.Xwc(x);

                    let mmy = pt.grid.Ywc(y);
                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        clearMenu();
                    }
                }
                pt.wb(t)

            }

            showRows(start, stop) {
                this.row_vis_start = start;
                this.row_vis_stop = stop;
            }

            async createMinimizedMenu(bx, by, x, y, pt) {
                let m = [
                    {
                        label: 'Hide rows',
                        click: async (x, y) => {
                            this.showRows(this.grid.ymin, this.grid.ymin + 1)
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Top 10',
                        click: async (x, y) => {
                            this.showRows(0, 10)
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Bottom 10',
                        click: async (x, y) => {
                            this.showRows(this.grid.ymax - 10, this.grid.ymax)
                        },
                        move: () => {
                        },
                    },

                    {
                        label: 'Set rows...',
                        click: async (x, y) => {

                            let va = await prompt("Rows", ["Start row", "Stop row"], { "Start row": '', 'Stop row': '' }, 300, 450)
                            let sv = va['Start row']
                            let vv = va['Stop row']

                            try {
                                sv = parseInt(sv);
                                vv = parseInt(vv)
                                this.showRows(sv, vv)
                            } catch (exception) {
                                infoPrompt(" Please provide integer values ")
                                return;
                            }
                        },
                        move: () => {
                        },
                    },

                ]

                m.unshift({
                    label: 'Show all rows',
                    click: async (x, y) => {
                        this.showRows(-Infinity, Infinity)
                    },
                    move: () => {
                    },
                },
                )

                console.log('debubg');
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)

            }

            async createTopNavigation(bx, by, x, y, pt) {
                let AnimateGrid = await exec('flexigraph/animate-it.js')

                let m = [
                ]

                m.push({
                    label: 'View top 10',
                    click: async (x, y) => {

                        pt.pushGrid();
                        Animation.INTERUPT = true;
                        pt.setAspectRatio(0.5)
                        this.grid.rescale();
                        pt.grid.rescale();
                        let xii = this.grid.xi
                        let yii = this.grid.yi + this.getHeight();
                        let wii = this.getWidth()
                        let hii = this.grid.screenHeight(10)
                        let xdf = Math.abs((wii) / 5);
                        let ydf = Math.abs((hii) / 5);
                        let ymax = yii;
                        let ymin = yii - hii;
                        let xmax = xii + wii + xdf;
                        let xmin = xii - xdf;
                        let ag = new AnimateGrid(pt.grid);
                        await ag.animateTo(xmin, xmax, ymin, ymax);
                        this.textActive = false;
                        pt.wb(null)

                    },
                    move: () => {
                    },
                })

                m.push(
                    {
                        label: 'Bottom 10',
                        click: async (x, y) => {

                            pt.pushGrid();

                            Animation.INTERUPT = true;
                            pt.setAspectRatio(0.5)
                            this.grid.rescale();
                            pt.grid.rescale();
                            let xii = this.grid.xi
                            let yii = this.grid.yi + this.grid.screenHeight(10)
                            let wii = this.getWidth()
                            let hii = this.grid.screenHeight(10)
                            let xdf = Math.abs((wii) / 5);
                            let ydf = Math.abs((hii) / 5);
                            let ymax = yii;
                            let ymin = yii - hii;
                            let xmax = xii + wii + xdf;
                            let xmin = xii - xdf;
                            let ag = new AnimateGrid(pt.grid);
                            await ag.animateTo(xmin, xmax, ymin, ymax);

                            this.textActive = false;
                            pt.wb(null)

                        },
                        move: () => {
                        },
                    });

                for (let bm of this.bookmarks) {
                    m.push({
                        label: '' + bm.name,
                        click: async (x, y) => {
                            pt.pushGrid();
                            pt.grid = Object.assign(new MGrid(), bm.plateTrack);
                            pt.grid.rescale();
                            this.grid = Object.assign(new MGrid(), bm.plate);
                            this.grid.rescale();

                        },
                        move: () => {
                        },
                    })
                }

                m.push({
                    label: 'Bookmark...',
                    click: async (x, y) => {
                        pt.pushGrid();
                        let va = await prompt("Name", ["Name"], { "Name": 'mybookmark' }, 300, 300)
                        let n = va['Name']

                        let pg = (JSON.parse(JSON.stringify(this.grid)));
                        let ptg = (JSON.parse(JSON.stringify(pt.grid)));
                        let b = {
                            name: n,
                            plate: pg,
                            plateTrack: ptg
                        }
                        this.bookmarks.push(b);
                    },
                    move: () => {
                    },
                })

                pt.menu = new Menu(m, pt.grid.Xwc(bx - 10), pt.grid.Ywc(by + 20))
                let t = {
                    id: 'plate-menu-connection' + uuid(),
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu,
                    close: () => {
                        clearMenu();
                    }
                }
                t.draw = (grid, ctx) => {
                    if (pt.menu) {
                        pt.menu.draw(ctx, grid)
                        this.textActive = false;
                        this.text = ''
                    }
                }
                t.mouseDownListener = (x, y) => {
                    pt.grid.rescale();
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y + 20);
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        pt.menu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                        await pt.menu.mouseUp(pt.grid, mmx, mmy)
                        pt.wb(null)
                        clearMenu();

                    }

                }
                pt.wb(t)
            }

            findBounds() {

                let xmin = this.grid.xi;
                let xmax = this.grid.xi + Math.abs(this.getWidth());
                let ymin = this.grid.yi;
                let ymax = this.grid.yi + Math.abs(this.getHeight());

                for (let childPlate of this.plates) {
                    const childBounds = childPlate.findBounds();
                    xmin = Math.min(xmin, childBounds.xmin);
                    xmax = Math.max(xmax, childBounds.xmax);
                    ymin = Math.min(ymin, childBounds.ymin);
                    ymax = Math.max(ymax, childBounds.ymax);
                }

                return { xmin, xmax, ymin, ymax };
            }

            async button2Action(bx, by, x, y, pt) {
                let m = [
                ]
                let TableOps = await exec('baja/table/table-ops')
                let menuList = await TableOps.load(pt, this)
                m = m.concat(menuList)
                pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
            }
            async highlight1() {
            }
            async highligh2() {
            }

            async setMoveListeners(bx, by, x, y, pt) {

                pt.setMessage(" Move... ")

                let m = await exec('baja/plate/views/move-plate.js', pt, this, x, y)
                pt.wb({
                    id: 'override-move-plate',
                    priority: true,
                    mouseMoveListener: m.mouseMoveListener,
                    mouseUpListener: m.mouseUpListener,
                    mouseDownListener: m.mouseDownListener,
                    draw: m.draw,
                    menuManager: m.menuManager
                })
                this.highlightbutton = 'move';

            }

            setHeight(w) {
                this.grid.height = w;
            }
            getDefaultWidth(platetrack) {
                return (this.grid.xmax * platetrack.defaultWellWidthSc)
            }
            getDefaultHeight(platetrack) {
                return (this.grid.ymax * platetrack.defaultWellHeightSc)
            }
            rescaleDimensions(platetrack) {
                this.setWidth(this.getDefaultWidth(platetrack))
                this.setHeight(this.getDefaultHeight(platetrack))
            }

            toValueFormulaJSON(options = {}) {

                const asMatrix = options.asMatrix === true;
                const includeEmpty = options.includeEmpty === true;
                const includeMeta = options.includeMeta !== false;

                const meta = includeMeta ? { name: this.name, cols: this.grid?.xmax, rows: this.grid?.ymax } : null;

                const readWell = (w) => {
                    if (!w) return null;
                    const value =
                        (typeof w.getValue === 'function' ? w.getValue() : w.value) ?? null;
                    const formula =
                        (typeof w.getFormula === 'function' ? w.getFormula() : w.formula) ?? null;

                    if (!includeEmpty) {
                        const emptyValue = value === null || value === '' || typeof value === 'undefined';
                        const emptyFormula = formula === null || formula === '' || typeof formula === 'undefined';
                        if (emptyValue && emptyFormula) return null;
                    }
                    return { value, formula };
                };

                if (asMatrix) {

                    const matrix = [];
                    const cols = Array.isArray(this.wells) ? this.wells.length : 0;
                    for (let x = 0; x < cols; x++) {
                        const colArr = [];
                        const col = this.wells[x] || [];
                        const rows = Array.isArray(col) ? col.length : 0;
                        for (let y = 0; y < rows; y++) {
                            const entry = readWell(col[y]);
                            colArr.push(entry);
                        }
                        matrix.push(colArr);
                    }
                    return includeMeta ? { ...meta, wells: matrix } : matrix;
                }

                const out = [];
                const cols = Array.isArray(this.wells) ? this.wells.length : 0;
                for (let x = 0; x < cols; x++) {
                    const col = this.wells[x] || [];
                    const rows = Array.isArray(col) ? col.length : 0;
                    for (let y = 0; y < rows; y++) {
                        const entry = readWell(col[y]);
                        if (entry) out.push({ x, y, ...entry });
                    }
                }
                return includeMeta ? { ...meta, wells: out } : out;
            }

            static buildPlateFromJSON(jsonData) {

                let plate = new Plate(jsonData.name, jsonData.grid.xmax, jsonData.grid.ymax);
                plate.uid = jsonData.uid;
                plate.width = jsonData.width;
                plate.height = jsonData.height;
                plate.parent_reference = jsonData.parent_reference;
                plate.column_widths = jsonData.column_widths;
                plate.visible = jsonData.visible;
                plate.plateType = jsonData.plateType;
                plate.subType = jsonData.subType;
                plate.grid = Object.assign(new MGrid(), jsonData.grid);
                plate.attr__RowAddRemoveButtons = jsonData.attr__RowAddRemoveButtons

                plate.formula = jsonData.formula || {};

                plate.input_to = Array.isArray(jsonData.input_to) ? jsonData.input_to : [];
                plate.tag_formula = Array.isArray(jsonData.tag_formula) ? jsonData.tag_formula : [];

                plate.visible_cell_aspect_ratio_max = jsonData.visible_cell_aspect_ratio_max;
                plate.visible_cell_aspect_ratio_min = jsonData.visible_cell_aspect_ratio_min;
                plate.attr__ShowTableName = jsonData.attr__ShowTableName
                plate.attr__displayNumberValues = jsonData.attr__displayNumberValues
                plate.group_preferences = jsonData.group_preferences;
                if (Array.isArray(jsonData.wells)) {
                    plate.wells = jsonData.wells.map((row, x) => {
                        return row.map((wellData, y) => {
                            if (wellData) {

                                let well = new GenericWell(wellData.name || 'unknown');

                                well.attr__showGroups = wellData.attr__showGroups || null;
                                well.attr__showBorder = wellData.attr__showBorder || null;
                                well.score = wellData.score || null;
                                well.skin_type = wellData.skin_type || null;
                                well.skin_transient = wellData.skin_transient || null;
                                well.obj = wellData.obj || null;
                                well.formula = wellData.formula || null;
                                well.concentration = wellData.concentration || null;
                                well.wellType = wellData.wellType || null;
                                well.select = wellData.select || false;
                                well.structure = wellData.structure || null;
                                well.font = wellData.font || null;

                                if (wellData.icon) {
                                    well.icon = Icon.buildFromJSON(wellData.icon)
                                }

                                well.properties = wellData.properties || {};

                                if (wellData.group) {

                                    if (!well.group) {
                                        well.group = {};
                                    }

                                    for (let groupKey in wellData.group) {
                                        if (wellData.group.hasOwnProperty(groupKey)) {
                                            if (!well.group[groupKey]) {
                                                well.group[groupKey] = [];
                                            }
                                            well.group[groupKey] = well.group[groupKey].concat(wellData.group[groupKey]);
                                        }
                                    }
                                }

                                well.color = wellData.color || null;
                                well.value = wellData.value;
                                well.uid = wellData.uid || null;
                                well.source = wellData.source || null;
                                well.compoundId = wellData.compoundId || null;
                                well.idt = wellData.idt || null;
                                well.props = wellData.props || null;
                                well.dye = wellData.dye || null;
                                well.position = wellData.position || null;

                                well.slope = wellData.slope || null;
                                well.intercept = wellData.intercept || null;
                                well.rSquared = wellData.rSquared || null;

                                return well;
                            } else {
                                return null;
                            }
                        });
                    });
                }

                if (Array.isArray(jsonData.plates)) {
                    plate.plates = jsonData.plates.map(plateData => Plate.buildPlateFromJSON(plateData));
                }

                if (Array.isArray(jsonData.bookmarks)) {
                    plate.bookmarks = jsonData.bookmarks.map(bookmarkData => {
                        return {
                            name: bookmarkData.name,
                            plate: bookmarkData.plate ? Object.assign(new MGrid(), bookmarkData.plate) : {},
                            plateTrack: bookmarkData.plateTrack ? Object.assign(new MGrid(), bookmarkData.plateTrack) : {}
                        };
                    });
                }

                return plate;
            }

            transposeWells(wells) {
                let rows = wells.length;
                let cols = wells[0].length;
                let transposed = new Array(cols).fill(null).map(() => new Array(rows));
                for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < cols; col++) {

                        transposed[col][row] = wells[row][col];
                    }
                }

                return transposed;
            }
            getPlateWithUID(uuid) {
                if (this.uid === uuid) {
                    return this;
                }
                for (let p of this.plates) {
                    return p.getPlateWithUID(uuid)
                }
            }

            toJSON(circleTracker = [], depth) {
                if (depth > 200) {
                    return { message: "Max depth reached" };
                }
                return {
                    uid: this.uid,
                    name: this.name,
                    selected: this.selected,
                    parent_reference: this.parent_reference,
                    visible: this.visible,
                    plateType: 'transparent',
                    subType: this.subType,
                    attr__RowAddRemoveButtons: this.attr__RowAddRemoveButtons,
                    attr__ShowTableName: this.attr__ShowTableName,
                    attr__displayNumberValues: this.attr__displayNumberValues,
                    group_preferences: this.group_preferences,
                    column_widths: this.column_widths,
                    visible_cell_aspect_ratio_max: this.visible_cell_aspect_ratio_max,
                    visible_cell_aspect_ratio_min: this.visible_cell_aspect_ratio_min,
                    grid: {
                        xi: this.grid.xi,
                        yi: this.grid.yi,
                        width: this.grid.width,
                        height: this.grid.height,
                        xmin: this.grid.xmin,
                        xmax: this.grid.xmax,
                        ymin: this.grid.ymin,
                        ymax: this.grid.ymax,
                        xinset: this.grid.xinset,
                        yinset: this.grid.yinset,
                    },
                    wells: this.wells.map(row => row.map(well => {
                        if (well) {
                            return {
                                name: well.name || 'unknown',
                                score: well.score || null,
                                uid: well.uid || null,
                                obj: well.obj || null,
                                font: well.font || null,
                                concentration: well.concentration || null,
                                wellType: well.wellType || null,
                                select: well.select || false,
                                structure: well.structure || null,
                                group: well.group || null,
                                color: well.color || null,
                                value: well.value,
                                source: well.source || null,
                                compoundId: well.compoundId || null,
                                idt: well.idt || null,
                                props: well.props || null,
                                dye: well.dye || null,
                                attr__showBorder: well.attr__showBorder || null,
                                attr__showGroups: well.attr__showGroups || null,
                                position: well.position || null,
                                properties: well.properties || {},
                                icon: well.icon && typeof well.icon.toJSON === 'function'
                                    ? well.icon.toJSON()
                                    : well.icon ?? null,
                                skin_type: well.skin_type,

                                slope: well.slope || null,
                                intercept: well.intercept || null,
                                rSquared: well.rSquared || null
                            };
                        } else {
                            return null;
                        }
                    })),
                    plates: this.plates.map(plate => plate.toJSON(circleTracker, depth + 1)),

                    bookmarks: this.bookmarks.map(bookmark => ({
                        name: bookmark.name,
                        plate: bookmark.plate || {},
                        plateTrack: bookmark.plateTrack || {}
                    }))

                };
            }

            getColumns() {
                if (this.wells)
                    return this.wells[0].length;
                else
                    return 0
            }
            getColumnIndex(well) {
                return this.getColIndex(well)
            }

            getGroups() {
                let g = []
                for (let r of this.wells) {
                    for (let w of r) {
                        if (w.group != null && w.group.length > 0) {
                            if (g.indexOf(w.group.toString()) < 0) {
                                g.push(w.group.toString())
                            }
                        }
                    }
                }
                return g;
            }

            getGroup(name) {
                if (name == null || name.length <= 0) {
                    return;
                }

                let g = []

                for (let r of this.wells) {
                    for (let w of r) {
                        if (w.group != null && w.group.length > 0 && w.group.toLowerCase() === name.toLowerCase()) {
                            if (g.indexOf(w) < 0) {
                                g.push(w)
                            }
                        }
                    }
                }
                return g;
            }

            getPlateWithUID(uid) {
                if (this.uid === uid) {
                    return this;
                }
                else {
                    for (let p of this.plates) {
                        let vp = p.getPlateWithUID(uid);
                        if (vp) {
                            return vp;
                        }
                    }
                }
            }

            setVisible(va) {
                this.visible = va;

                if (!this.visible) {
                    let xmax = 1;
                    let ymax = 1;
                    this.grid.rescale();

                }

            }

            setCompoundId(well, value) {
                for (let row of this.wells) {
                    for (let col of row) {
                        if (col.name.toLowerCase() === well.toLowerCase()) {
                            col.compoundId = value;
                        }
                    }
                }
            }

            setValueByIndex(x, y, value) {

                if (typeof x === "string" && !isNaN(x)) x = parseInt(x, 10);
                if (typeof y === "string" && !isNaN(y)) y = parseInt(y, 10);

                if (x === "first") {
                    x = 0;
                } else if (x === "last") {
                    x = this.wells.length - 1;
                }

                if (y === "first") {
                    y = 0;
                } else if (y === "last") {
                    if (this.wells[x] && this.wells[x].length > 0) {
                        y = this.wells[x].length - 1;
                    } else {
                        console.log("Invalid operation: No columns available in row " + x);
                        return;
                    }
                }

                if (!Number.isInteger(x) || !Number.isInteger(y)) {
                    console.log("Invalid index values: x = " + x + ", y = " + y);
                    return;
                }

                if (x < 0 || x >= this.wells.length) {
                    console.log("Invalid column index: " + x);
                    return;
                }

                if (y < 0 || y >= (this.wells[x] ? this.wells[x].length : 0)) {
                    console.log("Invalid row index: " + y);
                    return;
                }

                if (!this.wells[x]) {
                    console.log("Attempting to add to the table with greater index than available columns. Columns: " + x);
                    return;
                }

                if (!this.wells[x][y]) {
                    console.log("Attempting to add to the table with greater index than available rows. Rows: " + y);
                    return;
                }

                pushHistory(HM(this.wells[x][y]));
                this.wells[x][y].setValue(value);
            }

            setValuesInOrderAndOverwrite(arr, fixedCol = null, fixedRow = null) {

                if (fixedRow !== null && fixedCol !== null) {
                    throw new Error("Cannot fix both row and column.");
                }
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
                let numRows = Math.floor(this.grid.ymax);
                let numCols = Math.floor(this.grid.xmax);
                if (fixedRow === null && fixedCol === null) {
                    if (arr && arr.length === 1) {
                        let jaso = parseJsonArray(arr[0])
                        try {
                            let index = 0;
                            for (let col = 0; col < numCols; col++) {
                                for (let row = 0; row < numRows; row++) {
                                    this.wells[col][row] = Object.assign(new GenericWell(), jaso[index]);
                                    index++;
                                }
                            }

                        } catch (exception) {

                            console.log(" failed to lado the data")

                        }
                    } else {

                        let index = 0;
                        for (let col = 0; col < numCols; col++) {
                            for (let row = 0; row < numRows; row++) {
                                if (index < arr.length) {
                                    this.wells[col][row].setValue(arr[index]);
                                    index++;
                                }
                            }
                        }
                    }
                }

                else if (fixedRow !== null) {
                    if (fixedRow >= numRows) {
                        throw new Error("Fixed row index is out of bounds.");
                    }

                    if (arr && arr.length === 1) {
                        let jaso = parseJsonArray(arr[0])
                        try {
                            let index = 0;
                            for (let col = 0; col < numCols; col++) {
                                this.wells[col][fixedRow] = Object.assign(new GenericWell(), jaso[index++]);
                            }

                        } catch (exception) {

                            console.log(" failed to lado the data")

                        }
                    } else {

                        for (let col = 0; col < numCols; col++) {
                            if (col < arr.length) {
                                this.wells[col][fixedRow].setValue(arr[col]);
                            }
                        }
                    }
                }
                else if (fixedCol !== null) {
                    if (fixedCol >= numCols) {
                        throw new Error("Fixed column index is out of bounds.");
                    }
                    if (arr && arr.length === 1) {
                        let jaso = parseJsonArray(arr[0])
                        try {
                            let index = 0;
                            for (let col = 0; col < numCols; col++) {
                                for (let row = 0; row < numRows; row++) {

                                    let ob = jaso[index]
                                    this.wells[fixedCol][row] = Object.assign(new GenericWell(), jaso[index++]);
                                }
                            }

                        } catch (exception) {

                            console.log(" failed to lado the data")

                        }
                    } else {

                        for (let row = 0; row < numRows; row++) {
                            if (row < arr.length) {
                                this.wells[fixedCol][row].setValue(arr[row]);
                            }
                        }
                    }
                }
            }

            setValuesInOrderAndOverwriteForSelected(arr, fixedRow = null, fixedCol = null) {
                if (fixedRow !== null && fixedCol !== null) {
                    throw new Error("Cannot fix both row and column.");
                }

                let numRows = Math.floor(this.grid.xmax);
                let numCols = Math.floor(this.grid.ymax);
                if (fixedRow === null && fixedCol === null) {
                    let index = 0;
                    for (let col = 0; col < numCols; col++) {
                        for (let row = 0; row < numRows; row++) {
                            if (index < arr.length && this.wells[row][col].select) {
                                this.wells[row][col].name = arr[index];
                                this.wells[row][col].position = arr[index];

                                index++;
                            }
                        }
                    }
                }

                else if (fixedRow !== null) {
                    if (fixedRow >= numRows) {
                        throw new Error("Fixed row index is out of bounds.");
                    }
                    let index = 0;
                    for (let col = 0; col < numCols; col++) {
                        if (col < arr.length && this.wells[fixedRow][col].select) {
                            this.wells[fixedRow][col].position = arr[index];
                            this.wells[fixedRow][col].name = arr[index];
                            index++;
                        }
                    }
                }
                else if (fixedCol !== null) {
                    if (fixedCol >= numCols) {
                        throw new Error("Fixed column index is out of bounds.");
                    }
                    let index = 0;
                    for (let row = 0; row < numRows; row++) {
                        if (row < arr.length && this.wells[row][fixedCol].select) {
                            this.wells[row][fixedCol].position = arr[index];
                            this.wells[row][fixedCol].name = arr[index];
                            index++
                        }
                    }
                }
            }

            setValue(well, value) {

                for (let row of this.wells) {
                    for (let col of row) {

                        if (col.name && col.name.toLowerCase() === well.toLowerCase()) {

                            if (typeof value === 'number') {
                                col.setValue(Number(value));
                            } else {
                                col.setValue(value);
                            }
                        }
                    }
                }
            }

            getWellRowIndex(well) {
                for (let xi = 0; xi < this.wells.length; xi++) {
                    for (let yi = 0; yi < this.wells[xi].length; yi++) {
                        if (this.wells[xi][yi].position != null)
                            if (this.wells[xi][yi].uid === well.uid) {
                                let colIndex = xi;
                                let rowIndex = yi;
                                return { colIndex, rowIndex }
                            }
                    }
                }
            }

            getWellInRange(xx, xy, ww, hh) {
                this.grid.rescale();
                let x = Math.floor(this.grid.Xwc(xx - this.grid.xi * 2))
                let y = Math.floor(this.grid.Ywc(xy - this.grid.yi * 2))
                let w = Math.ceil(this.grid.worldWidth(ww));
                let h = Math.ceil(this.grid.worldHeight(hh));

                if (x >= 0 && x < this.wells.length && y >= 0 && y < this.wells[0].length) {
                    for (let xi = x; xi < (x + w); xi++) {
                        for (let yi = y; yi < (y + h); yi++) {
                            if (this.wells[xi] != null && this.wells[xi][yi] != null) {
                                this.wells[xi][yi].select = true;

                                if (this.selectedWells.indexOf(this.wells[xi][yi]) < 0) {
                                    this.selectedWells.push(this.wells[xi][yi])
                                }
                            }

                        }
                    }
                }
            }

            hasSelectedWells() {
                return this.wells.some(row => row.some(col => col?.select));

            }

            getWellWithObj(obj) {
                let foundWell = null;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.obj && well.obj === obj) {
                            if (foundWell !== null) {
                                throw new AmbiguousQueryException("Multiple wells found with the 'obj' attribute.");
                            }
                            foundWell = well;
                        }
                    }
                }
                return foundWell ? foundWell.value : null;
            }

            getWellsByGroup(groupName) {
                let filteredWells = [];

                if (!groupName) {
                    for (let x = 0; x < this.wells.length; x++) {
                        for (let y = 0; y < this.wells[x].length; y++) {
                            let well = this.wells[x][y];

                            if (well && (!well.group || Object.keys(well.group).length === 0)) {
                                filteredWells.push(well);
                            }
                        }
                    }
                } else {

                    for (let x = 0; x < this.wells.length; x++) {
                        for (let y = 0; y < this.wells[x].length; y++) {
                            let well = this.wells[x][y];

                            if (well && well.group && well.group[groupName]) {
                                filteredWells.push(well);
                            }
                        }
                    }
                }

                return filteredWells;
            }

            getWell(xx, yy, pt) {
                try {
                    let cellX = this.grid.xmin;
                    let foundX = null;
                    const mouseX = pt.grid.X(xx);
                    const mouseY = pt.grid.Y(yy);
                    let currentXOffset = cellX;
                    const yindex = Math.floor(this.grid.Ywc(yy - this.grid.yi * 2));

                    for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                        const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                        const scrwidth = pt.grid.screenWidth(this.grid.screenWidth(cellWidth));
                        let cellX = pt.grid.X(this.grid.X(currentXOffset));

                        if (mouseX >= cellX && mouseX <= cellX + scrwidth) {
                            foundX = x;
                            const p_y = yindex;

                            if (
                                Array.isArray(this.wells) &&
                                Array.isArray(this.wells[foundX]) &&
                                this.wells[foundX][p_y] != null
                            ) {
                                return this.wells[foundX][p_y];
                            } else {
                                return null;
                            }
                        }

                        currentXOffset += cellWidth + (1 - COL_OFFSET);
                    }

                    return null;
                } catch (e) {
                    return null;
                }
            }

            getWellByIndex(xindex, yindex) {

                if (xindex > this.wells.length || !this.wells[xindex] || yindex > this.wells[xindex].length)
                    return this.wells[this.wells.length - 1];
                return this.wells[xindex][yindex];
            }

            selectWell(xx, xy, pt) {

                let relX = xx - this.grid.xi * 2;
                let relY = xy - this.grid.yi * 2;

                let currentX = 0;
                let x = -1;
                for (let i = 0; i < this.column_widths.length; i++) {
                    let cellWidth = this.column_widths[i] ?? COL_OFFSET;
                    let scrWidth = this.grid.screenWidth(cellWidth);

                    if (relX >= currentX && relX < currentX + scrWidth) {
                        x = i;
                        break;
                    }
                    currentX += scrWidth + this.grid.screenWidth((1 - COL_OFFSET));
                }

                if (x === -1) return null;

                let y = Math.floor(this.grid.Ywc(relY));

                if (this.wells[x] != null && this.wells[x][y] != null) {
                    if (this.selectedWells.indexOf(this.wells[x][y]) < 0) {
                        this.selectedWells.push(this.wells[x][y]);
                    }
                    return this.wells[x][y];
                }

                return null;
            }

            setConcentration(well, con) {
                for (let row of this.wells) {
                    for (let col of row) {
                        if (col)
                            if (col.name.toLowerCase() === well.toLowerCase()) {
                                col.concentration = con;
                            }
                    }
                }
            }

            deselectAll() {
                this.__highlight_column_width = false;
                this.__highlight_column = false;
                this.deselectPlate();
            }
            deselect() {
                this.deselectAll();
            }
            deselectPlate() {
                this.deselectPlateRoot();
            }

            async gotoWell(id, pt) {
                let rows = this.wells[0].length;
                let cols = this.wells.length;
                for (let col = 0; col < cols; col++) {
                    for (let row = 0; row < rows; row++) {
                        let w = this.wells[col][row]
                        if (w) {
                            if (w.uid && w.uid === id) {

                                this.textActive = true;
                                textStyle = 'data'

                                let ch = 25;
                                let cw = 100;
                                let pixh = pt.grid.height;
                                let pixw = pt.grid.width;
                                let ycc = pixh / ch;
                                let xcc = pixw / cw;

                                let ph = this.grid.screenHeight(ycc)
                                let pw = this.grid.screenWidth(xcc)
                                let xi = this.grid.X(col)
                                let yi = this.grid.Y(row);

                                await pt.zoomto(xi - (pw), yi - (ph + ph / 2), pw + (pw), ph + ph)
                                this.editWell(w, pt)

                            }

                        }
                    }
                }
            }

            async seelctInverse() {
                let rows = this.wells[0].length;
                let cols = this.wells.length;
                for (let col = 0; col < cols; col++) {
                    for (let row = 0; row < rows; row++) {
                        let w = this.wells[col][row]
                        if (w) {
                            w.select = !w.select
                        }
                    }
                }
            }

            pushAnyPreviousHistory() {
                if (!this.wells || this.wells.length == 0) {
                    return;
                }
                let rows = this.wells.length;
                let cols = this.wells[0].length;

                let dirtyCount = 0;
                for (let row = 0; row < rows; row++) {
                    for (let col = 0; col < cols; col++) {
                        let w = this.wells[row][col];
                        if (w && (w.__dirty || w.__previousValue)) {
                            dirtyCount++;
                        }
                    }
                }
                if (dirtyCount <= 3) {
                    for (let row = 0; row < rows; row++) {
                        for (let col = 0; col < cols; col++) {
                            let w = this.wells[row][col];
                            if (w && (w.__dirty || w.__previousValue)) {
                                pushHistory(HM(w, w.__previousValue));
                                w.resetState();
                            }
                        }
                    }
                } else {
                    let hs = []
                    for (let row = 0; row < rows; row++) {
                        for (let col = 0; col < cols; col++) {
                            let w = this.wells[row][col];
                            if (w && (w.__dirty || w.__previousValue)) {
                                hs.push(HM(w, w.__previousValue));
                                w.resetState();
                            }
                        }
                    }

                }
            }

            deselectPlateRoot() {

                this.___drawfish = false;
                this.pushAnyPreviousHistory();
                textStyle = null;
                this.menu = null;
                md = false;
                this.highlightbutton = null;
                this.resizeable = false;

                LJScript.add(this.name, 'deselect')
                this.selected = false;
                this.pwx = null;
                this.pwy = null;
                this.textBoxX = null;
                this.textBoxY = null;
                this.textActive = false;
                this.deselectWells();
                for (let p of this.plates) {
                    p.deselectPlateRoot();
                }
            }
            deselectWells() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            well.select = false;
                            well.__highlight__ = false;
                        }
                    }
                }
            }

            setColorAll(color) {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            well.color = color;
                        }
                    }
                }
            }

            setColorSelected(color) {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select === true) {
                            well.color = color;
                        }
                    }
                }
            }

            selectAllWells() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            well.select = true;
                            well.__highlight__ = true;
                        }
                    }
                }
            }
            selectAll() {
                this.selectAllWells();
            }
            deleteSelectedWellValues() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            if (well.select)
                                well.setValue(null);

                        } else {
                            this.wells[x][y] = createDefaultWell(y, x)
                            this.wells[x][y].selectIt();
                        }
                    }
                }
            }

            removeFullySelectedRows() {
                for (let rowIndex = this.wells[0].length - 1; rowIndex >= 0; rowIndex--) {
                    const isRowSelected = this.wells.every(column => column[rowIndex] && column[rowIndex].select);
                    if (isRowSelected) {
                        this.removeRow(rowIndex);
                    }
                }
                this.fitRowsAndColumns();
            }
            removeFullySelectedColumns() {
                for (let colIndex = this.wells.length - 1; colIndex >= 0; colIndex--) {
                    const isColumnSelected = this.wells[colIndex].every(cell => cell && cell.select);
                    if (isColumnSelected) {
                        this.wells.splice(colIndex, 1);
                    }
                }
                this.fitRowsAndColumns();
            }

            setName(name) {
                this.name = name;
            }
            setType(plateType) {
                this.plateType = plateType;
            }
            setStructure(index, structure) {
                let t = index;
                let y = Math.floor(t / 12);
                let ti = t - y * 12;
                let x = Math.floor(ti)
                if (this.wells[x][y] != null) {
                    this.wells[x][y].structure = structure
                }
            }

            getAlph(i) {
                let char = String.fromCharCode(65 + i);
                return char;
            }

            clearErrors() {
                for (let rowIndex = 0; rowIndex < this.wells.length; rowIndex++) {
                    for (let colIndex = 0; colIndex < this.wells[rowIndex].length; colIndex++) {
                        let well = this.wells[rowIndex][colIndex];
                        if (well && well.clearError)
                            well.clearError();
                    }
                }
            }

            inside(grid, x, y, ignore_menu_and_textwindow) {
                this.highlightbutton = null;
                if (!ignore_menu_and_textwindow) {
                    if (this.menu != null || this.textActive) {
                        return true;
                    }
                }
                this.grid.rescale();
                let mouseX = grid.X(x);
                let mouseY = grid.Y(y);
                let screen_width = grid.screenWidth(this.getWidth());
                let screen_height = grid.screenHeight(this.getHeight())
                let sy = grid.Y(this.grid.yi);
                let sx = grid.X(this.grid.xi);
                let index = 0;

                let b = this.button_set;

                let tw = ((grid.worldWidth(30 * b.length)))
                let init = grid.X(this.grid.xi + this.getWidth() - tw);
                if (init < 0) {
                    init = grid.Xwc(0)
                }

                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = grid.Y(this.grid.yi + this.getHeight() + grid.worldHeight(this.margin.top));
                    if (buttonY < 0) {
                        buttonY = 10;
                    }
                    index++;
                    let bbw = bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + bbw &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + button.height
                    ) {
                        return true;
                    }
                }
                if (this.isInsideBottomButtons(grid, mouseX, mouseY))
                    return true;

                if (__pt__) {
                    if (this.inButtons(mouseX, mouseY, __pt__)) {
                        return true;
                    }
                }

                if ((sy + screen_height) < 0) {
                    return false;
                }
                if (sx > grid.width) {
                    return false;
                }

                if (init < 0) {
                    init = grid.Xwc(0)
                }
                index = 0;
                for (let button of this.button_set) {
                    let buttonX = init + index * bsize;
                    let buttonY = grid.Y(this.grid.yi + this.getHeight() + grid.worldHeight(this.margin.top));
                    if (buttonY < 0) {
                        buttonY = 10;
                    }
                    index++;
                    let bbw = bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + bbw &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + button.height
                    ) {
                        return true;
                    }
                }

                let scy = grid.Y(y)
                let scx = grid.X(x)
                let _scy = grid.Y(this.grid.yi);
                let _sc = grid.X(this.grid.xi);
                if (this.textActive && this.textBoxX < _sc)
                    _sc = this.textBoxX

                if (scx > _sc && scx < _sc + screen_width) {
                    if (scy < _scy &&
                        scy > _scy - screen_height - 30) {
                        return true;
                    }
                }

                return false;
            }
            getMenu(x, y, graph) {

            }

            mouseDown(grid, x, y) {
                let scy = grid.Y(y)
                let screen_height = grid.screenHeight(this.getHeight());

                let xsc = grid.X(x)

                if (this.menu_selected) {
                    if (xsc > grid.X(this.menu.x) - 10 && xsc < (grid.X(this.grid.xi) + grid.screenWidth(this.getWidth()) + this.menu.menu_width) &&
                        scy >= grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + this.menu.menu_height) {
                        this.menu.mouseDown(grid, x, y)
                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                } else {
                    this.menu_selected
                }
            }

            mouseOver(grid, x, y) {
                let scy = grid.Y(y)

                if (!this.menu_selected) {
                    if (x > this.grid.xi && x < (this.grid.xi + this.getWidth()) &&
                        scy > grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + 10) {
                        this.menu = this.getMenu(x, y, grid);
                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                } else {
                    let xsc = grid.X(x)
                    if (xsc > grid.X(this.menu.x) - 10 && xsc < (grid.X(this.grid.xi) + grid.screenWidth(this.getWidth()) + this.menu.menu_width) &&
                        scy >= grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + this.menu.menu_height) {
                        this.menu = this.getMenu(x, grid);
                        this.menu.mouseOver(grid, x, y)

                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                }
            }

            selectIt(pt) {
                if (!this.selected) {
                    this.selected = true;
                    this.clk_drag(pt)
                }
            }

            closeMenu() {
                this.menu = null;
            }

            select(grid, x, y) {

                let scy = grid.Y(y)

                if (x > this.grid.xi && x < (this.grid.xi + this.getWidth()) &&
                    scy > grid.Y(this.grid.yi) &&
                    scy < grid.Y(this.grid.yi) + 20) {
                    this.menu_selected = true;
                } else {
                    this.menu_selected = false;
                }
            }

            addChildPlate(p) {
                p.grid.xi = 0;
                p.grid.yi = this.grid.yi - 2;
                p.grid.width = 1;
                p.grid.height = 1;
                this.plates.push(p);
            }

            getXMin(xmin) {
                if (xmin === undefined) {
                    xmin = this.grid.xi;
                }
                if (this.grid.xi < xmin) {
                    xmin = this.grid.xi;
                }
                for (let p of this.plates) {
                    xmin = p.getXMin(xmin)
                }
                return xmin;
            }
            getXMax(xmax) {
                let _xmax = this.grid.xi + Math.abs(this.getWidth());
                if (xmax === undefined) {
                    xmax = _xmax;
                }
                if ((_xmax) > xmax) {
                    xmax = _xmax;
                }
                for (let p of this.plates) {
                    xmax = p.getXMax(xmax)
                }
                return xmax;
            }
            getYMin(ymin) {
                if (!ymin) {
                    ymin = this.grid.yi;
                } else
                    if (this.grid.yi < ymin) {
                        ymin = this.grid.yi;
                    }
                for (let p of this.plates) {
                    ymin = p.getYMin(ymin)
                }
                return ymin;
            }
            getYMax(ymax) {
                let _ymax = this.grid.yi + Math.abs(this.getHeight());
                if (ymax === undefined) {
                    ymax = _ymax;
                }
                if ((_ymax) > ymax) {
                    ymax = _ymax;
                }
                for (let p of this.plates) {
                    ymax = p.getYMax(ymax)
                }
                return ymax;
            }

            removePlate(plate) {
                let index = this.plates.indexOf(plate);
                if (index >= 0) {
                    this.plates.splice(index, 1)
                }
            }

            adjustY(value) {
                this.grid.yi = value;
                for (let p of this.plates) {
                    p.adjustY(this.grid.yi - 2)
                }
            }

            getNumberOfColumns() {

                if (this.wells && this.wells.length > 0) {
                    return this.wells.length;
                } else {
                    return 0;
                }
            }
            getNumberOfRows() {
                let maxRows = 0;

                this.wells.forEach(column => {
                    if (column && column.length > maxRows) {
                        maxRows = column.length;
                    }
                });

                return maxRows;
            }

            resizeToFitWithinSquare() {
                const maxDimension = 1;
                let aspectRatio = this.aspect_ratio;
                let newWidth, newHeight;
                if (aspectRatio > 1) {
                    this.w = maxDimension;
                    this.h = maxDimension / aspectRatio;
                } else {
                    this.h = maxDimension;
                    this.w = maxDimension * aspectRatio;
                }
            }

            find_aspect_ratio(graph) {
                let w = 0;
                let h = 0;
                let numberOfColumns = this.getNumberOfColumns();
                if (numberOfColumns > 0) {
                    w = numberOfColumns * graph.worldWidth(100);
                }
                let numberOfRows = this.getNumberOfRows();
                if (numberOfRows > 0) {
                    h = numberOfRows * graph.worldHeight(35);
                }
                this.aspect_ratio = w / h
            }

            addScrollbar(graph, ctx) {

                const totalHeight = graph.screenHeight(1);

                const scrollbarWidth = graph.screenWidth(0.02);
                const trackColor = "darkGray";
                const handleColor = "cyan";
                const fix_height_sc = 200;
                const visibleHeight = graph.worldHeight(fix_height_sc);
                const handleHeight = (visibleHeight / totalHeight) * (this.grid.ymax - this.grid.ymin);
                const handlePosition = (this.grid.ymax - this.grid.yi - visibleHeight) / totalHeight * (this.grid.ymax - this.grid.ymin);
                const trackHeight = graph.screenHeight(1);
                let scx = this.grid.xi;
                ctx.fillStyle = trackColor;
                ctx.fillRect(graph.X(this.grid.xi) - this.grid.screenWidth(scrollbarWidth) - 5, 10, scrollbarWidth, trackHeight);
                ctx.fillStyle = handleColor;
                ctx.fillRect(graph.X(this.grid.xi) - this.grid.screenWidth(scrollbarWidth), this.grid.yi, scrollbarWidth, totalHeight)

            }

            setWells(wells) {

                this.wells = wells;

                for (let x = 0; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymax - 1; y >= 0; y--) {

                        if (this.wells[x])
                            if (this.wells[x][this.grid.ymax - y - 1] == null) {
                                this.wells[x][this.grid.ymax - y - 1] = new GenericWell(
                                    this.getAlph(this.grid.ymax - y - 1) + (1 + x)
                                );
                            }
                    }
                }

            }

            adjust(x, i) {
                if (this.grid.yi === i) {
                    this.grid.xi = x;
                    x += this.getWidth();
                }
                for (let p of this.plates) {
                    x += p.adjust(x, i)
                }
                return x;
            }

            getX() {
                return this.grid.xi + this.getWidth() / 2;
            }
            getY() {
                return this.grid.yi;
            }

            getPlate(scx, scy, grid) {

                if (this.inside(grid, scx, scy)) {
                    return this;
                }
                for (let f of this.plates) {
                    let pl = f.getPlate(scx, scy, grid);
                    if (pl) {
                        return pl;
                    }
                }
                return null;
            }

            drawRoundedRectShadow(ctx, x, y, width, height, radius) {
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + width - radius, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                ctx.lineTo(x + width, y + height - radius);
                ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                ctx.lineTo(x + radius, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fill();
            }

            drawRoundedRect(ctx, x, y, width, height, radius) {

                if (x <= 0) {
                }

                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + width - radius, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                ctx.lineTo(x + width, y + height - radius);
                ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                ctx.lineTo(x + radius, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
            }

            drawTextBoxWithCursor(ctx, text, cursorPos, x, y, width, height, isSelected, style, selected_well) {
                let styles = {
                    data: {
                        bgColor: 'lightCyan',
                        borderColor: 'purple',
                        textColor: 'yellow',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    },
                    search: {
                        bgColor: isSelected ? 'rgba(255,255,150,0.9)' : 'rgba(255,255,100,0.9)',
                        borderColor: isSelected ? '#ffcc00' : '#999999',
                        textColor: isSelected ? '#333333' : '#888888',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    }
                };
                if (style === 'search') {

                    let chosenStyle = styles[style] || styles.data;
                    console.log('debubg');

                    let bgColor = chosenStyle.bgColor;
                    let borderColor = chosenStyle.borderColor;
                    let textColor = chosenStyle.textColor;
                    let cursorColor = chosenStyle.cursorColor;

                    let radius = 10;
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 5;
                    ctx.shadowOffsetY = 5;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillStyle = bgColor;

                    ctx.font = '16px Arial';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    let textWidth = ctx.measureText(text).width;

                    if (textWidth + 20 > width) {
                        width = textWidth + 20;
                    }

                    radius = 10;

                    this.
                        RoundedRect(ctx, x, y, width, height, radius);

                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                    ctx.strokeStyle = borderColor;
                    ctx.stroke();

                    ctx.fillStyle = textColor;

                    let textX = x + 10;
                    let textY = y + height / 2;

                    let canvasWidth = ctx.canvas.width;
                    let canvasHeight = ctx.canvas.height;

                    if (textX < 0) {
                        textX = 0;
                    } else if (textX + ctx.measureText(text).width > canvasWidth) {
                        textX = canvasWidth - ctx.measureText(text).width - 10;
                    }

                    if (textY < 0) {
                        textY = 0;
                    } else if (textY > canvasHeight) {
                        textY = canvasHeight - height / 2;
                    }

                    ctx.fillText(text, textX, textY);

                    if (!isSelected && text && typeof text === 'string') {
                        let cursorX = textX + ctx.measureText(text.slice(0, cursorPos)).width;
                        ctx.beginPath();
                        ctx.moveTo(cursorX, textY - 10);
                        ctx.lineTo(cursorX, textY + 10);
                        ctx.lineWidth = 5;
                        ctx.strokeStyle = cursorColor;
                        ctx.stroke();
                        ctx.strokeStyle = borderColor;
                    }
                } else {

                    if (!isSelected && selected_well && selected_well.value) {
                        text = selected_well.value;
                        let chosenStyle = styles[style] || styles.data;
                        let bgColor = chosenStyle.bgColor;
                        let borderColor = chosenStyle.borderColor;
                        let textColor = chosenStyle.textColor;
                        let cursorColor = chosenStyle.cursorColor;
                        let radius = 10;
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 5;
                        ctx.shadowOffsetY = 5;
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.fillStyle = bgColor;
                        ctx.font = '16px Arial';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        this.drawRoundedRect(ctx, x, y, selected_well.screen_width, selected_well.__screen_height, radius);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.lineWidth = 2;
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        ctx.strokeStyle = borderColor;
                        ctx.stroke();

                        ctx.fillStyle = textColor;

                        let textX = x + 10;
                        let textY = y;

                        let canvasWidth = ctx.canvas.width;
                        let canvasHeight = ctx.canvas.height;

                        if (textX < 0) {
                            textX = 0;
                        } else if (textX + ctx.measureText(text).width > canvasWidth) {
                            textX = canvasWidth - ctx.measureText(text).width - 10;
                        }

                        if (textY < 0) {
                            textY = 0;
                        } else if (textY > canvasHeight) {
                            textY = canvasHeight - height / 2;
                        }

                        ctx.fillText(text, textX, textY);

                        if (!isSelected && text && typeof text === 'string') {
                            let cursorX = textX + ctx.measureText(text.slice(0, cursorPos)).width;
                            ctx.beginPath();
                            ctx.moveTo(cursorX, textY);
                            ctx.lineTo(cursorX, textY + 10);
                            ctx.lineWidth = 5;
                            ctx.strokeStyle = cursorColor;
                            ctx.stroke();
                            ctx.strokeStyle = borderColor;
                        }
                    }
                }

                if (this.txbuttons && this.txbuttons.length > 0 && textStyle && textStyle != 'search') {
                    let buttonWidth = 20;
                    if (!selected_well || !selected_well.__screen_y || !selected_well.__screen_height) {
                        return;
                    }

                    if (this.wells.length === 1 && this.wells[0].length === 1) {
                        this.txbuttons = []
                        this.attr__RowAddRemoveButtons = false;
                    }

                    let buttonY = selected_well.__screen_y + selected_well.__screen_height;
                    this.txbuttons.forEach((button, index) => {
                        let buttonX = 100 + x + index * (buttonWidth + 10);
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.fillStyle = 'black';
                        let buttonHeight = button.height;

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = styles.data.bgColor;
                        if (button.isHighlighted) {
                            ctx.fillStyle = 'cyan';
                        }
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 7;
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 1;
                        ctx.strokeStyle = 'lightGray';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.font = `${circleRadius}px Arial`;
                        ctx.fillStyle = 'navy';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(button.letter, centerX, centerY);
                    });
                }
                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            drawMessagePanel(ctx, text, x, y) {
                let height = 100;
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.fillStyle = 'black';
                ctx.font = '16px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                let textX = x + 10;
                let textY = y + height / 2;
                ctx.fillText(text, textX, textY);
            }

            drawTextBox(ctx, text, x, y, width, height, bgColor, borderColor, textColor) {
                let radius = 10;
                ctx.fillStyle = bgColor;
                this.drawRoundedRect(ctx, x, y, width, height, radius);
                ctx.fill();
                ctx.stroke();

                ctx.lineWidth = 2;
                ctx.strokeStyle = borderColor;
                ctx.font = '12px Arial';
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let textX = x + width / 2;
                let textY = y + height / 2;

                ctx.fillText(text, textX, textY);
            }

            getSelectionElementsMenu() {
                return []
            }

            async getContextMenuItems(pt) {
                let m = await this.createConnectMenu(pt)
                return m;
            }

            async getViewerMenuItems(pt) {
                let menuList = []
                menuList.push(
                    {
                        label: `View`,
                        click: async (scx, scy) => {
                            pt.zoomintoplate(this)

                        },
                        move: () => {
                        }
                    });
                menuList.push(
                    {
                        label: `Download PNG`,
                        click: async (scx, scy) => {
                            await this.toPNG(pt)
                        },
                        move: () => {
                        }
                    });

                return menuList;
            }

            calculateMemorySize() {
                let totalSize = 0;
                this.wells.forEach(row => {
                    row.forEach(well => {
                        if (well) {
                            totalSize += this.getObjectSize(well);
                        }
                    });
                });
                return totalSize;
            }

            getObjectSize(object) {
                let objectList = [];
                let stack = [object];
                let bytes = 0;

                while (stack.length) {
                    let value = stack.pop();

                    if (typeof value === 'boolean') {
                        bytes += 4;
                    } else if (typeof value === 'string') {
                        bytes += value.length * 2;
                    } else if (typeof value === 'number') {
                        bytes += 8;
                    } else if (typeof value === 'object' && objectList.indexOf(value) === -1) {
                        objectList.push(value);

                        for (let i in value) {
                            stack.push(value[i]);
                        }
                    }
                }
                return bytes;
            }

            drawAnnotationTable(pt, ctx, graph, xsc, ysc, screen_width, yscreen_height, cell_width, cell_height, max_x, max_y, min_x, min_y) {

                if (this.__resizing) {
                    ctx.shadowBlur = 15;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.shadowColor = "rgba(0, 255, 0, 0.7)";
                    ctx.fillStyle = "rgba(0, 255, 0, 1)";
                } else {
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    ctx.fillStyle = "white";
                }
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.fillStyle = "lightBlue";
                let scrwidth = graph.screenWidth(this.grid.screenWidth(1))
                let scrheight = graph.screenHeight(this.grid.screenHeight(1))
                if (cell_width < 10) {
                    this.drawButtons(ctx, graph, screen_width);
                    return;
                } else
                    if (cell_width < 10 || cell_height < 10) {
                        if (pt.menu) {
                            pt.menu.draw(ctx, graph);
                        }
                        for (let c of this.plots) {
                            this.grid.rescale();
                            c.drawPlot(graph, ctx, c.grid);
                        }

                        if (this.wells.length === 1 && this.wells[0].length === 1) {
                            this.drawSimpleButtons(ctx, graph, screen_width)
                            return;
                        }

                        if (this.grid.ymax > 1000) {
                            this.drawTableInfo(ctx, graph.X(this.grid.xi), graph.Y(this.grid.yi + this.getHeight()),
                                graph.screenWidth(this.getWidth()), graph.screenHeight(this.getHeight()))
                            return;
                        } else {
                            if (max_x - min_x < 100 && max_y - min_y < 100) {
                                for (let x = min_x; x < max_x; x++) {
                                    for (let y = Math.max(min_y, this.row_vis_start); y < max_y && y < this.row_vis_stop; y++) {
                                        if (this.wells && this.wells[x] != null && this.wells[x][y] != null) {
                                            if (this.wells[x][y].drawAnnotations) {
                                                this.wells[x][y].drawAnnotations(graph, this.grid, ctx, this.min, this.max, x, y, scrwidth, scrheight, this.group_preferences, x, y);
                                            }
                                        }
                                    }
                                }
                            } else {
                                for (let x = min_x; x < max_x; x++) {
                                    for (let y = Math.max(min_y, this.row_vis_start); y < max_y && y < this.row_vis_stop; y++) {
                                        if (this.wells && this.wells[x] && this.wells[x][y] && this.wells[x][y].drawMinimal) {
                                            this.wells[x][y].drawMinimal(graph, this.grid, ctx, this.min, this.max, x, y, this.group_preferences);
                                        }
                                    }
                                }
                            }
                        }
                    } else {

                        ctx.font = "14pt Arial";
                        ctx.fillStyle = 'rgb(0, 87, 163)';

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        let scrwidth = graph.screenWidth(this.grid.screenWidth(1))
                        let scrheight = graph.screenHeight(this.grid.screenHeight(1))
                        if (this.selected) {

                        }

                        if (max_x - min_x < 100 && max_y - min_y < 1300) {
                            for (let x = min_x; x < max_x; x++) {
                                for (let y = Math.max(min_y, this.row_vis_start); y < max_y && y < this.row_vis_stop; y++) {
                                    if (this.wells && this.wells[x] != null && this.wells[x][y] != null) {
                                        if (this.wells[x][y].drawAnnotations) {
                                            this.wells[x][y].drawAnnotations(graph, this.grid, ctx, this.min, this.max, x, y, scrwidth, scrheight, this.group_preferences, x, y);
                                        }
                                    }
                                }
                            }
                        } else {
                            for (let x = min_x; x < max_x; x++) {
                                for (let y = Math.max(min_y, this.row_vis_start); y < max_y && y < this.row_vis_stop; y++) {
                                    if (this.wells && this.wells[x] && this.wells[x][y] && this.wells[x][y].drawMinimal) {
                                        this.wells[x][y].drawMinimal(graph, this.grid, ctx, this.min, this.max, x, y, this.group_preferences);
                                    }
                                }
                            }
                        }

                        if (pt.menu) {
                            pt.menu.draw(ctx, graph);
                        }

                        if (this.wells.length === 1 && this.wells[0].length === 1) {
                            this.drawSimpleButtons(ctx, graph, screen_width)
                            return;
                        }

                        this.drawButtons(ctx, graph, screen_width);

                        if (!pt.menu && this.textActive) {
                            cursorVisible = !cursorVisible;
                            if (!this.textBoxY) {
                                this.textBoxY = graph.Y((this.grid.yi + this.getHeight())) - 45;
                            }
                            if (!this.textBoxX) {
                                this.textBoxX = graph.X(this.grid.xi + this.getWidth() / 2);
                            }

                            if (this.textBoxX - 140 < xsc) {
                                this.textBoxX = xsc;
                            }
                            if (this.textBoxX > xsc + screen_width) {
                                this.textBoxX = xsc + screen_width
                            }

                            this.drawTextBoxWithCursor(ctx, this.text, cursorPos, this.textBoxX, this.textBoxY, this.textBoxWidth,
                                this.textBoxHeight, selectText, textStyle, pt.selected_well);
                        }
                        if (this.textActive && this.message && this.message.length > 0) {
                            this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.getWidth()),
                                graph.Y((this.grid.yi + this.getHeight())) - 45)
                        }
                        ctx.closePath();
                        return;
                    }
                ctx.shadowBlur = 0;
                ctx.font = "10pt Arial";
                ctx.fillStyle = 'rgb(0, 87, 163)';
                if (screen_width < 100) {
                    ctx.font = "8pt Arial"
                }

                if (screen_width > 100 && this.attr__ShowTableName) {
                    ctx.fillText(this.name, this.grid.xi + this.getWidth() - 400, this.grid.yi);
                }
                if (this.textActive) {
                    cursorVisible = !cursorVisible;

                    if (!this.textBoxY) {
                        this.textBoxY = graph.Y((this.grid.yi + this.getHeight())) - 45;
                    }
                    if (!this.textBoxX) {
                        this.textBoxX = graph.X(this.grid.xi + this.getWidth() / 2);
                    }
                    if (this.textBoxY < 10) {
                        this.textBoxY = 10;
                    }

                    if (this.textBoxX - 140 < xsc) {
                        this.textBoxX = xsc;
                    }
                    if (this.textBoxX > xsc + screen_width) {
                        this.textBoxX = xsc + screen_width
                    }

                }
                if (this.textActive && this.message && this.message.length > 0) {
                    this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.getWidth()),
                        graph.Y((this.grid.yi + this.getHeight())) - 45)
                }
                ctx.closePath();
            }
            getWidth() {
                let currentXOffset = 0;
                for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                    const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                    currentXOffset += cellWidth + (1 - COL_OFFSET);
                }
                let d = this.grid.screenWidth(currentXOffset)
                this.width = d;
                return this.width;
            }

            setWidth(w) {

                let dx = this.width - this.getWidth();
                this.width = w;
                let dx2 = this.width - this.getWidth();
                this.grid.width += dx2 - dx;

            }

            getHeight(g) {
                return this.grid.height;
            }

            drawTableInfo(ctx, x, y, width, height) {
                if (!ctx) {
                    console.error('Invalid context');
                    return;
                }

                ctx.fillStyle = "white";
                ctx.shadowBlur = 0;
                ctx.fillRect(x, y, width, height);

                const baseFontSize = Math.min(16, height / 10);
                ctx.font = `${baseFontSize}px Arial`;
                ctx.fillStyle = "black";
                ctx.textAlign = "center";
                const numRows = this.grid.ymax;
                const numCols = this.grid.xmax;
                const tableInfo = ` ${numRows} X ${numCols}`;

                if (!this.memorySize) {
                    this.memorySize = this.calculateMemorySize() / 1024;
                }
                const memoryInfo = `${this.memorySize.toFixed(2)} KB`;

                const lineHeight = baseFontSize + 4;
                const totalTextHeight = lineHeight * 8;
                if (totalTextHeight > height) {
                    const scaledFontSize = baseFontSize * (height / totalTextHeight);
                    ctx.font = `${scaledFontSize}px Arial`;
                }
                const startY = y + (height - totalTextHeight) / 2;
                ctx.fillText(tableInfo, x + width / 2, startY);
                ctx.fillText(memoryInfo, x + width / 2, startY + lineHeight);
            }

            fitToCellSize(pt) {
                function calculateScale(rows) {
                    const minSource = 10;
                    const maxSource = 100000;
                    const minTarget = 0.1;
                    const maxTarget = 100;
                    const scaleFactor = minTarget + ((rows - minSource) / (maxSource - minSource)) * (maxTarget - minTarget);
                    return scaleFactor;
                }
                this.grid.width = (this.grid.xmax / (2 * this.grid.ymax));
                this.grid.rescale();
            }

            completeNullValues() {
                if (this.grid.ymax - this.grid.ymin < 1 || this.grid.xmax - this.grid.xmin < 1) {
                    return;
                }
                this.wells = Array.from(Array(Math.floor(this.grid.xmax)), () => new Array(Math.floor(this.grid.ymax)))
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        this.wells[x][y] = new GenericWell(this.getAlph(this.grid.ymax - y - 1) + (1 + x));
                        this.wells[x][y].setWellType('TRANSPARENT')
                    }
                }

            }

            drawFishEYE(ctx, graph) {
                if (
                    this.pwx != null &&
                    this.pwy != null &&
                    this.pwx < this.wells.length &&
                    this.pwy < this.wells[0].length &&
                    this.pwy < this.grid.ymax &&
                    this.pwx < this.grid.xmax
                ) {
                    const well = this.wells[this.pwx][this.pwy];
                    if (!well) return;

                    const { name, position, concentration, obj, value } = well;
                    const group = well.group ? Object.keys(well.group).join(", ") : null;

                    const lines = ['[' + position + ']', concentration, obj, group, value]
                        .filter(item => item !== null && item !== undefined && item !== '');

                    ctx.font = '11px Arial';
                    const lineHeight = 18;
                    const padding = 8;

                    const maxLineWidth = lines.reduce((max, line) => {
                        const w = ctx.measureText(line).width;
                        return Math.max(max, w);
                    }, 0);

                    const boxWidth = maxLineWidth + padding * 2;
                    const boxHeight = lines.length * lineHeight + padding;

                    const wellY = graph.Y(this.grid.Y(this.pwy));
                    const canvasHeight = ctx.canvas.height;

                    const plateLeftX = graph.X(this.grid.X(0));
                    let boxX = plateLeftX - boxWidth - 10;
                    let boxY = wellY - boxHeight / 2;

                    if (boxY < 0) boxY = 10;
                    if (boxY + boxHeight > canvasHeight) boxY = canvasHeight - boxHeight - 10;

                    const r = 6;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetX = 3;
                    ctx.shadowOffsetY = 3;

                    ctx.beginPath();
                    ctx.moveTo(boxX + r, boxY);
                    ctx.lineTo(boxX + boxWidth - r, boxY);
                    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + r);
                    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - r);
                    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - r, boxY + boxHeight);
                    ctx.lineTo(boxX + r, boxY + boxHeight);
                    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - r);
                    ctx.lineTo(boxX, boxY + r);
                    ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
                    ctx.closePath();
                    ctx.fill();

                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = 'black';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    for (let i = 0; i < lines.length; i++) {
                        const textX = boxX + boxWidth / 2;
                        const textY = boxY + padding / 2 + i * lineHeight + lineHeight / 2;
                        ctx.fillText(lines[i], textX, textY);
                    }
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }
            }

            setHideDetailsPopUp(vls) {
                this.attr__ShowFishEyeLense = !vls;
            }

            draw(pt, ctx, x, y) {

                if (this.hidden) {
                    return;
                }

                let graph = pt.grid;
                if (ctx) {

                    if (this.plateType && this.plateType.startsWith('simple_')) {
                        this.button_set = this.simple_buttons;
                    }

                    if (this.grid.xmax <= 0) {
                        this.grid.xmax = 0.001
                    }

                    this.grid.rescale();
                    graph.rescale();
                    this.find_aspect_ratio(graph);
                    this.resizeToFitWithinSquare();
                    graph.rescale();
                    this.grid.rescale();

                    let currentXOffset = 0;
                    for (let x = this.grid.xmin; x < this.grid.xmax; x++) {
                        const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                        currentXOffset += cellWidth + (1 - COL_OFFSET);
                    }
                    let d = this.grid.screenWidth(currentXOffset)
                    this.width = (d);
                    if (!this.height) {
                        this.height = this.grid.height;
                    }
                    let ysc = graph.Y(this.grid.yi + this.getHeight(pt));
                    let xsc = graph.X(this.grid.xi);
                    let yscreen_height = graph.screenHeight(this.getHeight(pt));
                    let screen_width = graph.screenWidth(this.getWidth());

                    let sh = yscreen_height;

                    let sw = screen_width
                    if (sw < 15 || sh < 15) {
                        return;
                    }
                    if (sw < 35 && sh < 35) {
                        return;
                    }

                    if (sh < 40 || sw < 15) {
                        return;
                    }

                    let screen_height = graph.height;
                    let vx = graph.Xwc(0)
                    let vy = graph.Ywc(screen_height)
                    if (screen_height < 55 && screen_5width < 55) {
                        return;
                    }

                    ctx.beginPath();
                    ctx.strokeStyle = 'lightGray';
                    ctx.fillStyle = 'transparent';
                    ctx.lineWidth = 0;
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 3;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;
                    ctx.shadowColor = 'black'

                    let cell_width = graph.screenWidth(this.getWidth(pt)) / (this.grid.xmax - this.grid.xmin);
                    let cell_height = graph.screenHeight(this.getHeight(pt)) / (this.grid.ymax - this.grid.ymin);

                    if (pt.menu) {
                        this.textActive = false;
                        this.textBoxX = 0;
                    }

                    if (screen_width < 5 || screen_height < 5) {
                        return;
                    }

                    if (screen_width < 10 || screen_height < 10) {
                        return;
                    }

                    if (this.visible_cell_aspect_ratio_min) {
                        let ratio = cell_width / cell_height;
                        if (ratio < this.visible_cell_aspect_ratio_min) {
                            return;
                        }

                    }

                    if (this.visible_cell_aspect_ratio_max) {
                        let ratio = cell_width / cell_height;
                        if (ratio > this.visible_cell_aspect_ratio_max) {
                            return;
                        }
                    }

                    if (isObjectNotVisible(ctx, xsc, xsc + screen_width, ysc, ysc + yscreen_height * 2)) {
                        return;
                    }

                    let min_x = Math.floor(this.grid.Xwc(vx - this.grid.xi * 2))

                    if (min_x < 0) {
                        min_x = 0
                    }
                    let max_x = this.grid.xmax;
                    let max_y = Math.floor(this.grid.Ywc(vy - this.grid.yi * 2))
                    if (max_y <= 0) {
                        max_y = 1
                    }

                    let min_y = (Math.floor(this.grid.Ywc(vy - this.grid.yi * 2 + graph.worldHeight(graph.height))))
                    if (min_y < 0) {
                        min_y = 0;
                    }
                    if (this.table_summary) {
                        this.drawTableInfo(ctx, graph.X(this.grid.xi), graph.Y(this.grid.yi + this.getHeight(pt)),
                            graph.screenWidth(this.getWidth()), graph.screenHeight(this.getHeight(pt)))
                        return;
                    }
                    else if (this.plateType === 'annotation' || this.plateType === 'package') {
                        this.drawAnnotationTable(pt, ctx, graph, xsc, ysc, screen_width, yscreen_height,
                            cell_width, cell_height, max_x, max_y, min_x, min_y)
                        return;
                    }
                    if (this.__resizing) {
                        ctx.shadowBlur = 25;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.shadowColor = "rgba(0, 155, 0, 0.7)";
                        ctx.fillStyle = "rgba(0, 155, 0, 0.2)";
                    } else {
                        ctx.shadowBlur = 5;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.fillStyle = "lightGray";
                    }
                    const radius = 5;
                    ctx.fillStyle = "black";

                    ctx.stroke();

                    if (this.resizeable) {
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.fillStyle = "transparent";
                        ctx.shadowColor = "black";

                    } else {
                        ctx.shadowBlur = 3;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = "transparent";
                        ctx.shadowColor = "black";

                    }

                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.font = "14pt Arial";
                    if (this.attr__ShowTableName) {
                        ctx.fillStyle = 'rgba(0, 87, 163,0.3)';
                        ctx.fillText('' + this.name, xsc, ysc - 20)
                    }
                    if (cell_width < 5 || cell_height < 5) {
                        if (pt.menu) {
                            pt.menu.draw(ctx, graph);
                        }
                        for (let x = min_x; x < max_x; x++) {
                            for (let y = Math.max(min_y, this.row_vis_start); y < Math.min(max_y, this.row_vis_stop); y++) {
                                if (this.wells && this.wells[x] && this.wells[x][y] && this.wells[x][y].drawMinimal) {
                                    this.wells[x][y].drawMinimal(graph, this.grid, ctx, this.min, this.max, x, y, this.group_preferences);
                                }
                            }
                        }

                        if (!pt.menu && this.textActive) {
                            cursorVisible = !cursorVisible;
                            if (!this.textBoxY) {
                                this.textBoxY = graph.Y((this.grid.yi + this.getHeight(pt))) - 45;
                            }
                            if (!this.textBoxX) {
                                this.textBoxX = graph.X(this.grid.xi + this.getWidth() / 2);
                            }
                            if (this.textBoxX - 140 < xsc) {
                                this.textBoxX = xsc;
                            }
                            if (this.textBoxX > xsc + screen_width) {
                                this.textBoxX = xsc + screen_width
                            }
                            if (pt.selected_well) {
                                this.textBoxX = pt.selected_well.__screen_x;
                                this.textBoxY = pt.selected_well.__screen_y;
                                cursorPos = this.text.length;
                            }
                            if (this.textBoxX && this.textBoxY && textStyle) {
                                this.drawTextBoxWithCursor(ctx, this.text, cursorPos, this.textBoxX,
                                    this.textBoxY, this.textBoxWidth, this.textBoxHeight, selectText, textStyle, pt.selected_well);
                            }
                        }
                        if (this.textActive && this.message && this.message.length > 0) {
                            this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.getWidth()),
                                graph.Y((this.grid.yi + this.getHeight(pt))) - 45)
                        }

                        ctx.closePath();

                    } else {
                        ctx.font = "7pt Arial";
                        ctx.fillStyle = 'gray';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        if (this.attr__displayNumberValues) {
                            if (this.grid.xmax < 2 || this.grid.ymax < 2) {
                                this.attr__displayNumberValues = false;
                            }

                            for (let x = this.grid.xmin; x < this.grid.xmax; x++) {

                                const textX = graph.X(this.grid.X(x + 0.5));
                                const textY = graph.Y((this.grid.yi + this.getHeight(pt))) - 5;
                                const text = '' + x;

                                const textMetrics = ctx.measureText(text);
                                const textWidth = textMetrics.width;
                                const textHeight = parseInt(ctx.font, 10);

                                ctx.fillStyle = 'white';
                                ctx.beginPath();
                                ctx.ellipse(
                                    textX,
                                    textY - textHeight / 2,
                                    textWidth / 2 + 4,
                                    textHeight / 2 + 2,
                                    0,
                                    0, Math.PI * 2
                                );
                                ctx.fill();

                                ctx.fillStyle = 'gray';
                                ctx.fillText(text, textX - textWidth / 2, textY);

                                for (let y = Math.max(min_y, this.row_vis_start); y < max_y && y < this.row_vis_stop; y++) {
                                    if (this.wells && this.wells[x] != null && this.wells[x][y] != null) {

                                        const textX = graph.X(this.grid.xi) - 20;
                                        const textY = graph.Y(this.grid.Y(y + 0.5));
                                        const text = '' + y;

                                        const textMetrics = ctx.measureText(text);
                                        const textWidth = textMetrics.width;
                                        const textHeight = parseInt(ctx.font, 10);
                                        ctx.fillStyle = 'white';
                                        ctx.beginPath();

                                        ctx.fill();

                                        ctx.fillStyle = 'gray';
                                        ctx.fillText(text, textX - textWidth / 2, textY);

                                    }
                                }

                            }
                        }

                        let scrheight = graph.screenHeight(this.grid.screenHeight(0.9))

                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        if (cell_width > 10 || cell_height > 10) {
                            let currentXOffset = this.grid.xmin;
                            for (let x = this.grid.xmin; x < max_x; x++) {
                                const cellWidth = this.column_widths?.[x] ?? COL_OFFSET;
                                let scrwidth = graph.screenWidth(this.grid.screenWidth(cellWidth))

                                let cellX = currentXOffset;
                                let mdwidth = graph.screenWidth(this.grid.screenWidth(1 - COL_OFFSET))
                                if (x === this.__highlight_column) {
                                    let _mx = pt.grid.X(this.grid.X(cellX));
                                    let bottom = pt.grid.screenHeight(this.grid.height);
                                    let top = pt.grid.Y(this.grid.yi)
                                    ctx.strokeStyle = 'rgba(159, 155, 150, 0.7)'
                                    ctx.lineWidth = 1;
                                    ctx.shadowBlur = 3;
                                    ctx.beginPath();
                                    ctx.moveTo(_mx - mdwidth / 2, top - bottom);
                                    ctx.lineTo(_mx - mdwidth / 2, top);
                                    ctx.closePath();
                                    ctx.stroke();
                                } else
                                    if (x === this.__highlight_column_width) {
                                        let _mx = pt.grid.X(this.grid.X(cellX));
                                        let bottom = pt.grid.screenHeight(this.grid.height);
                                        let top = pt.grid.Y(this.grid.yi)

                                        ctx.strokeStyle = 'rgba(255, 0, 230, 0.7)'
                                        ctx.lineWidth = 5;
                                        ctx.shadowBlur = 4;
                                        ctx.beginPath();
                                        ctx.moveTo(_mx - mdwidth / 2, top - bottom);
                                        ctx.lineTo(_mx - mdwidth / 2, top);
                                        ctx.closePath();
                                        ctx.stroke();
                                        ctx.shadowOffsetX = 0;
                                        ctx.shadowOffsetY = 0;
                                        ctx.shadowBlur = 0;

                                    }

                                for (let y = Math.max(min_y, this.row_vis_start); y < Math.min(max_y, this.row_vis_stop); y++) {
                                    if (this.wells && this.wells[x] != null && this.wells[x][y] != null) {
                                        if (this.wells[x][y].drawAnnotations && x >= min_x) {
                                            this.wells[x][y].drawAnnotations(
                                                graph,
                                                this.grid,
                                                ctx,
                                                this.min,
                                                this.max,
                                                cellX,
                                                y,
                                                scrwidth,
                                                scrheight,
                                                this.group_preferences,
                                                x,
                                                y
                                            );
                                        }
                                    }
                                }
                                currentXOffset += cellWidth + (1 - COL_OFFSET);
                            }
                        } else {
                            for (let x = min_x; x < max_x; x++) {
                                for (let y = Math.max(min_y, this.row_vis_start); y < Math.min(max_y, this.row_vis_stop); y++) {
                                    if (this.wells && this.wells[x] && this.wells[x][y] && this.wells[x][y].drawMinimal) {
                                        this.wells[x][y].drawMinimal(graph, this.grid, ctx, this.min, this.max, x, y, this.group_preferences);
                                    }
                                }
                            }
                        }

                        if (pt.menu) {
                            pt.menu.draw(ctx, graph);
                        }
                        for (let c of this.plots) {
                            this.grid.rescale();
                            c.drawPlot(graph, ctx, c.grid);
                        }

                        this.drawButtons(ctx, graph, screen_width);

                        cursorVisible = !cursorVisible;
                        if (!this.textBoxY) {
                            this.textBoxY = graph.Y((this.grid.yi + this.getHeight(pt))) - 45;
                        }
                        if (!this.textBoxX) {
                            this.textBoxX = graph.X(this.grid.xi + this.grid.width / 2);
                        }
                        if (this.textBoxX - 140 < xsc) {
                            this.textBoxX = xsc;
                        }
                        if (this.textBoxX > xsc + screen_width) {
                            this.textBoxX = xsc + screen_width
                        }

                        if (pt.selected_well) {

                            this.textBoxX = pt.selected_well.__screen_x;
                            this.textBoxY = pt.selected_well.__screen_y;

                            cursorPos = this.text.length;
                        }
                        if (this.textBoxX && this.textBoxY && textStyle) {
                            this.drawTextBoxWithCursor(ctx, this.text, cursorPos, this.textBoxX,
                                this.textBoxY, this.textBoxWidth, this.textBoxHeight, selectText, textStyle, pt.selected_well);
                        }

                        if (this.textActive && this.message && this.message.length > 0) {
                            this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.getWidth()),
                                graph.Y((this.grid.yi + this.getHeight(pt))) - 45)
                        }
                        if (this.selected)
                            this.drawResizeHandle(ctx, graph)
                        return;
                    }

                    ctx.shadowBlur = 0;
                    ctx.font = "10pt Arial";
                    ctx.fillStyle = 'rgb(0, 87, 163)';
                    if (screen_width < 100) {
                        ctx.font = "8pt Arial"
                    }
                    if (yscreen_height > 400) {
                        if (this.attr__ShowTableName) {
                            ctx.save();
                            ctx.font = "14pt Arial";
                            ctx.fillStyle = 'rgba(0, 87, 163,0.3)';
                            ctx.translate(graph.X(this.grid.xi) - 20, graph.Y(this.grid.yi + this.getHeight(pt) / 2));
                            ctx.rotate(-Math.PI / 2);
                            if (this.plateType != null && this.plateType.length > 0) {
                                ctx.fillText(this.name, 0, 0);

                            } else {
                                ctx.fillText(this.name, 0, 0);
                            }
                            ctx.restore();
                        }
                    }
                    ctx.stroke();

                    if (screen_width > 100 && this.attr__ShowTableName) {
                        ctx.fillText(this.name, this.grid.xi + this.getWidth() - 400, this.grid.yi);
                    }

                    if (pt.menu) {
                        pt.menu.draw(ctx, graph);
                    }
                    ctx.save();
                    for (let c of this.plots) {
                        this.grid.rescale();
                        c.drawPlot(graph, ctx, c.grid);
                    }

                    this.drawButtons(ctx, graph, screen_width);
                    if (this.textActive) {
                        cursorVisible = !cursorVisible;

                        if (!this.textBoxY) {
                            this.textBoxY = graph.Y((this.grid.yi + this.getHeight(pt))) - 45;
                        }
                        if (!this.textBoxX) {
                            this.textBoxX = graph.X(this.grid.xi + this.getWidth() / 2);
                        }
                        if (this.textBoxY < 10) {
                            this.textBoxY = 10;
                        }
                        if (this.textBoxX - 140 < xsc) {
                            this.textBoxX = xsc;
                        }
                        if (this.textBoxX > xsc + screen_width) {
                            this.textBoxX = xsc + screen_width
                        }
                    }
                    if (this.textActive && this.message && this.message.length > 0) {
                        this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.getWidth()),
                            graph.Y((this.grid.yi + this.getHeight(pt))) - 45)
                    }
                    ctx.closePath();
                }

            }
            drawOctopusTentacles(ctx, graph, x, y, width, height, count) {
                ctx.save();
                ctx.beginPath();
                let th = graph.screenHeight(graph.worldHeight(10));

                for (let i = 0; i < count; i++) {
                    const baseX = x;
                    const baseY = 20 + y + height * i * 0.0061;
                    ctx.strokeStyle = 'rgba(100, 50, 200, 0.04)';
                    ctx.fillStyle = 'rgba(100, 50, 200, 0.03)';
                    ctx.shadowBlur = 20;
                    ctx.lineWidth = 0;
                    ctx.shadowColor = 'transparent';
                    ctx.border = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    this.drawTentacle(
                        ctx,
                        baseX,
                        baseY,
                        width * 0.3,
                        th,
                        3,
                        20,
                        2
                    );
                }
                ctx.restore();
            }

            drawResizeHandle(ctx, graph) {
                const rectWidth = this.getWidth();
                const rectHeight = this.getHeight();
                const arrowSize = 15;

                ctx.fillStyle = "lightGray";
                ctx.lineWidth = 2;
                ctx.shadowBlur = 1;
                ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                const bottomRightStartX = graph.X(this.grid.xi) + graph.screenWidth(rectWidth);
                const bottomRightStartY = graph.Y(this.grid.yi) + 5;
                ctx.beginPath();
                ctx.moveTo(bottomRightStartX, bottomRightStartY);
                ctx.lineTo(bottomRightStartX - arrowSize, bottomRightStartY);
                ctx.lineTo(bottomRightStartX, bottomRightStartY - arrowSize);
                ctx.closePath();
                ctx.fill();
            }

            drawTentacle(ctx, startX, startY, controlOffsetX, controlOffsetY, numSegments, baseWidth, tipWidth) {
                let x = startX;
                let y = startY;

                const points = [];

                for (let i = 0; i <= numSegments; i++) {
                    const t = i / numSegments;
                    const segmentWidth = baseWidth * (1 - t) + tipWidth * t;

                    const controlX = x + controlOffsetX * (Math.random() * 0.05 + 0.8);
                    const controlY = y + controlOffsetY / numSegments * (Math.random() * 0.1 + 0.9);
                    const endX = x + controlOffsetX * (Math.random() * 0.5 + 0.9);
                    const endY = y + controlOffsetY / numSegments;

                    points.push({ controlX, controlY, endX, endY, segmentWidth });

                    x = endX;
                    y = endY;
                }

                for (let i = 0; i < points.length - 1; i++) {
                    const { endX: x1, endY: y1, segmentWidth: w1 } = points[i];
                    const { endX: x2, endY: y2, segmentWidth: w2 } = points[i + 1];

                    ctx.beginPath();
                    ctx.moveTo(x1, y1 - w1 / 2);
                    ctx.lineTo(x1, y1 + w1 / 2);
                    ctx.lineTo(x2, y2 + w2 / 2);
                    ctx.lineTo(x2, y2 - w2 / 2);
                    ctx.closePath();

                    ctx.fillStyle = `rgba(100, 150, 200, 0.08})`;
                    ctx.strokeStyle = ctx.fillStyle;
                    ctx.fill();
                    ctx.stroke();
                }
            }
            drawButton(ctx, x, y, width, height, title = "", radius = 5) {
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + width - radius, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                ctx.lineTo(x + width, y + height - radius);
                ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                ctx.lineTo(x + radius, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(55, 20, 120, 0.8)';
                ctx.fill();

                ctx.strokeStyle = 'rgba(150, 0, 0, 1)';
                ctx.lineWidth = 2;
                ctx.stroke();

                if (title) {
                    ctx.shadowColor = 'transparent';
                    ctx.fillStyle = 'white';
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(title, x + width / 2, y + height / 2);
                }

                ctx.restore();
            }

            selectWells(w) {

                for (let row of this.wells) {
                    for (let col of row) {
                        if (col) {
                            for (let address of w) {
                                if (col.name.toLowerCase() === address.toLowerCase() ||
                                    col.position.toLowerCase() === address.toLowerCase()
                                ) {
                                    col.selectIt();
                                }
                            }
                        }
                    }
                }

                for (let p of this.plates) {
                    p.selectWells(w)
                }
            }

            getMaxCoordinates() {
                let maxXi = this.grid.xi;
                let maxYi = this.grid.yi;

                for (let nestedPlate of this.plates) {
                    let { xi: nestedXi, yi: nestedYi } = nestedPlate.getMaxCoordinates();
                    maxXi = Math.max(maxXi, nestedXi);
                    maxYi = Math.min(maxYi, nestedYi);
                }

                return { xi: maxXi, yi: maxYi };
            }
            getPlates(plates, y) {

                if (Math.floor(this.grid.yi) === y) {
                    if (plates.indexOf(this) < 0) {
                        plates.push(this)
                    }
                }

                for (let p of this.plates) {
                    if (Math.floor(p.grid.yi) === y) {
                        if (plates.indexOf(p) < 0)
                            plates.push(p)
                    }
                    plates = p.getPlates(plates, y)
                }
                return plates;
            }

            overlapsWithX(otherPlate) {
                return this.grid.xi < otherPlate.grid.xi + otherPlate.grid.width &&
                    this.grid.xi + this.getWidth() > otherPlate.grid.xi;
            }

            overlapsWithY(otherPlate) {
                return this.grid.yi < otherPlate.grid.yi + otherPlate.grid.height &&
                    this.grid.yi + this.getHeight() > otherPlate.grid.yi;
            }

            overlapsWith(otherPlate) {
                return this.grid.xi < otherPlate.grid.xi + otherPlate.grid.width &&
                    this.grid.xi + this.getWidth() > otherPlate.grid.xi;
            }

            shiftX(distance) {
                this.grid.xi += distance;
            }

            applyValuesToPlateField(field, w) {

                for (let row of this.wells) {
                    for (let col of row) {
                        if (col) {
                            for (let line of w) {
                                let sp = line.split('\t')
                                let address = sp[0]
                                if (col.name.toLowerCase() === address.toLowerCase() ||
                                    col.position.toLowerCase() === address.toLowerCase()
                                ) {
                                    col[field] = sp[1]
                                    col.select = true;
                                    setTimeout(() => {
                                        col.select = false;
                                    }, 3000 + 100 * Math.random())
                                }
                            }
                        }
                    }
                }
                for (let pl of this.plates) {
                    pl.applyValuesToPlateField(field, w)
                }

            }
            drawConnections(pt, graph, ctx, x, y) {
                ctx.lineWidth = 2;

                if (this.grid && this.plates && this.plates.length > 0) {
                    for (let plate of this.plates) {
                        if (pt.hasTable(plate.uid)) {
                            plate = pt.getPlateWithUID(plate.uid);

                            const r = 25;
                            const g = 20;
                            const b = 26;
                            const a = 0.3;
                            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;

                            const centerX = graph.X(this.grid.xi + this.getWidth() / 2);
                            const centerY = graph.Y(this.grid.yi + this.grid.height / 2);

                            const plateCorners = [
                                { x: graph.X(plate.grid.xi), y: graph.Y(plate.grid.yi) },
                                { x: graph.X(plate.grid.xi + plate.grid.width), y: graph.Y(plate.grid.yi) },
                                { x: graph.X(plate.grid.xi), y: graph.Y(plate.grid.yi + plate.grid.height) },
                                { x: graph.X(plate.grid.xi + plate.grid.width), y: graph.Y(plate.grid.yi + plate.grid.height) }
                            ];

                            for (let corner of plateCorners) {
                                ctx.beginPath();
                                ctx.moveTo(centerX, centerY);
                                ctx.lineTo(corner.x, corner.y);
                                ctx.stroke();
                            }
                        }
                    }
                }
            }

            drawLine = (graph, ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }

                ctx.beginPath();
                ctx.moveTo(graph.X(this.grid.X(xi)), graph.Y(this.grid.Y(yi)));
                ctx.lineTo(graph.X(this.grid.X(xf)), graph.Y(this.grid.Y(yf)));
                ctx.lineWidth = lineSize;
                ctx.stroke();
            }

            drawWellsAnnotations = (graph, ctx) => {
                let canvasWidth = ctx.canvas.width;
                let canvasHeight = ctx.canvas.height;
                let scrwidth = graph.screenWidth(this.grid.screenWidth(0.95))
                let scrheight = graph.screenHeight(this.grid.screenHeight(1))
                if (this.grid.xmax - this.grid.xmin < 100 && this.grid.ymax - this.grid.ymin < 1000) {
                    for (let x = 0; x < this.grid.xmax; x++) {
                        for (let y = 0; y < this.grid.ymax; y++) {
                            if (this.wells && this.wells[x] != null && this.wells[x][y] != null) {
                                if (!this.wells[x][y].drawAnnotations) {
                                } else {
                                    let screenX = graph.X(this.grid.X(x));
                                    let screenY = graph.Y(this.grid.Y(y));
                                    if (screenX + graph.screenWidth((1)) < 0 ||
                                        screenY + graph.screenHeight((1)) < 0 ||
                                        screenX > canvasWidth ||
                                        screenY > canvasHeight) {
                                        continue;
                                    }
                                    this.wells[x][y].drawAnnotations(graph, this.grid, ctx, this.min, this.max, x, y, scrwidth, scrheight, this.group_preferences, x, y);
                                }
                            }
                        }
                    }
                }
            }

            trim() {

            }

            findNextNullValue() {
                for (let colIdx = 0; colIdx < this.wells.length; colIdx++) {
                    const column = this.wells[colIdx];
                    for (let rowIdx = 0; rowIdx < this.wells[colIdx].length; rowIdx++) {
                        if (this.wells[colIdx][rowIdx] === undefined || this.wells[colIdx][rowIdx] === null) {
                            return { column: colIdx, row: rowIdx };
                        }
                    }
                }
                return null;
            }

            appendColumn(well, col) {
                if (typeof well === 'object') {
                    for (let row = 0; row < this.wells[col].length; row++) {
                        if (this.wells[col][row] === null) {
                            this.wells[col][row] = well; if (this.wells[col])
                                return;
                        }
                    }
                    this.wells[col].push(well)
                    if (this.grid.xmax < this.wells[col].length)
                        this.grid.ymax = this.wells[col].length

                } else {
                    this.appendColumn(new GenericWell(`(${col},${this.grid.ymax})`, well), col)
                }
            }

            prependColumn(well, col) {
                if (typeof well === 'object') {

                    this.wells[col].unshift(null);
                    for (let row = this.wells[col].length - 1; row > 0; row--) {
                        this.wells[col][row] = this.wells[col][row - 1];
                    }

                    this.wells[col][0] = well;

                    if (this.grid.ymax < this.wells[col].length) {
                        this.grid.ymax = this.wells[col].length;
                    }
                } else {

                    this.prependColumn(new GenericWell(`(${col},0)`, well), col);
                }
            }

            setWell(wellPosition, wellData) {
                const { row, col } = this.getWellCoordinates(wellPosition);
                while (this.wells.length < row) {
                    this.wells.push([]);
                }
                while (this.wells[col].length < col) {
                    this.wells[col].push(new GenericWell(wellPosition));
                }
                if (this.wells[col][row] && this.wells[col][row].position === wellPosition) {
                    return false;
                }
                this.wells[col][row] = wellData;
                return true;
            }

            setWellValue(col, row, value) {
                if (!this.wells[col][row]) {
                    this.wells[col][row] = createDefaultWell(row, col)
                }
                this.wells[col][row].setValue(value);
            }
            setWellType(col, row, type) {
                this.wells[col][row].skin_type = type;
            }
            getWellCoordinates(wellPosition) {
                const rowLetter = wellPosition[0];
                const colNumber = parseInt(wellPosition.slice(1), 10) - 1;
                const row = rowLetter.charCodeAt(0) - "A".charCodeAt(0);
                return { row, col: colNumber };
            }

            getWellIndicies(well) {

                if (!well || !well.uid) {
                    console.log(" the well is null ")
                    return;
                }

                for (let colIdx = 0; colIdx < this.wells.length; colIdx++) {
                    for (let rowIdx = 0; rowIdx < this.wells[colIdx].length; rowIdx++) {

                        if (this.wells[colIdx][rowIdx] && this.wells[colIdx][rowIdx].uid === well.uid) {
                            return { colIdx, rowIdx }
                        }
                    }
                }
                return null;
            }

            addPlot(plot) {
                this.plots.push(plot)
            }

            drawPlate(graph, ctx) {
                this.grid.rescale();
                this.name = this.name.trim();

                if (this.getWidth() < 10 || this.grid.height < 10) {
                    return;
                }

                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymin(), this.grid.getxmin(), this.grid.getymax(), 'lightBlue', 1);
                this.drawLine(graph, ctx, this.grid.getxmax(), this.grid.getymin(), this.grid.getxmax(), this.grid.getymax(), 'black', 1);
                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymin(), this.grid.getxmax(), this.grid.getymin(), 'black', 1);
                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymin(), this.grid.getxmax(), this.grid.getymin(), 'black', 5);
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                if (this.getWidth() > 20 && this.wells.length > 0 && this.wells[0].length > 0 && this.wells[0].length < 1000)
                    this.drawWellsAnnotations(graph, ctx)
                if (this.grid.xmax > 0 && this.grid.ymax > 0) {
                    if (this.attr__ShowFishEyeLense && this.pwx != null && this.pwx >= 0 && this.pwy != null && this.pwy >= 0) {
                        this.drawFishEYE(ctx, graph)
                    }
                }

            }
        }

        resolve(Plate)
    })

}

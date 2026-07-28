function (pt) {

    return new Promise(async (resolve, reject) => {

        const getTableFromPrompt = async () => {
            let va = await prompt("Reference scope:", ["table"], { "table": '' }, 300, 300)
            let value = va['table']
            let r = pt.getRefByName(value)
            if (r && r.length > 0) {
                return r[0]
            }
            return null;
        }

        function isTableCreated(tableName, script) {
            const creationPatterns = [
                new RegExp(`\\bpaste\\s+${tableName}\\b`, 'g'),
                new RegExp(`\\bnew\\s+${tableName}\\b`, 'g'),
                new RegExp(`\\brename\\s+[a-zA-Z0-9_]+\\s+${tableName}\\b`, 'g'),
                new RegExp(`\\bcopy\\s+[a-zA-Z0-9_]+\\s+to\\s+${tableName}\\b`, 'g')
            ];

            return creationPatterns.some(pattern => pattern.test(script));
        }
        function extractTableNames(script) {
            const tableSet = new Set();
            const tableColumnPattern = /([a-zA-Z_]+)\[[a-zA-Z0-9_]+\]/g;
            const tableColonPattern = /^\s*([a-zA-Z_]+):\s*$/gm;

            let match;

            while ((match = tableColumnPattern.exec(script)) !== null) {
                tableSet.add(match[1]);
            }

            while ((match = tableColonPattern.exec(script)) !== null) {
                tableSet.add(match[1]);
            }

            return Array.from(tableSet);
        }

        let Plate = await exec('baja/plate/plate.js');
        let Plot = await exec('flexigraph/plot')

        function isIntegerValue(input) {
            const regex = /^-?\d+$/;
            return regex.test(input);
        }

        function sigmoid(x, min, max, ic50, slope) {
            return min + (max - min) / (1 + Math.pow(10, (Math.log10(ic50 + 1e-6) - x) * slope));
        }

        function calculateIC50(xValues, yValues) {

            const minX = Math.min(...xValues.map(x => x.value));
            const maxX = Math.max(...xValues.map(x => x.value));
            const normalizedX = xValues.map(x => (x.value - minX) / (maxX - minX));

            const dataPoints = normalizedX.map((x, i) => ({ x: x, y: yValues[i].value }));

            const initialGuess = {
                min: Math.min(...dataPoints.map(p => p.y)),
                max: Math.max(...dataPoints.map(p => p.y)),
                ic50: 0.5,
                slope: 1
            };

            function sigmoid(x, min, max, ic50, slope) {
                return min + (max - min) / (1 + Math.pow(10, (Math.log10(ic50) - x) * slope));
            }

            function lossFunction(params) {
                return dataPoints.reduce((sum, point) => {
                    const predicted = sigmoid(point.x, params.min, params.max, params.ic50, params.slope);
                    return sum + Math.pow(predicted - point.y, 2);
                }, 0);
            }

            function gradientDescent(params, learningRate, iterations) {
                let currentParams = { ...params };

                for (let i = 0; i < iterations; i++) {
                    const gradients = {
                        min: 0,
                        max: 0,
                        ic50: 0,
                        slope: 0
                    };

                    for (const point of dataPoints) {
                        const predicted = sigmoid(point.x, currentParams.min, currentParams.max, currentParams.ic50, currentParams.slope);
                        const error = predicted - point.y;

                        gradients.min += 2 * error * (1 / (1 + Math.pow(10, (Math.log10(currentParams.ic50 + 1e-6) - point.x) * currentParams.slope)));
                        gradients.max += 2 * error * (1 - 1 / (1 + Math.pow(10, (Math.log10(currentParams.ic50 + 1e-6) - point.x) * currentParams.slope)));
                        gradients.ic50 += 2 * error * currentParams.slope *
                            Math.pow(10, (Math.log10(currentParams.ic50 + 1e-6) - point.x) * currentParams.slope) *
                            (Math.log(10) / (currentParams.ic50 + 1e-6));
                        gradients.slope += 2 * error * (Math.log10(currentParams.ic50 + 1e-6) - point.x) *
                            Math.pow(10, (Math.log10(currentParams.ic50 + 1e-6) - point.x) * currentParams.slope) * Math.log(10);
                    }

                    currentParams.min -= learningRate * gradients.min;
                    currentParams.max -= learningRate * gradients.max;
                    currentParams.ic50 = Math.max(currentParams.ic50 - learningRate * gradients.ic50, 1e-6);
                    currentParams.slope -= learningRate * gradients.slope;

                    if (isNaN(currentParams.ic50) || isNaN(currentParams.min) || isNaN(currentParams.max) || isNaN(currentParams.slope)) {
                        console.error('Gradient descent diverged. Stopping.');
                        console.log('debubg');
                        break;
                    }
                }
                return currentParams;
            }

            const optimizedParams = gradientDescent(initialGuess, 0.0001, 10000);

            optimizedParams.ic50 = optimizedParams.ic50 * (maxX - minX) + minX;
            return optimizedParams;
        }

        function parseTableString(input) {

            const match = input.match(/^([^[]*)\[([\s\S]*)\]$/);

            if (match) {
                const tablename = match[1] ? match[1] : "current";
                const range = `[${match[2]}]`;
                return { tablename, range };
            }

            if (input.match(/^\w+$/)) {
                return { tablename: input, range: "[first:last][first:last]" };
            }

            throw new Error("Invalid format. Expected 'tablename[range]', '[range]', or 'tablename'.");
        }

        function findTableDimensions(input) {
            const regex = /\[(\d*):?(\d*)\]\[(\d*):?(\d*)\]/g;
            let match;
            let maxColumn = 0;
            let maxRow = 0;

            while ((match = regex.exec(input)) !== null) {
                const [_, colStart, colEnd, rowStart, rowEnd] = match.map(val => (val === "" ? null : parseInt(val, 10)));

                const maxColFromRange = colEnd !== null ? colEnd : colStart;
                const maxRowFromRange = rowEnd !== null ? rowEnd : rowStart;

                if (maxColFromRange !== null && maxColFromRange > maxColumn) {
                    maxColumn = maxColFromRange;
                }

                if (maxRowFromRange !== null && maxRowFromRange > maxRow) {
                    maxRow = maxRowFromRange;
                }
            }
            return {
                maxColumns: maxColumn + 1,
                maxRows: maxRow + 1
            };
        }

        function parseTableString(input) {

            const match = input.match(/^([^[]*)\[([\s\S]*)\]$/);

            if (match) {
                const tablename = match[1] ? match[1] : "current";
                const range = `[${match[2]}]`;
                return { tablename, range };
            }

            if (input.match(/^\w+$/)) {
                return { tablename: input, range: "[first:last][first:last]" };
            }

            throw new Error("Invalid format. Expected 'tablename[range]', '[range]', or 'tablename'.");
        }

        function parseNumbersInBrackets(input) {
            const regex = /\[([^\[\]]+)\]/g;
            let match;
            const result = [];

            while ((match = regex.exec(input)) !== null) {

                const elements = match[1].split(/[\s,]+/).map(item => {
                    if (item === "first" || item === "last" || item === "0") {
                        return item;
                    }
                    const num = Number(item);
                    return isNaN(num) ? item : num;
                });

                result.push(elements);
            }

            return result;
        }

        function convertToArray(str) {

            str = str.trim();

            if (str.startsWith('...')) {

                return str.slice(3).trim().split(/\s+/);
            }

            return [];
        }
        function checkString(str, dict) {
            str = str.trim();
            const pattern = /^[a-zA-Z0-9]+\[[^\]]+\]$/;
            if (pattern.test(str)) {
                return false;
            }

            if (!isNaN(str)) {
                return true;
            }

            else if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
                return true;
            }

            else if (str.split(/\s+/).length > 1) {
                return true;
            }

            else if (!(str in dict)) {
                return true;
            }

            else {
                return false;
            }
        }

        class Interpreter {
            ref;
            plateTrack;

            constructor(plateTrack) {
                this.plateTrack = plateTrack;
                this.objects = {};
                this.currentObject = this;
                this.currentScope = null;
            }

            async run(commands) {
                const lines = [];
                let currentLine = '';
                let braceContent = '';
                let braceLevel = 0;
                let processingBraces = false;

                const splitAndRejoin = (input) => {
                    const rawLines = input.split("\n").map(line => line.trim());
                    const mergedLines = [];

                    for (const line of rawLines) {
                        if (line === '{') {
                            if (mergedLines.length > 0) {

                                mergedLines[mergedLines.length - 1] += ' {';
                            }
                        } else {
                            mergedLines.push(line);
                        }
                    }
                    return mergedLines.join("\n");
                };

                const removeComments = (input) => {
                    if (input.indexOf('\n') <= 0) {
                        return input;
                    }
                    return input
                        .split('\n')
                        .map(line => {

                            const commentIndex = line.indexOf('#');
                            const doubleSlashIndex = line.indexOf('//');
                            if (commentIndex >= 0 && (doubleSlashIndex === -1 || commentIndex < doubleSlashIndex)) {
                                line = line.slice(0, commentIndex);
                            }
                            if (doubleSlashIndex >= 0) {
                                line = line.slice(0, doubleSlashIndex);
                            }
                            return line.trim();
                        })
                        .filter(line => line.length > 0)
                        .join('\n');
                };

                const tableNamesRequired = extractTableNames(commands)
                for (let req of tableNamesRequired) {
                    if (!pt.getTableByName(req)) {
                        if (!isTableCreated(req, commands)) {
                            pt.setMessage('Could not find table "' + req + '"')
                            return;

                        }
                    }
                }

                const cleanedCommands = removeComments(commands);
                const processedCommands = splitAndRejoin(cleanedCommands);

                for (const char of processedCommands) {
                    if (char === '{') {
                        braceLevel++;
                        processingBraces = true;
                    }

                    if (processingBraces) {
                        braceContent += char;
                    } else {
                        currentLine += char;
                    }

                    if (char === '}') {
                        braceLevel--;
                        if (braceLevel === 0) {
                            processingBraces = false;

                            if (currentLine.trim().length > 3) {
                                currentLine += braceContent;
                            } else {

                                if (currentLine.trim()) {
                                    lines.push(currentLine.trim());
                                }
                                currentLine = braceContent.trim();
                            }

                            braceContent = '';
                        }
                    }

                    if (char === '\n' && braceLevel === 0 && !processingBraces) {

                        if (currentLine.trim()) {
                            lines.push(currentLine.trim());
                        }
                        currentLine = '';
                    }
                }

                if (currentLine.trim()) {
                    lines.push(currentLine.trim());
                }

                for (const line of lines) {
                    await this.executeCommand(line);
                }
            }

            testScopeFormat(input) {
                const regex = /^\w+:$/;
                return regex.test(input);
            }

            goto(...objectname__) {
                const objectname = objectname__.join(' ').trim();

                const normalize = s => s.toLowerCase().replace(/_/g, ' ');
                const firstHalf = s => s.slice(0, Math.ceil(s.length / 5));

                const targetFull = normalize(objectname);
                const targetHalf = firstHalf(targetFull);

                let found = null;

                for (let r of pt.root) {
                    if (normalize(r.name) === targetFull) found = r;
                }
                for (let r of pt.m_plots) {
                    if (normalize(r.name) === targetFull) found = r;
                }

                function levenshtein(a, b) {
                    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1));
                    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
                    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
                    for (let i = 1; i <= a.length; i++) {
                        for (let j = 1; j <= b.length; j++) {
                            dp[i][j] = a[i - 1] === b[j - 1]
                                ? dp[i - 1][j - 1]
                                : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
                        }
                    }
                    return dp[a.length][b.length];
                }

                if (!found) {
                    const candidates = [...pt.root, ...pt.m_plots];

                    let bestHalfDist = Infinity;
                    let bestHalfGroup = [];

                    for (let r of candidates) {
                        const nameFull = normalize(r.name);
                        const nameHalf = firstHalf(nameFull);
                        const distHalf = levenshtein(targetHalf, nameHalf);

                        if (distHalf < bestHalfDist) {
                            bestHalfDist = distHalf;
                            bestHalfGroup = [r];
                        } else if (distHalf === bestHalfDist) {
                            bestHalfGroup.push(r);
                        }
                    }

                    let picked = null;
                    let pickedFullDist = Infinity;

                    if (bestHalfGroup.length === 1) {

                        const r = bestHalfGroup[0];
                        const fullDist = levenshtein(targetFull, normalize(r.name));
                        picked = r;
                        pickedFullDist = fullDist;
                    } else {

                        for (let r of bestHalfGroup) {
                            const fullDist = levenshtein(targetFull, normalize(r.name));
                            if (fullDist < pickedFullDist) {
                                pickedFullDist = fullDist;
                                picked = r;
                            }
                        }
                    }

                    found = pickedFullDist <= 3 ? picked : null;
                }

                if (found) {
                    if (found.wells) {
                        pt.zoomintoplate(found);
                    } else {
                        pt.zoomintoplot(found);
                    }
                }
            }

            async executeCommand(line) {

                if (line == null || line.length === 0) {
                    return;
                }
                line = line.trim();
                function splitAtTopLevelColon(str) {
                    let openBrackets = 0;
                    for (let i = 0; i < str.length; i++) {
                        const ch = str[i];
                        if (ch === '[') openBrackets++;
                        else if (ch === ']') openBrackets--;
                        else if (ch === ':' && openBrackets === 0) {

                            const left = str.slice(0, i).trim();
                            const right = str.slice(i + 1).trim();
                            return [left, '=' + right];
                        }
                    }
                    return [str.trim(), ''];
                }

                if (this.testScopeFormat(line.trim())) {
                    let refStr = line.substring(0, line.length - 1)
                    let r = pt.getRefByName(refStr)
                    if (!r) {
                        console.print(' Reference is undefined ')
                        let va = await prompt("Reference scope:", ["table"], { "table": '' }, 300, 300)
                        let value = va['table']
                        r = pt.getRefByName(value)
                        this.ref = r[0]
                        return null;
                    } else {
                        this.ref = r[0]
                    }
                } else {
                    const scopeMatch = line.match(/^(.+):$/);
                    function extractParenthesesContent(str) {
                        const match = str.match(/\(([^)]+)\)/);
                        return match ? match[1] : null;
                    }

                    if (line.startsWith('prompt') && line.endsWith(':')) {
                        let desc = extractParenthesesContent(line)
                        let va = await prompt(desc, ["value"], { "value": '' }, 300, 300)
                        let value = va['value']
                        let r = pt.getRefByName(value)
                        if (r && r.length > 0) {
                            this.ref = r[0]
                        }

                        return;

                    }
                    else if (line.startsWith('load')) {

                        return;
                    } else if (line.startsWith("remove")) {

                        if (line === 'remove all timelines') {
                            for (let plt of pt.m_plots) {
                                if (plt.type === 'timeline') {
                                    pt.removePlot(plt)
                                }
                            }
                        }
                        if (line === 'remove all plots') {
                            for (let plt of pt.m_plots) {
                                pt.m_plots = []
                            }
                        }
                        if (line === 'remove all folders') {
                            for (let plt of pt.root) {
                                if (plt.plateType === 'package') {
                                    pt.removePlate(plt)
                                }
                            }
                        }
                        if (line === 'remove all glyphs') {
                            pt.glyphs = []
                        }
                        if (line === 'remove all tables') {
                            pt.root = []
                            pt.formulas = {}
                        }

                        if (line === 'remove canvas') {
                            pt.root = []
                            pt.glyphs = []
                            pt.m_plots = []

                            pt.clearPlots();
                            pt.clearGlyphs();
                            pt.formulas = {}
                            pt.bookmarks = {}

                            pt.__selectionListeners = []
                            pt.__pointListeners = []
                            pt.__updateListener = []
                            pt.__stack = []
                            pt.__redostack = [];
                            pt.__stack_menu = null;
                            pt.__redo_stack_menu = null;
                        }

                        if (line === 'remove canvas grid') {
                            pt.resetGrid();
                        }

                        function parseRemoveTableCommand(command) {
                            const pattern = /^remove table \$\{(.+)\}$/;
                            const match = command.trim().match(pattern);
                            if (match) {
                                return match[1];
                            }
                            return null;
                        }
                        let name = parseRemoveTableCommand(line)
                        console.log(' name ' + name)
                        if (name) {
                            for (let table of pt.root) {
                                if (table.name.toLowerCase() === name.trim().toLowerCase()) {
                                    pt.removePlate(table)
                                }
                            }

                        }

                    }
                    else
                        if (scopeMatch) {

                            this.currentScope = scopeMatch[1];
                            let r = pt.searchByName(this.currentScope)
                            if (r != null && r.length > 0) {
                                this.ref = r[0]
                            } else {
                                pt.setMessage(" Table not found " + scopeMatch)
                            }
                            return;
                        }

                    let args = line.match(/(?:\{[^}]*\}|\([^)]*\)|"[^"]*"|[^\s"])+/g).map(arg => {

                        if (arg.startsWith('"') && arg.endsWith('"')) {
                            return arg.slice(1, -1).replace(/\\"/g, '"');
                        }
                        return arg;
                    });
                    function isAFunctionForAPlate(conditionStr) {
                        // NEW: handle "=" case first
                        if (typeof conditionStr === "string" && conditionStr.trim().startsWith("=")) {
                            return true;
                        }

                        const regex = /\[(\d+):(\d+)]\[(\d+):(\d+)]:/;
                        const match = conditionStr.match(regex);

                        if (!match) {
                            return false;
                        }

                        const row1 = parseInt(match[1], 10);
                        const col1 = parseInt(match[2], 10);
                        const row2 = parseInt(match[3], 10);
                        const col2 = parseInt(match[4], 10);

                        return function (data) {
                            const val1 = data[row1]?.[col1];
                            const val2 = data[row2]?.[col2];

                            return [val1, val2];
                        };
                    } const command = args.shift();
                    if (isAFunctionForAPlate(command)) {
                        const table = pt.getTableByName(this.ref.name);
                        debugger;
                        let [sp0, sp1] = splitAtTopLevelColon(command);

                        if (sp1.startsWith('=')) {

                            const cleaned = sp1.replace(/^=+/, '');
                            table.formula[sp0] = cleaned;
                        } else {
                            const ww = table.getWellsByString(sp0);
                            for (const w of ww) {
                                w.setValue(sp1);
                            }
                        }

                    }

                    else if (this[command.toLowerCase()]) {
                        function combineLinesStartingWithBrace(array) {
                            const result = [];
                            let combining = false;
                            let combinedLine = "";
                            for (const line of array) {
                                if (line.trim().startsWith("{")) {

                                    combining = true;
                                    combinedLine = line;
                                } else if (combining) {

                                    combinedLine += line;
                                } else {

                                    result.push(line);
                                }
                            }

                            if (combining) {
                                result.push(combinedLine);
                            }

                            return result;
                        }
                        args = combineLinesStartingWithBrace(args)
                        if (typeof this[command.toLowerCase()] === 'function') {
                            await this[command.toLowerCase()](...args, this.currentScope);
                        }
                    } else {
                        if (this.ref && pt.selectedPlate && pt.selectedPlate.getSelectedWellsInOrder() > 0) {
                            let b = pt.selectedPlate.getSelectedWellsInOrder();

                            if (pt.selectedPlate && b.length > 0) {
                                let [sp0, sp1] = splitAtTopLevelColon(line);
                                sp1 = sp1.slice(1);

                                let wpb = b;
                                let values;

                                if (sp1.includes(',')) {

                                    let rawValues = sp1.split(',').map(v => v.trim());

                                    values = [];
                                    for (let i = 0; i < wpb.length; i++) {
                                        values.push(rawValues[i % rawValues.length]);
                                    }
                                } else {

                                    values = Array(wpb.length).fill(sp1);
                                }

                                for (let i = 0; i < wpb.length; i++) {
                                    wpb[i].setValue(values[i]);
                                }
                            }
                        }

                    }
                }
            }

            async new(object, name, config) {

                if (object.toLowerCase() === 'plot') {
                    let plotFactory = await exec('baja/plots/plot-factory.js', pt)
                    plotFactory(name, config)
                }
                else if (object.toLowerCase() === 'table') {

                    function parseConfig(config) {
                        if (typeof config === 'string') {
                            const match = config.match(/^(\d+),(\d+)$/);
                            if (match) {
                                const num1 = parseInt(match[1], 10);
                                const num2 = parseInt(match[2], 10);
                                return [num1, num2];
                            }
                        }
                        return null;
                    }

                    if (!name || name.length <= 0)
                        name = generateNautName();
                    if (config != null) {

                        let dimensions = parseConfig(config)
                        const plate = pt.newRoot(name, 'data', dimensions[0], dimensions[1]);
                        pt.zoomintoplate(plate)

                    } else {
                        let newPlate = pt.newRoot(name, 'data');

                        setTimeout(() => {
                            pt.zoomintoplate(newPlate)
                        }, 1000)
                    }
                }

            }

            async transpose() {
                if (!this.ref) {
                    let va = await prompt("Reference scope:", ["table"], { "table": '' }, 300, 300)
                    let value = va['table']
                    let r = pt.getRefByName(value)
                    if (r && r.length > 0) {
                        this.ref = r[0]
                    }
                }
                if (this.ref) {
                    await this.ref.transpose(pt);
                }
            }

            async zoomin(name) {

                return new Promise(async (resolve, reject) => {

                    if (pt) {

                        let p = pt.getRefByName(name)
                        if (p && p.length > 0) {
                            await pt.zoomintoplate(p[0]);
                        }
                    }
                    setTimeout(() => {
                        resolve();

                    }
                        , 500)
                })

            }

            adjust_dimensions() {
                if (this.ref)
                    this.ref.adjustDimensionsToFitScale(pt)
            }

            untag() {

            }
            async delete(...values) {

                if (this.ref) {
                    let column = this.ref.getSelectedColumn()
                    let rows = this.ref.getSelectedRow();
                    if (!column && !rows || (column.length == 0 && rows.length == 0)) {
                        let selected_wells = this.ref.getSelectedWellsInOrder();
                        for (let item of selected_wells) {
                            item.setValue('')
                        }
                    } else {
                        if (column && column.length > 0) {
                            this.ref.removeFullySelectedColumns();
                        }
                        if (rows && rows.length > 0) {
                            this.ref.removeFullySelectedRows();
                        }
                    }
                }
            }

            async color(...values) {

                if (values[0]) {
                    if (values[0] === 'selected') {
                        this.ref.setColorSelected(values[1])
                    }
                }
            }

            async sumproduct(column1, column2) {

            }
            async sumup(column) {

            }

            async min(arr) {
            }

            async select(range, qualifier, columnNumber, operator, value) {

                function convertToSelectSyntax(range, qualifier) {
                    if (range === 'column') {

                        if (!isNaN(parseInt(qualifier))) {
                            const col = parseInt(qualifier, 10);
                            return `[${col}:${col}][0:]`;
                        }

                        const rangeMatch = qualifier.match(/^(\d+)[-:](\d+)$/);
                        if (rangeMatch) {
                            const startCol = parseInt(rangeMatch[1], 10);
                            const endCol = parseInt(rangeMatch[2], 10);
                            return `[${startCol}:${endCol}][0:]`;
                        }
                        throw new Error("Qualifier must be a single column number or a column range (e.g., '2-4')");
                    } else {
                        throw new Error("Only 'column' range is supported");
                    }
                }

                return new Promise(async (resolve, reject) => {
                    range = range.trim();
                    if (range === 'column' && qualifier === 'where') {
                        let col = parseInt(columnNumber)
                        if (value.startsWith('prompt')) {
                            function extractParenthesesContent(str) {
                                const match = str.match(/\(([^)]+)\)/);
                                return match ? match[1] : null;
                            }
                            const desc = extractParenthesesContent(value)
                            let va = await prompt(desc, ["value"], { "value": '' }, 300, 300)
                            value = va['value']
                        }
                        this.ref.selectColumnsByRowValue(col, value)
                        return resolve()
                    }
                    if (range === 'column' && Number.isInteger(parseInt(qualifier))) {
                        await this.select(convertToSelectSyntax(range, qualifier))
                        resolve();
                    }
                    else
                        if (range === 'row' && qualifier === 'where') {
                            let col = parseInt(columnNumber)
                            console.log('debubg');
                            if (value.startsWith('prompt')) {
                                function extractParenthesesContent(str) {
                                    const match = str.match(/\(([^)]+)\)/);
                                    return match ? match[1] : null;
                                }
                                const desc = extractParenthesesContent(value)
                                let va = await prompt(desc, ["value"], { "value": '' }, 300, 300)
                                value = va['value']
                            }
                            this.ref.selectRowsByColumnValue(col, value)
                            return resolve()

                        } else
                            if (range === 'top' && qualifier === 'row') {
                                if (this.ref) {
                                    this.ref.selectWellsByString('[0:][0:0]')
                                    return resolve()
                                }
                            } else if (range === 'inverse') {
                                this.ref.seelctInverse();
                                return resolve()
                            }
                            else if (/^\d+,\d+$/.test(range)) {
                                const [col, row] = range.split(',').map(Number);
                                let rangeSyntax;
                                switch (qualifier.toLowerCase()) {
                                    case 'down':
                                        rangeSyntax = `[${col}:${col}][${row}:]`;
                                        break;
                                    case 'up':
                                        rangeSyntax = `[${col}:${col}][0:${row}]`;
                                        break;
                                    case 'left':
                                        rangeSyntax = `[0:${col}][${row}:${row}]`;
                                        break;
                                    case 'right':
                                        rangeSyntax = `[${col}:][${row}:${row}]`;
                                        break;
                                    default:
                                        throw new Error(`Invalid qualifier: ${qualifier}`);
                                }

                                await this.ref.highlightWells(rangeSyntax);

                            } else if (range.indexOf('[') === 0) {

                                await this.ref.highlightWells(range);
                            } else if (range === 'row') {
                                await this.ref.highlightRows(qualifier);
                            } else if (range === 'tag') {
                                await this.ref.selectWellsByTag(qualifier);
                            } else {

                                let wells = this.ref.getColumnHeadersWithValue(range)
                                let colIndex = []
                                for (let w of wells) {
                                    let rw = this.ref.getIndexOf(w)
                                    colIndex.push({
                                        row: rw.colIdx + 1,
                                        col: rw.rowIdx
                                    })
                                }

                                console.log('debubg');
                                if (columnNumber != undefined) {
                                    let cwells = this.ref.getColumnHeadersWithValue(columnNumber)
                                    let ccindex = []
                                    for (let w of cwells) {
                                        ccindex.push(this.ref.getColIndex(w))
                                    }
                                    function toFloatOrString(value) {
                                        let num = parseFloat(value);
                                        return isNaN(num) ? String(value) : num;
                                    }
                                    for (let i of colIndex) {
                                        for (let j of ccindex) {
                                            this.select_column(i.col, 'where', j, operator, toFloatOrString(value))
                                        }
                                    }
                                } else {
                                    console.log('debubg');
                                    for (let i of colIndex) {
                                        this.select(`[${i.col}:${i.col}][${i.row}:]`)

                                    }

                                }

                                resolve();
                            }
                    resolve()

                })

            }

            async plotic50(...values) {
                console.log('debubg');

                if (values.length >= 1) {
                    let pname = values[0]
                    let plot = pt.getPlotByName(pname.trim())

                    function convertPointsToWellValues(points) {
                        const xArray = points.map(point => ({ value: parseFloat(point.name) }));
                        const yArray = points.map(point => ({ value: point.y }));
                        return [xArray, yArray];
                    }

                    const [xArray, yArray] = convertPointsToWellValues(plot.scatterData.points)
                    const ic50params = calculateIC50(xArray, yArray)
                    const sigmoid = async (grid, ctx) => {
                        ctx.beginPath();
                        for (let x = grid.xmin; x <= grid.xmax; x++) {
                            let y = ic50params.min + (ic50params.max - ic50params.min) / (1 + Math.pow(10, (Math.log10(ic50params.ic50 + 1e-6) - x) * ic50params.slope));
                            if (x === grid.xmin) {
                                ctx.moveTo(grid.X(x), grid.Y(y));
                            } else {
                                ctx.lineTo(grid.X(x), grid.Y(y));
                            }
                        }
                        ctx.stroke();

                    }
                    plot.addLineEquation({
                        mfunction: sigmoid,
                        label: `sigmoid`,
                        color: 'black',
                    });

                }
            }

            async ic50(...values) {

                if (values[0] === 'selected') {
                    let se = this.ref.getSelectedWells();
                    if (se.length > 1) {
                        let xse = se[0]
                        let yse = se[1]
                        const ic50optimizedParams = calculateIC50(xse, yse);
                        let tex = pt.newSimplePlate(uniqueString(this.ref.name + 'ic50', pt.getTableNames()), 1, 1, this.ref)
                        tex.setValueByIndex(0, 0, ic50optimizedParams.ic50)
                        pt.setNextToPlate(tex, this.ref);
                        return ic50optimizedParams;
                    }
                }
            }

            async convert(...values) {
                if (values && values.length > 1) {

                    if (values[0] === 'to' && values[1] === 'column') {

                        this.ref.getSelectedWellsInOrder()
                        this.ref.selectAll();
                        let w = this.ref.getSelectedWellsInOrder();
                        let newRow = [];
                        for (let r = 0; r < w.length; r++) {
                            newRow.push(w[r]);
                        }
                        this.ref.deselectAll();
                        this.ref.wells = [1]
                        this.ref.wells[0] = newRow;
                        this.ref.grid.xmax = 1;
                        this.ref.grid.ymax = w.length;
                        this.ref.grid.rescale();
                        pt.zoomintoplate(this.ref)
                    }
                }

            }

            async openfile(...values) {

                if (values && values.length > 0) {
                    function replaceFirstNode(path) {
                        const startsWithSlash = path.startsWith('/');
                        if (!startsWithSlash) {
                            path = '/' + path;
                        }
                        const parts = path.split('/');
                        for (let i = 1; i < parts.length; i++) {
                            if (parts[i].length > 0) {
                                parts[i] = getUser();
                                break;
                            }
                        }
                        const newPath = parts.join('/');
                        return startsWithSlash ? newPath : newPath.substring(1);
                    }
                    let path = replaceFirstNode(getUser() + '/' + values[0])
                    let jsonobj = {
                        'path': path,
                        'user': getUser()
                    }
                    let host_ = window['env']['apiUrl']
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');

                    let ffs = await Plate.buildPlateFromJSON(rs)
                    pt.addNextAvailableX(ffs)
                    pt.zoomintoplate(ffs)

                }
            }

            async copy(...values) {

                let se = pt.getSelectedWells()

                function arrayToExcelString(wells) {

                    const trimmedWells = wells.filter(col => col.some(cell => cell.value !== "" && cell.value !== null && cell.value !== undefined));

                    const transposed = trimmedWells[0].map((_, rowIndex) => trimmedWells.map(col => col[rowIndex]));

                    return transposed.map(row =>
                        row.map(cell => {

                            let cellText = String(cell.value).replace(/"/g, '""');

                            if (/[",\n\t]/.test(cellText)) {
                                cellText = `"${cellText}"`;
                            }
                            return cellText;
                        }).join('\t')
                    ).join('\n');
                }

                let v = arrayToExcelString(se)

                pt.setMessage("Copy")

                navigator.clipboard.writeText(v).then(() => {
                    console.log("Object copied to clipboard!");
                }).catch(err => {
                    console.error("Failed to copy object to clipboard: ", err);
                });

            }

            async totable(...values) {
                let name = values[0]
                const srcTable = this.ref;
                const range = this.ref.getSelectedWellRange()
                let newtable = this.createColumnAverageTableFromFormulaWithHeaders(srcTable, range, name)

                pt.zoomintoplate(newtable)

            }

            async paste(...values) {
                values = values.filter(item => item !== null);
                if (values && values.length === 1) {
                    const text = await navigator.clipboard.readText();
                    let table = await exec('baja/plate/data/data-table-parser.js', text)
                    let index = 0;
                    const m = values[0]
                    let first_plate = null;
                    for (let t of table) {
                        if (index > 0)
                            t.setName(m + index)
                        else
                            t.setName(m);
                        t.plateType = 'data'
                        pt.addNextAvailableX(t);
                        t.removeEmptyRowsAndColumns()
                        if (index === 0) {
                            first_plate = t;
                        }
                        index++;
                    }
                } else {

                    let se = this.ref.getSelectedWellsInOrder()
                    const text = await navigator.clipboard.readText();
                    try {
                        let js = JSON.parse(text)
                        let se_len = js.length;
                        for (let i = 0; i < se_len; i++) {
                            if (i < se.length) {
                                se[i].copyWell(js[i])
                            }
                        }
                    } catch (exception) {

                        try {
                            if (!navigator.clipboard || !navigator.clipboard.read) {
                                console.error("Clipboard API is not supported in this browser.");
                                return null;
                            }
                            const clipboardItems = await navigator.clipboard.read();
                            const results = [];
                            for (const item of clipboardItems) {
                                for (const type of item.types) {
                                    const clipboardData = await item.getType(type);
                                    if (type.startsWith("text/")) {
                                        const text = await clipboardData.text();
                                        let table = await exec('baja/plate/data/data-table-parser.js', text)
                                        console.log('debubg');
                                        table[0].selectWellsByString('[:][:]')

                                        let se2 = table[0].getSelectedWellsInOrder()

                                        let se_len = se2.length;
                                        for (let i = 0; i < se_len; i++) {
                                            if (i < se.length && i < se2.length) {
                                                se[i].setValue(se2[i].value)
                                            }
                                        }

                                    } else if (type.startsWith("image/")) {

                                        const blob = clipboardData;
                                        results.push({ type, content: URL.createObjectURL(blob) });
                                    } else {

                                        results.push({ type, content: clipboardData });
                                    }
                                }
                            }

                            console.log("Clipboard Items:", results);
                            return results;
                        } catch (error) {
                            console.error("Error accessing clipboard:", error);
                            return null;
                        }

                    }
                }
            }
            async formula(...ar) {
            }
            async insert(...ar) {
                if (ar[0] === 'row' && isIntegerValue(ar[1])) {
                    this.ref.insertRow(parseInt(ar[1]))
                }
                else if (ar[0] === 'column' && isIntegerValue(ar[1])) {
                    this.ref.insertCol(parseInt(ar[1]))
                }
                else if (ar[0] === 'values') {
                    let value = ar.slice(1).join(' ');
                    value = value.trim();

                    let v = await exec('baja/plate/ops/frun-object.js', value, pt);
                    let r = v['results']
                    let t = v['tags']
                    console.log('debubg');
                    let selected_wells = this.ref.getSelectedWellsInOrder();
                    let index = 0;
                    for (let it of selected_wells) {
                        let io = r[index++]
                        let i;
                        if (typeof io === 'number') {
                            i = io;
                        } else if (io && typeof io.value !== 'undefined') {
                            i = io.value;
                        }
                        if (i !== undefined && !isNaN(i)) {
                            it.setValue(parseFloat(i).toFixed(4));
                        } else {
                            it.value = i;
                        }

                        if (!it.properties) {
                            it.properties = {};
                        }

                    }
                } else {
                    let value = ar.join(' ')
                    value = value.trim();
                    let selected_wells = this.ref.getSelectedWellsInOrder();

                    if (checkString(value, this.plateTrack.getTablesByName())) {
                        for (let sel of selected_wells) {
                            sel.value = value
                        }
                    } else {
                        let v = await exec('baja/plate/ops/frun-object.js', value, pt);
                        let index = 0;
                        console.log('debubg');
                        let r = v['results']
                        let t = v['tags']
                        console.log('debubg');
                        for (let it of selected_wells) {
                            let io = r[index++]
                            let i;
                            if (typeof io === 'number') {
                                i = io;
                            } else if (io && typeof io.value !== 'undefined') {
                                i = io.value;
                            }
                            if (i !== undefined && !isNaN(i)) {
                                it.setValue(parseFloat(i).toFixed(4));
                            } else {
                                it.value = i;
                            }

                            if (!it.properties) {
                                it.properties = {};
                            }

                            if (t) {
                                it.setGroup(t);
                            }
                        }

                    }
                }
            }
            update(cell, ...values) {
                let row, col;
                if (cell.includes('[') && cell.includes(']')) {

                    let parsed = parseNumbersInBrackets(cell);
                    [col, row] = parsed[0];
                } else {

                    [col, row] = cell.split(',').map(Number);
                }
                this.ref.setValueByIndex(col, row, values.join('\n').trim());
            }
            add(value, index) {
                if (value.toLowerCase() === 'row') {
                    this.ref.addRow();
                } else
                    if (value.toLowerCase() === 'column') {
                        this.ref.addColumn();
                    }
            }
            remove(object, ...args) {
                if (object === 'tags') {
                    let selected_wells = this.ref.getSelectedWellsInOrder();
                    for (let sel of selected_wells) {
                        sel.group = {}
                    }
                } else if (object === 'tag') {

                    let selected_wells = this.ref.getSelectedWellsInOrder();
                    for (let sel of selected_wells) {
                        for (let a of args) {
                            sel.removeGroup(a)
                        }
                    }

                }
            }

            deselect() {
                this.ref.unhighlightWells();
            }

            deselectall() {
                pt.deselectAll();
            }
            calculateAggregatesByTags(values, requiredTags) {
                if (values.length === 0) return { aggregates: [], count: 0 };

                const grouped = values.reduce((acc, obj) => {
                    const filteredGroup = Object.fromEntries(
                        Object.entries(obj.group || {}).filter(([key]) => requiredTags.includes(key))
                    );
                    const tagKey = JSON.stringify({ ...filteredGroup, value: obj.value });

                    if (!acc[tagKey]) {
                        acc[tagKey] = [];
                    }
                    acc[tagKey].push(obj);
                    return acc;
                }, {});

                const aggregates = Object.entries(grouped).map(([tagString, groupValues]) => {
                    const result = groupValues.reduce((acc, obj) => {

                        acc.sum += (typeof obj.value === 'string' && !isNaN(parseFloat(obj.value)))
                            ? parseFloat(obj.value)
                            : (typeof obj.value === 'number' ? obj.value : 0); acc.squaredSum += obj.value ** 2;
                        acc.count += 1;
                        acc.groupIds.push(obj.uid);

                        Object.entries(obj.group || {}).forEach(([key, val]) => {
                            acc.group[key] = acc.group[key] ? acc.group[key] + val : val;
                        });
                        return acc;
                    }, { sum: 0, squaredSum: 0, count: 0, group: {}, groupIds: [] });

                    const meanValue = result.sum / result.count;
                    const variance = (result.squaredSum / result.count) - (meanValue ** 2);
                    const stdDev = Math.sqrt(variance);

                    return {
                        tag: JSON.parse(tagString),
                        value: meanValue,
                        stdDev: stdDev,
                        group: result.group,
                        groupIds: result.groupIds
                    };
                });

                return {
                    aggregates,
                    count: aggregates.length
                };
            }
            calculateAggregatesByOnlyTags(values) {
                if (values.length === 0) return { aggregates: [], count: 0 };
                const grouped = values.reduce((acc, obj) => {
                    const tagKey = JSON.stringify(obj.group);
                    if (!acc[tagKey]) {
                        acc[tagKey] = [];
                    }
                    acc[tagKey].push(obj);
                    return acc;
                }, {});

                const aggregates = Object.entries(grouped).map(([tagString, groupValues]) => {
                    const result = groupValues.reduce((acc, obj) => {
                        acc.sum += obj.value;
                        acc.squaredSum += obj.value ** 2;
                        acc.count += 1;
                        acc.groupIds.push(obj.uid);

                        if (obj.group) {

                            Object.entries(obj.group).forEach(([key, val]) => {
                                acc.group[key] = acc.group[key] ? acc.group[key] + val : val;
                            });
                        }
                        return acc;
                    }, { sum: 0, squaredSum: 0, count: 0, group: {}, groupIds: [] });

                    const meanValue = result.sum / result.count;
                    const variance = (result.squaredSum / result.count) - (meanValue ** 2);
                    const stdDev = Math.sqrt(variance);

                    return {
                        tag: JSON.parse(tagString),
                        value: meanValue,
                        stdDev: stdDev,
                        group: result.group,
                        groupIds: result.groupIds
                    };
                });

                return {
                    aggregates,
                    count: aggregates.length
                };
            }

            calculateAggregatesByValue(cells, categoryColumnIndex = 0) {

                console.log('debubg');

                const categoryValues = cells[categoryColumnIndex].map(cell => cell.value);

                const groupedIndices = categoryValues.reduce((acc, value, rowIndex) => {
                    if (!acc[value]) acc[value] = [];
                    acc[value].push(rowIndex);
                    return acc;
                }, {});

                const getAllOtherColumnValues = (rowIndex) => {
                    const values = [];
                    for (let colIndex = 0; colIndex < cells.length; colIndex++) {
                        if (colIndex !== categoryColumnIndex && cells[colIndex][rowIndex]) {
                            values.push(cells[colIndex][rowIndex].value);
                        }
                    }
                    return values;
                };

                const aggregates = Object.entries(groupedIndices).map(([key, rowIndices]) => {
                    let allValues = [];
                    rowIndices.forEach(rowIndex => {
                        const otherValues = getAllOtherColumnValues(rowIndex);
                        allValues = allValues.concat(otherValues);
                    });

                    const numericValues = allValues
                        .map(val => (typeof val === 'string' ? Number(val) : val))
                        .filter(val => !isNaN(val) && typeof val === 'number');

                    const meanValue = numericValues.length > 0
                        ? numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length
                        : null;

                    const variance = numericValues.length > 0
                        ? numericValues.reduce((sum, val) => sum + (val - meanValue) ** 2, 0) / numericValues.length
                        : null;

                    const stdDev = variance !== null ? Math.sqrt(variance) : null;

                    return {
                        tag: key,
                        value: meanValue,
                        stdDev: stdDev
                    };
                });

                return {
                    aggregates,
                    count: aggregates.length
                };
            }

            select_tag(...values) {

                if (this.ref) {
                    let t = values[0]
                    if (t.indexOf(',') > 0) {
                        t = t.split(',')
                        for (let i of t) {
                            this.ref.selectWellsByTag(i)
                        }
                    } else
                        this.ref.selectWellsByTag(t)
                }

            }

            trim(...values) {

                if (values && values[0] === 'up') {

                    let wells = this.ref.getSelectedWellsInTimeOrder();
                    if (wells && wells.length > 0) {
                        let id = this.ref.getWellIndicies(wells[0])
                        let colIndex = id.colIdx;
                        let rowIndex = id.rowIdx;
                        this.ref.removeRowsUp(rowIndex)
                    }

                }

            }

            select_column_deprecated(...values) {
                console.log('debubg');
                if (values[1] && values[1].trim() === 'where') {
                    let selectColum = parseInt(values[0]);
                    const queryString = values.slice(2).join(' ');
                    console.log('debubg');
                    const evaluateCondition = (row, condition) => {

                        let operatorMatch = condition.match(/(<=|>=|!=|<|>|=)/);
                        if (!operatorMatch) return false;

                        let [key, opValue] = condition.split(operatorMatch[0]).map(str => str.trim());
                        const operator = operatorMatch[0];
                        let negate = false;

                        if (key.startsWith('not ')) {
                            negate = true;
                            key = key.substring(4).trim();
                        }

                        const colIndex = parseInt(key, 10);
                        const well = this.ref.wells[colIndex][row];

                        let conditionMet = false;
                        if (well) {
                            const wellValue = well.value;
                            const parsedValue = parseInt(opValue, 10);

                            if (isNaN(parsedValue)) {

                                switch (operator) {
                                    case '=':
                                        conditionMet = wellValue === opValue;
                                        break;
                                    case '!=':
                                        conditionMet = wellValue !== opValue;
                                        break;
                                }
                            } else {

                                switch (operator) {
                                    case '=':
                                        conditionMet = wellValue === parsedValue;
                                        break;
                                    case '<':
                                        conditionMet = wellValue < parsedValue;
                                        break;
                                    case '>':
                                        conditionMet = wellValue > parsedValue;
                                        break;
                                    case '<=':
                                        conditionMet = wellValue <= parsedValue;
                                        break;
                                    case '>=':
                                        conditionMet = wellValue >= parsedValue;
                                        break;
                                    case '!=':
                                        conditionMet = wellValue !== parsedValue;
                                        break;
                                }
                            }
                        }
                        return negate ? !conditionMet : conditionMet;
                    }

                    const matchRow = (row, conditions) => {
                        let result = false;
                        let currentLogic = '';

                        for (const condition of conditions) {
                            if (condition === 'or') {
                                currentLogic = 'or';
                            } else if (condition === 'and') {
                                currentLogic = 'and';
                            } else {
                                const conditionMet = evaluateCondition(row, condition);
                                if (currentLogic === 'and') {
                                    result = result && conditionMet;
                                } else {
                                    result = result || conditionMet;
                                }
                            }
                        }
                        return result;
                    };

                    const matchingRows = this.ref.wells[selectColum].map((_, row) => row);
                    const conditions = queryString.split(/\s+(and|or)\s+/);

                    const finalRows = matchingRows.filter(row => matchRow(row, conditions));

                    for (const row of finalRows) {

                        this.ref.wells[selectColum][row].selectIt();
                        console.log(" sel3ected column " + selectColum)
                    }
                }
            }

            select_column(...values) {
                if (values[1] && values[1].trim() === 'where') {
                    let selectColum = parseInt(values[0]);
                    const queryString = values.slice(2).join(' ');

                    const evaluateCondition = (row, condition) => {
                        let operatorMatch = condition.match(/(<=|>=|!=|<|>|=)/);
                        if (!operatorMatch) return false;

                        let [key, opValue] = condition.split(operatorMatch[0]).map(str => str.trim());
                        const operator = operatorMatch[0];
                        let negate = false;

                        if (key.startsWith('not ')) {
                            negate = true;
                            key = key.substring(4).trim();
                        }

                        const colIndex = parseInt(key, 10);
                        const well = this.ref.wells[colIndex][row];

                        let conditionMet = false;
                        if (well) {
                            const wellValue = well.value;
                            const parsedValue = parseFloat(opValue);

                            if (isNaN(parsedValue)) {
                                switch (operator) {
                                    case '=':
                                        conditionMet = wellValue === opValue;
                                        break;
                                    case '!=':
                                        conditionMet = wellValue !== opValue;
                                        break;
                                }
                            } else {
                                switch (operator) {
                                    case '=':

                                        conditionMet = Math.abs(wellValue - parsedValue) < 0.01;
                                        break;
                                    case '<':
                                        conditionMet = wellValue < parsedValue;
                                        break;
                                    case '>':
                                        conditionMet = wellValue > parsedValue;
                                        break;
                                    case '<=':
                                        conditionMet = wellValue <= parsedValue;
                                        break;
                                    case '>=':
                                        conditionMet = wellValue >= parsedValue;
                                        break;
                                    case '!=':
                                        conditionMet = Math.abs(wellValue - parsedValue) >= 0.01;
                                        break;
                                }
                            }
                        }
                        return negate ? !conditionMet : conditionMet;
                    };

                    const matchRow = (row, conditions) => {
                        let stack = [];
                        for (const condition of conditions) {
                            if (condition === 'or' || condition === 'and') {
                                stack.push(condition);
                            } else {
                                const conditionMet = evaluateCondition(row, condition);
                                if (stack.length > 0 && (stack[stack.length - 1] === 'or' || stack[stack.length - 1] === 'and')) {
                                    const logic = stack.pop();
                                    const prev = stack.pop();
                                    stack.push(logic === 'and' ? prev && conditionMet : prev || conditionMet);
                                } else {
                                    stack.push(conditionMet);
                                }
                            }
                        }
                        return stack.length > 0 ? stack[0] : false;
                    };
                    const matchingRows = this.ref.wells[selectColum].map((_, row) => row);
                    const conditions = queryString.split(/\s+(and|or)\s+/);
                    const finalRows = matchingRows.filter(row => matchRow(row, conditions));
                    for (const row of finalRows) {
                        this.ref.wells[selectColum][row].selectIt();
                    }
                } else {

                }
            }

            highlight_rows(...values) {
                function getValueAfterEquals(text) {
                    const match = text.match(/\s*=\s*(.*)/);
                    return match ? match[1].trim() : null;
                }

                if (values[0].startsWith('value=')) {
                    if (!this.ref) {
                        pt.setMessage(" Scope not defined ")
                        return;
                    } else {
                        let va = getValueAfterEquals(values[0])
                        this.ref.highlightRows(va);
                    }
                }
                else {
                    pt.setMessage(" Unknown command highlight_rows " + values)
                }

            }

            select_rows(...values) {

            }

            aggregate(...values) {

                if (!this.ref) {
                    this.ref = pt;
                }

                if (values[0] === 'on') {
                    let from_selected_wells = this.ref.getSelectedWells();

                    function toFloatOrString(value) {
                        let num = parseFloat(value);
                        return isNaN(num) ? String(value) : num;
                    }
                    let column = toFloatOrString(values[1])
                    if (typeof column === 'string') {
                        let wells = this.ref.getColumnHeadersWithValue(column)
                        column = this.ref.getColIndex(wells[0])
                    }
                    if (isNaN(column)) {
                        pt.setMessage(" Column " + value[1] + " was not found....")
                        return;
                    }

                    let agv_sum = this.calculateAggregatesByValue(from_selected_wells, column)
                    let agv = agv_sum.aggregates
                    if (agv_sum.count === 1) {
                        pt.setMessage(agv_sum.count + " group.")
                    } else
                        pt.setMessage(agv_sum.count + " different groups found.")
                    this.ref.unhighlightWells();
                    let ltable = this.ref;
                    let tablename = values[3]
                    if (tablename !== 'current') {
                        ltable = this.plateTrack.getTableByName(tablename)
                        if (!ltable || ltable.length === 0) {
                            ltable = pt.newSimplePlate(tablename, 3, agv.length + 1, this.ref)
                            ltable.plateType = 'graph-table'
                        }

                    }
                    ltable.selectWellsByString('[0:][0:0]')
                    let into_selected_wells = ltable.getSelectedWellsInOrder();
                    into_selected_wells[0].setValue('Tags')
                    into_selected_wells[1].setValue('Value')
                    into_selected_wells[2].setValue('Standard deviation')
                    ltable.deselectWells();
                    ltable.selectWellsByString('[0:0][1:]')
                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    let index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]

                            if (s.tag) {
                                i.setValue((s.tag))
                            }
                            i.setGroup('Aggregation_group')
                            i.setGroup('Tag')

                        }
                    }
                    ltable.deselectWells();
                    ltable.selectWellsByString('[1:1][1:]')

                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]
                            i.setValue(s.value)
                            i.resetGroup(s.group)
                            i.setGroup('Value')
                            i.properties['refIDs'] = s.groupIds;
                            i.stdv = s.stdDev;
                        }
                    }

                    ltable.deselectWells();
                    ltable.selectWellsByString('[2:2][1:]')

                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]
                            i.setValue(s.stdDev)
                            i.setGroup('Stdev')
                        }
                    }
                    ltable.deselectWells();

                } else
                    if (values[1] === 'on') {
                        const tablename = values[4];

                        if (!this.ref.selectWellsByString) {
                            pt.setMessage("Scope is incorrect.");
                            return;
                        }

                        function parseRange(str) {
                            const m = str.match(/\[(\d+):(\d+)\]\[(\d+):(\d+)\]/);
                            if (!m) return null;
                            return {
                                x1: parseInt(m[1], 10),
                                x2: parseInt(m[2], 10),
                                y1: parseInt(m[3], 10),
                                y2: parseInt(m[4], 10)
                            };
                        }

                        function avg(nums) {
                            return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : "";
                        }

                        function stdv(nums, mean) {
                            if (nums.length < 2) return 0;
                            return Math.sqrt(
                                nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (nums.length - 1)
                            );
                        }

                        const range = parseRange(values[0]);
                        if (!range) {
                            pt.setMessage("Invalid range.");
                            return;
                        }

                        const categoryCol = parseInt(values[2], 10);
                        if (Number.isNaN(categoryCol)) {
                            pt.setMessage("Invalid category column.");
                            return;
                        }

                        const aggregationCols = [];
                        for (let x = range.x1; x <= range.x2; x++) {
                            if (x !== categoryCol) aggregationCols.push(x);
                        }

                        const groups = {};

                        for (let y = range.y1; y <= range.y2; y++) {
                            const categoryWell = this.ref.wells[categoryCol]?.[y];
                            if (!categoryWell) continue;

                            let tag = categoryWell.value;
                            if (typeof tag === 'string') tag = tag.trim();
                            if (!tag) continue;

                            if (!groups[tag]) groups[tag] = {};

                            for (let x of aggregationCols) {
                                const well = this.ref.wells[x]?.[y];
                                if (!well) continue;

                                const n = parseFloat(well.value);
                                if (Number.isNaN(n)) continue;

                                if (!groups[tag][x]) groups[tag][x] = [];
                                groups[tag][x].push(n);
                            }
                        }

                        const tags = Object.keys(groups);
                        const outCols = 1 + aggregationCols.length * 2;
                        const outRows = tags.length + 1;

                        let ltable = this.ref;
                        if (tablename !== 'current') {
                            ltable = this.plateTrack.getTableByName(tablename);
                            if (!ltable || ltable.length === 0) {
                                ltable = pt.newSimplePlate(tablename, outCols, outRows, this.ref);
                                ltable.plateType = 'graph-table';
                            }
                        }

                        ltable.wells[0][0].setValue('Tags');

                        aggregationCols.forEach((col, i) => {
                            const avgCol = 1 + i * 2;
                            const stdCol = avgCol + 1;

                            ltable.wells[avgCol][0].setValue('Column ' + col + ' Average');
                            ltable.wells[stdCol][0].setValue('Column ' + col + ' Standard deviation');
                        });

                        tags.forEach((tag, rowIndex) => {
                            const y = rowIndex + 1;

                            ltable.wells[0][y].setValue(tag);
                            ltable.wells[0][y].setGroup('Aggregation_group');
                            ltable.wells[0][y].setGroup('Tag');

                            aggregationCols.forEach((col, i) => {
                                const nums = groups[tag][col] || [];
                                const mean = avg(nums);
                                const sd = mean === "" ? "" : stdv(nums, mean);

                                const avgCol = 1 + i * 2;
                                const stdCol = avgCol + 1;

                                ltable.wells[avgCol][y].setValue(mean);
                                ltable.wells[avgCol][y].setGroup('Value');

                                ltable.wells[stdCol][y].setValue(sd);
                                ltable.wells[stdCol][y].setGroup('Stdev');
                            });
                        });

                        pt.setMessage(tags.length + " groups found.");
                        ltable.deselectWells();
                    }
                    else
                        if (values[0] === 'into') {
                            let { tablename, range } = parseTableString(values[1])
                            let from_selected_wells = this.ref.getSelectedWells();
                            if (from_selected_wells.length === 0) {
                                this.ref.selectWellsByString('[0:][0:]')
                                from_selected_wells = this.ref.getSelectedWells();
                            }
                            let agv_sum = this.calculateAggregatesByValue(from_selected_wells)
                            let agv = agv_sum.aggregates
                            if (agv_sum.count === 1) {
                                pt.setMessage(agv_sum.count + " group.")
                            } else
                                pt.setMessage(agv_sum.count + " different groups found.")
                            this.ref.unhighlightWells();
                            let ltable = this.ref;
                            if (tablename !== 'current') {
                                ltable = this.plateTrack.getTableByName(tablename)
                                if (!ltable || ltable.length === 0) {
                                    ltable = pt.newSimplePlate(tablename, 3, agv.length + 1, this.ref)
                                    ltable.plateType = 'graph-table'
                                }

                            }
                            ltable.selectWellsByString('[0:][0:0]')
                            let into_selected_wells = ltable.getSelectedWellsInOrder();
                            into_selected_wells[0].setValue('Tags')
                            into_selected_wells[1].setValue('Value')
                            into_selected_wells[2].setValue('Standard deviation')
                            ltable.deselectWells();
                            ltable.selectWellsByString('[0:0][1:]')
                            into_selected_wells = ltable.getSelectedWellsInOrder();
                            let index = 0;
                            for (let s of agv) {
                                if (index < into_selected_wells.length) {
                                    let i = into_selected_wells[index++]

                                    if (s.tag) {
                                        i.setValue((s.tag))
                                    }
                                    i.setGroup('Aggregation_group')
                                    i.setGroup('Tag')

                                }
                            }
                            ltable.deselectWells();
                            ltable.selectWellsByString('[1:1][1:]')

                            into_selected_wells = ltable.getSelectedWellsInOrder();
                            index = 0;
                            for (let s of agv) {
                                if (index < into_selected_wells.length) {
                                    let i = into_selected_wells[index++]
                                    i.setValue(s.value)
                                    i.resetGroup(s.group)
                                    i.setGroup('Value')
                                    i.properties['refIDs'] = s.groupIds;
                                    i.stdv = s.stdDev;
                                }
                            }

                            ltable.deselectWells();
                            ltable.selectWellsByString('[2:2][1:]')

                            into_selected_wells = ltable.getSelectedWellsInOrder();
                            index = 0;
                            for (let s of agv) {
                                if (index < into_selected_wells.length) {
                                    let i = into_selected_wells[index++]
                                    i.setValue(s.stdDev)
                                    i.setGroup('Stdev')
                                }
                            }
                            ltable.deselectWells();

                        } else
                            if (values[0] === 'on') {

                                function isIntegerString(str) {
                                    return /^-?\d+$/.test(str);
                                }
                                if (isIntegerString(values[1])) {
                                    let column = parseInt(values[1]);

                                }

                                let { tablename, range } = parseTableString(values[1])
                                let from_selected_wells = this.ref.getSelectedWellsInOrder();
                                if (from_selected_wells.length === 0) {
                                    this.ref.selectWellsByString('[0:][0:]')

                                    from_selected_wells = this.ref.getSelectedWellsInOrder();
                                }

                                console.log('debubg');

                                let agv_sum = this.calculateAggregatesByTags(from_selected_wells)

                                let agv = agv_sum.aggregates
                                if (agv_sum.count === 1) {
                                    pt.setMessage(agv_sum.count + "group.")
                                } else
                                    pt.setMessage(agv_sum.count + " different groups.")
                                this.ref.unhighlightWells();
                                let ltable = this.ref;
                                if (tablename !== 'current') {
                                    ltable = this.plateTrack.getTableByName(tablename)
                                    if (!ltable || ltable.length === 0) {
                                        ltable = pt.newSimplePlate(tablename, 1, agv.length, this.ref)
                                        ltable.plateType = 'plot'

                                    }

                                }

                                ltable.selectWellsByString('[0:][0:]')

                                ltable.highlightWells(`${range}`)
                                let into_selected_wells = ltable.getSelectedWellsInOrder();
                                let index = 0;
                                for (let s of agv) {
                                    if (index < into_selected_wells.length) {
                                        let i = into_selected_wells[index++]
                                        i.setValue(s.value)
                                        i.resetGroup(s.group)
                                        i.properties['refIDs'] = s.groupIds;
                                        i.stdv = s.stdDev;
                                    }
                                }
                            }

            }

            calculateWellStatistics(wells) {
                let validValues = wells.map(well => well.value).filter(val => val !== null && !isNaN(val));
                validValues = validValues.map(val => {
                    if (typeof val === 'string') {
                        return parseFloat(val);
                    }
                    return val;
                });

                if (validValues.length === 0) return { average: null, stdDev: null };

                const sum = validValues.reduce((acc, val) => acc + val, 0);
                const meanValue = sum / validValues.length;
                const variance = validValues.reduce((acc, val) => acc + (val - meanValue) ** 2, 0) / validValues.length;
                const stdDev = Math.sqrt(variance);

                return {
                    sum: sum,
                    average: meanValue,
                    stdDev: stdDev
                };
            }
            calculateIQR(wells) {
                let validValues = wells.map(well => well.value).filter(val => val !== null && !isNaN(val));
                validValues = validValues.map(val => {
                    if (typeof val === 'string') {
                        return parseFloat(val);
                    }
                    return val;
                });

                if (validValues.length === 0) return { average: null, stdDev: null, iqrMean: null };

                const sorted = validValues.slice().sort((a, b) => a - b);

                function quartile(arr, q) {
                    const pos = (arr.length - 1) * q;
                    const base = Math.floor(pos);
                    const rest = pos - base;
                    if (arr[base + 1] !== undefined) {
                        return arr[base] + rest * (arr[base + 1] - arr[base]);
                    } else {
                        return arr[base];
                    }
                }

                const q1 = quartile(sorted, 0.25);
                const q3 = quartile(sorted, 0.75);

                const iqr = q3 - q1;
                const iqrMean = (q1 + q3) / 2;

                const sum = validValues.reduce((acc, val) => acc + val, 0);
                const meanValue = sum / validValues.length;
                const variance = validValues.reduce((acc, val) => acc + (val - meanValue) ** 2, 0) / validValues.length;
                const stdDev = Math.sqrt(variance);

                return {
                    average: meanValue,
                    stdDev: stdDev,
                    iqrMean: iqrMean
                };
            }

            iqrmean(...values) {

                if (!this.ref) {
                    this.ref = pt;
                }

                if (values[0] === 'into') {
                    let { tablename, range } = parseTableString(values[1])
                    let from_selected_wells = this.ref.getSelectedWellsInOrder();
                    let colrow = this.ref.getWellIndicies(from_selected_wells[0])
                    let y = this.ref.grid.Y(colrow["rowIdx"])
                    if (from_selected_wells.length === 0) {
                        this.ref.selectWellsByString('[0:][0:]')
                        from_selected_wells = this.ref.getSelectedWells();
                    }
                    let agv_sum = this.calculateIQR(from_selected_wells)
                    this.ref.unhighlightWells();
                    let ltable = this.ref;
                    if (tablename !== 'current') {
                        ltable = this.plateTrack.getTableByName(tablename)
                        if (!ltable || ltable.length === 0) {
                            ltable = pt.newSimplePlate(tablename, 1, 1, this.ref, y)
                            ltable.displayNumberValues = false;
                        }
                    }
                    ltable.selectWellsByString('[0:][0:]')
                    let into_selected_wells = ltable.getSelectedWellsInOrder();
                    into_selected_wells[0].setValue(agv_sum.average.toFixed(4))
                    into_selected_wells[0].stdDev = agv_sum.stdDev;
                    into_selected_wells[0].skin_type = 'SIMPLE_TEXT';
                    ltable.deselectWells();
                } else
                    if (values[0] === 'on') {

                        function isIntegerString(str) {
                            return /^-?\d+$/.test(str);
                        }
                        if (isIntegerString(values[1])) {
                            let column = parseInt(values[1]);
                        }
                        let { tablename, range } = parseTableString(values[1])
                        let from_selected_wells = this.ref.getSelectedWellsInOrder();
                        if (from_selected_wells.length === 0) {
                            this.ref.selectWellsByString('[0:][0:]')
                            from_selected_wells = this.ref.getSelectedWellsInOrder();
                        }
                        let agv_sum = this.calculateAggregatesByTags(from_selected_wells)
                        let agv = agv_sum.aggregates
                        if (agv_sum.count === 1) {
                            pt.setMessage(agv_sum.count + " group.")
                        } else
                            pt.setMessage(agv_sum.count + " different groups found.")
                        this.ref.unhighlightWells();
                        let ltable = this.ref;
                        if (tablename !== 'current') {
                            ltable = this.plateTrack.getTableByName(tablename)
                            if (!ltable || ltable.length === 0) {
                                ltable = pt.newSimplePlate(tablename, 1, agv.length, this.ref)
                            }

                        }

                        ltable.selectWellsByString('[0:][0:]')

                        ltable.highlightWells(`${range}`)
                        let into_selected_wells = ltable.getSelectedWellsInOrder();
                        let index = 0;
                        for (let s of agv) {
                            if (index < into_selected_wells.length) {
                                let i = into_selected_wells[index++]
                                i.setValue(s.value)
                                i.resetGroup(s.group)
                                i.properties['refIDs'] = s.groupIds;
                                i.stdv = s.stdDev;
                            }
                        }
                    }

            }
            createColumnAverageTableWithHeaders(
                srcTable,
                rangeStr,
                outName = "col_avgs_with_headers",
                { fixedDecimals = null } = {}
            ) {
                function parseRange(str) {

                    const m = str.match(/^\[(\-?\d+):(\-?\d+)\]\[(\-?\d+):(\-?\d+)\]$/);
                    if (!m) throw new Error(`Invalid range string: ${str}`);
                    const [, cStart, cEnd, rStart, rEnd] = m.map(Number);
                    return {
                        c0: Math.min(cStart, cEnd),
                        c1: Math.max(cStart, cEnd),
                        r0: Math.min(rStart, rEnd),
                        r1: Math.max(rStart, rEnd),
                    };
                }

                function excelColLabel(n0) {
                    let n = n0 + 1, s = "";
                    while (n > 0) {
                        const rem = (n - 1) % 26;
                        s = String.fromCharCode(65 + rem) + s;
                        n = Math.floor((n - 1) / 26);
                    }
                    return s;
                }

                function resolveColumnHeader(table, colIdx) {
                    const tryFns = [
                        () => table.wells?.[colIdx][0]?.value,
                    ];
                    for (const f of tryFns) {
                        try {
                            const v = f?.();
                            if (v !== undefined && v !== null && v !== "") return String(v);
                        } catch (_) { }
                    }
                    return `${excelColLabel(colIdx)} (${colIdx + 1})`;
                }

                const { c0, c1, r0, r1 } = parseRange(rangeStr);
                const colCount = (c1 - c0 + 1);
                const normalizedRange = `[${c0}:${c1}][${r0}:${r1}]`;

                srcTable.selectWellsByString(normalizedRange);
                const selected = srcTable.getSelectedWellsInOrder();
                if (!selected || selected.length === 0) {
                    srcTable.deselectWells?.();
                    throw new Error(`No wells selected in range ${normalizedRange}`);
                }

                const sums = new Map();
                const counts = new Map();

                for (const well of selected) {
                    const idx = srcTable.getWellIndicies?.(well);
                    if (!idx || typeof idx.colIdx !== "number") continue;

                    let v = well.value;
                    if (v === undefined && typeof well.getValue === "function") v = well.getValue();
                    const num = typeof v === "number" ? v : parseFloat(v);
                    if (!Number.isFinite(num)) continue;

                    sums.set(idx.colIdx, (sums.get(idx.colIdx) || 0) + num);
                    counts.set(idx.colIdx, (counts.get(idx.colIdx) || 0) + 1);
                }

                const averages = new Array(colCount).fill(null).map((_, j) => {
                    const col = c0 + j;
                    const s = sums.get(col) || 0;
                    const n = counts.get(col) || 0;
                    return n > 0 ? (s / n) : null;
                });

                const headers = new Array(colCount).fill("").map((_, j) => resolveColumnHeader(srcTable, c0 + j));

                const newTable = pt.newSimplePlate(outName, colCount, 2, srcTable);
                newTable.displayNumberValues = true;

                const rowsOk = (newTable.rows ?? newTable.getRowCount?.()) === 2;
                const colsOk = (newTable.cols ?? newTable.getColCount?.()) === colCount;
                if (!rowsOk || !colsOk) {

                    newTable.setSize?.(2, colCount);
                }
                const rowsOk2 = (newTable.rows ?? newTable.getRowCount?.()) === 2;
                const colsOk2 = (newTable.cols ?? newTable.getColCount?.()) === colCount;
                if (!rowsOk2 || !colsOk2) {
                    throw new Error(`Destination table must be exactly 2 rows x ${colCount} cols.`);
                }

                try {

                    newTable.selectWellsByString(`[0:${colCount - 1}][0:0]`);
                    const headerCells = newTable.getSelectedWellsInOrder();
                    for (let j = 0; j < colCount && j < headerCells.length; j++) {
                        const cell = headerCells[j];
                        cell.setValue(headers[j]);
                        cell.skin_type = "SIMPLE_TEXT";
                    }

                    newTable.deselectWells();

                    newTable.selectWellsByString(`[0:${colCount - 1}][1:1]`);
                    const avgCells = newTable.getSelectedWellsInOrder();
                    for (let j = 0; j < colCount && j < avgCells.length; j++) {
                        const cell = avgCells[j];
                        const avg = averages[j];
                        const outVal = (avg === null)
                            ? ""
                            : (fixedDecimals == null ? avg : Number(avg.toFixed(fixedDecimals)));
                        cell.setValue(outVal);
                        cell.skin_type = "SIMPLE_TEXT";
                        cell.stdDev = undefined;
                        cell.stdv = undefined;
                    }
                } finally {

                    srcTable.deselectWells?.();
                    newTable.deselectWells?.();
                    newTable.applycolumnheaders();
                }

                return newTable;
            }

            createColumnAverageTableFromFormulaWithHeaders(
                srcTable,
                rangeStr,
                outName = "col_avgs_with_headers",
                { fixedDecimals = null } = {}
            ) {
                function parseRange(str) {

                    const m = str.match(/^\[(\-?\d+):(\-?\d+)\]\[(\-?\d+):(\-?\d+)\]$/);
                    if (!m) throw new Error(`Invalid range string: ${str}`);
                    const [, cStart, cEnd, rStart, rEnd] = m.map(Number);
                    return {
                        c0: Math.min(cStart, cEnd),
                        c1: Math.max(cStart, cEnd),
                        r0: Math.min(rStart, rEnd),
                        r1: Math.max(rStart, rEnd),
                    };
                }

                function excelColLabel(n0) {
                    let n = n0 + 1, s = "";
                    while (n > 0) {
                        const rem = (n - 1) % 26;
                        s = String.fromCharCode(65 + rem) + s;
                        n = Math.floor((n - 1) / 26);
                    }
                    return s;
                }

                function resolveColumnHeader(table, colIdx) {
                    const tryFns = [
                        () => table.wells?.[colIdx]?.[0]?.value,
                    ];
                    for (const f of tryFns) {
                        try {
                            const v = f?.();
                            if (v !== undefined && v !== null && v !== "") return String(v);
                        } catch (_) { }
                    }
                    return `${excelColLabel(colIdx)} (${colIdx + 1})`;
                }

                function getSourceTableName(table) {

                    const candidates = [
                        table.name,
                        table.tableName,
                        table.title,
                        table.getName?.(),
                        table.getTitle?.()
                    ].filter(Boolean);
                    const raw = String(candidates[0] ?? "source");

                    return /[^A-Za-z0-9_]/.test(raw)
                        ? `'${raw.replace(/'/g, "''")}'`
                        : raw;
                }

                const { c0, c1, r0, r1 } = parseRange(rangeStr);
                const colCount = (c1 - c0 + 1);
                const normalizedRange = `[${c0}:${c1}][${r0}:${r1}]`;

                srcTable.selectWellsByString(normalizedRange);
                const selected = srcTable.getSelectedWellsInOrder();
                if (!selected || selected.length === 0) {
                    srcTable.deselectWells?.();
                    throw new Error(`No wells selected in range ${normalizedRange}`);
                }

                const headers = Array.from({ length: colCount }, (_, j) =>
                    resolveColumnHeader(srcTable, c0 + j)
                );

                const newTable = pt.newSimplePlate(outName, colCount, 2, srcTable);
                newTable.displayNumberValues = true;

                const rowsOk = (newTable.rows ?? newTable.getRowCount?.()) === 2;
                const colsOk = (newTable.cols ?? newTable.getColCount?.()) === colCount;
                if (!rowsOk || !colsOk) {
                    newTable.setSize?.(2, colCount);
                }
                const rowsOk2 = (newTable.rows ?? newTable.getRowCount?.()) === 2;
                const colsOk2 = (newTable.cols ?? newTable.getColCount?.()) === colCount;
                if (!rowsOk2 || !colsOk2) {
                    throw new Error(`Destination table must be exactly 2 rows x ${colCount} cols.`);
                }

                const srcName = getSourceTableName(srcTable);

                function buildAverageFormulaForColumn(colIdx) {
                    const slice = `${srcName}[${colIdx}:${colIdx}][${r0}:${r1}]`;
                    const inner = `average(${slice})`;
                    if (fixedDecimals == null) return `${inner}`;
                    return `round(${inner}, ${fixedDecimals})`;
                }

                try {

                    newTable.selectWellsByString(`[0:${colCount - 1}][0:0]`);
                    const headerCells = newTable.getSelectedWellsInOrder();
                    for (let j = 0; j < colCount && j < headerCells.length; j++) {
                        const cell = headerCells[j];
                        cell.setValue?.(headers[j]);
                        cell.skin_type = "SIMPLE_TEXT";
                    }
                    newTable.deselectWells();

                    newTable.selectWellsByString(`[0:${colCount - 1}][1:1]`);
                    const avgCells = newTable.getSelectedWellsInOrder();
                    let flist = []
                    for (let j = 0; j < colCount && j < avgCells.length; j++) {
                        const cell = avgCells[j];
                        const formula = buildAverageFormulaForColumn(c0 + j);
                        newTable.formula[`[${j}:${j}][1:1]`] = formula
                    }

                } finally {

                    srcTable.deselectWells?.();
                    newTable.deselectWells?.();
                    newTable.applycolumnheaders?.();
                }

                return newTable;
            }

            rename(...values) {

                try {

                    if (!values || values.length < 2) {
                        throw new Error("Invalid input: 'values' must be an array with at least two elements.");
                    }

                    let tablename = values[0];
                    if (!tablename) {
                        throw new Error("Missing 'tablename' in the first argument.");
                    }

                    let ltable = this.plateTrack.getTableByName(tablename);
                    if (!ltable) {
                        throw new Error(`Table '${tablename}' not found.`);
                    }

                    ltable.name = values[1];
                    pt.setMessage(`Table '${tablename}' renamed to '${values[1]}'.`);
                } catch (error) {
                    pt.setMessage(`An error occurred: ${error.message}`);
                }

            }

            async join(...values) {
                return new Promise(async (resolve, reject) => {

                    function parseTableColumns(input) {
                        const regex = /(\w+)\[(\w+)\](?:\.(\w+))?/g;
                        let matches;
                        let results = [];

                        while ((matches = regex.exec(input)) !== null) {
                            results.push({
                                table: matches[1],
                                column: matches[2],
                                attribute: matches[3] || "Value"
                            });
                        }

                        return results;
                    }

                    if (values && values.length > 0 && values[1] === '=') {
                        let res = parseTableColumns(values[0])
                        let res2 = parseTableColumns(values[2])

                        const table1 = pt.getTableByName(res[0].table)
                        const col1 = (res[0].column)
                        const table2 = pt.getTableByName(res2[0].table)
                        const col2 = (res2[0].column)

                        if (res[0].attribute === 'address') {

                            pt.joinOnAddressColumn(table1, col1, table2, col2)
                        } else if (res[1].attribute === 'address') {
                            pt.joinOnAddressColumn(table2, col2, table1, col1)
                        } else {
                            pt.join(table1, col1, table2, col2)

                        }
                        return resolve();

                    }

                    return resolve();
                })

            }

            async into(...values) {

                if (!this.ref) {
                    this.ref = pt;
                }

                await this.copy()

                try {
                    if (!navigator.clipboard || !navigator.clipboard.read) {
                        console.error("Clipboard API is not supported in this browser.");
                        return null;
                    }
                    const clipboardItems = await navigator.clipboard.read();
                    const results = [];
                    for (const item of clipboardItems) {
                        for (const type of item.types) {
                            const clipboardData = await item.getType(type);
                            if (type.startsWith("text/")) {
                                const text = await clipboardData.text();
                                let table = await exec('baja/plate/data/data-table-parser.js', text)
                                let m = values[0]
                                let index = 0;
                                let first_plate = null;

                                for (let t of table) {
                                    if (index > 0)
                                        t.setName(m + index)
                                    else
                                        t.setName(m);
                                    t.plateType = 'data'
                                    pt.addNextAvailableX(t);
                                    t.fitToCellSize(pt)
                                    t.removeEmptyRowsAndColumns()

                                    if (index === 0) {
                                        first_plate = t;
                                    }
                                    index++;
                                }

                            } else if (type.startsWith("image/")) {

                                const blob = clipboardData;
                                results.push({ type, content: URL.createObjectURL(blob) });
                            } else {

                                results.push({ type, content: clipboardData });
                            }
                        }
                    }

                    console.log("Clipboard Items:", results);
                    return results;
                } catch (error) {
                    console.error("Error accessing clipboard:", error);
                    return null;
                }

            }

            average(...values) {

                if (!this.ref) {
                    this.ref = pt;
                }

                if (values[0] === 'into') {
                    let { tablename, range } = parseTableString(values[1])

                    let from_selected_wells = this.ref.getSelectedWellsInOrder();
                    let colrow = this.ref.getWellIndicies(from_selected_wells[0])
                    let y = this.ref.grid.Y(colrow["rowIdx"])
                    if (from_selected_wells.length === 0) {
                        this.ref.selectWellsByString('[0:][0:]')
                        from_selected_wells = this.ref.getSelectedWells();
                    }
                    let agv_sum = this.calculateWellStatistics(from_selected_wells)
                    this.ref.unhighlightWells();
                    let ltable = this.ref;
                    if (tablename !== 'current') {
                        ltable = this.plateTrack.getTableByName(tablename)
                        if (!ltable || ltable.length === 0) {
                            ltable = pt.newSimplePlate(tablename, 1, 1, this.ref, y)
                            ltable.displayNumberValues = false;
                        }
                    }
                    ltable.selectWellsByString('[0:][0:]')
                    let into_selected_wells = ltable.getSelectedWellsInOrder();
                    into_selected_wells[0].setValue(agv_sum.average.toFixed(4))
                    into_selected_wells[0].stdDev = agv_sum.stdDev;
                    into_selected_wells[0].skin_type = 'SIMPLE_TEXT';
                    ltable.deselectWells();
                } else
                    if (values[0] === 'on') {

                        function isIntegerString(str) {
                            return /^-?\d+$/.test(str);
                        }
                        if (isIntegerString(values[1])) {
                            let column = parseInt(values[1]);
                        }
                        let { tablename, range } = parseTableString(values[1])
                        let from_selected_wells = this.ref.getSelectedWellsInOrder();
                        if (from_selected_wells.length === 0) {
                            this.ref.selectWellsByString('[0:][0:]')
                            from_selected_wells = this.ref.getSelectedWellsInOrder();
                        }
                        let agv_sum = this.calculateAggregatesByTags(from_selected_wells)
                        let agv = agv_sum.aggregates
                        if (agv_sum.count === 1) {
                            pt.setMessage(agv_sum.count + " group.")
                        } else
                            pt.setMessage(agv_sum.count + " different groups.")
                        this.ref.unhighlightWells();
                        let ltable = this.ref;
                        if (tablename !== 'current') {
                            ltable = this.plateTrack.getTableByName(tablename)
                            if (!ltable || ltable.length === 0) {
                                ltable = pt.newSimplePlate(tablename, 1, agv.length, this.ref)
                            }

                        }

                        ltable.selectWellsByString('[0:][0:]')

                        ltable.highlightWells(`${range}`)
                        let into_selected_wells = ltable.getSelectedWellsInOrder();
                        let index = 0;
                        for (let s of agv) {
                            if (index < into_selected_wells.length) {
                                let i = into_selected_wells[index++]
                                i.setValue(s.value)
                                i.resetGroup(s.group)
                                i.properties['refIDs'] = s.groupIds;
                                i.stdv = s.stdDev;
                            }
                        }
                    }

            }

            sanitizetodigits(...v) {
                if (!this.ref) {
                    this.ref = pt;
                }
                let values = this.ref.getSelectedWellsInOrder();
                if (!values || values.length === 0) {
                    pt.setMessage(" Nothing selected to sanitize ")
                    return;
                }

                function containsNonDigit(original) {
                    if (typeof original !== 'string') {
                        throw new Error('Input must be a string');
                    }

                    return /[^\d.]/.test(original);
                }

                function removeNonDigit(original) {
                    if (typeof original !== 'string') {
                        throw new Error('Input must be a string');
                    }

                    return original.replace(/[^\d.]/g, '').replace(/(\.)(?=.*\.)/g, '');
                }

                const tx = this.ref.getColIndex(values[0]);
                let count = 0;
                hideAllModal();
                clearMenu();

                for (let w of values) {
                    let row_index = this.ref.getRowIndex(w)
                    let string_value = w.value + '';
                    if (string_value != null && string_value.length > 0 && containsNonDigit(string_value)) {
                        let nv = removeNonDigit(string_value)
                        if (nv != null && nv != string_value) {
                            count++;
                            this.ref.setWellValue(tx, row_index, nv)
                        }
                    }
                }
                pt.setMessage("Updated " + count + ' values')
            }

            sum(...values) {
                if (!this.ref) {
                    this.ref = pt;
                }
                if (values[0] === 'into') {
                    let { tablename, range } = parseTableString(values[1])

                    let from_selected_wells = this.ref.getSelectedWellsInOrder();
                    let colrow = this.ref.getWellIndicies(from_selected_wells[0])
                    let y = this.ref.grid.Y(colrow["rowIdx"])
                    if (from_selected_wells.length === 0) {
                        this.ref.selectWellsByString('[0:][0:]')
                        from_selected_wells = this.ref.getSelectedWells();
                    }
                    let agv_sum = this.calculateWellStatistics(from_selected_wells)
                    this.ref.unhighlightWells();
                    let ltable = this.ref;
                    if (tablename !== 'current') {
                        ltable = this.plateTrack.getTableByName(tablename)
                        if (!ltable || ltable.length === 0) {
                            ltable = pt.newSimplePlate(tablename, 1, 1, this.ref, y)
                            ltable.displayNumberValues = false;
                        }
                    }
                    ltable.selectWellsByString('[0:][0:]')
                    let into_selected_wells = ltable.getSelectedWellsInOrder();
                    into_selected_wells[0].setValue(agv_sum.sum.toFixed(4))
                    into_selected_wells[0].stdDev = agv_sum.stdDev;
                    into_selected_wells[0].skin_type = 'SIMPLE_TEXT';
                    ltable.deselectWells();
                } else
                    if (values[0] === 'on') {

                        function isIntegerString(str) {
                            return /^-?\d+$/.test(str);
                        }
                        if (isIntegerString(values[1])) {
                            let column = parseInt(values[1]);
                        }
                        let { tablename, range } = parseTableString(values[1])
                        let from_selected_wells = this.ref.getSelectedWellsInOrder();
                        if (from_selected_wells.length === 0) {
                            this.ref.selectWellsByString('[0:][0:]')
                            from_selected_wells = this.ref.getSelectedWellsInOrder();
                        }
                        let agv_sum = this.calculateAggregatesByTags(from_selected_wells)
                        let agv = agv_sum.aggregates
                        if (agv_sum.count === 1) {
                            pt.setMessage(agv_sum.count + " group.")
                        } else
                            pt.setMessage(agv_sum.count + " different groups.")
                        this.ref.unhighlightWells();
                        let ltable = this.ref;
                        if (tablename !== 'current') {
                            ltable = this.plateTrack.getTableByName(tablename)
                            if (!ltable || ltable.length === 0) {
                                ltable = pt.newSimplePlate(tablename, 1, agv.length, this.ref)
                            }

                        }

                        ltable.selectWellsByString('[0:][0:]')

                        ltable.highlightWells(`${range}`)
                        let into_selected_wells = ltable.getSelectedWellsInOrder();
                        let index = 0;
                        for (let s of agv) {
                            if (index < into_selected_wells.length) {
                                let i = into_selected_wells[index++]
                                i.setValue(s.value)
                                i.resetGroup(s.group)
                                i.properties['refIDs'] = s.groupIds;
                                i.stdv = s.stdDev;
                            }
                        }
                    }

            }

            taggregate(...values) {

                if (values[0] === 'into') {
                    let { tablename, range } = parseTableString(values[1])

                    let from_selected_wells = this.ref.getSelectedWellsInOrder();
                    if (from_selected_wells.length === 0) {
                        this.ref.selectWellsByString('[0:][0:]')
                        from_selected_wells = this.ref.getSelectedWellsInOrder();
                    }

                    let agv_sum = this.calculateAggregatesByOnlyTags(from_selected_wells)
                    console.log('debubg');
                    let agv = agv_sum.aggregates
                    if (agv_sum.count === 1) {
                        pt.setMessage(" Only one tag found for all selected cells.")
                    }
                    pt.setMessage(agv_sum.count + " different groups found.")

                    let ltable = this.ref;
                    if (tablename !== 'current') {
                        ltable = this.plateTrack.getTableByName(tablename)
                        if (!ltable || ltable.length === 0) {
                            ltable = pt.newSimplePlate(tablename, 3, agv.length + 1, this.ref)

                        }

                    }

                    ltable.selectWellsByString('[0:][0:0]')
                    let into_selected_wells = ltable.getSelectedWellsInOrder();
                    into_selected_wells[0].setValue('Tags')
                    into_selected_wells[1].setValue('Value')
                    into_selected_wells[2].setValue('Standard deviation')

                    ltable.selectWellsByString('[0:0][1:]')
                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    let index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]
                            i.setValue(Object.keys(s.group).join(' '))
                            i.setGroup('Tag')
                        }
                    }
                    ltable.deselectWells();
                    ltable.selectWellsByString('[1:1][1:]')

                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]
                            i.setValue(s.value)
                            i.resetGroup(s.group)
                            i.setGroup('Value')
                            i.properties['refIDs'] = s.groupIds;
                            i.stdv = s.stdDev;
                        }
                    }

                    ltable.deselectWells();
                    ltable.selectWellsByString('[2:2][1:]')

                    into_selected_wells = ltable.getSelectedWellsInOrder();
                    index = 0;
                    for (let s of agv) {
                        if (index < into_selected_wells.length) {
                            let i = into_selected_wells[index++]
                            i.setValue(s.stdDev)
                            i.setGroup('Stdev')
                        }
                    }
                } else
                    if (values[0] === 'on') {

                        function isIntegerString(str) {
                            return /^-?\d+$/.test(str);
                        }
                        if (isIntegerString(values[1])) {
                            let column = parseInt(values[1]);

                        }

                        let { tablename, range } = parseTableString(values[1])
                        let from_selected_wells = this.ref.getSelectedWellsInOrder();
                        if (from_selected_wells.length === 0) {
                            this.ref.selectWellsByString('[0:][0:]')

                            from_selected_wells = this.ref.getSelectedWellsInOrder();
                        }

                        let agv_sum = this.calculateAggregatesByTags(from_selected_wells)
                        let agv = agv_sum.aggregates
                        if (agv_sum.count === 1) {
                            pt.setMessage(" Only one tag found for all selected cells.")
                        } else
                            pt.setMessage(agv_sum.count + " different groups found.")
                        this.ref.unhighlightWells();
                        let ltable = this.ref;
                        if (tablename !== 'current') {
                            ltable = this.plateTrack.getTableByName(tablename)
                            if (!ltable || ltable.length === 0) {
                                ltable = pt.newSimplePlate(tablename, 1, agv.length, this.ref)
                            }

                        }

                        ltable.selectWellsByString('[0:][0:]')

                        ltable.highlightWells(`${range}`)
                        let into_selected_wells = ltable.getSelectedWellsInOrder();
                        let index = 0;
                        for (let s of agv) {
                            if (index < into_selected_wells.length) {
                                let i = into_selected_wells[index++]
                                i.setValue(s.value)
                                i.resetGroup(s.group)
                                i.properties['refIDs'] = s.groupIds;
                                i.stdv = s.stdDev;
                            }
                        }
                    }

            }

            applyheaders() {
                if (pt) {
                    pt.applyHeaders();
                }

            }

            tag(...values) {
                if (Array.isArray(values)) {
                    let selected_wells = this.ref.getSelectedWellsInOrder();
                    if (values.slice(-2).includes("Column_Header") || values.slice(-1)[0] === "Column_Header" ||
                        (values.slice(-2)[0] === "Column" && values.slice(-1)[0] === "Header") || values.slice(-1)[0] === "ColumnHeader") {
                        let name = "ColumnHeader"
                        for (let s of selected_wells) {
                            s.setGroup(name);
                            let rindex = this.ref.getIndexOf(s)
                            this.ref.applyHeaderWellForColumn(rindex.colIdx, rindex.rowIdx)
                        }

                    } else if (values.slice(-2).includes("Row_Header") || values.slice(-1)[0] === "Row_Header" ||
                        (values.slice(-2)[0] === "Row" && values.slice(-1)[0] === "Header") || values.slice(-1)[0] === "RowHeader") {
                        let name = "RowHeader"
                        for (let s of selected_wells) {
                            s.setGroup(name);
                            let rindex = this.ref.getIndexOf(s)
                            this.ref.applyHeaderWellForRow(rindex.colIdx, rindex.rowIdx)
                        }

                    }
                    else if (values.slice(-2).includes("Row_Header") || values.slice(-1)[0] === "Row_Address" ||
                        (values.slice(-2)[0] === "Row" && values.slice(-1)[0] === "Header") || values.slice(-1)[0] === "RowAddress") {
                        let name = "RowHeader"
                        for (let s of selected_wells) {
                            s.setGroup(name);
                            let rindex = this.ref.getIndexOf(s)
                            this.ref.applyAddressWellForRow(rindex.colIdx, rindex.rowIdx)
                        }

                    }

                    else {
                        for (let sel of selected_wells) {
                            sel.appendGroups(values);
                        }
                    }
                } else {
                    for (let sel of selected_wells) {
                        sel.appendGroups(values);
                    }
                }
            }

            table(name, dim) {
                this.objects[name] = new Table(name, dim);
            }

            async linear_regression(...val) {
                let allScatterData = {
                    points: []
                };
                let selectedPlate = this.ref;

                console.log('debubg');
                let plotname = selectedPlate.name + "_regression"
                if (val[0]) {
                    plotname = val[0]
                }

                setTimeout(async () => {

                    let p = new Plot(allScatterData)
                    let code = {
                        x: `${selectedPlate.name}[Tag]`,
                        y: `${selectedPlate.name}[Value]`,
                        equation: 'linearregression',
                        name: plotname

                    }
                    await p.applyConfig(code, pt);
                    p.name = plotname;
                    p.w = pt.grid.worldWidth(400);
                    p.h = pt.grid.worldHeight(300)
                    p.grid.height = p.h;
                    p.grid.width = p.w;
                    p.config_script.plot = {
                        lineColor: 'blue',
                        pointColor: 'red',
                        errorBarColor: 'gray',
                        fitScaleToData: true
                    };
                    pt.setPlot(p)
                    pt.setNextToPlate(p, selectedPlate, selectedPlate.grid.y)
                    return resolve();
                }, 1000)

            }

            trim_table_at_row(...values) {
                function findRowIndex(table, targetValues) {
                    for (let x = 0; x < table.length; x++) {
                        let rowValues = table[x].map(cell => cell?.value).filter(val => val !== undefined);
                        if (targetValues.every(val => rowValues.includes(val))) {
                            return x;
                        }
                    }
                    return -1;
                }
                const rowIndex = findRowIndex(this.ref.wells, values)
                if (rowIndex > 0) {
                    this.ref.removeRowsUp(rowIndex)
                }
            }

            extract_table(...values) {

            }
        }

        return resolve(new Interpreter(pt));

    })

}

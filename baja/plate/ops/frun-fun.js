function (expression, pt) {

    return new Promise(async (resolve, reject) => {
        let FF = await exec('baja/expression/functions-factory');
        function average(...args) {
            let allValues = args.flat();
            if (allValues.length === 1) {
                if (Array.isArray(allValues[0])) {
                    allValues = allValues[0]
                }
            }
            const validValues = allValues.filter(val => !isNaN(val) && val !== undefined && val !== null);
            if (validValues.length === 0) {
                return 0;
            }
            const sum = validValues.reduce((acc, val) => acc + val, 0);
            return sum / validValues.length;
        }

        function mean(...args) {
            const allValues = args.flat();
            const validValues = allValues.filter(val => !isNaN(val) && val !== undefined && val !== null);
            if (validValues.length === 0) {
                return 0;
            }
            const sum = validValues.reduce((acc, val) => acc + val, 0);
            return sum / validValues.length;
        }
        function calculateAverage(values) {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }
        function calculateStandardDeviation(values) {
            const avg = calculateAverage(values);
            const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
            return Math.sqrt(variance);
        }
        let aggregate = (dataset) => {

            const groupedData = {};
            dataset.forEach(([id, value]) => {
                if (!groupedData[id]) {
                    groupedData[id] = [];
                }
                groupedData[id].push(value);
            });
            const result = Object.keys(groupedData).map(id => {
                const values = groupedData[id];
                const average = calculateAverage(values);
                const stdDeviation = calculateStandardDeviation(values);
                return {
                    id: parseInt(id),
                    average: average,
                    stdDeviation: stdDeviation,
                };
            });

            return result;
        }

        function median(values) {
            values.sort((a, b) => a - b);
            const mid = Math.floor(values.length / 2);
            if (values.length % 2 === 0) {
                return (values[mid - 1] + values[mid]) / 2;
            } else {
                return values[mid];
            }
        }

        function count(...args) {
            const allValues = args.flat();
            const validValues = allValues.filter(val => !isNaN(val) && val !== undefined && val !== null);
            if (validValues.length === 0) {
                return 0;
            }
            return validValues.length;
        }

        function median(values) {
            values.sort((a, b) => a - b);
            const mid = Math.floor(values.length / 2);
            if (values.length % 2 === 0) {
                return (values[mid - 1] + values[mid]) / 2;
            } else {
                return values[mid];
            }
        }

        function mode(values) {
            const frequency = {};
            let maxFreq = 0;
            let modes = [];

            values.forEach(val => {
                frequency[val] = (frequency[val] || 0) + 1;
                if (frequency[val] > maxFreq) {
                    maxFreq = frequency[val];
                }
            });

            for (let key in frequency) {
                if (frequency[key] === maxFreq) {
                    modes.push(parseFloat(key));
                }
            }

            return modes;
        }

        function range(values) {
            const min = Math.min(...values);
            const max = Math.max(...values);
            return max - min;
        }
        function variance(values) {
            const avg = mean(values);
            return values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
        }

        function standardDeviation(values) {
            return Math.sqrt(variance(values));
        }

        function interquartileRange(values) {
            values.sort((a, b) => a - b);
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            return q3 - q1;
        }

        function percentile(values, p) {
            const sorted = [...values].sort((a, b) => a - b);
            const idx = (p / 100) * (sorted.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
        }
        function interquartileRange(values) {
            values.sort((a, b) => a - b);
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            return q3 - q1;
        }

        function percentile(values, p) {
            const sorted = [...values].sort((a, b) => a - b);
            const idx = (p / 100) * (sorted.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
        }
        function kurtosis(values) {
            const avg = mean(values);
            const stdDev = standardDeviation(values);
            const n = values.length;
            const kurt = values.reduce((acc, val) => acc + Math.pow((val - avg) / stdDev, 4), 0) / n;
            return kurt - 3;
        }

        function percentile(values, p) {
            values.sort((a, b) => a - b);
            const idx = (p / 100) * (values.length - 1);
            const lower = Math.floor(idx);
            const upper = Math.ceil(idx);
            return values[lower] + (values[upper] - values[lower]) * (idx - lower);
        }
        function zScores(values) {
            const avg = mean(values);
            const stdDev = standardDeviation(values);
            return values.map(val => (val - avg) / stdDev);
        }
        function detectOutliers(values) {
            const q1 = percentile(values, 25);
            const q3 = percentile(values, 75);
            const iqr = q3 - q1;
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;
            return values.filter(val => val < lowerBound || val > upperBound);
        }

        function convertDoubleMinusToPlus(parts) {

            let transformedParts = [];

            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === '-' && parts[i + 1] === '-') {

                    transformedParts.push('+');

                    i++;
                } else {

                    transformedParts.push(parts[i]);
                }
            }

            return transformedParts;
        }
        function evaluateIfConstant(expression) {
            try {
                expression = expression.trim();
                if (!isNaN(expression) && expression !== "") {

                    return parseFloat(expression);
                }
                let func = new Function(`return (${expression});`);
                if (/[^0-9\s\.\+\-\*\/\(\)]/.test(expression)) {
                    return null;
                }
                return func();
            } catch (error) {

                return null;
            }
        }

        function evaluateExpressionOrFunction(expression, tables, results) {
            expression = removeSurroundingParentheses(expression)
            let v = evaluateIfConstant(expression)
            if (v != null) {
                return [v];
            }

            const functionPattern = /(\w+)\((.*)\)/;
            let matchFunction = expression.match(functionPattern);

            while (matchFunction) {
                const functionName = matchFunction[1];
                const args = matchFunction[2].split(',').map(arg => evaluateExpressionOrFunction(arg.trim(), tables, results));
                let result;
                if (functionName === 'average') {
                    result = [average(args[0])];
                }
                else if (typeof Math[functionName] === 'function') {
                    result = args[0].map(value => Math[functionName](value));
                } else {
                    console.log(" function name " + matchFunction)
                    throw new Error(`Unknown function: ${functionName}`);
                }
                expression = expression.replace(functionPattern, result[0]);
                matchFunction = expression.match(functionPattern);
            }

            v = evaluateIfConstant(expression)
            if (v != null) {
                return [v];
            }

            const operatorPattern = /([+\-*/])/;
            let parts = expression.split(operatorPattern).map(part => part.trim());
            parts = parts.filter(item => item !== "");
            parts = convertDoubleMinusToPlus(parts)
            if (parts.length > 1) {

                let left = evaluateExpressionOrFunction(parts[0], tables, results);
                const operator = parts[1];
                let right = evaluateExpressionOrFunction(parts[2], tables, results);

                const maxRows = Math.max(left.length, right.length);
                if (left.length === 1) left = Array(maxRows).fill(left[0]);
                if (right.length === 1) right = Array(maxRows).fill(right[0]);

                return left.map((leftValue, index) => {
                    const rightValue = right[index];
                    if (leftValue === null || rightValue === null || isNaN(leftValue) || isNaN(rightValue)) return null;
                    switch (operator) {
                        case '+':
                            return leftValue + rightValue;
                        case '-':
                            return leftValue - rightValue;
                        case '*':
                            return leftValue * rightValue;
                        case '/':
                            return rightValue !== 0 ? leftValue / rightValue : null;
                        default:
                            throw new Error(`Unknown operator: ${operator}`);
                    }
                }).filter(value => value !== null);
            }

            if (results[expression])
                return results;
            else
                return extractTableValues(expression, tables, results);
        }
        function isTableGroupSyntax(expression) {

            const complexGroupAccessPattern = /^\w+\[\w+(\s+(and|or|not)\s+\w+)*\]$/;

            return complexGroupAccessPattern.test(expression);
        }

        function extractTableValues(expression, tables, results) {
            let values = [];

            if (!isNaN(expression)) {
                values = [parseFloat(expression)];
                return values;
            }

            const indexPattern = /(.+)\[(\d+)\]/;
            const matchIndex = expression.match(indexPattern);

            if (matchIndex) {
                const tableName = matchIndex[1];
                const columnIndex = parseInt(matchIndex[2], 10);

                const tableData = tables[tableName];
                if (!tableData) {
                    throw new Error(`Table not found: ${tableName}`);
                }

                values = [];
                for (let i = 0; i < tableData.wells[columnIndex].length; i++) {
                    const well = tableData.wells[columnIndex][i];
                    if (well && !isNaN(well.value)) {
                        if (well.value !== null && well.value !== undefined) {
                            values.push(well.value);
                        }
                    }
                }

            } else if (isTableGroupSyntax(expression)) {

                return parseSingleVariable(expression, tables)

            } else {

                const [table, group] = expression.replace(/[()]/g, '').split('.');
                const tableData = tables[table];
                if (!tableData) {
                    throw new Error("Table not found for " + table);
                }

                values = [];
                for (let i = 0; i < tableData.wells.length; i++) {
                    for (let j = 0; j < tableData.wells[i].length; j++) {
                        const well = tableData.wells[i][j];
                        if (well && well.getGroup(group) && !isNaN(well.value)) {
                            if (well.value !== null && well.value !== undefined) {
                                values.push(well.value);
                            }
                        }
                    }
                }
            }

            return values;
        }

        function parseSingleVariable(token, tables, results) {
            const singleGroupAccessPattern = /(\w+)\[(\w+)\]/;
            const arrayAccessPattern = /(\w+)\[(.+)\]/;
            const propertyConditionPattern = /(\w+)\[(\d+)\]\.(\w+)(?:\s*(==|!=|>|<|>=|<=)\s*(.+))?/;
            if (results[token]) {
                return results[token];
            }

            let match;

            if ((match = token.match(singleGroupAccessPattern))) {
                const table = match[1];
                const groupName = match[2];
                return fetchValuesBySingleGroup(tables, table, groupName);
            }

            if ((match = token.match(arrayAccessPattern))) {
                const table = match[1];
                const conditionPart = match[2];

                let condition = 'and';
                let groups = [];
                let notGroups = [];

                if (conditionPart.includes('and')) {
                    groups = conditionPart.split('and').map(group => group.trim());
                } else if (conditionPart.includes('or')) {
                    groups = conditionPart.split('or').map(group => group.trim());
                    condition = 'or';
                }

                if (conditionPart.includes('not')) {
                    const parts = conditionPart.split('not');
                    groups = parts[0].split('and').map(group => group.trim());
                    notGroups = parts[1].split('and').map(group => group.trim());
                }

                let ngroups = []
                let i = 0;
                for (let g of groups) {
                    try {
                        let t = parseInt(g)
                        if (isNaN(t)) {
                            ngroups[i] = g
                        } else {
                            ngroups[i] = t
                        }
                    } catch (exception) {
                        ngroups[i] = g;
                    }
                    i++;
                }
                return fetchValuesByGroup(tables, table, ngroups, condition, notGroups);
            }

            if ((match = token.match(propertyConditionPattern))) {
                const table = match[1];
                const columnIndex = parseInt(match[2], 10);
                const property = match[3];
                const operator = match[4];
                const value = match[5];

                const tableData = tables[table];
                if (!tableData || !tableData.wells[columnIndex]) {
                    console.error(`Table ${table} or column ${columnIndex} not found`);
                    return [];
                }

                const wells = tableData.wells[columnIndex];
                let result = [];

                wells.forEach(well => {
                    if (well.hasOwnProperty(property)) {
                        if (operator && value !== undefined) {
                            const wellValue = well[property];

                            switch (operator) {
                                case '==':
                                    if (wellValue == value) result.push(well.value);
                                    break;
                                case '!=':
                                    if (wellValue != value) result.push(well.value);
                                    break;
                                case '>':
                                    if (wellValue > value) result.push(well.value);
                                    break;
                                case '<':
                                    if (wellValue < value) result.push(well.value);
                                    break;
                                case '>=':
                                    if (wellValue >= value) result.push(well.value);
                                    break;
                                case '<=':
                                    if (wellValue <= value) result.push(well.value);
                                    break;
                                default:
                                    console.error(`Unsupported operator: ${operator}`);
                            }
                        } else {

                            result.push(well[property]);
                        }
                    }
                });

                return result;
            }

            else {
                console.log(" token " + token + " ")
                console.error('Unsupported syntax');
                return [];
            }
        }

        function fetchValuesBySingleGroup(tables, table, groupName) {
            let values = [];

            const tableData = tables[table];
            if (!tableData || !tableData.wells) {
                console.error(`Table ${table} not found or has no wells`);
                return [];
            }

            const isIntegerGroupName = !isNaN(groupName) && Number.isInteger(parseFloat(groupName));

            for (let col = 0; col < tableData.wells.length; col++) {
                for (let row = 0; row < tableData.wells[col].length; row++) {
                    const well = tableData.wells[col][row];

                    if (isIntegerGroupName && col === parseInt(groupName)) {
                        if (well.value != null)
                            values.push(well.value);
                    }

                    else if (well.group && well.group.hasOwnProperty(groupName)) {
                        if (well.value != null)
                            values.push(well.value);
                    }
                }
            }

            return values;
        }

        function fetchValuesByGroup(tables, table, groups, condition, notGroups) {
            let values = [];
            const tableData = tables[table];
            if (!tableData || !tableData.wells) {
                console.error(`Table ${table} not found or has no wells`);
                return [];
            }

            for (let col = 0; col < tableData.wells.length; col++) {
                for (let row = 0; row < tableData.wells[col].length; row++) {
                    const well = tableData.wells[col][row];
                    let belongsToGroups;
                    if (condition === "and") {
                        belongsToGroups = groups.every(group =>
                            typeof group === 'number' ? group === col :
                                well.group && well.group.hasOwnProperty(group)
                        );
                    } else {
                        belongsToGroups = groups.some(group =>
                            typeof group === 'number' ? group === col :
                                well.group && well.group.hasOwnProperty(group)
                        );
                    }
                    let belongsToNotGroups = notGroups.some(group =>
                        well.group && well.group.hasOwnProperty(group)
                    );
                    if (belongsToGroups && !belongsToNotGroups) {
                        if (well.value != null) {
                            values.push(well.getValue());
                        }
                    }
                }
            }
            return values;
        }

        function removeSurroundingParentheses(str) {
            if (str.startsWith('(') && str.endsWith(')')) {
                return str.slice(1, -1);
            }
            return str;
        }
        function _parseFunctionCall(callString) {
            const functionPattern = /(\w+)\((.*)\)/;
            const match = functionPattern.exec(callString);

            if (!match) return callString;

            const functionName = match[1];
            const argsString = match[2];

            let args = [];
            let depth = 0;
            let currentArg = '';
            for (let i = 0; i < argsString.length; i++) {
                const char = argsString[i];
                if (char === ',' && depth === 0) {
                    args.push(currentArg.trim());
                    currentArg = '';
                } else {
                    if (char === '(') depth++;
                    if (char === ')') depth--;
                    currentArg += char;
                }
            }
            args.push(currentArg.trim());

            args = args.map(arg => _parseFunctionCall(arg));

            return { functionName, args };
        }
        function evaluateFunction(functionName, args) {
            let result;
            if (functionName === 'average') {
                return result = [average(args)];
            }
            else {
                return FF[functionName](...args, pt)
            }
        }

        function removeUnmatchedParentheses(expression) {
            let stack = [];
            let indicesToRemove = new Set();

            for (let i = 0; i < expression.length; i++) {
                if (expression[i] === '(') {
                    stack.push(i);
                } else if (expression[i] === ')') {
                    if (stack.length > 0) {
                        stack.pop();
                    } else {
                        indicesToRemove.add(i);
                    }
                }
            }

            while (stack.length > 0) {
                indicesToRemove.add(stack.pop());
            }

            let correctedExpression = '';
            for (let i = 0; i < expression.length; i++) {
                if (!indicesToRemove.has(i)) {
                    correctedExpression += expression[i];
                }
            }

            return correctedExpression;
        }

        function parseDigitInParentheses(input) {

            const regex = /^\(([-+]?\d*\.?\d+)\)$/;
            if (typeof input === 'number') {
                return input;
            }
            console.log(" input " + input);

            let match = input.match(regex);
            if (match) {
                return parseFloat(match[1]);
            }

            const cleanedInput = input.replace(/[()]/g, '').trim();

            const parsedNumber = parseFloat(cleanedInput);

            return isNaN(parsedNumber) ? input : parsedNumber;
        }

        function evaluateFloat(expression) {

            const validExpressionPattern = /^[\d\s()+\-*/.]+$/;

            function containsInvalidCharacters(exp) {
                const invalidPattern = /[a-zA-Z_]/;
                return invalidPattern.test(exp);
            }

            expression = expression.trim();

            if (!validExpressionPattern.test(expression) || containsInvalidCharacters(expression)) {
                throw new Error("Invalid expression: Contains variables or invalid characters.");
            }

            try {

                const result = new Function(`return (${expression});`)();

                if (!isFinite(result)) {
                    throw new Error("Expression did not evaluate to a valid number.");
                }

                return result;
            } catch (error) {
                throw new Error(`Failed to evaluate expression: ${error.message}`);
            }
        }

        function parseAndGenerateCallStack___000(functionCallString) {
            let callStack = [];
            let uniqueCounter = 0;

            function isNumber(expression) {
                const numberPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
                const mathOperationPattern = /^\((\s*[-+]?(\d+(\.\d*)?|\.\d+)(\s*[-+*/]\s*[-+]?(\d+(\.\d*)?|\.\d+))*)\)$/;

                function containsVariables(exp) {
                    const variablePattern = /[a-zA-Z_]/;
                    return variablePattern.test(exp);
                }

                expression = expression.trim();

                if (numberPattern.test(expression)) return true;
                if (mathOperationPattern.test(expression) && !containsVariables(expression)) return true;

                return false;
            }

            function parseExpression(expression) {
                const functionPattern = /(\w+)\((.*)\)/;
                const bracketPattern = /(\w+)\[(.*?)\]/;
                if (expression === null || expression.trim().length <= 0) {
                    return '';
                }
                expression = removeUnmatchedParentheses(expression);
                if (isNumber(expression)) {
                    return { functionName: 'const', args: [evaluateFloat(expression)] };
                }

                let match;
                if ((match = functionPattern.exec(expression))) {
                    const functionName = match[1];
                    const argsString = match[2];
                    const args = splitArguments(argsString).map(parseExpression);
                    return { functionName, args };
                } else if ((match = bracketPattern.exec(expression))) {
                    const objectName = match[1];
                    const key = match[2];
                    return { functionName: 'access', args: [objectName, key] };
                }
                return parseWithOperators(expression.trim());
            }

            function handleNegativeValues(expression) {
                const negativePattern = /^-\((.*)\)$/;
                let match = negativePattern.exec(expression);

                if (match) {
                    const innerExpression = match[1];

                    const parsedInner = parseExpression(innerExpression);
                    return { functionName: 'negate', args: [parsedInner] };
                }
                return expression;
            }

            function splitArguments(argsString) {
                let args = [];
                let depth = 0;
                let currentArg = '';

                for (let i = 0; i < argsString.length; i++) {
                    const char = argsString[i];
                    if (char === ',' && depth === 0) {
                        args.push(currentArg.trim());
                        currentArg = '';
                    } else {
                        if (char === '(') depth++;
                        if (char === ')') depth--;
                        currentArg += char;
                    }
                }
                if (currentArg) args.push(currentArg.trim());
                return args;
            }

            function parseWithOperators(expression) {
                if (typeof expression !== 'string') {
                    return expression;
                }
                expression = handleNegativeValues(expression);
                if (typeof expression !== 'string') {
                    return expression;
                }
                const indexPattern = /^__index__\d+$/;
                if (indexPattern.test(expression)) {
                    return { functionName: 'index_method', args: [expression] }
                }
                const negative_indexPattern = /^-__index__\d+$/;
                if (negative_indexPattern.test(expression)) {
                    return { functionName: '-index_method', args: [expression] }
                }

                const operatorPattern = /([-+*/^])/;
                let tokens = expression.split(operatorPattern).map(t => t.trim());
                if (!Array.isArray(tokens)) {
                    throw new TypeError("Input must be an array");
                }
                tokens = tokens.filter(item => item !== '');
                tokens = mergeNegativeOperators(tokens)
                let table_names = Object.keys(pt.getTablesByName());
                let it = 0;
                for (let t of tokens) {
                    for (let n of table_names) {
                        if (t === n) {
                            t = t + '[0]'
                            tokens[it] = t;
                        }
                    }
                    it++;
                }
                if (tokens.length === 1) {
                    return parseExpression(tokens[0]);
                }
                let result = parseExponentiation(tokens);
                return parseRemainingOperators(result);
            }

            function mergeNegativeOperators(arr) {
                if (!Array.isArray(arr)) throw new TypeError("Input must be an array");

                const operators = ["+", "-", "*", "/", "^"];
                const placeholderRe = /^__index__\d+$/;

                const result = [];
                for (let i = 0; i < arr.length; i++) {
                    const cur = arr[i];

                    if (operators.includes(cur) && arr[i + 1] === "-") {
                        const nextNext = arr[i + 2];

                        const shouldGlue =

                            typeof nextNext === "string" && /^[0-9.]/.test(nextNext) ||

                            (typeof nextNext === "string" && placeholderRe.test(nextNext)) ||

                            (typeof nextNext === "string" && nextNext.startsWith("("));

                        if (shouldGlue) {
                            result.push(cur);
                            result.push("-" + nextNext);
                            i += 2;
                            continue;
                        }
                    }
                    result.push(cur);
                }

                return result;
            }

            function parseExponentiation(tokens) {
                let result = parseExpression(tokens[0]);

                for (let i = 1; i < tokens.length; i += 2) {
                    const operator = tokens[i];

                    if (operator === '^') {
                        let rightOperand = parseExpression(tokens[i + 1]);

                        if (Array.isArray(rightOperand) || typeof rightOperand === 'object') {
                            rightOperand = executeParsedCall(rightOperand);
                        }

                        result = { functionName: '^', args: [result, rightOperand] };
                    } else {
                        return [result, ...tokens.slice(i)];
                    }
                }
                return result;
            }

            function parseRemainingOperators(tokens) {
                let result = Array.isArray(tokens) ? tokens[0] : tokens;

                if (!Array.isArray(tokens)) return result;

                for (let i = 1; i < tokens.length; i += 2) {
                    const operator = tokens[i];
                    const rightOperand = parseExpression(tokens[i + 1]);

                    result = { functionName: operator, args: [result, rightOperand] };
                }
                return result;
            }

            function generateUniqueIdentifier(functionName, args) {
                uniqueCounter++;
                const argsString = args.map(arg => arg.toString().replace(/"/g, '')).join('_');
                return `${functionName}_${argsString}_${uniqueCounter}`;
            }

            function executeFunctionByName(functionName, args) {
                const uniqueResult = generateUniqueIdentifier(functionName, args);
                console.log(`Executing ${functionName} with arguments: ${JSON.stringify(args)}. Result: ${uniqueResult}`);
                callStack.push({ functionName, args, result: uniqueResult });
                return uniqueResult;
            }

            function executeParsedCall(parsedCall) {
                if (typeof parsedCall === 'string' || typeof parsedCall === 'number') {
                    return parsedCall;
                }

                const resolvedArgs = parsedCall.args.map(executeParsedCall);
                return executeFunctionByName(parsedCall.functionName, resolvedArgs);
            }

            if (functionCallString != null && functionCallString.length > 0) {
                const parsedCallStack = parseWithOperators(functionCallString);
                console.log("Parsed call stack:", JSON.stringify(parsedCallStack, null, 2));

                const result = executeParsedCall(parsedCallStack);
                if (result) {
                    callStack.push({ functionName: 'var', args: [result], result });
                }
            }
            return callStack;
        }

        async function executeCallStack(callStack, res) {
            const results = {};
            let isNegativeNext = false;
            function extractIndexValue(str) {
                const indexPattern = /^__index__(\d+)$/;
                const match = str.match(indexPattern);
                return match ? parseInt(match[1], 10) : null;
            }

            function performElementWiseOperation(operator, leftArray, rightArray) {
                [leftArray, rightArray] = matchArrayLengths(leftArray, rightArray);
                return leftArray.map((value, i) => {
                    const rightValue = rightArray[i];
                    if (typeof value === 'number' && typeof rightValue === 'number') {
                        switch (operator) {
                            case '+': return value + rightValue;
                            case '-':

                                if (isNaN(value)) {
                                    return -1 * rightValue;
                                }
                                return value - rightValue;
                            case '*': return value * rightValue;
                            case '/': return value / rightValue;
                            case '^': return Math.pow(value, rightValue);
                            default: throw new Error(`Unknown operator: ${operator}`);
                        }
                    } else {
                        return value;
                    }
                });
            }

            function matchArrayLengths(leftArray, rightArray) {
                if (!Array.isArray(rightArray)) {
                    rightArray = [parseFloat('' + parseDigitInParentheses(rightArray))];
                }
                if (!Array.isArray(leftArray)) {
                    leftArray = [parseFloat('' + parseDigitInParentheses(leftArray))];
                }

                const leftLength = leftArray.length;
                const rightLength = rightArray.length;

                function extendArray(array, targetLength) {
                    const extendedArray = [...array];
                    const lastItem = array[array.length - 1];

                    while (extendedArray.length < targetLength) {
                        extendedArray.push(lastItem);
                    }

                    return extendedArray;
                }

                if (leftLength < rightLength) {
                    return [extendArray(leftArray, rightLength), rightArray];
                } else if (rightLength < leftLength) {
                    return [leftArray, extendArray(rightArray, leftLength)];
                } else {
                    return [leftArray, rightArray];
                }
            }

            function calculateAverage(array2D) {
                let sum = 0;
                let count = 0;
                array2D.forEach(value => {
                    if (typeof value === 'number') {
                        sum += value;
                        count++;
                    }
                });
                return count > 0 ? sum / count : 0;
            }

            for (const entry of callStack) {
                const { functionName, args, result } = entry;
                let computedResult;
                if (functionName === 'negative') {
                    isNegativeNext = true;
                    continue;
                }
                else if (functionName === 'negate') {
                    let inner = results[args[0]];
                    if (Array.isArray(inner)) {
                        computedResult = inner.map(v => (typeof v === 'number' ? -v : v));
                    } else if (typeof inner === 'number') {
                        computedResult = -inner;
                    } else {

                        const n = Number(inner);
                        computedResult = Number.isFinite(n) ? -n : inner;
                    }
                }
                if (['+', '-', '*', '/', '^'].includes(functionName)) {
                    const [left, right] = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );
                    console.log('debubg');
                    computedResult = performElementWiseOperation(functionName, left, right);
                }
                else if (functionName === 'access') {
                    const [objectName, key] = args;
                    let r = await parseSingleVariable(`${objectName}[${key}]`, pt.getTablesByName(), results);
                    computedResult = r;
                }
                else if (functionName === 'average') {
                    console.log('debubg');
                    const array2D = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );
                    const flattened = array2D.flat();
                    computedResult = [calculateAverage(flattened)];
                } else if (functionName === 'aggregate') {
                    console.log('debubg');
                    const array2D = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );
                    const flattened = array2D.flat();
                    computedResult = [calculateAverage(flattened)];
                }
                else if (functionName === 'log') {
                    computedResult = FF[functionName](results[args[0]], pt)
                }
                else if (functionName === 'var') {
                    computedResult = results[args[0]];
                }
                else if (functionName === 'const') {
                    computedResult = args[0];
                } else if (functionName === 'index_method') {
                    computedResult = res[extractIndexValue(args[0])]
                }
                else if (functionName === '-index_method') {
                    let v = args[0].startsWith('-') ? args[0].slice(1) : args[0];
                    computedResult = res[extractIndexValue(v)]
                    computedResult = Array.isArray(computedResult)
                        ? computedResult.map(value => value * -1)
                        : computedResult * -1;
                }
                if (isNegativeNext) {
                    computedResult = computedResult.map(value => (typeof value === 'number' ? -value : value));
                    isNegativeNext = false;
                }
                results[result] = computedResult;

            }

            const finalEntry = callStack[callStack.length - 1];
            return results[finalEntry.result];
        }

        function splitEquation(equation) {
            const [left, right] = equation.split('=').map(part => part.trim());
            const leftList = left.includes(',')
                ? left.split(',').map(item => item.trim())
                : [left];
            return { left: leftList, right: right };
        }

        function replaceIgnoringWhitespace(expr, subExpr, replacement) {
            if (expr.toString() === subExpr.toString()) {
                return replacement;
            }
            return expr.replace(subExpr, replacement);
        }

        function updateAndReorderExponents(callStack) {
            if (!Array.isArray(callStack) || callStack.length === 0) {
                throw new Error("Invalid or empty call stack provided.");
            }

            const finalStackResult = callStack[callStack.length - 1]?.result;

            if (!finalStackResult) {
                throw new Error("No valid result found in the call stack.");
            }

            let exponentEntries = [];
            let otherEntries = [];

            callStack.forEach((entry) => {
                if (
                    entry.functionName === '^' &&
                    Array.isArray(entry.args) &&
                    entry.args.length === 2 &&
                    entry.args[1] === ""
                ) {
                    console.log(`Updating exponent function with empty second argument: ${JSON.stringify(entry)}`);

                    entry.args[1] = finalStackResult;

                    exponentEntries.push(entry);
                } else {

                    otherEntries.push(entry);
                }
            });

            const updatedCallStack = [...otherEntries, ...exponentEntries];

            return updatedCallStack;
        }

        function expression_by_order(expression) {
            const operations = [];

            function _spliceOnce(str, start, end, replacement) {
                return str.slice(0, start) + replacement + str.slice(end);
            }

            function extractFunctions(expr) {
                const fnRe = /(\b[a-zA-Z_]\w*)\s*\(([^()]*)\)/;
                while (true) {
                    const m = expr.match(fnRe);
                    if (!m) break;

                    const full = m[0].trim();
                    operations.push(full);
                    const ph = `__index__${operations.length - 1}`;
                    expr = _spliceOnce(expr, m.index, m.index + m[0].length, ph);
                }
                return expr;
            }

            function extractParentheses(expr) {
                const parenRe = /\(([^()]*)\)/;
                while (true) {
                    const m = expr.match(parenRe);
                    if (!m) break;
                    const inner = m[1].trim();

                    operations.push(inner);
                    const ph = `__index__${operations.length - 1}`;
                    expr = _spliceOnce(expr, m.index, m.index + m[0].length, ph);
                }
                return expr;
            }

            const TERM = '(?:__index__\\d+|-?\\d+(?:\\.\\d+)?|-?\\w+(?:\\[[^\\]]+\\])*)';
            const PLACEHOLDER = '__index__\\d+';

            function parsePow(expr) {

                const powRe = new RegExp(
                    `${TERM}\\s*\\^\\s*(-?(?:${PLACEHOLDER}|\\([^()]*\\)|\\w+(?:\\[[^\\]]+\\])*|\\d+(?:\\.\\d+)?))`
                );

                while (true) {
                    const m = expr.match(powRe);
                    if (!m) break;

                    const full = m[0];
                    const lhsPlusCaret = m[0].slice(0, m[0].indexOf('^')).trim();
                    const lhsStart = m.index;
                    const lhsEnd = m.index + m[0].indexOf('^');

                    const rhsRaw = m[1].trim();

                    if (rhsRaw.startsWith('-')) {
                        const rhsWithoutMinus = rhsRaw.slice(1);

                        const negateOp = `-(${rhsWithoutMinus.replace(/\s+/g, '')})`;
                        operations.push(negateOp);
                        const negPh = `__index__${operations.length - 1}`;

                        const fullCompact = full.replace(/\s+/g, '');
                        const caretIdx = fullCompact.indexOf('^');
                        const lhsCompact = fullCompact.slice(0, caretIdx);
                        const powOp = `${lhsCompact}^(${negPh})`;

                        operations.push(powOp);
                        const powPh = `__index__${operations.length - 1}`;

                        expr = _spliceOnce(expr, m.index, m.index + full.length, powPh);
                    } else {

                        const subCompact = full.replace(/\s+/g, '');
                        operations.push(subCompact);
                        const ph = `__index__${operations.length - 1}`;
                        expr = _spliceOnce(expr, m.index, m.index + full.length, ph);
                    }
                }

                return expr;
            }

            function parseMulDiv(expr) {
                const re = new RegExp(`${TERM}\\s*([*/])\\s*${TERM}`);
                while (true) {
                    const m = expr.match(re);
                    if (!m) break;
                    const sub = m[0];
                    operations.push(sub.replace(/\s+/g, ''));
                    const ph = `__index__${operations.length - 1}`;
                    expr = _spliceOnce(expr, m.index, m.index + m[0].length, ph);
                }
                return expr;
            }

            function parseAddSub(expr) {
                const re = new RegExp(`${TERM}\\s*([+-])\\s*${TERM}`);
                while (true) {
                    const m = expr.match(re);
                    if (!m) break;
                    const sub = m[0];
                    operations.push(sub.replace(/\s+/g, ''));
                    const ph = `__index__${operations.length - 1}`;
                    expr = _spliceOnce(expr, m.index, m.index + m[0].length, ph);
                }
                return expr;
            }

            let result = expression;
            result = extractFunctions(result);
            result = extractParentheses(result);
            result = parsePow(result);
            result = parseMulDiv(result);
            result = parseAddSub(result);
            operations.push(result.trim());

            return operations;
        }

        function generateFullCallStack___deprecated(expressionArray) {
            let callStack = [];
            let uniqueCounter = 0;
            let resultMap = {};

            function generateUniqueIdentifier(functionName, args) {
                uniqueCounter++;
                const argsString = args.map(arg => arg.toString().replace(/"/g, '')).join('_');
                return `${functionName}_${argsString}_${uniqueCounter}`;
            }

            function executeFunctionByName(functionName, args) {
                const uniqueResult = generateUniqueIdentifier(functionName, args);
                console.log(`Executing ${functionName} with arguments: ${JSON.stringify(args)}. Result: ${uniqueResult}`);
                callStack.push({ functionName, args, result: uniqueResult });
                return uniqueResult;
            }

            function executeParsedCall(parsedCall) {
                if (typeof parsedCall === 'string' || typeof parsedCall === 'number') {
                    return parsedCall;
                }

                const resolvedArgs = parsedCall.args.map(arg => {
                    if (typeof arg === 'string' && arg.startsWith('__index__')) {
                        return resultMap[arg];
                    }
                    return executeParsedCall(arg);
                });

                return executeFunctionByName(parsedCall.functionName, resolvedArgs);
            }

            function parseExpression(expression) {
                const functionPattern = /(\w+)\((.*)\)/;
                const bracketPattern = /(\w+)\[(.*?)\]/;

                if (!expression || expression.trim().length === 0) return '';

                expression = removeUnmatchedParentheses(expression);

                if (isNumber(expression)) {
                    return { functionName: 'const', args: [evaluateFloat(expression)] };
                }

                const indexPattern = /^__index__\d+$/;
                if (indexPattern.test(expression)) {
                    return { functionName: 'var', args: [expression] }
                }

                let match;
                if ((match = functionPattern.exec(expression))) {
                    const functionName = match[1];
                    const argsString = match[2];
                    const args = splitArguments(argsString).map(parseExpression);
                    return { functionName, args };
                } else if ((match = bracketPattern.exec(expression))) {
                    const objectName = match[1];
                    const key = match[2];
                    return { functionName: 'access', args: [objectName, key] };
                }

                return parseWithOperators(expression.trim());
            }

            function parseWithOperators(expression) {
                const operatorPattern = /([-+*/^])/;
                let tokens = expression.split(operatorPattern).map(t => t.trim());

                if (tokens.length === 1) return parseExpression(tokens[0]);

                let result = parseExponentiation(tokens);
                return parseRemainingOperators(result);
            }

            function parseExponentiation(tokens) {
                let result = parseExpression(tokens[0]);

                for (let i = 1; i < tokens.length; i += 2) {
                    const operator = tokens[i];

                    if (operator === '^') {
                        let rightOperand = parseExpression(tokens[i + 1]);

                        if (typeof rightOperand === 'object') {
                            rightOperand = executeParsedCall(rightOperand);
                        }

                        result = { functionName: '^', args: [result, rightOperand] };
                    } else {
                        return [result, ...tokens.slice(i)];
                    }
                }
                return result;
            }

            function parseRemainingOperators(tokens) {
                let result = Array.isArray(tokens) ? tokens[0] : tokens;

                if (!Array.isArray(tokens)) return result;

                for (let i = 1; i < tokens.length; i += 2) {
                    const operator = tokens[i];
                    const rightOperand = parseExpression(tokens[i + 1]);

                    result = { functionName: operator, args: [result, rightOperand] };
                }
                return result;
            }

            function splitArguments(argsString) {
                let args = [];
                let depth = 0;
                let currentArg = '';

                for (let char of argsString) {
                    if (char === ',' && depth === 0) {
                        args.push(currentArg.trim());
                        currentArg = '';
                    } else {
                        if (char === '(') depth++;
                        if (char === ')') depth--;
                        currentArg += char;
                    }
                }
                if (currentArg) args.push(currentArg.trim());
                return args;
            }

            function isNumber(expression) {
                const numberPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
                const mathOperationPattern = /^\((\s*[-+]?(\d+(\.\d*)?|\.\d+)(\s*[-+*/]\s*[-+]?(\d+(\.\d*)?|\.\d+))*)\)$/;

                function containsVariables(exp) {
                    const variablePattern = /[a-zA-Z_]/;
                    return variablePattern.test(exp);
                }

                expression = expression.trim();
                return numberPattern.test(expression) || (mathOperationPattern.test(expression) && !containsVariables(expression));
            }

            function removeUnmatchedParentheses(expr) {
                let depth = 0;
                let cleanedExpr = '';

                for (let char of expr) {
                    if (char === '(') depth++;
                    if (char === ')') {
                        if (depth === 0) continue;
                        depth--;
                    }
                    cleanedExpr += char;
                }
                return cleanedExpr;
            }

            function evaluateFloat(expression) {
                return parseFloat(expression);
            }

            for (let i = 0; i < expressionArray.length; i++) {
                const expr = expressionArray[i];
                let parsedCall = parseExpression(expr);

                const result = executeParsedCall(parsedCall);
                const placeholder = `__index__${i}`;
                resultMap[placeholder] = result;
                callStack.push({ functionName: 'var', args: [result], result });
            }

            return callStack;
        }

        function containsAnding(input) {

            const regex = /\[\s*([a-zA-Z0-9]+\s*,\s*)+[a-zA-Z0-9]+\s*\]/g;

            const matches = input.match(regex);

            return matches !== null;
        }

        function replaceCommaInBrackets(text) {
            return text.replace(/\[(.*?)\]/g, (match, contents) => {
                if (contents.includes(',')) {
                    return `[${contents.replace(/,/g, ' and ')}]`;
                }
                return match;
            });
        }

        try {
            let tags = []
            if (expression.indexOf('=') > 0) {
                let tags_eq = splitEquation(expression)
                expression = tags_eq["right"]
                tags = tags_eq['left']
                if (tags[0].indexOf(';') > 0) {
                    tags = tags[0].split(';')
                }
            }
            let ct = []
            let exp = expression_by_order(expression)
            let currentResult = []

            for (let e of exp) {

                if (containsAnding(e))
                    e = replaceCommaInBrackets(e)
                let temp = parseAndGenerateCallStack___000(e)

                let cstack = await executeCallStack(temp, ct)
                ct.push(cstack)
                currentResult = cstack;
            }
            return resolve({
                tags: tags,
                results: currentResult
            })
        } catch (exception) {
            console.log(' failed ! ')

            console.error("Exception caught:");
            console.error(`Message: ${exception.message}`);
            console.error("Stack trace:");
            console.error(exception.stack);
            return resolve({ message: exception.toString() })
        }

    });

}

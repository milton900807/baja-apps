function (expression, pt) {

    return new Promise(async (resolve, reject) => {






        if (expression.indexOf('average') >= 0)
            debugger;


        function stripOuterParentheses(expr) {
            if (typeof expr !== 'string') return expr;

            expr = expr.trim();

            if (expr.startsWith('(') && expr.endsWith(')')) {
                let depth = 0;
                for (let i = 0; i < expr.length; i++) {
                    if (expr[i] === '(') depth++;
                    else if (expr[i] === ')') depth--;

                    if (depth === 0 && i < expr.length - 1) {
                        return expr;
                    }
                }

                return expr.slice(1, -1).trim();
            }
            return expr;
        }

        function hasQuotes(str, opts = {}) {
            if (typeof str !== 'string') return false;

            const DEFAULT_QUOTES = [`"`, `'`, '`', '“', '”', '‘', '’'];
            const set = new Set(
                opts.quotes
                    ? (Array.isArray(opts.quotes) ? opts.quotes : String(opts.quotes).split(''))
                    : DEFAULT_QUOTES
            );

            const ignoreEscaped = !!opts.ignoreEscaped;

            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (set.has(ch)) {
                    if (ignoreEscaped && i > 0 && str[i - 1] === '\\') continue;
                    return true;
                }
            }
            return false;
        }

        let FF = await exec('baja/expression/functions-factory');

        function average(...args) {

            let allValues = args.flat(Infinity);

            if (allValues.length === 1 && Array.isArray(allValues[0])) {
                allValues = allValues[0];
            }

            const numericValues = allValues.map(val => {
                if (typeof val === 'string') {
                    const parsed = parseFloat(val.trim());
                    return isNaN(parsed) ? null : parsed;
                }
                return typeof val === 'number' ? val : null;
            });

            const validValues = numericValues.filter(val => val !== null && isFinite(val));

            if (validValues.length === 0) return 0;

            const sum = validValues.reduce((acc, val) => acc + val, 0);
            return sum / validValues.length;
        }

        function mean(...args) {

            let allValues = args.flat(Infinity);

            if (allValues.length === 1 && Array.isArray(allValues[0])) {
                allValues = allValues[0];
            }

            const numericValues = allValues.map(val => {
                if (typeof val === 'string') {
                    const parsed = parseFloat(val.trim());
                    return isNaN(parsed) ? null : parsed;
                }
                return typeof val === 'number' ? val : null;
            });

            const validValues = numericValues.filter(val => val !== null && isFinite(val));

            if (validValues.length === 0) return 0;

            const sum = validValues.reduce((acc, val) => acc + val, 0);
            return sum / validValues.length;
        }

        function compareObjectsOrValues(left, right, operator, res, results) {

            if (Array.isArray(left)) left = left.length > 0 ? left[0] : null;
            if (Array.isArray(right)) right = right.length > 0 ? right[0] : null;

            const leftValue = (left && typeof left === 'object' && 'value' in left) ? left.value : left;
            const rightValue = (right && typeof right === 'object' && 'value' in right) ? right.value : right;

            const toNum = v => (v === null || v === undefined ? NaN : Number(v));

            function tryLookup(store, key) {
                if (!store || key === null || key === undefined) return undefined;

                if (typeof store === 'object' && !Array.isArray(store) && key in store) {
                    const val = store[key];
                    if (val && typeof val === 'object' && 'value' in val) return val.value;
                    if (typeof val !== 'undefined') return val;
                }
                for (const mapKey of ['values', 'results', 'data', 'map']) {
                    if (store && typeof store[mapKey] === 'object' && key in store[mapKey]) {
                        const val = store[mapKey][key];
                        if (val && typeof val === 'object' && 'value' in val) return val.value;
                        return val;
                    }
                }

                if (Array.isArray(store)) {
                    for (const rec of store) {
                        if (!rec || typeof rec !== 'object') continue;
                        const candidates = [
                            'key', 'label', 'name', 'id', 'field', 'ref', 'code',

                            key
                        ];
                        for (const c of candidates) {
                            if (c in rec && String(rec[c]) === String(key)) {

                                for (const vField of ['value', 'val', 'amount', 'number', 'result']) {
                                    if (vField in rec) return rec[vField];
                                }

                                if ('value' in rec) return rec.value;

                                return rec[c];
                            }
                        }
                    }

                    for (const pair of store) {
                        if (Array.isArray(pair) && pair.length >= 2 && String(pair[0]) === String(key)) {
                            return pair[1];
                        }
                    }
                }

                return undefined;
            }

            function resolveNumber(raw) {
                let n = toNum(raw);
                if (!Number.isNaN(n)) return n;

                const stores = [res, results];
                for (const st of stores) {
                    const looked = tryLookup(st, raw);
                    n = toNum(looked);
                    if (!Number.isNaN(n)) return n;
                }
                return NaN;
            }

            const lv = resolveNumber(leftValue);
            const rv = resolveNumber(rightValue);

            if (Number.isNaN(lv) || Number.isNaN(rv)) {
                throw new Error(`Invalid comparison: left=${leftValue}, right=${rightValue}`);
            }

            let result;
            switch (operator) {
                case '<': result = lv < rv; break;
                case '<=': result = lv <= rv; break;
                case '>': result = lv > rv; break;
                case '>=': result = lv >= rv; break;
                case '==': result = lv == rv; break;
                case '!=': result = lv != rv; break;
                default: throw new Error(`Unsupported operator: ${operator}`);
            }

            if (left && typeof left === 'object' && 'value' in left) {
                return { ...left, value: result };
            } else if (right && typeof right === 'object' && 'value' in right) {
                return { ...right, value: result };
            }
            return result;
        }

        function calculateAverage_values_only(values) {
            const sum = values.reduce((acc, val) => acc + val, 0);
            return sum / values.length;
        }
        function calculateAverage(values) {
            if (!Array.isArray(values)) {
                throw new Error("calculateAverage: values must be an array");
            }
            if (values.length === 0) {
                return { value: 0, stdDev: 0, group: {}, groupIds: [] };
            }

            const combined = values.reduce((acc, item, idx) => {

                const vRaw = (item != null && typeof item === "object") ? item.value : item;

                const num = (typeof vRaw === "number") ? vRaw
                    : (typeof vRaw === "string" && vRaw.trim() !== "") ? parseFloat(vRaw)
                        : NaN;

                if (!Number.isFinite(num)) {
                    throw new Error(`Non-numeric value at index ${idx}: ${JSON.stringify(vRaw)}`);
                }

                acc.sum += num;
                acc.squaredSum += num * num;
                acc.count += 1;

                const grp = (item && item.group && typeof item.group === "object") ? item.group : null;
                if (grp) {
                    for (const [k, v] of Object.entries(grp)) {

                        acc.group[k] = v;
                    }
                }

                if (item && item.uid != null) acc.groupIds.push(item.uid);
                return acc;
            }, { sum: 0, squaredSum: 0, count: 0, group: {}, groupIds: [] });

            const meanValue = combined.sum / combined.count;
            const variance = (combined.squaredSum / combined.count) - (meanValue * meanValue);
            const stdDev = Math.sqrt(Math.max(variance, 0));

            return {
                value: meanValue,
                stdDev,
                group: combined.group,
                groupIds: combined.groupIds
            };
        }
        function geometric_mean(values) {
            if (!Array.isArray(values)) {
                throw new Error("geometric_mean: values must be an array");
            }
            if (values.length === 0) {
                return { value: 0, count: 0, group: {}, groupIds: [] };
            }

            const combined = values.reduce((acc, item, idx) => {

                const vRaw = (item != null && typeof item === "object") ? item.value : item;

                const num = (typeof vRaw === "number") ? vRaw
                    : (typeof vRaw === "string" && vRaw.trim() !== "") ? parseFloat(vRaw)
                        : NaN;

                if (!Number.isFinite(num) || num <= 0) {
                    throw new Error(`Non-positive or non-numeric value at index ${idx}: ${JSON.stringify(vRaw)}`);
                }

                acc.logSum += Math.log(num);
                acc.count += 1;

                const grp = (item && item.group && typeof item.group === "object") ? item.group : null;
                if (grp) {
                    for (const [k, v] of Object.entries(grp)) {
                        acc.group[k] = v;
                    }
                }

                if (item && item.uid != null) acc.groupIds.push(item.uid);
                return acc;
            }, { logSum: 0, count: 0, group: {}, groupIds: [] });

            const meanLog = combined.logSum / combined.count;
            const gmean = Math.exp(meanLog);

            return {
                value: gmean,
                count: combined.count,
                group: combined.group,
                groupIds: combined.groupIds
            };
        }

        function sumArray(arr) {
            if (!Array.isArray(arr)) {
                throw new Error("Input must be an array");
            }
            return arr.reduce((sum, num) => {
                if (typeof num !== 'number') {
                    throw new Error("Array must contain only numbers");
                }
                return sum + num;
            }, 0);
        }

        function abs(arr) {
            if (!Array.isArray(arr)) {
                throw new Error("Input must be an array");
            }

            return arr.reduce((sum, item) => {
                if (typeof item === 'number') {
                    return sum + item;
                } else if (typeof item === 'object' && item !== null && typeof item.value === 'number') {
                    return sum + item.value;
                } else {
                    throw new Error("Array must contain only numbers or objects with a numeric 'value' property");
                }
            }, 0);

        }

        function sumproduct(args, results, res) {

            if (args && args.length === 2 && results && Object.keys(results).length === 2) {
                const sum = results[args[0]]
                const product = results[args[1]][0]
                let t = 0;
                for (let s of sum) {
                    t += s.value * product.value;
                }
                return t;
            }
            const v = res;

            const values = (Array.isArray(v) && v.length === 1 && Array.isArray(v[0]))
                ? v[0]
                : v;

            if (!Array.isArray(values) || values.length !== 2) {
                console.warn("sumproduct: Expected [array1, array2] or [[array1, array2]].");
                return NaN;
            }

            const [a, b] = values;

            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
                console.warn("sumproduct: Both arrays must exist and be of equal length.");
                return NaN;
            }

            let total = 0;

            for (let i = 0; i < a.length; i++) {
                const valA = (a[i] && typeof a[i] === 'object') ? a[i].value : a[i];
                const valB = (b[i] && typeof b[i] === 'object') ? b[i].value : b[i];

                if (typeof valA !== 'number' || typeof valB !== 'number') {
                    console.warn(`sumproduct: Non-numeric value found at index ${i}`);
                    return NaN;
                }

                total += valA * valB;
            }

            return total;
        }

        function min(values) {
            if (!Array.isArray(values)) {
                console.warn("minup: Expected an array.");
                return NaN;
            }
            let minVal = Infinity;
            for (let item of values) {
                let val = (typeof item === 'object' && item !== null && 'value' in item)
                    ? item.value
                    : item;

                if (typeof val === 'number' && !isNaN(val)) {
                    minVal = Math.min(minVal, val);
                }
            }

            return minVal === Infinity ? NaN : minVal;
        }
        function ceil(input) {

            const toNumber = (item) => {
                const val = (typeof item === 'object' && item !== null && 'value' in item)
                    ? item.value
                    : item;
                const n = Number(val);
                return Number.isFinite(n) ? n : NaN;
            };

            if (Array.isArray(input)) {
                const out = [];
                for (const item of input) {
                    const n = toNumber(item);
                    return n;
                }
                return NaN;
            } else {
                const n = toNumber(input);
                return Number.isNaN(n) ? NaN : Math.ceil(n);
            }
        }

        function pow(values) {
            if (!Array.isArray(values) || values.length < 2) {
                console.warn("pow: Expected an array with at least two elements.");
                return NaN;
            }

            let base = (typeof values[0] === 'object' && values[0] !== null && 'value' in values[0])
                ? values[0].value
                : values[0];

            let exponent = (typeof values[1] === 'object' && values[1] !== null && 'value' in values[1])
                ? values[1].value
                : values[1];

            if (typeof base !== 'number' || isNaN(base) || typeof exponent !== 'number' || isNaN(exponent)) {
                return NaN;
            }

            return Math.pow(base, exponent);
        }

        function max(values) {
            if (!Array.isArray(values)) {
                console.warn("maxup: Expected an array.");
                return NaN;
            }
            let maxVal = -Infinity;
            for (let item of values) {
                let val = (typeof item === 'object' && item !== null && 'value' in item)
                    ? item.value
                    : item;

                if (typeof val === 'number' && !isNaN(val)) {
                    maxVal = Math.max(maxVal, val);
                }
            }

            return maxVal === -Infinity ? NaN : maxVal;
        }

        function sqrt(value) {
            let val = (typeof value === 'object' && value !== null && 'value' in value)
                ? value.value
                : value;

            if (typeof val !== 'number' || isNaN(val) || val < 0) {
                console.warn("sqrt: Expected a non-negative number.");
                return NaN;
            }

            return Math.sqrt(val);
        }

        function normcdf(x, mean = 0, sd = 1) {
            let xv = (typeof x === 'object' && x !== null && 'value' in x) ? x.value : x;
            let mv = (typeof mean === 'object' && mean !== null && 'value' in mean) ? mean.value : mean;
            let sv = (typeof sd === 'object' && sd !== null && 'value' in sd) ? sd.value : sd;

            if ([xv, mv, sv].some(v => typeof v !== 'number' || isNaN(v)) || sv <= 0) {
                console.warn("normcdf: Expected numbers with sd > 0.");
                return NaN;
            }

            let z = (xv - mv) / (sv * Math.sqrt(2));
            return 0.5 * (1 + erf(z));
        }
        function erf(z) {
            const x = (typeof z === 'object' && z !== null && 'value' in z) ? z.value : z;

            if (typeof x !== 'number' || isNaN(x)) {
                console.warn("erf: Expected a number.");
                return NaN;
            }

            const t = 1 / (1 + 0.5 * Math.abs(x));
            const tau = t * Math.exp(
                -x * x - 1.26551223 +
                t * (1.00002368 +
                    t * (0.37409196 +
                        t * (0.09678418 +
                            t * (-0.18628806 +
                                t * (0.27886807 +
                                    t * (-1.13520398 +
                                        t * (1.48851587 +
                                            t * (-0.82215223 +
                                                t * 0.17087277)))))))))

            return x >= 0 ? 1 - tau : tau - 1;
        }

        function sumup(v) {
            const values = v[0]
            if (Array.isArray(values) && values.length === 2) {
                const [a, b] = values;
                if (a.length !== b.length) {
                    throw new Error("Arrays must be of equal length.");
                }

                let result = 0;
                for (let i = 0; i < a.length; i++) {
                    result += a[i] * b[i];
                }
                return result;
            } else {

                if (values[0] && values[1] && values[0].length === values[1].length) {
                    let sumv = []
                    for (let i = 0; i < values[0].length; i++) {
                        sumv[i] = values[0][i].value * values[1][i].value
                    }
                    return sumArray(sumv)
                } else {
                    console.log(" the input parameters need to be equal length columns in order to do sumproduct operations")
                    return NaN;
                }
            }
        }

        function calculateAggregatesByTags(values) {
            if (values.length === 0) return [];
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
            return aggregates;
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
                if (functionName === 'geomean') {
                    result = [geometric_mean(args[0])];
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
                            values.push(well.getValue());
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
                                values.push(well.getValue());
                            }
                        }
                    }
                }
            }
            return values;
        }
        function isvalidSingleColRowFormat(input) {
            const regex = /^\w+\[\d+:\d+\]$/;
            return regex.test(input);
        }

        function getColumnValuesFromEncodedRange(encodedRange, tableName) {

            const decoded = decodeStructure(`[${encodedRange}]`);

            const rangeString = `${tableName}${decoded}`;

            const { startx, endx, starty, endy } = parseTableString(rangeString, pt);

            const table = pt.getTableByName(tableName);
            if (!table) throw new Error(`Table not found: ${tableName}`);

            const maxRow = table.getLastRow()

            const fullRange = `${tableName}[${startx}:${endx}][${starty}:${maxRow}]`;

            const wells = table.getWellsByString(`[${startx}:${endx}][${starty}:${maxRow}]`);
            return wells.map(well => well.value);
        }

        function parseSingleVariable(token, tables, results) {
            const singleGroupAccessPattern = /(\w+)\[(\w+)\]/;
            const arrayAccessPattern = /(\w+)\[(.+)\]/;
            const propertyConditionPattern = /(\w+)\[(\d+)\]\.(\w+)(?:\s*(==|!=|>|<|>=|<=)\s*(.+))?/;
            if (results[token]) {
                return results[token];
            }
            if (isvalidSingleColRowFormat(singleGroupAccessPattern)) {
                const match__ = input.match(/^(\w+)\[(\d+):(\d+)\]$/);
                if (!match__) {
                } else {
                    const tableName = match__[1];
                    const col = match__[2];
                    const row = match__[3];
                    singleGroupAccessPattern = `${tableName}[${col}:${col}][${row}:${row}]`;
                }
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

                if (/^\d+___\d+:\d+___\d*$/.test(conditionPart)) {
                    return getColumnValuesFromEncodedRange(conditionPart, table)
                }

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
                                    if (wellValue == value) result.push(well.getValue());
                                    break;
                                case '!=':
                                    if (wellValue != value) result.push(well.getValue());
                                    break;
                                case '>':
                                    if (wellValue > value) result.push(well.getValue());
                                    break;
                                case '<':
                                    if (wellValue < value) result.push(well.getValue());
                                    break;
                                case '>=':
                                    if (wellValue >= value) result.push(well.getValue());
                                    break;
                                case '<=':
                                    if (wellValue <= value) result.push(well.getValue());
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

        function parseTableString(input, pt) {

            const regexFull = /^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d*):?(\d*)\](?:\[(\d*):?(\d*)\])?$/;
            const match = input.match(regexFull);
            if (!match) return null;

            const [
                _,
                tableName,
                colStartRaw,
                colEndRaw,
                rowStartRaw,
                rowEndRaw
            ] = match;

            let startx = colStartRaw === '' ? null : parseInt(colStartRaw);
            let endx = colEndRaw === '' ? null : parseInt(colEndRaw);
            let starty = rowStartRaw === undefined || rowStartRaw === '' ? null : parseInt(rowStartRaw);
            let endy = rowEndRaw === undefined || rowEndRaw === '' ? null : parseInt(rowEndRaw);

            const tabel = pt.getTableByName(tableName);
            if (!tabel) return null;

            if (startx === null) startx = tabel.getFirstColumn();
            if (endx === null) endx = tabel.getLastColumn();
            if (starty === null) starty = tabel.getFirstRow();
            if (endy === null) endy = tabel.getLastRow();

            return {
                tableName,
                startx,
                endx,
                starty,
                endy
            };
        }

        function parseTableString_deprecated(input) {
            console.log('debubg');
            const regex = /^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d*):(\d*)\]\[(\d*):(\d*)\]$/;
            const match = input.match(regex);
            if (!match) {
                return null;
            }
            const [_, tableName, startx, endx, starty, endy] = match;
            return {
                tableName,
                startx: startx || null,
                endx: endx || null,
                starty: starty || null,
                endy: endy || null,
            };
        }
        function parseRange(token, tables, results) {
            const singleBracketMatch = token.match(/^(\w+)\[(\d+):(\d+)\]$/);
            if (singleBracketMatch) {
                const [, tableName, start, stop] = singleBracketMatch;
                token = `${tableName}[${start}:${start}][${stop}:${stop}]`;
            }
            let range_query = decodeStructure(token);
            let range = range_query.substring(range_query.indexOf('['));
            let { tableName, startx, endx, starty, endy } = parseTableString(range_query, pt);
            let pl = pt.getTableByName(tableName);
            let r = [];
            for (let i of pl.getWellsByString(range)) {
                r.push(i);
            }
            return r;
        }
        function fetchValuesBySingleGroup(tables, table, groupName) {
            let values = [];
            if (table === 'all') {
                let v = [];
                for (let tname of Object.keys(tables)) {
                    v = v.concat(fetchValuesBySingleGroup(tables, tname, groupName))
                }
                return v;
            } else {
                const tableData = tables[table];
                if (!tableData || !tableData.wells) {
                    console.error(`Table ${table} not found or has no wells`);
                    return [];
                }
                const isIntegerGroupName = !isNaN(groupName) && Number.isInteger(parseFloat(groupName));
                for (let col = 0; col < tableData.wells.length; col++) {
                    for (let row = 0; row < tableData.wells[col].length; row++) {
                        const well = tableData.wells[col][row];
                        let gvals = []
                        if (well.group) {
                            gvals = Object.keys(well.group)
                        }
                        if (isIntegerGroupName && col === parseInt(groupName)) {
                            if (well.value != null) {
                                values.push({ uid: well.uid, value: well.getValue(), group: gvals });
                            }
                        }
                        else if (well.group && well.group.hasOwnProperty(groupName)) {
                            if (well.value != null) {
                                values.push({ uid: well.uid, value: well.getValue(), group: gvals });
                            }
                        }
                    }
                }
                return values;
            }
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

                    const matchesGroup = (group) => {
                        if (typeof group === 'number') {
                            return group === col;
                        }

                        if (typeof group === 'string') {
                            if (group.startsWith('row')) {
                                return row === parseInt(group.replace('row', ''), 10);
                            }

                            if (group.startsWith('col')) {
                                return col === parseInt(group.replace('col', ''), 10);
                            }
                        }

                        return well.group && well.group.hasOwnProperty(group);
                    };

                    const belongsToGroups =
                        condition === "and"
                            ? groups.every(matchesGroup)
                            : groups.some(matchesGroup);

                    const belongsToNotGroups = notGroups.some(matchesGroup);

                    if (belongsToGroups && !belongsToNotGroups) {
                        if (well.value != null && well.group != null) {
                            values.push({
                                uid: well.uid,
                                value: well.getValue(),
                                group: Object.keys(well.group)
                            });
                        }
                    }
                }
            }

            return values;
        }

        function fetchValuesByGroup_deprecated_but_works_for_rows(tables, table, groups, condition, notGroups) {
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
                            typeof group === 'number'
                                ? group === col
                                : (typeof group === 'string' && group.startsWith('row')
                                    ? row === parseInt(group.replace('row', ''), 10)
                                    : well.group && well.group.hasOwnProperty(group))
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
                        if (well.value != null && well.group != null) {
                            values.push({ uid: well.uid, value: well.getValue(), group: Object.keys(well.group) });
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

        function normalizeCommutative(node) {
            if (typeof node !== 'object' || !node.functionName) return node;
            const normalizedArgs = node.args.map(normalizeCommutative);

            if (node.functionName === '*') {
                let flatArgs = [];
                for (const arg of normalizedArgs) {
                    if (arg.functionName === '*') {
                        flatArgs.push(...arg.args);
                    } else {
                        flatArgs.push(arg);
                    }
                }

                flatArgs.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
                return { functionName: '*', args: flatArgs };
            }

            if (node.functionName === '+') {
                let flatArgs = [];
                for (const arg of normalizedArgs) {
                    if (arg.functionName === '+') {
                        flatArgs.push(...arg.args);
                    } else {
                        flatArgs.push(arg);
                    }
                }
                flatArgs.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
                return { functionName: '+', args: flatArgs };
            }

            return { ...node, args: normalizedArgs };
        }

        function isWrappedInQuotes(str, { trim = true, quotePairs } = {}) {
            if (typeof str !== 'string') return false;
            if (trim) str = str.trim();
            if (str.length < 2) return false;

            const DEFAULT_PAIRS = [
                ['"', '"'], ["'", "'"], ['`', '`'],
                ['“', '”'], ['‘', '’'],
                ['«', '»'], ['„', '“']
            ];
            const PAIRS = Array.isArray(quotePairs) && quotePairs.length ? quotePairs : DEFAULT_PAIRS;

            const first = str[0];
            const last = str[str.length - 1];
            return PAIRS.some(([open, close]) => first === open && last === close);
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

            function stripOuterParens(expr) {
                expr = String(expr).trim();
                if (expr.length < 2 || expr[0] !== '(' || expr[expr.length - 1] !== ')') return expr;
                let depth = 0;
                for (let i = 0; i < expr.length; i++) {
                    const c = expr[i];
                    if (c === '(') depth++;
                    else if (c === ')') depth--;
                    if (depth === 0 && i < expr.length - 1) return expr;
                }
                return stripOuterParens(expr.slice(1, -1));
            }

            function splitTopLevelByLastOperator(expr, ops) {
                let depth = 0;
                for (let i = expr.length - 1; i >= 0; i--) {
                    const c = expr[i];
                    if (c === ')') depth++;
                    else if (c === '(') depth--;
                    if (depth !== 0) continue;

                    if (i - 1 >= 0) {
                        const two = expr.slice(i - 1, i + 1);
                        if (ops.includes(two)) return [expr.slice(0, i - 1).trim(), two, expr.slice(i + 1).trim()];
                    }
                    if (ops.includes(c)) return [expr.slice(0, i).trim(), c, expr.slice(i + 1).trim()];
                }
                return null;
            }

            function unwrapVariable(expr) {
                const match = expr.match(/^\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
                if (match) {
                    return match[1];
                }
                return expr;
            }

            function isWrappedVariable(expr) {

                return /^\([A-Za-z_][A-Za-z0-9_]*\)$/.test(expr);
            }

            function splitTopLevelByFirstOperator(expr, ops) {
                let depth = 0;
                for (let i = 0; i < expr.length; i++) {
                    const c = expr[i];
                    if (c === '(') depth++;
                    else if (c === ')') depth--;
                    if (depth !== 0) continue;

                    if (i + 1 < expr.length) {
                        const two = expr.slice(i, i + 2);
                        if (ops.includes(two)) {
                            return [expr.slice(0, i).trim(), two, expr.slice(i + 2).trim()];
                        }
                    }

                    if (ops.includes(c)) {
                        return [expr.slice(0, i).trim(), c, expr.slice(i + 1).trim()];
                    }
                }
                return null;
            }

            function parseExpression(expression) {

                if (typeof expression !== 'string') return expression;

                if (typeof expression === 'number' ||
                    (typeof expression === 'string' && !isNaN(expression.trim()) && expression.trim() !== '')) {
                    return { functionName: 'const', args: [parseFloat(expression)] };
                }




                expression = expression.trim();
                if (expression.length === 0) return '';

                expression = stripOuterParens(expression);

                function unwrapVariable(expr) {
                    const m = expr.match(/^\(([A-Za-z_][A-Za-z0-9_]*)\)$/);
                    return m ? m[1] : expr;
                }
                function isWrappedVariable(expr) {
                    return /^\([A-Za-z_][A-Za-z0-9_]*\)$/.test(expr);
                }
                if (isWrappedVariable(expression)) expression = unwrapVariable(expression);
                const objectMethodPattern =
                    /^([a-zA-Z_][\w]*)\:([a-zA-Z_][\w]*)\((.*)\)$/;
                const functionPattern = /([a-zA-Z_][\w]*)\((.*)\)/;
                const functionWithIndexPattern = /([a-zA-Z_][\w]*)__index__(\d+)/;

                const rangeBracketExact = /^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                const nestedBracketExact = /^(\w+)\[(\d+)\]\[(\d+)\]$/;
                const bracketExact = /^(\w+)\[([^\]]*?)\]$/;
                const bracketPatternListG = /(\w+)\[([^\]]*?)\]/g;

                if (typeof expression === 'number' ||
                    (typeof expression === 'string' && !isNaN(expression.trim()) && expression.trim() !== '')) {
                    return { functionName: 'const', args: [parseFloat(expression)] };
                }
                if (expression === null || expression.trim().length <= 0) return '';

                expression = removeUnmatchedParentheses(expression);

                const numberPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
                if (numberPattern.test(expression)) {
                    return { functionName: 'const', args: [evaluateFloat(expression)] };
                }

                let match;

                if ((match = functionWithIndexPattern.exec(expression))) {
                    const functionName = match[1];
                    const indexParam = `index_${match[2]}`;
                    return { functionName, args: [indexParam] };
                }

                if ((match = objectMethodPattern.exec(expression))) {

                    const objectName = match[1];
                    const methodName = match[2];
                    const argsString = match[3];

                    const args = splitArguments(argsString).map(parseExpression);

                    return {
                        functionName: 'object_method',
                        args: [objectName, methodName, ...args]
                    };
                }



                if ((match = functionPattern.exec(expression))) {
                    const functionName = match[1];
                    const argsString = match[2];
                    const args = splitArguments(argsString).map(parseExpression);
                    return { functionName, args };
                }

                if ((match = rangeBracketExact.exec(expression))) {
                    const tableName = match[1];
                    const colStart = match[2];
                    const colEnd = match[3];
                    const rowStart = match[4];
                    const rowEnd = match[5];
                    return { functionName: 'access', args: [tableName, { colStart, colEnd }, { rowStart, rowEnd }] };
                }

                if ((match = nestedBracketExact.exec(expression))) {
                    const tableName = match[1];
                    const columnNumber = match[2];
                    const rowNumber = match[3];
                    return { functionName: 'access', args: [tableName, columnNumber, rowNumber] };
                }

                if ((match = bracketExact.exec(expression))) {
                    const objectName = match[1];
                    const key = match[2];
                    return { functionName: 'access', args: [objectName, key] };
                }

                const hasComma = expression.indexOf(',') >= 0;
                if (hasComma) {
                    let m, ls = [];
                    while ((m = bracketPatternListG.exec(expression)) !== null) {
                        ls.push([m[1], m[2]]);
                    }
                    if (ls.length > 0) return { functionName: 'vaccess', args: ls };
                }

                return parseWithOperators(expression.trim());
            }

            function handleNegativeValues(expression) {

                if (hasQuotes(expression)) {
                    console.log('debubg');
                    return expression;
                }

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
                if (typeof expression !== 'string') return expression;

                if (typeof expression === 'number' ||
                    (typeof expression === 'string' && !isNaN(expression.trim()) && expression.trim() !== '')) {
                    return { functionName: 'const', args: [parseFloat(expression)] };
                }

                if (isWrappedInQuotes(expression)) {
                    return { functionName: 'varstring', args: [expression] };
                }

                expression = handleNegativeValues(expression);
                if (typeof expression !== 'string') return expression;

                expression = stripOuterParens(expression);

                const indexPattern = /__index__\d+/g;
                const matches = expression.match(indexPattern);
                const trimmed = expression.trim();

                if (expression.indexOf("__index__12__index__11") >= 0) {
                }

                if (matches) {

                    if (matches.length === 1 && trimmed === matches[0]) {
                        return { functionName: 'index_method', args: [expression] };
                    }
                    if (matches.length > 1) {
                        const repeatedIndexPattern = /(?:__index__\d+){2,}$/;
                        const matches2 = expression.match(repeatedIndexPattern);
                        if (matches2 && matches2.length === 1 && trimmed === matches2[0]) {
                            return { functionName: 'index_method', args: [expression] };
                        }
                    }

                    if (matches.length === 1 && trimmed === '-' + matches[0]) {
                        return { functionName: '-index_method', args: [expression] };
                    }

                    const concatenatedIndexPattern = /^(?:__index__\d+)+$/;
                    if (concatenatedIndexPattern.test(trimmed)) {

                        return { functionName: 'varstring', args: [expression] };
                    }

                }

                const cmpOps = ['<=', '>=', '==', '!=', '<', '>'];
                let split = splitTopLevelByFirstOperator(expression, cmpOps);
                if (split) {
                    const [lhs, op, rhs] = split;
                    return { functionName: op, args: [parseExpression(lhs), parseExpression(rhs)] };
                }

                split = splitTopLevelByFirstOperator(expression, ['+', '-']);
                if (split) {
                    const [lhs, op, rhs] = split;
                    return { functionName: op, args: [parseExpression(lhs), parseExpression(rhs)] };
                }

                split = splitTopLevelByFirstOperator(expression, ['*', '/']);
                if (split) {
                    const [lhs, op, rhs] = split;
                    return { functionName: op, args: [parseExpression(lhs), parseExpression(rhs)] };
                }

                split = splitTopLevelByLastOperator(expression, ['^']);
                if (split) {
                    const [lhs, , rhs] = split;
                    return { functionName: '^', args: [parseExpression(lhs), parseExpression(rhs)] };
                }

                function isAlphanumericUnderscore(str) {
                    return /^[A-Za-z0-9_]+$/.test(str);
                }

                if (isAlphanumericUnderscore(expression)) {
                    let rs = {};
                    for (let nt of pt.getTableNames()) {
                        let ra = parseSingleVariable(`${nt}[${expression}]`, pt.getTablesByName(), rs);
                        if (ra && ra.length > 0) {
                            expression = nt + '[' + expression + ']';
                            break;
                        }
                    }
                }

                return parseExpression(expression);
            }

            function mergeNegativeOperators(arr) {
                if (!Array.isArray(arr)) {
                    throw new TypeError("Input must be an array");
                }
                const operators = ["+", "-", "*", "/", "^"];
                let result = [];
                for (let i = 0; i < arr.length; i++) {
                    if (operators.includes(arr[i]) && arr[i + 1] === "-") {
                        result.push(arr[i]);
                        result.push(arr[i + 1] + arr[i + 2]);
                        i += 2;
                    } else {
                        result.push(arr[i]);
                    }
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
                if (functionName === 'sum') {
                }
                const uniqueResult = generateUniqueIdentifier(functionName, args);
                callStack.push({ functionName, args, result: uniqueResult });
                return uniqueResult;
            }

            function executeParsedCall(parsedCall) {
                if (typeof parsedCall === 'string' || typeof parsedCall === 'number') {
                    return parsedCall;
                }
                if (!parsedCall.args) {
                    return parsedCall;
                }
                const resolvedArgs = parsedCall.args.map(executeParsedCall);
                return executeFunctionByName(parsedCall.functionName, resolvedArgs);
            }

            if (functionCallString != null && functionCallString.length > 0) {

                if (functionCallString.toLowerCase().startsWith("if")) {
                    console.log('debubg');
                }

                const parsedCallStack = parseWithOperators(functionCallString);
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
                const result = [];
                for (let i = 0; i < leftArray.length; i++) {
                    const leftItem = leftArray[i];
                    const rightItem = rightArray[i];
                    const leftValue = (typeof leftItem === 'object' && leftItem !== null && 'value' in leftItem)
                        ? leftItem.value
                        : leftItem;

                    const rightValue = (typeof rightItem === 'object' && rightItem !== null && 'value' in rightItem)
                        ? rightItem.value
                        : rightItem;

                    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
                        let resultValue;
                        switch (operator) {
                            case '+': resultValue = leftValue + rightValue; break;
                            case '-': resultValue = leftValue - rightValue; break;
                            case '*': resultValue = leftValue * rightValue; break;
                            case '/': resultValue = rightValue !== 0 ? leftValue / rightValue : null; break;
                            case '^': resultValue = Math.pow(leftValue, rightValue); break;
                            default: throw new Error(`Unknown operator: ${operator}`);
                        }

                        if (typeof leftItem === 'object' && leftItem !== null && 'value' in leftItem) {
                            result.push({ ...leftItem, value: resultValue });
                        } else if (typeof rightItem === 'object' && rightItem !== null && 'value' in rightItem) {
                            result.push({ ...rightItem, value: resultValue });
                        } else {
                            result.push(resultValue);
                        }

                    } else {

                        result.push(null);
                    }
                }
                return result;
            }

            function matchArrayLengths(leftArray, rightArray) {
                const toArray = (x) => Array.isArray(x) ? x.slice() : [x];

                const normalize = (arr) => arr.map(item => {
                    if (typeof item === 'object' && item !== null && 'value' in item) {
                        const v = Number(item.value);
                        return { ...item, value: Number.isNaN(v) ? item.value : v };
                    } else {
                        const v = Number(item);
                        return Number.isNaN(v) ? item : v;
                    }
                });

                let lArr = normalize(toArray(leftArray));
                let rArr = normalize(toArray(rightArray));

                const cloneItem = (x) => (typeof x === 'object' && x !== null) ? { ...x } : x;

                const extendArray = (array, targetLength) => {
                    if (array.length === 0) return new Array(targetLength).fill(null);
                    const extended = array.slice();
                    const last = array[array.length - 1];
                    while (extended.length < targetLength) {
                        extended.push(cloneItem(last));
                    }
                    return extended;
                };

                if (lArr.length < rArr.length) {
                    lArr = extendArray(lArr, rArr.length);
                } else if (rArr.length < lArr.length) {
                    rArr = extendArray(rArr, lArr.length);
                }

                return [lArr, rArr];
            }

            for (const entry of callStack) {
                let { functionName, args, result } = entry;
                let computedResult;

                functionName = functionName.toLowerCase();

                if (functionName === 'negative') {
                    isNegativeNext = true;
                    continue;
                } else if (functionName === 'object_method') {

                    const [objectName, methodName, ...methodArgs] = args;

                    // resolve arguments
                    const resolvedArgs = methodArgs.map(arg => {
                        return results[arg] ? results[arg] : arg;
                    });


                    // resolve object instance
                    const instance =
                        pt?.getObjectByName(objectName);

                    if (!instance) {
                        throw new Error(`Object instance not found: ${objectName}`);
                    }

                    if (typeof instance[methodName] !== 'function') {
                        throw new Error(
                            `Method '${methodName}' not found on '${objectName}'`
                        );
                    }

                    const value = await instance[methodName](...resolvedArgs);

                    computedResult = Array.isArray(value)
                        ? value
                        : [value];
                }
                else if (functionName === 'negate') {
                    let res = results[args[0]];

                    function getNumeric(val) {
                        if (val == null) return NaN;
                        if (typeof val === 'object' && 'value' in val) return getNumeric(val.value);
                        if (Array.isArray(val)) return getNumeric(val[0]);
                        const n = Number(val);
                        return Number.isFinite(n) ? n : NaN;
                    }

                    if (Array.isArray(res)) {
                        computedResult = res.map(v => {
                            const n = getNumeric(v);
                            return Number.isFinite(n) ? -n : v;
                        });
                    } else {
                        const n = getNumeric(res);
                        computedResult = [Number.isFinite(n) ? -n : res];
                    }
                }
                if (['+', '-', '*', '/', '^'].includes(functionName)) {
                    const [left, right] = args.map(arg =>
                        results[arg] ? results[arg] : arg
                    );
                    computedResult = performElementWiseOperation(functionName, left, right);
                }
                if (functionName === '<') {
                    const [left, right] = args.map(arg =>
                        results[arg] ? results[arg] : arg
                    );
                    return compareObjectsOrValues(left, right, '<', res, results)
                }
                else if (functionName === 'access') {
                    const [objectName, key] = args;
                    if (key.indexOf(':') > 0) {
                        let r = await parseRange(`${objectName}[${key}]`, pt.getTablesByName(), results);
                        computedResult = r;
                    } else {
                        if (key === '0') {
                            computedResult = [0];
                        } else {
                            let r = await parseSingleVariable(`${objectName}[${key}]`, pt.getTablesByName(), results);
                            if (!r || r.length === 0) {
                                throw new Error('Missing reference : ' + `${objectName}[${key}]`)
                            }
                            computedResult = r;
                        }
                    }
                }
                else if (functionName === 'vaccess') {
                    let r = []
                    for (let a of args) {
                        const [objectName, key] = a;
                        let ra = await parseSingleVariable(`${objectName}[${key}]`, pt.getTablesByName(), results);
                        r.push(ra)
                    }
                    computedResult = r;
                }
                else if (functionName === 'average') {
                    let array2D = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );


                    let flattened = array2D.flat();
                    if (flattened.length === 1) {
                        const first = flattened[0];
                        if (typeof first === "string") {
                            flattened = res[0];
                        } else if (typeof first === "object" && "value" in first) {

                            flattened = [first.value];
                        }
                    } else if (Array.isArray(flattened) && typeof flattened[0] === "object") {
                        flattened = flattened.map(obj => obj && "value" in obj ? obj.value : obj);
                    }
                    computedResult = [mean(flattened)];
                }
                else if (functionName === 'geomean') {
                    let array2D = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );
                    let flattened = array2D.flat();
                    if (flattened.length === 1) {
                        const first = flattened[0];
                        if (typeof first === "string") {
                            flattened = res[0];

                        } else if (typeof first === "object" && "value" in first) {

                            flattened = [first.value];
                        }
                    }
                    computedResult = [geometric_mean(flattened)];
                }
                else if (functionName === 'sumproduct') {
                    computedResult = [sumproduct(args, results, res)];
                }
                else if (functionName === 'ABS' || functionName === 'abs') {
                    if (args && args.length === 1) {
                        computedResult = [abs(results[args[0]])];
                    } else {

                        computedResult = [abs(res)];
                    }
                }
                else if (functionName === 'ceil') {
                    const flatArray = res.flat();
                    computedResult = [ceil(flatArray)];
                }
                else if (functionName === 'sumup') {
                    computedResult = [sumup(res)];
                }
                else if (functionName === 'min') {
                    const flatArray = res.flat();

                    computedResult = [min(flatArray)];
                }
                else if (functionName === 'pow') {
                    const flatArray = res.flat();
                    computedResult = [pow(flatArray)];
                }
                else if (functionName === 'max') {
                    const flatArray = res.flat();

                    computedResult = [min(flatArray)];
                }
                else if (functionName === 'normcdf') {
                    const flatArray = res.flat();
                    if (flatArray.length === 3)
                        computedResult = [normcdf(...flatArray)]
                    else {
                        throw new Exception('Expected 3 arguments for normcdf')
                    }
                } else if (functionName === 'sqrt') {
                    const flatArray = res.flat();

                    function parseIndexValue(indexString) {
                        if (typeof indexString === 'string' && indexString.startsWith('index_')) {
                            const numberPart = indexString.slice(6);
                            const parsedNumber = parseInt(numberPart, 10);
                            return isNaN(parsedNumber) ? null : parsedNumber;
                        }
                        return null;
                    }
                    let values = flatArray[parseIndexValue(args[0])]
                    computedResult = [sqrt(values)]
                }
                else if (functionName === 'sum') {

                    const extractNumbers = (input) => {
                        const toArray = (x) => Array.isArray(x) ? x : (x == null ? [] : [x]);
                        const flat = toArray(input).flat(Infinity);

                        return flat.map(item => {
                            const value = (typeof item === 'object' && item !== null && 'value' in item)
                                ? Number(item.value)
                                : Number(item);

                            if (Number.isNaN(value)) {
                                throw new Error(`Invalid input for sum: '${JSON.stringify(item)}' has no valid numeric value.`);
                            }
                            return value;
                        });
                    };

                    let r = args[0]
                    if (r) {
                        const numbers = extractNumbers(results[r]);
                        const calculateSum = numbers.reduce((acc, v) => acc + v, 0);
                        computedResult = [calculateSum];
                    } else {
                        const source = (res && res.length > 0) ? res : results;
                        const numbers = extractNumbers(source);
                        const calculateSum = numbers.reduce((acc, v) => acc + v, 0);
                        computedResult = [calculateSum];
                    }
                }
                else if (functionName === 'if') {

                    if (args.length === 1) {
                        if (args[0].length > 1) {
                            args = res[0]
                        }
                    }

                    if (args && args.value) {
                        computedResult = res[1];
                    } else {
                        const resolveValue = (arg) => {
                            return results[arg]
                        };
                        const evalCondition = (condArg) => {
                            if (typeof condArg !== 'string') {
                                return !!resolveValue(condArg);
                            }

                            if (Object.prototype.hasOwnProperty.call(res, condArg) &&
                                res[condArg] !== undefined) {
                                return !!resolveValue(condArg);
                            }

                            const parts = condArg.split('_');
                            if (!parts.length) return false;

                            const op = parts[0];
                            const rest = parts.slice(1);

                            let leftKey = null;
                            let rightKey = null;

                            for (let i = 1; i < rest.length; i++) {
                                const candidateLeft = rest.slice(0, i).join('_');
                                if (!Object.prototype.hasOwnProperty.call(res, candidateLeft)) continue;

                                for (let j = i + 1; j <= rest.length; j++) {
                                    const candidateRight = rest.slice(i, j).join('_');
                                    if (!Object.prototype.hasOwnProperty.call(res, candidateRight)) continue;

                                    leftKey = candidateLeft;
                                    rightKey = candidateRight;
                                    break;
                                }

                                if (leftKey && rightKey) break;
                            }

                            if (!leftKey || !rightKey) {
                                return !!resolveValue(condArg);
                            }

                            const leftVal = resolveValue(leftKey);
                            const rightVal = resolveValue(rightKey);

                            switch (op) {
                                case '>': return leftVal > rightVal;
                                case '<': return leftVal < rightVal;
                                case '>=': return leftVal >= rightVal;
                                case '<=': return leftVal <= rightVal;
                                case '=':
                                case '==': return leftVal == rightVal;
                                case '<>':
                                case '!=': return leftVal != rightVal;
                                default: return !!leftVal;
                            }
                        };

                        const [condArg, trueArg, falseArg] = args;

                        const cond = evalCondition(condArg);
                        const chosen = cond ? trueArg : falseArg;

                        computedResult = resolveValue(chosen);

                    }
                }
                else if (functionName === 'datevalue') {
                    console.log('dateva debug');

                    if (args.length === 1) {
                        if (args[0].length > 1) {
                            args = res[0];
                        }
                    }

                    if (args && args.length > 0) {
                        let raw = args[0];
                        if (typeof raw === "string") {

                            raw = raw.replace(/^"+|"+$/g, "");
                        }

                        const date = new Date(raw);
                        console.log('debubg');

                        if (isNaN(date)) {
                            computedResult = [null];
                        } else {

                            computedResult = [date];

                        }
                    }
                }

                else if (functionName === 'edate') {

                    if (!res || res.length < 2) {
                        computedResult = [null];
                    } else {

                        const wells = res[0];

                        const monthsToAdd = parseInt(res[1], 10);
                        const ar = args;
                        if (Array.isArray(wells)) {
                            computedResult = wells.map(well => {
                                const dRaw = well.value;
                                let d;
                                if (dRaw instanceof Date && !isNaN(dRaw)) {
                                    d = dRaw;
                                }

                                else if (typeof dRaw === "string") {
                                    const parsed = new Date(dRaw);
                                    if (!isNaN(parsed)) {
                                        d = parsed;
                                    } else {
                                        return null;
                                    }
                                }

                                else {
                                    return null;
                                }

                                const year = d.getFullYear();
                                const month = d.getMonth();
                                const day = d.getDate();

                                const target = new Date(year, month + monthsToAdd, 1);

                                const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
                                target.setDate(Math.min(day, lastDay));

                                return target;

                            });
                        } else {
                            computedResult = [null];
                        }
                    }
                }
                else if (functionName === 'day') {
                    console.log('debubg');
                    if (args.length === 1) {
                        if (args[0].length > 1) {
                            args = res[0]
                        }
                    }
                    if (args && args.length > 0) {
                        computedResult = [args[0]];
                    }
                } else if (functionName === 'EOMONTH') {
                    console.log('debubg');

                    if (args.length === 1) {
                        if (args[0].length > 1) {
                            args = res[0];
                        }
                    }

                    if (args && args.length > 0) {

                        let raw = args[0];
                        if (typeof raw === "string") {

                            raw = raw.replace(/^"+|"+$/g, "");
                        }

                        const date = new Date(raw);
                        if (isNaN(date)) {
                            computedResult = [null];
                        } else {

                            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
                            computedResult = [lastDay];
                        }
                    }
                }

                else if (functionName === 'aggregate') {
                    const array2D = args.map(arg =>
                        typeof arg === 'string' && results[arg] ? results[arg] : arg
                    );
                    const flattened = array2D.flat();
                    computedResult = [calculateAggregatesByTags(flattened)];
                }
                else if (functionName === 'log') {
                    function parseIndexValue(indexString) {
                        if (typeof indexString === 'string' && indexString.startsWith('index_')) {
                            const numberPart = indexString.slice(6);
                            const parsedNumber = parseInt(numberPart, 10);
                            return isNaN(parsedNumber) ? null : parsedNumber;
                        }
                        return null;
                    }
                    if (Array.isArray(res)) {
                        let values = res[parseIndexValue(args[0])]
                        const newArray = [];
                        for (let i = 0; i < values.length; i++) {
                            let value = values[i];
                            if (typeof value === 'object' && value.value !== undefined) {
                                newArray.push({ ...value, value: Math.log(value.value) });
                            } else {
                                newArray.push(Math.log(value));
                            }
                        }
                        computedResult = newArray;
                    } else {
                        computedResult = FF[functionName](results[args[0]], pt)
                    }
                }
                else if (functionName === 'log10') {
                    function parseIndexValue(indexString) {
                        if (typeof indexString === 'string' && indexString.startsWith('index_')) {
                            const numberPart = indexString.slice(6);
                            const parsedNumber = parseInt(numberPart, 10);
                            return isNaN(parsedNumber) ? null : parsedNumber;
                        }
                        return null;
                    }
                    if (Array.isArray(res)) {
                        let values = res[parseIndexValue(args[0])]
                        const newArray = [];
                        for (let i = 0; i < values.length; i++) {
                            let value = values[i];
                            if (typeof value === 'object' && value.value !== undefined) {
                                newArray.push({ ...value, value: Math.log10(value.value) });
                            } else {
                                newArray.push(Math.log10(value));
                            }
                        }
                        computedResult = newArray;
                    } else {
                        computedResult = FF[functionName](results[args[0]], pt)
                    }
                }
                else if (functionName === 'var') {
                    computedResult = results[args[0]];
                }
                else if (functionName === 'varstring') {

                    computedResult = [args[0]];
                }
                else if (functionName === 'const') {
                    computedResult = args[0];
                } else if (functionName === 'index_method') {
                    computedResult = res[extractIndexValue(args[0])]
                }
                else if (functionName === '-index_method') {
                    function computeResultWithNegation(args, res) {

                        let v = args[0].startsWith('-') ? args[0].slice(1) : args[0];
                        let computedResult = res[extractIndexValue(v)];
                        if (Array.isArray(computedResult)) {
                            const newArray = [];
                            for (let i = 0; i < computedResult.length; i++) {
                                let value = computedResult[i];
                                if (typeof value === 'object' && value.value !== undefined) {
                                    newArray.push({ ...value, value: value.value * -1 });
                                } else {
                                    newArray.push(value * -1);
                                }
                            }
                            computedResult = newArray;
                        } else if (typeof computedResult === 'object' && computedResult.value !== undefined) {
                            computedResult = { ...computedResult, value: computedResult.value * -1 };
                        } else {
                            computedResult *= -1;
                        }
                        return computedResult;
                    }
                    computedResult = computeResultWithNegation(args, res);
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
            expr = expr.replace(/\s*([+\-*/()|&^])\s*/g, '$1');
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



            function extractObjectMethods(expr) {
                const methodRe = /(\b[a-zA-Z_]\w*)\s*:\s*([a-zA-Z_]\w*)\s*\(([^()]*)\)/;

                while (true) {
                    const m = expr.match(methodRe);
                    if (!m) break;

                    const full = m[0].trim();
                    operations.push(full);

                    const ph = `__index__${operations.length - 1}`;
                    expr = _spliceOnce(expr, m.index, m.index + m[0].length, ph);
                }

                return expr;
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

            const TERM = '(?:__index__\\d+|[+-]?\\d+(?:\\.\\d+)?|\\w+(?:\\[[^\\]]+\\])*)';

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
            result = extractObjectMethods(result);
            result = extractFunctions(result);
            result = extractParentheses(result);
            result = parsePow(result);
            result = parseMulDiv(result);
            result = parseAddSub(result);
            operations.push(result.trim());

            return operations;
        }

        function replaceIgnoringWhitespace(input, target, replacement) {
            const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedTarget, 'g');
            return input.replace(regex, replacement);
        }
        function removeRedundantParentheses(expression) {
            expression = expression.trim();
            function hasRedundantParentheses(expr) {
                if (expr.startsWith('(') && expr.endsWith(')')) {
                    let openParens = 0;
                    for (let i = 0; i < expr.length - 1; i++) {
                        if (expr[i] === '(') openParens++;
                        if (expr[i] === ')') openParens--;
                        if (openParens === 0) return false;
                    }
                    return true;
                }
                return false;
            }
            function simplify(expr) {
                if (!expr.includes('(')) return expr;
                if (hasRedundantParentheses(expr)) {
                    expr = expr.slice(1, -1).trim();
                }
                let result = '';
                let openParens = 0;
                let innerExpr = '';
                for (let i = 0; i < expr.length; i++) {
                    const char = expr[i];
                    if (char === '(') {
                        if (openParens > 0) innerExpr += char;
                        openParens++;
                    } else if (char === ')') {
                        openParens--;
                        if (openParens > 0) {
                            innerExpr += char;
                        } else {
                            result += simplify(innerExpr);
                            innerExpr = '';
                        }
                    } else if (openParens > 0) {
                        innerExpr += char;
                    } else {
                        result += char;
                    }
                }
                return result;
            }
            return simplify(expression);
        }
        function containsAnding(input) {
            const regex = /\[\s*[^,\]]+\s*(,\s*[^,\]]+\s*)+\]/g;
            const matches = input.match(regex);
            return matches !== null;
        }
        function preprocessExpression(expression) {
            const mulDivRegex = /(-?\w+(\[[^\]]+\])?|-?\d+(\.\d+)?)\s*([*/])\s*(-?\w+(\[[^\]]+\])?|-?\d+(\.\d+)?)/g;
            expression = expression.replace(mulDivRegex, (match) => {
                return match.startsWith('(') && match.endsWith(')') ? match : `(${match})`;
            });
            let parts = expression.split(/(?=[+-])/);
            parts = parts.map(part => {
                const trimmedPart = part.trim();
                return trimmedPart.startsWith('(') && trimmedPart.endsWith(')') ? trimmedPart : `(${trimmedPart})`;
            });
            return parts.join('');
        }
        function removeOuterParentheses(expression) {
            expression = expression.trim();
            if (expression.startsWith('(') && expression.endsWith(')')) {
                return expression.substring(1, expression.length - 1)
            }
            return expression;
        }
        function replaceCommaInBrackets(text) {
            return text.replace(/\[([^\]]*?)\]/g, (match, contents) => {
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

            expression = expression.trim();

            function replaceNumericStrings(str) {
                return str.replace(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?/g, match => {
                    let cleaned = match.replace(/[$,%]/g, "");
                    let value = parseFloat(cleaned);

                    if (match.includes("%")) {
                        value = value / 100;
                    }

                    return isNaN(value) ? match : value.toString();
                });
            }

            function rewriteUserVariables(expression) {
                if (typeof expression !== 'string') return expression;

                let out = '';
                let i = 0;
                let bracketDepth = 0;

                const isIdentStart = ch => /[A-Za-z_]/.test(ch);
                const isIdentChar = ch => /[A-Za-z0-9_]/.test(ch);

                while (i < expression.length) {
                    const ch = expression[i];

                    if (ch === '[') {
                        bracketDepth++;
                        out += ch;
                        i++;
                        continue;
                    }

                    if (ch === ']') {
                        bracketDepth = Math.max(0, bracketDepth - 1);
                        out += ch;
                        i++;
                        continue;
                    }

                    if (bracketDepth === 0 && isIdentStart(ch)) {
                        const start = i;
                        i++;

                        while (i < expression.length && isIdentChar(expression[i])) {
                            i++;
                        }

                        const name = expression.slice(start, i);

                        let j = i;
                        while (j < expression.length && /\s/.test(expression[j])) {
                            j++;
                        }

                        const next = expression[j];

                        // Do NOT rewrite:
                        // average(...)
                        // t2[...]
                        // rfu1:X(...)
                        // anything inside [...]
                        if (next === '(' || next === '[' || next === ':') {
                            out += name;
                        } else {
                            out += `${name}[0:0]`;
                        }

                        continue;
                    }

                    out += ch;
                    i++;
                }

                return out;
            }

            function rewriteUserVariables_deprecaterd(expression) {
                if (typeof expression !== 'string') return expression;

                let out = '';
                let i = 0;
                let bracketDepth = 0;

                const isIdentStart = ch => /[A-Za-z_]/.test(ch);
                const isIdentChar = ch => /[A-Za-z0-9_]/.test(ch);

                while (i < expression.length) {
                    const ch = expression[i];

                    if (ch === '[') {
                        bracketDepth++;
                        out += ch;
                        i++;
                        continue;
                    }

                    if (ch === ']') {
                        bracketDepth = Math.max(0, bracketDepth - 1);
                        out += ch;
                        i++;
                        continue;
                    }

                    if (bracketDepth === 0 && isIdentStart(ch)) {
                        const start = i;
                        i++;

                        while (i < expression.length && isIdentChar(expression[i])) {
                            i++;
                        }

                        const name = expression.slice(start, i);

                        let j = i;
                        while (j < expression.length && /\s/.test(expression[j])) {
                            j++;
                        }

                        const next = expression[j];

                        // Do NOT rewrite:
                        // average(...)
                        // t2[...]
                        // anything inside [...]
                        if (next === '(' || next === '[') {
                            out += name;
                        } else {
                            out += `${name}[0:0]`;
                        }

                        continue;
                    }

                    out += ch;
                    i++;
                }

                return out;
            }

            expression = replaceNumericStrings(expression)
            // console.log(' expression ' + expression)
            expression = rewriteUserVariables(expression)
            // console.log(' expression rewrite ' + expression)

            // if (expression.startsWith("IF")) {
            //     console.log('debubg');
            // }
            let exp = expression_by_order(expression)

            function containsRange(input) {
                const regex = /[a-zA-Z_][a-zA-Z0-9_]*\[(\d*:\d*|:)\]\[(\d*:\d*|:)\]/g;
                const matches = input.match(regex);
                return matches || null;
            }
            function encodeStructure(input) {
                return input.replace(/\[(.*?)\]\[(.*?)\]/g, (_, xRange, yRange) => {
                    const encodedX = xRange.replace(':', '___');
                    const encodedY = yRange.replace(':', '___');
                    return `[${encodedX}:${encodedY}]`;
                });
            }
            function decodeStructure(encoded) {
                return encoded.replace(/\[(.*?)___(.*?):(.*?)___(.*?)\]/, (_, startx, endx, starty, endy) => {
                    const decodedX = startx || ":";
                    const decodedY = starty || ":";
                    return `[${decodedX}:${endx}][${starty}:${endy}]`;
                }).replace(/\[(\w*?)___(\w*?):___\]/, (_, start, end) => `[${start}:${end}]`);
            }
            let currentResult = []
            let ct = []
            let ctt = []




             
            


            for (let e of exp) {

                if (e.indexOf('__index__12__index__11') >= 0) {
                }

                if (containsAnding(e))
                    e = replaceCommaInBrackets(e);
                if (containsRange(e)) {
                    e = encodeStructure(e);
                }
                let subExprs = [];
                if (e.indexOf(',') > 0) {
                    subExprs.push(...e.split(',').map(s => s.trim()).filter(Boolean));
                }

                if (subExprs && subExprs.length > 0 && subExprs[0].indexOf('(') < 0) {
                    for (let sub of subExprs) {
                        let temp = parseAndGenerateCallStack___000(sub);

                        temp = normalizeCommutative(temp)
                        let cstack = await executeCallStack(temp, ct);
                        ctt.push(cstack);

                    }
                    ct.push('unused')
                } else {
                    let temp = parseAndGenerateCallStack___000(e);
                    temp = updateAndReorderExponents(temp);

                    temp = normalizeCommutative(temp)

                    if (ctt && ctt.length > 0) {
                        let cstack = await executeCallStack(temp, ctt);
                        ct.push(cstack);
                        ctt = []
                        currentResult = cstack;

                    } else {
                        let cstack = await executeCallStack(temp, ct);
                        if (cstack === undefined) {
                            console.log(' ' + e)
                        }
                        ct.push(cstack);
                        currentResult = cstack;

                    }

                }
            }

            return resolve({
                group: tags,
                results: currentResult
            })
        } catch (exception) {




            pt.setMessage('' + exception.message, 1);//{
            //     type: 'error',
            //     timeout: 5000
            // })

            console.log(' failed ! ');
            console.error("Exception caught:");
            console.error(`Message: ${exception.message}`);
            console.error("Stack trace:");
            console.error(exception.stack);
            console.log(' Expression ' + expression)
            if (pt) {



                // pt.setMessage(expression + ' error')
            }
            const stackLines = (exception.stack || '').split('\n');
            if (stackLines.length > 1) {
                const locationLine = stackLines[1].trim();
                console.error("Error location:", locationLine);
            }
            resolve(' failed to calculate')
        }
    });
}

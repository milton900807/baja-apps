function excelFormulaToJS(formula) {

    const functionMap = {
        'SUM': 'sum',
        'IF': 'ternary',
        'AND': '&&',
        'OR': '||',
        'NOT': '!',
        'ABS': 'Math.abs',
        'MIN': 'Math.min',
        'MAX': 'Math.max',
        'ROUND': 'Math.round',
    };

    const operatorMap = {
        '=': '===',
        '<>': '!==',
    };

    Object.keys(functionMap).forEach(excelFunc => {
        const regex = new RegExp(`\\b${excelFunc}\\b`, 'g');
        formula = formula.replace(regex, functionMap[excelFunc]);
    });

    Object.keys(operatorMap).forEach(operator => {
        const regex = new RegExp(`\\${operator}`, 'g');
        formula = formula.replace(regex, operatorMap[operator]);
    });

    const cellReferenceRegex = /\b([A-Z]+[0-9]+)\b/g;
    formula = formula.replace(cellReferenceRegex, match => `cell_${match}`);

    const rangeRegex = /\b([A-Z]+[0-9]+):([A-Z]+[0-9]+)\b/g;
    formula = formula.replace(rangeRegex, (match, startCell, endCell) => {
        return `rangeToArray('cell_${startCell}', 'cell_${endCell}')`;
    });

    return formula;
}

function sum(...args) {
    return args.reduce((acc, val) => acc + val, 0);
}

function rangeToArray(start, end) {

    return [start, end];
}

const excelFormula = 'SUM(A1:A3) + IF(B1=1, 10, 0) + ABS(C1)';
const jsFormula = excelFormulaToJS(excelFormula);

console.log('Converted JS formula:', jsFormula);

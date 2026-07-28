return new Promise( async (resolve, reject) => {

    const createMatrix = ({ width, heigth, fill = 0 }) =>
        Array(heigth)
            .fill(fill)
            .map(() => Array(width).fill(fill));

    const extractRow = ({ matrix, row, col }) => matrix[row].slice(0, col + 1);

    const extractColumn = ({ matrix, row, col }) =>
        matrix
            .slice(0, row + 1)
            .map((_row) => _row.slice(col, col + 1))
            .reduce((prev, curr) => [...prev, ...curr], []);

    resolve({
        createMatrix,
        extractColumn,
        extractRow,
    })

})

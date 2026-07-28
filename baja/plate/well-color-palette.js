function () {

    return new Promise(async (resolve, reject) => {

        let WellColorPalette = {
            'Column_Header': 'rgba(255, 10, 10, 0.3)',
            'Row_Header': 'rgba(10, 10, 255, 0.3)',
            'Row_Address': 'rgba(10, 10, 255, 0.3)',
            "ColumnHeader":'rgba(121, 196, 121, 1)',

            'UTC': 'rgba(32, 178, 170, 1)',
            'STANDARD': 'rgba(173, 216, 230, 1)',
            'BUFFER': 'rgba(173, 196, 100, 0.6)',
            'negative-control': 'rgba(128, 0, 128, 0.3)',
            'positive-control': 'rgba(224, 255, 255, 1)',
            'blank': 'rgba(128, 128, 128, 1)',
            'Mean': 'rgba(128, 0, 0, 0.2)',
            'IDs': 'rgba(128, 200, 0, 0.2)',
            'Sample': 'rgba(128, 200, 0, 0.2)',
            'StdDev': 'rgba(10, 100, 228, 0.4)',
            'dCt': 'rgba(210, 200, 128, 0.4)',
            'ddCt': 'rgba(210, 100, 128, 0.4)',
            'Compound': 'rgba(110, 100, 128, 0.4)',
            'Ribogreen': 'rgba(60, 210, 68, 0.5)',
            'Function': 'cyan',
            'Header Row': 'rgba(160, 110, 250, 0.3)',
            'Other...': 'rgba(250, 100, 228, 0.4)'
        }

        resolve(WellColorPalette)

    })
}

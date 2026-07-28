function () {

    let UI = class UI {
        constructor() { }
        async show(v) {
            await showWidget({
                wid: 'json', v
            });

        }
        async html(html) {
            await showwidget({ 'wid': 'html', 'data': html });
        }

        async clear() {
            await clear();
        }
        async clearLast() {
            await clearComponent(1);
        }

        getSpreadSheetCellNumber(row, column) {
            let result = '';

            let n = column;
            while (n >= 0) {
                result = String.fromCharCode(n % 26 + 65) + result;
                n = Math.floor(n / 26) - 1;
            }

            result += `${row + 1}`;
            return result;
        };

        async createSheet(sheetName, data) {
            Excel.run(async (context) => {
                let a = []
                let titles = []
                let i = 0;
                for (let d of data) {
                    let b = []
                    let ke = Object.keys(d);
                    if (i === 0) {
                        for (let key of ke) {
                            titles.push(key)
                        }
                        a.push(titles)
                    }
                    for (let key of ke) {
                        b.push(d[key])
                    }
                    a.push(b);
                    i++;
                }

                let st = this.getSpreadSheetCellNumber(0, 0);
                let al = a[0].length;
                let bl = a.length;
                let se = this.getSpreadSheetCellNumber(bl - 1, al - 1)

                var sheets = context.workbook.worksheets;
                var sheet = sheets.add(sheetName);
                await sheet.load("address");
                await context.sync()
                var cell = sheet.getRange(st + ':' + se);
                cell.load('address')
                cell.values = a
                return context.sync()
                    .then(function () {
                        console.log(`The value of the cell in row 2, column 5 is "${cell.values[0][0]}" and the address of that cell is "${cell.address}"`);
                    })
            });
        }

        async showTable(fields, values) {

            await showWidget({
                wid: 'grid', data:
                {
                    fields, values, download: false, height: 450, 'buttons': [

                        {
                            'name': 'Copy into excel as sheet',
                            'ionFunction': LE.createIonFunction(() => {
                                this.createSheet("Copy_", values);
                            })
                        }

                    ]
                }
            });
        }

    }
    return new UI();
}

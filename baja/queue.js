function () {

    exec('baja/lib/db.js').then(async (db) => {
        let working = await showWidget({
            wid: 'working'
        })
        let path = 'screening-queue.xlsx'
        let sheet = 'Master-list'
        let range = 'A2:G100'
        let status = await db.loadSheet(path, sheet, range)
        let va = status['values']

        await showWidget({
            wid: 'html',
            data: `
                        <h4> <img src="assets/img/icons/png/caret-right-4x.png"> My Screens </h4>
            `
        })

        working.status = 'Complete'

        let getStatusIcon = (i) => {
            if (i.toUpperCase() === 'COMPLETE') {
                return `<img src="/assets/img/icons/png/check-3x.png"> `
            } else if (i.toUpperCase() === 'PENDING') {
                return `<img src="/assets/img/icons/png/loop-circular-3x.png"> `
            } else {
                return `<img src="/assets/img/icons/png/warning-3x.png">`
            }
        }
        let _rows = [];
        for (let row of va) {
            let msg = '';
            if (row[2]) {
                msg = row[2]
            }
            if (row[0] != null && row[0].length > 0) {
                _rows.push({
                    button: {
                        label: "Open", ionFunction: createIonFunction((b) => {

                            clear();
                            exec('baja/target/status.js')

                        })
                    },
                    "Investigator": row[0],
                    "Type": row[1],
                    "Title": row[2],
                    "Mechanism": row[3],
                    "Status": row[4],
                    "Plates/Compounds": row[5] + '/' + row[6]
                })
            }
        }

        let statuus_table = {
            wid: 'table', data: {
                width: '50%',
                showHeader: true,
                padding_top: '10px',
                rows: _rows
            }
        }
        showWidget(statuus_table);

    });

}

function () {
    exec('ljl/lib/db.js').then(async (db) => {
        let working = await showWidget({
            wid: 'working'
        })
        let path = 'kras/submitted-screens/kras-primary-hg36/status.xlsx'
        let sheet = 'Target'
        let range = 'A1:C3'
        let status = await db.loadSheet(path, sheet, range)
        let va = status['values']
        let title = va[0][1] + ' (' + va[1][2] + ')'
        let desc = va[1][1]
        showWidget({
            wid: 'html',
            data: `<div class="alert alert-secondary" role="alert">
                        <h5> ${title}</h5>
                                            ${desc}

                </div>`
        })

        working.status = 'Complete'
        range = 'C2:E10'

        let getStatusIcon = (i) => {

            if (i.toUpperCase() === 'COMPLETE') {
                return `<img src="/assets/img/icons/png/check-3x.png"> `
            } else if (i.toUpperCase() === 'PENDING') {

                return `<img src="/assets/img/icons/png/loop-circular-3x.png"> `

            } else {
                return `<img src="/assets/img/icons/png/warning-3x.png">`
            }
        }

        let status_table = await db.loadSheet(path, sheet, range)
        let _rows = [];
        for (let row of status_table['values']) {
            let msg = '';
            if (row[2]) {
                msg = row[2]
            }
            _rows.push({
                item: row[0], status: row[1], "html": getStatusIcon(row[1]), 'msg': msg
            })

        }

        let statuus_table = {
            wid: 'table', data: {
                title: 'Target status',
                width: '50%',
                padding_top: '10px',
                showHeader: false,
                rows: _rows
            }
        }
        showWidget(statuus_table);

    });

}

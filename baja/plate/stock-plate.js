function () {

    let path = 'kras/dose-response.xlsx'
    let sheet = 'qc'
    let range = 'A1:R235'

    exec('baja/plate/layout.js').then(async (Plate) => {
        let stock = new Plate(12, 8);
        let stockPlate = await stock.createPlateComponent(500, 300);
        let qc = new Plate(12, 8);
        let qcComponent = await qc.createPlateComponent(500, 300);
        await showWidget({
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '40%',
                            'title': 'Order',
                            'component': stockPlate
                        },
                        {
                            width: '10%',
                            'component': {
                                wid: 'html',
                                data: `<img src="/assets/img/icons/png/arrow-circle-right-8x.png">`
                            }
                        },
                        {
                            'title': 'QC (received)',
                            'width': '40%',
                            'body': ``,
                            'component': qcComponent
                        }
                    ]]
            }
        })

        const groupBy = (array, key) => {

            return array.reduce((result, currentValue) => {

                (result[currentValue[key]] = result[currentValue[key]] || []).push(
                    currentValue
                );

                return result;
            }, {});
        };

        let db = await exec('baja/lib/db.js');
        let qcdata = await db.loadSheet(path, sheet, range)
        let values = qcdata['values']

        let pdata = [];
        let i = 0;
        let j = 0;
        let index = [];
        let t = []
        let header = [];
        let plate_name = null;
        for (let row of values) {
            if (i == 0) {
                header = row;
            } else {
                let obj = {};
                for (let j = 0; j < row.length; j++) {
                    obj[header[j]] = row[j];
                }
                if ( !plate_name && i>0 ){
                    plate_name = row[0]
                }else if ( plate_name != row[0]){
                    pdata.push ( {[plate_name] : index } );
                    index = [];
                    plate_name = row[0]
                }
                index.push(obj);
            }
            i++;
        }
        showWidget({
            wid: 'json',
            data: JSON.stringify(pdata)
        })

        setInterval(async () => {
            await qc.drawPlate();
            await stock.drawPlate();
        }, 1500)

    })

}

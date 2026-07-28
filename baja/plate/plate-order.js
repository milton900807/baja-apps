function (plate_order, graph) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/layout.js');
        let plate_list = [];
        let a = plate_order.map((x) => x);
        while (a.length) {
            plate_list.push(a.splice(0, 12));
        }

        let stock = new Plate(12, 8);
        let stlist = []
        let r = 0;
        for (let row = 0; row < plate_list.length; row++) {
            if (row > 0 && row % 8 === 0) {
                stlist.push(stock);
                stock = new Plate(12, 8);
                r = 0;
            }
            for (let col = 0; col < plate_list[row].length; col++) {
                let obj = plate_list[row][col];
                stock.setWellObj(col, r, obj)
            }
            r++;
        }
        stlist.push ( stock );

        let complist = []
        for (let st of stlist) {
            let stockPlate = await st.createPlateComponent(600, 300, graph);
            complist.push([
                {
                    width: '90%',
                    height: '500px',
                    'component': stockPlate
                }
            ])
        }

        return resolve({
            wid: 'card',
            data: {
                cards: complist
            }
        })

    })
}

function (pt, fromPlate) {

    return new Promise(async (resolve, reject) => {
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push({
            label: `Run all from here`,
            click: (scx, scy) => {
                pt.executeFrom(fromPlate);
            },
            move: () => {
            }
        });

        let tf = pt.getTransferFunctions(fromPlate);
        for (let i of tf) {
            menuList.push({
                label: `` + i.from.name + ' ' + i.type + ' ' + i.to.name,
                click: (scx, scy) => {
                },
                move: () => {
                }
            });

        }

        menuList.push({
            label: `View workflow node`,
            click: (scx, scy) => {
            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

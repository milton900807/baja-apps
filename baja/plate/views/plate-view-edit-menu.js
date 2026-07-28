function (pt) {

    return new Promise(async (resolve, reject) => {
        let TransferFunction = await exec('baja/plate/transfer-functions.js')

        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push({
            label: `Delete`,
            click: (scx, scy) => {
                pt.removeRootplate(pt.selectedPlate);
                pt.removedDangelingFunctions ();
                pt.alignPlates ();
            },
            move: () => {
            }
        });
        menuList.push({
            label: `Past values...`,
            click: (scx, scy) => {

                alert ( ' test ')

            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

function (pt, transferFunction) {

    return new Promise(async (resolve, reject) => {

        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')

        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push(

            {
                label: `View function`,
                click: (scx, scy) => {
                    showModal({
                        wid: 'json',
                        data: JSON.stringify(transferFunction)
                    })
                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `Delete function`,
                click: (scx, scy) => {

                    pt.removeFunction(transferFunction)

                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `Run`,
                click: (scx, scy) => {
                    transferFunction.exec(pt);
                    transferFunction.setComplete(true)
                },
                move: () => {
                }
            });
        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

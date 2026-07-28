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
                label: `Connect source`,
                click: (scx, scy) => {

                },
                move: () => {
                }
            });

        menuList.push(

            {
                label: `Connect destination`,
                click: (scx, scy) => {

                    pt.removeFunction ( transferFunction )

                },
                move: () => {
                }
            });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

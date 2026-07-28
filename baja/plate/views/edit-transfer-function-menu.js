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

        if (!transferFunction.complete) {
            menuList.push(

                {
                    label: `Mark complete`,
                    click: (scx, scy) => {
                        transferFunction.complete = true;

                    },
                    move: () => {
                    }
                });
        } else {
            menuList.push(

                {
                    label: `Mark Incomplete`,
                    click: (scx, scy) => {
                        transferFunction.complete = true;
                        transferFunction.removePlots();

                    },
                    move: () => {
                    }
                });

        }

        menuList.push(

            {
                label: `Delete function`,
                click: (scx, scy) => {

                    pt.removeFunction(transferFunction)

                },
                move: () => {
                }
            });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

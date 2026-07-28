function (pt, selectedWB) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let FunFactory = await exec('baja/plate/views/fun-factory.js')

        let fun = selectedWB.fun;
        fun = await FunFactory.create(selectedWB.type)

        let menuList = []
        let md = false;
        let smenu;
        let world_x;
        let world_y;

        menuList.push(
            {
                label: `Run`,
                click: (scx, scy) => {
                    selectedWB.exec(pt);
                    selectedWB.setComplete(true)
                },
                move: () => {
                }
            });
        if (selectedWB.complete) {
            menuList.push(
                {
                    label: `Reset`,
                    click: (scx, scy) => {
                        selectedWB.setComplete(false)
                    },
                    move: () => {
                    }
                });

        }else
        {
                menuList.push(
                    {
                        label: `Mark complete`,
                        click: (scx, scy) => {

                            selectedWB.setComplete ( true )
                        },
                        move: () => {
                        }
                    });
        }

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

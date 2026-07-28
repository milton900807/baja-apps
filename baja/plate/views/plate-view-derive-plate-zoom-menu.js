function (pt) {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');

        let menuList = [
        ]
        menuList.push({
            label: `Set Type`,
            click: (scx, scy) => {
            },
            move: () => {
            }
        });

        menuList.push({
            label: `Set Name`,
            click: (scx, scy) => {
            },
            move: () => {
            }
        });

        menuList.push({
            label: `Paste values`,
            click: (scx, scy) => {
            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}

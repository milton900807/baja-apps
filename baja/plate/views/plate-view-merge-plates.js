function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');
        fromPlate;
        toPlate;
        let connectPlates = async () => {
            pt.mouseDownListener = async (x, y) => {
                md = true;
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                let p = pt.getPlate(xw, yw);
                if ( !fromPlate ) {
                    fromPlate = p;
                } else {
                }

            };
            pt.mouseMoveListener = (x, y) => {
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                let p = pt.getPlate(xw, yw);
                if (md && p != null) {

                }
            }
            pt.mouseUpListener = (x, y) => {
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                let p = pt.getPlate(xw, yw);

                if ( md && p != null )
                {
                    if ( fromPlate ) {
                        toPlate = p;
                        pt.smenu = await exec('baja/plate/views/plate-view-plate-values-menu', pt, fromPlate);
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.smenu.x = mmx;
                        pt.smenu.y = mmy;
                        pt.menu_vis = false;
                    }

                }

            };
        }
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

        connectPlates();
        let menu = new Menu(menuList, 0, 100)

        resolve(menu)

    })

}

function (pt) {

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let Menu = await exec('flexigraph/menu.js');

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                smenu = null;
                return;
            }
            md = true;
        }
        let mouseMoveListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseMove(pt.grid, xw, yw)
                return;
            }
            pt.deselectPlateRoots();
            if (md) {
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);
            let x_ = pt.grid.Xwc(x);
            let y_ = Math.floor(mmy);
            x_ = Math.floor ( x_ )

            if (smenu) {
                smenu = null;
                return;
            }
            if (md) {
                smenu = await exec('baja/plate/views/copy-plates-menu.js', pt, x_, y_);
                smenu.x = mmx;
                smenu.y = mmy;
            } else {
                if (smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseUp(pt.grid, mmx, mmy)
                }
                md = false;
                smenu = null;
                pt.deselectPlateRoots();
            }
        }

        let draw = (grid, ctx) => {
        }
        let menuManager = (pt, ctx) => {
            if (smenu) {
                smenu.draw(ctx, pt.grid)
            }
        }

        resolve({
            mouseDownListener: mouseDownListener,
            mouseUpListener: mouseUpListener,
            mouseMoveListener: mouseMoveListener,
            draw: draw,
            menuManager: menuManager
        })

    })

}

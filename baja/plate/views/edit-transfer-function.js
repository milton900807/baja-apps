function (pt) {

    let transferFunction;

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu!=null && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                return;
            }
            md = true;
            transferFunction = pt.getTransferFunction(xw, yw);
            if (transferFunction != null) {
                transferFunction.selectIt();
            }
        }
        let mouseMoveListener = async (x, y) => {
            await pt.deselectPlateRoots();

            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseMove(pt.grid, xw, yw)
                return;
            }
            transferFunction = pt.getTransferFunction(xw, yw);
            if (transferFunction != null) {
                transferFunction.selectIt();
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);
            if (smenu) {
                smenu = null;
                return;
            }
            if (md && transferFunction) {
                smenu = await exec('baja/plate/views/edit-transfer-function-menu.js', pt, transferFunction);
                smenu.x = mmx;
                smenu.y = mmy;
            } else {
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseUp(pt.grid, mmx, mmy)
                }
                transferFunction = null;
                md = false;
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

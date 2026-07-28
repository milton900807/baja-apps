function (pt) {

    return new Promise(async (resolve, reject) => {
        let md = false;
        let smenu;
        let fromPlate;
        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                return;
            }
            md = true;
            fromPlate = pt.getPlate(xw, yw);
            if (fromPlate != null) {
                fromPlate.selectIt();
            }
        }
        let mouseMoveListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseMove(pt.grid, xw, yw)
                return;
            }
            pt.deselectPlateRoots();
            fromPlate = pt.getPlate(xw, yw);
            if (fromPlate != null) {
                fromPlate.selectIt();
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);
            if (smenu) {
                smenu = null;
                return;
            }
            if (md && fromPlate) {
                smenu = await exec('baja/plate/views/plate-view-transfer-function-run-menu.js', pt, fromPlate);
                smenu.x = mmx;
                smenu.y = mmy;
            } else {
                if (smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseUp(pt.grid, mmx, mmy)
                }
                fromPlate = null;
                md = false;
                pt.deselectPlateRoots();
            }
        }

        let draw = (grid, ctx) => {
            ctx.fillStyle = "lightBlue";
            ctx.shadowBlur = 2;
            ctx.lineWidth = 2;

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

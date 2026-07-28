function (pt) {

    return new Promise(async (resolve, reject) => {
        let md = false;
        let fromPlate;
        let toPlate;
        let smenu;
        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                return;
            }
            md = true;
            fromPlate = pt.getPlate(xw, yw);
            toPlate = null;
            if (fromPlate != null) {
                fromPlate.selectIt();
            } else {
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
            if (fromPlate != null) {
                fromPlate.selectIt();
            }
            toPlate = pt.getPlate(xw, yw);
            if (md) {
                if (toPlate)
                    toPlate.selectIt();
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);
            if (smenu) {
                smenu = null;
                return;
            }
            if (md && toPlate && fromPlate) {
                smenu = await exec("baja/plate/views/plate-view-connection-edit-menu.js", pt, fromPlate, toPlate);
                smenu.x = mmx;
                smenu.y = mmy;
            } else {
                if (smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseUp(pt.grid, mmx, mmy)
                }
                fromPlate = null;
                toPlate = null;
                md = false;
                pt.deselectPlateRoots();
            }
        }

        let draw = (grid, ctx) => {
            ctx.fillStyle = "lightBlue";
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            if (fromPlate && toPlate &&
                (fromPlate != toPlate)) {
                ctx.beginPath();
                ctx.moveTo(grid.X(fromPlate.grid.xi), grid.Y(fromPlate.grid.yi));
                ctx.lineTo(grid.X(toPlate.grid.xi), grid.Y(toPlate.grid.yi));
                ctx.closePath();
                ctx.stroke();
            }
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

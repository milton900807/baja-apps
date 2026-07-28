function (pt) {

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let world_x;
        let world_y;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu!=undefined && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                return;
            }
            let x_ = pt.grid.Xwc(x);
            let y_ = Math.floor(yw);
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);

            smenu = await exec('baja/plate/views/create-plate-menu.js', pt, x_, y_);
            smenu.x = mmx;
            smenu.y = mmy;

            md = true;
        }
        let mouseMoveListener = async (x, y) => {
            if (md) {
                let xw = (pt.grid.Xwc(x));
                let yw = (pt.grid.Ywc(y));

                if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                    smenu.mouseMove(pt.grid, xw, yw)
                    return;
                }
            } else {

                let xw = Math.floor(pt.grid.Xwc(x));
                let yw = Math.floor(pt.grid.Ywc(y));

                world_x = xw;
                world_y = yw + 1;
                pt.deselectPlateRoots();
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x + 10);
            let mmy = pt.grid.Ywc(y + 10);
            if (smenu.isIn(pt.grid, mmx, mmy)) {
                smenu.mouseUp(pt.grid, mmx, mmy)
            }
            smenu = null;
            md = false;
            smenu = null;
            pt.deselectPlateRoots();
        }

        let draw = (grid, ctx) => {

            if (world_x != undefined && world_y != undefined) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'lightBlue';
                ctx.beginPath();
                ctx.rect(0, grid.Y(world_y), ctx.canvas.width, grid.screenHeight(1));
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

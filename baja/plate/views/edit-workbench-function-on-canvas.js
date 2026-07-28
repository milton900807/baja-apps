function (pt) {

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let selectedWB;
        let world_x;
        let world_y;
        let well;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (smenu && smenu != undefined && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                console.log (' inside the menu ')
                return;
            }
            if (selectedWB) {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                smenu = await exec('baja/plate/views/edit-workbench-function-on-canvas-menu.js', pt, selectedWB);
                smenu.x = mmx;
                smenu.y = mmy;
                md = true;
            } else {
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                if (smenu != undefined && smenu.isIn(pt.grid, xw, yw)) {
                    smenu.mouseDown(pt.grid, xw, yw)
                    return;
                }
                let x_ = pt.grid.Xwc(x);
                let y_ = Math.floor(yw);
                let mmx = pt.grid.Xwc(x + 10);
                let mmy = pt.grid.Ywc(y + 10);
                smenu = await exec('baja/plate/views/create-workbench-function-menu.js', pt);
                smenu.x = mmx;
                smenu.y = mmy;
                md = true;

            }

        }

        let mouseMoveListener = async (x, y) => {
            let xw = (pt.grid.Xwc(x));
            let yw = (pt.grid.Ywc(y));
            if (md) {
                if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                    smenu.mouseMove(pt.grid, xw, yw)
                    return;
                }
            } else {
                world_x = xw;
                world_y = yw + 1;
                pt.deselectPlateRoots();
                selectedWB = pt.getTrackFunction(xw, yw);
                if (selectedWB != null) {
                    selectedWB.selectIt();
                }
                world_x = xw;
                world_y = yw + 0.01;

            }
        }
        let mouseUpListener = async (x, y) => {
            let xw = (pt.grid.Xwc(x));
            let yw = (pt.grid.Ywc(y));

            let mmx = pt.grid.Xwc(x);
            let mmy = pt.grid.Ywc(y);
            if (smenu && smenu != undefined && smenu.isIn(pt.grid, xw, yw)) {
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

            if (world_x != undefined && world_y != undefined) {
                if (well && well.drawToSize) {
                    let ww = grid.worldWidth(200)
                    well.drawToSize(grid, ctx, 0, 1, world_x, world_y, ww, ww)
                }
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

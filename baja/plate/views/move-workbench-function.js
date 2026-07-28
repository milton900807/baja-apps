function (pt) {

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let Menu = await exec('flexigraph/menu.js');
        let selectedPlate;
        let xi = 0;
        let yi = 0;
        let world_x;
        let world_y;

        let mouseDownListener = async (x, y) => {
            xi = x;
            yi = y;
            md = true;
        }
        let mouseMoveListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);

            if (md) {
                if (selectedPlate) {
                    selectedPlate.x = pt.grid.Xwc(x-20);
                    selectedPlate.y = pt.grid.Ywc(y-20);
                }
            } else {
                pt.deselectPlateRoots();
                selectedPlate = pt.getTrackFunction(xw, yw)
                if (selectedPlate != null) {
                    selectedPlate.selectIt();
                }
            }
        }
        let mouseUpListener = async (x, y) => {
            if (selectedPlate) {
            }
            md = false;
            selectedPlate = null;
        }

        let draw = (grid, ctx) => {

            ctx.shadowColor = 'black';
            ctx.strokeStyle = 'lightBlue';
            ctx.beginPath();
            ctx.fillRect(0, grid.Y(xi), 10, grid.Y(yi), 10);

            if (world_y != undefined) {
                ctx.lineWidth = 1;

                ctx.shadowColor = 'black';
                ctx.strokeStyle = 'lightBlue';
                ctx.beginPath();
                ctx.rect(0, grid.Y(world_y+1), ctx.canvas.width, grid.screenHeight(1));
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

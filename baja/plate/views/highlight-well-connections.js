function (pt) {

    return new Promise(async (resolve, reject) => {

        let world_x;
        let world_y;
        let highlightWells = []
        let selectedPlate = null;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
        }
        let mouseMoveListener = async (x, y) => {
            highlightWells = [];
            let xw = (pt.grid.Xwc(x));
            let yw = (pt.grid.Ywc(y));
            pt.deselectPlateRoots();
            selectedPlate = pt.getPlate(xw, yw);
            if (selectedPlate != null) {
                selectedPlate.selectIt();
                let w = selectedPlate.getWell(xw, yw)
                if (w && w.source) {
                    world_x = selectedPlate.grid.Xwc(xw-selectedPlate.grid.xi*2);
                    world_y = selectedPlate.grid.Ywc(yw - selectedPlate.grid.yi*2);
                    if (w && w.source) {
                        for (let so of w.source) {
                            console.log ( " s o " + so.plate );
                            let splate = pt.getPlateWithUID(so.plate);
                            if (splate != null) {
                                highlightWells.push({
                                    splate:splate,
                                    splate_x:so.x,
                                    splate_y:so.y
                                });
                            }
                        }
                    }
                }
            }
        }
        let mouseUpListener = async (x, y) => {
        }

        let draw = (grid, ctx) => {
            if (world_x != undefined && world_y != undefined) {
                ctx.lineWidth = 1;
                ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
                ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";

                for (let h of highlightWells) {

                    let sourcePlate = h.splate;
                    let splate_x = h.splate_x;
                    let splate_y = h.splate_y;

                    ctx.beginPath();

                    ctx.moveTo(pt.grid.X(sourcePlate.grid.X(splate_x+0.5)), pt.grid.Y(sourcePlate.grid.Y(splate_y+0.5)));
                    ctx.lineTo(pt.grid.X(selectedPlate.grid.X(world_x)), pt.grid.Y(selectedPlate.grid.Y(world_y)))
                    ctx.stroke();
                    ctx.closePath();

                }

            }
        }
        let menuManager = (pt, ctx) => {
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

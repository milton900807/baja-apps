function (pt, selectedPlate, x, y) {

    return new Promise(async (resolve, reject) => {

        let md = true;
        let smenu;
        let xs = x - pt.grid.X(selectedPlate.grid.xi);
        let ys = y - pt.grid.Y(selectedPlate.grid.yi + selectedPlate.grid.height);

        selectedPlate.highlightbutton = 'move'
        selectedPlate.__moving = true;

        let mouseDownListener = async (x, y) => {

            pt.grid.rescale();
            md = true;

            if (!selectedPlate) {
                selectedPlate = pt.getPlate(pt.grid.Xwc(x), pt.grid.Ywc(y))
                if (selectedPlate != null) {
                    selectedPlate.__moving = true;
                    selectedPlate.selectIt();
                }
            }
            if (selectedPlate) {
                xs = x - pt.grid.X(selectedPlate.grid.xi);
                ys = y - pt.grid.Y(selectedPlate.grid.yi + selectedPlate.grid.height);
            }
        }
        let mouseMoveListener = async (x, y) => {
            if (md) {
                if (selectedPlate) {
                    selectedPlate.highlightbutton = 'move';
                    selectedPlate.grid.xi = pt.grid.Xwc(x) - pt.grid.worldWidth(xs);
                    selectedPlate.grid.yi = pt.grid.Ywc(y) + pt.grid.worldHeight(ys) - selectedPlate.grid.height;
                }
            } else {
                pt.wb(null)
            }
        }
        let mouseUpListener = async (x, y) => {
            md = false;

            if (pt && selectedPlate) {

                pt.wb(null)
                selectedPlate.deselectAll();
                selectedPlate.__moving = false;
                selectedPlate.clk_drag(pt);
            }
            pt.wb(null)

        }

        let close = () => {

            if (selectedPlate) {
                selectedPlate.deselectAll();
                selectedPlate.__moving = false;
                selectedPlate.clk_drag(pt);
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
            close: close,
            menuManager: menuManager
        })

    })

}

function (pt) {

    let fromPlate;

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            md = true;
            fromPlate = pt.getPlate(xw, yw);
            if (fromPlate != null) {
                fromPlate.selectIt();
            }
        }
        let mouseMoveListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            pt.deselectPlateRoots();
            fromPlate = pt.getPlate(xw, yw);
            if (fromPlate != null) {
                fromPlate.selectIt();
            }
        }
        let mouseUpListener = async (x, y) => {
            if (md && fromPlate) {
                for ( let vf of fromPlate.wells ){
                    for ( let w of vf ){
                        w.clearGroups();
                        w.color = 'lightGray'
                    }
                }
            }
        }

        let draw = (grid, ctx) => {
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

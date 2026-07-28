function (pt, glyph, x, y) {

    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let xs = x - pt.grid.X(glyph.shape.x);
        let ys = y - pt.grid.Y(glyph.shape.y);

        let mouseDownListener = async (x, y) => {
            pt.grid.rescale();
            md = true;

            console.log('debubg');

            if (!glyph) {
                glyph = pt.getPlate(pt.grid.Xwc(x), pt.grid.Ywc(y))
                if (glyph != null) {
                    glyph.selectIt();
                }
            }
            if (glyph) {
                xs = x - pt.shape.X(glyph.shape.x);
                ys = y - pt.shape.Y(glyph.shape.y);
            }
        }
        let mouseMoveListener = async (x, y) => {
            if (md) {
                if (glyph) {
                    glyph.shape.x = pt.grid.Xwc(x) - pt.grid.worldWidth(xs);
                    glyph.shape.y = pt.grid.Ywc(y) + pt.grid.worldHeight(ys) - glyph.shape.h;
                }
            } else {
                pt.wb(null)
            }
        }
        let mouseUpListener = async (x, y) => {
            md = false;

            if (pt && glyph) {
                pt.wb(null)
                pt.deselectAll();
            } else
                pt.wb(null)

        }

        let close = () => {

            if (glyph) {
                pt.deselectAll();
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

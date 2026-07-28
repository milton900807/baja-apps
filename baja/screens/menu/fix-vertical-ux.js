function (plateTrack) {

    return new Promise(async (res, rej) => {

        const grid = plateTrack.grid;
        let isDown = false;
        let sx0 = 0;
        let wx0 = 0;
        let xmin0, xmax0;
        let ymin0, ymax0;

        const mouseDownListener = async (x, y) => {
            isDown = true;
            sx0 = x;
            wx0 = grid.Xwc(sx0);

            xmin0 = grid.getxmin();
            xmax0 = grid.getxmax();
            ymin0 = grid.getymin();
            ymax0 = grid.getymax();
        };

        const mouseMoveListener = (x, y) => {
            if (!isDown) return;

            const wx1 = grid.Xwc(x);
            const dxWorld = wx1 - wx0;

            grid.setxmin(xmin0 - dxWorld);
            grid.setxmax(xmax0 - dxWorld);
            grid.setymin(ymin0);
            grid.setymax(ymax0);
            grid.rescale();
        };

        const finish = (x) => {

            const movedX = grid.getxmin() - xmin0;
            res({ movedWorldX: movedX });
        };

        const mouseUpListener = async (x, y) => {
            if (!isDown) return;
            isDown = false;
            t.close();
            finish(x);
        };

        const t = {
            id: "drag-navigate",
            priority: true,
            close: () => {
            },
            mouseMoveListener,
            mouseUpListener,
            mouseDownListener,
            draw: (grid, ctx) => {
            },
        };

        plateTrack.wb(t)
        res()

    });

}

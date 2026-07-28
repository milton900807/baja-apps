function (pt, plot, x, y) {

    return new Promise(async (resolve, reject) => {
        let md = true;
        let smenu;
        let Menu = await exec('flexigraph/menu.js');

        let xs = 0;
        let ys = 0;

        const graph = CurrentLayout.getStashed('graph');

        const placePlotAtMouse = (x, y) => {
            pt.grid.rescale();

            // Center plot on cursor initially
            plot.x = pt.grid.Xwc(x);
            plot.y = pt.grid.Ywc(y);

            // Offset from cursor to plot origin, used during dragging
            xs = x - pt.grid.X(plot.x);
            ys = y - pt.grid.Y(plot.y);
        };

        if (x !== null && y !== null) {
            xs = x - pt.grid.X(plot.x);
            ys = y - pt.grid.Y(plot.y);
        }

        plot.highlightButton('move');

        let mouseDownListener = async (x, y) => {
            md = true;

            xs = x - pt.grid.X(plot.x);
            ys = y - pt.grid.Y(plot.y);

            pt.grid.rescale();

            if (!plot) {
                plot = pt.getPlot(x, y);
                if (plot != null) {
                    plot.highlight();
                }
            }
        };

        let mouseMoveListener = async (x, y) => {
            pt.grid.rescale();

            if (x === null || y === null) return;

            // First real mouse position: place plot there
            if (plot && arguments.callee.needsInitialPlacement) {
                placePlotAtMouse(x, y);
                arguments.callee.needsInitialPlacement = false;
            }

            if (md && plot) {

                if (plot) {
                    // If plot position is invalid, snap it to current cursor
                    if (!Number.isFinite(plot.x) || !Number.isFinite(plot.y)) {
                        plot.x = pt.grid.Xwc(x);
                        plot.y = pt.grid.Ywc(y);

                        // also reset drag offsets so it doesn’t jump weirdly
                        xs = x - pt.grid.X(plot.x);
                        ys = y - pt.grid.Y(plot.y);
                    }

                    plot.highlightButton('move');

                    plot.x = pt.grid.Xwc(x) - pt.grid.worldWidth(xs);
                    plot.y = pt.grid.Ywc(y) + pt.grid.worldHeight(ys);
                }


                plot.highlightButton('move');
                graph.setMouseMode(
                    `msg: Click to drop: ${plot.x}, ${plot.y.toFixed(2)}`
                );

                plot.x = pt.grid.Xwc(x) - pt.grid.worldWidth(xs);
                plot.y = pt.grid.Ywc(y) + pt.grid.worldHeight(ys);
            } else {
                pt.wb(null);
            }
        };

        mouseMoveListener.needsInitialPlacement = x === null || y === null;

        let mouseUpListener = async (x, y) => {
            md = false;

            if (pt) {
                pt.deselectAll();
                pt.wb(null);
            }
            graph.setMouseMode(null);

            plot.highlightButton(null);
        };

        let draw = (grid, ctx) => { };

        let menuManager = (pt, ctx) => {
            if (smenu) {
                smenu.draw(ctx, pt.grid);
            }
        };

        resolve({
            mouseDownListener,
            mouseUpListener,
            mouseMoveListener,
            draw,
            close: () => {
                pt.wb(null);
            },
            menuManager
        });
    });

}

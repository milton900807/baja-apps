function () {
    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js')

        class Scroll {
            mdown = false;
            graph = null;
            grid = null;
            mastergraph = null;
            position = 1;
            scrollmax = 10000;
            windowsize = 10;

            constructor(grid, scrollmax, windowsize) {
                this.grid = grid;
                this.graph = new MGrid();
                this.graph.setInset(0, 50);

                this.graph.setymin(0);
                this.graph.setxmin(0)
                this.graph.setxmax(1)
                this.graph.setymax(1)
                this.scrollmax = scrollmax;
                this.windowsize = windowsize;

            }

            getMouseDownListener() {
                return (x, y) => {
                    this.mouseDownListener(x, y)
                }
            }
            getMouseUpListener() {
                return (x, y) => {
                    this.mouseUpListener(x, y)
                }
            }
            getMouseMoveListener() {
                return (x, y) => {
                    this.mouseMoveListener(x, y);
                }
            }

            mouseDownListener(wx, wy) {

                if (this.mastergraph) {

                    let xi = this.mastergraph.Xwc(this.graph.xi);
                    if (wx < xi) {
                        this.mdown = false;
                        return;
                    }
                }

                this.mdown = true;
                if (this.mastergraph) {

                    let xi = this.mastergraph.Xwc(this.graph.xi);
                    if (wx < xi) {
                        return;
                    }

                }

            }
            mouseUpListener(wx, wy) {

                this.mdown = false;

            }
            mouseMoveListener(wx, wy) {

                if (this.mastergraph) {
                    let xi = this.mastergraph.Xwc(this.graph.xi);
                    if (wx < xi) {
                        this.mdown = false;

                        return;
                    }

                    let xy = this.mastergraph.Xwc(this.graph.X(wy));

                    if (this.mdown) {

                        this.position = this.graph.Ywc(this.mastergraph.Y(wy) - 15);
                    }
                }
            }

            drawOval = (x, y, w, h, color, lineWidth, canvas) => {
                if (canvas) {
                    var ctx = canvas.getCTX();
                    if (!color) {
                        color = 'black'
                    }

                    if (!lineWidth)
                        lineWidth = 2
                    ctx.strokeStyle = color;
                    ctx.lineWidth = lineWidth;

                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,

                        xm = x + w / 2,
                        ym = y + h / 2;

                    ctx.beginPath();
                    ctx.moveTo(x, ym);
                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                    ctx.stroke();
                }
            }

            async draw(graph) {
                this.mastergraph = graph;
                let canvas = graph.canvas;
                if (canvas) {
                    let ctx = canvas.getCTX();
                    ctx.shadowColor = 'black';
                    ctx.color = 'white';
                    ctx.strokeStyle = "red";
                    let w = canvas.width;
                    let h = canvas.height;
                    this.graph.xi = w - 50;
                    this.graph.yi = 0;
                    this.graph.width = 50;
                    this.graph.height = h;
                    this.graph.rescale();
                    let gh = this.scrollmax;

                    let gp = Math.floor(gh * this.position);
                    if (!(gp)) {
                        gp = this.grid.ymax;
                    }

                    this.grid.ymax = gp;
                    if (this.grid.ymax < this.windowsize) {
                        this.grid.ymax = this.windowsize;
                    }
                    this.grid.ymin = this.grid.ymax - this.windowsize;
                    this.grid.rescale();

                    ctx.shadowBlur = 2;
                    ctx.shadowColor = 'black';
                    this.drawOval(this.graph.X(0), this.graph.Y(this.position), 30, 30, "red", 5, canvas)

                }
            }
        }
        return resolve(Scroll)

    });

}

function () {

    let t = async () => {
        let MGrid = await exec('flexigraph/grid.js')
        let TrackPlot = class TrackPlot {
            name;
            xi;
            xf;
            color = 'gray'
            y = 1;
            oligos = [];
            grid;

            constructor(name, xi, xf, wi, hi, xstart, xend) {
                this.name = name;
                this.xi = xi;
                this.xf = xf;

                this.grid = new MGrid(xi, yi, wi, hi);
                this.grid.setxmax(xstart);
                this.grid.setymax(1);
                this.grid.setxmin(xend);
                this.grid.setymin(0);
                this.grid.rescale();
            }

            setColor(color) {
                this.color = color;
            }

            getOligosInRange(xstart, xend) {
                let selected = [];
                for (let o of this.oligos) {
                    if (xstart <= o.xi && xend >= o.xf) {
                        selected.push(o);
                    }
                    else
                        if (o.inAnnotation(xstart) || o.inAnnotation(xend)) {
                            selected.push(o);
                        }
                }
                return selected;
            }

            getOligo(x, y) {
                if (y < 0) {
                    y = y * (-1)
                }
                let selected = [];
                let yv = Math.floor(y);
                let xv = Math.floor(x);
                console.log(' yv ' + yv + ' y ' + this.y);
                if (yv === this.y) {
                    for (let o of this.oligos) {
                        if (o.inAnnotation(xv)) {

                            selected.push(o);
                        }
                    }
                }
                return selected;
            }
            async draw(graph) {
                this.mg.rescale ();
                await graph.drawLine(this.mg.xi, this.y, this.mg.xi+this.mg.wi, this.y, 'magenta', 1, 'round')
                await graph.drawLine(this.mg.X(this.mg.getxmin()), this.mg.Y(0), this.mg.X(this.getxmax()), this.mg.Y(0), this.color, 1, 'round')

                graph.drawStart('blue');
                graph.drawEnd('blue');
                let range = graph.getxmax() - graph.getxmin();

                graph.drawString('' + this.y, graph.getxmin(), this.y, 'black');
                graph.drawString('' + graph.getymin(), graph.getxmin(), graph.getymin(), 'black');
            }
        }
    };
    t ().then ( trackPlot => {

    })

}

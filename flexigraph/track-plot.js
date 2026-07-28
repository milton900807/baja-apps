function () {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js')

        let TrackPlot = class TrackPlot {
            name = 'untitled';
            xi;
            yi;
            color = 'lightBlue'
            y = 1;
            oligos = [];
            snpindels = [];
            mg;

            constructor(name, xi, yi, wi, hi, xmin, xmax, oligos, snpindels) {
                this.oligos = oligos;
                this.snpindels = snpindels;
                this.name = name;
                this.xi = xi;
                this.yi = yi;

                this.mg = new MGrid(xi, yi, wi, hi);
                this.mg.setxmax(xmax);
                this.mg.setymax(100);
                this.mg.setxmin(xmin);
                this.mg.setymin(-1.5);

                this.mg.rescale();
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
                let xv = this.xi + x;
                for (let o of this.oligos) {
                    if (o.inAnnotation(xv)) {

                        selected.push(o);
                    }
                }
                return selected;
            }

            getSnpindel(x, y) {
                if (y < 0) {
                    y = y * (-1)
                }
                let selected = [];
                let yv = Math.floor(y);
                let xv = this.xi + x;
                for (let sid of this.snpindels) {
                    if (sid.inAnnotation(xv)) {

                        selected.push(sid);
                    }
                }
                return selected;
            }

            async draw(graph) {
                this.mg.yinset = 0;
                this.mg.xinset = 0;

                this.mg.setWidth(graph.grid.screenWidth(graph.grid.width));
                this.mg.xmin = graph.grid.xmin;
                this.mg.xmax = graph.grid.xmax;
                this.mg.ymin = 0;
                this.mg.ymax = 100;

                this.mg.rescale();

                for (let o of this.oligos) {
                    if (o.percent_control) {
                        let v2 = this.mg.screenHeight(o.percent_control);
                        graph.drawBar(o.xi, this.yi, v2, 'orange')
                    }
                }

            }
        }
        return resolve(TrackPlot);
    })
}

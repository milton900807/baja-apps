function () {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js')

        let SimpleLinePlot = class SimpleLinePlot {
            name = 'untitled';
            xi;
            yi;
            color = 'lightBlue'
            y = 1;
            points = [];

            constructor(name, xi, yi, wi, hi, xmin, xmax) {
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

            async draw(graph) {
                this.mg.yinset = 0;
                this.mg.xinset = 0;
                this.mg.setWidth(graph.grid.screenWidth(graph.grid.width));
                this.mg.xmin = graph.grid.xmin;
                this.mg.xmax = graph.grid.xmax;
                this.mg.ymin = 0;
                this.mg.ymax = 100;
                this.mg.rescale();
            }
        }
        return resolve(SimpleLinePlot);
    })
}

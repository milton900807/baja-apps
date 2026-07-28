return new Promise(async (resolve, reject) => {
    let MGrid = await exec('flexigraph/grid.js')
    let TrackLink = await exec('baja/bio/track-link.js')

    let GraphLayer = class GraphLayer {
        name = 'untitled';
        tgraph;
        visible = true;
        trackPoints = []

        constructor(name, xmin, ymin, xmax, ymax) {
            this.name = name;
            this.tgraph = new MGrid(0, 0, 100, 100);
            this.tgraph.xi = 0;
            this.tgraph.yi = 0;
            this.tgraph.setxmax(xmax);
            this.tgraph.setymax(ymax);
            this.tgraph.setxmin(xmin);
            this.tgraph.setymin(ymin);
            this.tgraph.setInset(0, 0)
            this.tgraph.rescale();
        }

        add(trackPoint) {
            this.trackPoints.push(trackPoint);
        }
        addAnnotation(a) {
            this.annotations.push(a);
        }
        getXi() {
            return this.tgraph.xi;
        }
        getYi() {
            return this.tgraph.yi;
        }
        getWidth() {
            return this.tgraph.width;
        }
        getHeight() {
            return this.tgraph.height;
        }
        setXi(xi) {
            this.tgraph.xi = xi;
        }
        setYi(yi) {
            this.tgraph.yi = yi;
        }
        setWidth(width) {
            this.tgraph.width = width;
        }
        setHeight(height) {
            this.tgraph.height = Math.abs(height);
        }
        addPoint(x, y) {
            this.pts.push({ x: x, y: y })
        }
        addInterval(x1, x2, y) {
            this.intervals.push({ x1: x1, x2: x2, y: y })
        }

        async draw(graph) {
            if (!this.visible) {
                return;
            }
            let canvas = graph.canvas;
            let ctx = canvas.getCTX();
            this.tgraph.rescale();
            let screencell = graph.screenWidth(parentTrack.screenWidth(1))
            try {
                for (let a of this.annotations) {
                    a.draw(graph, parentTrack);
                }

                ctx.fillStyle = "rgba(0,204,0,.5)";
                for (let tp of this.trackPoints) {

                    let t1 = tp.track1;
                    let t2 = tp.track2;
                    ctx.beginPath();
                    ctx.moveTo(graph.X(t1.tgrid.X(t1.x)), graph.Y(t1.tgrid.Y(t1.y)));
                    ctx.lineTo(graph.X(t2.tgrid.X(t2.x)), graph.Y(t2.grid.Y(t2.y)));
                    ctx.stroke();
                }
            } catch (exception) {
                console.log(' ex ' + exception)
            }

        }
    }
    resolve(GraphLayer);
});

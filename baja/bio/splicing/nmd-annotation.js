function () {
    return new Promise(async (resolve, reject) => {
        let shapes = await exec('flexigraph/gene-draw.js')

        let NMDAnnotation = class NMDAnnotation {
            name;
            type;
            xi;
            xf = [];
            color = 'black';
            shapeFunction = null;
            annotations;
            strand;

            constructor(type, name, xi, xf, strand, annotations) {
                this.name = name;
                this.type = type;
                this.xi = xi;
                this.xf = xf;
                this.strand = strand;
                this.annotations = annotations;
                this.shapeFunction = getIon(shapes[this.type])
            }

            inAnnotation(x) {
                if (x > this.xi && x <= this.xf) {
                    return true;
                } else {

                    return false;
                }
            }

            setColor(color) {
                this.color = color;
            }
            async draw(graph, tgraph) {
                tgraph.rescale();
                graph.rescale ();
                let ctx = graph.canvas.getCTX();
                ctx.shadowColor = "#000000";
                ctx.shadowBlur = 0;
                ctx.font = 'bold 20px serif';
                ctx.fillStyle = 'black';

                let xis = graph.X(tgraph.X(this.xi));
                let yis = graph.Y(tgraph.Y(0.0));
                ctx.strokeStyle = 'lightRed';
                ctx.lineWidth = 1;
                for (let f of this.xf) {
                    ctx.beginPath();
                    ctx.moveTo(xis, yis);
                    let xif = graph.X(tgraph.X(f));
                    let xis_h = xis + ((xif-xis)/2)
                    ctx.bezierCurveTo(xis, yis, xis_h, yis-200, xif, yis);
                    ctx.stroke();
                }

            }
        }
        resolve(NMDAnnotation)
    })
}

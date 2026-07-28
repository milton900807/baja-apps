function () {
    return new Promise(async (resolve, reject) => {

        let MGrid = await exec('flexigraph/grid.js')

        let ExpressionTrackPlot = class ExpressionTrackPlot {
            name = 'untitled';
            xi;
            yi;
            color = 'lightBlue'
            y = 1;
            tpms = [];
            mg;
            canvas;

            constructor(name, xi, yi, wi, hi, xmin, xmax, tpms) {
                this.tpms = tpms;
                this.name = name;
                this.xi = xi;
                this.yi = yi;
                this.mg = new MGrid(xi, yi, wi, hi);
                this.mg.setInset(0, 0)
                this.mg.setxmax(xmax);
                this.mg.setymax(1);
                this.mg.setxmin(xmin);
                this.mg.setymin(0);
                this.mg.rescale();
            }

            drawBar = (xi, yi, value, color, txt) => {
                if (this.canvas) {

                    xi = Math.floor(xi);
                    yi = Math.floor(yi)
                    var ctx = this.canvas.getCTX('2d');
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    if (color != null) {
                        ctx.strokeStyle = color;
                        ctx.fillStyle = color;
                    }
                    ctx.beginPath();
                    ctx.fillRect(xi, yi, 4, value);
                    ctx.rect(xi, yi, 4, value);
                    ctx.stroke();
                    ctx.font = '9px serif';
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'black';
                    ctx.font = "14px Arial";
                    ctx.fillText('' + value, xi, yi);

                }
            }

            drawBackdrop = (xi, yi, width, height, color) => {
                if (this.canvas) {
                    var ctx = this.canvas.getCTX('2d');
                    ctx.shadowBlur = 2;
                    ctx.shadowColor = 'black';
                    if (color != null) {
                        ctx.strokeStyle = color;
                    }
                    ctx.beginPath();
                    ctx.rect(xi, yi, width, height);
                    ctx.stroke();
                }
            }

            setColor(color) {
                this.color = color;
            }

            draw(y, tgraph, graph, canvas) {
                this.mg.yinset = 0;
                this.mg.xinset = 0;
                this.mg.yi = graph.Y(tgraph.Y(y + 1));
                this.mg.xi = graph.X(tgraph.X(45));
                this.canvas = canvas;
                this.mg.xmax = this.tpms.length;

                let maxvalue = null;
                for (let o of this.tpms) {
                    if (!maxvalue)
                        maxvalue = o.value
                    else if (maxvalue < o.value) {
                        maxvalue = o.value;
                    }

                }

                let minvalue = null;
                for (let o of this.tpms) {
                    if (!minvalue)
                        minvalue = o.value
                    else if (minvalue > o.value) {
                        minvalue = o.value;
                    }
                }
                this.mg.ymax = maxvalue;
                this.mg.ymin = minvalue;
                this.mg.height = graph.screenHeight(-1 * tgraph.screenHeight(0.9));

                this.mg.width = graph.screenWidth(tgraph.screenWidth(this.tpms.length * 2));
                this.mg.rescale();
                let index = 0;

                var ctx = this.canvas.getCTX('2d');

                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'black';
                ctx.fillStyle = 'black';
                ctx.color = 'black'
                ctx.font = "9px Arial";

                for (let o of this.tpms) {
                    if (o.value > 0) {

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';
                        ctx.lineWidth = 5;
                        ctx.shadowBlur = 2;
                        ctx.strokeStyle = 'blue';
                        ctx.beginPath();
                        ctx.moveTo(this.mg.X(index), this.mg.Y(this.mg.ymin));
                        ctx.lineTo(this.mg.X(index), this.mg.Y(o.value))
                        ctx.stroke();

                        let label = o.id;
                        if (label.length > 7) {
                            label = label.substring(0, 7)
                        }

                        ctx.fillText('' + label, this.mg.X(index)+4, this.mg.Y(this.mg.ymin));
                        index++;

                    }
                }
            }
        }

        let Expression = class Expression {

            plot = null;
            ensembl;
            tissues;
            failed = false;

            constructor(ensembl, tissues) {
                this.ensembl = ensembl;
                this.tissues = tissues;
            }
            async draw(y, tgraph, graph, canvas) {
                if (this.failed) {
                    return;
                }

                if ((this.plot == null)) {
                    const str = this.tissues.join(',');
                    let tissues_e = encodeURIComponent(str);
                    let ref = window['env']['apiUrl'] + `/get-cached-expression?sheet=B_RNA_tissue_median&cell_types=${tissues_e}&ensembl=${this.ensembl}`

                    let tpms = await GETJSON(ref);
                    if (!tpms) {
                        this.failed = true;
                        return;
                    }
                    let keys = Object.keys(tpms);
                    let t = []

                    let index = 0x00FFFF;

                    for (let k of keys) {

                        let colour = index;
                        if (colour > 0x1000000) {
                            colour = 0x00FFFF;
                        }
                        let hexCode = '#' + colour.toString(16).padStart(6, "0");

                        let label = k;
                        let check = label.indexOf('_-_')
                        if (check && check > 0)
                            label = label.substring(0, check)

                        t.push({
                            'id': label,
                            'value': tpms[k],
                            'color': hexCode
                        })
                        index++;
                    }

                    this.plot = new ExpressionTrackPlot(this.ensembl, 50, 0, 1, 1, 0, t.length, t);
                }

                if (this.plot)
                    this.plot.draw(y, tgraph, graph, canvas)

            }
        }
        return resolve(Expression)
    })
}

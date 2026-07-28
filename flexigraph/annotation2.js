function () {
    return new Promise(async (resolve, reject) => {
        let shapes = await exec('flexigraph/gene-draw2.js')

        const drawString45 = (ctx, str, x, y, color, font) => {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            if (!font) {
                font = "12px Arial";
            }
            if (ctx) {
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'black';
                if (!color) {
                    color = 'black'
                }
                ctx.font = font;
                ctx.fillStyle = color;

                let sx = (x);
                let sy = (y) - 5;

                ctx.save();

                ctx.translate(sx, sy);

                ctx.rotate(45 * Math.PI / 180);

                ctx.fillText(str, 0, 0);

                ctx.restore();

                ctx.stroke();
            }
        }

        let Annotation = class Annotation {
            name;
            type;
            xi;
            xf;
            labelY = 0;
            y = 0;
            color = 'lightGray';
            shapeFunction = null;
            annotations;
            strand;
            description;
            gxi;
            gxf;
            index = -1;
            showIndex = false;
            highlighted = false;
            highlightShapeFunction = null;

            constructor(_type, name, xi, xf, strand, annotations) {
                this.name = name;
                if (!this.name || this.name.length === 0) {
                    this.name = '' + _type
                }

                if (this.name.indexOf(':') > 0)
                    this.name = Annotation.removeExonPrefix(this.name);

                this.type = this.adjustType(_type);
                this.xi = xi;
                this.xf = xf;
                this.gxi = this.xi;
                this.gxf = this.xf;
                this.strand = strand;
                this.annotations = annotations;
                try {
                    this.shapeFunction = getIon(shapes[this.type])
                } catch (e) { }
                try {
                    this.highlightShapeFunction = getIon(shapes[this.type + '.highlight'])
                } catch (e) { }
            }
            static removeExonPrefix(str) {
                return str.split(':')[1];
            }

            adjustType(t) {
                if (t === 'exon') {
                    return 'Exon'
                }
                else if (t === 'start_codon') {
                    return "TSS"
                } else if (t === 'stop_codon') {
                    return "STOP"
                } else if (t === 'translation') {
                    return 'Translation'
                }
                return t;
            }

            setIndex(i) {
                this.index = i;
            }
            getIndex() {
                return this.index;
            }

            isSelected() {
                return this.highlighted;
            }
            select() {
                this.highlighted = true;
                try {
                    this.highlightShapeFunction = getIon(shapes[this.type + '.highlight'])
                } catch (e) { }

            }
            deselect() {
                this.highlighted = false;
            }
            setSelected(value) {
                this.highlighted = value;
            }

            inAnnotation(x) {
                if (x > this.xi && x <= this.xf) {
                    return true;
                } else {

                    return false;
                }
            }
            setF(newxf) {
                this.xf = newxf;
                this.gxf = newxf;
            }
            setI(newi) {
                this.xi = newi;
                this.gxi = newi;
            }
            setColor(color) {
                this.color = color;
            }
            drawPlot(pt, track, ctx) {
                let tgrid = track.grid;
                let grid = pt.grid;
                if (this.annotations) {
                    drawString45(ctx, '' + this.annotations, grid.X(tgrid.X(ti + ((tf - ti) / 2))), grid.Y(tgrid.Y(this.y + this.labelY)), 'black');
                }
                if (this.shapeFunction) {
                    this.shapeFunction(ctx, grid, tgrid, ((this.xi)), (this.xf), (this.y), this.color, this, this.strand);
                } else {
                    if (this.name.length > 4) {
                        let n = this.name.substring(0, 5) + '';
                        drawString45(ctx, '' + n, grid.X(tgrid.X(ti + ((tf - ti) / 2))), (this.y + this.labelY + 1.5), 'black', "9px Arial");
                    }
                    else {
                        drawString45('' + this.name, grid.X(tgrid.X(ti + ((tf - ti) / 2))), grid.Y(tgrid.Y(this.y + this.labelY + 1.5)), 'black', "9px Arial");
                    }
                }
                if (this.highlighted)
                    if (this.highlightShapeFunction) {
                        alert ( ' problem with highlight ')
                        this.highlightShapeFunction(graph, tgrid, (this.xi), (this.xf), (this.y), this.color, this, strand);
                    }
            }
        }
        resolve(Annotation)
    })
}

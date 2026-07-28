function () {
    return new Promise(async (resolve, reject) => {
        let shapes = await exec('flexigraph/gene-draw.js')

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
            showIndex = true;
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
            setF ( newxf ) {
                this.xf = newxf;
                this.gxf = newxf;
            }
            setI ( newi ) {
                this.xi = newi;
                this.gxi = newi;
            }
            setColor(color) {
                this.color = color;
            }
            async draw(graph, track) {

                let strand = track.strand;
                let tgrid = track.tgraph;
                tgrid.rescale();

                if (!this.gxf) {
                    this.gxf = this.xf;
                }
                if (!this.gxi) {
                    this.gxi = this.xi;
                }

                let tf = tgrid.X(this.xf)
                let ti = tgrid.X(this.xi)

                if (this.annotations) {
                    graph.drawString45('' + this.annotations, ti + ((tf - ti) / 2), tgrid.Y(this.y + this.labelY), 'black');
                }
                if (this.shapeFunction) {
                    this.shapeFunction(graph, tgrid, tgrid.X(this.xi), tgrid.X(this.xf), tgrid.Y(this.y), this.color, this, strand);
                } else {

                    if (this.name.length > 4) {
                        let n = this.name.substring(0, 5) + '';
                        graph.drawString45('' + n, ti + ((tf - ti) / 2), tgrid.Y(this.y + this.labelY + 1.5), 'black', "9px Arial");
                    }
                    else {
                        graph.drawString45('' + this.name, ti + ((tf - ti) / 2), tgrid.Y(this.y + this.labelY + 1.5), 'black', "9px Arial");
                    }

                }

                if (this.highlighted)
                    if (this.highlightShapeFunction) {
                        this.highlightShapeFunction(graph, tgrid, tgrid.X(this.xi), tgrid.X(this.xf), tgrid.Y(this.y), this.color, this, strand);

                    }

            }
        }
        resolve(Annotation)
    })
}

function () {

    return new Promise(async (resolve, reject) => {
        let chem_draw = await exec('flexigraph/chem-draw.js')
        function parseMutation(mutation) {
            const pattern = /^[cng]\.(\d+)([ACGT])>([ACGT])$/;
            const match = mutation.match(pattern);
            if (match) {
                const position = parseInt(match[1], 10);
                const originalNucleotide = match[2];
                const mutatedNucleotide = match[3];

                return {
                    position: position,
                    originalNucleotide: originalNucleotide,
                    mutatedNucleotide: mutatedNucleotide
                };
            } else {
                console.log(" mutation " + mutation);
                throw new Error('Invalid mutation syntax');
            }
        }

        let mutationAnnotation = class MutationAnnotation {
            name;
            id;
            xi;
            xf;
            y = Math.random() * 2;
            color;
            alternate;
            reference;
            position;
            detailedShapeFunction = null;
            shapeFunction = null;
            annotations;
            strand;
            type;
            structure = '';
            phase;
            transcriptStrand;

            constructor(type, xi, xf, name, phase, transcriptStrand, id) {
                this.type = type;
                this.transcriptStrand = transcriptStrand;
                this.xf = xf;
                this.xi = xi;
                this.phase = phase;

                if (this.phase == 1) {
                    this.y = Math.random() * (1)
                    this.color = 'red'
                } else {
                    this.y = Math.random() * (-1)
                    this.color = 'green'
                }
                if (!id) {
                    this.id = Math.round(new Date() / 1000) + '_' + this.xi + '_' + this.phase;
                } else {
                    this.id = id;
                }
                this.name = name;
                this.parseName()
            }
            parseText(text) {
                const parts = text.split(':');
                if (parts.length === 2) {
                    const name = parts[0].trim();
                    const alleleValue = parts[1].trim();
                    return { name, alleleValue };
                } else {
                    return { error: 'Invalid format' };
                }
            }

            parseName() {
                try {
                    console.log(" parse the name " + this.name);

                    if (!this.name || this.name.length === 0) {
                        this.name = ''
                    }

                    if (this.name.indexOf(':') > 0) {
                        let ob = this.parseText(this.name)
                        this.alternate = ob.alleleValue;
                    } else {
                        let mut = parseMutation(this.name);

                        if (mut) {
                            this.position = mut.position;
                            this.reference = mut.originalNucleotide;
                            this.alternate = mut.mutatedNucleotide;
                        }
                    }
                } catch (exception) {
                    console.log(exception)
                }
            }

            inAnnotation(x, y, graph, tgraph) {

                let scx = graph.X(x);
                let scy = graph.Y(y);

                let scxi = graph.X(tgraph.X(this.xi))
                let scxf = graph.X(tgraph.X(this.xf))
                let scyy = graph.Y(tgraph.Y(this.y))
                if (scy + 5 > scyy && scy - 5 < scyy) {
                    if (scx >= scxi && scx <= scxf) {
                        return true;
                    }
                }
                return false;
            }
            setColor(color) {
                this.color = color;
            }
            async draw(graph, tgraph, y) {
                if (!graph) {
                }
                if (this.y) {
                    y = this.y;
                }
                if (!this.shapeFunction)
                    this.shapeFunction = getIon(chem_draw[this.type])
                if (!this.detailedShapeFunction)
                    this.detailedShapeFunction = getIon(chem_draw[this.type + '.detailed'])
                let screencell = graph.screenWidth(tgraph.screenWidth(1))
                if (screencell > 5) {
                    let xs = tgraph.X(this.xi - 0.3)
                    let xf = tgraph.X(this.xf - 0.3)

                    if (this.shapeFunction && this.type == 'mutation-annotation') {
                        await graph.drawLine(tgraph.X(this.xi - 0.3),
                            tgraph.Y(y),
                            tgraph.X(this.xf - 0.3),
                            tgraph.Y(y),
                            'rgba(220,0,0,2)', 15, 'round')

                        this.shapeFunction(graph, tgraph.X(this.xi - 0.3), tgraph.X(this.xf - 0.3), tgraph.Y(y), this.color, this.phase);
                    }
                    else {
                        await graph.drawLine(tgraph.X(this.xi - 0.3),
                            tgraph.Y(y + 0.02),
                            tgraph.X(this.xf - 0.3),
                            tgraph.Y(y + 0.02),
                            'red', 10, 'round')
                        graph.drawVerticalLine(xs, y, 12, 'black')
                        graph.drawVerticalLine(xf, y, 12, 'black')
                    }
                } else {
                    if (this.detailedShapeFunction) {
                        this.detailedShapeFunction(graph, tgraph.X(this.xi), tgraph.X(this.xf), tgraph.Y(y), this.color);
                    } else {

                        graph.drawLine(tgraph.X(this.xi), tgraph.Y(y + 0.02), tgraph.X(this.xf), tgraph.Y(y + 0.02), 'red', 90, 'round')

                    }
                }
            }
            over(x, y, graph, tgraph) {
                if (graph == null) {
                    console.log(' Graph is null ');
                }
                if (tgraph == null) {
                    console.log(' tGraph is null ');
                    return;
                }
                let scx = graph.X(x);
                let scy = graph.Y(y);
                let scxi = graph.X(tgraph.X(this.xi))
                let scxf = graph.X(tgraph.X(this.xf))
                let scyy = graph.Y(tgraph.Y(this.y))
                if (scx >= scxi && scx <= scxf) {
                    return true;
                }
                return false;
            }

            async drawDetail(graph, tgraph, x, y) {
                if (this.y) {
                    y = this.y;
                }

                let seq_index = Math.floor(x) - this.xi;
                if (seq_index == 0) {
                    if (this.phase == 1) {

                        graph.drawString(this.name, tgraph.X(x)+1, tgraph.Y(y - 0.1), 'black', "20px Arial");

                    } else {
                        graph.drawString(this.name, tgraph.X(x)+1, tgraph.Y(y - 0.1), 'black', "20px Arial");

                    }
                }
            }
            async drawSequence(graph, tgraph, x, y) {
                if (this.y) {
                    y = this.y;
                }
                let seq_index = Math.floor(x) - this.xi;

            }
        }
        resolve(mutationAnnotation)

    })

}

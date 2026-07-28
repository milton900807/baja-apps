function () {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js')

        let RNASecondaryStructure = class RNASecondaryStructure {
            name = 'untitled';
            xi;
            xf;
            xw;

            xg;
            fix_to_graph = false;
            strand;
            color = 'rgb(153,159,198)';
            y = 1;
            annotations = [];
            oligos = [];
            snpindels = [];
            plots = [];
            sequence;
            markstart;
            markend;
            tgraph;
            showName = false;
            targetPhase = null;
            hideTrackCoords = true;
            showResizeBar = true;
            pos = [];
            selected_index = []
            highlightxi = -1;
            highlightxf = -1
            startx = 0;
            starty = 0;
            parentTrack = null;
            designs = []
            graph_transient_;
            anchorX = 0;
            anchorY = 0;
            xindex_start = 0;
            selected = false;
            fix_to_sequence_length = true;

            constructor(name, xi, xf, sequence, strand, parentTrack) {
                this.name = name;
                this.parentTrack = parentTrack;
                this.xi = xi;
                this.xf = xf;
                this.strand = strand;
                this.tgraph = new MGrid(0, 0, xf - xi, 2);
                this.tgraph.setInset(0, 0)
                this.tgraph.rescale();

                if (this.parentTrack && this.parentTrack.tgraph) {
                    this.y = this.parentTrack.tgraph.yi
                    this.fix_to_sequence_length = true;
                    this.tgraph.yi = this.parentTrack.height + this.parentTrack.tgraph.yi;

                }

                this.pos = [];
                this.sequence = sequence;
            }

            async calculateSecondaryStructure(em) {

                let res = await exec('py/bio/RNA/fold.py', em, this.sequence);
                if (res) {
                    em.setMSG("Structure complete.")
                    console.log('debubg');

                    this.pos = res;

                    if (this.pos && this.pos[0] && this.pos[0][0])
                        this.findMinMax();
                    else {
                        this.pos = null;
                    }
                } else {
                    console.log(" Failed to generate the secondary structure for the sequence ")
                }
            }

            setTrackCoordinates(start, end) {

            }

            highlightRange(xi, xf) {
                this.highlightxi = xi;
                this.highlightxf = xf
            }

            selectIndexRange(startIndex, endIndex) {

                this.startIndex = startIndex;
                this.endIndex = endIndex;
                if (this.parentTrack && startIndex) {
                    this.parentTrack.highlight(this.xi + this.parentTrack.xi + startIndex, this.xi + this.parentTrack.xi + endIndex)
                }
            }

            async setDesign(startIndex, endIndex) {
                if (!this.designs) {
                    this.designs = []
                    this.startIndex = -1;
                    this.endIndex = -1;
                }

                let chemistryObject = graph.props.selected_chemistry;
                graph_transient_.pushOntoHistory()
                let bioObject = {
                    'targetSequence': currentSequence,
                    'trackName': this.parentTrack.name,
                    'startIndex': start,
                    'strand': this.parentTrack.strand,
                    'endIndex': (end),
                    'y': (this.parentTrack.tgraph.ymax - currentY)
                }
                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                let ycoord = this.parentTrack.tgraph.ymax - ((this.parentTrack.tgraph.Ywc(this.parentTrack.tgraph.height - y)));
                compound.y = ycoord
                if (compound)
                    this.parentTrack.addOligo(compound)
            }

            findMinMax() {

                let coords = this.pos;
                if (!coords || coords.length === 0 || !coords[0] || !coords[0][0]) {
                    return;
                }

                let minX = coords[0][0];
                let maxX = coords[0][0];
                let minY = coords[0][1];
                let maxY = coords[0][1];

                for (let i = 1; i < coords.length; i++) {
                    if (coords[i][0] < minX) minX = coords[i][0];
                    if (coords[i][0] > maxX) maxX = coords[i][0];
                    if (coords[i][1] < minY) minY = coords[i][1];
                    if (coords[i][1] > maxY) maxY = coords[i][1];
                }

                let max = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY));
                max += (max * 0.2)
                this.tgraph.xmin = max * (-1);
                this.tgraph.xmax = max;
                this.tgraph.ymin = maxX * (-1);
                this.tgraph.ymax = max;
            }

            selectRange(startx, starty, x, y) {
                this.mx = x;
                this.my = y;

                if (this.sequence) {

                    let startIndex = this.getIndex(startx, starty)
                    let endIndex = this.getIndex(x, y)
                    if (this.parentTrack && startIndex) {
                        this.parentTrack.highlight(this.xi + this.parentTrack.xi + startIndex, this.xi + this.parentTrack.xi + endIndex)
                    }
                    this.selected_index[0] = startIndex;
                    this.selected_index[1] = endIndex;
                }
            }

            getIndex(x, y) {

                let potential = []

                for (let seq_index = 0; seq_index < this.sequence.length; seq_index++) {
                    if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                        let px = 0;
                        let py = 0;
                        if (this.pos[seq_index]) {

                            px = this.pos[seq_index][0];
                            py = this.pos[seq_index][1];

                            if (seq_index == 0) {
                                this.startx = px;
                                this.starty = py;
                            }

                            if (x + 15 >= px && x - 15 <= px && y + 15 >= py && y - 15 <= py) {

                                potential.push([px, py, seq_index])
                            }
                        }
                    }
                }

                let c;
                let index = 0;
                let closest;
                for (let p of potential) {
                    let d = this.getDistance(x, y, p[0], p[1])

                    if (index === 0) {
                        c = d;
                        closest = p;
                    }
                    else {
                        if (d < c) {
                            c = d;
                            closest = p;
                        }
                    }
                }

                if (!closest) {
                    console.log(" closest point not found " + closest)
                    return null;
                }

                return closest[2]
            }

            select(x, y) {
                this.mx = x;
                this.my = y;

                if (this.sequence) {
                    let potentail = []
                    for (let seq_index = 0; seq_index < this.sequence.length; seq_index++) {
                        if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                            let px = 0;
                            let py = 0;
                            if (this.pos[seq_index]) {

                                px = this.pos[seq_index][0];
                                py = this.pos[seq_index][1];

                                if (seq_index == 0) {
                                    this.startx = px;
                                    this.starty = py;
                                }

                                if (x + 10 >= px && x - 15 <= px && y + 15 >= py && y - 10 <= py) {

                                    potentail.push([px, py, seq_index])
                                }
                            }
                        }
                    }

                    let c;
                    let index = 0;
                    let closest;
                    for (let p of potentail) {
                        let d = this.getDistance(x, y, p[0], p[1])

                        if (index === 0) {
                            c = d;
                            closest = p;
                        }
                        else {
                            if (d < c) {
                                c = d;
                                closest = p;
                            }
                        }
                    }
                    if (this.parentTrack && closest) {
                        this.startIndex = closest[2];
                        this.endIndex = this.startIndex + 1;
                        this.parentTrack.highlight(this.xi + this.parentTrack.xi + closest[2], this.xi + this.parentTrack.xi + closest[2] + 1)
                    }
                }
            }

            getDistance(x1, y1, x2, y2) {
                let y = x2 - x1;
                let x = y2 - y1;

                return Math.sqrt(x * x + y * y);
            }

            calcCrow(lat1, lon1, lat2, lon2) {
                var R = 6371;
                var dLat = toRad(lat2 - lat1);
                var dLon = toRad(lon2 - lon1);
                var lat1 = toRad(lat1);
                var lat2 = toRad(lat2);

                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                var d = R * c;
                return d;
            }

            toRad(Value) {
                return Value * Math.PI / 180;
            }
            deselect() {
                this.selected_index = []
            }

            getSequence() {
                return this.sequence;
            }

            setColor(color) {
                this.color = color;
            }

            addOligo(oligo) {
                if (oligo === undefined) {
                    return;
                }

                this.oligos.push(oligo)
                if (oligo.y > this.tgraph.ymax) {
                    this.tgraph.ymax = oligo.y;
                }
            }

            highlight(v) {
                this.highlight__ = v;
                this.seleced = true;
            }

            add(annotation) {
                this.annotations.push(annotation)
            }

            async draw(graph, parentTrack, x, y, start, end) {
                if (end - start === 0) {
                    end = start + 1;
                }
                start = start - this.xindex_start;
                end = end - this.xindex_start;
                if (this.parentTrack && this.anchorX && this.anchorY) {
                    this.tgraph.xi = this.parentTrack.tgraph.X(this.anchorX);

                }
                let tmin = this.tgraph.xmin;
                let tmax = this.tgraph.xmax;

                if (this.fix_to_sequence_length) {
                    this.xw = graph.screenWidth(parentTrack.tgraph.screenWidth((this.sequence.length)));
                } else if (this.fix_to_graph) {
                    this.xw = graph.screenWidth(this.xg);
                }
                this.tgraph.height = graph.worldHeight(this.xw);
                this.tgraph.width = graph.worldWidth(this.xw);

                this.findMinMax();
                this.parentTrack = parentTrack;

                this.tgraph.rescale();
                if (!graph.inFrame(this.tgraph.xi, this.tgraph.yi, this.tgraph.width, this.tgraph.height)) {
                    return;
                }

                if (this.sequence) {
                    let ctx = graph.canvas.getCTX();
                    ctx.shadowColor = "black";
                    ctx.shadowBlur = 3;
                    ctx.font = 'bold 20px serif';
                    ctx.fillStyle = 'maroon';
                    ctx.strokeStyle = 'lightGreen';
                    ctx.lineWidth = 1;

                    ctx.shadowColor = "black";
                    ctx.shadowBlur = 1;
                    ctx.font = 'bold 20px serif';
                    ctx.fillStyle = 'maroon';
                    ctx.strokeStyle = 'rgba(200,200, 20, 0.2)';
                    ctx.lineWidth = 4;
                    let olist = this.parentTrack.oligos;

                    for (let o of olist) {
                        ctx.strokeStyle = o.color;
                        if (o.highlight__) {
                            ctx.strokeStyle = o.highlight__;
                        } else if (o.color) {
                            o.strokeStyle = o.color;
                        }
                        else {
                            o.strokeStyle = 'lightBlue`'
                        }

                        let index = o.xi - this.xindex_start;
                        let fndex = o.xf - this.xindex_start;
                        ctx.beginPath();
                        for (let i = index; i < fndex; i++) {
                            let p = this.pos[i]
                            if (p && p.length > 1) {
                                let pox = graph.X(this.tgraph.X(p[0]))
                                let poy = graph.Y(this.tgraph.Y(p[1]))
                                ctx.lineTo(pox, poy);
                            }
                        }
                        ctx.stroke();
                    }

                    let trs = graph.screenWidth(this.tgraph.screenWidth(1))

                    if (trs > 0.2) {
                        for (let seq_index = 0; seq_index < this.sequence.length; seq_index++) {
                            if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                                let px = seq_index;
                                let py = 0;
                                if (this.pos[seq_index]) {
                                    px = this.pos[seq_index][0];
                                    py = this.pos[seq_index][1];
                                }
                                if (!py) {
                                    py = 0;
                                }
                                else {
                                    let color = 'black';
                                    let font = '8px Arial'
                                    if (seq_index === 0) {
                                        color = 'blue'
                                        font = '10px Arial'
                                    }
                                    if (seq_index >= start && seq_index < end) {
                                        color = 'red'
                                        font = '12px Arial'
                                    }
                                    if (this.startIndex >= 0 && this.endIndex >= 0 && (this.endIndex - this.startIndex > 0)
                                        && seq_index >= this.startIndex && seq_index < this.endIndex) {
                                        color = 'magenta'
                                        font = '10px Arial'
                                    }
                                    if (px > tmax) {
                                        tmax = px;
                                    }
                                    if (px < tmin) {
                                        tmin = px;
                                    }

                                    graph.drawString(this.sequence[seq_index], this.tgraph.X(px), this.tgraph.Y(py), color, font);
                                }
                            }
                        }
                    } else {
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = 'maroon';
                        ctx.strokeStyle = 'lightGray';
                        ctx.lineWidth = 1;

                        ctx.beginPath();

                        for (let seq_index = 0; seq_index < this.sequence.length; seq_index += 5) {
                            if (seq_index < this.sequence.length && this.sequence[seq_index]) {
                                let px = seq_index;
                                let py = 0;
                                if (this.pos[seq_index]) {
                                    px = this.pos[seq_index][0];
                                    py = this.pos[seq_index][1];
                                }
                                if (!py) {
                                    py = 0;
                                }
                                else {
                                    let pox = graph.X(this.tgraph.X(px));
                                    let poy = graph.Y(this.tgraph.Y(py));
                                    ctx.lineTo(pox, poy);
                                }
                            }
                            ctx.stroke();
                        }

                    }

                }
                graph.drawString(this.name, this.tgraph.X(tmax + 2), this.tgraph.Y(this.tgraph.ymax / 5), 'blue');
                graph.dashedRect(graph.X(this.tgraph.xi), graph.Y(this.tgraph.yi) - graph.screenHeight(this.tgraph.height), graph.screenWidth(this.tgraph.width), graph.screenHeight(this.tgraph.height), 'lightGray', 1)

                if (this.selected) {
                    graph.drawScreenLine(graph.X(this.tgraph.xi + this.tgraph.width), graph.Y(this.tgraph.yi), graph.X(this.tgraph.xi + this.tgraph.width) - 40, graph.Y(this.tgraph.yi), 'lightBlue', 6)
                    graph.drawScreenLine(graph.X(this.tgraph.xi + this.tgraph.width), graph.Y(this.tgraph.yi), graph.X(this.tgraph.xi + this.tgraph.width), graph.Y(this.tgraph.yi) - 40, 'lightBlue', 6)
                }
            }

        }
        resolve(RNASecondaryStructure);
    });
}

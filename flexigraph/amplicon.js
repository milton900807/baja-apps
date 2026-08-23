function () {

    return new Promise(async (resolve, reject) => {

        function truncateFloat(input) {
            let numStr = input.toString();

            let decimalIndex = numStr.indexOf('.');

            if (decimalIndex !== -1 && numStr.length > decimalIndex + 3) {

                return parseFloat(numStr.substring(0, decimalIndex + 3));
            }

            return input;
        }

        function createUniqueIntegerId() {
            let timestamp = Date.now();
            let randomPart = Math.floor(Math.random() * 1000);
            let uniqueId = timestamp * 1000 + randomPart;
            return uniqueId;
        }

        // Normalize a primer/probe to plain A/C/G/T (upper, U->T, strip anything else).
        function cleanBases(seq) {
            return ('' + (seq || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
        }

        // GC content as a percentage of the A/C/G/T bases.
        function gcContent(seq) {
            let s = cleanBases(seq);
            if (!s.length) return null;
            let gc = 0;
            for (let c of s) if (c === 'G' || c === 'C') gc++;
            return (gc / s.length) * 100;
        }

        // Melting temperature (deg C). Wallace rule for short oligos (< 14 nt),
        // the basic GC formula (Marmur/Doty, salt-adjusted 64.9/41) for longer ones.
        function meltingTemp(seq) {
            let s = cleanBases(seq);
            let n = s.length;
            if (!n) return null;
            let gc = 0, at = 0;
            for (let c of s) {
                if (c === 'G' || c === 'C') gc++;
                else at++;
            }
            if (n < 14) return 2 * at + 4 * gc;
            return 64.9 + 41 * (gc - 16.4) / n;
        }

        class Amplicon {
            left;
            right;
            mid;
            mid2;
            anyTH;
            endTH;
            size;
            productTM;
            name;
            id;
            xi;
            xf;
            y = 0;
            outColor = 'lightBlue';
            inColor = 'yellow';
            color = 'black';
            detailedShapeFunction = null;
            shapeFunction = null;
            annotations;
            strand;
            type = 'amplicon'
            info;
            structure = '';
            percent_control;
            synthesisSequence = 'NA'
            selected = false;
            ampColor = 'yellow';
            oligColor = 'blue';
            highlight__ = false;

            constructor(leftOligo, rightOligo, midOligo) {
                if (leftOligo && rightOligo) {
                    this.id = createUniqueIntegerId()
                    this.left = leftOligo;
                    this.right = rightOligo;
                    this.xi = this.left.xi;
                    this.xf = this.right.xi + this.right.xf
                    this.name = this.xi + ':' + this.xf;

                    if (leftOligo.tm && rightOligo.tm) {
                        this.name += '(' + parseInt(leftOligo.tm) + ',' + parseInt(rightOligo.tm) + ')';
                    }

                } else {
                    this.name = 'unknown location'
                }
                if (this.midOligo)
                    this.mid = midOligo;
            }

            setSelected(value) {
                this.selected = value;
            }

            async setStrand(strand) {
                let Biopolymer = await exec('baja/chem/biopolymer.js');

                this.strand = strand;
                this.left.setStrand(this.strand)
                this.right.setStrand(this.strand)
                if (this.strand < 0) {
                    this.left.synthesisSequence = this.left.sequence
                    this.right.synthesisSequence = (this.right.sequence)
                } else {
                    this.left.synthesisSequence = (this.left.sequence)
                    this.right.synthesisSequence =(this.right.sequence)
                }
            }
            setSynthesisSeq(track) {
                this.setStrand(track.strand);
            }

            over(x, y, graph, tgraph) {
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

            inAnnotation(x, y, graph, tgraph) {

                if (graph == null || tgraph == null) {
                    return;
                }

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

            highlight(delay, color) {
                this.highlight__ = 'magenta';
                this.ampColor = 'cyan'
                if (color) {
                    this.highlight__ = color;
                }
                if (delay && delay > 0) {
                    setTimeout(() => {
                        this.ampColor = 'yellow'
                        this.highlight__ = false;
                    }, delay)
                }
            }

            getWidth() {
                return Math.abs(this.right.xf - this.left.xi)
            }
            getHeight() {
                return 0.07
            }
            setY(y) {

                this.y = y;
                this.left.y = y;
                this.right.y = y;
            }

            drawDetail(graph, tgraph, x, y) {

            }

            async draw(graph, tgraph, y) {
                // Recompute GC% and Tm for each primer/probe on every redraw so they
                // always reflect the current sequence (e.g. after edits or trimming).
                for (let part of [this.left, this.right, this.mid]) {
                    if (!part) continue;
                    let seq = part.sequence || part.synthesisSequence;
                    let gc = gcContent(seq);
                    let tm = meltingTemp(seq);
                    if (gc != null) part.gc = gc;
                    if (tm != null) part.tm = tm;
                }
                if (graph && graph.canvas) {
                    let ctx = graph.canvas.getCTX();
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 2;
                    ctx.font = 'bold 20px serif';
                    ctx.fillStyle = 'lightGray';

                }

                if (this.selected) {
                    this.ampColor = 'magenta'
                }

                let ampColor = this.ampColor;
                // Lasso selection highlight — recolor the amplicon bar cyan (uses
                // highlight__ so a stray canvas click / deselectAllTracks doesn't
                // clear it, matching how oligos stay highlighted).
                if (this.highlight__) {
                    ampColor = (this.highlight__ === true) ? 'cyan' : this.highlight__;
                }
                let oligColor = this.oligColor;

                let canvas = graph.canvas;
                if (canvas != null) {
                    let ctx = canvas.getCTX();
                    ctx.font = '11px Arial';
                    ctx.lineWidth = 0;
                    ctx.fillStyle = 'black';

                    let rxi = graph.X(tgraph.X(this.right.xi));
                    let ys = graph.Y(tgraph.Y(this.y));
                    let rxf = graph.X(tgraph.X(this.right.xf));
                    let lxi = graph.X(tgraph.X(this.left.xi));

                    if (this.left && this.left['tm']) {
                        let lxf = graph.X(tgraph.X(this.left.xf));

                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = 'black';
                        ctx.fillText('tm:' + truncateFloat(this.left['tm']), lxi - 40, ys - 23);

                    }

                    if (this.right && this.right['tm']) {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = 'black';
                        ctx.fillText('tm:' + truncateFloat(this.right['tm']), rxf + 10, ys - 23);

                    }

                    if (this.left && this.left['gc']) {

                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = 'black';
                        ctx.fillText('gc' + truncateFloat(this.left['gc']), lxi - 40, ys - 12);

                    }

                    if (this.right && this.right['gc']) {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.fillStyle = 'black';
                        ctx.fillText('gc' + truncateFloat(this.right['gc']), rxf + 10, ys - 12);

                        if ( this.right.offtarget ){
                            this.right.y = this.y;
                            this.right.showOfftargets = true;

                            this.right.draw(graph, tgraph, y);
                        }

                    }

                    if ( this.left && this.left.offtarget ){
                        this.left.showOfftargets = true;

                        this.left.y = this.y;
                        this.left.draw(graph, tgraph, y);
                    }

                    if ( this.mid && this.mid.offtarget ){

                        this.mid.showOfftargets = true;
                        this.mid.y = this.y;
                        this.mid.draw ( graph, tgraph, y );

                    }

                    let screencell = graph.screenWidth(tgraph.screenWidth(1));
                    if (screencell > 1) {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        if (this.mid && this.mid.xi){
                            graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), 'rgba(250,10,10,0.5)', 30, 'round');
                        }

                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), oligColor, 10, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), oligColor, 10, 'round');
                    } else {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), oligColor, 7, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), oligColor, 7, 'round');
                        if (this.mid && this.mid.xi){
                            graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), 'magenta', 7, 'round');
                        }

                    }

                    if (this.strand < 0) {
                        let xFivePrimeNeg = graph.X(tgraph.X(this.left.xi));
                        let yNeg = graph.Y(tgraph.Y(this.y));
                        let circleDiameter = 0;
                        let textWidth = ctx.measureText("5'").width;
                        let textX = xFivePrimeNeg + (circleDiameter - textWidth) / 2;
                        let textY = yNeg + circleDiameter / 2 + 5;
                        ctx.fillText("5'", textX - 4, textY);

                    } else {
                        let xFivePrime = graph.X(tgraph.X(this.right.xf));
                        let ys = graph.Y(tgraph.Y(this.y));
                        let circleDiameter = 0;
                        let textWidth = ctx.measureText("5'").width;
                        let textX = xFivePrime - (circleDiameter - textWidth) / 2;
                        let textY = ys + circleDiameter / 2 + 5;
                        ctx.fillStyle = 'black';
                        ctx.fillText("5'", textX, textY);
                        if (this.right.synthesisSequence) {

                        }

                    }

                }

            }

            drawIcon(graph, tgraph) {
                let ampColor = this.ampColor;
                let oligColor = this.oligColor;

                if (this.selected) {
                    this.ampColor = 'magenta'
                }

                graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 1, 'round');
                graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), oligColor, 2, 'round');
                graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), oligColor, 2, 'round');
            }

        }
        return resolve(Amplicon);
    })
}

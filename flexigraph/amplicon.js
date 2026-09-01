function () {

    return new Promise(async (resolve, reject) => {

        // A small rounded chip carrying a primer's metrics, in the same palette as the rest
        // of the app's chrome (navy text on a pale ground, thin border) -- see the track tab
        // in baja/bio/track-flexi.js. The accent is the primer's own colour, so a chip is
        // read against the primer it belongs to without repeating its name.
        //
        // Returns the box it occupied, so the caller can keep two chips from colliding.
        function drawMetricChip(ctx, text, x, yBottom, accent, align) {
            if (!text) return null;
            ctx.save();
            ctx.font = '10px Arial, Helvetica, sans-serif';
            const padX = 6, h = 14, r = 4;
            const w = ctx.measureText(text).width + padX * 2;
            const left = (align === 'right') ? (x - w) : x;
            const top = yBottom - h;

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            ctx.beginPath();
            ctx.moveTo(left + r, top);
            ctx.lineTo(left + w - r, top);
            ctx.quadraticCurveTo(left + w, top, left + w, top + r);
            ctx.lineTo(left + w, top + h - r);
            ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
            ctx.lineTo(left + r, top + h);
            ctx.quadraticCurveTo(left, top + h, left, top + h - r);
            ctx.lineTo(left, top + r);
            ctx.quadraticCurveTo(left, top, left + r, top);
            ctx.closePath();
            ctx.fillStyle = 'rgba(245,248,251,0.95)';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = accent || 'rgba(11,37,69,0.35)';
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#0b2545';
            ctx.fillText(text, left + padX, top + h / 2 + 0.5);
            ctx.restore();
            return { left: left, right: left + w, top: top, bottom: top + h };
        }

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
                // The block that used to sit here set a drop shadow, 'bold 20px serif' and a
                // light-grey fill on the shared context and drew nothing with them. Every
                // label below then had to undo the shadow by hand before it could be read.
                // Each piece of text now sets what it needs and restores the context.


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
                // Amplicon color scheme: forward primer (left) green, reverse primer
                // (right) red, center amplicon (mid) maroon.
                const FWD_COLOR = '#2e9e44';                 // forward primer — green
                const REV_COLOR = '#d1342f';                 // reverse primer — red
                const MID_COLOR = 'rgba(128,0,0,0.55)';      // center amplicon — maroon (thick)
                const MID_COLOR_THIN = '#800000';            // center amplicon — maroon (thin)

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

                    // Tm and GC for a primer belong together and belong ON the primer. They
                    // were four separate runs of bare black text pinned 40px outside the
                    // amplicon (lxi - 40, rxf + 10), so they floated away from what they
                    // described, collided with each other on a short amplicon, and read as
                    // 'gc45' with no unit. One chip per primer now sits above its own span.
                    const metrics = (part) => {
                        if (!part) return '';
                        const bits = [];
                        if (part['tm']) bits.push('Tm ' + truncateFloat(part['tm']) + '°C');
                        if (part['gc']) bits.push('GC ' + truncateFloat(part['gc']) + '%');
                        return bits.join('  ·  ');
                    };
                    // Anchored INSIDE the amplicon: the forward chip from the left primer's
                    // start, the reverse chip back from the right primer's end. A short
                    // amplicon would overlap them, so the reverse chip steps up a row.
                    const fwdBox = drawMetricChip(ctx, metrics(this.left), lxi, ys - 12, FWD_COLOR, 'left');
                    let revY = ys - 12;
                    const revText = metrics(this.right);
                    if (fwdBox && revText) {
                        ctx.save();
                        ctx.font = '10px Arial, Helvetica, sans-serif';
                        const revW = ctx.measureText(revText).width + 12;
                        ctx.restore();
                        if ((rxf - revW) < fwdBox.right + 4) revY = ys - 28;
                    }
                    drawMetricChip(ctx, revText, rxf, revY, REV_COLOR, 'right');

                    // Was nested inside `if (this.right['gc'])`, so the reverse primer's
                    // off-targets only drew when its GC happened to be truthy -- while the
                    // left and mid blocks below draw theirs unconditionally. Made symmetric.
                    if ( this.right && this.right.offtarget ){
                        this.right.y = this.y;
                        this.right.showOfftargets = true;
                        this.right.draw(graph, tgraph, y);
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

                    // The amplicon length is the number a primer pair is judged on, and it was
                    // nowhere on the drawing. Centred on the body, and only when the body is
                    // wide enough to hold the chip without covering the primers.
                    try {
                        const ampBp = Math.abs(Math.round(this.right.xf - this.left.xi));
                        if (ampBp > 0) {
                            const spanPx = Math.abs(rxf - lxi);
                            const txt = ampBp + ' bp';
                            ctx.save();
                            ctx.font = '10px Arial, Helvetica, sans-serif';
                            const need = ctx.measureText(txt).width + 12;
                            ctx.restore();
                            if (spanPx > need + 24) {
                                drawMetricChip(ctx, txt, (lxi + rxf) / 2 - need / 2, ys + 26,
                                    'rgba(128,0,0,0.55)', 'left');
                            }
                        }
                    } catch (e) { }

                    let screencell = graph.screenWidth(tgraph.screenWidth(1));
                    if (screencell > 1) {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        if (this.mid && this.mid.xi){
                            graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), MID_COLOR, 30, 'round');
                        }

                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), FWD_COLOR, 10, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), REV_COLOR, 10, 'round');
                    } else {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), FWD_COLOR, 7, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), REV_COLOR, 7, 'round');
                        if (this.mid && this.mid.xi){
                            graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), MID_COLOR_THIN, 7, 'round');
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

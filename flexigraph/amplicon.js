function () {

    return new Promise(async (resolve, reject) => {

        // A small rounded chip carrying a primer's metrics, in the same palette as the rest
        // of the app's chrome (navy text on a pale ground, thin border) -- see the track tab
        // in baja/bio/track-flexi.js. The accent is the primer's own color, so a chip is
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
                // THE PROBE. This read `if (this.midOligo)` -- a property no Amplicon has
                // ever had, so the test was always false and the third oligo of every
                // TaqMan set was dropped on the floor at construction. Everything
                // downstream that handles a probe (the maroon bar below, its off-targets,
                // the export's probe column, the design summary, the off-target scan's
                // [left, right, mid] loop) was therefore dead code: correct, and never
                // reached. Passing a probe in now keeps it.
                if (midOligo) this.mid = midOligo;
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
                // PREFER THE DESIGNER'S NUMBERS; RECOMPUTE ONLY WHEN THE SEQUENCE HAS MOVED ON.
                //
                // This overwrote tm/gc on every redraw with the Wallace/Marmur estimate
                // below, throwing away primer3's nearest-neighbour Tm. Two degrees out is
                // tolerable on a primer. It is not on a hydrolysis probe, whose entire
                // design constraint is sitting several degrees ABOVE the primers -- read
                // off the estimate, a good probe and a useless one look alike. The designer
                // stamps designTmSeq with the sequence its numbers describe, so an oligo
                // that was since edited or trimmed still falls back to the estimate, which
                // is the case the recompute existed for.
                for (let part of [this.left, this.right, this.mid]) {
                    if (!part) continue;
                    let seq = part.sequence || part.synthesisSequence;
                    if (part.designTmSeq && part.designTmSeq === seq) continue;
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
                const MID_COLOR = '#800000';                 // hydrolysis probe — maroon
                const MID_COLOR_THIN = '#800000';            // hydrolysis probe — maroon (thin)

                // ONE test for "is there a probe on this set", used by every branch below.
                // Oligo.copy() builds `mid` unconditionally, so a SYBR amplicon that has been
                // copied carries an EMPTY Oligo rather than nothing -- truthy, with no xi and
                // no sequence. Testing `this.mid` alone would draw a zero-length maroon stud
                // at the origin and print a chip with no numbers in it.
                const hasProbe = !!(this.mid && this.mid.xi != null && this.mid.xf != null
                    && (this.mid.xf > this.mid.xi));

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

                    if ( hasProbe && this.mid.offtarget ){

                        this.mid.showOfftargets = true;
                        this.mid.y = this.y;
                        this.mid.draw ( graph, tgraph, y );

                    }

                    // The amplicon length is the number a primer pair is judged on, and it was
                    // nowhere on the drawing. Centerd on the body, and only when the body is
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

                    // THE PROBE'S OWN CHIP.
                    //
                    // The two primers each got one; the probe got none, so the oligo whose
                    // numbers decide whether a TaqMan assay works was the one part of the
                    // drawing carrying no numbers. What matters for a probe is not its Tm in
                    // isolation but its Tm RELATIVE to the primers -- the design rule is
                    // several degrees above them, and a probe that melts with the primers is
                    // consumed before it can report -- so the difference is computed here
                    // rather than left for the reader to do in their head off two other chips.
                    //
                    // Below the body, clear of the bp chip, and centerd on the probe itself so
                    // it points at what it describes.
                    try {
                        if (hasProbe) {
                            const bits = [];
                            if (this.mid.tm) bits.push('Probe Tm ' + truncateFloat(this.mid.tm) + '°C');
                            if (this.mid.gc) bits.push('GC ' + truncateFloat(this.mid.gc) + '%');
                            const lt = +this.left.tm, rt = +this.right.tm, pt = +this.mid.tm;
                            if (isFinite(lt) && isFinite(rt) && isFinite(pt) && lt && rt && pt) {
                                const d = pt - (lt + rt) / 2;
                                bits.push('ΔTm ' + (d >= 0 ? '+' : '') + truncateFloat(d));
                            }
                            // Longest form that fits, rather than all-or-nothing. A single
                            // width test drops the chip entirely at any zoom that cannot hold
                            // the full line, which is most of them -- and the reader loses the
                            // fact that there IS a probe along with its numbers. The shortest
                            // form is one word, so a probe is named wherever there is room to
                            // name it, and only a genuinely cramped amplicon gets nothing.
                            const forms = [bits.join('  ·  ')];
                            if (bits.length > 1) forms.push(bits[0] + '  ·  ' + bits[bits.length - 1]);
                            if (bits.length > 0) forms.push(bits[0]);
                            forms.push('probe');
                            const mxi = graph.X(tgraph.X(this.mid.xi));
                            const mxf = graph.X(tgraph.X(this.mid.xf));
                            const room = Math.abs(rxf - lxi);
                            ctx.save();
                            ctx.font = '10px Arial, Helvetica, sans-serif';
                            let ptxt = null, pneed = 0;
                            for (const f of forms) {
                                if (!f) continue;
                                const w = ctx.measureText(f).width + 12;
                                if (room > w + 24) { ptxt = f; pneed = w; break; }
                            }
                            ctx.restore();
                            if (ptxt) {
                                drawMetricChip(ctx, ptxt, (mxi + mxf) / 2 - pneed / 2, ys + 44,
                                    MID_COLOR, 'left');
                            }
                        }
                    } catch (e) { }

                    let screencell = graph.screenWidth(tgraph.screenWidth(1));
                    if (screencell > 1) {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        // The probe, at the SAME WEIGHT as the two primers. It was a 30px
                        // translucent band -- six times their thickness -- which read as a
                        // highlight laid over the amplicon rather than as the third oligo of
                        // the assay, and buried the sequence underneath it. It is an oligo
                        // that gets ordered and synthesised like the other two, so it is
                        // drawn like them, in maroon.
                        if (hasProbe){
                            graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), MID_COLOR, 10, 'round');
                        }

                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), FWD_COLOR, 10, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), REV_COLOR, 10, 'round');
                    } else {
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), ampColor, 5, 'round');
                        graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.left.xf), tgraph.Y(this.y), FWD_COLOR, 7, 'round');
                        graph.drawStrokeLine(tgraph.X(this.right.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), REV_COLOR, 7, 'round');
                        if (hasProbe){
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

            // The LOW-DETAIL rendering, used when the view is zoomed out (see the else branch
            // in baja/bio/track-flexi.js). One line for the amplicon span, nothing else.
            //
            // It used to overdraw the span with a blue bar at each primer end, and recolor the
            // whole thing magenta on selection. Against the detailed draw() -- which already
            // shows the primers in green and red -- that read as a SECOND, differently-colored
            // primer graphic sitting on the first. At this zoom the useful information is where
            // the amplicon is, not what its ends are made of.
            drawIcon(graph, tgraph) {
                graph.drawStrokeLine(tgraph.X(this.left.xi), tgraph.Y(this.y), tgraph.X(this.right.xf), tgraph.Y(this.y), this.ampColor, 1, 'round');
                // A probe-based set and a SYBR set are different assays that get ordered
                // differently, and at this zoom they were indistinguishable -- one line
                // either way. A maroon stud over the probe span is enough to tell them
                // apart while scanning a track, and costs one stroke.
                if (this.mid && this.mid.xi != null && this.mid.xf > this.mid.xi) {
                    graph.drawStrokeLine(tgraph.X(this.mid.xi), tgraph.Y(this.y), tgraph.X(this.mid.xf), tgraph.Y(this.y), '#800000', 3, 'round');
                }
            }

        }
        return resolve(Amplicon);
    })
}

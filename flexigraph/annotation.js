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

                // The exon's own label (its number). Hidden when the track says so; drawn when
                // the track is silent, so a track that never heard of the flag is unaffected.
                let __showExonNums = true;
                try { if (track && track.showExonNumbers === false) __showExonNums = false; } catch (e) { }
                if (this.annotations && __showExonNums) {
                    graph.drawString45('' + this.annotations, ti + ((tf - ti) / 2), tgrid.Y(this.y + this.labelY), 'black');
                }
                if (this.shapeFunction) {
                    this.shapeFunction(graph, tgrid, tgrid.X(this.xi), tgrid.X(this.xf), tgrid.Y(this.y), this.color, this, strand);
                }
                // Show the annotation's NAME as a label ABOVE the bar, connected by a dashed, very
                // thin, faint light-gray leader — placed above the peptide/AA sequence row, stacked
                // by lane (track.js) so neighbours don't overlap, and kept within the track height.
                // Shapes that render their own label are skipped so the name isn't drawn twice.
                const __ty = '' + (this.type || '');
                const __SELF = { 'PointOfInterest': 1, 'TSS': 1, 'STOP': 1, 'Translation': 1, 'CDS': 1, 'AA': 1, 'Exon': 1 };
                if (this.name && !__SELF[__ty] && __ty.indexOf('cdd-') !== 0) {
                    try {
                        const gctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
                        const cx = graph.X(ti + ((tf - ti) / 2));
                        const cyBar = graph.Y(tgrid.Y(this.y));
                        const screencell = graph.screenWidth(tgrid.screenWidth(1));
                        let pepClear = 4;
                        if (screencell > 5) pepClear = Math.max(11, Math.min(Math.round(screencell * 0.8), 44)) + 12;
                        const trackHpx = Math.abs(graph.screenHeight ? graph.screenHeight(tgrid.height) : 46) || 46;
                        const lane = Math.max(0, this.__labelLane | 0);
                        const base = (this.__laneBasePx != null) ? this.__laneBasePx : 12;
                        const step = (this.__laneStepPx != null) ? this.__laneStepPx : 16;
                        let up = base + lane * step;
                        const maxUp = Math.max(8, trackHpx - pepClear - 4);
                        if (up > maxUp) up = maxUp;
                        const ly = cyBar - pepClear - up;
                        // Leader ends at the amino-acid letter (peptide row) it refers to, not the
                        // track baseline.
                        let footY = cyBar;
                        if (screencell > 5 && tgrid && tgrid.__pepTopPx != null) footY = tgrid.__pepTopPx;
                        // Skip this name if its box would overlap a name already drawn this frame.
                        const __label = ('' + this.name).slice(0, 46);
                        let __w = __label.length * 5.4;
                        if (gctx) { try { gctx.font = '9px system-ui, -apple-system, Roboto, Arial, sans-serif'; __w = gctx.measureText(__label).width; } catch (e) { } }
                        const __rects = (tgrid.__labelRects = tgrid.__labelRects || []);
                        const __bx0 = cx - __w / 2 - 1, __bx1 = cx + __w / 2 + 1, __by0 = ly - 6, __by1 = ly + 6;
                        let __ov = false;
                        for (const __r of __rects) { if (__bx0 < __r.x1 && __bx1 > __r.x0 && __by0 < __r.y1 && __by1 > __r.y0) { __ov = true; break; } }
                        if (!__ov) {
                            __rects.push({ x0: __bx0, y0: __by0, x1: __bx1, y1: __by1 });
                            if (gctx) {
                                gctx.save();
                                gctx.strokeStyle = 'rgba(148,163,184,0.35)'; gctx.lineWidth = 0.5;
                                try { gctx.setLineDash([2, 2]); } catch (e) { }
                                gctx.beginPath(); gctx.moveTo(cx, footY); gctx.lineTo(cx, ly + 5); gctx.stroke();
                                try { gctx.setLineDash([]); } catch (e) { }
                                gctx.restore();
                            }
                            // Name sits at the TOP END of the dashed leader, centered on the line.
                            graph.drawScreenText(__label, cx, ly, '#0a2540', 9, 'center');
                        }
                    } catch (e) { }
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

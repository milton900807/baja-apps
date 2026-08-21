function () {

    return new Promise(async (resolve, reject) => {
        let chem_draw = await exec('flexigraph/chem-draw.js')

        const SIRNA = await exec('flexigraph/sirna.js')
        let Amplicon = await exec('flexigraph/amplicon.js')

        const ASO = await exec('baja/chem/structure/ASO.js')

        function createUniqueIntegerId() {
            return uniqueInt();
        }

        let Oligo = class Oligo {

            name;
            id;
            xi;
            xf;
            y;

            color = 'navy';
            detailedShapeFunction = null;
            shapeFunction = null;
            annotations;
            strand;
            type = 'aso';
            structure = '';
            linkSnpindels = [];
            synthesisSequence = null;
            filter = null;
            filterexp = [];
            ruleexp = [];
            offtarget = null;
            offtargetsymbols = null;
            mismatch = [];
            selected = false;
            percent_control;
            sequence;
            highlight__ = false;
            libID = null;
            showOfftargets = true;
            status;
            regid = -1;
            tm = null;

            // General label system
            showLabel = false;
            labelAttribute = null;       // examples: "id", "status", "tm.adjusted_tm_c", "name"
            labelPrefix = "";            // examples: "Tm: "
            labelOffsetY = 0;            // centered on oligo by default
            labelTextColor = "maroon";
            labelFillColor = "white";
            labelStrokeColor = "black";
            labelFont = "10px Arial";

            constructor(type, name, structure, xi, xf, y) {
                this.y = y;

                if (!this.id) {
                    this.id = createUniqueIntegerId();
                }
                if (!this.date) {
                    this.date = new Date().getTime().toString() + '.' + Math.random().toString().replace('.', '');
                }

                this.structure = structure;
                this.type = type;
                this.name = name;
                this.sequence = name;
                this.xi = xi;
                this.xf = xf;
            }

            setY(y) {
                this.y = y;
            }

            getWidth() {
                return Math.abs(this.xf - this.xi);
            }

            getHeight() {
                return 0.112;
            }

            hashOligo() {
                let hash = 0;
                let chr = null;

                if (
                    this.sequence == undefined ||
                    this.sequence == null ||
                    this.sequence.length === 0
                ) {
                    return hash;
                }

                for (let i = 0; i < this.sequence.length; i++) {
                    chr = this.sequence.charCodeAt(i);
                    hash = ((hash << 5) - hash) + chr;
                    hash |= 0;
                }

                return hash;
            }

            over(x, y, graph, tgraph) {
                let scx = graph.X(x);
                let scy = graph.Y(y);
                let scxi = graph.X(tgraph.X(this.xi));
                let scxf = graph.X(tgraph.X(this.xf));
                let scyy = graph.Y(tgraph.Y(this.y));

                if (scy + 5 > scyy && scy - 5 < scyy) {
                    if (scx >= scxi && scx <= scxf) {
                        return true;
                    }
                }
                return false;
            }

            setSelected(v) {
                this.selected = v;
            }

            inAnnotation(x, y, graph, tgraph) {
                if (!graph || !tgraph) {
                    return;
                }

                let scx = graph.X(x);
                let scy = graph.Y(y);
                let scxi = graph.X(tgraph.X(this.xi));
                let scxf = graph.X(tgraph.X(this.xf));
                let scyy = graph.Y(tgraph.Y(this.y));

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

            setLabelAttribute(attributePath, opts = {}) {
                this.labelAttribute = attributePath;
                this.showLabel = !!attributePath;

                if (opts.prefix !== undefined) this.labelPrefix = opts.prefix;
                if (opts.offsetY !== undefined) this.labelOffsetY = opts.offsetY;
                if (opts.textColor !== undefined) this.labelTextColor = opts.textColor;
                if (opts.fillColor !== undefined) this.labelFillColor = opts.fillColor;
                if (opts.strokeColor !== undefined) this.labelStrokeColor = opts.strokeColor;
                if (opts.font !== undefined) this.labelFont = opts.font;
            }

            clearLabelAttribute() {
                this.showLabel = false;
                this.labelAttribute = null;
                this.labelPrefix = "";
            }

            getAttributeValue(path) {
                if (!path || typeof path !== "string") return undefined;

                const parts = path.split(".");
                let current = this;

                for (const part of parts) {
                    if (current == null || typeof current !== "object") {
                        return undefined;
                    }
                    current = current[part];
                }

                return current;
            }

            getDisplayLabelValue() {
                if (!this.showLabel || !this.labelAttribute) {
                    return null;
                }

                const value = this.getAttributeValue(this.labelAttribute);

                if (value == null) return null;

                if (typeof value === "object") {
                    try {
                        return this.labelPrefix + JSON.stringify(value);
                    } catch {
                        return this.labelPrefix + String(value);
                    }
                }

                const text = String(value).trim();
                if (!text) return null;

                return this.labelPrefix + text;
            }

            highlight(delay, color) {
                this.highlight__ = 'magenta';

                if (color) {
                    this.highlight__ = color;
                }

                if (delay && delay > 0) {
                    setTimeout(() => {
                        this.highlight__ = false;
                    }, delay);
                }
            }

            async draw(graph, tgraph, y) {
                if (!graph || !graph.canvas) {
                    return;
                }

                if (this.y != null) {
                    y = this.y;
                }

                const ctx = graph.canvas.getCTX();
                if (!ctx) {
                    return;
                }

                if (!this.shapeFunction) {
                    this.shapeFunction = getIon(chem_draw[this.type]);
                }
                if (!this.detailedShapeFunction) {
                    this.detailedShapeFunction = getIon(chem_draw[this.type + '.detailed']);
                }

                const screenX1 = graph.X(tgraph.X(this.xi));
                const screenX2 = graph.X(tgraph.X(this.xf));
                const screenY = graph.Y(tgraph.Y(y));
                const screenMidX = (screenX1 + screenX2) / 2;

                // Selected oligos get a pulsing background glow. The pulse (0..1) is
                // computed by the genegraph redraw loop (graph.__pulse) at 1 cycle/sec
                // for its 100ms/10fps refresh; the loop is kept awake while selected.
                if ((this.selected || this.highlight__) && ctx) {
                    const pulse = (typeof graph.__pulse === 'number') ? graph.__pulse : 0.6;
                    const x0 = Math.min(screenX1, screenX2), x1 = Math.max(screenX1, screenX2);
                    const cx = (x0 + x1) / 2;
                    const rx = Math.max((x1 - x0) / 2 + 10, 16) + 6 * pulse;
                    const ry = 14 + 6 * pulse;
                    const alpha = 0.12 + 0.5 * pulse;   // pulse ~0.12 .. ~0.62
                    // Match the glow to the oligo's highlight color (falls back to the
                    // cyan "selected" color when there is no explicit highlight color).
                    const toRGB = (c) => {
                        if (typeof c !== 'string') return null;
                        const s = c.trim().toLowerCase();
                        const named = { magenta: [255, 0, 255], cyan: [0, 255, 255], red: [255, 0, 0], maroon: [128, 0, 0], navy: [10, 37, 64], yellow: [255, 230, 0], lime: [0, 255, 0], green: [0, 128, 0], orange: [255, 165, 0] };
                        if (named[s]) return named[s];
                        let m = s.match(/^#([0-9a-f]{3})$/);
                        if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
                        m = s.match(/^#([0-9a-f]{6})$/);
                        if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
                        m = s.match(/^rgba?\(([^)]+)\)/);
                        if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
                        return null;
                    };
                    const hlColor = (typeof this.highlight__ === 'string' && this.highlight__) ? this.highlight__ : '#1aa3bd';
                    const rgb = toRGB(hlColor) || [26, 163, 189];
                    ctx.save();
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    const grad = ctx.createRadialGradient(cx, screenY, 2, cx, screenY, rx);
                    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);   // highlight-colored core
                    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.ellipse(cx, screenY, rx, ry, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                const screencell = graph.screenWidth(tgraph.screenWidth(1));

                const drawCenteredOvalLabel = (text, offsetY = 0, opts = {}) => {
                    if (text == null) return;

                    const label = String(text).trim();
                    if (!label) return;

                    const {
                        font = "10px Arial",
                        textColor = "navy",
                        fillColor = "white",
                        strokeColor = "black",
                        paddingX = 10,
                        paddingY = 5,
                        minWidth = 24,
                    } = opts;

                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.font = font;

                    const textWidth = Math.max(minWidth, ctx.measureText(label).width);
                    const textHeight = parseInt(font, 10) || 10;

                    // Integer-align the center so the curve doesn't straddle sub-pixels.
                    const cx = Math.round(screenMidX);
                    const cy = Math.round(screenY + offsetY);
                    const rx = textWidth / 2 + paddingX;
                    const ry = textHeight / 2 + paddingY;

                    // Draw the border as a FILLED ellipse (a slightly larger fill behind
                    // the body) rather than a thin curved stroke — a 1px curved stroke on
                    // a non-HiDPI canvas looks jagged/pixelated, whereas a filled edge
                    // antialiases cleanly at any zoom.
                    ctx.beginPath();
                    ctx.fillStyle = strokeColor;
                    ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, 2 * Math.PI);
                    ctx.fill();

                    ctx.beginPath();
                    ctx.fillStyle = fillColor;
                    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
                    ctx.fill();

                    ctx.fillStyle = textColor;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, cx, cy);

                    ctx.restore();
                };

                if (screencell > 1) {
                    if (this.__dupSeq) {
                        // Duplicate-sequence oligo: draw a maroon stick with a yellow
                        // glow instead of the normal body so repeats stand out.
                        ctx.save();
                        ctx.lineCap = 'round';
                        ctx.shadowColor = 'rgba(255, 230, 0, 0.95)';   // yellow glow
                        ctx.shadowBlur = 14;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = '#800000';                   // maroon
                        ctx.lineWidth = 3;
                        const h = 10;
                        ctx.beginPath();
                        ctx.moveTo(screenMidX, screenY - h);
                        ctx.lineTo(screenMidX, screenY + h);
                        ctx.stroke();
                        ctx.shadowBlur = 5;                            // second pass sharpens the stick
                        ctx.stroke();
                        ctx.restore();
                    } else if (this.shapeFunction) {
                        this.shapeFunction(
                            graph,
                            tgraph.X(this.xi),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.color,
                            this.structure
                        );
                    } else {
                        await graph.drawLine(
                            tgraph.X(this.xi),
                            tgraph.Y(y),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.color,
                            1,
                            "round"
                        );
                    }

                    if (this.type && this.type.startsWith("deprecated")) {
                        drawCenteredOvalLabel("Deprecated", -26, {
                            font: "11px Arial",
                            textColor: "red",
                            fillColor: "white",
                            strokeColor: "red",
                        });
                    }

                    // Migrate any accessor-era backing field, then ALWAYS show the
                    // off-target markers whenever an off-target result is present —
                    // assigning an off-target implies it should be displayed, even for
                    // oligos loaded from a saved state with showOfftargets=false.
                    if (this._offtarget != null && this.offtarget == null) this.offtarget = this._offtarget;
                    if (this.offtarget != null) this.showOfftargets = true;

                    if (this.showOfftargets && this.offtarget != null) {
                        if (Array.isArray(this.offtarget)) {
                            // Gene-name annotations only draw once the track is zoomed in
                            // enough to render the sequence target (screencell > 5, the
                            // same threshold the track uses to draw base letters).
                            if (screencell > 5 && this.offtargetsymbols && this.offtargetsymbols.length > 0) {
                                // Comma-delimited on a single line above the oligo — not
                                // fanned in an arc (which overlaps when there are several).
                                const symText = this.offtargetsymbols
                                    .map((s) => String(s).trim())
                                    .filter(Boolean)
                                    .join(", ");
                                if (symText) {
                                    ctx.save();
                                    ctx.shadowBlur = 0;
                                    ctx.font = "10px Arial";
                                    ctx.fillStyle = "navy";
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "middle";
                                    ctx.fillText(symText, screenMidX, screenY - 30);
                                    ctx.restore();
                                }
                            }

                            // Badge shows the number of distinct off-target GENES (the
                            // same gene across many transcript isoforms counts once),
                            // not the raw per-transcript hit count.
                            const geneN = new Set(this.offtarget.map((h) => h && h.symbol).filter(Boolean)).size
                                || (this.offtargetsymbols ? this.offtargetsymbols.length : 0)
                                || this.offtarget.length;
                            drawCenteredOvalLabel(geneN, -12, {
                                font: "10px Arial",
                                textColor: "navy",
                                fillColor: "white",
                                strokeColor: "black",
                            });
                        } else if (typeof this.offtarget === "string") {
                            const strN = (this.offtargetsymbols && this.offtargetsymbols.length) ? this.offtargetsymbols.length : this.offtarget;
                            drawCenteredOvalLabel(strN, -12, {
                                font: "10px Arial",
                                textColor: "navy",
                                fillColor: "white",
                                strokeColor: "black",
                            });
                        }
                    } else if (this.showOfftargets && this.offtarget == null) {
                        // Searched and found NO off-targets — show a clean "0" so the
                        // user can see it was checked and is clear.
                        drawCenteredOvalLabel('0', -12, {
                            font: "10px Arial",
                            textColor: "#1aa3bd",
                            fillColor: "white",
                            strokeColor: "#1aa3bd",
                        });
                    }
                } else {
                    if (this.detailedShapeFunction) {
                        this.detailedShapeFunction(
                            graph,
                            tgraph.X(this.xi),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.color,
                            this.structure
                        );
                    } else {
                        await graph.drawLine(
                            tgraph.X(this.xi),
                            tgraph.Y(y),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.color,
                            1,
                            "round"
                        );
                    }
                }

                // General centered label: any attribute path on the oligo. Hidden by
                // default; enabled globally via graph.showOligoLabels (toggle in the
                // Oligos menu).
                const generalLabel = graph.showOligoLabels ? this.getDisplayLabelValue() : null;
                if (generalLabel != null) {
                    drawCenteredOvalLabel(generalLabel, this.labelOffsetY, {
                        font: this.labelFont,
                        textColor: this.labelTextColor,
                        fillColor: this.labelFillColor,
                        strokeColor: this.labelStrokeColor,
                    });
                }

                // Edge bars for a highlighted oligo are no longer drawn — the pulsing
                // background glow (above) is the selection indicator.

                if (this.selected) {
                    graph.drawVerticalLineScreen(screenX1, screenY, 5, "cyan", 4);
                    graph.drawVerticalLineScreen(screenX2, screenY, 5, "cyan", 4);
                }
            }

            setStrand(strand) {
                this.strand = strand;
            }

            async drawDetail(graph, tgraph, x, y) {
                if (this.y) {
                    y = this.y;
                }

                let font = "11px Arial";
                let seq_index = Math.round(x - this.xi);

                if (this.sequence) {
                    if (seq_index >= 0 && seq_index < this.sequence.length) {
                        if (this.mismatch.includes(seq_index)) {
                            graph.drawString(this.sequence[seq_index], tgraph.X(x), tgraph.Y(y), "red", "12px Arial");
                        } else {
                            graph.drawString(this.sequence[seq_index], tgraph.X(x), tgraph.Y(y), "darkGreen", font);
                        }
                    }
                }
            }

            async drawSequence(graph, tgraph, x, y) {
            }

            static copy(o) {
                if (o.type === 'amplicon') {
                    let leftOligo = Object.assign(new Oligo(), o['left']);
                    let rightOligo = Object.assign(new Oligo(), o['right']);
                    let midOligo = Object.assign(new Oligo(), o['mid']);
                    let ampliconObject = Object.assign(new Amplicon(), o);
                    ampliconObject.left = leftOligo;
                    ampliconObject.mid = midOligo;
                    ampliconObject.right = rightOligo;
                    return ampliconObject;
                } else if (o.type === 'siRNA') {
                    return Object.assign(new SIRNA(), o);
                } else {
                    return Object.assign(new Oligo(), o);
                }
            }
        }
        resolve(Oligo)

    })

}

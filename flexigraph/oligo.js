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

                    const cx = screenMidX;
                    const cy = screenY + offsetY;

                    ctx.beginPath();
                    ctx.fillStyle = fillColor;
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1;
                    ctx.ellipse(
                        cx,
                        cy,
                        textWidth / 2 + paddingX,
                        textHeight / 2 + paddingY,
                        0,
                        0,
                        2 * Math.PI
                    );
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = textColor;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(label, cx, cy);

                    ctx.restore();
                };

                if (screencell > 1) {
                    if (this.shapeFunction) {
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

                    if (this.showOfftargets && this.offtarget != null) {
                        if (Array.isArray(this.offtarget)) {
                            if (this.offtargetsymbols && this.offtargetsymbols.length > 0) {
                                const radius = 30;
                                const angleStep = Math.PI / (this.offtargetsymbols.length + 1);

                                ctx.save();
                                ctx.shadowBlur = 0;
                                ctx.font = "10px Arial";
                                ctx.fillStyle = "navy";
                                ctx.textAlign = "center";
                                ctx.textBaseline = "middle";

                                this.offtargetsymbols.forEach((item, index) => {
                                    const angle = (index + 1) * angleStep;
                                    const itemX = screenMidX + radius * Math.cos(angle);
                                    const itemY = screenY - 12 - radius * Math.sin(angle);
                                    ctx.fillText(String(item), itemX, itemY);
                                });

                                ctx.restore();
                            }

                            drawCenteredOvalLabel(this.offtarget.length, -12, {
                                font: "10px Arial",
                                textColor: "navy",
                                fillColor: "white",
                                strokeColor: "black",
                            });
                        } else if (typeof this.offtarget === "string") {
                            drawCenteredOvalLabel(this.offtarget, -12, {
                                font: "10px Arial",
                                textColor: "navy",
                                fillColor: "white",
                                strokeColor: "black",
                            });
                        }
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

                // General centered label: any attribute path on the oligo
                const generalLabel = this.getDisplayLabelValue();
                if (generalLabel != null) {
                    drawCenteredOvalLabel(generalLabel, this.labelOffsetY, {
                        font: this.labelFont,
                        textColor: this.labelTextColor,
                        fillColor: this.labelFillColor,
                        strokeColor: this.labelStrokeColor,
                    });
                }

                if (this.highlight__) {
                    graph.drawVerticalLineScreen(screenX1, screenY, 20, this.highlight__, 4);
                    graph.drawVerticalLineScreen(screenX2, screenY, 20, this.highlight__, 4);
                }

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

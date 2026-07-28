function () {
    return new Promise(async (resolve, reject) => {
        let chem_draw = await exec('flexigraph/chem-draw.js')

        function createUniqueIntegerId() {
            let timestamp = Date.now();
            let randomPart = Math.floor(Math.random() * 1000);
            let uniqueId = timestamp * 1000 + randomPart;
            return uniqueId;
        }

        let SIRNA = class SIRNA {
            static DISPLAY_SEED = 0;
            static DISPLAY_TARGET = 1;
            static DISPLAY_ANTISENSE = 2;

            linkSnpindels = [];
            name = '';
            xi = 0;
            xf = 0;
            id = null;
            y = 0;
            color = 'cyan';

            mi_targets_transient_ = null;
            shapeFunction = null;
            detailedShapeFunction = null;
            annotations = null;
            strand = -1;
            type = 'sirna';
            structure = '';

            percent_control = null;
            antisense = '';
            sense = '';
            sequence = '';
            synthesisSequence = null;
            fixed = [true];
            showOfftargets = false;
            offtarget = null;
            font = "12px Arial";
            highlight__ = false;
            shapeFunctionObject = null;

            show_seed_targets = false;
            filter = null;
            filterexp = [];
            ruleexp = [];
            offtargetsymbols = [];
            date = null;
            selected = false;

            // additional persisted siRNA properties
            senseDuplex = '';
            antisenseDuplex = '';
            senseOverhang = '';
            antisenseOverhang = '';
            synthesisSequenceDuplex = '';
            score = null;
            gc_percent = null;
            rank = null;
            notes = [];
            target_site = '';
            targetSiteRna = '';
            senseCoreRna = '';
            antisenseCoreRna = '';

            constructor(typeOrObject, sequence, sense, antisense, xi, xf, y, strand, structure) {
                // Object-style construction for JSON hydration
                if (typeOrObject && typeof typeOrObject === 'object' && !Array.isArray(typeOrObject)) {
                    this.applyData(typeOrObject);
                    return;
                }

                // Legacy positional construction
                this.type = typeOrObject || 'sirna';
                this.sequence = sequence || '';
                this.sense = sense || sequence || '';
                this.antisense = antisense || '';
                this.synthesisSequence = antisense || '';
                this.name = this.sequence || '';
                this.xi = xi ?? 0;
                this.xf = xf ?? (this.xi + (this.sequence ? this.sequence.length : 0));
                this.y = y ?? 0;
                this.strand = strand ?? -1;
                this.structure = structure || '';

                if (!this.id) {
                    this.id = createUniqueIntegerId();
                }
                if (!this.date) {
                    this.date = new Date().getTime().toString() + '.' + Math.random().toString().replace('.', '');
                }

                this.rebuildDerivedFields();
            }

            applyData(data = {}) {
                this.linkSnpindels = Array.isArray(data.linkSnpindels) ? data.linkSnpindels : [];
                this.name = data.name ?? data.sequence ?? '';
                this.xi = data.xi ?? 0;
                this.xf = data.xf ?? 0;
                this.id = data.id ?? createUniqueIntegerId();
                this.y = data.y ?? 0;
                this.color = data.color ?? 'cyan';

                this.mi_targets_transient_ = data.mi_targets_transient_ ?? null;
                this.shapeFunction = data.shapeFunction ?? null;
                this.detailedShapeFunction = data.detailedShapeFunction ?? null;
                this.annotations = data.annotations ?? null;
                this.strand = data.strand ?? -1;
                this.type = data.type ?? 'sirna';
                this.structure = data.structure ?? '';

                this.percent_control = data.percent_control ?? null;
                this.antisense = data.antisense ?? '';
                this.sense = data.sense ?? data.sequence ?? '';
                this.sequence = data.sequence ?? data.sense ?? '';
                this.synthesisSequence = data.synthesisSequence ?? this.antisense ?? null;

                this.fixed = Array.isArray(data.fixed) ? data.fixed : [true];
                this.showOfftargets = data.showOfftargets ?? false;
                this.offtarget = data.offtarget ?? null;
                this.font = data.font ?? "12px Arial";
                this.highlight__ = data.highlight__ ?? false;
                this.shapeFunctionObject = null; // do not persist runtime function refs

                this.show_seed_targets = data.show_seed_targets ?? false;
                this.filter = data.filter ?? null;
                this.filterexp = Array.isArray(data.filterexp) ? data.filterexp : [];
                this.ruleexp = Array.isArray(data.ruleexp) ? data.ruleexp : [];
                this.offtargetsymbols = Array.isArray(data.offtargetsymbols) ? data.offtargetsymbols : [];
                this.date = data.date ?? (new Date().getTime().toString() + '.' + Math.random().toString().replace('.', ''));
                this.selected = data.selected ?? false;

                this.senseDuplex = data.senseDuplex ?? '';
                this.antisenseDuplex = data.antisenseDuplex ?? '';
                this.senseOverhang = data.senseOverhang ?? '';
                this.antisenseOverhang = data.antisenseOverhang ?? '';
                this.synthesisSequenceDuplex = data.synthesisSequenceDuplex ?? '';
                this.score = data.score ?? null;
                this.gc_percent = data.gc_percent ?? null;
                this.rank = data.rank ?? null;
                this.notes = Array.isArray(data.notes) ? data.notes : [];
                this.target_site = data.target_site ?? '';
                this.targetSiteRna = data.targetSiteRna ?? '';
                this.senseCoreRna = data.senseCoreRna ?? '';
                this.antisenseCoreRna = data.antisenseCoreRna ?? '';

                this.rebuildDerivedFields();
            }

            rebuildDerivedFields() {
                if (!this.sequence && this.sense) {
                    this.sequence = this.sense;
                }
                if (!this.sense && this.sequence) {
                    this.sense = this.sequence;
                }
                if (!this.name) {
                    this.name = this.sequence || this.sense || '';
                }
                if (this.xf == null || this.xf === 0) {
                    this.xf = this.xi + (this.sequence ? this.sequence.length : 0);
                }
                if (!this.synthesisSequence) {
                    this.synthesisSequence = this.antisense || null;
                }
                if (!this.senseDuplex) {
                    this.senseDuplex = this.sense || this.sequence || '';
                }
                if (!this.antisenseDuplex) {
                    this.antisenseDuplex = this.antisense || '';
                }
                if (!this.synthesisSequenceDuplex) {
                    this.synthesisSequenceDuplex = this.synthesisSequence || this.antisenseDuplex || this.antisense || '';
                }
            }

            toJSON() {
                return {
                    linkSnpindels: this.linkSnpindels,
                    name: this.name,
                    xi: this.xi,
                    xf: this.xf,
                    id: this.id,
                    y: this.y,
                    color: this.color,
                    mi_targets_transient_: this.mi_targets_transient_,
                    shapeFunction: this.shapeFunction,
                    strand: this.strand,
                    type: this.type,
                    structure: this.structure,
                    percent_control: this.percent_control,
                    antisense: this.antisense,
                    sense: this.sense,
                    sequence: this.sequence,
                    synthesisSequence: this.synthesisSequence,
                    fixed: this.fixed,
                    showOfftargets: this.showOfftargets,
                    offtarget: this.offtarget,
                    font: this.font,
                    highlight__: this.highlight__,
                    show_seed_targets: this.show_seed_targets,
                    filter: this.filter,
                    filterexp: this.filterexp,
                    ruleexp: this.ruleexp,
                    offtargetsymbols: this.offtargetsymbols,
                    date: this.date,

                    senseDuplex: this.senseDuplex,
                    antisenseDuplex: this.antisenseDuplex,
                    senseOverhang: this.senseOverhang,
                    antisenseOverhang: this.antisenseOverhang,
                    synthesisSequenceDuplex: this.synthesisSequenceDuplex,
                    score: this.score,
                    gc_percent: this.gc_percent,
                    rank: this.rank,
                    notes: this.notes,
                    target_site: this.target_site,
                    targetSiteRna: this.targetSiteRna,
                    senseCoreRna: this.senseCoreRna,
                    antisenseCoreRna: this.antisenseCoreRna,
                    selected: this.selected
                };
            }

            static fromJSON(data) {
                return new SIRNA(data);
            }

            clone() {
                return SIRNA.fromJSON(this.toJSON());
            }

            setY(y) {
                this.y = y;
            }

            inAnnotation(x) {
                return x > this.xi && x <= this.xf;
            }

            getGuidStrandSeedSequence() {
                if (this.strand < 0) {
                    return this.synthesisSequence?.substring(1, 8);
                } else if (this.strand > 0) {
                    let li = this.synthesisSequence?.length || 0;
                    return this.synthesisSequence?.substring(li - 8, li - 1);
                }
                return '';
            }

            getSeedSequence() {
                if (this.strand < 0) {
                    return this.sequence.substring(1, 8);
                } else if (this.strand > 0) {
                    let li = this.sequence.length;
                    return this.sequence.substring(li - 8, li - 1);
                }
                return '';
            }

            getWidth() {
                return Math.abs(this.xf - this.xi);
            }

            getHeight() {
                return 0.05;
            }

            setSelected(value) {
                this.selected = value;
            }

            getSelected() {
                return this.selected;
            }

            setColor(color) {
                this.color = color;
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

            highlight(delay, color) {
                this.highlight__ = 'magenta';
                if (color) {
                    this.highlight__ = color;
                }
                if (delay && delay > 0) {
                    setTimeout(() => {

                        this.highlight__ = false;
                    }, delay)
                }
            }

            setSelected(value) {
                this.selected = value;
            }
            getSelected() {
                return this.selected;
            }

            setColor(color) {
                this.color = color;
            }
            draw(graph, tgraph, y) {
                if (!graph) {
                    console.log(" Graph object not found ")
                    return;
                }
                if (this.y) {
                    y = this.y;
                }

                let ysc = graph.Y(tgraph.Y(y))

                if (!this.shapeFunctionObject)
                    this.shapeFunctionObject = getIon(chem_draw[this.type])
                if (!this.detailedShapeFunction)
                    this.detailedShapeFunction = getIon(chem_draw[this.type + '.detailed'])
                let screencell = graph.screenWidth(tgraph.screenWidth(1))
                if (screencell > 0) {
                    if (this.shapeFunctionObject) {
                        this.shapeFunctionObject(graph, tgraph.X(this.xi + 1), tgraph.X(this.xf), tgraph.Y(y), this.color, this.structure, this);
                    } else {
                        if (this.strand < 0) {
                            this.drawLine(graph, tgraph.X(this.xi), ysc - 2, tgraph.X(this.xf), "lightGray", 2, 'round')
                            this.drawLine(graph, tgraph.X(this.xi), ysc - 13, tgraph.X(this.xf), "navy", 11, 'round')
                        } else {
                            this.drawLine(graph, tgraph.X(this.xi), ysc - 2, tgraph.X(this.xf), "lightYellow", 11, 'round')
                            this.drawLine(graph, tgraph.X(this.xi), ysc - 13, tgraph.X(this.xf), "navy", 11, 'round')
                        }
                    }

                    if (graph.canvas) {
                        var ctx = graph.canvas.getCTX();

                        let font = "10px Arial";
                        if (this.offtarget != null) {
                            ctx.shadowBlur = 0;
                            ctx.font = font
                            if (this.selected)
                                ctx.shadowColor = 'red';
                            else
                                ctx.shadowColor = 'black';

                            let textWidth = ctx.measureText('' + this.offtarget.length).width;
                            let textHeight = parseInt(ctx.font, 10);
                            let padding = 10;

                            let sx = graph.X(tgraph.X(this.xi + this.name.length)) + 20;
                            let sy = graph.Y(tgraph.Y(y)) - 4;

                            ctx.fillStyle = "white";
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.ellipse(sx + textWidth / 2, sy - textHeight / 2, textWidth / 2 + padding, textHeight / 2 + padding / 2, 0, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.shadowBlur = 0

                            ctx.shadowColor = 'black'

                        }
                        if (this.showOfftargets && this.offtarget != null) {
                            if (typeof this.offtarget === "object" && Array.isArray(this.offtarget)) {
                                let font = "10px Arial";
                                if (ctx) {
                                    ctx.shadowBlur = 0;
                                    ctx.font = font
                                    if (this.selected)
                                        ctx.shadowColor = 'red';
                                    else
                                        ctx.shadowColor = 'black';

                                    let textWidth = ctx.measureText('' + this.offtarget.length).width;
                                    let textHeight = parseInt(ctx.font, 10);
                                    let padding = 10;

                                    let sx = graph.X(tgraph.X(this.xi + this.name.length)) + 20;
                                    let sy = graph.Y(tgraph.Y(y)) - 4;

                                    ctx.fillStyle = "white";
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.ellipse(sx + textWidth / 2, sy - textHeight / 2, textWidth / 2 + padding, textHeight / 2 + padding / 2, 0, 0, 2 * Math.PI);
                                    ctx.fill();
                                    ctx.shadowBlur = 0

                                    ctx.shadowColor = 'black'

                                    ctx.fillStyle = "navy";
                                    ctx.fillText('' + this.offtarget.length, sx, sy - 4);
                                    ctx.stroke();

                                    if (this.offtargetsymbols && this.offtargetsymbols.length > 0) {
                                        let radius = 30;
                                        let angleStep = Math.PI / (this.offtarget.length + 1);
                                        let sx = graph.X(tgraph.X(this.xi + this.name.length)) + 20;
                                        let sy = graph.Y(tgraph.Y(y)) - 4;

                                        this.offtargetsymbols.forEach((item, index) => {
                                            let angle = (index + 1) * angleStep;
                                            let itemSx = sx + radius * Math.cos(angle);
                                            let itemSy = sy - radius * Math.sin(angle);
                                            let textWidth = ctx.measureText('' + item).width;
                                            let textHeight = parseInt(ctx.font, 10);
                                            let padding = 10;

                                            ctx.lineWidth = 1;

                                            ctx.shadowBlur = 0;
                                            ctx.shadowColor = 'black';

                                            ctx.fillStyle = "navy";
                                            ctx.fillText('' + item, itemSx, itemSy - 4);
                                        });
                                    }

                                }
                            }

                        }
                        if (this.show_seed_targets && this.mi_targets_transient_ != null) {

                            if (typeof this.mi_targets_transient_ === "object" && Array.isArray(this.mi_targets_transient_)) {
                                let font = "11px Arial";
                                if (ctx) {
                                    ctx.shadowBlur = 0;
                                    ctx.font = font
                                    if (this.selected)
                                        ctx.shadowColor = 'red';
                                    else
                                        ctx.shadowColor = 'black';

                                    let textWidth = ctx.measureText('' + this.mi_targets_transient_.length).width;
                                    let textHeight = parseInt(ctx.font, 10);
                                    let padding = 10;

                                    let sx = graph.X(tgraph.X(this.xi + this.name.length)) - 40;
                                    let sy = graph.Y(tgraph.Y(y)) - 20;

                                    ctx.fillStyle = "lightGray";
                                    ctx.lineWidth = 2;
                                    ctx.beginPath();
                                    ctx.ellipse(sx + textWidth / 2, sy - textHeight / 2, textWidth / 2 + padding, textHeight / 2 + padding / 2, 0, 0, 2 * Math.PI);
                                    ctx.fill();
                                    ctx.shadowBlur = 0

                                    ctx.shadowColor = 'black'

                                    ctx.fillStyle = "black";
                                    ctx.fillText('' + this.mi_targets_transient_.length, sx, sy - 4);
                                    ctx.stroke();
                                }
                            } else {
                                let font = "11px Arial";
                                if (ctx) {
                                    ctx.shadowBlur = 0;
                                    ctx.font = font
                                    if (this.selected)
                                        ctx.shadowColor = 'red';
                                    else
                                        ctx.shadowColor = 'black';

                                    let textWidth = ctx.measureText('' + this.mi_targets_transient_.length).width;
                                    let textHeight = parseInt(ctx.font, 10);
                                    let padding = 10;

                                    let sx = graph.X(tgraph.X(this.xi + this.name.length)) - 40;
                                    let sy = graph.Y(tgraph.Y(y)) - 10;

                                    ctx.fillStyle = "lightRed";
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.ellipse(sx + textWidth / 2, sy - textHeight / 2, textWidth / 2 + padding, textHeight / 2 + padding / 2, 0, 0, 2 * Math.PI);
                                    ctx.fill();
                                    ctx.shadowBlur = 0

                                    ctx.shadowColor = 'black'

                                    ctx.fillStyle = "black";
                                    ctx.fillText('' + this.mi_targets_transient_.toString(), sx, sy - 4);
                                    ctx.stroke();
                                }
                            }

                            ctx.fillStyle = "lightGray";
                            ctx.strokeStyle = 'lightGray'

                        }
                    }
                } else {
                    if (this.detailedShapeFunction) {
                        this.detailedShapeFunction(graph, tgraph.X(this.xi), tgraph.X(this.xf), tgraph.Y(y), this.color, this.structure);
                    } else {

                    }
                }
                if (this.highlight__) {
                    graph.drawVerticalLineScreen(graph.X(tgraph.X(this.xi)), graph.Y(tgraph.Y(y)), 10, this.highlight__, 4)
                    graph.drawVerticalLineScreen(graph.X(tgraph.X(this.xf)), graph.Y(tgraph.Y(y)), 10, this.highlight__, 4)
                }
                if (this.selected) {
                    graph.drawVerticalLineScreen(graph.X(tgraph.X(this.xi)), graph.Y(tgraph.Y(y)), 10, this.highlight__, 4)
                    graph.drawVerticalLineScreen(graph.X(tgraph.X(this.xf)), graph.Y(tgraph.Y(y)), 10, this.highlight__, 4)

                }
            }

            drawLine = (graph, xi, ys, xf, color, lineSize, lineCap) => {
                let canvas = graph.canvas;
                if (canvas) {

                    var ctx = canvas.getCTX();
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    if (color != null) {
                        ctx.strokeStyle = color;
                    }
                    if (lineSize == null) {
                        lineSize = 2;
                    }
                    if (lineCap == null) {
                        ctx.lineCap = lineCap;
                    }
                    else {
                        ctx.lineCap = 'butt';
                    }
                    ctx.shadowColor = 'black';
                    ctx.lineWidth = lineSize;

                    ctx.beginPath();
                    ctx.moveTo(graph.grid.X(xi), ys);
                    ctx.lineTo(graph.grid.X(xf), ys);
                    ctx.stroke();

                }
            }
            drawString(graph, str, x, sy, color, font, sc_offset) {
                let canvas = graph.canvas;
                if (canvas) {
                    var ctx = canvas.getCTX();
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';

                    if (!font) {
                        font = "15px Arial";
                    }
                    if (ctx) {
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';
                        if (!color) {
                            color = 'black'
                        }
                        if (font) {
                            ctx.font = font;
                        } else {
                            ctx.font = '15px Arial'
                        }
                        ctx.fillStyle = color;
                        let sx = graph.grid.X(x);

                        if (sc_offset == null) {
                            ctx.fillText(str, sx, sy);
                        } else {
                            ctx.fillText(str, sx, sy + sc_offset);
                        }
                        ctx.stroke();

                    }
                }
            }

            // fix this so that the sequences are drawn appropriately 

            drawDetail(graph, tgraph, x, y) {
                if (this.y != null) {
                    y = this.y;
                }

                const canvas = graph.canvas;
                const ysc = graph.Y(tgraph.Y(y));

                const senseCore = this.sequence || this.sense || '';
                const antiCore = this.antisense || '';

                // Full display strings, including overhangs if present
                const senseDisplay = this.senseDuplex || senseCore || '';
                const antiDisplay = this.antisenseDuplex || antiCore || '';

                const senseOverhang = this.senseOverhang || '';
                const antiOverhang = this.antisenseOverhang || '';

                if (canvas) {
                    const ctx = canvas.getCTX();
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'black';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.stroke();
                }

                const senseStart = 0;
                const antiStart = -antiOverhang.length;

                const visualMinCol = Math.min(0, antiStart);
                const visualMaxCol = Math.max(
                    senseStart + senseDisplay.length,
                    antiStart + antiDisplay.length
                );
                const visualLen = visualMaxCol - visualMinCol;

                const rawCol = Math.floor(x) - this.xi;
                if (rawCol < 0 || rawCol >= visualLen) return;

                const col = rawCol + visualMinCol;
                const drawX = tgraph.X(this.xi + rawCol);

                // ----- DRAW ANTISENSE -----
                const antiDisplayIndex = col - antiStart;
                if (antiDisplayIndex >= 0 && antiDisplayIndex < antiDisplay.length) {
                    let antiCharIndex = antiDisplayIndex;

                    if (this.strand > 0) {
                        antiCharIndex = antiDisplay.length - antiDisplayIndex - 1;
                    }

                    const antiChar = antiDisplay[antiCharIndex];

                    if (antiChar != null) {
                        const antiCoreStart = antiOverhang.length;
                        const antiCoreEnd = antiOverhang.length + antiCore.length;
                        const isAntiOverhang =
                            antiDisplayIndex < antiCoreStart || antiDisplayIndex >= antiCoreEnd;

                        let antiCoreIndex = antiDisplayIndex - antiCoreStart;
                        if (this.strand > 0) {
                            antiCoreIndex = antiCore.length - antiCoreIndex - 1;
                        }

                        const antiColor = isAntiOverhang
                            ? "deepskyblue"
                            : (
                                ((this.strand < 0) && antiCoreIndex > 0 && antiCoreIndex < 8) ||
                                ((this.strand > 0) && antiCoreIndex >= 0 && antiCoreIndex < 7)
                            )
                                ? "cyan"
                                : "lightBlue";

                        this.drawString(
                            graph,
                            antiChar,
                            drawX,
                            ysc - 12,
                            antiColor,
                            this.font
                        );

                        // Draw parentheses around antisense overhang block
                        if (isAntiOverhang) {
                            const antiOverhangStart = 0;
                            const antiOverhangEnd = antiOverhang.length - 1;

                            if (antiOverhang.length > 0 && antiDisplayIndex === antiOverhangStart) {
                                this.drawString(graph, "", drawX - 0.5, ysc - 12, antiColor, this.font);
                            }
                            if (antiOverhang.length > 0 && antiDisplayIndex === antiOverhangEnd) {
                                this.drawString(graph, "", drawX + 0.65, ysc - 12, antiColor, this.font);
                            }
                        }
                    }
                }
                const senseDisplayIndex = col - senseStart;
                if (senseDisplayIndex >= 0 && senseDisplayIndex < senseDisplay.length) {
                    const senseChar = senseDisplay[senseDisplayIndex];
                    if (senseChar != null) {
                        const isSenseOverhang = senseDisplayIndex >= senseCore.length;
                        const senseColor = isSenseOverhang ? "indianred" : "maroon";

                        this.drawString(
                            graph,
                            senseChar,
                            drawX,
                            ysc,
                            senseColor,
                            this.font
                        );

                        // Draw parentheses around sense overhang block
                        if (isSenseOverhang) {
                            const senseOverhangStart = senseCore.length;
                            const senseOverhangEnd = senseDisplay.length - 1;

                            if (senseOverhang.length > 0 && senseDisplayIndex === senseOverhangStart) {
                                this.drawString(graph, "", drawX - 0.65, ysc, senseColor, this.font);
                            }
                            if (senseOverhang.length > 0 && senseDisplayIndex === senseOverhangEnd) {
                                this.drawString(graph, "", drawX + 0.65, ysc, senseColor, this.font);
                            }
                        }
                    }
                }
            }
            async drawSequence(graph, tgraph, x, y) {
                if (this.y) {
                    y = this.y;
                }
                let seq_index = Math.round(x) - this.xi;
                if (seq_index >= 0 && seq_index < this.sequence.length) {

                } else {
                }
            }

        }

        resolve(SIRNA)

    })

}

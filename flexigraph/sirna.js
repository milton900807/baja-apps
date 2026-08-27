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
            offtargetsRun = false;   // true only once off-targets have actually been run (gates the "0" badge)
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
                this.offtargetsRun = data.offtargetsRun ?? (this.offtarget != null);
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
                    offtargetsRun: this.offtargetsRun,
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
                // siRNA draws two stacked strand lanes plus a gene-symbol label row,
                // so it needs a taller footprint than a single-strand oligo (0.05) —
                // this gives it a couple of text-rows of vertical buffer in the
                // anti-overlap spacing so stacked siRNAs don't crowd each other.
                return 0.28;
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
                    const _ctx = graph.canvas ? graph.canvas.getCTX() : null;

                    // Selected/highlighted siRNA get the same pulsing glow as oligos.
                    if (_ctx && (this.selected || this.highlight__)) {
                        const pulse = (typeof graph.__pulse === 'number') ? graph.__pulse : 0.6;
                        const x0 = graph.X(tgraph.X(this.xi)), x1 = graph.X(tgraph.X(this.xf));
                        const gcx = (x0 + x1) / 2;
                        const gcy = ysc - 9;                     // between the two strand lanes
                        const grx = Math.max(Math.abs(x1 - x0) / 2 + 10, 16) + 6 * pulse;
                        const gry = 20 + 6 * pulse;              // tall enough to frame both strands
                        const galpha = 0.12 + 0.5 * pulse;
                        const toRGB = (c) => {
                            if (typeof c !== 'string') return null;
                            const s = c.trim().toLowerCase();
                            const named = { magenta: [255, 0, 255], cyan: [0, 255, 255], red: [255, 0, 0], maroon: [128, 0, 0], navy: [10, 37, 64], yellow: [255, 230, 0], lime: [0, 255, 0], green: [0, 128, 0], orange: [255, 165, 0] };
                            if (named[s]) return named[s];
                            let m = s.match(/^#([0-9a-f]{6})$/);
                            if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
                            m = s.match(/^rgba?\(([^)]+)\)/);
                            if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
                            return null;
                        };
                        const hlColor = (typeof this.highlight__ === 'string' && this.highlight__) ? this.highlight__ : '#1aa3bd';
                        const rgb = toRGB(hlColor) || [26, 163, 189];
                        _ctx.save();
                        _ctx.shadowColor = 'transparent';
                        _ctx.shadowBlur = 0;
                        const grad = _ctx.createRadialGradient(gcx, gcy, 2, gcx, gcy, grx);
                        grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${galpha})`);
                        grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
                        _ctx.fillStyle = grad;
                        _ctx.beginPath();
                        _ctx.ellipse(gcx, gcy, grx, gry, 0, 0, Math.PI * 2);
                        _ctx.fill();
                        _ctx.restore();
                    }

                    // Draw the two strands stacked VERTICALLY so they don't block each
                    // other: PASSENGER (sense) above, GUIDE (antisense) below.
                    const _guide = ('' + (this.sequence || this.guide || '')).toUpperCase().replace(/T/g, 'U');
                    const _n = _guide.length || Math.max(1, Math.round(this.xf - this.xi));
                    // Passenger (sense) = reverse complement of the guide, 5'->3'.
                    const _pass = _guide.split('').reverse().map((b) => (b === 'A' ? 'U' : b === 'U' ? 'A' : b === 'G' ? 'C' : b === 'C' ? 'G' : 'N')).join('');
                    // guide is antiparallel to the target; passenger is parallel.
                    const _li = (p) => (this.strand >= 0 ? (_n - 1 - p) : p);   // guide position -> local base index
                    const _liP = (i) => (this.strand >= 0 ? i : (_n - 1 - i));  // passenger position -> local base index

                    const passY = ysc - 16;   // upper lane: passenger
                    const guideY = ysc - 2;    // lower lane: guide
                    this.drawLine(graph, tgraph.X(this.xi), passY, tgraph.X(this.xf), 'rgba(90,120,150,0.95)', 9, 'round');
                    this.drawLine(graph, tgraph.X(this.xi), guideY, tgraph.X(this.xf), 'navy', 11, 'round');

                    // Seed highlight (guide positions 2-8) on the GUIDE lane.
                    if (_ctx && _n >= 8) {
                        const a = graph.X(tgraph.X(this.xi + Math.min(_li(1), _li(7))));
                        const b = graph.X(tgraph.X(this.xi + Math.max(_li(1), _li(7)) + 1));
                        _ctx.save();
                        _ctx.fillStyle = 'rgba(255,140,66,0.65)';   // tropical-orange seed highlight
                        _ctx.fillRect(Math.min(a, b), guideY - 6, Math.abs(b - a), 12);
                        _ctx.restore();
                    }

                    // Strand letters when zoomed in.
                    if (_ctx && screencell > 5) {
                        _ctx.save();
                        _ctx.font = Math.max(8, Math.min(14, Math.floor(screencell))) + 'px monospace';
                        _ctx.textAlign = 'center';
                        _ctx.textBaseline = 'middle';
                        for (let i = 0; i < _pass.length; i++) {   // passenger (sense)
                            const cx = graph.X(tgraph.X(this.xi + _liP(i))) + Math.max(1, screencell) / 2;
                            _ctx.fillStyle = '#e8eef4';
                            _ctx.fillText(_pass[i], cx, passY);
                        }
                        for (let p = 0; p < _guide.length; p++) {   // guide (seed dark on orange, rest white)
                            const cx = graph.X(tgraph.X(this.xi + _li(p))) + Math.max(1, screencell) / 2;
                            const isSeed = (p >= 1 && p <= 7);
                            _ctx.fillStyle = isSeed ? '#3a1500' : '#ffffff';
                            _ctx.fillText(_guide[p], cx, guideY);
                        }
                        _ctx.restore();
                    }

                    // 3' overhangs (e.g. dTdT), each drawn hanging off its strand's 3' end.
                    const _drawOverhang = (ohStr, edgeLocal, dir, laneY) => {
                        if (!_ctx || !ohStr) return;
                        const xa = graph.X(tgraph.X(this.xi + edgeLocal + dir * ohStr.length));
                        const xb = graph.X(tgraph.X(this.xi + edgeLocal + (dir < 0 ? 0 : 1)));
                        _ctx.save();
                        _ctx.strokeStyle = 'rgba(120,140,160,0.9)';
                        _ctx.lineWidth = 4;
                        _ctx.setLineDash([3, 2]);
                        _ctx.beginPath();
                        _ctx.moveTo(Math.min(xa, xb), laneY);
                        _ctx.lineTo(Math.max(xa, xb), laneY);
                        _ctx.stroke();
                        _ctx.restore();
                        if (screencell > 5) {
                            _ctx.save();
                            _ctx.font = Math.max(8, Math.min(14, Math.floor(screencell))) + 'px monospace';
                            _ctx.textAlign = 'center';
                            _ctx.textBaseline = 'middle';
                            _ctx.fillStyle = '#5a6b7a';
                            for (let k = 0; k < ohStr.length; k++) {
                                const cx = graph.X(tgraph.X(this.xi + edgeLocal + dir * (k + 1))) + Math.max(1, screencell) / 2;
                                _ctx.fillText((ohStr[k] || '').toLowerCase(), cx, laneY);   // dTdT shown lowercase
                            }
                            _ctx.restore();
                        }
                    };
                    const _gOh = ('' + (this.antisenseOverhang || '')).toUpperCase().replace(/[^ACGTU]/g, '');
                    const _sOh = ('' + (this.senseOverhang || '')).toUpperCase().replace(/[^ACGTU]/g, '');
                    // guide 3' end: +strand -> xi side (dir -1); -strand -> xf side (dir +1)
                    _drawOverhang(_gOh, (this.strand >= 0 ? 0 : (_n - 1)), (this.strand >= 0 ? -1 : 1), guideY);
                    // passenger 3' end: +strand -> xf side (dir +1); -strand -> xi side (dir -1)
                    _drawOverhang(_sOh, (this.strand >= 0 ? (_n - 1) : 0), (this.strand >= 0 ? 1 : -1), passY);

                    if (graph.canvas) {
                        var ctx = graph.canvas.getCTX();

                        // Off-target count badge + gene-symbol annotations. Works for BOTH
                        // an array of hits and a large-count STRING (>1000 hits).
                        if (this.offtarget != null) this.offtargetsRun = true;
                        if (this.showOfftargets && this.offtarget != null) {
                            const _off = this.offtarget;
                            // Badge shows the number of distinct off-target GENES (same
                            // gene across many transcript isoforms counts once).
                            const _cnt = Array.isArray(_off)
                                ? (new Set(_off.map((h) => h && h.symbol).filter(Boolean)).size
                                    || (this.offtargetsymbols ? this.offtargetsymbols.length : 0)
                                    || _off.length)
                                : ((this.offtargetsymbols && this.offtargetsymbols.length) ? this.offtargetsymbols.length : (parseInt(_off, 10) || 0));
                            ctx.save();
                            ctx.font = '10px Arial';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'transparent';
                            // Count badge, just to the right of the guide bar.
                            const countStr = '' + _cnt;
                            const tw = ctx.measureText(countStr).width;
                            const bx = graph.X(tgraph.X(this.xf)) + 8;
                            const by = ysc - 4;
                            // Filled edge (a slightly larger ellipse in the border color,
                            // then the white fill on top) instead of a curved stroke —
                            // antialiases cleanly and stays thin at any zoom/DPI.
                            ctx.beginPath();
                            ctx.fillStyle = this.selected ? '#c0392b' : '#1aa3bd';
                            ctx.ellipse(bx + tw / 2, by - 5, tw / 2 + 9, 10, 0, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.beginPath();
                            ctx.fillStyle = 'white';
                            ctx.ellipse(bx + tw / 2, by - 5, tw / 2 + 8, 9, 0, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.fillStyle = 'navy';
                            ctx.fillText(countStr, bx, by);
                            // Gene symbols as a single comma-delimited line above the oligo
                            // (no overlap), when zoomed in enough.
                            if (this.offtargetsymbols && this.offtargetsymbols.length > 0 && screencell > 5) {
                                ctx.fillStyle = 'navy';
                                ctx.fillText(this.offtargetsymbols.slice(0, 30).join(', '), graph.X(tgraph.X(this.xi)), ysc - 30);
                            }
                            ctx.restore();
                        } else if (this.showOfftargets && this.offtargetsRun && this.offtarget == null) {
                            // Searched and found NO off-targets — show a clean "0". Only when
                            // off-targets were actually RUN: an oligo never searched shows none.
                            ctx.save();
                            ctx.font = '10px Arial';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'transparent';
                            const bx0 = graph.X(tgraph.X(this.xf)) + 8;
                            const by0 = ysc - 4;
                            const tw0 = ctx.measureText('0').width;
                            // Filled edge instead of a curved stroke — stays thin/crisp.
                            ctx.beginPath();
                            ctx.fillStyle = '#1aa3bd';
                            ctx.ellipse(bx0 + tw0 / 2, by0 - 5, tw0 / 2 + 9, 10, 0, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.beginPath();
                            ctx.fillStyle = 'white';
                            ctx.ellipse(bx0 + tw0 / 2, by0 - 5, tw0 / 2 + 8, 9, 0, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.fillStyle = '#1aa3bd';
                            ctx.fillText('0', bx0, by0);
                            ctx.restore();
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
                // siRNA is drawn guide-only with a seed highlight in draw(); do NOT
                // render the full duplex chemistry (sense + antisense) when zoomed in.
                return;
                // eslint-disable-next-line no-unreachable
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

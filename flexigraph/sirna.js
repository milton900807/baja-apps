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
            design_scores = {};

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
                // Itemized design scores + nearest-neighbor thermodynamics (persisted).
                this.design_scores = (data.design_scores && typeof data.design_scores === 'object') ? data.design_scores : {};

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
                    design_scores: this.design_scores,
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
                const c = color || 'magenta';
                this.highlight__ = c;
                // Long magenta highlight (fired on add) sets off a one-shot expanding burst AND
                // blinks a couple of times before fading, so the just-placed siRNA is easy to spot.
                if (c === 'magenta' && delay && delay >= 1200) {
                    try { this.landingBurst('magenta'); } catch (e) { }
                    try { this.__blinkHighlight(c, delay); } catch (e) { this.highlight__ = false; }
                    return;
                }
                if (delay && delay > 0) {
                    setTimeout(() => {

                        this.highlight__ = false;
                    }, delay)
                }
            }

            // Blink the landing glow on/off a few times over `delay` ms, ending faded (off).
            __blinkHighlight(color, delay) {
                const wake = () => { try { const g = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed) ? CurrentLayout.getStashed('graph') : null; if (g && g.wake) g.wake(); } catch (e) { } };
                const onPhases = 3;
                const total = onPhases * 2;
                const period = Math.max(180, Math.floor(delay / total));
                let n = 0;
                const step = () => {
                    this.highlight__ = (n % 2 === 0) ? color : false;
                    wake();
                    n++;
                    if (n < total) setTimeout(step, period);
                    else { this.highlight__ = false; wake(); }
                };
                step();
            }

            landingBurst(color) {
                try { this.__burstT0 = Date.now(); this.__burstColor = color || 'magenta'; this.__burstMs = 950; } catch (e) { }
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

                // Don't draw anything off-screen: skip the whole siRNA if its span (plus a
                // margin for the off-target badge / labels) is entirely outside the canvas.
                {
                    const _c = graph.canvas ? graph.canvas.getCTX() : null;
                    if (_c && _c.canvas) {
                        const _x1 = graph.X(tgraph.X(this.xi)), _x2 = graph.X(tgraph.X(this.xf));
                        const _lo = Math.min(_x1, _x2), _hi = Math.max(_x1, _x2), _m = 140;
                        if (_hi < -_m || _lo > _c.canvas.width + _m || ysc < -_m || ysc > _c.canvas.height + _m) return;
                    }
                }

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

                    // One-shot "landing burst" — a decent, zoom-independent expanding ring so a
                    // just-placed siRNA is easy to spot even when zoomed out. See landingBurst().
                    if (_ctx && this.__burstT0) {
                        const __el = Date.now() - this.__burstT0;
                        const __ms = this.__burstMs || 950;
                        if (__el >= 0 && __el < __ms) {
                            const __p = __el / __ms;
                            const __named = { magenta: [255, 0, 255], cyan: [0, 255, 255], lime: [0, 255, 0], orange: [255, 165, 0], red: [255, 0, 0] };
                            const __c = __named[('' + (this.__burstColor || 'magenta')).toLowerCase()] || [255, 0, 255];
                            const __bx = (graph.X(tgraph.X(this.xi)) + graph.X(tgraph.X(this.xf))) / 2;
                            const __by = ysc - 9;
                            const __R = 30 + 64 * __p;
                            _ctx.save();
                            _ctx.shadowColor = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.85 * (1 - __p)})`;
                            _ctx.shadowBlur = 20;
                            const __g = _ctx.createRadialGradient(__bx, __by, 2, __bx, __by, __R);
                            __g.addColorStop(0, `rgba(${__c[0]},${__c[1]},${__c[2]},${0.42 * (1 - __p)})`);
                            __g.addColorStop(1, `rgba(${__c[0]},${__c[1]},${__c[2]},0)`);
                            _ctx.fillStyle = __g; _ctx.beginPath(); _ctx.arc(__bx, __by, __R, 0, Math.PI * 2); _ctx.fill();
                            _ctx.lineWidth = Math.max(1.5, 5 * (1 - __p));
                            _ctx.strokeStyle = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.95 * (1 - __p)})`;
                            _ctx.beginPath(); _ctx.arc(__bx, __by, __R, 0, Math.PI * 2); _ctx.stroke();
                            const __R2 = 14 + 42 * __p;
                            _ctx.strokeStyle = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.7 * (1 - __p)})`;
                            _ctx.beginPath(); _ctx.arc(__bx, __by, __R2, 0, Math.PI * 2); _ctx.stroke();
                            _ctx.restore();
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                        } else { this.__burstT0 = null; }
                    }

                    // Draw the two strands stacked VERTICALLY so they don't block each other:
                    // PASSENGER (sense) above, GUIDE (antisense) below. The GUIDE must be the actual
                    // SYNTHESIS sequence (the antisense that is ordered/made) — NOT the target — so the
                    // drawn chemistry (and the seed tint at positions 2-8) represents the exact
                    // structure created.
                    const _guide = ('' + (this.synthesisSequence || this.antisense || this.guide || this.sequence || '')).toUpperCase().replace(/T/g, 'U');
                    const _n = _guide.length || Math.max(1, Math.round(this.xf - this.xi));
                    // Passenger (sense) = the actual sense strand if we have it (same length as the
                    // guide core), else the reverse complement of the guide, 5'->3'.
                    let _pass = ('' + (this.sense || '')).toUpperCase().replace(/T/g, 'U');
                    if (_pass.length !== _guide.length) {
                        _pass = _guide.split('').reverse().map((b) => (b === 'A' ? 'U' : b === 'U' ? 'A' : b === 'G' ? 'C' : b === 'C' ? 'G' : 'N')).join('');
                    }
                    // guide is antiparallel to the target; passenger is parallel.
                    const _li = (p) => (this.strand >= 0 ? (_n - 1 - p) : p);   // guide position -> local base index
                    const _liP = (i) => (this.strand >= 0 ? i : (_n - 1 - i));  // passenger position -> local base index

                    // At max zoom each residue is drawn as a furanose sugar ring (sugar chemistry),
                    // which needs more vertical room, so spread the two lanes apart in that mode.
                    // Motion LOD: simple beads while panning (no sugar rings / phosphate glyphs).
                    const _lowDetail = !!(graph && graph.__lowDetail);
                    const sugarMode = screencell >= 34 && !_lowDetail;
                    const passY = ysc - (sugarMode ? 26 : 16);   // upper lane: passenger
                    const guideY = ysc + (sugarMode ? 6 : -2);   // lower lane: guide
                    // ── 3D beaded duplex (same polymer treatment as the ASO) ──────────────
                    // Each base is a shaded bead (radial-gradient highlight + drop shadow + specular
                    // dot), colored by base; the guide seed (positions 2-8) is tinted orange. Vertical
                    // rungs between the lanes represent the base pairs. When zoomed out (beads would be
                    // too tight) it collapses to the compact two-line duplex.
                    const BASE_COL = { A: '#2ca25f', C: '#2b7bba', G: '#d9a441', U: '#d1495b', T: '#d1495b', N: '#8894a5' };
                    const _cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
                    const _hx = (v) => _cl(v).toString(16).padStart(2, '0');
                    const _rgb = (hex) => { let h = ('' + hex).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
                    const _lit = (hex, a) => { try { const c = _rgb(hex); return '#' + _hx(c[0] + (255 - c[0]) * a) + _hx(c[1] + (255 - c[1]) * a) + _hx(c[2] + (255 - c[2]) * a); } catch (e) { return hex; } };
                    const _drk = (hex, a) => { try { const c = _rgb(hex); return '#' + _hx(c[0] * (1 - a)) + _hx(c[1] * (1 - a)) + _hx(c[2] * (1 - a)); } catch (e) { return hex; } };
                    const _per = Math.max(1, screencell);
                    const _R = Math.max(2.3, Math.min(sugarMode ? 8.5 : 7, _per * 0.42));
                    // Perf: cull residues off-screen, and cache the bead radial-gradient per color
                    // (built at the origin, positioned by translating the context).
                    const _CW = (_ctx && _ctx.canvas && _ctx.canvas.width) || 1e9;
                    const _visMin = -_R * 3, _visMax = _CW + _R * 3;
                    const _bgCache = {};
                    const _beadGrad = (col) => {
                        let gg = _bgCache[col];
                        if (!gg) { gg = _ctx.createRadialGradient(-_R * 0.35, -_R * 0.4, _R * 0.12, 0, 0, _R); gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.28, _lit(col, 0.5)); gg.addColorStop(1, col); _bgCache[col] = gg; }
                        return gg;
                    };
                    const _bead = (cx, cy, col, letter, letterCol) => {
                        if (!_ctx) return;
                        _ctx.save();
                        _ctx.translate(cx, cy);
                        _ctx.beginPath(); _ctx.arc(0, 0, _R, 0, Math.PI * 2); _ctx.fillStyle = _beadGrad(col); _ctx.fill();
                        _ctx.lineWidth = 1; _ctx.strokeStyle = _drk(col, 0.28); _ctx.stroke();
                        _ctx.beginPath(); _ctx.arc(-_R * 0.32, -_R * 0.36, Math.max(0.7, _R * 0.22), 0, Math.PI * 2); _ctx.fillStyle = 'rgba(255,255,255,0.75)'; _ctx.fill();
                        if (letter && _R >= 4.2) { _ctx.font = 'bold ' + Math.max(7, Math.min(12, Math.round(_R * 1.2))) + 'px "Segoe UI", Arial, sans-serif'; _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle'; _ctx.fillStyle = letterCol || '#0a2540'; _ctx.fillText(letter, 0, 0); }
                        _ctx.restore();
                    };

                    // ── Sugar chemistry (furanose rings) — the same treatment as the ASO/gapmer ──
                    const SI_SUGAR_COL = { moe: '#e0a83c', mo: '#e0a83c', ome: '#3aa39b', m: '#3aa39b', lna: '#8e5cc0', bna: '#8e5cc0', cet: '#5c9dc0', dna: '#8894a5', d: '#8894a5', rna: '#1aa3bd', r: '#1aa3bd', fana: '#c07a3c', f: '#c07a3c', '2f': '#c07a3c' };
                    const SI_SUGAR_2P = { moe: 'MOE', mo: 'MOE', ome: 'OMe', m: 'OMe', dna: 'H', d: 'H', rna: 'OH', r: 'OH', fana: 'F', f: 'F', '2f': 'F', lna: 'LNA', bna: 'LNA', cet: 'cEt' };
                    const SI_BRIDGED = { lna: 1, bna: 1, cet: 1 };
                    // Draw one residue as a furanose pentagon colored by its 2'-modification, with the
                    // ring oxygen, base letter, and the 2'-substituent label on the OUTER side of the
                    // duplex (side = -1 passenger/up, +1 guide/down) so it stays clear of the rungs.
                    const _sugarRing = (cx, cy, RR, sugarCode, side, letter, letterCol) => {
                        if (!_ctx) return;
                        const sc = ('' + (sugarCode || '')).toLowerCase();
                        const col = SI_SUGAR_COL[sc] || '#1aa3bd';
                        const flip = side < 0 ? 1 : -1;   // passenger apex up, guide apex down
                        const A = [-90, -18, 54, 126, 198].map((d) => d * Math.PI / 180);
                        const vx = A.map((a) => cx + RR * Math.cos(a)), vy = A.map((a) => cy + RR * Math.sin(a) * flip);
                        _ctx.save();
                        const g = _ctx.createRadialGradient(cx - RR * 0.3, cy - RR * 0.35, RR * 0.1, cx, cy, RR);
                        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, _lit(col, 0.5)); g.addColorStop(1, col);
                        _ctx.beginPath(); _ctx.moveTo(vx[0], vy[0]); for (let k = 1; k < 5; k++) _ctx.lineTo(vx[k], vy[k]); _ctx.closePath();
                        _ctx.fillStyle = g; _ctx.fill();
                        _ctx.lineWidth = 1.2; _ctx.strokeStyle = _drk(col, 0.3); _ctx.stroke();
                        if (SI_BRIDGED[sc]) { _ctx.strokeStyle = _drk(col, 0.15); _ctx.lineWidth = Math.max(1.4, RR * 0.18); _ctx.beginPath(); _ctx.moveTo(vx[2], vy[2]); _ctx.lineTo(vx[4], vy[4]); _ctx.stroke(); }   // locked LNA/cEt bridge
                        // ring oxygen at the apex
                        const oR = Math.max(2, RR * 0.28);
                        _ctx.beginPath(); _ctx.arc(vx[0], vy[0], oR, 0, Math.PI * 2); _ctx.fillStyle = '#ffffff'; _ctx.fill(); _ctx.lineWidth = 1; _ctx.strokeStyle = '#c0392b'; _ctx.stroke();
                        _ctx.font = 'bold ' + Math.max(6, Math.round(oR * 1.4)) + 'px "Segoe UI", Arial, sans-serif'; _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle'; _ctx.fillStyle = '#c0392b'; _ctx.fillText('O', vx[0], vy[0] + 0.5);
                        if (letter && RR >= 5) {
                            _ctx.font = 'bold ' + Math.max(7, Math.round(RR * 0.95)) + 'px "Segoe UI", Arial, sans-serif'; _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
                            _ctx.fillStyle = letterCol || '#0a2540'; _ctx.fillText(letter, cx, cy);
                        }
                        const lbl = SI_SUGAR_2P[sc];
                        if (lbl) {
                            const ly = cy + side * (RR + Math.max(6, RR * 0.7));
                            const lc = lbl === 'F' ? '#2e8b57' : lbl === 'OH' ? '#c0392b' : lbl === 'H' ? '#6b7a8c' : _drk(col, 0.15);
                            _ctx.font = 'bold ' + Math.max(7, Math.round(RR * 0.7)) + 'px "Segoe UI", Arial, sans-serif'; _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
                            _ctx.fillStyle = lc; _ctx.fillText(lbl, cx, ly);
                        }
                        _ctx.restore();
                    };
                    // Per-strand 2'-sugar codes from the HELM (RNA1 = passenger, RNA2 = guide).
                    const _grabSugars = (label) => {
                        const m = ('' + (this.structure || '')).match(new RegExp(label + '\\{([^}]*)\\}'));
                        if (!m) return [];
                        // Accept BOTH a bracketed multi-char sugar ([moe]) and a BARE single-char sugar
                        // (m/f/r/d) — normalizeStructure leaves single-char symbols unbracketed.
                        return m[1].split('.').map((u) => { const mm = u.match(/(?:\[([^\]]+)\]|([A-Za-z0-9+]+))\(([^)]*)\)/); return mm ? ('' + (mm[1] || mm[2] || '')).toLowerCase() : ''; });
                    };
                    // Sugars for a strand: parsed HELM when present, else the DEFAULT siRNA chemistry —
                    // alternating 2'-F / 2'-OMe (the common metabolic-stabilization pattern).
                    const _strandSugars = (label, len) => {
                        let s = _grabSugars(label);
                        if (!s.length || s.every((x) => !x)) { s = []; for (let i = 0; i < len; i++) s.push(i % 2 === 0 ? 'f' : 'ome'); }
                        return s;
                    };
                    // Linkages for a strand: parsed HELM when present, else the DEFAULT siRNA backbone —
                    // phosphorothioate (PS) at the two terminal linkages each end, phosphodiester (PO) core.
                    const _strandLinks = (label, len) => {
                        const parsed = _parseStrandLinks(this.structure)[label === 'RNA1' ? 'rna1' : 'rna2'];
                        if (parsed && parsed.length && parsed.some((x) => x)) return parsed;
                        const out = []; for (let i = 0; i < len; i++) out.push((i < 2 || i >= len - 3) ? 'sp' : 'po');
                        return out;
                    };

                    // Per-strand internucleoside linkage codes from the HELM structure
                    // (RNA1 = sense/passenger, RNA2 = antisense/guide). Each entry is the
                    // linkage FOLLOWING that residue ('' = unknown / 3' terminal).
                    const _parseStrandLinks = (structure) => {
                        const out = { rna1: [], rna2: [] };
                        if (!structure) return out;
                        const grab = (label) => {
                            const m = ('' + structure).match(new RegExp(label + '\\{([^}]*)\\}'));
                            if (!m) return [];
                            return m[1].split('.').map((u) => {
                                // Sugar bracketed or bare; trailing linkage bracketed ([sp]) or bare (p).
                                const mm = u.match(/(?:\[[^\]]+\]|[A-Za-z0-9+]+)\([^)]*\)(?:\[([^\]]+)\]|([A-Za-z0-9]+))?/);
                                return mm ? ('' + (mm[1] || mm[2] || '')).toLowerCase() : '';
                            });
                        };
                        out.rna1 = grab('RNA1');
                        out.rna2 = grab('RNA2');
                        return out;
                    };
                    // The phosphate glyph between two adjacent beads on a lane: P raised off the
                    // lane (side = -1 above for the passenger, +1 below for the guide), O–P–O
                    // bridging bonds to each sugar, a non-bridging =O, and the linkage-defining
                    // substituent — =S in gold for phosphorothioate (PS), O⁻ for phosphodiester (PO).
                    const _linkGlyph = (cx, nx, laneY, R, isPS, side) => {
                        if (!_ctx) return;
                        const mx = (cx + nx) / 2, Py = laneY + side * R * 0.85;
                        const bond = '#4b5560', red = '#c0392b', gold = '#d9a520';
                        const bw = Math.max(1.4, R * 0.16), oR = Math.max(3, R * 0.36);
                        const lsx = cx + R * 0.9, rsx = nx - R * 0.9;
                        _ctx.save(); _ctx.lineCap = 'round'; _ctx.lineJoin = 'round';
                        const _bond = (x1, y1, x2, y2, col, w, dbl) => {
                            _ctx.strokeStyle = col; _ctx.lineWidth = w;
                            if (!dbl) { _ctx.beginPath(); _ctx.moveTo(x1, y1); _ctx.lineTo(x2, y2); _ctx.stroke(); return; }
                            const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
                            const ox = -dy / L * Math.max(1.4, w * 0.9), oy = dx / L * Math.max(1.4, w * 0.9);
                            _ctx.beginPath(); _ctx.moveTo(x1 + ox, y1 + oy); _ctx.lineTo(x2 + ox, y2 + oy);
                            _ctx.moveTo(x1 - ox, y1 - oy); _ctx.lineTo(x2 - ox, y2 - oy); _ctx.stroke();
                        };
                        const _atom = (ax, ay, sym, col, ar) => {
                            _ctx.beginPath(); _ctx.arc(ax, ay, ar, 0, Math.PI * 2); _ctx.fillStyle = '#ffffff'; _ctx.fill();
                            _ctx.lineWidth = 1.2; _ctx.strokeStyle = col; _ctx.stroke();
                            _ctx.font = 'bold ' + Math.max(7, Math.round(ar * 1.5)) + 'px "Segoe UI", Arial, sans-serif';
                            _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle'; _ctx.fillStyle = col; _ctx.fillText(sym, ax, ay + 0.5);
                        };
                        _bond(lsx, laneY, mx, Py, bond, bw, false);
                        _bond(rsx, laneY, mx, Py, bond, bw, false);
                        _atom((lsx + mx) / 2, (laneY + Py) / 2, 'O', red, oR);
                        _atom((rsx + mx) / 2, (laneY + Py) / 2, 'O', red, oR);
                        const upY = Py + side * R * 1.15, dxo = R * 0.62;
                        _bond(mx, Py, mx - dxo, upY, red, bw, true);
                        _atom(mx - dxo, upY, 'O', red, oR);
                        if (isPS) { _bond(mx, Py, mx + dxo, upY, gold, bw + 0.4, true); _atom(mx + dxo, upY, 'S', gold, oR + 0.6); }
                        else {
                            _bond(mx, Py, mx + dxo, upY, red, bw, false); _atom(mx + dxo, upY, 'O', red, oR);
                            _ctx.font = 'bold ' + Math.max(7, Math.round(oR)) + 'px Arial'; _ctx.textAlign = 'left'; _ctx.textBaseline = 'middle';
                            _ctx.fillStyle = red; _ctx.fillText('–', mx + dxo + oR * 0.7, upY - oR * 0.6);
                        }
                        _atom(mx, Py, 'P', isPS ? '#b8860b' : '#6b4fbb', oR + 1);
                        _ctx.restore();
                    };
                    // Draw the phosphate chemistry along one strand between adjacent beads,
                    // only where the linkage is a known PS/PO (mirrors the ASO's honest behavior).
                    const _drawStrandChem = (seqLen, mapIndex, links, laneY, side) => {
                        for (let q = 0; q < seqLen - 1; q++) {
                            const lk = ('' + (links[q] || '')).toLowerCase();
                            const isPS = (lk === 'sp' || lk === 'ps'), isPO = (lk === 'po' || lk === 'p');
                            if (!isPS && !isPO) continue;
                            const cxA = graph.X(tgraph.X(this.xi + mapIndex(q))) + _per / 2;
                            const cxB = graph.X(tgraph.X(this.xi + mapIndex(q + 1))) + _per / 2;
                            if (Math.max(cxA, cxB) < _visMin || Math.min(cxA, cxB) > _visMax) continue;   // off-screen
                            _linkGlyph(Math.min(cxA, cxB), Math.max(cxA, cxB), laneY, _R, isPS, side);
                        }
                    };

                    if (_ctx && screencell >= 3.2) {
                        // Thin backbone behind each lane's beads — omit at full chemistry zoom
                        // (sugarMode), where the sugar-ring/backbone glyphs already carry the strand.
                        if (!sugarMode) {
                            this.drawLine(graph, tgraph.X(this.xi), passY, tgraph.X(this.xf), 'rgba(90,120,150,0.55)', 3, 'round');
                            this.drawLine(graph, tgraph.X(this.xi), guideY, tgraph.X(this.xf), 'rgba(10,37,64,0.55)', 3, 'round');
                        }
                        // base-pair rungs between the two lanes
                        _ctx.save(); _ctx.strokeStyle = 'rgba(120,140,160,0.45)'; _ctx.lineWidth = Math.max(1, _R * 0.28);
                        for (let i = 0; i < _n; i++) { const cx = graph.X(tgraph.X(this.xi + i)) + _per / 2; if (cx < _visMin || cx > _visMax) continue; _ctx.beginPath(); _ctx.moveTo(cx, passY + _R); _ctx.lineTo(cx, guideY - _R); _ctx.stroke(); }
                        _ctx.restore();
                        if (sugarMode) {
                            // Max zoom: furanose sugar rings per residue (sugar chemistry), colored by
                            // 2'-modification with 2' labels — HELM-driven, or the default siRNA pattern.
                            const _pSug = _strandSugars('RNA1', _pass.length);
                            const _gSug = _strandSugars('RNA2', _guide.length);
                            for (let i = 0; i < _pass.length; i++) { const cx = graph.X(tgraph.X(this.xi + _liP(i))) + _per / 2; if (cx < _visMin || cx > _visMax) continue; _sugarRing(cx, passY, _R, _pSug[i], -1, _pass[i], '#0a2540'); }
                            for (let p = 0; p < _guide.length; p++) { const cx = graph.X(tgraph.X(this.xi + _li(p))) + _per / 2; if (cx < _visMin || cx > _visMax) continue; const isSeed = (p >= 1 && p <= 7); _sugarRing(cx, guideY, _R, _gSug[p], 1, _guide[p], isSeed ? '#b5480a' : '#0a2540'); }
                        } else {
                            // passenger (sense) beads on the upper lane
                            for (let i = 0; i < _pass.length; i++) { const cx = graph.X(tgraph.X(this.xi + _liP(i))) + _per / 2; if (cx < _visMin || cx > _visMax) continue; _bead(cx, passY, BASE_COL[_pass[i]] || BASE_COL.N, _pass[i], '#ffffff'); }
                            // guide (antisense) beads on the lower lane — seed (2-8) tinted orange
                            for (let p = 0; p < _guide.length; p++) { const cx = graph.X(tgraph.X(this.xi + _li(p))) + _per / 2; if (cx < _visMin || cx > _visMax) continue; const isSeed = (p >= 1 && p <= 7); _bead(cx, guideY, isSeed ? '#ff8c42' : (BASE_COL[_guide[p]] || BASE_COL.N), _guide[p], isSeed ? '#3a1500' : '#ffffff'); }
                        }
                        // Zoomed all the way in: draw the PS/PO backbone chemistry on BOTH strands —
                        // passenger phosphates above its lane, guide phosphates below its lane. Uses the
                        // parsed HELM linkages, or the default siRNA backbone (PS termini / PO core).
                        if (screencell >= 30 && !_lowDetail) {
                            _drawStrandChem(_pass.length, _liP, _strandLinks('RNA1', _pass.length), passY, -1);   // passenger, above
                            _drawStrandChem(_guide.length, _li, _strandLinks('RNA2', _guide.length), guideY, 1);   // guide, below
                        }
                    } else {
                        // Zoomed out: compact two-line duplex (passenger over guide).
                        this.drawLine(graph, tgraph.X(this.xi), passY, tgraph.X(this.xf), 'rgba(90,120,150,0.95)', 9, 'round');
                        this.drawLine(graph, tgraph.X(this.xi), guideY, tgraph.X(this.xf), 'navy', 11, 'round');
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
                            const _fsz = Math.max(8, Math.min(14, Math.floor(screencell)));
                            _ctx.font = _fsz + 'px monospace';
                            _ctx.textAlign = 'center';
                            _ctx.textBaseline = 'middle';
                            for (let k = 0; k < ohStr.length; k++) {
                                const cx = graph.X(tgraph.X(this.xi + edgeLocal + dir * (k + 1))) + Math.max(1, screencell) / 2;
                                // Background circle around each overhang nucleotide — ONLY when the
                                // chemistry is showing (sugarMode). Otherwise just print the letter.
                                if (sugarMode) {
                                    _ctx.beginPath();
                                    _ctx.fillStyle = '#eef3f8';
                                    _ctx.arc(cx, laneY, _fsz * 0.72, 0, 2 * Math.PI);
                                    _ctx.fill();
                                    _ctx.lineWidth = 1;
                                    _ctx.strokeStyle = 'rgba(90,120,150,0.7)';
                                    _ctx.stroke();
                                }
                                _ctx.fillStyle = '#5a6b7a';
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

                    // At full chemistry zoom, label the 5'/3' ends of each strand (just beyond the
                    // strand's true extent, including any 3' overhang), correctly oriented by strand.
                    if (sugarMode && _ctx) {
                        const plus = (this.strand >= 0);
                        const gLeft = plus ? (0 - _gOh.length) : 0;
                        const gRight = plus ? _n : (_n + _gOh.length);
                        const pLeft = plus ? 0 : (0 - _sOh.length);
                        const pRight = plus ? (_n + _sOh.length) : _n;
                        _ctx.save();
                        _ctx.font = 'bold 11px monospace';
                        _ctx.textBaseline = 'middle';
                        _ctx.fillStyle = '#5a6b7a';
                        const lab = (localX, laneY, text, outLeft) => {
                            const x = graph.X(tgraph.X(this.xi + localX));
                            _ctx.textAlign = outLeft ? 'right' : 'left';
                            _ctx.fillText(text, x + (outLeft ? -6 : 6), laneY);
                        };
                        // guide (antisense) lane
                        lab(gLeft, guideY, plus ? "3'" : "5'", true);
                        lab(gRight, guideY, plus ? "5'" : "3'", false);
                        // passenger (sense) lane
                        lab(pLeft, passY, plus ? "5'" : "3'", true);
                        lab(pRight, passY, plus ? "3'" : "5'", false);
                        // Strand-type labels on the FAR RIGHT, after the 3'/5' orientation labels:
                        // the sense strand is the PASSENGER (upper lane), the antisense is the GUIDE.
                        const __rx = graph.X(tgraph.X(this.xi + Math.max(gRight, pRight, _n))) + 30;
                        _ctx.textAlign = 'left';
                        _ctx.font = 'bold 10px "Segoe UI", monospace';
                        _ctx.fillStyle = '#5a6b7a';
                        _ctx.fillText('passenger', __rx, passY);
                        _ctx.fillText('guide', __rx, guideY);
                        _ctx.restore();
                    }

                    if (graph.canvas) {
                        var ctx = graph.canvas.getCTX();

                        // Off-target count badge + gene-symbol annotations. Works for BOTH
                        // an array of hits and a large-count STRING (>1000 hits).
                        if (this.offtarget != null) this.offtargetsRun = true;
                        this.__otBadge = null;   // screen rect of the count badge (for click → stats)
                        // Only show the off-target count when the track SEQUENCE is visible (zoomed in
                        // enough to draw base letters, screencell > 5) — hide it when zoomed out.
                        if (screencell > 5 && this.showOfftargets && this.offtarget != null) {
                            const _off = this.offtarget;
                            // Badge shows the OFF-TARGET COUNT (number of hit sites), NOT the number
                            // of distinct genes/symbols. Array → hit count; large-count STRING (>1000)
                            // → that number.
                            const _cnt = Array.isArray(_off)
                                ? _off.length
                                : (parseInt(_off, 10) || 0);
                            ctx.save();
                            // Professional off-target count "pill": rounded, soft shadow, a small
                            // target dot, and clean typography.
                            const countStr = '' + _cnt;
                            ctx.font = '600 10px "Segoe UI", system-ui, Arial, sans-serif';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            const __rr = (c, x, y, w, h, r) => {
                                if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
                                c.beginPath();
                                c.moveTo(x + r, y);
                                c.arcTo(x + w, y, x + w, y + h, r);
                                c.arcTo(x + w, y + h, x, y + h, r);
                                c.arcTo(x, y + h, x, y, r);
                                c.arcTo(x, y, x + w, y, r);
                                c.closePath();
                            };
                            const tw = ctx.measureText(countStr).width;
                            const dot = 5;                    // target dot diameter
                            const padL = 7, padR = 8, gap = 5;
                            const bh = 16;
                            const bw = padL + dot + gap + tw + padR;
                            const bx = graph.X(tgraph.X(this.xf)) + 8;
                            const by = (ysc - 4) - bh / 2;     // vertically centered on the guide line
                            const sel = this.selected;
                            // Soft drop shadow.
                            ctx.shadowColor = 'rgba(8,22,38,0.35)';
                            ctx.shadowBlur = 5;
                            ctx.shadowOffsetY = 1;
                            __rr(ctx, bx, by, bw, bh, bh / 2);
                            ctx.fillStyle = sel ? '#c0392b' : '#0f3a4d';
                            ctx.fill();
                            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                            // Hairline border.
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = sel ? '#e06a5c' : '#1aa3bd';
                            __rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, (bh - 1) / 2);
                            ctx.stroke();
                            // Target dot.
                            ctx.beginPath();
                            ctx.fillStyle = sel ? '#ffd7d0' : '#4fd0e6';
                            ctx.arc(bx + padL + dot / 2, by + bh / 2, dot / 2, 0, 2 * Math.PI);
                            ctx.fill();
                            // Count.
                            ctx.fillStyle = '#eaf6f9';
                            ctx.fillText(countStr, bx + padL + dot + gap, by + bh / 2 + 0.5);
                            // Remember the badge's screen rect so a click on it opens the stats popup.
                            this.__otBadge = { x: bx, y: by, w: bw, h: bh };
                            // Off-target gene symbols are intentionally NOT drawn for siRNA — the
                            // count badge alone keeps the track clean (the symbol list was too messy).
                            ctx.restore();
                        } else if (screencell > 5 && this.showOfftargets && this.offtargetsRun && this.offtarget == null) {
                            // Searched and found NO off-targets — show a clean "0" (only when the
                            // sequence is visible). Only when off-targets were actually RUN.
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

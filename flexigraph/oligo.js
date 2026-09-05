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
            showOfftargets = true;   // track-level show/hide toggle (propagated by the track each draw)
            // True only once off-targets have actually been RUN for this oligo (set by the
            // runners, e.g. run-off-targets.js, and by draw() when a result is assigned).
            // Gates the "0" (searched-but-empty) badge so an oligo that was never searched
            // shows NO off-target label — letting the user see which oligos have been run.
            offtargetsRun = false;
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
                const c = color || 'magenta';
                this.highlight__ = c;

                // A compound that just LANDED (a long magenta highlight, as fired on add) sets off
                // a one-shot expanding burst AND blinks a couple of times before fading, so the user
                // can see where it landed. Brief hover highlights (short delay) don't burst/blink.
                if (c === 'magenta' && delay && delay >= 1200) {
                    try { this.landingBurst('magenta'); } catch (e) { }
                    try { this.__blinkHighlight(c, delay); } catch (e) { this.highlight__ = false; }
                    return;
                }

                if (delay && delay > 0) {
                    setTimeout(() => {
                        this.highlight__ = false;
                    }, delay);
                }
            }

            // Blink the landing glow on/off a few times over `delay` ms, ending faded (off).
            __blinkHighlight(color, delay) {
                const wake = () => { try { const g = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed) ? CurrentLayout.getStashed('graph') : null; if (g && g.wake) g.wake(); } catch (e) { } };
                const onPhases = 3;                 // number of ON flashes
                const total = onPhases * 2;         // on/off steps
                const period = Math.max(180, Math.floor(delay / total));
                let n = 0;
                const step = () => {
                    this.highlight__ = (n % 2 === 0) ? color : false;   // even = on, odd = off
                    wake();
                    n++;
                    if (n < total) setTimeout(step, period);
                    else { this.highlight__ = false; wake(); }
                };
                step();
            }

            // Start a one-shot expanding "landing burst" centred on the compound (see draw()).
            landingBurst(color) {
                try { this.__burstT0 = Date.now(); this.__burstColor = color || 'magenta'; this.__burstMs = 950; } catch (e) { }
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

                // The shape for this compound's type -- and a REAL fallback when there is
                // none. Missing key used to mean the draw below fell through to a bare
                // graph.drawLine in this.color, which for a compound with no colour set is a
                // black line: no beads, no sugars, no linkers, nothing that says what it is.
                //
                // chem_draw has keys for gapmer / aso / steric_blocking_aso / siRNA and not
                // for everything a designer or an importer can produce, and a type that only
                // differs by case or by a hyphen ('ASO', 'steric-blocking-aso') misses too.
                // So: normalise the lookup, then fall back to the ASO polymer, which draws
                // whatever the HELM in `structure` actually says -- sugars, bases and the
                // PS/PO linkages -- rather than to a line that says nothing.
                //
                // The polymer is the right fallback rather than a neutral one: every
                // single-stranded oligo in this app is that polymer, and one whose type this
                // file has not heard of is far more likely to be a variant spelling of one of
                // them than something that should render as a stick.
                // Say which type had no shape, once per type per session. A compound that
                // renders as a plain line is a question this file cannot answer on its own --
                // it depends what the thing that created it set as the type -- and without
                // this the only way to find out is to guess.
                if (!this.__warnNoShape) {
                    this.__warnNoShape = () => {
                        try {
                            const t = '' + (this.type == null ? '(none)' : this.type);
                            window.__bajaNoShape = window.__bajaNoShape || {};
                            if (window.__bajaNoShape[t]) return;
                            window.__bajaNoShape[t] = 1;
                            console.warn('[chem-draw] no shape for oligo type ' + JSON.stringify(t)
                                + ' and no structure to draw from - rendered as a plain line.');
                        } catch (e) { }
                    };
                }
                if (!this.shapeFunction || !this.detailedShapeFunction) {
                    const __key = (t, suffix) => {
                        const raw = '' + (t == null ? '' : t);
                        if (chem_draw[raw + suffix]) return raw + suffix;
                        const norm = raw.toLowerCase().replace(/[\s-]+/g, '_');
                        for (const k of Object.keys(chem_draw)) {
                            const kn = k.toLowerCase();
                            if (kn === norm + suffix) return k;
                        }
                        return null;
                    };
                    const __shape = (suffix, thin) => {
                        const k = __key(this.type, suffix);
                        if (k) return getIon(chem_draw[k]);
                        // Unknown type: the ASO polymer, but only for a compound that HAS
                        // chemistry to draw. With a HELM there is a real answer and a line is
                        // hiding it; without one the polymer would be inventing a backbone,
                        // and a primer or a marker is better left as the mark it was.
                        if (this.structure) return getIon(chem_draw[thin ? 'aso.detailed' : 'aso']);
                        return null;
                    };
                    if (!this.shapeFunction) this.shapeFunction = __shape('', false);
                    if (!this.detailedShapeFunction) this.detailedShapeFunction = __shape('.detailed', true);
                }

                const screenX1 = graph.X(tgraph.X(this.xi));
                const screenX2 = graph.X(tgraph.X(this.xf));
                const screenY = graph.Y(tgraph.Y(y));
                const screenMidX = (screenX1 + screenX2) / 2;

                // Don't draw anything that isn't on the screen: if this oligo's whole span
                // (plus a margin for badges/labels that extend past the body) is off-canvas,
                // skip it entirely — a huge saving when zoomed in with many oligos loaded.
                const _cw = (ctx.canvas && ctx.canvas.width) || 1e9;
                const _ch = (ctx.canvas && ctx.canvas.height) || 1e9;
                const _loX = Math.min(screenX1, screenX2), _hiX = Math.max(screenX1, screenX2);
                const _mgn = 140;
                if (_hiX < -_mgn || _loX > _cw + _mgn || screenY < -_mgn || screenY > _ch + _mgn) return;

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
                        const named = { magenta: [255, 0, 255], purple: [155, 48, 255], cyan: [0, 255, 255], red: [255, 0, 0], maroon: [128, 0, 0], navy: [10, 37, 64], yellow: [255, 230, 0], lime: [0, 255, 0], green: [0, 128, 0], orange: [255, 165, 0] };
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

                // One-shot "landing burst": an expanding, fading ring at a DECENT fixed screen
                // size (independent of zoom) so a just-placed compound is easy to spot even when
                // zoomed way out. Triggered by landingBurst() when a compound is added/mapped.
                if (this.__burstT0 && ctx) {
                    const __el = Date.now() - this.__burstT0;
                    const __ms = this.__burstMs || 950;
                    if (__el >= 0 && __el < __ms) {
                        const __p = __el / __ms;                                   // 0..1
                        const __named = { magenta: [255, 0, 255], cyan: [0, 255, 255], lime: [0, 255, 0], orange: [255, 165, 0], red: [255, 0, 0] };
                        const __c = __named[('' + (this.__burstColor || 'magenta')).toLowerCase()] || [255, 0, 255];
                        const __bx = screenMidX, __by = screenY;
                        const __R = 30 + 64 * __p;                                 // 30 -> 94 px
                        ctx.save();
                        ctx.shadowColor = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.85 * (1 - __p)})`;
                        ctx.shadowBlur = 20;
                        const __g = ctx.createRadialGradient(__bx, __by, 2, __bx, __by, __R);
                        __g.addColorStop(0, `rgba(${__c[0]},${__c[1]},${__c[2]},${0.42 * (1 - __p)})`);
                        __g.addColorStop(1, `rgba(${__c[0]},${__c[1]},${__c[2]},0)`);
                        ctx.fillStyle = __g; ctx.beginPath(); ctx.arc(__bx, __by, __R, 0, Math.PI * 2); ctx.fill();
                        ctx.lineWidth = Math.max(1.5, 5 * (1 - __p));
                        ctx.strokeStyle = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.95 * (1 - __p)})`;
                        ctx.beginPath(); ctx.arc(__bx, __by, __R, 0, Math.PI * 2); ctx.stroke();
                        const __R2 = 14 + 42 * __p;
                        ctx.strokeStyle = `rgba(${__c[0]},${__c[1]},${__c[2]},${0.7 * (1 - __p)})`;
                        ctx.beginPath(); ctx.arc(__bx, __by, __R2, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    } else { this.__burstT0 = null; }
                }

                // Targeting "gunsight" reticle drawn on the oligo currently being run
                // through off-target search (set/cleared by run-off-targets.js). A red
                // crosshair — concentric rings + N/S/E/W ticks + center dot — that pulses.
                if (this.__gunsight && ctx) {
                    const gx = screenMidX, gy = screenY;
                    const pulse = (typeof graph.__pulse === 'number') ? graph.__pulse : 0.6;
                    const R = 20 + 3 * pulse;
                    const Ri = R * 0.45;
                    ctx.save();
                    ctx.strokeStyle = '#ff3b30';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = 'rgba(255,59,48,0.9)';
                    ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke();       // outer ring
                    ctx.beginPath(); ctx.arc(gx, gy, Ri, 0, Math.PI * 2); ctx.stroke();      // inner ring
                    const tk = 8;   // tick length beyond the outer ring
                    ctx.beginPath();
                    ctx.moveTo(gx - R - tk, gy); ctx.lineTo(gx - Ri, gy);   // W
                    ctx.moveTo(gx + Ri, gy); ctx.lineTo(gx + R + tk, gy);   // E
                    ctx.moveTo(gx, gy - R - tk); ctx.lineTo(gx, gy - Ri);   // N
                    ctx.moveTo(gx, gy + Ri); ctx.lineTo(gx, gy + R + tk);   // S
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#ff3b30';
                    ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2); ctx.fill();       // center dot
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

                // Professional off-target count badge — a centered rounded pill with a soft shadow,
                // a small target dot and clean typography (selected → red accent).
                const drawOffTargetBadge = (count, offsetY = 0) => {
                    if (count == null) return;
                    const label = String(count).trim();
                    if (!label) return;
                    const sel = this.selected;
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.font = '600 10px "Segoe UI", system-ui, Arial, sans-serif';
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
                    const tw = ctx.measureText(label).width;
                    const dot = 5, padL = 7, padR = 8, gap = 5, bh = 16;
                    const bw = padL + dot + gap + tw + padR;
                    const bx = Math.round(screenMidX - bw / 2);
                    const by = Math.round(screenY + offsetY - bh / 2);
                    ctx.shadowColor = 'rgba(8,22,38,0.35)';
                    ctx.shadowBlur = 5;
                    ctx.shadowOffsetY = 1;
                    __rr(ctx, bx, by, bw, bh, bh / 2);
                    ctx.fillStyle = sel ? '#c0392b' : '#0f3a4d';
                    ctx.fill();
                    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = sel ? '#e06a5c' : '#1aa3bd';
                    __rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, (bh - 1) / 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.fillStyle = sel ? '#ffd7d0' : '#4fd0e6';
                    ctx.arc(bx + padL + dot / 2, by + bh / 2, dot / 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.fillStyle = '#eaf6f9';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, bx + padL + dot + gap, by + bh / 2 + 0.5);
                    // Remember the badge's screen rect so a click on it opens the stats popup.
                    this.__otBadge = { x: bx, y: by, w: bw, h: bh };
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
                            this.__overlapsAmplicon ? "magenta" : this.color,
                            this.structure
                        );
                    } else {
                        // Reached only by a compound with no chemistry AND no shape for its
                        // type. this.color is often unset on those, and drawLine with an
                        // undefined colour paints BLACK -- a 1px black line that reads as a
                        // stray mark rather than a compound. Teal is the app's oligo colour.
                        await graph.drawLine(
                            tgraph.X(this.xi),
                            tgraph.Y(y),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.__overlapsAmplicon ? "magenta" : (this.color || '#159a91'),
                            2,
                            "round"
                        );
                        this.__warnNoShape();
                    }

                    // Oligo overlaps an amplicon on this track — warn: magenta body (above)
                    // plus a warning label so it's unmistakable.
                    if (this.__overlapsAmplicon) {
                        drawCenteredOvalLabel("⚠ overlaps amplicon", -40, {
                            font: "10px Arial",
                            textColor: "magenta",
                            fillColor: "white",
                            strokeColor: "magenta",
                        });
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
                    if (this.offtarget != null) { this.showOfftargets = true; this.offtargetsRun = true; }

                    // Only surface off-targets once the oligo is actually drawn as a polymer.
                    // When zoomed out it renders as a plain line (per/screencell < 3.2), and the
                    // off-target badge/labels are suppressed at that scale.
                    // Only show the off-target count when the track SEQUENCE is visible (zoomed in
                    // enough to draw base letters, screencell > 5) — hide it when zoomed out.
                    const _offtargetVisible = screencell > 5;
                    this.__otBadge = null;   // screen rect of the count badge (for click → stats)
                    if (_offtargetVisible && this.showOfftargets && this.offtarget != null) {
                        if (Array.isArray(this.offtarget)) {
                            // Gene-name annotations only draw once the track is zoomed in
                            // enough to render the sequence target (screencell > 5, the
                            // same threshold the track uses to draw base letters).
                            if (screencell > 5 && this.offtargetsymbols && this.offtargetsymbols.length > 0) {
                                // Comma-delimited on a single line above the oligo — not
                                // fanned in an arc (which overlaps when there are several).
                                // Show at most the first 10 genes, then "…" (avoid a runaway line).
                                const __syms = this.offtargetsymbols
                                    .map((s) => String(s).trim())
                                    .filter(Boolean);
                                const symText = __syms.slice(0, 10).join(", ") + (__syms.length > 10 ? ", …" : "");
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

                            // Badge shows the OFF-TARGET COUNT (number of hit sites), NOT the number
                            // of distinct genes/symbols.
                            const hitN = this.offtarget.length;
                            drawOffTargetBadge(hitN, -12);
                        } else if (typeof this.offtarget === "string") {
                            // Large-count case: this.offtarget is the raw hit-count string (>1000).
                            const strN = (parseInt(this.offtarget, 10) || this.offtarget);
                            drawOffTargetBadge(strN, -12);
                        }
                    } else if (_offtargetVisible && this.showOfftargets && this.offtargetsRun && this.offtarget == null) {
                        // Searched, but the off-target result came back NULL — the oligo could not be
                        // searched (genome/strand not indexed, or a per-oligo failure). This is "not
                        // determined", NOT a genuine zero (a real 0-hit result is stored as "0" and
                        // draws "0" via the string branch above), so show N/A. Only when off-targets
                        // were actually RUN (offtargetsRun); an oligo never searched shows no label.
                        drawCenteredOvalLabel('NA', -12, {
                            font: "10px Arial",
                            textColor: "#b45309",
                            fillColor: "white",
                            strokeColor: "#b45309",
                        });
                    }
                } else {
                    if (this.detailedShapeFunction) {
                        this.detailedShapeFunction(
                            graph,
                            tgraph.X(this.xi),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.__overlapsAmplicon ? "magenta" : this.color,
                            this.structure
                        );
                    } else {
                        // Reached only by a compound with no chemistry AND no shape for its
                        // type. this.color is often unset on those, and drawLine with an
                        // undefined colour paints BLACK -- a 1px black line that reads as a
                        // stray mark rather than a compound. Teal is the app's oligo colour.
                        await graph.drawLine(
                            tgraph.X(this.xi),
                            tgraph.Y(y),
                            tgraph.X(this.xf),
                            tgraph.Y(y),
                            this.__overlapsAmplicon ? "magenta" : (this.color || '#159a91'),
                            2,
                            "round"
                        );
                        this.__warnNoShape();
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

                // The 3D polymer schematic (chem-draw beads) already renders the base letters for
                // these types, so skip this older per-base green overlay to avoid drawing the oligo
                // sequence twice. Other types (amplicon, primer-probe, …) still use it.
                if (this.type === 'aso' || this.type === 'gapmer' || this.type === 'siRNA' || this.type === 'sirna') return;

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

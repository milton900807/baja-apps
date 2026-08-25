function () {

    return new Promise(async (resolve, reject) => {
        let chem_draw = await exec('flexigraph/chem-draw.js')
        function createButtonSprite(radius) {
            const size = Math.ceil((radius + 6) * 2);
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;

            const ctx = c.getContext('2d');
            const cx = size / 2;
            const cy = size / 2;

            ctx.beginPath();
            ctx.arc(cx, cy + 1, radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy - 0.6, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(214,4,233,0.9)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.stroke();

            return c;
        }
        var complement = {
            'C': 'G',
            'G': 'C',
            'A': 'T',
            'T': 'A',
            'N': 'N',
            ',': ','
        }

        function drawButton(ctx, x, y, w, h, label = "", opts = {}) {
            const r = Math.min(8, h * 0.3);
            const pressed = !!opts.pressed;

            const fill = opts.fill || (pressed ? "#8fb6ff" : "#a7c7ff");
            const fillTop = opts.fillTop || (pressed ? "#9fc0ff" : "#c7dcff");
            const stroke = opts.stroke || "#4a6fb3";
            const textColor = opts.textColor || "#1f3f73";
            const shadow = opts.shadow || "rgba(0,0,0,0.12)";

            const oy = pressed ? 1 : 0;

            if (!pressed) {
                ctx.beginPath();
                ctx.moveTo(x + r, y + 1);
                ctx.lineTo(x + w - r, y + 1);
                ctx.quadraticCurveTo(x + w, y + 1, x + w, y + r + 1);
                ctx.lineTo(x + w, y + h - r + 1);
                ctx.quadraticCurveTo(x + w, y + h + 1, x + w - r, y + h + 1);
                ctx.lineTo(x + r, y + h + 1);
                ctx.quadraticCurveTo(x, y + h + 1, x, y + h - r + 1);
                ctx.lineTo(x, y + r + 1);
                ctx.quadraticCurveTo(x, y + 1, x + r, y + 1);
                ctx.closePath();
                ctx.fillStyle = shadow;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.moveTo(x + r, y + oy);
            ctx.lineTo(x + w - r, y + oy);
            ctx.quadraticCurveTo(x + w, y + oy, x + w, y + r + oy);
            ctx.lineTo(x + w, y + h - r + oy);
            ctx.quadraticCurveTo(x + w, y + h + oy, x + w - r, y + h + oy);
            ctx.lineTo(x + r, y + h + oy);
            ctx.quadraticCurveTo(x, y + h + oy, x, y + h - r + oy);
            ctx.lineTo(x, y + r + oy);
            ctx.quadraticCurveTo(x, y + oy, x + r, y + oy);
            ctx.closePath();

            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            const inset = 2;
            const hiH = Math.max(3, h * 0.42);

            ctx.beginPath();
            ctx.moveTo(x + r, y + inset + oy);
            ctx.lineTo(x + w - r, y + inset + oy);
            ctx.quadraticCurveTo(x + w - inset, y + inset + oy, x + w - inset, y + r + oy);
            ctx.lineTo(x + w - inset, y + hiH + oy);
            ctx.lineTo(x + inset, y + hiH + oy);
            ctx.lineTo(x + inset, y + r + oy);
            ctx.quadraticCurveTo(x + inset, y + inset + oy, x + r, y + inset + oy);
            ctx.closePath();

            ctx.fillStyle = fillTop;
            ctx.fill();

            if (label) {
                ctx.fillStyle = textColor;
                ctx.font = opts.font || "12px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, x + w / 2, y + h / 2 + oy);
            }
        }

        let snpindel = class SnpIndel {
            name;
            id;
            xi;
            xf;
            y;
            _color = null; // use backing field
            detailedShapeFunction = null;
            shapeFunction = null;
            annotations;
            strand;
            type;
            structure = '';
            alternate;
            reference;
            phase;
            transcriptStrand;
            sequence;
            reference0;
            alternate0;
            phaseset;
            highlight = false;
            clinsig = null;
            clindn = null;
            quality = null;
            uid = uuid();
            _shapesResolved = false;

            static _buttonPaths = {};

            constructor(type, xi, reference, alternate, phase, transcriptStrand, id, phaseset, color = null) {
                this.type = type;
                this.transcriptStrand = transcriptStrand;
                this.reference = reference;
                this.alternate = alternate;

                if (this.transcriptStrand == 1) {
                    this.sequence = alternate;
                    this.reference0 = reference;
                    this.alternate0 = alternate;
                } else {
                    this.sequence = alternate.replace(/[A,C,T,G,N]/gi, m => complement[m]);
                    this.reference0 = reference.replace(/[A,C,T,G,N]/gi, m => complement[m]);
                    this.alternate0 = alternate.replace(/[A,C,T,G,N]/gi, m => complement[m]);
                }

                if (this.type === 'snp') {
                    this.xi = xi;
                } else if (this.type === 'ins') {
                    this.xi = xi;
                    this.sequence = this.sequence.slice(1);
                } else if (this.type === 'del') {
                    this.xi = xi;
                    this.sequence = this.sequence.slice(1);
                }

                this.xf = xi + reference.length;
                this.phase = phase;

                if (this.phase == 1) {
                    this.y = 0.075;
                } else {
                    this.y = -0.075;
                }

                // set default/fallback color once
                this.color = color ?? this.defaultColor;

                if (!id) {
                    this.id = Math.round(new Date() / 1000) + '_' + this.xi + '_' + this.phase;
                } else {
                    this.id = id;
                }

                this.name = type + xi;

                let tmpstructure = '';
                for (let base of this.sequence) {
                    tmpstructure += '(' + base + ')';
                }
                this.structure = tmpstructure;
                this.phaseset = phaseset;

                SnpIndel._resolveShapeFunctions(this);
            }

            // default color based on phase
            get defaultColor() {
                return this.phase === 1 ? '#C2410C' : '#0F766E';
            }

            // getter/setter for instance coloring
            get color() {
                return this._color ?? this.defaultColor;
            }

            set color(value) {
                this._color = value || null;
            }

            static _resolveShapeFunctions(instance) {
                if (instance._shapesResolved) return;

                const key = chem_draw?.[instance.type];
                instance.shapeFunction = key ? getIon(key) : null;

                const keyDetailed = chem_draw?.[instance.type + '.detailed'];
                instance.detailedShapeFunction = keyDetailed ? getIon(keyDetailed) : null;

                instance._shapesResolved = true;
            }

            static getButtonPaths(radius) {
                const key = radius | 0;
                if (this._buttonPaths[key]) return this._buttonPaths[key];

                const r = key;
                const outer = r + 1.8;

                const shadow = new Path2D();
                shadow.arc(0, 1.2, outer, 0, Math.PI * 2);

                const base = new Path2D();
                base.arc(0, 0, outer, 0, Math.PI * 2);

                const face = new Path2D();
                face.arc(0, -0.6, r, 0, Math.PI * 2);

                const shine = new Path2D();
                shine.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, Math.PI * 2);

                const glow = new Path2D();
                glow.arc(0, 0, r + 5, 0, Math.PI * 2);

                const paths = { shadow, base, face, shine, glow };
                this._buttonPaths[key] = paths;
                return paths;
            }

            static _measure(graph, s) {
                return graph.measureString ? graph.measureString(s) : (String(s).length * 0.18);
            }

            static _intersects(a, b) {
                return (
                    a.x < b.x + b.w &&
                    a.x + a.w > b.x &&
                    a.y < b.y + b.h &&
                    a.y + a.h > b.y
                );
            }

            static _clampRectToCanvas(graph, r) {
                const canvasW = graph.canvas?.width ?? null;
                const canvasH = graph.canvas?.height ?? null;
                if (!canvasW || !canvasH) return r;

                const out = { ...r };
                if (out.x < 0) out.x = 0;
                if (out.y < 0) out.y = 0;
                if (out.x + out.w > canvasW) out.x = Math.max(0, canvasW - out.w);
                if (out.y + out.h > canvasH) out.y = Math.max(0, canvasH - out.h);
                return out;
            }

            static _collides(instance, graph, rect) {
                if (instance._drawBounds && SnpIndel._intersects(rect, instance._drawBounds)) return true;

                const boxes = graph._ui?.detailBoxes;
                if (!boxes) return false;

                for (let i = 0; i < boxes.length; i++) {
                    if (SnpIndel._intersects(rect, boxes[i])) return true;
                }
                return false;
            }

            static _drawFallbackLine(graph, x1, x2, yPix, phaseColor) {
                graph.drawLine(x1, yPix, x2, yPix, phaseColor, 2.5, 'round');
            }

            static _drawGlow(graph, x, yTop, w, h, opts = {}) {
                const radius = opts.radius ?? 0.28;
                const inner = opts.inner ?? 'rgba(59,130,246,0.3)';
                const outer = opts.outer ?? 'rgba(59,130,246,0.15)';
                const spread1 = opts.spread1 ?? 0.16;
                const spread2 = opts.spread2 ?? 0.32;

                const x1 = x - spread2;
                const y1 = yTop - spread2;
                const w1 = w + spread2 * 2;
                const h1 = h + spread2 * 2;

                const x2 = x - spread1;
                const y2 = yTop - spread1;
                const w2 = w + spread1 * 2;
                const h2 = h + spread1 * 2;

                if (graph.fillRoundRect) {
                    graph.fillRoundRect(x1, y1, w1, h1, radius + spread2, outer);
                    graph.fillRoundRect(x2, y2, w2, h2, radius + spread1, inner);
                } else {
                    graph.fillRect(x1, y1, w1, h1, outer);
                    graph.fillRect(x2, y2, w2, h2, inner);
                }
            }

            static _drawTextOnBackdrop(graph, text, x, y, fg = '#111827', opts = {}) {
                const padX = opts.padX ?? 0.22;
                const padY = opts.padY ?? 0.12;
                const radius = opts.radius ?? 0.22;
                const bg = opts.bg ?? 'rgba(255,255,255,0.96)';
                const border = opts.border ?? 'rgba(0,0,0,0.18)';
                const shadow = opts.shadow ?? 'rgba(0,0,0,0.20)';
                const shadowDx = opts.shadowDx ?? 0.06;
                const shadowDy = opts.shadowDy ?? 0.08;

                const w = SnpIndel._measure(graph, text);
                const h = 0.55;
                const rw = w + padX * 2;
                const rh = h + padY * 2;

                const rectX = x - padX;
                const rectY = y - rh * 0.75;

                if (graph.fillRoundRect) {
                    graph.fillRoundRect(rectX + shadowDx, rectY + shadowDy, rw, rh, radius, shadow);
                    graph.fillRoundRect(rectX, rectY, rw, rh, radius, bg);
                    if (graph.drawRoundRect) graph.drawRoundRect(rectX, rectY, rw, rh, radius, border, 1);
                } else {
                    graph.fillRect(rectX + shadowDx, rectY + shadowDy, rw, rh, shadow);
                    graph.fillRect(rectX, rectY, rw, rh, bg);
                    if (graph.drawRect) graph.drawRect(rectX, rectY, rw, rh, border);
                }

                graph.drawString(text, x, y, fg);
                return { w: rw, h: rh, x: rectX, y: rectY };
            }

            static _drawPanel(graph, x, yTop, w, h, opts = {}) {
                const bg = opts.bg ?? 'rgba(255,255,255,0.94)';
                const border = opts.border ?? 'rgba(0,0,0,0.16)';
                const shadow = opts.shadow ?? 'rgba(0,0,0,0.18)';
                const radius = opts.radius ?? 0.22;
                const shadowDx = opts.shadowDx ?? 0.08;
                const shadowDy = opts.shadowDy ?? 0.10;

                if (graph.fillRoundRect) {
                    graph.fillRoundRect(x + shadowDx, yTop + shadowDy, w, h, radius, shadow);
                    graph.fillRoundRect(x, yTop, w, h, radius, bg);
                    if (graph.drawRoundRect) graph.drawRoundRect(x, yTop, w, h, radius, border, 1);
                } else {
                    graph.fillRect(x + shadowDx, yTop + shadowDy, w, h, shadow);
                    graph.fillRect(x, yTop, w, h, bg);
                    if (graph.drawRect) graph.drawRect(x, yTop, w, h, border);
                }
            }

            static _drawPill(graph, text, x, y, opts = {}) {
                const padX = opts.padX ?? 0.22;
                const padY = opts.padY ?? 0.12;
                const radius = opts.radius ?? 0.22;
                const bg = opts.bg ?? '#F3F4F6';
                const fg = opts.fg ?? '#111827';
                const stroke = opts.stroke ?? 'rgba(0,0,0,0.12)';

                const w = SnpIndel._measure(graph, text);
                const h = 0.55;
                const rw = w + padX * 2;
                const rh = h + padY * 2;

                const rectX = x;
                const rectY = y - rh * 0.75;

                if (graph.fillRoundRect) {
                    graph.fillRoundRect(rectX, rectY, rw, rh, radius, bg);
                    if (graph.drawRoundRect) graph.drawRoundRect(rectX, rectY, rw, rh, radius, stroke, 1);
                } else {
                    graph.fillRect(rectX, rectY, rw, rh, bg);
                    if (graph.drawRect) graph.drawRect(rectX, rectY, rw, rh, stroke);
                }

                graph.drawString(text, x + padX, y, fg);
                return rw;
            }

            static _drawSnpMarker(instance, graph, x1, x2, yPix, y0, cellPx, highlightColor, neutralStroke, phaseColor) {
                const midX = (x1 + x2) / 2;
                const radius = cellPx > 14 ? 6 : cellPx > 8 ? 4.5 : 3.5;
                const screenX = graph.X(midX);

                if (screenX < -50 || screenX > graph.canvas.width + 50) {
                    return;
                }

                // (Stem length is already capped in draw() before this is called.)
                graph.drawLine(midX, y0, midX, yPix, 'rgba(14, 1, 15, 0.88)', 1.25, 'round');

                const button_center_x = graph.X(midX);
                const button_center_y = graph.Y(y0);
                const ctx = graph.canvas.getCTX?.() || graph.context || graph.canvasContext;

                // Clinical-significance glow (red for pathogenic).
                const cs = (instance.clinsigStyle ? instance.clinsigStyle() : null);
                const glow = cs && cs.glow;

                if (ctx) {
                    const cx = button_center_x;
                    const cy = button_center_y;
                    const buttonRadius = Math.max(7, radius - 1);
                    const paths = SnpIndel.getButtonPaths(buttonRadius);
                    ctx.save();
                    ctx.translate(cx, cy);

                    if (instance.highlight) {
                        ctx.fillStyle = 'rgba(80,160,255,0.18)';
                        ctx.fill(paths.glow);
                    }

                    ctx.fillStyle = 'rgba(0,0,0,0.18)';
                    ctx.fill(paths.shadow);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill(paths.base);
                    // Pathogenic: paint the face with a red glow (canvas shadow).
                    if (glow) { ctx.shadowColor = cs.glow; ctx.shadowBlur = 14; }
                    ctx.fillStyle = phaseColor; // clinsig-aware color
                    ctx.fill(paths.face);
                    if (glow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

                    ctx.strokeStyle = '#334155';
                    ctx.lineWidth = 1;
                    ctx.stroke(paths.base);

                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    ctx.fill(paths.shine);

                    ctx.restore();
                }

                if (instance.highlight) {
                    if (graph.fillCircle) {
                        graph.fillCircle(midX, yPix, radius + 4, 'rgba(37,99,235,0.14)');
                    }
                    if (graph.drawCircle) {
                        graph.drawCircle(midX, yPix, radius + 2.5, highlightColor, 1.25);
                    }
                }

                // Soft red glow halo behind pathogenic markers (works without ctx too).
                if (glow && graph.fillCircle) {
                    graph.fillCircle(midX, yPix, radius + 5, 'rgba(209,52,47,0.28)');
                    graph.fillCircle(midX, yPix, radius + 3, 'rgba(209,52,47,0.30)');
                }

                if (graph.fillCircle) {
                    graph.fillCircle(midX, yPix, radius, '#FFFFFF');
                    graph.fillCircle(midX, yPix, radius - 1.2, phaseColor);
                } else {
                    // graph.drawLine(midX - radius, yPix, midX + radius, yPix, phaseColor, radius * 1.8, 'round');
                }

                if (graph.drawCircle) {
                    graph.drawCircle(midX, yPix, radius, neutralStroke, 1.25);
                }

                if (graph.fillCircle && radius >= 4) {
                    graph.fillCircle(
                        midX - radius * 0.28,
                        yPix - radius * 0.28,
                        Math.max(1.2, radius * 0.22),
                        'rgba(255,255,255,0.55)'
                    );
                }

                const pad = 14;
                instance._drawBounds = {
                    x: midX - radius - pad,
                    y: yPix - radius - pad,
                    w: (radius * 2) + pad * 2,
                    h: (radius * 2) + pad * 2
                };

                // Screen-space hit region covering the WHOLE lollipop — the head AND the
                // stem line (baseline y0 -> marker yPix). over() receives screen-pixel mouse
                // coords, so we test against screen coords directly (no re-conversion).
                const sMidX = graph.X(midX);
                const sA = graph.Y(y0);
                const sB = graph.Y(yPix);
                const hpad = 12;
                const sLo = Math.min(sA, sB) - radius - hpad;
                const sHi = Math.max(sA, sB) + radius + hpad;
                instance._hitScreen = { x: sMidX - radius - hpad, y: sLo, w: (radius * 2) + hpad * 2, h: sHi - sLo };
            }

            // Lighten (amt>0) or darken (amt<0) a #rrggbb color; returns rgb(). Falls back
            // to the input for non-hex colors.
            static _shade(hex, amt) {
                let c = ('' + hex).replace('#', '');
                if (c.length === 3) c = c.split('').map((x) => x + x).join('');
                if (c.length < 6) return hex;
                const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
                const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
                return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
            }

            // A small 3D cylinder marker for an insertion (+) / deletion (−), on a stem from
            // the track baseline (y0) to the marker position (yPix). Colored by clinsig, with
            // a pathogenic red glow when applicable.
            static _drawIndel3D(instance, graph, x1, x2, yPix, y0, color, isIns) {
                // A HORIZONTAL 3D cylinder lying over the impacted sequence range [x1..x2],
                // offset from the track (yPix, beyond the snps). The cylinder's length covers
                // the affected bases; thin guides drop to the sequence to mark the range.
                const wLo = Math.min(x1, x2), wHi = Math.max(x1, x2);
                let xL = graph.X(wLo);
                let xR = graph.X(wHi);
                const cy = graph.Y(yPix);      // cylinder axis

                // Guide lines from the range ends down to the sequence.
                graph.drawLine(wLo, y0, wLo, yPix, 'rgba(14,1,15,0.35)', 0.8);
                graph.drawLine(wHi, y0, wHi, yPix, 'rgba(14,1,15,0.35)', 0.8);

                const ctx = graph.canvas.getCTX?.() || graph.context || graph.canvasContext;
                if (!ctx) { if (graph.fillCircle) graph.fillCircle((wLo + wHi) / 2, yPix, 4, color); return; }

                // Guarantee a minimum visible length for tiny (single-base) indels.
                if (xR - xL < 12) { const c = (xL + xR) / 2; xL = c - 6; xR = c + 6; }

                const cs = instance.clinsigStyle ? instance.clinsigStyle() : null;
                const dark = SnpIndel._shade(color, -0.4);
                const light = SnpIndel._shade(color, 0.5);
                const ry = 5;        // cylinder radius (vertical half-height)
                const capRx = 2.8;   // end-cap ellipse horizontal radius
                const top = cy - ry, bot = cy + ry;

                ctx.save();

                // Back (far) end cap — darker, sits behind the body.
                ctx.beginPath();
                ctx.ellipse(xL, cy, capRx, ry, 0, 0, Math.PI * 2);
                ctx.fillStyle = dark;
                ctx.fill();

                // Cylindrical body: rectangle with a VERTICAL gradient (light band near the
                // top, shadow at the bottom) so the tube looks round. Shadow / pathogenic glow.
                ctx.shadowColor = (cs && cs.glow) ? cs.glow : 'rgba(0,0,0,0.30)';
                ctx.shadowBlur = (cs && cs.glow) ? 11 : 4;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = (cs && cs.glow) ? 0 : 1.5;
                const bodyGrad = ctx.createLinearGradient(0, top, 0, bot);
                bodyGrad.addColorStop(0.0, SnpIndel._shade(color, 0.05));
                bodyGrad.addColorStop(0.30, light);     // top highlight
                bodyGrad.addColorStop(0.62, color);
                bodyGrad.addColorStop(1.0, dark);        // bottom shadow
                ctx.beginPath();
                ctx.rect(xL, top, xR - xL, ry * 2);
                ctx.fillStyle = bodyGrad;
                ctx.fill();

                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

                // Top / bottom edges of the tube.
                ctx.lineWidth = 0.8;
                ctx.strokeStyle = 'rgba(0,0,0,0.28)';
                ctx.beginPath();
                ctx.moveTo(xL, top); ctx.lineTo(xR, top);
                ctx.moveTo(xL, bot); ctx.lineTo(xR, bot);
                ctx.stroke();

                // Front (near) end cap — lighter elliptical face for depth.
                const capGrad = ctx.createLinearGradient(0, top, 0, bot);
                capGrad.addColorStop(0, light);
                capGrad.addColorStop(0.6, SnpIndel._shade(color, 0.18));
                capGrad.addColorStop(1, dark);
                ctx.beginPath();
                ctx.ellipse(xR, cy, capRx, ry, 0, 0, Math.PI * 2);
                ctx.fillStyle = capGrad;
                ctx.fill();
                ctx.stroke();

                // Specular highlight stripe running along the tube.
                ctx.beginPath();
                ctx.moveTo(xL, cy - ry * 0.5);
                ctx.lineTo(xR, cy - ry * 0.5);
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.stroke();

                // + / − glyph centered on the tube when there's room.
                if (xR - xL > 15) {
                    ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    ctx.font = 'bold 9px system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(isIns ? '+' : '−', (xL + xR) / 2, cy + 0.5);
                }

                ctx.restore();
                // (The click hit region is set by draw() after this returns.)
            }

            static _drawCoarseShape(instance, graph, tgraph, xi, xf, yPix, y0, phaseColor, isSnp) {
                if (!instance.shapeFunction) return false;

                const start = xi - 0.5;
                const end = isSnp ? (xf - 0.5) : (xf - 1.0);

                instance.shapeFunction(
                    graph,
                    tgraph.X(start),
                    tgraph.X(end),
                    yPix,
                    y0,
                    phaseColor,
                    instance.phase
                );
                return true;
            }

            static _drawDetailedShape(instance, graph, x1, x2, yPix, y0, phaseColor) {
                if (instance.detailedShapeFunction) {
                    instance.detailedShapeFunction(graph, x1, x2, yPix, phaseColor);
                    return true;
                }
                if (!instance.shapeFunction) return false;

                instance.drawOval(graph, x1, x2, y0);
                instance.shapeFunction(graph, x1, x2, yPix, y0, phaseColor, instance.phase);
                return true;
            }

            drawOval(graph, x1, x2, y) {
                if (!graph) return;

                const ctx = graph.ctx || graph.context || graph.canvasContext;
                if (!ctx) {
                    const midX = (x1 + x2) / 2;
                    const rx = Math.max(4, Math.abs(x2 - x1) / 2);
                    graph.drawLine?.(midX - rx, y, midX + rx, y, 'rgba(51,65,85,0.5)', Math.max(6, rx * 0.9), 'round');
                    return;
                }

                const left = Math.min(x1, x2);
                const right = Math.max(x1, x2);
                const width = Math.max(8, right - left);
                const height = Math.max(10, Math.min(18, width * 0.7));

                const cx = (left + right) / 2;
                const cy = y;
                const rx = width / 2;
                const ry = height / 2;

                ctx.save();

                ctx.shadowColor = 'rgba(0,0,0,0.18)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 1;

                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.96)';
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.lineWidth = 1.25;
                ctx.strokeStyle = 'rgba(51,65,85,0.75)';
                ctx.stroke();

                ctx.beginPath();
                ctx.ellipse(
                    cx - rx * 0.18,
                    cy - ry * 0.2,
                    Math.max(1.5, rx * 0.28),
                    Math.max(1, ry * 0.22),
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fill();

                ctx.restore();
            }

            setAnnotation(annotation_array) {
                if (annotation_array && annotation_array.length > 0) {
                    for (let a of annotation_array) {
                        if (a.startsWith('CLNSIG')) {
                            let i = a.indexOf('=');
                            if (i > 0) {
                                let t = a.substring(i + 1);
                                this.clinsig = t;
                            }
                        }
                        if (a.startsWith('CLNDN')) {
                            let i = a.indexOf('=');
                            if (i > 0) {
                                let t = a.substring(i + 1);
                                this.clindn = t;
                            }
                        }
                    }
                    this.annotations = annotation_array;
                }
            }

            select() {
                this.highlight = true;
            }

            deselect() {
                this.highlight = false;
            }

            inAnnotation(x, xf, graph, tgraph) {
                let scx = Math.abs(graph.X(x));
                let scy = graph.X(xf);
                let scxi = graph.X(tgraph.X(this.xi));
                let scxf = graph.X(tgraph.X(this.xf));
                let scyy = graph.Y(tgraph.Y(this.y));

                if (scx >= scxi - 20 && scx <= scxf + 20) {
                    return true;
                }
                return false;
            }

            setColor(color) {
                this.color = color;
            }

            getColor() {
                return this.color;
            }

            resetColor() {
                this.color = null;
            }

            // Color a SNP/indel by clinical significance:
            //   null / unknown -> grey; contains "benign" -> light blue;
            //   contains "pathogenic" -> red (with a red glow).
            clinsigStyle() {
                const c = ('' + (this.clinsig || '')).toLowerCase();
                if (!c) return { color: '#9aa0a6', glow: null };                                  // null -> grey
                if (/\bpathogenic\b/.test(c)) return { color: '#d1342f', glow: 'rgba(209,52,47,0.9)' }; // pathogenic -> red + glow
                if (/\bbenign\b/.test(c)) return { color: '#2a6fd6', glow: null };                // benign -> blue
                if (/\buncertain\b/.test(c)) return { color: '#9aa0a6', glow: null };             // uncertain significance -> grey
                return { color: '#9aa0a6', glow: null };                                          // other -> grey
            }

            draw(graph, tgraph, y, lane = 0) {
                if (!graph) return;

                const phase1 = this.phase === 1;
                const drawY = phase1 ? y : -y;
                this.y = drawY;

                // Color by clinical significance (grey / light-blue / red+glow).
                const phaseColor = this.clinsigStyle().color;
                const neutralStroke = '#334155';
                const highlightColor = '#2563EB';

                // Reference footprint [this.xi, this.xf]: the base cells this variant covers.
                // Same origin the snp marker and the sequence letters use (base P => cell
                // [P, P+1]), so the indel cylinder lines up with the impacted bases. (Was
                // this.xi - 1, which shifted insertions/deletions one base to the left.)
                const xi = this.xi;
                const xf = this.xf;

                const x1 = tgraph.X(xi);
                const x2 = tgraph.X(xf);
                let yPix = tgraph.Y(drawY);
                const y0 = tgraph.Y(0);

                // Place the marker a FIXED screen distance from the baseline (keeps it close
                // to the track regardless of Y zoom). `lane` fans clustered markers outward so
                // they don't step on each other: lane 0 sits at the base offset, each higher
                // lane is one LANE_PX further out. Insertions/deletions start beyond the snps.
                try {
                    const LANE_PX = 44;   // room for a head + its label in each lane (see drawDetail)
                    const baseOff = (this.type === 'snp') ? 26 : 38;
                    const CAP = baseOff + Math.max(0, lane | 0) * LANE_PX;
                    const baseSY = graph.Y(y0);
                    const markSY = graph.Y(yPix);
                    const sideSign = (markSY >= baseSY) ? 1 : -1;   // marker's screen side (phase)
                    yPix = graph.Ywc(baseSY + sideSign * CAP);
                } catch (e) { }

                const midX = (xi + xf) * 0.5;
                const screenX = graph.X(tgraph.X(midX));

                if (screenX < -50 || screenX > graph.canvas.width + 50) {
                    return;
                }

                // Y visibility: if the track's baseline is off the canvas (track moved off
                // screen), don't draw — the stem is capped near the baseline, so the marker
                // belongs off-screen too and must not be pinned to a canvas edge.
                {
                    const __baseSY = graph.Y(y0);
                    const __canvasH = (graph.canvas ? graph.canvas.height : (graph.grid ? graph.grid.height : 0));
                    if (__canvasH && (__baseSY < -80 || __baseSY > __canvasH + 80)) return;
                }

                this._screenY = graph.Y(yPix);
                const cellPx = graph.screenWidth(tgraph.screenWidth(1));

                const isSnp = this.type === 'snp';
                const isIns = this.type === 'ins';
                const isDel = this.type === 'del';
                const isKnownType = isSnp || isIns || isDel;

                if (isSnp) {
                    // A single SNP impacts ONE nucleotide — center the lollipop on that base's
                    // column. Use the same FLOORED world origin the sequence letters
                    // (Math.floor(tgraph.X(index))) and the highlight box use; the old unfloored
                    // tgraph.X(this.xi + 0.5) drifted off the letter by the fractional part of
                    // tgraph.X — up to a whole cell when zoomed in.
                    const sx1 = Math.floor(tgraph.X(this.xi));
                    const sx2 = Math.floor(tgraph.X(this.xi + 1));
                    SnpIndel._drawSnpMarker(this, graph, sx1, sx2, y0, yPix, cellPx, highlightColor, neutralStroke, phaseColor);
                    return;
                }

                if (isIns || isDel) {
                    // Zoomed-in insertion/deletion: a 3D cylinder marker, sitting just beyond
                    // the snps (see the type-dependent stem cap above) so it doesn't hide them.
                    SnpIndel._drawIndel3D(this, graph, x1, x2, yPix, y0, phaseColor, isIns);
                } else {
                    let drew = false;
                    const isCoarse = cellPx > 5;
                    if (isCoarse) {
                        drew = isKnownType && SnpIndel._drawCoarseShape(this, graph, tgraph, xi, xf, yPix, y0, phaseColor, isSnp);
                        if (!drew) SnpIndel._drawFallbackLine(graph, x1, x2, yPix, phaseColor);
                    } else {
                        drew = isKnownType && SnpIndel._drawDetailedShape(this, graph, x1, x2, yPix, y0, phaseColor);
                        if (!drew) SnpIndel._drawFallbackLine(graph, x1, x2, yPix, phaseColor);
                    }
                }

                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);
                const pad = 14;
                this._drawBounds = {
                    x: minX - pad,
                    y: yPix - 8 - pad,
                    w: (maxX - minX) + pad * 2,
                    h: 16 + pad * 2
                };

                // Screen-space hit region for the indel shape (see over()).
                const sMinX = graph.X(minX), sMaxX = graph.X(maxX);
                const syP = graph.Y(yPix), sy0b = graph.Y(y0);
                const hpad = 10;
                const iLo = Math.min(syP, sy0b) - hpad;
                const iHi = Math.max(syP, sy0b) + hpad;
                this._hitScreen = { x: Math.min(sMinX, sMaxX) - hpad, y: iLo, w: Math.abs(sMaxX - sMinX) + hpad * 2, h: (iHi - iLo) };
            }

            over(x, y, graph, tgraph) {
                // x,y are SCREEN pixels (mouse-over-highlight converts with tgraph.Xwc(x)).
                // Prefer the screen-space lollipop hit region (head + stem line).
                const h = this._hitScreen;
                if (h) {
                    return (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
                }
                if (!this._drawBounds) return false;
                const sx = graph.X(x);
                const sy = graph.Y(y);
                const b = this._drawBounds;
                return (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h);
            }

            drawDetail(graph, tgraph, x, y, lane = 0) {
                const seqIndex = (x | 0) - this.xi;
                if (seqIndex !== 0) return;

                // Track off-screen vertically -> don't draw the label (see draw()).
                try {
                    const __b = graph.Y(tgraph.Y(0));
                    const __h = (graph.canvas ? graph.canvas.height : (graph.grid ? graph.grid.height : 0));
                    if (__h && (__b < -80 || __b > __h + 80)) return;
                } catch (e) { }

                const phase = this.phase;
                const highlight = this.highlight;
                const annotations = this.annotations;
                const clinsig = this.clinsig;
                const name = this.name;
                const reference0 = this.reference0;
                const alternate0 = this.alternate0;
                const id = this.id;

                const tx = tgraph.X(x);
                const anchorX = tx;
                // Anchor the label next to the marker in SCREEN space (the marker's stem is
                // capped the same way in draw()). The old graph-world anchor (y * -2.7) is not
                // capped, so when the Y viewport tightens on zoom-in the label floated far off
                // the track — often off-screen — even though the marker stayed put.
                let anchorY;
                try {
                    const LANE_PX = 44;                                           // must match draw()
                    const baseSY = graph.Y(tgraph.Y(0));                          // baseline (screen)
                    const drawYSign = (phase === 1) ? 1 : -1;                     // marker side
                    const rawSY = graph.Y(tgraph.Y(drawYSign * Math.abs(y)));     // side probe (screen)
                    const sideSign = (rawSY >= baseSY) ? 1 : -1;
                    const cap = ((this.type === 'snp') ? 26 : 38) + Math.max(0, lane | 0) * LANE_PX;
                    const markSY = baseSY + sideSign * cap;                       // this lane's head (matches draw())
                    // Push the text BEYOND the head (~11px radius) so the head never covers it;
                    // it lands in the gap before the next lane's head.
                    anchorY = graph.Ywc(markSY + sideSign * 22);
                } catch (e) {
                    anchorY = (phase === 1) ? tgraph.Y(y) : tgraph.Y(y * -2.7);
                }

                const nowMs = Date.now();
                const tick10ms = nowMs / 10;
                const pulse = 0.5 + 0.5 * Math.sin(tick10ms * 0.35);
                const glowAlpha = 0.18 + pulse * 0.30;
                const glowAlpha2 = 0.08 + pulse * 0.18;

                graph._ui = graph._ui || {};
                graph._ui.detailBoxes = graph._ui.detailBoxes || [];

                // Just the ref→alt nomenclature (e.g. "A>G", "AGT>A", "A>AGT").
                const changeStr = `${reference0}>${alternate0}`;
                const title = (phase === 1) ? `${id}: ${name}` : `${name}`;
                const mainLabel = ` ${changeStr} `;

                const labelBg = highlight
                    ? `rgba(255,255,255,${0.90 + pulse * 0.06})`
                    : 'rgba(255,255,255,0.96)';

                SnpIndel._drawTextOnBackdrop(
                    graph,
                    mainLabel,
                    anchorX,
                    anchorY,
                    (phase === 1) ? '#111827' : '#1D4ED8',
                    {
                        bg: labelBg,
                        shadow: highlight ? `rgba(59,130,246,${0.20 + pulse * 0.25})` : 'rgba(0,0,0,0.22)',
                        border: highlight ? `rgba(59,130,246,${0.18 + pulse * 0.22})` : 'rgba(0,0,0,0.18)'
                    }
                );

                if (!highlight) return;

                const detailLine = clinsig
                    ? `ClinSig: ${String(clinsig)}`
                    : (annotations ? ` Notes: ${String(annotations)}` : '');

                const showDetail = Boolean(detailLine);

                const line1 = ` ${title}`;
                const line2 = `Δ ${changeStr}`;

                const w = Math.max(
                    SnpIndel._measure(graph, line1),
                    SnpIndel._measure(graph, line2),
                    showDetail ? SnpIndel._measure(graph, detailLine) : 0
                ) + 1.0;

                const h = showDetail ? 1.90 : 1.20;
                const gap = 0.28;
                const gapY = 0.06;

                const candidates = [
                    { x: anchorX + gap, y: (anchorY - h / 2) + gapY },
                    { x: anchorX - w - gap, y: (anchorY - h / 2) + gapY },
                    { x: anchorX - w / 2, y: anchorY - h - gap },
                    { x: anchorX - w / 2, y: anchorY + gap }
                ];

                let chosen = null;

                for (let i = 0; i < candidates.length; i++) {
                    const rect = SnpIndel._clampRectToCanvas(graph, {
                        x: candidates[i].x,
                        y: candidates[i].y,
                        w,
                        h
                    });
                    if (!SnpIndel._collides(this, graph, rect)) {
                        chosen = rect;
                        break;
                    }
                }

                if (!chosen) {
                    chosen = SnpIndel._clampRectToCanvas(graph, {
                        x: candidates[0].x,
                        y: candidates[0].y,
                        w,
                        h
                    });
                }

                graph._ui.detailBoxes.push(chosen);

                const glowInner = (phase === 1)
                    ? `rgba(239,68,68,${glowAlpha})`
                    : `rgba(34,197,94,${glowAlpha})`;

                const glowOuter = (phase === 1)
                    ? `rgba(239,68,68,${glowAlpha2})`
                    : `rgba(34,197,94,${glowAlpha2})`;

                SnpIndel._drawGlow(graph, chosen.x, chosen.y, w, h, {
                    inner: glowInner,
                    outer: glowOuter,
                    radius: 0.28,
                    spread1: 0.16,
                    spread2: 0.34
                });

                SnpIndel._drawPanel(graph, chosen.x, chosen.y, w, h, {
                    bg: `rgba(255,255,255,${0.92 + pulse * 0.04})`
                });

                const textX = chosen.x + 0.28;
                const y1 = chosen.y + 0.58;
                const y2 = chosen.y + 1.08;

                SnpIndel._drawTextOnBackdrop(graph, line1, textX, y1, '#111827', {
                    bg: 'rgba(255,255,255,0.88)',
                    shadow: 'rgba(0,0,0,0.12)',
                    border: 'rgba(0,0,0,0.10)',
                    padX: 0.18,
                    padY: 0.08
                });

                SnpIndel._drawTextOnBackdrop(graph, line2, textX, y2, '#374151', {
                    bg: 'rgba(255,255,255,0.84)',
                    shadow: 'rgba(0,0,0,0.10)',
                    border: 'rgba(0,0,0,0.08)',
                    padX: 0.18,
                    padY: 0.08
                });

                if (!showDetail) return;

                const y3 = chosen.y + 1.60;

                if (clinsig) {
                    SnpIndel._drawPill(graph, detailLine, textX, y3, {
                        bg: '#ECFDF5',
                        fg: '#065F46',
                        stroke: '#A7F3D0'
                    });
                    return;
                }

                if (annotations) {
                    const annStr = String(annotations);
                    if (annStr.indexOf('CLNSIG') >= 0) this.setAnnotation(annotations);

                    SnpIndel._drawPill(graph, detailLine, textX, y3, {
                        bg: '#EFF6FF',
                        fg: '#1D4ED8',
                        stroke: '#BFDBFE'
                    });
                }
            }
        };
        resolve(snpindel)

    })

}

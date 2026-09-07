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

                if (this.type === 'snp' || this.type === 'AA') {
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

            // ---- the callout ---------------------------------------------------------------
            //
            // The annotation is no longer a sentence; it is a record, composed as
            //
            //     Cystic fibrosis (OMIM:219700) · Pathogenic · truncates the protein ·
            //     loss of function — chloride channel function is lost
            //
            // and it was being drawn as one undifferentiated wrapped blob in a square white
            // box, with the middle dots breaking wherever the wrap happened to fall. The parts
            // are not equal: the phenotype is what this is, the classification is a verdict
            // worth colouring, and the mechanism is the detail you read second. So it is set
            // like a record -- a heading, a chip, and body text -- rather than a paragraph.
            //
            // Same drawing vocabulary as _drawTextOnBackdrop, which this had drifted away from:
            // rounded corners, a hairline border, one soft shadow.

            // Clinical significance decides the colour, everywhere it is shown. "Conflicting
            // classifications of pathogenicity" contains the word pathogenic and is tested for
            // FIRST -- ordering is the whole guard here, as it is everywhere else this string
            // gets read.
            static _sigStyle(sig) {
                const t = ('' + (sig || '')).toLowerCase();
                if (!t) return null;
                if (t.indexOf('conflict') >= 0) return { fg: '#475569', bg: '#f1f5f9', line: '#cbd5e1' };
                if (t.indexOf('pathogenic') >= 0) return { fg: '#b91c1c', bg: '#fef2f2', line: '#fecaca' };
                if (t.indexOf('benign') >= 0) return { fg: '#15803d', bg: '#f0fdf4', line: '#bbf7d0' };
                if (t.indexOf('uncertain') >= 0 || t.indexOf('vus') >= 0) return { fg: '#b45309', bg: '#fffbeb', line: '#fde68a' };
                return { fg: '#475569', bg: '#f8fafc', line: '#e2e8f0' };
            }

            static _roundRectPath(ctx, x, y, w, h, r) {
                const rr = Math.min(r, w / 2, h / 2);
                ctx.beginPath();
                ctx.moveTo(x + rr, y);
                ctx.arcTo(x + w, y, x + w, y + h, rr);
                ctx.arcTo(x + w, y + h, x, y + h, rr);
                ctx.arcTo(x, y + h, x, y, rr);
                ctx.arcTo(x, y, x + w, y, rr);
                ctx.closePath();
            }

            static _drawAnnotationLeader(graph, hx, hy, text, sig) {
                const ctx = (graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null;
                if (!ctx || !text) return;
                const cw = ctx.canvas.width, ch = ctx.canvas.height;
                if (!(hx > -60 && hx < cw + 60 && hy > -60 && hy < ch + 60)) return;

                const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
                const TITLE_FS = 12.5, BODY_FS = 11, CHIP_FS = 10, MUTED_FS = 10.5;
                const lineH = 15, maxW = 258, padX = 11, padY = 9, radius = 6;

                // The composed record splits on the middle dot. Anything that was set by hand
                // -- the per-variant lookup writes a paragraph -- has no dots and becomes the
                // body, with no heading and no chip, which is what a paragraph should look
                // like.
                const parts = ('' + text).split('·').map((p) => p.trim()).filter(Boolean);
                const composed = parts.length > 1;
                let title = '', ident = '', chip = '', body = '';
                if (composed) {
                    const head = parts[0];
                    const m = head.match(/^(.*?)\s*\((OMIM:[^)]+)\)\s*$/);
                    title = m ? m[1] : head;
                    ident = m ? m[2] : '';
                    const rest = parts.slice(1);
                    // The classification is whichever part _sigStyle recognises; it is not
                    // always second, and a record with none simply has no chip.
                    let ci = -1;
                    for (let i = 0; i < rest.length; i++) {
                        const st = SnpIndel._sigStyle(rest[i]);
                        if (st && /pathogenic|benign|uncertain|conflict|vus/i.test(rest[i])) { ci = i; break; }
                    }
                    if (ci >= 0) { chip = rest[ci]; rest.splice(ci, 1); }
                    body = rest.join(' · ');
                } else {
                    body = parts[0] || ('' + text);
                }

                const wrap = (str, font, width) => {
                    ctx.font = font;
                    const out = [];
                    let cur = '';
                    for (const w of ('' + str).replace(/\s+/g, ' ').trim().split(' ')) {
                        const test = cur ? cur + ' ' + w : w;
                        if (cur && ctx.measureText(test).width > width) { out.push(cur); cur = w; }
                        else cur = test;
                    }
                    if (cur) out.push(cur);
                    return out;
                };

                const titleFont = '600 ' + TITLE_FS + 'px ' + FONT;
                const bodyFont = BODY_FS + 'px ' + FONT;
                const chipFont = '600 ' + CHIP_FS + 'px ' + FONT;
                const mutedFont = MUTED_FS + 'px ' + FONT;

                const titleLines = title ? wrap(title, titleFont, maxW) : [];
                const bodyLines = body ? wrap(body, bodyFont, maxW) : [];
                // Six lines of body is a callout; more is a document, and the marker it points
                // at stops being findable among them.
                const MAXB = 6;
                if (bodyLines.length > MAXB) {
                    bodyLines.length = MAXB;
                    bodyLines[MAXB - 1] = bodyLines[MAXB - 1].replace(/\s*\S*$/, '') + '…';
                }

                ctx.font = chipFont;
                const chipTextW = chip ? ctx.measureText(chip).width : 0;
                const chipW = chip ? chipTextW + 14 : 0, chipH = 16;
                ctx.font = mutedFont;
                const identW = ident ? ctx.measureText(ident).width : 0;

                let tw = 0;
                ctx.font = titleFont;
                for (const l of titleLines) tw = Math.max(tw, ctx.measureText(l).width);
                ctx.font = bodyFont;
                for (const l of bodyLines) tw = Math.max(tw, ctx.measureText(l).width);
                tw = Math.max(tw, identW, chipW);

                const bw = Math.ceil(tw) + padX * 2 + 3;   // +3 for the accent rail
                const bh = padY * 2
                    + titleLines.length * (TITLE_FS + 4)
                    + (ident ? MUTED_FS + 4 : 0)
                    + (chip ? chipH + 5 : 0)
                    + bodyLines.length * lineH
                    + ((titleLines.length && (bodyLines.length || chip)) ? 3 : 0);

                // Above the marker, on the side with room, bumped clear of callouts already
                // placed this frame.
                const side = (hx < cw * 0.62) ? 1 : -1;
                let bx = (side >= 0) ? (hx + 18) : (hx - 18 - bw);
                let by = hy - 60 - bh;
                const used = (graph.__annoBoxes = graph.__annoBoxes || []);
                let guard = 0;
                while (guard++ < 40 && used.some((r) => !(bx + bw < r.x - 5 || bx > r.x + r.w + 5
                    || by + bh < r.y - 5 || by > r.y + r.h + 5))) {
                    by -= (bh + 8);
                }
                bx = Math.max(6, Math.min(bx, cw - bw - 6));
                by = Math.max(6, Math.min(by, ch - bh - 6));
                used.push({ x: bx, y: by, w: bw, h: bh });

                const st = SnpIndel._sigStyle(sig || chip) || { fg: '#475569', bg: '#f8fafc', line: '#e2e8f0' };

                ctx.save();
                ctx.textBaseline = 'top';
                ctx.textAlign = 'left';

                // Leader: down the marker, then a short jog to the panel edge. A straight
                // diagonal across a dense track reads as one more feature; an elbow reads as a
                // pointer.
                const anchorX = Math.max(bx + 14, Math.min(hx, bx + bw - 14));
                const boxBottom = by + bh;
                const elbowY = Math.min(hy - 6, boxBottom + 10);
                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
                ctx.strokeStyle = 'rgba(71,85,105,0.55)';
                ctx.lineWidth = 1;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                if (elbowY < hy) { ctx.lineTo(hx, elbowY); ctx.lineTo(anchorX, boxBottom); }
                else { ctx.lineTo(anchorX, boxBottom); }
                ctx.stroke();
                ctx.fillStyle = 'rgba(71,85,105,0.85)';
                ctx.beginPath(); ctx.arc(hx, hy, 2, 0, Math.PI * 2); ctx.fill();

                // Panel: one soft shadow, a hairline border, rounded like everything else.
                ctx.shadowColor = 'rgba(15,23,42,0.22)';
                ctx.shadowBlur = 8; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
                ctx.fillStyle = 'rgba(255,255,255,0.98)';
                SnpIndel._roundRectPath(ctx, bx, by, bw, bh, radius);
                ctx.fill();
                ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                ctx.strokeStyle = 'rgba(15,23,42,0.14)';
                ctx.lineWidth = 1;
                SnpIndel._roundRectPath(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, radius);
                ctx.stroke();

                // The accent rail, clipped to the panel so it keeps the corner radius rather
                // than sticking out square at the top and bottom as the old 2.5px bar did.
                ctx.save();
                SnpIndel._roundRectPath(ctx, bx, by, bw, bh, radius);
                ctx.clip();
                ctx.fillStyle = st.fg;
                ctx.globalAlpha = 0.85;
                ctx.fillRect(bx, by, 3, bh);
                ctx.globalAlpha = 1;
                ctx.restore();

                let y = by + padY;
                const x = bx + 3 + padX;

                ctx.font = titleFont;
                ctx.fillStyle = '#0f172a';
                for (const l of titleLines) { ctx.fillText(l, x, y); y += TITLE_FS + 4; }

                if (ident) {
                    ctx.font = mutedFont;
                    ctx.fillStyle = '#64748b';
                    ctx.fillText(ident, x, y);
                    y += MUTED_FS + 4;
                }

                if (chip) {
                    ctx.fillStyle = st.bg;
                    SnpIndel._roundRectPath(ctx, x, y, chipW, chipH, 8);
                    ctx.fill();
                    ctx.strokeStyle = st.line;
                    ctx.lineWidth = 1;
                    SnpIndel._roundRectPath(ctx, x + 0.5, y + 0.5, chipW - 1, chipH - 1, 8);
                    ctx.stroke();
                    ctx.font = chipFont;
                    ctx.fillStyle = st.fg;
                    ctx.fillText(chip, x + 7, y + (chipH - CHIP_FS) / 2 - 0.5);
                    y += chipH + 5;
                }

                if (titleLines.length && bodyLines.length) y += 3;
                ctx.font = bodyFont;
                ctx.fillStyle = '#475569';
                for (const l of bodyLines) { ctx.fillText(l, x, y); y += lineH; }

                ctx.restore();
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
                const s = ('' + hex).trim();
                let r, g, b;
                const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
                if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
                else {
                    let c = s.replace('#', '');
                    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
                    if (c.length < 6) return s;
                    r = parseInt(c.substr(0, 2), 16); g = parseInt(c.substr(2, 2), 16); b = parseInt(c.substr(4, 2), 16);
                }
                // Never emit rgb(NaN,…) — that throws in addColorStop.
                if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return s;
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
                        // MATCH THE KEY, NOT A PREFIX OF IT. A ClinVar INFO field carries
                        // CLNSIG alongside CLNSIGSCV, CLNSIGCONF and CLNSIGINCL, and CLNDN
                        // alongside CLNDNINCL -- all of which start with the key being looked
                        // for. Testing the start of the string meant the last of them won, so
                        // a variant whose record held CLNSIG=Uncertain_significance followed
                        // by CLNSIGSCV=SCV004022412 ended up reporting the submission
                        // accession as its clinical significance.
                        let i = a.indexOf('=');
                        if (i <= 0) continue;
                        let key = a.substring(0, i);
                        let t = a.substring(i + 1);
                        if (key === 'CLNSIG') this.clinsig = t;
                        else if (key === 'CLNDN') this.clindn = t;
                    }
                    this.annotations = annotation_array;
                    this._deriveAnnotationText();
                }
            }

            // THE CALLOUT TEXT: WHAT THIS VARIANT DOES.
            //
            // _drawAnnotationLeader draws `this.annotation`, and until recently the only things
            // that ever set it were the per-variant "what is this variant" lookup and the
            // points-of-interest flow. A variant loaded from ClinVar never got one, so the
            // track menu's "Show annotations" set a flag on text that did not exist.
            //
            // The condition and the classification are on the record. What is NOT on the
            // record is the thing someone reading a track actually wants: what the change does
            // to the protein. That comes from two places, and they are kept apart on purpose
            // because one is a fact and the other is background:
            //
            //   the VARIANT   deterministic, from ClinVar's own molecular consequence. A
            //                 nonsense allele truncates the protein. This is not a judgement.
            //   the GENE      how disease happens in this gene at all -- haploinsufficiency,
            //                 constitutive activation -- fetched once per gene by the loader
            //                 (py/bio/gene-mechanism.py) and attached afterwards.
            //
            // A truncating allele in a gene whose disease mechanism is loss of function is
            // called loss of function, because that inference is sound. A MISSENSE allele in
            // the same gene is not: it may be loss of function, dominant negative or benign,
            // and only the gene-level sentence is shown for it. Saying more would be inventing
            // a functional call for a variant nobody has assayed.
            static get _CONSEQUENCE() {
                return {
                    'nonsense': ['truncates the protein', 1],
                    'frameshift_variant': ['frameshift, truncates the protein', 1],
                    'splice_donor_variant': ['breaks the splice donor', 1],
                    'splice_acceptor_variant': ['breaks the splice acceptor', 1],
                    'initiator_codon_variant': ['removes the start codon', 1],
                    'stop_lost': ['removes the stop codon, read-through', 0],
                    'missense_variant': ['changes one residue', 0],
                    'synonymous_variant': ['no change to the protein sequence', 0],
                    'inframe_deletion': ['in-frame deletion, removes residues', 0],
                    'inframe_insertion': ['in-frame insertion, adds residues', 0],
                    'inframe_indel': ['in-frame indel', 0],
                    'intron_variant': ['intronic', 0],
                    '5_prime_UTR_variant': ['5\u2032 untranslated region', 0],
                    '3_prime_UTR_variant': ['3\u2032 untranslated region', 0],
                    'non-coding_transcript_variant': ['non-coding transcript', 0],
                    'genic_upstream_transcript_variant': ['upstream of the transcript', 0],
                    'genic_downstream_transcript_variant': ['downstream of the transcript', 0],
                };
            }

            _annotationField(key) {
                for (const a of (this.annotations || [])) {
                    const i = ('' + a).indexOf('=');
                    if (i > 0 && ('' + a).slice(0, i) === key) return ('' + a).slice(i + 1);
                }
                return '';
            }

            // ClinVar's MC is "SO:0001583|missense_variant", sometimes several comma-separated.
            // The most consequential one wins: a record that is both a splice donor and an
            // intron variant is a splice donor.
            // THE PHENOTYPE, PAIRED TO ITS OMIM NUMBER.
            //
            // CLNDN and CLNDISDB are positionally aligned -- element i of one names element i
            // of the other:
            //
            //   CLNDN=Brown-Vialetto-van_Laere_syndrome_1|Progressive_bulbar_palsy_of_childhood
            //   CLNDISDB=...,OMIM:211530,...|...,OMIM:211500
            //
            // so a record's conditions can be read back WITH the identifier each one was filed
            // under, rather than as a run of names joined by semicolons. That matters here
            // because a record often lists several: a CFTR variant filed under cystic fibrosis,
            // CFTR-related disorder and "not specified" should say cystic fibrosis when cystic
            // fibrosis is what was loaded, not all three.
            _phenotypes() {
                const names = (this._annotationField('CLNDN') || '').split('|');
                const dbs = (this._annotationField('CLNDISDB') || '').split('|');
                const out = [];
                for (let i = 0; i < names.length; i++) {
                    const name = ('' + names[i]).replace(/_/g, ' ').trim();
                    if (!name || /^(not provided|not specified)$/i.test(name)) continue;
                    const mims = [];
                    const part = dbs[i] || '';
                    const re = /OMIM:(PS)?(\d+)/g;
                    let m;
                    while ((m = re.exec(part))) mims.push((m[1] ? 'PS' : '') + m[2]);
                    out.push({ name: name, mims: mims });
                }
                return out;
            }

            // Which of them to show. When the track was loaded FOR a phenotype, that is the one
            // this record is here for and the others are incidental; otherwise the first named
            // condition stands, as before.
            _phenotypeLine() {
                const phs = this._phenotypes();
                if (!phs.length) return '';
                let pick = null;
                const focus = this.focusMims;
                if (focus && focus.length) {
                    const want = new Set(focus.map((x) => ('' + x).toUpperCase()));
                    pick = phs.find((ph) => ph.mims.some((x) => want.has(('' + x).toUpperCase()))) || null;
                }
                if (!pick) pick = phs[0];
                // The plain numeric id, not the phenotypic series: PS268000 names a family of
                // ninety numbered forms and is not what this record is.
                const id = pick.mims.find((x) => !/^PS/i.test(x)) || pick.mims[0] || '';
                return pick.name + (id ? ' (OMIM:' + id + ')' : '');
            }

            _consequence() {
                const raw = this._annotationField('MC') || ('' + (this.structure || ''));
                if (!raw) return null;
                const table = SnpIndel._CONSEQUENCE;
                const order = Object.keys(table);
                let best = null;
                for (const piece of raw.split(',')) {
                    const term = piece.split('|').pop().trim();
                    if (!table[term]) continue;
                    if (best === null || order.indexOf(term) < order.indexOf(best)) best = term;
                }
                return best ? { term: best, phrase: table[best][0], truncating: !!table[best][1] } : null;
            }

            geneSymbol() {
                const g = this._annotationField('GENEINFO');
                return g ? ('' + g).split(':')[0].split('|')[0] : '';
            }

            // The gene's disease mechanism, from the loader. Recomposes the callout and turns
            // it on: a variant whose function is spelled out is worth reading without having
            // to ask for it variant by variant.
            applyGeneMechanism(m) {
                if (!m) return;
                this._geneMech = m;
                this._composeAnnotation();
            }

            _composeAnnotation() {
                // Never overwrite an annotation something else wrote by hand -- the per-variant
                // lookup writes a paragraph a model produced about that exact variant, which is
                // better than anything composed here. Recomposing our OWN text is fine, and is
                // how the gene mechanism gets folded in after it arrives.
                if (this.annotation && !this._derivedAnnotation) return;
                const tidy = (v) => ('' + v).replace(/_/g, ' ').replace(/\|/g, '; ').trim();
                const parts = [];
                // The phenotype with its OMIM number, when the record carries one. Falls back
                // to the plain condition text for a variant that came from somewhere with no
                // CLNDISDB to pair against -- a described change, or another database.
                // "not provided" and "not specified" are ClinVar saying it has no condition for
                // this record. Printing them back is worse than printing nothing.
                const ph = this._phenotypeLine();
                if (ph) parts.push(ph);
                else {
                    const dn = tidy(this.clindn || this._annotationField('CLNDN'));
                    if (dn && !/^(not provided|not specified)$/i.test(dn)) parts.push(dn);
                }
                const sig = tidy(this.clinsig || this._annotationField('CLNSIG'));
                if (sig) parts.push(sig);
                const con = this._consequence();
                if (con) parts.push(con.phrase);
                const m = this._geneMech;
                if (m) {
                    const gene = this.geneSymbol();
                    const note = ('' + (m.note || '')).trim();
                    const trunc = ('' + (m.truncating || '')).toLowerCase();
                    if (con && con.truncating && trunc === 'loss of function') {
                        parts.push('loss of function' + (note ? ' \u2014 ' + note : ''));
                    } else if (con && con.truncating && trunc.indexOf('not a known') === 0) {
                        parts.push('truncation is not a known disease mechanism in '
                            + (gene || 'this gene'));
                    } else if (m.mechanism && m.mechanism !== 'unclear') {
                        parts.push((gene ? gene + ' disease is ' : 'disease here is ') + m.mechanism
                            + (note ? ' \u2014 ' + note : ''));
                    }
                }
                if (!parts.length) return;
                this.annotation = parts.join(' \u00b7 ');
                this._derivedAnnotation = true;
            }

            // Kept as the old name so nothing that called it has to change.
            _deriveAnnotationText() {
                this._composeAnnotation(false);
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

                // Spotlight mode: when a mutation is SELECTED on a track (click), toured, or picked
                // from a menu, EVERY OTHER mutation is grayed out and its annotation hidden — so the
                // selected/focused mutation(s) POP OUT. Selection = highlighted snps while a snp
                // selection is active (graph.__snpSelectionActive); focus = the timed single snp from
                // a tour / Go-to (graph.__focusSnp / __focusUntil).
                // Spotlight state lives on the GENE; draw() receives the GRID as `graph` — resolve
                // the gene via its back-reference (set in gene.js) so selection/focus is seen.
                const __G = graph.__gene || graph;
                const __focusOn = !!(__G.__focusSnp && __G.__focusUntil && Date.now() < __G.__focusUntil);
                const __selOn = !!__G.__snpSelectionActive;
                const __inSpot = (__focusOn && __G.__focusSnp === this) || (__selOn && this.highlight);
                const __dimmed = (__focusOn || __selOn) && !__inSpot;

                // Color by clinical significance (grey / light-blue / red+glow) — or gray when dimmed.
                // Dimmed colours are (nearly) OPAQUE: the fade comes from globalAlpha alone, so a
                // dimmed marker stays visible-but-grey instead of compounding to ~0.1 and vanishing.
                const phaseColor = __dimmed ? '#94a3b8' : this.clinsigStyle().color;
                const neutralStroke = __dimmed ? '#788496' : '#334155';
                const highlightColor = __dimmed ? '#94a3b8' : '#2563EB';

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

                // A non-selected mutation while a spotlight (selection/focus) is active is faded to
                // ~40% opacity (relatively transparent) on top of the gray colors — reset before
                // every exit so it never bleeds into the next marker. No globalAlpha is used inside
                // the marker helpers, so this holds across their save()/restore().
                const __dimCtx = __dimmed ? ((graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null) : null;
                if (__dimCtx) __dimCtx.globalAlpha = 0.4;

                const isSnp = this.type === 'snp';
                const isIns = this.type === 'ins';
                const isDel = this.type === 'del';
                // 'AA' = an amino-acid (peptide) mutation: a missense substitution whose exact
                // nucleotide within the codon is unknown/ambiguous. Its own type (not 'del') so it
                // is never confused with a deletion, but it DRAWS with the same codon-spanning
                // marker. (Legacy peptide markers may still be type 'snp' with a peptide flag.)
                const isAA = this.type === 'AA' || (isSnp && this.peptide);
                const isKnownType = isSnp || isIns || isDel || isAA;

                if (isSnp && !this.peptide) {
                    // A single SNP impacts ONE nucleotide — center the lollipop on that base's
                    // column. Use the same ROUNDED world origin the sequence letters
                    // (Math.round(tgraph.X(index))) and the highlight box use. Rounding (not
                    // flooring) the world coordinate avoids the -1 drift: float noise could leave
                    // tgraph.X just under the integer base position, and floor then dropped a whole
                    // world unit — many pixels to the left when zoomed in.
                    const sx1 = Math.round(tgraph.X(this.xi));
                    const sx2 = Math.round(tgraph.X(this.xi + 1));
                    SnpIndel._drawSnpMarker(this, graph, sx1, sx2, y0, yPix, cellPx, highlightColor, neutralStroke, phaseColor);
                    if (this.annotation && this.showAnnotation !== false && !__dimmed && cellPx > 2.5) { (graph.__topAnnos = graph.__topAnnos || []).push({ hx: screenX, hy: this._screenY, text: this.annotation, sel: !!this.highlight, sig: this.clinsig || '' }); }
                    if (__dimCtx) __dimCtx.globalAlpha = 1;
                    return;
                }

                if (isIns || isDel || isAA) {
                    // Zoomed-in insertion/deletion — OR an 'AA' (amino-acid / peptide) mutation: a
                    // missense SUBSTITUTION whose exact nucleotide within the codon is unknown, so we
                    // highlight the WHOLE CODON (xi..xf spans 3 nt) with the same spanning marker.
                    // Type 'AA' keeps it clearly a substitution, not a deletion.
                    SnpIndel._drawIndel3D(this, graph, x1, x2, yPix, y0, phaseColor, isIns);
                    if (this.annotation && this.showAnnotation !== false && !__dimmed && cellPx > 2.5) { (graph.__topAnnos = graph.__topAnnos || []).push({ hx: screenX, hy: this._screenY, text: this.annotation, sel: !!this.highlight, sig: this.clinsig || '' }); }
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
                if (__dimCtx) __dimCtx.globalAlpha = 1;
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

                // Spotlight fade (same as draw()): a non-selected mutation's label is faded to ~40%
                // while a selection/focus is active — reset before every exit below.
                const __ddG = graph.__gene || graph;
                const __ddFocusOn = !!(__ddG.__focusSnp && __ddG.__focusUntil && Date.now() < __ddG.__focusUntil);
                const __ddSelOn = !!__ddG.__snpSelectionActive;
                const __ddInSpot = (__ddFocusOn && __ddG.__focusSnp === this) || (__ddSelOn && this.highlight);
                const __ddDimmed = (__ddFocusOn || __ddSelOn) && !__ddInSpot;
                const __ddCtx = __ddDimmed ? ((graph.canvas && graph.canvas.getCTX) ? graph.canvas.getCTX() : null) : null;
                if (__ddCtx) __ddCtx.globalAlpha = 0.4;

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

                // An amino-acid mutation (type 'AA' or a legacy peptide-flagged snp): never show a
                // nucleotide change for it (the exact base is degenerate / one of several).
                const isPeptide = !!this.peptide || this.type === 'AA';
                // Just the ref→alt nomenclature (e.g. "A>G", "AGT>A", "A>AGT"). Only show it when
                // it is a REAL change — a placeholder/degenerate "N>N" (or any X>X, i.e. no change)
                // is impossible, so fall back to the variant name in that case.
                const _r0 = ('' + (reference0 == null ? '' : reference0)).toUpperCase();
                const _a0 = ('' + (alternate0 == null ? '' : alternate0)).toUpperCase();
                const changeStr = (!isPeptide && _r0 && _a0 && _r0 !== _a0) ? `${reference0}>${alternate0}` : '';
                const title = (phase === 1) ? `${id}: ${name}` : `${name}`;
                // A CHANGE THAT HAS A NAME IS SHOWN BY ITS NAME. "A>T" is what the marker said
                // for a variant placed as K27M, which is the one thing about it nobody needed
                // telling: the bases are on the sequence directly underneath. A named change
                // carries a LABEL annotation, so when there is one it is the label, and a
                // database row with no name of its own still shows its base change as before.
                let annotLabel = '';
                try {
                    for (const a of (annotations || [])) {
                        const i = ('' + a).indexOf('=');
                        if (i > 0 && ('' + a).slice(0, i) === 'LABEL') { annotLabel = ('' + a).slice(i + 1); break; }
                    }
                } catch (e) { annotLabel = ''; }
                const mainLabel = annotLabel
                    ? ` ${annotLabel} `
                    : (changeStr ? ` ${changeStr} ` : ` ${name || 'variant'} `);

                // Opaque-enough white panel so the label text stays readable over the sequence
                // letters / track features behind it.
                const labelBg = highlight
                    ? `rgba(255,255,255,${0.94 + pulse * 0.04})`
                    : 'rgba(255,255,255,0.92)';

                SnpIndel._drawTextOnBackdrop(
                    graph,
                    mainLabel,
                    anchorX,
                    anchorY,
                    (phase === 1) ? '#111827' : '#1D4ED8',
                    {
                        bg: labelBg,
                        // No border; a faint soft shadow only, so the text still reads over features.
                        shadow: highlight ? `rgba(59,130,246,${0.08 + pulse * 0.10})` : 'rgba(0,0,0,0.12)',
                        border: 'rgba(0,0,0,0)'
                    }
                );

                if (!highlight) { if (__ddCtx) __ddCtx.globalAlpha = 1; return; }

                const detailLine = clinsig
                    ? `ClinSig: ${String(clinsig)}`
                    : (annotations ? ` Notes: ${String(annotations)}` : '');

                const showDetail = Boolean(detailLine);

                // THE PHENOTYPE, in the box as well as in the callout. The detail box named the
                // variant, its base change and its clinical significance -- everything except
                // the condition any of that is about. The callout carries it, but the callout
                // is only drawn for the pathogenic ones and only when zoomed in; the box is
                // what a reader gets for hovering a marker, and it should not be the one
                // surface that leaves the disease out.
                let phenoLine = '';
                try { phenoLine = this._phenotypeLine ? this._phenotypeLine() : ''; } catch (e) { phenoLine = ''; }
                const showPheno = Boolean(phenoLine);

                const line1 = ` ${title}`;
                const line2 = changeStr ? `Δ ${changeStr}` : '';

                const w = Math.max(
                    SnpIndel._measure(graph, line1),
                    SnpIndel._measure(graph, line2),
                    showPheno ? SnpIndel._measure(graph, phenoLine) : 0,
                    showDetail ? SnpIndel._measure(graph, detailLine) : 0
                ) + 1.0;

                const h = 1.20 + (showPheno ? 0.52 : 0) + (showDetail ? 0.70 : 0);
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

                // The rows below the change stack in order, so a box with no phenotype keeps
                // the significance where it has always been.
                let rowY = chosen.y + 1.60;
                if (showPheno) {
                    SnpIndel._drawTextOnBackdrop(graph, phenoLine, textX, rowY, '#3730A3', {
                        bg: 'rgba(238,242,255,0.92)',
                        shadow: 'rgba(0,0,0,0.10)',
                        border: 'rgba(0,0,0,0.08)',
                        padX: 0.18,
                        padY: 0.08
                    });
                    rowY += 0.52;
                }

                if (!showDetail) { if (__ddCtx) __ddCtx.globalAlpha = 1; return; }

                const y3 = rowY;

                if (clinsig) {
                    // COLOURED BY WHAT IT SAYS. This pill was mint green whatever the
                    // classification, so a pathogenic variant and a benign one were shown in
                    // the reassuring colour and only the words told them apart -- and the
                    // words are the part a reader skims past.
                    const _st = SnpIndel._sigStyle(clinsig) || { fg: '#065F46', bg: '#ECFDF5', line: '#A7F3D0' };
                    SnpIndel._drawPill(graph, detailLine, textX, y3, {
                        bg: _st.bg,
                        fg: _st.fg,
                        stroke: _st.line
                    });
                    if (__ddCtx) __ddCtx.globalAlpha = 1;
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
                if (__ddCtx) __ddCtx.globalAlpha = 1;
            }
        };
        resolve(snpindel)

    })

}

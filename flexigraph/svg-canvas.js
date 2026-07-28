function () {

    return new Promise((resolve, reject) => {

        class SVGCanvasContext {
            width = 1100;
            height = 1990;

            constructor(width = 1100, height = 1990) {
                this.width = width;
                this.height = height;

                this.svgCommands = [];
                this.defs = [];
                this.gradients = [];
                this.stateStack = [];
                this._gradientIdCounter = 0;
                this._clipIdCounter = 0;

                this.currentPath = '';

                this.state = {
                    fillStyle: 'black',
                    strokeStyle: 'black',
                    lineWidth: 1,
                    globalAlpha: 1,
                    lineDash: [],
                    lineCap: 'butt',
                    lineJoin: 'miter',
                    miterLimit: 10,
                    font: '10px sans-serif',
                    textAlign: 'start',
                    textBaseline: 'alphabetic',
                    clipPathId: null
                };

                this.canvas = {
                    width: this.width,
                    height: this.height
                };

                this.hiddenSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                this.hiddenSvg.style.position = "absolute";
                this.hiddenSvg.style.visibility = "hidden";
                this.hiddenSvg.style.pointerEvents = "none";
                this.hiddenSvg.style.left = "-99999px";
                this.hiddenSvg.style.top = "-99999px";
                document.body.appendChild(this.hiddenSvg);

                this._matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            }

            _escapeXML(str) {
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            }

            _cloneState() {
                return {
                    ...this.state,
                    lineDash: [...this.state.lineDash]
                };
            }

            _matrixToSVG() {
                const { a, b, c, d, e, f } = this._matrix;
                return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
            }

            _commonDrawAttrs(extra = '') {
                const transform = `transform="${this._matrixToSVG()}"`;
                const clip = this.state.clipPathId ? `clip-path="url(#${this.state.clipPathId})"` : '';
                return [transform, clip, extra].filter(Boolean).join(' ');
            }

            _strokeAttrs() {
                const dash = this.state.lineDash.length ? `stroke-dasharray="${this.state.lineDash.join(',')}"` : '';
                return `
            stroke="${this.state.strokeStyle}"
            stroke-width="${this.state.lineWidth}"
            stroke-opacity="${this.state.globalAlpha}"
            stroke-linecap="${this.state.lineCap}"
            stroke-linejoin="${this.state.lineJoin}"
            stroke-miterlimit="${this.state.miterLimit}"
            ${dash}
        `.trim();
            }

            _fillValueToSVG(fillStyle) {
                if (fillStyle && typeof fillStyle === 'object' && fillStyle._svgType && fillStyle.id) {
                    return `url(#${fillStyle.id})`;
                }
                return fillStyle;
            }

            _appendCommand(tag) {
                this.svgCommands.push(tag);
            }

            _parseFont(font) {

                const result = {
                    fontStyle: 'normal',
                    fontWeight: 'normal',
                    fontSize: '10px',
                    fontFamily: 'sans-serif'
                };

                if (!font || typeof font !== 'string') return result;

                const sizeMatch = font.match(/(\d+(?:\.\d+)?px)/);
                if (sizeMatch) {
                    result.fontSize = sizeMatch[1];
                    const idx = font.indexOf(sizeMatch[1]);
                    result.fontFamily = font.slice(idx + sizeMatch[1].length).trim() || 'sans-serif';
                    const prefix = font.slice(0, idx).trim();
                    if (/\bitalic\b/.test(prefix)) result.fontStyle = 'italic';
                    if (/\bbold\b|\b[5-9]00\b/.test(prefix)) result.fontWeight = 'bold';
                } else {
                    result.fontFamily = font;
                }

                return result;
            }

            _textAnchor() {
                switch (this.state.textAlign) {
                    case 'center': return 'middle';
                    case 'right':
                    case 'end': return 'end';
                    case 'left':
                    case 'start':
                    default: return 'start';
                }
            }

            _dominantBaseline() {
                switch (this.state.textBaseline) {
                    case 'top': return 'text-before-edge';
                    case 'hanging': return 'hanging';
                    case 'middle': return 'middle';
                    case 'ideographic':
                    case 'bottom': return 'text-after-edge';
                    case 'alphabetic':
                    default: return 'alphabetic';
                }
            }

            _addDefsIfNeeded() {
                const defs = [];

                for (const grad of this.gradients) {
                    if (grad._svgType === 'linearGradient') {
                        defs.push(`
<linearGradient id="${grad.id}" x1="${grad.x0}" y1="${grad.y0}" x2="${grad.x1}" y2="${grad.y1}" gradientUnits="userSpaceOnUse">
    ${grad.colorStops.map(stop => `<stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join('')}
</linearGradient>`.trim());
                    } else if (grad._svgType === 'radialGradient') {
                        defs.push(`
<radialGradient id="${grad.id}" cx="${grad.x1}" cy="${grad.y1}" r="${grad.r1}" fx="${grad.x0}" fy="${grad.y0}" gradientUnits="userSpaceOnUse">
    ${grad.colorStops.map(stop => `<stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`).join('')}
</radialGradient>`.trim());
                    }
                }

                defs.push(...this.defs);

                return defs.length ? `<defs>${defs.join('')}</defs>` : '';
            }

            createLinearGradient(x0, y0, x1, y1) {
                const id = `svg-grad-${this._gradientIdCounter++}`;
                const grad = {
                    _svgType: 'linearGradient',
                    id,
                    x0, y0, x1, y1,
                    colorStops: [],
                    addColorStop(offset, color) {
                        this.colorStops.push({ offset, color });
                    }
                };
                this.gradients.push(grad);
                return grad;
            }

            createRadialGradient(x0, y0, r0, x1, y1, r1) {
                const id = `svg-grad-${this._gradientIdCounter++}`;
                const grad = {
                    _svgType: 'radialGradient',
                    id,
                    x0, y0, r0, x1, y1, r1,
                    colorStops: [],
                    addColorStop(offset, color) {
                        this.colorStops.push({ offset, color });
                    }
                };
                this.gradients.push(grad);
                return grad;
            }

            getTransform() {
                const m = this._matrix;
                return {
                    a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f,
                    is2D: true,
                    translateSelf: function () { return this; },
                    scaleSelf: function () { return this; },
                    rotateSelf: function () { return this; },
                    multiplySelf: function () { return this; },
                    invertSelf: function () { return this; },
                };
            }

            resetTransform() {
                this._matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            }

            setTransform(a, b, c, d, e, f) {
                if (typeof a === 'object' && a !== null) {
                    this._matrix = {
                        a: a.a ?? 1,
                        b: a.b ?? 0,
                        c: a.c ?? 0,
                        d: a.d ?? 1,
                        e: a.e ?? 0,
                        f: a.f ?? 0
                    };
                    return;
                }
                this._matrix = { a, b, c, d, e, f };
            }

            transform(a, b, c, d, e, f) {
                const m = this._matrix;
                this._matrix = {
                    a: m.a * a + m.c * b,
                    b: m.b * a + m.d * b,
                    c: m.a * c + m.c * d,
                    d: m.b * c + m.d * d,
                    e: m.a * e + m.c * f + m.e,
                    f: m.b * e + m.d * f + m.f
                };
            }

            translate(dx, dy) {
                this.transform(1, 0, 0, 1, dx, dy);
            }

            scale(sx, sy = sx) {
                this.transform(sx, 0, 0, sy, 0, 0);
            }

            rotate(angle) {
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                this.transform(cos, sin, -sin, cos, 0, 0);
            }

            save() {
                this.stateStack.push({
                    state: this._cloneState(),
                    matrix: { ...this._matrix }
                });
            }

            restore() {
                if (!this.stateStack.length) return;
                const item = this.stateStack.pop();
                this.state = item.state;
                this._matrix = item.matrix;
            }

            setLineDash(segments) {
                this.state.lineDash = Array.isArray(segments) ? [...segments] : [];
            }

            getLineDash() {
                return [...this.state.lineDash];
            }

            beginPath() {
                this.currentPath = '';
            }

            closePath() {
                this.currentPath += 'Z ';
            }

            moveTo(x, y) {
                this.currentPath += `M${x},${y} `;
            }

            lineTo(x, y) {
                this.currentPath += `L${x},${y} `;
            }

            rect(x, y, width, height) {
                this.currentPath += `M${x},${y} h${width} v${height} h${-width} Z `;
            }

            roundRect(x, y, width, height, radii = 0) {
                let tl, tr, br, bl;

                if (typeof radii === 'number') {
                    tl = tr = br = bl = radii;
                } else if (Array.isArray(radii)) {
                    if (radii.length === 1) {
                        tl = tr = br = bl = radii[0];
                    } else if (radii.length === 2) {
                        [tl, tr] = radii;
                        br = bl = tr;
                    } else if (radii.length === 3) {
                        [tl, tr, br] = radii;
                        bl = br;
                    } else {
                        [tl, tr, br, bl] = radii;
                    }
                } else if (typeof radii === 'object' && radii !== null) {
                    tl = radii.tl || 0;
                    tr = radii.tr || 0;
                    br = radii.br || 0;
                    bl = radii.bl || 0;
                } else {
                    tl = tr = br = bl = 0;
                }

                const maxR = Math.min(width, height) / 2;
                tl = Math.min(tl, maxR);
                tr = Math.min(tr, maxR);
                br = Math.min(br, maxR);
                bl = Math.min(bl, maxR);

                this.moveTo(x + tl, y);
                this.lineTo(x + width - tr, y);
                if (tr > 0) this.quadraticCurveTo(x + width, y, x + width, y + tr);
                else this.lineTo(x + width, y);

                this.lineTo(x + width, y + height - br);
                if (br > 0) this.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
                else this.lineTo(x + width, y + height);

                this.lineTo(x + bl, y + height);
                if (bl > 0) this.quadraticCurveTo(x, y + height, x, y + height - bl);
                else this.lineTo(x, y + height);

                this.lineTo(x, y + tl);
                if (tl > 0) this.quadraticCurveTo(x, y, x + tl, y);
                else this.lineTo(x, y);
            }

            quadraticCurveTo(cpx, cpy, x, y) {
                this.currentPath += `Q${cpx},${cpy} ${x},${y} `;
            }

            bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
                this.currentPath += `C${cp1x},${cp1y} ${cp2x},${cp2y} ${x},${y} `;
            }

            arcTo(x1, y1, x2, y2, radius) {

                if (radius <= 0) {
                    this.lineTo(x1, y1);
                    return;
                }
                this.quadraticCurveTo(x1, y1, x2, y2);
            }

            arc(x, y, radius, startAngle, endAngle, counterclockwise = false) {
                const twoPi = Math.PI * 2;
                let sa = startAngle;
                let ea = endAngle;
                let delta = ea - sa;

                if (!counterclockwise && delta < 0) delta += twoPi;
                if (counterclockwise && delta > 0) delta -= twoPi;

                if (Math.abs(delta) >= twoPi) {
                    ea = sa + (counterclockwise ? -1 : 1) * (twoPi - 1e-6);
                    delta = ea - sa;
                }

                const startX = x + radius * Math.cos(sa);
                const startY = y + radius * Math.sin(sa);
                const endX = x + radius * Math.cos(ea);
                const endY = y + radius * Math.sin(ea);

                const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
                const sweepFlag = counterclockwise ? 0 : 1;

                this.currentPath += `M${startX},${startY} A${radius},${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX},${endY} `;
            }

            ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise = false) {
                const rotDeg = rotation * (180 / Math.PI);
                const twoPi = Math.PI * 2;

                let sa = startAngle;
                let ea = endAngle;
                let delta = ea - sa;

                if (!counterclockwise && delta < 0) delta += twoPi;
                if (counterclockwise && delta > 0) delta -= twoPi;

                if (Math.abs(delta) >= twoPi) {
                    ea = sa + (counterclockwise ? -1 : 1) * (twoPi - 1e-6);
                    delta = ea - sa;
                }

                const startX = x + radiusX * Math.cos(sa);
                const startY = y + radiusY * Math.sin(sa);
                const endX = x + radiusX * Math.cos(ea);
                const endY = y + radiusY * Math.sin(ea);

                const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
                const sweepFlag = counterclockwise ? 0 : 1;

                this.currentPath += `M${startX},${startY} A${radiusX},${radiusY} ${rotDeg} ${largeArcFlag} ${sweepFlag} ${endX},${endY} `;
            }

            clip(fillRule = 'nonzero') {
                if (!this.currentPath) return;

                const clipId = `svg-clip-${this._clipIdCounter++}`;
                const transform = this._matrixToSVG();

                this.defs.push(`
<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
    <path d="${this.currentPath}" transform="${transform}" clip-rule="${fillRule}"/>
</clipPath>`.trim());

                this.state.clipPathId = clipId;
            }

            fill(fillRule = 'nonzero') {
                if (!this.currentPath) return;
                const fill = this._fillValueToSVG(this.state.fillStyle);
                this._appendCommand(
                    `<path d="${this.currentPath}" fill="${fill}" fill-opacity="${this.state.globalAlpha}" fill-rule="${fillRule}" stroke="none" ${this._commonDrawAttrs()}/>`
                );
            }

            stroke() {
                if (!this.currentPath) return;
                this._appendCommand(
                    `<path d="${this.currentPath}" fill="none" ${this._strokeAttrs()} ${this._commonDrawAttrs()}/>`
                );
            }

            fillRect(x, y, width, height) {
                const fill = this._fillValueToSVG(this.state.fillStyle);
                this._appendCommand(
                    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" fill-opacity="${this.state.globalAlpha}" stroke="none" ${this._commonDrawAttrs()}/>`
                );
            }

            strokeRect(x, y, width, height) {
                this._appendCommand(
                    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" ${this._strokeAttrs()} ${this._commonDrawAttrs()}/>`
                );
            }

            clearRect(x, y, width, height) {

                this._appendCommand(
                    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" fill-opacity="1" stroke="none" ${this._commonDrawAttrs()}/>`
                );
            }

            drawImage(image, ...args) {
                let imageUrl;
                let naturalWidth = image?.width || 0;
                let naturalHeight = image?.height || 0;

                if (image instanceof HTMLImageElement || image instanceof HTMLCanvasElement) {
                    const canvas = document.createElement('canvas');
                    canvas.width = naturalWidth;
                    canvas.height = naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0);
                    imageUrl = canvas.toDataURL();
                } else {
                    imageUrl = image;
                }

                let sx = 0, sy = 0, sWidth = naturalWidth, sHeight = naturalHeight;
                let dx = 0, dy = 0, dWidth = naturalWidth, dHeight = naturalHeight;

                if (args.length === 2) {
                    [dx, dy] = args;
                } else if (args.length === 4) {
                    [dx, dy, dWidth, dHeight] = args;
                } else if (args.length === 8) {
                    [sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] = args;
                } else {
                    throw new Error('drawImage expects 3, 5, or 9 arguments total.');
                }

                if (args.length === 8) {

                }

                this._appendCommand(
                    `<image href="${imageUrl}" x="${dx}" y="${dy}" width="${dWidth}" height="${dHeight}" opacity="${this.state.globalAlpha}" preserveAspectRatio="none" ${this._commonDrawAttrs()}/>`
                );
            }

            fillText(text, x, y) {
                const f = this._parseFont(this.state.font);
                const fill = this._fillValueToSVG(this.state.fillStyle);

                this._appendCommand(
                    `<text x="${x}" y="${y}"
                fill="${fill}"
                fill-opacity="${this.state.globalAlpha}"
                stroke="none"
                font-family="${this._escapeXML(f.fontFamily)}"
                font-size="${f.fontSize}"
                font-style="${f.fontStyle}"
                font-weight="${f.fontWeight}"
                text-anchor="${this._textAnchor()}"
                dominant-baseline="${this._dominantBaseline()}"
                ${this._commonDrawAttrs()}
            >${this._escapeXML(text)}</text>`
                );
            }

            strokeText(text, x, y) {
                const f = this._parseFont(this.state.font);

                this._appendCommand(
                    `<text x="${x}" y="${y}"
                fill="none"
                ${this._strokeAttrs()}
                font-family="${this._escapeXML(f.fontFamily)}"
                font-size="${f.fontSize}"
                font-style="${f.fontStyle}"
                font-weight="${f.fontWeight}"
                text-anchor="${this._textAnchor()}"
                dominant-baseline="${this._dominantBaseline()}"
                ${this._commonDrawAttrs()}
            >${this._escapeXML(text)}</text>`
                );
            }

            measureText(text) {
                const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                const f = this._parseFont(this.state.font);

                textElement.setAttribute("x", 0);
                textElement.setAttribute("y", 0);
                textElement.setAttribute("font-family", f.fontFamily);
                textElement.setAttribute("font-size", f.fontSize);
                textElement.setAttribute("font-style", f.fontStyle);
                textElement.setAttribute("font-weight", f.fontWeight);
                textElement.textContent = text;

                this.hiddenSvg.appendChild(textElement);
                const bbox = textElement.getBBox();
                this.hiddenSvg.removeChild(textElement);

                return {
                    width: bbox.width,
                    actualBoundingBoxLeft: 0,
                    actualBoundingBoxRight: bbox.width,
                    actualBoundingBoxAscent: bbox.height,
                    actualBoundingBoxDescent: 0
                };
            }

            getCTX() {
                return this;
            }

            getContainer() {
                return null;
            }

            setWidth(width) {
                this.width = width;
                this.canvas.width = width;
            }

            setHeight(height) {
                this.height = height;
                this.canvas.height = height;
            }

            set fillStyle(value) { this.state.fillStyle = value; }
            get fillStyle() { return this.state.fillStyle; }

            set strokeStyle(value) { this.state.strokeStyle = value; }
            get strokeStyle() { return this.state.strokeStyle; }

            set lineWidth(value) { this.state.lineWidth = value; }
            get lineWidth() { return this.state.lineWidth; }

            set globalAlpha(value) { this.state.globalAlpha = value; }
            get globalAlpha() { return this.state.globalAlpha; }

            set font(value) { this.state.font = value; }
            get font() { return this.state.font; }

            set lineCap(value) { this.state.lineCap = value; }
            get lineCap() { return this.state.lineCap; }

            set lineJoin(value) { this.state.lineJoin = value; }
            get lineJoin() { return this.state.lineJoin; }

            set miterLimit(value) { this.state.miterLimit = value; }
            get miterLimit() { return this.state.miterLimit; }

            set textAlign(value) { this.state.textAlign = value; }
            get textAlign() { return this.state.textAlign; }

            set textBaseline(value) { this.state.textBaseline = value; }
            get textBaseline() { return this.state.textBaseline; }

            getSVG() {
                const defs = this._addDefsIfNeeded();
                return `<svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">${defs}${this.svgCommands.join('')}</svg>`;
            }
        }

        return resolve(SVGCanvasContext);
    })

}

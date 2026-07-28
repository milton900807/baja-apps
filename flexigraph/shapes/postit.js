function () {
    return new Promise(async (resolve, reject) => {

        function wrapText(text, fontSize, ctx, availableWidth, availableHeight) {
            ctx.font = `${fontSize}px Arial`;
            const words = (text || '').split(' ');
            let line = '';
            const wrappedLines = [];
            for (let word of words) {
                const testLine = line ? line + ' ' + word : word;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > availableWidth && line !== '') {
                    wrappedLines.push(line);
                    line = word;
                } else {
                    line = testLine;
                }
            }
            if (line) wrappedLines.push(line);
            return wrappedLines;
        }

        const clampDeg = (deg) => Math.max(-30, Math.min(30, deg));
        const degToRad = (deg) => (deg * Math.PI) / 180;
        const randomBetween = (min, max) => Math.random() * (max - min) + min;

        const NOTE_PALETTES = {
            yellow: { main: '#FFFB7D', peel: '#F2E96B', stroke: '#CCCC33' },
            blue: { main: '#BFE3FF', peel: '#A9D7FF', stroke: '#6AA7D8' },
            pink: { main: '#FFD1E3', peel: '#F7BFD6', stroke: '#CC8CA6' },
            green: { main: '#D8F7B3', peel: '#C9E9A5', stroke: '#93B872' },
            purple: { main: '#E6D6FF', peel: '#D8C5FA', stroke: '#A892D4' },
            orange: { main: '#FFE1B3', peel: '#F7D39E', stroke: '#C7A46F' }
        };
        const COLOR_WEIGHTS = [
            ['yellow', 0.32],
            ['blue', 0.20],
            ['green', 0.29],
            ['orange', 0.14],
            ['pink', 0.03],
            ['purple', 0.02],
        ];
        function pickWeightedColorKey() {
            const r = Math.random();
            let acc = 0;
            for (const [key, w] of COLOR_WEIGHTS) {
                acc += w;
                if (r <= acc) return key;
            }
            return COLOR_WEIGHTS[0][0];
        }

        let Note = class Note {
            name;
            type = 'Note';
            x; y; xf; yf;
            w = 1; h = 1;
            comment = '';
            hl = false;
            url = null;

            colorKey = 'yellow';
            color = '#FFFB7D';
            peelColor = '#F2E96B';
            strokeColor = '#CCCC33';

            rotationDeg = 0;

            constructor(x, y, xf, yf, colorKeyOrHex, rotationDeg) {
                this.x = x; this.y = y; this.xf = xf; this.yf = yf;

                const autoDeg = randomBetween(-45, 45);
                this.rotationDeg = clampDeg(Number.isFinite(rotationDeg) ? rotationDeg : autoDeg);

                if (typeof colorKeyOrHex === 'string') {
                    if (NOTE_PALETTES[colorKeyOrHex]) {
                        this.setColorByKey(colorKeyOrHex);
                    } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorKeyOrHex)) {
                        this.setColor(colorKeyOrHex);
                    } else {
                        this._assignWeightedRandomPalette();
                    }
                } else {
                    this._assignWeightedRandomPalette();
                }
            }
            rotateByDeg(deltaDeg) {
                const d = Number(deltaDeg);
                if (!Number.isFinite(d) || !d) return;
                this.rotationDeg = clampDeg((Number(this.rotationDeg) || 0) + d);
            }

            getX() {
                const w = Number.isFinite(this.w) ? this.w : 0;
                return this.x - w / 2;
            }

            getY() {
                const h = Number.isFinite(this.h) ? this.h : 0;
                return this.y - h / 2;
            }

            getXf() {
                const w = Number.isFinite(this.w) ? this.w : 0;
                return this.x + w / 2;
            }

            getYf() {
                const h = Number.isFinite(this.h) ? this.h : 0;
                return this.y + h / 2;
            }

            setX(nx) {
                if (!Number.isFinite(nx)) return;
                const oldLeft = this.getX();
                const dx = nx - oldLeft;
                if (Number.isFinite(this.x)) this.x += dx;
                if (Number.isFinite(this.xf)) this.xf += dx;
            }

            setY(ny) {
                if (!Number.isFinite(ny)) return;
                const oldTop = this.getY();
                const dy = ny - oldTop;
                if (Number.isFinite(this.y)) this.y += dy;
                if (Number.isFinite(this.yf)) this.yf += dy;
            }
            _assignWeightedRandomPalette() {
                const key = pickWeightedColorKey();
                this.setColorByKey(key);
            }

            setRotation(deg) {
                this.rotationDeg = clampDeg(Number.isFinite(deg) ? deg : 0);
            }

            setColor(hex) {

                this.color = hex;
                this.peelColor = '#00000010' ? this._derivePeel(hex) : NOTE_PALETTES.yellow.peel;
                this.strokeColor = NOTE_PALETTES.yellow.stroke;
                this.colorKey = 'custom';
            }

            setColorByKey(key) {
                const p = NOTE_PALETTES[key] || NOTE_PALETTES.yellow;
                this.colorKey = key;
                this.color = p.main;
                this.peelColor = p.peel;
                this.strokeColor = p.stroke;
            }

            _derivePeel(hex) {
                try {
                    const m = hex.replace('#', '');
                    const n = m.length === 3
                        ? m.split('').map(c => parseInt(c + c, 16))
                        : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
                    const s = n.map(v => Math.max(0, Math.min(255, Math.round(v * 0.92))));
                    return `#${s.map(v => v.toString(16).padStart(2, '0')).join('')}`;
                } catch { return NOTE_PALETTES.yellow.peel; }
            }

            move(x, y) {
                if (x != null && y != null) {

                    this.setX(x);
                    this.setY(y);
                }
            }

            highlight(v) { this.hl = v; }

            update(x, y) {

                this.w = x - this.x;
                this.h = this.y - y;
            }

            isMouseOverArrow(mouseX, mouseY) {
                const dist = this.pointToSegmentDistance?.(mouseX, mouseY) ?? Infinity;
                return dist < 10;
            }

            isIn(px, py) { return false; }

            inside(grid, mouseX, mouseY) {
                const graph = grid;
                const centerX = graph.X(this.x);
                const centerY = graph.Y(this.y);
                const angle = degToRad(this.rotationDeg);

                const noteWidth = graph.screenWidth(this.w);
                const noteHeight = graph.screenHeight(this.h);
                if (noteWidth < 40 || noteHeight < 40) return false;

                const x = -noteWidth / 2;
                const y = -noteHeight / 2;
                const peelSize = graph.screenHeight(this.h / 3);

                const dx = mouseX - centerX;
                const dy = mouseY - centerY;
                const cosA = Math.cos(-angle);
                const sinA = Math.sin(-angle);
                const localX = dx * cosA - dy * sinA;
                const localY = dx * sinA + dy * cosA;

                if (localX < x || localX > x + noteWidth || localY < y || localY > y + noteHeight) return false;

                const A = { x: x, y: y + peelSize };
                const B = { x: x + peelSize, y: y };
                const C = { x: x, y: y };
                function pointInTriangle(px, py, a, b, c) {
                    const v0x = c.x - a.x, v0y = c.y - a.y;
                    const v1x = b.x - a.x, v1y = b.y - a.y;
                    const v2x = px - a.x, v2y = py - a.y;
                    const dot00 = v0x * v0x + v0y * v0y;
                    const dot01 = v0x * v1x + v0y * v1y;
                    const dot02 = v0x * v2x + v0y * v2y;
                    const dot11 = v1x * v1x + v1y * v1y;
                    const dot12 = v1x * v2x + v1y * v2y;
                    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
                    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
                    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
                    return (u >= 0) && (v >= 0) && (u + v <= 1);
                }
                if (pointInTriangle(localX, localY, A, B, C)) return false;

                return true;
            }

            toJSON() {

                const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
                const bool = (v) => !!v;
                const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
                const nullableStr = (v) => (typeof v === 'string' ? v : null);

                return {
                    type: 'Note',
                    name: nullableStr(this.name),

                    x: num(this.x),
                    y: num(this.y),
                    xf: num(this.xf),
                    yf: num(this.yf),
                    w: num(this.w, 1),
                    h: num(this.h, 1),

                    comment: str(this.comment),
                    hl: bool(this.hl),
                    url: this.url == null ? null : String(this.url),

                    colorKey: str(this.colorKey, 'yellow'),
                    color: str(this.color, '#FFFB7D'),
                    peelColor: str(this.peelColor, '#F2E96B'),
                    strokeColor: str(this.strokeColor, '#CCCC33'),

                    rotationDeg: num(this.rotationDeg, 0),
                };
            }

            draw(graph, ctx) {

                const centerX = graph.X(this.x);
                const centerY = graph.Y(this.y);
                const angle = degToRad(this.rotationDeg);

                const noteWidth = graph.screenWidth(this.w);
                const noteHeight = graph.screenHeight(this.h);
                if (noteWidth < 40 || noteHeight < 40) return;

                const peelSize = graph.screenHeight(this.h / 3);

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angle);

                const x = -noteWidth / 2;
                const y = -noteHeight / 2;

                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                ctx.beginPath();
                ctx.moveTo(x + peelSize, y);
                ctx.lineTo(x + noteWidth, y);
                ctx.lineTo(x + noteWidth, y + noteHeight);
                ctx.lineTo(x, y + noteHeight);
                ctx.lineTo(x, y + peelSize);
                ctx.closePath();

                ctx.fillStyle = this.color;
                ctx.strokeStyle = this.strokeColor;
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

                ctx.beginPath();
                ctx.moveTo(x, y + peelSize);
                ctx.lineTo(x + peelSize, y);
                ctx.lineTo(x, y);
                ctx.closePath();
                ctx.fillStyle = this.peelColor;
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x, y + peelSize);
                ctx.lineTo(x + peelSize, y);
                ctx.lineTo(x, y);
                ctx.closePath();
                const gradient = ctx.createLinearGradient(x, y + peelSize, x + peelSize, y);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.fill();

                const hasClickHere = /click here/i.test(this.comment || "");
                if (hasClickHere) {
                    const pad = 8;
                    const iconSize = Math.min(noteWidth, noteHeight) * 0.18;
                    const ix = x + noteWidth - pad - iconSize;
                    const iy = y + pad;
                    drawCheckmark(ctx, ix, iy, iconSize);
                }

                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxFontSize = 16;
                const minFontSize = 8;
                const padding = 10;
                const availableWidth = noteWidth - padding * 2;
                const availableHeight = noteHeight - padding * 2;

                let fontSize = maxFontSize;
                let lines = [];
                do {
                    lines = wrapText(this.comment, fontSize, ctx, availableWidth, availableHeight);
                    const totalHeight = lines.length * fontSize * 1.2;
                    if (totalHeight <= availableHeight) break;
                    fontSize -= 1;
                } while (fontSize >= minFontSize);

                ctx.font = `${Math.max(minFontSize, fontSize)}px Arial`;
                if (fontSize <= minFontSize) {
                    const ellipsis = '…';
                    let text = this.comment || '';
                    while (text.length > 0) {
                        const metrics = ctx.measureText(text + ellipsis);
                        if (metrics.width <= availableWidth) {
                            text += ellipsis;
                            lines = [text];
                            break;
                        }
                        text = text.slice(0, -1);
                    }
                }

                const lineHeight = Math.max(minFontSize, fontSize) * 1.2;
                const textStartY = -((lines.length - 1) * lineHeight) / 2;
                lines.forEach((line, i) => ctx.fillText(line, 0, textStartY + i * lineHeight));

                ctx.restore();

                function drawCheckmark(ctx, x, y, size) {
                    ctx.save();
                    const r = size * 0.55;
                    const cx = x + size * 0.6;
                    const cy = y + size * 0.6;

                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.06)';
                    ctx.fill();

                    ctx.beginPath();
                    const startX = x + size * 0.25;
                    const startY = y + size * 0.55;
                    const midX = x + size * 0.45;
                    const midY = y + size * 0.75;
                    const endX = x + size * 0.85;
                    const endY = y + size * 0.30;
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(midX, midY);
                    ctx.lineTo(endX, endY);

                    ctx.strokeStyle = '#2e7d32';
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = Math.max(2, size * 0.12);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        resolve(Note);
    });
}

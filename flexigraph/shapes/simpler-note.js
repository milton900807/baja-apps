function () {
    return new Promise(async (resolve, reject) => {

        function wrapText(text, fontSize, ctx, availableWidth, availableHeight) {
            ctx.font = `${fontSize}px Arial`;
            const words = text.split(' ');
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
        let BNote = class BNote {
            name;
            type = 'Simpler-Note';
            x;
            y;
            xf;
            yf;
            w = 1;
            h = 1;
            color = 'lightblue';
            comment = '';
            hl = false;
            url = null;

            constructor(x, y, xf, yf, color) {
                this.x = x;
                this.y = y;
                this.xf = xf;
                this.yf = yf;
                if (color) {
                    this.color = color;
                }
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
                if (!dx) return;
                if (Number.isFinite(this.x)) this.x += dx;
                if (Number.isFinite(this.xf)) this.xf += dx;
            }

            setY(ny) {
                if (!Number.isFinite(ny)) return;
                const oldTop = this.getY();
                const dy = ny - oldTop;
                if (!dy) return;
                if (Number.isFinite(this.y)) this.y += dy;
                if (Number.isFinite(this.yf)) this.yf += dy;
            }

            setXf(nxf) {
                if (!Number.isFinite(nxf)) return;
                const oldRight = this.getXf();
                const dx = nxf - oldRight;
                if (!dx) return;
                if (Number.isFinite(this.x)) this.x += dx;
                if (Number.isFinite(this.xf)) this.xf += dx;
            }

            setYf(nyf) {
                if (!Number.isFinite(nyf)) return;
                const oldBottom = this.getYf();
                const dy = nyf - oldBottom;
                if (!dy) return;
                if (Number.isFinite(this.y)) this.y += dy;
                if (Number.isFinite(this.yf)) this.yf += dy;
            }

            setColor(color) {
                this.color = color;
            }

            move(x, y) {

                if (x != null && y != null) {
                    this.setX(x);
                    this.setY(y);
                }
            }

            isMouseOverArrow(mouseX, mouseY) {
                const dist = this.pointToSegmentDistance?.(mouseX, mouseY) ?? Infinity;
                return dist < 10;
            }

            inside(grid, x, y) {
                const px = grid.X(x);
                const py = grid.Y(y);

                const centerX = grid.X(this.x);
                const centerY = grid.Y(this.y);

                const noteWidth = grid.screenWidth(this.w);
                const noteHeight = grid.screenHeight(this.h);

                if (noteWidth < 40 || noteHeight < 40) return false;

                const sx = centerX - noteWidth / 2;
                const sy = centerY - noteHeight / 2;

                return (
                    px >= sx && px <= sx + noteWidth &&
                    py >= sy && py <= sy + noteHeight
                );
            }

            isIn(px, py) {
                return false;
            }

            highlight(v) {
                this.hl = v;
            }

            update(x, y) {

                this.w = x - this.x;
                this.h = this.y - y;
            }

            static fromJSON(data) {

                const note = new BNote(
                    data.x,
                    data.y,
                    data.xf,
                    data.yf,
                    data.color
                );

                Object.assign(note, data);

                return note;
            }
            toJSON() {

                function safeValue(value) {

                    // Preserve functions
                    if (typeof value === 'function') {
                        return {
                            __type: 'function',
                            source: value.toString()
                        };
                    }

                    // Prevent NaN / Infinity corruption
                    if (typeof value === 'number' && !Number.isFinite(value)) {
                        return 0;
                    }

                    return value;
                }

                return {
                    type: this.type ?? 'Simpler-Note',

                    name: this.name ?? '',

                    x: safeValue(this.x),
                    y: safeValue(this.y),

                    xf: safeValue(this.xf),
                    yf: safeValue(this.yf),

                    w: safeValue(this.w),
                    h: safeValue(this.h),

                    color: this.color ?? 'lightblue',

                    comment: this.comment ?? '',

                    hl: !!this.hl,

                    url: this.url ?? null
                };
            }

            draw(graph, ctx) {
                const xStart = graph.X(this.x);
                const yStart = graph.Y(this.y);

                const noteWidth = graph.screenWidth(this.w);
                const noteHeight = graph.screenHeight(this.h);

                if (noteWidth < 40 || noteHeight < 40) {
                    return;
                }

                const peelSize = noteHeight / 6;
                ctx.save();

                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                const x = xStart - noteWidth / 2;
                const y = yStart - noteHeight / 2;

                ctx.beginPath();
                ctx.moveTo(x + peelSize, y);
                ctx.lineTo(x + noteWidth, y);
                ctx.lineTo(x + noteWidth, y + noteHeight);
                ctx.lineTo(x, y + noteHeight);
                ctx.lineTo(x, y + peelSize);
                ctx.closePath();

                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#AAAAAA';
                ctx.lineWidth = 1.5;
                ctx.fill();
                ctx.stroke();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.strokeStyle = '#A0C4FF';
                ctx.lineWidth = 1;
                const lineSpacing = 20;
                for (let i = y + lineSpacing; i < y + noteHeight - 5; i += lineSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(x + 5, i);
                    ctx.lineTo(x + noteWidth - 5, i);
                    ctx.stroke();
                }

                ctx.strokeStyle = '#FF6B6B';
                ctx.beginPath();
                ctx.moveTo(x + 30, y + 5);
                ctx.lineTo(x + 30, y + noteHeight - 5);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x, y + peelSize);
                ctx.lineTo(x + peelSize, y);
                ctx.lineTo(x, y);
                ctx.closePath();

                ctx.fillStyle = '#f2f2f2';
                ctx.fill();
                ctx.stroke();

                const gradient = ctx.createLinearGradient(x, y + peelSize, x + peelSize, y);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.fill();

                const holeRadius = 4;
                const holeX = x + 12;
                const spacing = noteHeight / 4;

                for (let i = 1; i <= 3; i++) {
                    const holeY = y + spacing * i;
                    ctx.beginPath();
                    ctx.arc(holeX, holeY, holeRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = '#dddddd';
                    ctx.fill();
                    ctx.strokeStyle = '#999999';
                    ctx.stroke();
                }

                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxFontSize = 16;
                const minFontSize = 8;
                const padding = 10;
                const availableWidth = noteWidth - padding * 2 - 30;
                const availableHeight = noteHeight - padding * 2;

                let fontSize = maxFontSize;
                let lines = [];

                do {
                    lines = wrapText(this.comment, fontSize, ctx, availableWidth, availableHeight);
                    const totalHeight = lines.length * fontSize * 1.2;
                    if (totalHeight <= availableHeight) break;
                    fontSize -= 1;
                } while (fontSize >= minFontSize);

                ctx.font = `${fontSize}px Arial`;

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

                const lineHeight = fontSize * 1.2;
                const textStartY = y + noteHeight / 2 - ((lines.length - 1) * lineHeight) / 2;

                lines.forEach((line, i) => {
                    ctx.fillText(line, x + 40, textStartY + i * lineHeight);
                });

                ctx.restore();
            }
        };

        resolve(BNote)
    })
}

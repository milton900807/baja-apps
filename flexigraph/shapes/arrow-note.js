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
        let ArrowNote = class ArrowNote {
            name;
            type = 'Arrow-Note';
            x;
            y;
            xf;
            yf;
            w = 1;
            h = 1;
            arrowDirection = 'left';
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
                const arrowDirection = (this.arrowDirection || 'left').toLowerCase();

                const px = grid.X(x);
                const py = grid.Y(y);

                const xStart = grid.X(this.x);
                const yStart = grid.Y(this.y);

                const noteWidth = grid.screenWidth(this.w);
                const noteHeight = grid.screenHeight(this.h);

                if (noteWidth < 60 || noteHeight < 40) {
                    return false;
                }

                const arrowSize = 30;
                const x0 = xStart - noteWidth / 2;
                const y0 = yStart - noteHeight / 2;

                let polygon = [];

                if (arrowDirection === 'left') {
                    polygon = [
                        [x0 + arrowSize, y0],
                        [x0 + noteWidth, y0],
                        [x0 + noteWidth, y0 + noteHeight],
                        [x0 + arrowSize, y0 + noteHeight],
                        [x0 + arrowSize, y0 + noteHeight * 0.65],
                        [x0, y0 + noteHeight / 2],
                        [x0 + arrowSize, y0 + noteHeight * 0.35]
                    ];
                } else if (arrowDirection === 'right') {
                    polygon = [
                        [x0, y0],
                        [x0 + noteWidth - arrowSize, y0],
                        [x0 + noteWidth - arrowSize, y0 + noteHeight * 0.35],
                        [x0 + noteWidth, y0 + noteHeight / 2],
                        [x0 + noteWidth - arrowSize, y0 + noteHeight * 0.65],
                        [x0 + noteWidth - arrowSize, y0 + noteHeight],
                        [x0, y0 + noteHeight]
                    ];
                } else if (arrowDirection === 'up') {
                    polygon = [
                        [x0, y0 + arrowSize],
                        [x0 + noteWidth * 0.35, y0 + arrowSize],
                        [x0 + noteWidth / 2, y0],
                        [x0 + noteWidth * 0.65, y0 + arrowSize],
                        [x0 + noteWidth, y0 + arrowSize],
                        [x0 + noteWidth, y0 + noteHeight],
                        [x0, y0 + noteHeight]
                    ];
                } else if (arrowDirection === 'down') {
                    polygon = [
                        [x0, y0],
                        [x0 + noteWidth, y0],
                        [x0 + noteWidth, y0 + noteHeight - arrowSize],
                        [x0 + noteWidth * 0.65, y0 + noteHeight - arrowSize],
                        [x0 + noteWidth / 2, y0 + noteHeight],
                        [x0 + noteWidth * 0.35, y0 + noteHeight - arrowSize],
                        [x0, y0 + noteHeight - arrowSize]
                    ];
                }

                return this.pointInPolygon(px, py, polygon);
            }

            pointInPolygon(x, y, polygon) {
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i][0], yi = polygon[i][1];
                    const xj = polygon[j][0], yj = polygon[j][1];

                    const intersect = ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / (yj - yi + Number.EPSILON) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
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

            draw(graph, ctx) {
                const arrowDirection = (this.arrowDirection || 'left').toLowerCase();

                this.type = 'arrow-note-' + arrowDirection;

                const xStart = graph.X(this.x);
                const yStart = graph.Y(this.y);

                const noteWidth = graph.screenWidth(this.w);
                const noteHeight = graph.screenHeight(this.h);

                if (noteWidth < 60 || noteHeight < 40) {
                    return;
                }

                ctx.save();

                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                const x = xStart - noteWidth / 2;
                const y = yStart - noteHeight / 2;

                const arrowSize = 30;

                ctx.beginPath();
                if (arrowDirection === 'left') {
                    ctx.moveTo(x + arrowSize, y);
                    ctx.lineTo(x + noteWidth, y);
                    ctx.lineTo(x + noteWidth, y + noteHeight);
                    ctx.lineTo(x + arrowSize, y + noteHeight);
                    ctx.lineTo(x + arrowSize, y + noteHeight * 0.65);
                    ctx.lineTo(x, y + noteHeight / 2);
                    ctx.lineTo(x + arrowSize, y + noteHeight * 0.35);
                } else if (arrowDirection === 'right') {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + noteWidth - arrowSize, y);
                    ctx.lineTo(x + noteWidth - arrowSize, y + noteHeight * 0.35);
                    ctx.lineTo(x + noteWidth, y + noteHeight / 2);
                    ctx.lineTo(x + noteWidth - arrowSize, y + noteHeight * 0.65);
                    ctx.lineTo(x + noteWidth - arrowSize, y + noteHeight);
                    ctx.lineTo(x, y + noteHeight);
                } else if (arrowDirection === 'up') {
                    ctx.moveTo(x, y + arrowSize);
                    ctx.lineTo(x + noteWidth * 0.35, y + arrowSize);
                    ctx.lineTo(x + noteWidth / 2, y);
                    ctx.lineTo(x + noteWidth * 0.65, y + arrowSize);
                    ctx.lineTo(x + noteWidth, y + arrowSize);
                    ctx.lineTo(x + noteWidth, y + noteHeight);
                    ctx.lineTo(x, y + noteHeight);
                } else if (arrowDirection === 'down') {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + noteWidth, y);
                    ctx.lineTo(x + noteWidth, y + noteHeight - arrowSize);
                    ctx.lineTo(x + noteWidth * 0.65, y + noteHeight - arrowSize);
                    ctx.lineTo(x + noteWidth / 2, y + noteHeight);
                    ctx.lineTo(x + noteWidth * 0.35, y + noteHeight - arrowSize);
                    ctx.lineTo(x, y + noteHeight - arrowSize);
                }
                ctx.closePath();

                ctx.fillStyle = '#FFFFFF';
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.strokeStyle = '#EEEEEE';
                ctx.lineWidth = 1;
                const gridSpacing = 20;

                if (arrowDirection === 'left' || arrowDirection === 'right') {
                    const gxStart = arrowDirection === 'left' ? x + arrowSize + 5 : x + 5;
                    const gxEnd = arrowDirection === 'left' ? x + noteWidth : x + noteWidth - arrowSize;

                    for (let gx = gxStart; gx < gxEnd; gx += gridSpacing) {
                        ctx.beginPath();
                        ctx.moveTo(gx, y + 5);
                        ctx.lineTo(gx, y + noteHeight - 5);
                        ctx.stroke();
                    }

                    for (let gy = y + 5 + gridSpacing; gy < y + noteHeight; gy += gridSpacing) {
                        ctx.beginPath();
                        ctx.moveTo(gxStart, gy);
                        ctx.lineTo(gxEnd, gy);
                        ctx.stroke();
                    }
                } else {
                    const gyStart = arrowDirection === 'up' ? y + arrowSize + 5 : y + 5;
                    const gyEnd = arrowDirection === 'up' ? y + noteHeight : y + noteHeight - arrowSize;

                    for (let gy = gyStart + gridSpacing; gy < gyEnd; gy += gridSpacing) {
                        ctx.beginPath();
                        ctx.moveTo(x + 5, gy);
                        ctx.lineTo(x + noteWidth - 5, gy);
                        ctx.stroke();
                    }

                    for (let gx = x + 5 + gridSpacing; gx < x + noteWidth; gx += gridSpacing) {
                        ctx.beginPath();
                        ctx.moveTo(gx, gyStart);
                        ctx.lineTo(gx, gyEnd);
                        ctx.stroke();
                    }
                }

                ctx.strokeStyle = 'transparent';
                ctx.lineWidth = 1;

                if (arrowDirection === 'left') {
                    ctx.beginPath();
                    ctx.moveTo(x + arrowSize + 20, y + 5);
                    ctx.lineTo(x + arrowSize + 20, y + noteHeight - 5);
                    ctx.stroke();
                } else if (arrowDirection === 'right') {
                    ctx.beginPath();
                    ctx.moveTo(x + 20, y + 5);
                    ctx.lineTo(x + 20, y + noteHeight - 5);
                    ctx.stroke();
                } else if (arrowDirection === 'up') {
                    ctx.beginPath();
                    ctx.moveTo(x + 5, y + arrowSize + 20);
                    ctx.lineTo(x + noteWidth - 5, y + arrowSize + 20);
                    ctx.stroke();
                } else if (arrowDirection === 'down') {
                    ctx.beginPath();
                    ctx.moveTo(x + 5, y + 20);
                    ctx.lineTo(x + noteWidth - 5, y + 20);
                    ctx.stroke();
                }

                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxFontSize = 16;
                const minFontSize = 8;
                const padding = 10;

                let availableWidth, availableHeight, textX, textY;

                if (arrowDirection === 'left') {
                    availableWidth = noteWidth - arrowSize - padding * 2 - 20;
                    availableHeight = noteHeight - padding * 2;
                    textX = x + arrowSize + 30;
                    textY = y;
                } else if (arrowDirection === 'right') {
                    availableWidth = noteWidth - arrowSize - padding * 2 - 20;
                    availableHeight = noteHeight - padding * 2;
                    textX = x + 30;
                    textY = y;
                } else {
                    availableWidth = noteWidth - padding * 2;
                    availableHeight = noteHeight - arrowSize - padding * 2 - 20;
                    textX = x + padding + 5;
                    textY = arrowDirection === 'up' ? y + arrowSize : y + 5;
                }

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
                const textStartY = y + noteHeight / 2 - ((lines.length - 1) * lineHeight) / 2;

                lines.forEach((line, i) => {
                    ctx.fillText(line, textX, textStartY + i * lineHeight);
                });

                ctx.restore();
            }
        };

        resolve(ArrowNote)
    })

}

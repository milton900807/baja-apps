function () {
    return new Promise(async (resolve, reject) => {

        let Arrow = class Arrow {

            name;
            x;
            y;
            xf;
            yf;
            w = 1;
            h = 1;
            color = 'ligthblue';
            comment = '';
            arrowType;

            type = 'arrow';
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
            setColor(color) {
                this.color = color;
            }
            move(x, y) {
                if (!x || !y) {
                    return;
                }
                this.x = x;
                this.y = y;
            }

            toJSON() {
                const json = {
                    type: this.type || 'arrow',
                    name: this.name ?? undefined,

                    x: this.x,
                    y: this.y,
                    xf: this.xf,
                    yf: this.yf,

                    w: this.w,
                    h: this.h,

                    color: this.color,
                    comment: this.comment ?? '',

                    arrowType: this.arrowType ?? undefined,
                    url: this.url ?? undefined,

                    hl: this.hl === true ? true : undefined,
                };

                Object.keys(json).forEach((k) => json[k] === undefined && delete json[k]);

                return json;
            }

            isMouseOverArrow(mouseX, mouseY) {

                const dist = this.pointToSegmentDistance(mouseX, mouseY);
                return dist < 10;
            }

            inside(grid, x, y) {
                let py = grid.Y(y)
                let px = grid.X(x)
                const x1 = grid.X(this.x), y1 = grid.Y(this.y);
                const x2 = grid.X(this.xf), y2 = grid.Y(this.yf);

                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthSquared = dx * dx + dy * dy;

                let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
                t = Math.max(0, Math.min(1, t));
                const closestX = x1 + t * dx;
                const closestY = y1 + t * dy;

                if (Math.hypot(px - closestX, py - closestY) < 5) {
                    return true;
                }
                return false;
            }
            isIn(px, py) {
                const x1 = grid.X(this.x), y1 = grid.Y(this.y);
                const x2 = grid.X(this.xf), y2 = grid.Y(this.yf);

                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthSquared = dx * dx + dy * dy;

                let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
                t = Math.max(0, Math.min(1, t));

                const closestX = x1 + t * dx;
                const closestY = y1 + t * dy;
                return false;

            }
            highlight(v) {
                this.hl = v;
            }

            update(x, y) {
                this.w = x - this.x;
                this.h = this.y - y;
            }

            drawSimple(graph, ctx) {
                let color = this.color;
                let lineWidth = 10;
                let headSize = 20;
                const angle = Math.atan2(graph.Y(this.yf) - graph.Y(this.y), graph.X(this.xf) - graph.X(this.x));
                const headLengthX = headSize * Math.cos(angle);
                const headLengthY = headSize * Math.sin(angle);
                const lineEndX = graph.X(this.xf) - (headLengthX);
                const lineEndY = graph.Y(this.yf) - (headLengthY);
                let xsc = (graph.X(this.x));
                let ysc = graph.Y(this.y);
                let xLength = (lineEndX - xsc);
                let yLength = (lineEndY - ysc);
                const isXInverted = Math.sign(xLength) !== Math.sign(Math.cos(angle));
                const isYInverted = Math.sign(yLength) !== Math.sign(Math.sin(angle));

                if (isXInverted || isYInverted) {
                    return;
                }

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = lineWidth;

                ctx.moveTo(graph.X(this.x), graph.Y(this.y));
                ctx.lineTo((lineEndX), (lineEndY));
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(graph.X(this.xf), graph.Y(this.yf));
                ctx.lineTo(
                    graph.X(this.xf) - headSize * Math.cos(angle - Math.PI / 6),
                    graph.Y(this.yf) - headSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    graph.X(this.xf) - headSize * Math.cos(angle + Math.PI / 6),
                    graph.Y(this.yf) - headSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.lineTo(graph.X(this.xf), graph.Y(this.yf));
                ctx.closePath();
                ctx.fill();

                if (this.comment) {
                    const midX = (graph.X(this.x) + lineEndX) / 2;
                    const midY = (graph.Y(this.y) + lineEndY) / 2;
                    const paddingX = 10;
                    const paddingY = 6;
                    const radius = 6;

                    ctx.save();
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const textWidth = ctx.measureText(this.comment).width;
                    const textHeight = 16;

                    ctx.beginPath();
                    const rectX = midX - textWidth / 2 - paddingX;
                    const rectY = midY - textHeight / 2 - paddingY;
                    const rectWidth = textWidth + paddingX * 2;
                    const rectHeight = textHeight + paddingY * 2;
                    ctx.lineWidth = 2;

                    ctx.moveTo(rectX + radius, rectY);
                    ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, radius);
                    ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, radius);
                    ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, radius);
                    ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, radius);
                    ctx.closePath();

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fill();
                    ctx.strokeStyle = 'black';
                    ctx.stroke();

                    ctx.fillStyle = 'black';
                    ctx.fillText(this.comment, midX, midY);

                    ctx.restore();
                }

                ctx.restore();
            }
            drawGradient(graph, ctx) {
                const color = this.color || '#000';
                const lineWidth = 10;
                const headSize = 20;

                const x0 = graph.X(this.x);
                const y0 = graph.Y(this.y);
                const x1 = graph.X(this.xf);
                const y1 = graph.Y(this.yf);

                const angle = Math.atan2(y1 - y0, x1 - x0);
                const headOffsetX = headSize * Math.cos(angle);
                const headOffsetY = headSize * Math.sin(angle);
                const shaftEndX = x1 - headOffsetX;
                const shaftEndY = y1 - headOffsetY;

                const xLength = shaftEndX - x0;
                const yLength = shaftEndY - y0;
                const isXInverted = Math.sign(xLength) !== Math.sign(Math.cos(angle));
                const isYInverted = Math.sign(yLength) !== Math.sign(Math.sin(angle));
                if (isXInverted || isYInverted) return;

                ctx.save();

                const gradient = ctx.createLinearGradient(x0, y0, shaftEndX, shaftEndY);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
                gradient.addColorStop(0.2, color);
                gradient.addColorStop(0.8, color);
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)');

                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(shaftEndX, shaftEndY);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = gradient;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle - Math.PI / 6),
                    y1 - headSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle + Math.PI / 6),
                    y1 - headSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();

                ctx.shadowColor = 'transparent';

                if (this.comment) {
                    const midX = (x0 + shaftEndX) / 2;
                    const midY = (y0 + shaftEndY) / 2;
                    const paddingX = 10;
                    const paddingY = 6;
                    const radius = 6;

                    ctx.save();
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const textWidth = ctx.measureText(this.comment).width;
                    const textHeight = 16;

                    const rectX = midX - textWidth / 2 - paddingX;
                    const rectY = midY - textHeight / 2 - paddingY;
                    const rectWidth = textWidth + paddingX * 2;
                    const rectHeight = textHeight + paddingY * 2;

                    ctx.beginPath();
                    ctx.moveTo(rectX + radius, rectY);
                    ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, radius);
                    ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, radius);
                    ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, radius);
                    ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, radius);
                    ctx.closePath();

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = 'black';
                    ctx.fillText(this.comment, midX, midY);
                    ctx.restore();
                }

                ctx.restore();
            }

            draw(graph, ctx) {

                if (this.arrowType && this.arrowType === 'fat') {
                    this.drawFatArrow(graph, ctx)
                } else {

                    const color = this.color || '#666';
                    const baseLineWidth = 16;
                    const tipLineWidth = 6;
                    const headSize = 20;

                    const x0 = graph.X(this.x);
                    const y0 = graph.Y(this.y);
                    const x1 = graph.X(this.xf);
                    const y1 = graph.Y(this.yf);

                    const angle = Math.atan2(y1 - y0, x1 - x0);
                    const headOffsetX = headSize * Math.cos(angle);
                    const headOffsetY = headSize * Math.sin(angle);
                    const shaftEndX = x1 - headOffsetX;
                    const shaftEndY = y1 - headOffsetY;

                    const dx = shaftEndX - x0;
                    const dy = shaftEndY - y0;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    if (length === 0) return;

                    const steps = 40;

                    ctx.save();

                    for (let i = 0; i < steps; i++) {
                        const t = i / steps;
                        const nextT = (i + 1) / steps;

                        const sx1 = x0 + dx * t + 3;
                        const sy1 = y0 + dy * t + 3;
                        const sx2 = x0 + dx * nextT + 3;
                        const sy2 = y0 + dy * nextT + 3;

                        const shadowWidth = (baseLineWidth + 6) * (1 - t) + (tipLineWidth + 2) * t;
                        const alpha = 0.25 * (1 - t);

                        ctx.beginPath();
                        ctx.moveTo(sx1, sy1);
                        ctx.lineTo(sx2, sy2);
                        ctx.lineWidth = shadowWidth;
                        ctx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(2)})`;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                    }

                    for (let i = 0; i < steps; i++) {
                        const t = i / steps;
                        const nextT = (i + 1) / steps;

                        const xStart = x0 + dx * t;
                        const yStart = y0 + dy * t;
                        const xEnd = x0 + dx * nextT;
                        const yEnd = y0 + dy * nextT;

                        const lineWidth = baseLineWidth * (1 - t) + tipLineWidth * t;

                        const shade = Math.round(200 - t * 80);
                        const strokeColor = `rgb(${shade}, ${shade}, ${shade})`;

                        ctx.beginPath();
                        ctx.moveTo(xStart, yStart);
                        ctx.lineTo(xEnd, yEnd);
                        ctx.lineWidth = lineWidth;
                        ctx.strokeStyle = strokeColor;
                        ctx.lineCap = 'round';
                        ctx.stroke();
                    }

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(
                        x1 - headSize * Math.cos(angle - Math.PI / 6),
                        y1 - headSize * Math.sin(angle - Math.PI / 6)
                    );
                    ctx.lineTo(
                        x1 - headSize * Math.cos(angle + Math.PI / 6),
                        y1 - headSize * Math.sin(angle + Math.PI / 6)
                    );
                    ctx.closePath();
                    ctx.fillStyle = color;
                    ctx.fill();

                    if (this.comment) {
                        const midX = (x0 + shaftEndX) / 2;
                        const midY = (y0 + shaftEndY) / 2;
                        const paddingX = 10;
                        const paddingY = 6;
                        const radius = 6;

                        ctx.save();
                        ctx.font = '16px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        const textWidth = ctx.measureText(this.comment).width;
                        const textHeight = 16;

                        const rectX = midX - textWidth / 2 - paddingX;
                        const rectY = midY - textHeight / 2 - paddingY;
                        const rectWidth = textWidth + paddingX * 2;
                        const rectHeight = textHeight + paddingY * 2;

                        ctx.beginPath();
                        ctx.moveTo(rectX + radius, rectY);
                        ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, radius);
                        ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, radius);
                        ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, radius);
                        ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, radius);
                        ctx.closePath();

                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = '#000000';
                        ctx.fillText(this.comment, midX, midY);
                        ctx.restore();
                    }

                    ctx.restore();
                }

            }

            drawFatArrow(graph, ctx) {
                const color = this.color || '#0044aa';
                const baseLineWidth = 20;
                const headSize = 28;

                const x0 = graph.X(this.x);
                const y0 = graph.Y(this.y);
                const x1 = graph.X(this.xf);
                const y1 = graph.Y(this.yf);

                const angle = Math.atan2(y1 - y0, x1 - x0);
                const dx = x1 - x0;
                const dy = y1 - y0;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const shaftLength = length - headSize;
                const shaftEndX = x0 + shaftLength * Math.cos(angle);
                const shaftEndY = y0 + shaftLength * Math.sin(angle);

                ctx.save();

                ctx.beginPath();
                ctx.moveTo(x0 + 4, y0 + 4);
                ctx.lineTo(shaftEndX + 4, shaftEndY + 4);
                ctx.lineWidth = baseLineWidth + 4;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(shaftEndX, shaftEndY);
                ctx.lineWidth = baseLineWidth;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle - Math.PI / 6),
                    y1 - headSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle + Math.PI / 6),
                    y1 - headSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();

                ctx.restore();
            }

            drawThinArrow(graph, ctx) {
                const color = this.color || '#cc0000';
                const lineWidth = 3;
                const headSize = 12;

                const x0 = graph.X(this.x);
                const y0 = graph.Y(this.y);
                const x1 = graph.X(this.xf);
                const y1 = graph.Y(this.yf);

                const angle = Math.atan2(y1 - y0, x1 - x0);
                const dx = x1 - x0;
                const dy = y1 - y0;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length === 0) return;

                const shaftLength = length - headSize;
                const shaftEndX = x0 + shaftLength * Math.cos(angle);
                const shaftEndY = y0 + shaftLength * Math.sin(angle);

                ctx.save();

                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(shaftEndX, shaftEndY);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = color;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle - Math.PI / 7),
                    y1 - headSize * Math.sin(angle - Math.PI / 7)
                );
                ctx.lineTo(
                    x1 - headSize * Math.cos(angle + Math.PI / 7),
                    y1 - headSize * Math.sin(angle + Math.PI / 7)
                );
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();

                if (this.comment) {
                    const midX = (x0 + shaftEndX) / 2;
                    const midY = (y0 + shaftEndY) / 2;
                    const paddingX = 6;
                    const paddingY = 4;
                    const radius = 4;

                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const textWidth = ctx.measureText(this.comment).width;
                    const textHeight = 14;

                    const rectX = midX - textWidth / 2 - paddingX;
                    const rectY = midY - textHeight / 2 - paddingY;
                    const rectWidth = textWidth + paddingX * 2;
                    const rectHeight = textHeight + paddingY * 2;

                    ctx.beginPath();
                    ctx.moveTo(rectX + radius, rectY);
                    ctx.arcTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + rectHeight, radius);
                    ctx.arcTo(rectX + rectWidth, rectY + rectHeight, rectX, rectY + rectHeight, radius);
                    ctx.arcTo(rectX, rectY + rectHeight, rectX, rectY, radius);
                    ctx.arcTo(rectX, rectY, rectX + rectWidth, rectY, radius);
                    ctx.closePath();

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#000';
                    ctx.fillText(this.comment, midX, midY);
                }

                ctx.restore();
            }

        }

        resolve(Arrow)
    })
}

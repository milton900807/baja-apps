function () {
    return new Promise(async (resolve, reject) => {

        class Line {
            name;
            x;
            y;
            xf;
            yf;
            color = 'black';
            type = 'line';
            w = 0;
            h = 0;
            comment = '';
            hl = false;
            arrowDirect = 'start';
            linewidth = 3;
            displayThreshold = 25;

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
                this.xf = x;
                this.yf = y;
                this.w = 0;
                this.h = 0;
            }

            setColor(color) {
                this.color = color;
            }

            move(x, y) {
                if (x == null || y == null) return;

                const dx = this.xf - this.x;
                const dy = this.yf - this.y;

                this.x = x;
                this.y = y;
                this.xf = x + dx;
                this.yf = y + dy;

                this.w = this.xf - this.x;
                this.h = this.yf - this.y;
            }

            update(x, y) {
                this.xf = x;
                this.yf = y;
                this.w = this.xf - this.x;
                this.h = this.yf - this.y;
            }

            invertX() {
                const tx = this.x;
                this.x = this.xf;
                this.xf = tx;
                this.w = this.xf - this.x;
                if (this.arrowDirect === 'start')
                    this.arrowDirect = 'end'
                else if (this.arrowDirect === 'end')
                    this.arrowDirect = 'start'
            }

            invertY() {
                const ty = this.y;
                this.y = this.yf;
                this.yf = ty;
                this.h = this.yf - this.y;
            }

            highlight(v) {
                this.hl = v;
            }

            isIn(x, y) {
                const minX = Math.min(this.x, this.xf);
                const maxX = Math.max(this.x, this.xf);
                const minY = Math.min(this.y, this.yf);
                const maxY = Math.max(this.y, this.yf);

                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    this.hl = true;
                    return true;
                }

                this.hl = false;
                return false;
            }

            angle(cx, cy, ex, ey) {
                return Math.atan2(ey - cy, ex - cx);
            }

            angle360(cx, cy, ex, ey) {
                let theta = this.angle(cx, cy, ex, ey);
                if (theta < 0) theta += 2 * Math.PI;
                return theta;
            }

            drawLine(ctx, xi, yi, xf, yf, color = 'black', lineSize = 2, lineCap = 'butt', shadow = null) {
                if (!ctx) return;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xi, yi);
                ctx.lineTo(xf, yf);

                ctx.strokeStyle = color;
                ctx.lineWidth = lineSize;
                ctx.lineCap = lineCap;

                if (shadow) {
                    ctx.shadowBlur = shadow.blur ?? 6;
                    ctx.shadowColor = shadow.color ?? 'rgba(0,0,0,0.35)';
                    ctx.shadowOffsetX = shadow.offsetX ?? 2;
                    ctx.shadowOffsetY = shadow.offsetY ?? 2;
                } else {
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }

                ctx.stroke();
                ctx.restore();
            }

            drawArrowhead(ctx, x, y, angle, width = 8, length = 12, color = 'black') {
                if (!ctx) return;

                ctx.save();
                ctx.translate(x, y);

                ctx.rotate(angle + Math.PI);

                ctx.fillStyle = color;

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-length, width / 2);
                ctx.lineTo(-length, -width / 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            drawComment(ctx, x, y, text, color = 'blue') {
                if (!ctx || !text) return;

                const offsetX = 20;
                const offsetY = -20;
                const tx = x + offsetX;
                const ty = y + offsetY;

                this.drawLine(ctx, x, y, tx, ty, 'gray', 1, 'butt');

                ctx.save();
                ctx.fillStyle = color;
                ctx.font = '14px sans-serif';
                ctx.fillText(text, tx + 4, ty - 4);
                ctx.restore();
            }

            draw(graph, options = {}) {
                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                const { useShadow = true } = options;

                const xi = graph.X(this.x);
                const yi = graph.Y(this.y);
                const xf = graph.X(this.xf);
                const yf = graph.Y(this.yf);

                const screenWidth = Math.abs(xf - xi);
                const screenHeight = Math.abs(yf - yi);

                if (
                    screenHeight < this.displayThreshold &&
                    screenWidth < this.displayThreshold
                ) {
                    return;
                }

                const strokeColor = this.hl ? 'red' : this.color;

                this.drawLine(
                    ctx,
                    xi,
                    yi,
                    xf,
                    yf,
                    strokeColor,
                    this.linewidth,
                    'round',
                    useShadow
                        ? {
                            blur: 6,
                            color: 'rgba(16,24,40,0.30)',
                            offsetX: 1,
                            offsetY: 2
                        }
                        : null
                );

                const forwardAngle = Math.atan2(yf - yi, xf - xi);

                const backwardAngle = Math.atan2(yi - yf, xi - xf);

                if (this.arrowDirect === 'start') {
                    this.drawArrowhead(ctx, xi, yi, forwardAngle, 11, 18, strokeColor);
                } else if (this.arrowDirect === 'end') {
                    this.drawArrowhead(ctx, xf, yf, backwardAngle, 11, 18, strokeColor);
                } else if (this.arrowDirect === 'both') {
                    this.drawArrowhead(ctx, xi, yi, forwardAngle, 11, 18, strokeColor);
                    this.drawArrowhead(ctx, xf, yf, backwardAngle, 11, 18, strokeColor);
                }

                if (this.comment) {
                    this.drawComment(ctx, xf, yf, this.comment);
                }
            }
        }

        resolve(Line)
    })
}

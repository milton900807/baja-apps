function () {
    return new Promise(async (resolve, reject) => {

        class Oval {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'gray';
            strokeColor = 'gray';
            highlightColor = 'red';
            commentColor = 'darkBlue';
            commentLineColor = 'lightBlue';
            type = 'oval';
            comment = '';
            hl = false;
            url = null;
            citation_link = null;
            lineWidth = 2;
            displayMinWidth = 4;
            displayMaxWidth = 400;
            shadow = {
                blur: 10,
                color: 'rgba(0,0,0,0.25)',
                offsetX: 2,
                offsetY: 2
            };

            constructor(name, x, y) {
                this.name = name;
                this.x = x;
                this.y = y;
            }

            setColor(color) {
                if (color != null) {
                    this.color = color;
                    this.strokeColor = color;
                }
            }

            setComment(comment) {
                this.comment = comment ?? '';
            }

            setShadow({ blur = 10, color = 'rgba(0,0,0,0.25)', offsetX = 2, offsetY = 2 } = {}) {
                this.shadow = { blur, color, offsetX, offsetY };
            }

            move(x, y) {
                if (x == null || y == null) {
                    return;
                }
                this.x = x;
                this.y = y;
            }

            update(x, y) {
                if (x == null || y == null) {
                    return;
                }

                this.w = x - this.x;
                this.h = this.y - y;
            }

            highlight(v) {
                this.hl = !!v;
            }

            isIn(x, y) {
                const minX = Math.min(this.x, this.x + this.w);
                const maxX = Math.max(this.x, this.x + this.w);
                const minY = Math.min(this.y, this.y - this.h);
                const maxY = Math.max(this.y, this.y - this.h);

                const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
                this.hl = inside;
                return inside;
            }

            getRenderColor() {
                return this.hl ? this.highlightColor : this.strokeColor;
            }

            applyShadow(ctx) {
                if (!ctx || !this.shadow) return;

                ctx.shadowBlur = this.shadow.blur ?? 10;
                ctx.shadowColor = this.shadow.color ?? 'rgba(0,0,0,0.25)';
                ctx.shadowOffsetX = this.shadow.offsetX ?? 2;
                ctx.shadowOffsetY = this.shadow.offsetY ?? 2;
            }

            clearShadow(ctx) {
                if (!ctx) return;
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            drawOvalShape(ctx, x, y, w, h, color, lineWidth = 2) {
                if (!ctx) return;

                const centerX = x + w / 2;
                const centerY = y + h / 2;
                const radiusX = Math.abs(w / 2);
                const radiusY = Math.abs(h / 2);

                ctx.save();
                this.applyShadow(ctx);

                ctx.beginPath();
                ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = color;
                ctx.stroke();

                ctx.restore();
            }

            drawCalloutLine(ctx, x1, y1, x2, y2, color = 'lightBlue', lineWidth = 2) {
                if (!ctx) return;

                ctx.save();
                this.clearShadow(ctx);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'butt';
                ctx.stroke();
                ctx.restore();
            }

            drawMultilineText(ctx, text, x, y, color = 'darkBlue', lineHeight = 16) {
                if (!ctx || !text) return;

                const lines = String(text).split('\n');

                ctx.save();
                this.clearShadow(ctx);
                ctx.fillStyle = color;
                ctx.font = '14px sans-serif';
                ctx.textBaseline = 'top';

                lines.forEach((line, index) => {
                    ctx.fillText(line, x, y + index * lineHeight);
                });

                ctx.restore();
            }

            drawComment(ctx, graph, screenX, screenY, screenW, screenH) {
                if (!ctx || !graph || !this.comment) return;

                const anchorX = screenX + screenW * 0.72;
                const anchorY = screenY + screenH * 0.35;

                const labelX = anchorX + 30;
                const labelY = anchorY - 10;

                this.drawCalloutLine(
                    ctx,
                    anchorX,
                    anchorY,
                    labelX,
                    labelY,
                    this.commentLineColor,
                    2
                );

                this.drawMultilineText(
                    ctx,
                    this.comment,
                    labelX + 4,
                    labelY - 2,
                    this.commentColor,
                    16
                );
            }

            draw(graph) {
                if (!graph || !graph.canvas) return;

                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                const screenX = graph.X(this.x);
                const screenYTop = graph.Y(this.y);
                const screenW = graph.screenWidth(this.w);
                const screenH = graph.screenHeight(this.h);

                const absScreenW = Math.abs(screenW);

                if (absScreenW < this.displayMinWidth || absScreenW > this.displayMaxWidth) {
                    return;
                }

                const renderColor = this.getRenderColor();

                this.drawOvalShape(
                    ctx,
                    screenX,
                    screenYTop,
                    screenW,
                    screenH,
                    renderColor,
                    this.lineWidth
                );

                if (this.comment) {
                    this.drawComment(ctx, graph, screenX, screenYTop, screenW, screenH);
                }
            }
        }
        resolve(Oval)
    })
}

function () {
    return new Promise(async (resolve, reject) => {

        class Oval {
            name;
            x;
            y;
            w = 1;
            h = 1;
            color = 'magenta';
            strokeColor = 'cyan';
            highlightColor = 'red';
            commentColor = 'darkBlue';
            commentLineColor = 'cyan';
            type = 'oval';
            comment = '';
            hl = false;
            url = null;
            citation_link = null;
            lineWidth = 5;
            displayMinWidth = 4;
            displayMaxWidth = 400;

            font = 'Arial';
            font_size = 18;
            minFontSize = 10;
            maxFontSize = 42;
            autoScaleText = true;

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

            setFont(font, size) {
                if (font != null) {
                    this.font = font;
                }
                if (size != null) {
                    this.font_size = size;
                }
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

            clamp(value, min, max) {
                return Math.max(min, Math.min(max, value));
            }

            getScaledFontSize(screenW, screenH) {
                if (!this.autoScaleText) {
                    return this.font_size;
                }

                const widthBased = Math.abs(screenW) * 0.10;
                const heightBased = Math.abs(screenH) * 0.18;
                const scaled = Math.min(widthBased, heightBased);

                return Math.round(
                    this.clamp(scaled, this.minFontSize, this.maxFontSize)
                );
            }

            formatTextToFitWidth(text, maxWidth, fontSize, fontName) {
                if (!text) return '';

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                context.font = `${fontSize}px ${fontName}`;

                const paragraphs = String(text).split('\n');
                let result = [];

                for (let paragraph of paragraphs) {
                    const words = paragraph.split(' ');
                    let currentLine = '';

                    for (let word of words) {
                        const testLine = currentLine + word + ' ';
                        const testWidth = context.measureText(testLine).width;

                        if (testWidth > maxWidth && currentLine !== '') {
                            result.push(currentLine.trimEnd());
                            currentLine = word + ' ';
                        } else {
                            currentLine = testLine;
                        }
                    }

                    if (currentLine.trim().length > 0) {
                        result.push(currentLine.trimEnd());
                    }

                    if (paragraph === '' || words.length === 0) {
                        result.push('');
                    }
                }

                return result.join('\n');
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

            drawMultilineText(ctx, text, x, y, color = 'darkBlue', fontSize = 18, fontName = 'Arial', lineHeight = null) {
                if (!ctx || !text) return;

                const lines = String(text).split('\n');
                const resolvedLineHeight = lineHeight ?? Math.max(fontSize + 2, 14);

                ctx.save();
                this.clearShadow(ctx);
                ctx.fillStyle = color;
                ctx.font = `${fontSize}px ${fontName}`;
                ctx.textBaseline = 'top';

                lines.forEach((line, index) => {
                    ctx.fillText(line, x, y + index * resolvedLineHeight);
                });

                ctx.restore();
            }

            getEllipseBoundaryPoint(centerX, centerY, radiusX, radiusY, targetX, targetY) {
                const dx = targetX - centerX;
                const dy = targetY - centerY;

                if (dx === 0 && dy === 0) {
                    return { x: centerX + radiusX, y: centerY };
                }

                const t = 1 / Math.sqrt(
                    (dx * dx) / (radiusX * radiusX) +
                    (dy * dy) / (radiusY * radiusY)
                );

                return {
                    x: centerX + dx * t,
                    y: centerY + dy * t
                };
            }

            drawComment(ctx, graph, screenX, screenY, screenW, screenH) {
                if (!ctx || !graph || !this.comment) return;

                const centerX = screenX + screenW / 2;
                const centerY = screenY + screenH / 2;
                const radiusX = Math.abs(screenW / 2);
                const radiusY = Math.abs(screenH / 2);

                const fontSize = this.getScaledFontSize(screenW, screenH);
                const lineHeight = Math.max(fontSize + 2, 14);

                const labelX = screenX + screenW + 34;
                const labelY = screenY + screenH * 0.20;

                const maxTextWidth = Math.max(80, Math.abs(screenW) * 1.4);
                const fittedText = this.formatTextToFitWidth(
                    this.comment,
                    maxTextWidth,
                    fontSize,
                    this.font
                );

                const anchor = this.getEllipseBoundaryPoint(
                    centerX,
                    centerY,
                    radiusX,
                    radiusY,
                    labelX,
                    labelY
                );

                this.drawCalloutLine(
                    ctx,
                    anchor.x,
                    anchor.y,
                    labelX,
                    labelY,
                    this.commentLineColor,
                    5
                );

                this.drawMultilineText(
                    ctx,
                    fittedText,
                    labelX + 4,
                    labelY - 2,
                    this.commentColor,
                    fontSize,
                    this.font,
                    lineHeight
                );
            }

            draw(graph) {
                if (!graph || !graph.canvas) return;

                const ctx = graph.canvas.getCTX();
                if (!ctx) return;

                let screenX = graph.X(this.x);
                let screenYTop = graph.Y(this.y);
                let screenW = graph.screenWidth(this.w);
                let screenH = graph.screenHeight(this.h);

                if (screenW < 0) {
                    screenX += screenW;
                    screenW = Math.abs(screenW);
                }

                if (screenH < 0) {
                    screenYTop += screenH;
                    screenH = Math.abs(screenH);
                }

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

        resolve(Oval);
    })
}

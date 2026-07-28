function () {
    return new Promise(async (resolve, reject) => {
        let RectangleText = class RectangleText {
            name;
            x;
            y;
            w = 1;
            h = 1;

            color = 'black';
            rectColor = 'lightGreen';
            highlightColor = 'red';

            comment = '';
            type = 'RectangleText';

            font = 'Arial';

            font_size = 18;
            minFontSize = 10;
            maxFontSize = 48;
            autoScaleText = true;

            showRect = true;
            hl = false;

            lineWidth = 2;
            displayMinWidth = 10;
            displayMinHeight = 10;

            shadow = {
                blur: 4,
                color: 'rgba(0,0,0,0.20)',
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
                }
            }

            setRectColor(color) {
                if (color != null) {
                    this.rectColor = color;
                }
            }

            setFont(font, size) {
                if (font != null) {
                    this.font = font;
                }
                if (size != null) {
                    this.font_size = size;
                }
            }

            setText(text) {
                this.comment = text ?? '';
            }

            highlight(v) {
                this.hl = !!v;
            }

            move(x, y) {
                if (x == null || y == null) return;
                this.x = x;
                this.y = y;
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

            update(x, y) {
                if (x == null || y == null) return;

                this.w = x - this.x;
                this.h = this.y - y;
            }

            clamp(value, min, max) {
                return Math.max(min, Math.min(max, value));
            }

            getScaledFontSize(screenW, screenH) {
                if (!this.autoScaleText) {
                    return this.font_size;
                }

                const widthBased = screenW * 0.12;
                const heightBased = screenH * 0.22;

                const scaled = Math.min(widthBased, heightBased);

                return Math.round(
                    this.clamp(scaled, this.minFontSize, this.maxFontSize)
                );
            }

            formatTextToFitRectangle(text, rectangleWidth, fontSize, fontName) {
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

                        if (testWidth > rectangleWidth && currentLine !== '') {
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

            fitTextToBox(text, width, height, fontName, startingFontSize) {
                let fontSize = startingFontSize;
                let fittedText = '';
                const minSize = this.minFontSize;
                const maxTextHeightFactor = 0.9;

                while (fontSize >= minSize) {
                    fittedText = this.formatTextToFitRectangle(text, width, fontSize, fontName);
                    const lines = fittedText.split('\n');
                    const lineHeight = Math.max(fontSize + 2, 14);
                    const totalTextHeight = lines.length * lineHeight;

                    if (totalTextHeight <= height * maxTextHeightFactor) {
                        return {
                            text: fittedText,
                            fontSize: fontSize
                        };
                    }

                    fontSize -= 1;
                }

                return {
                    text: this.formatTextToFitRectangle(text, width, minSize, fontName),
                    fontSize: minSize
                };
            }

            applyShadow(ctx) {
                if (!ctx) return;
                ctx.shadowBlur = this.shadow.blur ?? 4;
                ctx.shadowColor = this.shadow.color ?? 'rgba(0,0,0,0.20)';
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

            drawRectShape(ctx, x, y, w, h, color, lineWidth = 2) {
                if (!ctx) return;

                ctx.save();
                this.applyShadow(ctx);

                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = color;
                ctx.stroke();

                ctx.restore();
            }

            drawMultilineText(ctx, text, x, y, width, height, color, fontSize, fontName) {
                if (!ctx || !text) return;

                const lines = String(text).split('\n');
                const lineHeight = Math.max(fontSize + 2, 14);
                const totalTextHeight = lines.length * lineHeight;

                const centerX = x + width / 2;
                const startY = y + (height - totalTextHeight) / 2;

                ctx.save();
                this.clearShadow(ctx);

                ctx.fillStyle = color;
                ctx.font = `${fontSize}px ${fontName}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                lines.forEach((line, i) => {
                    ctx.fillText(
                        line,
                        centerX,
                        startY + i * lineHeight
                    );
                });

                ctx.restore();
            }

            draw(graph, ctx) {
                if (!graph) return;

                const drawCtx = ctx || graph.canvas?.getCTX();
                if (!drawCtx) return;

                let screenX = graph.X(this.x);
                let screenY = graph.Y(this.y);
                let screenW = graph.screenWidth(this.w);
                let screenH = graph.screenHeight(this.h);

                if (screenW < 0) {
                    screenX += screenW;
                    screenW = Math.abs(screenW);
                }

                if (screenH < 0) {
                    screenY += screenH;
                    screenH = Math.abs(screenH);
                }

                if (
                    screenW < this.displayMinWidth ||
                    screenH < this.displayMinHeight
                ) {
                    return;
                }

                const borderColor = this.hl ? this.highlightColor : this.rectColor;

                if (this.showRect) {
                    this.drawRectShape(
                        drawCtx,
                        screenX,
                        screenY,
                        screenW,
                        screenH,
                        borderColor,
                        this.hl ? this.lineWidth + 1 : this.lineWidth
                    );
                }

                if (this.comment) {
                    const padding = 8;
                    const textBoxWidth = Math.max(10, screenW - padding * 2);
                    const textBoxHeight = Math.max(10, screenH - padding * 2);

                    const startingFontSize = this.getScaledFontSize(screenW, screenH);

                    const fit = this.fitTextToBox(
                        this.comment,
                        textBoxWidth,
                        textBoxHeight,
                        this.font,
                        startingFontSize
                    );

                    this.drawMultilineText(
                        drawCtx,
                        fit.text,
                        screenX + padding,
                        screenY + padding,
                        textBoxWidth,
                        textBoxHeight,
                        this.color,
                        fit.fontSize,
                        this.font
                    );
                }
            }
        }

        resolve(RectangleText);
    })
}
